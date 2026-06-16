import { chargeCard, refundPayment } from "../adapters/kushki/client";
import type { ProviderConfig } from "../domain/payment.port";
import { buildPosConfig } from "@/modules/pos/adapters/pos-config";
import { ContificoAdapter } from "@/modules/pos/adapters/contifico.adapter";
import type { POSGuestData } from "@/modules/pos/domain/pos.port";
import type { BillStatus, SplitMode } from "../domain/payment.repository";
import type { BillRepository } from "@/modules/bills/domain/bill.repository";
import type { PaymentRepository } from "../domain/payment.repository";
import { v4 as uuidv4 } from "uuid";
import { redact, hashForLog } from "@/lib/log";
import { computeFallbackTotal } from "@/lib/money";
import {
  BillAlreadyClosedError,
  BillUnavailableError,
  IdempotencyConflictError,
  InvoiceDataRequiredError,
} from "./errors";

export {
  BillAlreadyClosedError,
  BillUnavailableError,
  IdempotencyConflictError,
  InvoiceDataRequiredError,
};

export interface PosRestaurantConfig {
  invoiceMode: string;
  posProvider: string | null;
  posApiKeyEnc: string | null;
  posEnvironment: string;
  posTableField: string | null;
  posPaymentMethod?: string | null;
}

export interface ProcessPaymentParams {
  billId: string;
  restaurantId: string;
  amount: number;
  voluntaryTipAmount: number;
  kushkiToken: string;
  splitMode: SplitMode;
  selectedItemIds?: string[];
  equalSplitPeople?: number;
  providerConfig: ProviderConfig;
  posRestaurant?: PosRestaurantConfig;  // present when invoiceMode === "POS"
  checkoutMode: "CONSUMIDOR_FINAL" | "FACTURA_CON_DATOS";
  guestData?: {
    email: string;
    identificacion?: string;
    nombre?: string;
  };
  guestSessionId?: string;
  idempotencyKey: string;
}

export interface ProcessPaymentResult {
  paymentId: string;
  billStatus: BillStatus;
  alreadyProcessed: boolean;
}

/** Detect Contífico `tipo_identificacion` from the raw identification string. */
function detectTipo(
  identificacion: string | undefined
): "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL" {
  if (!identificacion) return "CONSUMIDOR_FINAL";
  if (/^\d{10}$/.test(identificacion)) return "CEDULA";
  if (/^\d{13}$/.test(identificacion)) return "RUC";
  return "PASAPORTE";
}

