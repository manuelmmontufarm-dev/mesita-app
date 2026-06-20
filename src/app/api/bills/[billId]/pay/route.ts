import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { isDemoRestaurant, isDemoTableToken } from "@/lib/demo-restaurant";
import {
  buildProviderConfig,
  processPayment,
  BillAlreadyClosedError,
  BillUnavailableError,
  IdempotencyConflictError,
  InvoiceDataRequiredError,
} from "@/modules/payments";
import { isDemoPaymentToken } from "@/modules/payments/adapters/demo/client";
import type { ProviderConfig } from "@/modules/payments";
import type { SplitMode } from "@/modules/payments";
import { BillStatus } from "@prisma/client";
import { z } from "zod";
import { calculateRemainingBalance, sumNetPayments } from "@/modules/bills";
import { money, computeFallbackTotal, toNumberSafe } from "@/lib/money";
import { v4 as uuidv4 } from "uuid";
import { PrismaBillRepository } from "@/modules/bills/adapters/prisma/bill.repository";
import { PrismaPaymentRepository } from "@/modules/payments/adapters/prisma/payment.repository";

const paymentSchema = z.object({
  amount: z.number().min(0.01),
  kushkiToken: z.string().min(1).optional(),
  paymentToken: z.string().min(1).optional(),
  tableToken: z.string().min(1),
  idempotencyKey: z.string().uuid().optional(),
  splitMode: z.enum(["FULL", "EQUAL", "BY_ITEM"]).optional(),
  selectedItemIds: z.array(z.string().min(1)).optional(),
  equalSplitPeople: z.number().int().min(2).optional(),
  guestSessionId: z.string().uuid().optional(),
  voluntaryTipAmount: z.number().min(0).optional(),
  checkoutMode: z
    .enum(["CONSUMIDOR_FINAL", "FACTURA_CON_DATOS"])
    .optional()
    .default("CONSUMIDOR_FINAL"),
  guestData: z
    .object({
      identificacion: z.string().optional(),
      email: z.string().email(),
      nombre: z.string().optional(),
    })
    .optional(),
});

/** Domain error name → HTTP status. Used as a one-time fallback when `instanceof`
 *  fails across module boundaries / hot-reload (each error sets a stable `name`). */
const DOMAIN_ERROR_STATUS: Record<string, number> = {
  BillUnavailableError: 409,
  BillAlreadyClosedError: 409,
  IdempotencyConflictError: 409,
  InvoiceDataRequiredError: 422,
};

