import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { PROPINA_RATE } from "@/lib/constants/ecuador-tax";

export async function GET(): Promise<Response> {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) return authResult;
    const { restaurantId } = authResult;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [tables, todayPayments] = await Promise.all([
      prisma.table.findMany({
        where: { restaurantId },
        select: {
          id: true,
          name: true,
          bills: {
            where: { status: { in: ["UNPAID", "PARTIALLY_PAID", "FULLY_PAID"] } },
            select: {
              id: true,
              status: true,
              posTotal: true,
              equalSplitPeople: true,
              items: { select: { price: true, quantity: true, isPaid: true } },
              payments: { where: { status: "COMPLETED" }, select: { amount: true, voluntaryTip: true } },
              guestSessions: {
                where: { status: { not: "LEFT" } },
                select: { id: true },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.payment.findMany({
        where: {
          restaurantId,
          status: "COMPLETED",
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        select: {
          id: true,
          amount: true,
          voluntaryTip: true,
          createdAt: true,
          bill: { select: { table: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const revenueToday = todayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const activeTables = tables.filter((t) => {
      const bill = t.bills[0];
      return bill && bill.status !== "FULLY_PAID";
    }).length;
    const avgTicket = todayPayments.length > 0 ? revenueToday / todayPayments.length : 0;
    const propinaTotal = todayPayments.reduce((s, p) => {
      const a = Number(p.amount);
      const tip = Number(p.voluntaryTip ?? 0);
      const base = a - tip;
      return s + (base / (1 + PROPINA_RATE)) * PROPINA_RATE;
    }, 0);
    const propinaRate = revenueToday > 0 ? (propinaTotal / revenueToday) * 100 : 0;

    const nowHour = new Date().getHours();
    const hourBuckets: number[] = Array(12).fill(0);
    todayPayments.forEach((p) => {
      const h = new Date(p.createdAt).getHours();
      const offset = (h - nowHour + 24) % 24;
      if (offset <= 11) {
        const idx = 11 - offset;
        hourBuckets[idx] += Number(p.amount);
      }
    });
    const maxVal = Math.max(...hourBuckets, 1);
    const hourlyActivity = hourBuckets.map((v) => Math.round((v / maxVal) * 100));

    const recentConfirmations = todayPayments.slice(0, 5).map((p) => ({
      tableName: p.bill.table?.name ?? "Mesa",
      amount: Number(p.amount),
      createdAt: p.createdAt.toISOString(),
    }));

    const tableStatus = tables.map((t) => {
      const bill = t.bills[0];
      if (!bill) {
        return {
          id: t.id,
          name: t.name,
          status: "closed" as const,
          guestCount: 0,
          total: 0,
          billTotal: 0,
          paidAmount: 0,
          remainingBalance: 0,
          billStatus: null,
        };
      }

      const posTotal = bill.posTotal != null ? Number(bill.posTotal) : null;
      const itemTotal = bill.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      const billTotal = posTotal ?? itemTotal;
      const paidAmount = bill.payments.reduce((s, p) => {
        const tip = Number(p.voluntaryTip ?? 0);
        return s + Number(p.amount) - tip;
      }, 0);
      const remainingBalance = Math.max(billTotal - paidAmount, 0);

      let status: "open" | "paying" | "paid" | "closed" = "closed";
      if (bill.status === "FULLY_PAID") status = "paid";
      else if (bill.status === "PARTIALLY_PAID") status = "paying";
      else if (bill.status === "UNPAID") status = "open";

      return {
        id: t.id,
        name: t.name,
        status,
        guestCount: bill.guestSessions.length,
        total: Number(billTotal.toFixed(2)),
        billTotal: Number(billTotal.toFixed(2)),
        paidAmount: Number(paidAmount.toFixed(2)),
        remainingBalance: Number(remainingBalance.toFixed(2)),
        billStatus: bill.status,
      };
    });

    return successResponse(
      {
        kpis: {
          revenueToday: Number(revenueToday.toFixed(2)),
          activeTables,
          totalTables: tables.length,
          avgTicket: Number(avgTicket.toFixed(2)),
          propinaRate: Number(propinaRate.toFixed(1)),
        },
        hourlyActivity,
        recentConfirmations,
        tables: tableStatus,
      },
      200
    );
  } catch (error) {
    console.error("Dashboard error:", error);
    return errorResponse("Internal server error", 500);
  }
}
