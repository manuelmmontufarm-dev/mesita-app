import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { calculateBillBreakdown } from "@/modules/bills";
import { money, toNumberSafe } from "@/lib/money";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * PUBLIC GUEST ENDPOINT - No authentication required
 * Fetches the active bill for a table using only the table token
 * Used by the guest-facing /pay/[token] page
 */

// Stable machine-readable marker: the token does not map to any table
// (deleted table / stale QR). The pay page shows a friendly "QR no activo"
// state when it sees this exact error string. (Not exported — Next.js route
// files only allow handler exports.)
const TABLE_NOT_FOUND = "TABLE_NOT_FOUND";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  try {
    // Find table by token - no auth required (guest endpoint per D-07, GUEST-01, GUEST-03)
    const table = await prisma.table.findUnique({
      where: { token },
      include: {
        restaurant: true,
        bills: {
          // Only fetch non-refunded bills, most recent first
          where: { status: { not: "REFUNDED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            items: true,
            payments: {
              where: { status: "COMPLETED" },
              orderBy: { createdAt: "asc" },
              select: {
                amount: true,
                voluntaryTip: true,
                createdAt: true,
                splitMode: true,
              },
            },
          },
        },
      },
    });

    // Handle three cases per D-13
    if (!table) {
      // Invalid / expired QR token — distinct from "table exists but no bill"
      return errorResponse(TABLE_NOT_FOUND, 404);
    }

    if (!table.bills || table.bills.length === 0) {
      return errorResponse("No hay cuenta abierta para esta mesa", 404);
    }

    // Table found with active bill
    const bill = table.bills[0];

    // POS is the source of truth for amounts (D-07): when the bill carries
    // POS-authoritative totals, mirror the four pos* columns verbatim — never
    // recompute from items. Item-derived math remains the fallback for bills
    // without POS totals (non-POS restaurants / manually created bills).
    const breakdown =
      bill.posTotal != null
        ? {
            subtotal: bill.posSubtotal ?? new Decimal(0),
            propina: bill.posPropina ?? new Decimal(0),
            iva: bill.posIva ?? new Decimal(0),
            total: bill.posTotal,
          }
        : calculateBillBreakdown(bill.items);

    // Completed payments so far (additive — display-only data for the guest).
    // Payment.amount includes the voluntary tip, so the consumed share of the
    // bill total is amount - voluntaryTip.
    const payments = bill.payments.map((p) => ({
      amount: Number(p.amount),
      voluntaryTip: p.voluntaryTip != null ? Number(p.voluntaryTip) : null,
      createdAt: p.createdAt,
      splitMode: p.splitMode,
    }));
    const paidTowardsBill = payments.reduce(
      (sum, p) => sum + (p.amount - (p.voluntaryTip ?? 0)),
      0
    );
    const authoritativeTotal =
      bill.posTotal != null ? toNumberSafe(bill.posTotal) : Number(breakdown.total);
    const remainingBalance = Math.max(0, money(authoritativeTotal - paidTowardsBill));

    // Shape response: omit restaurantId from bill and token from table.
    // Also drop the raw payments relation from the bill object — the trimmed
    // `payments` array below is the public shape.
    const {
      restaurantId: _rid,
      payments: _rawPayments,
      ...billWithoutRestaurantId
    } = bill as any;

    return successResponse(
      {
        bill: billWithoutRestaurantId,
        restaurant: {
          id: table.restaurant.id,
          name: table.restaurant.name,
        },
        table: {
          id: table.id,
          name: table.name,
        },
        items: bill.items,
        breakdown,
        payments,
        remainingBalance,
      },
      200
    );
  } catch (error) {
    console.error("Error fetching bill:", error);
    return errorResponse("Internal server error", 500);
  }
}