function calculateSelectedItemsTotal(
  items: Array<{ id: string; price: unknown; quantity: number; isPaid: boolean }>,
  selectedItemIds: string[] | undefined
): { total: number; error?: string } {
  const ids = selectedItemIds ?? [];
  if (ids.length === 0) return { total: 0, error: "Select at least one item" };

  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) return { total: 0, error: "Duplicate item selected" };

  const selected: Array<{ price: number; quantity: number }> = [];
  for (const id of uniqueIds) {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return { total: 0, error: "Selected item not found" };
    if (item.isPaid) return { total: 0, error: "Selected item is already paid" };
    selected.push({ price: Number(item.price), quantity: item.quantity });
  }

  return { total: computeFallbackTotal(selected) };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ billId: string }> }
): Promise<Response> {
  const { billId } = await context.params;

  try {
    const body = await request.json();
    const validatedData = paymentSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    const raw = validatedData.data;
    const chargeToken = raw.kushkiToken ?? raw.paymentToken;
    if (!chargeToken) {
      return errorResponse("Missing payment token", 400);
    }

    const {
      amount,
      tableToken,
      idempotencyKey: clientKey,
      splitMode = "FULL",
      guestData,
      checkoutMode = "CONSUMIDOR_FINAL",
      voluntaryTipAmount = 0,
      equalSplitPeople: requestedSplitPeople,
      guestSessionId,
    } = raw;
    const kushkiToken = chargeToken;
    const effectiveSplitMode: SplitMode = splitMode;

    // BLK-01: Validate via table token — no staff session required
    const table = await prisma.table.findUnique({
      where: { token: tableToken },
    });
    if (!table) {
      return errorResponse("Invalid table token", 403);
    }
    const restaurantId = table.restaurantId;

    // Fetch bill with items + COMPLETED payments (needed to reconcile against posTotal),
    // scoped to this table and restaurant
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: {
        items: true,
        restaurant: true,
        payments: { where: { status: "COMPLETED" } },
      },
    });

    if (!bill || bill.tableId !== table.id || bill.restaurantId !== restaurantId) {
      return errorResponse("Bill not found", 404);
    }

    const isDemo =
      isDemoTableToken(tableToken) || isDemoRestaurant(bill.restaurantId);
    const isDemoPayment = isDemo || isDemoPaymentToken(kushkiToken);

    if (!isDemoPayment && !bill.restaurant.paymentsEnabled) {
      return errorResponse("Payments not enabled for this restaurant", 503);
    }

    let providerConfig: ProviderConfig;
    if (isDemoPayment) {
      providerConfig = {
        kushkiPrivateKey: "demo",
        kushkiPublicKey: "demo",
        kushkiEnvironment: "SANDBOX",
      };
    } else {
      providerConfig = buildProviderConfig(bill.restaurant);
    }

    const FINAL_STATES: BillStatus[] = ["FULLY_PAID", "REFUNDED"];
    if (FINAL_STATES.includes(bill.status)) {
      return errorResponse("Cannot modify bill in final state", 400);
    }

    const effectiveSplitPeople = bill.equalSplitPeople ?? requestedSplitPeople ?? 1;

    if (effectiveSplitMode === "EQUAL" && effectiveSplitPeople < 2) {
      return errorResponse("Invalid split people count", 400);
    }

    // POS is the source of truth for amounts (D-07): when posTotal exists, every
    // share is derived from it so the recorded payments sum EXACTLY to the POS
    // document total (Contífico only flips PRE→FAC on an exact cobro match).
    const posTotal = bill.posTotal == null ? null : toNumberSafe(bill.posTotal);

    let remainingBalance: number;
    if (effectiveSplitMode === "BY_ITEM") {
      const selected = calculateSelectedItemsTotal(
        bill.items,
        validatedData.data.selectedItemIds
      );
      if (selected.error) return errorResponse(selected.error, 400);
      remainingBalance = selected.total;

      // Closing BY_ITEM share: reconcile against posTotal so cobros sum exactly.
      if (posTotal !== null) {
        const ids = new Set(validatedData.data.selectedItemIds ?? []);
        const closesBill = bill.items.every((i) => i.isPaid || ids.has(i.id));
        if (closesBill) {
          remainingBalance = money(posTotal - sumNetPayments(bill.payments));
        }
      }
    } else {
      remainingBalance = calculateRemainingBalance(bill, effectiveSplitMode, effectiveSplitPeople);
    }

    const expectedAmount = money(remainingBalance + voluntaryTipAmount);

    // ±$0.01 client validation kept for a clear UX error, but the SERVER-computed
    // expectedAmount is what gets charged — never the client-supplied amount.
    //
    // EQUAL closing share: the client legitimately sends the naive per-share
    // (total / n), while the server expects the exact remainder
    // (posTotal − prior net payments). Rounding drift between the two can exceed
    // ±$0.01 (e.g. $50.02 ÷ 4 → client 12.51 vs remainder 12.49), so the client
    // amount is accepted when it matches EITHER figure. Safe because the charge
    // is always `expectedAmount`.
    const TOLERANCE = 0.01;
    const EPSILON = 1e-9; // absorb binary-float artifacts in the comparison
    const acceptableAmounts = [expectedAmount];
    if (effectiveSplitMode === "EQUAL") {
      const authoritativeTotal = posTotal ?? computeFallbackTotal(bill.items);
      acceptableAmounts.push(
        money(money(authoritativeTotal / effectiveSplitPeople) + voluntaryTipAmount)
      );
    }
    const isAcceptedAmount = acceptableAmounts.some(
      (target) => Math.abs(amount - target) <= TOLERANCE + EPSILON
    );
    if (!isAcceptedAmount) {
      return errorResponse(
        amount < expectedAmount
          ? "Amount is less than selected balance"
          : "Amount exceeds selected balance",
        400
      );
    }

    // HIGH-02 + HIGH-10: Client-supplied idempotency key — idempotent replay per key
    const idempotencyKey = clientKey ?? uuidv4();

    // Carry POS config into processPayment so the freshness pre-check and Option B partial
    // cobros activate when the restaurant is in POS invoice mode (Gap #3 + Gap #1 + Gap #2).
    const posRestaurant =
      bill.restaurant.invoiceMode === "POS"
        ? {
            invoiceMode: bill.restaurant.invoiceMode,
            posProvider: bill.restaurant.posProvider,
            posApiKeyEnc: bill.restaurant.posApiKeyEnc,
            posEnvironment: bill.restaurant.posEnvironment,
            posTableField: bill.restaurant.posTableField,
            posPaymentMethod: bill.restaurant.posPaymentMethod,
          }
        : undefined;

    const billRepo = new PrismaBillRepository();
    const paymentRepo = new PrismaPaymentRepository();

    let paymentResult;
    try {
      paymentResult = await processPayment(
        {
          billId,
          restaurantId,
          amount: expectedAmount,
          voluntaryTipAmount,
          kushkiToken,
          splitMode: effectiveSplitMode,
          selectedItemIds: validatedData.data.selectedItemIds,
          equalSplitPeople: requestedSplitPeople,
          guestSessionId,
          providerConfig,
          posRestaurant,
          checkoutMode,
          guestData,
          idempotencyKey,
        },
        { bill: billRepo, payment: paymentRepo }
      );
    } catch (error) {
      // Map domain errors → HTTP. `instanceof` first; fall back to `error.name` once
      // (instanceof is brittle across module boundaries / hot-reload).
      const domainStatus =
        error instanceof BillUnavailableError ||
        error instanceof BillAlreadyClosedError ||
        error instanceof IdempotencyConflictError
          ? 409
          : error instanceof InvoiceDataRequiredError
            ? 422
            : error instanceof Error
              ? DOMAIN_ERROR_STATUS[error.name]
              : undefined;
      if (domainStatus) {
        return errorResponse((error as Error).message, domainStatus);
      }
      const msg = error instanceof Error ? error.message : "Failed to process payment";
      const status = msg.startsWith("Payment declined:") ? 402 : 500;
      return errorResponse(msg, status);
    }

    if (paymentResult.alreadyProcessed) {
      return successResponse(
        {
          billId: bill.id,
          status: bill.status,
          paymentId: paymentResult.paymentId,
          message: "Payment already processed",
        },
        200
      );
    }

    return successResponse(
      {
        billId,
        status: paymentResult.billStatus,
        paymentId: paymentResult.paymentId,
        // Additive: the amount actually charged (server-computed). The client
        // may have sent a slightly different naive figure — the confirmation
        // screen must show THIS value.
        amountCharged: expectedAmount,
        message: "Tu factura será emitida por el restaurante",
      },
      200
    );
  } catch (error) {
    console.error("Payment handler error:", error);
    return errorResponse("Internal server error", 500);
  }
}
