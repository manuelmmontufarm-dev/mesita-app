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
            where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
            select: {
              status: true,
              equalSplitPeople: true,
              items: {
                select: { price: true, quantity: true },
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
          bill: {
            select: {
              table: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // KPIs
    const revenueToday = todayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const activeTables = tables.filter((t) => t.bills.length > 0).length;
    const avgTicket = todayPayments.length > 0 ? revenueToday / todayPayments.length : 0;
    const propinaTotal = todayPayments.reduce((s, p) => {
      const a = Number(p.amount);
      const tip = Number((p as Record<string, unknown>).voluntaryTip ?? 0);
      const base = a - tip;
      return s + (base / (1 + PROPINA_RATE)) * PROPINA_RATE;
    }, 0);
    const propinaRate = revenueToday > 0 ? (propinaTotal / revenueToday) * 100 : 0;

    // Hourly activity — bucket payments into the last 12 hours (0=oldest, 11=now)
    const nowHour = new Date().getHours();
    const hourBuckets: number[] = Array(12).fill(0);
    todayPayments.forEach((p) => {
      const h = new Date(p.createdAt).getHours();
      const offset = ((h - nowHour + 24) % 24);
      // only include within the last 11 hours
      if (offset <= 11) {
        const idx = 11 - offset;
        hourBuckets[idx] += Number(p.amount);
      }
    });
    const maxVal = Math.max(...hourBuckets, 1);
    const hourlyActivity = hourBuckets.map((v) => Math.round((v / maxVal) * 100));

    // Recent confirmations (last 5 paid tables)
    const recentConfirmations = todayPayments.slice(0, 5).map((p) => ({
      tableName: p.bill.table?.name ?? "Mesa",
      amount: Number(p.amount),
    }));

    // Table status with bill totals
    const tableStatus = tables.map((t) => {
      const bill = t.bills[0];
      let status: "open" | "paying" | "closed" = "closed";
      if (bill) status = bill.status === "PARTIALLY_PAID" ? "paying" : "open";
      const total = bill
        ? bill.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0)
        : 0;
      return {
        id: t.id,
        name: t.name,
        status,
        guestCount: bill?.equalSplitPeople ?? 0,
        total: Number(total.toFixed(2)),
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
