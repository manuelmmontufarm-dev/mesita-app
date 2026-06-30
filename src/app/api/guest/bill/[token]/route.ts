import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { ingestRestaurantOnScan } from "@/lib/pos-on-scan";
import { isRestaurantOperational } from "@/lib/restaurant-status";
import { calculateBillBreakdown } from "@/modules/bills";
import { money, toNumberSafe } from "@/lib/money";
import { Decimal } from "@prisma/client/runtime/library";

const TABLE_NOT_FOUND = "TABLE_NOT_FOUND";

async function loadTableWithBill(token: string) {
  return prisma.table.findUnique({
    where: { token },
    include: {
      restaurant: true,
      bills: {
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
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await context.params;
  try {
    const preview = await prisma.table.findUnique({
      where: { token },
      include: { restaurant: { select: { id: true, name: true, status: true, invoiceMode: true } } },
    });

    if (!preview) {
      return errorResponse(TABLE_NOT_FOUND, 404);
    }

    if (!isRestaurantOperational(preview.restaurant.status)) {
      return errorResponse("Este restaurante no está disponible para pagos", 403);
    }

    if (preview.restaurant.invoiceMode === "POS") {
      try {
        await ingestRestaurantOnScan(preview.restaurant.id);
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "POS_ON_SCAN_REFRESH_FAILED",
            restaurantId: preview.restaurant.id,
            token,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    }

    const table = await loadTableWithBill(token);
    if (!table) {
      return errorResponse(TABLE_NOT_FOUND, 404);
    }

    if (!table.bills?.length) {
      return errorResponse("No hay cuenta abierta para esta mesa", 404);
    }

    const bill = table.bills[0];

    const breakdown =
      bill.posTotal != null
        ? {
            subtotal: bill.posSubtotal ?? new Decimal(0),
            propina: bill.posPropina ?? new Decimal(0),
            iva: bill.posIva ?? new Decimal(0),
            total: bill.posTotal,
          }
        : calculateBillBreakdown(bill.items);

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

    const {
      restaurantId: _rid,
      payments: _rawPayments,
      ...billWithoutRestaurantId
    } = bill as Record<string, unknown>;

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