export async function processPayment(
  params: ProcessPaymentParams,
  repos: { bill: BillRepository; payment: PaymentRepository }
): Promise<ProcessPaymentResult> {
  const {
    billId,
    restaurantId,
    amount,
    voluntaryTipAmount,
    kushkiToken,
    splitMode,
    selectedItemIds,
    equalSplitPeople: requestedSplitPeople,
    providerConfig,
    posRestaurant,
    guestData: rawGuestData,
    guestSessionId,
    idempotencyKey,
  } = params;

  const normalizedGuest: POSGuestData = {
    tipo: detectTipo(rawGuestData?.identificacion),
    identificacion: rawGuestData?.identificacion ?? "",
    email: rawGuestData?.email ?? "",
    nombre: rawGuestData?.nombre,
  };
  const hasUsableGuestData =
    normalizedGuest.tipo !== "CONSUMIDOR_FINAL" &&
    !!normalizedGuest.identificacion &&
    !!normalizedGuest.email;

  const existingPayment = await repos.payment.findByIdempotencyKey(idempotencyKey);

  if (existingPayment) {
    // Idempotency keys are scoped to a bill: replaying a key against a DIFFERENT
    // bill must never silently return the other bill's payment (B3).
    if (existingPayment.billId !== billId) {
      throw new IdempotencyConflictError();
    }
    return {
      paymentId: existingPayment.id,
      billStatus: "UNPAID" as BillStatus,
      alreadyProcessed: true,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Gap #3: freshness pre-check + SRI $50 guard, BEFORE the Kushki charge.
  // ────────────────────────────────────────────────────────────────────────────
  const billSnapshot = await repos.bill.findSnapshot(billId);

  if (billSnapshot && posRestaurant?.invoiceMode === "POS" && billSnapshot.posDocumentId) {
    // Fail-open on any transport error from getOrderStatus — we'd rather charge than block legitimate guests.
    let adapterForCheck: ContificoAdapter | null = null;
    try {
      const posConfig = buildPosConfig(posRestaurant);
      adapterForCheck = new ContificoAdapter(posConfig);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "POS_PRECHECK_CONFIG_ERROR",
          severity: "HIGH",
          billId,
          restaurantId,
          error: err instanceof Error ? err.message : String(err),
          ts: new Date().toISOString(),
        })
      );
    }

    if (adapterForCheck?.getOrderStatus) {
      try {
        const status = await adapterForCheck.getOrderStatus(billSnapshot.posDocumentId);
        if (!status.exists) {
          throw new BillUnavailableError();
        }
        // Closed in POS is only an error if WE haven't already accepted a payment for this bill.
        const hasOurPreviousPayment = billSnapshot.payments.length > 0;
        if (status.isClosedInPos && !hasOurPreviousPayment) {
          throw new BillAlreadyClosedError();
        }
      } catch (err) {
        if (
          err instanceof BillAlreadyClosedError ||
          err instanceof BillUnavailableError
        ) {
          throw err;
        }
        console.error(
          JSON.stringify({
            event: "POS_PRECHECK_FAILED_FAIL_OPEN",
            severity: "HIGH",
            billId,
            restaurantId,
            posDocumentId: billSnapshot.posDocumentId,
            error: err instanceof Error ? err.message : String(err),
            ts: new Date().toISOString(),
          })
        );
      }
    }
  }

  // SRI $50 guard — only when this split would close the bill and no recipient exists yet.
  if (billSnapshot) {
    // POS total is authoritative when present (D-07); item-derived math is fallback only.
    const billTotal = billSnapshot.posTotal ?? computeFallbackTotal(billSnapshot.items);
    const wouldBeFullyPaidAfterThisSplit = wouldThisSplitCloseTheBill(
      billSnapshot,
      splitMode,
      selectedItemIds,
      requestedSplitPeople
    );
    const recipientAlreadyExists = billSnapshot.invoiceRecipientPaymentId !== null;

    if (
      billTotal > 50 &&
      wouldBeFullyPaidAfterThisSplit &&
      !recipientAlreadyExists &&
      !hasUsableGuestData
    ) {
      throw new InvoiceDataRequiredError();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Kushki charge
  // ────────────────────────────────────────────────────────────────────────────
  let kushkiResponse;
  try {
    kushkiResponse = await chargeCard(
      { kushkiToken, amount: Math.round(amount * 100) / 100, voluntaryTip: voluntaryTipAmount },
      providerConfig
    );
  } catch (error) {
    throw error instanceof Error ? error : new Error("Payment processing failed");
  }

  if (!kushkiResponse.approved) {
    throw new Error(`Payment declined: ${kushkiResponse.errorText ?? "Unknown error"}`);
  }

  const paymentId = uuidv4();

  let thisPaymentIsRecipient = false;

  try {
    const result = await repos.payment.recordPaymentAtomically({
      paymentId,
      billId,
      restaurantId,
      amount,
      voluntaryTip: voluntaryTipAmount,
      kushkiTransactionId: kushkiResponse.ticketNumber ?? "",
      idempotencyKey,
      splitMode,
      selectedItemIds,
      requestedSplitPeople,
      guestSessionId,
      guestIdentificacion: rawGuestData?.identificacion ?? null,
      guestEmail: rawGuestData?.email ?? null,
      guestNombre: rawGuestData?.nombre ?? null,
      guestTipo: normalizedGuest.tipo,
      hasUsableGuestData,
    });
    thisPaymentIsRecipient = result.thisPaymentIsRecipient;

    // ────────────────────────────────────────────────────────────────────────────
    // POS confirmation: Option B — record a PARTIAL cobro per split (D-08, D-10).
    // Never throws / never voids Kushki — failures log POS_COBRO_FAILED and continue.
    // ────────────────────────────────────────────────────────────────────────────
    if (posRestaurant?.invoiceMode === "POS") {
      try {
        const posIds = await repos.bill.findPosInfo(billId);
        if (posIds) {
          const { posDocumentId, posToken } = posIds;
          const posConfig = buildPosConfig(posRestaurant);
          const adapter = new ContificoAdapter(posConfig);

          // Only send guestData when THIS Payment is the recipient — avoid re-PUTing cliente
          // on a document that already has its recipient set on a prior cobro.
          const guestDataForCobro: POSGuestData | undefined =
            thisPaymentIsRecipient && hasUsableGuestData ? normalizedGuest : undefined;

          const cobro = await adapter.confirmPayment({
            posDocumentId,
            posToken,
            amount, // PARTIAL amount of THIS split, NOT bill.total (Option B)
            paymentReference: paymentId,
            guestData: guestDataForCobro,
          });
          if (!cobro.success) {
            console.error(
              JSON.stringify(
                redact({
                  event: "POS_COBRO_FAILED",
                  severity: "CRITICAL",
                  billId: hashForLog(billId),
                  restaurantId: hashForLog(restaurantId),
                  posDocumentId: hashForLog(posDocumentId),
                  paymentId,
                  amount,
                  errorMessage: cobro.errorMessage,
                  ts: new Date().toISOString(),
                })
              )
            );
          }
        }
      } catch (err) {
        // Never void the successful Kushki charge on POS failure (D-10)
        console.error(
          JSON.stringify(
            redact({
              event: "POS_COBRO_FAILED",
              severity: "CRITICAL",
              billId: hashForLog(billId),
              restaurantId: hashForLog(restaurantId),
              paymentId,
              amount,
              error: err instanceof Error ? err.message : String(err),
              ts: new Date().toISOString(),
            })
          )
        );
      }
    }

    return {
      paymentId,
      billStatus: result.billStatus,
      alreadyProcessed: false,
    };
  } catch (error) {
    console.error("Transaction error — attempting Kushki void:", error);
    try {
      await refundPayment(
        { ticketNumber: kushkiResponse.ticketNumber ?? "", amount },
        providerConfig
      );
    } catch (voidError) {
      console.error(
        JSON.stringify(
          redact({
            event: "PAYMENT_COMPENSATION_FAILED",
            severity: "CRITICAL",
            billId: hashForLog(billId),
            restaurantId: hashForLog(restaurantId),
            ticketNumber: hashForLog(kushkiResponse.ticketNumber ?? ""),
            amount,
            dbError: error instanceof Error ? error.message : String(error),
            refundError: voidError instanceof Error ? voidError.message : String(voidError),
            ts: new Date().toISOString(),
          })
        )
      );
    }
    throw error;
  }
}

/**
 * Replicates the in-transaction FULLY_PAID logic but read-only,
 * so the SRI $50 guard can predict whether THIS split will close the bill.
 */
function wouldThisSplitCloseTheBill(
  bill: {
    items: { id: string; isPaid: boolean }[];
    equalSplitPeople: number | null;
    equalSharesPaid: number;
  },
  splitMode: SplitMode,
  selectedItemIds: string[] | undefined,
  requestedSplitPeople: number | undefined
): boolean {
  if (splitMode === "EQUAL") {
    const totalPeople = bill.equalSplitPeople ?? requestedSplitPeople ?? 1;
    return bill.equalSharesPaid + 1 >= totalPeople;
  }

  if (splitMode === "BY_ITEM") {
    const ids = new Set(selectedItemIds ?? []);
    return bill.items.every((i) => i.isPaid || ids.has(i.id));
  }

  // FULL pays every unpaid item.
  return true;
}
