import { errorResponse, hasRole, requireAuth, successResponse } from "@/lib/api-utils";
import { TAX_MULTIPLIER } from "@/lib/constants/ecuador-tax";
import { prisma } from "@/lib/db";

const LOOKBACK_HOURS = 12;

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function billTotalWithTax(items: Array<{ price: unknown; quantity: number }>): number {
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  return money(subtotal * TAX_MULTIPLIER);
}

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    if (!hasRole(auth.role, "SERVER")) return errorResponse("Insufficient permissions", 403);

    const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
    const bills = await prisma.bill.findMany({
      where: {
        restaurantId: auth.restaurantId,
        payments: {
          some: {
            status: "COMPLETED",
            createdAt: { gte: since },
          },
        },
      },
      include: {
        table: true,
        items: true,
        payments: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const alerts = bills.map((bill) => {
      const billTotal = billTotalWithTax(bill.items);
      const paidTotal = bill.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const unregistered = bill.payments.filter((payment) => !payment.posRegisteredAt);
      const lastPayment = bill.payments[0] ?? null;

      return {
        billId: bill.id,
        tableId: bill.tableId,
        tableName: bill.table?.name ?? "Mesa",
        status: bill.status,
        billTotal,
        paidTotal: money(paidTotal),
        pendingTotal: money(Math.max(billTotal - paidTotal, 0)),
        unregisteredTotal: money(
          unregistered.reduce((sum, payment) => sum + Number(payment.amount), 0)
        ),
        unregisteredPaymentIds: unregistered.map((payment) => payment.id),
        needsPosRegistration: unregistered.length > 0,
        paymentCount: bill.payments.length,
        lastPaymentAt: lastPayment?.createdAt.toISOString() ?? null,
        lastPaymentReference: lastPayment?.kushkiTransactionId ?? null,
      };
    });

    return successResponse({ alerts, generatedAt: new Date().toISOString() }, 200);
  } catch (error) {
    console.error("Error fetching POS companion payments:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    if (auth instanceof Response) return auth;
    if (!hasRole(auth.role, "SERVER")) return errorResponse("Insufficient permissions", 403);

    const body = await request.json().catch(() => ({}));
    const billId = typeof body.billId === "string" ? body.billId : null;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;
    if (!billId) return errorResponse("Missing billId", 400);

    const result = await prisma.payment.updateMany({
      where: {
        billId,
        restaurantId: auth.restaurantId,
        status: "COMPLETED",
        posRegisteredAt: null,
      },
      data: {
        posRegisteredAt: new Date(),
        posRegisteredByUserId: auth.userId,
        posRegistrationNote: note,
      },
    });

    return successResponse({ updated: result.count }, 200);
  } catch (error) {
    console.error("Error marking POS companion payment:", error);
    return errorResponse("Internal server error", 500);
  }
}
