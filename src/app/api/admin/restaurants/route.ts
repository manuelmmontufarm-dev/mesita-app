import { buildAdminDemoOverview } from "@/lib/admin-demo-overview";
import { checkAdminSecret, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

const OPEN_BILL_STATUSES = ["UNPAID", "PARTIALLY_PAID"] as const;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request): Promise<Response> {
  try {
    if (!checkAdminSecret(request)) return errorResponse("Unauthorized", 401);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const trendStart = new Date(now);
    trendStart.setHours(0, 0, 0, 0);
    trendStart.setDate(trendStart.getDate() - 13);

    const [
      restaurants,
      monthByRestaurant,
      allTimePayments,
      trendPayments,
      recentPayments,
      failedPayments30d,
      pendingPosRegistrations,
    ] = await Promise.all([
      prisma.restaurant.findMany({
        select: {
          id: true,
          name: true,
          status: true,
          plan: true,
          createdAt: true,
          invoiceMode: true,
          posProvider: true,
          posEnvironment: true,
          posApiKeyEnc: true,
          paymentsEnabled: true,
          paymentProvider: true,
          paymentEnvironment: true,
          paymentPrivateKeyEnc: true,
          users: {
            where: { role: "OWNER" },
            select: { email: true, name: true },
            take: 1,
          },
          tables: { select: { id: true, posExternalId: true } },
          bills: {
            where: { status: { in: [...OPEN_BILL_STATUSES] } },
            select: { id: true },
          },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.groupBy({
        by: ["restaurantId"],
        where: { status: "COMPLETED", createdAt: { gte: startOfMonth } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.findMany({
        where: { status: "COMPLETED", createdAt: { gte: trendStart } },
        select: { amount: true, createdAt: true },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          restaurant: { select: { id: true, name: true } },
          bill: { select: { table: { select: { name: true } } } },
        },
      }),
      prisma.payment.count({
        where: {
          status: "FAILED",
          createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.payment.count({
        where: {
          status: "COMPLETED",
          posRegisteredAt: null,
          restaurant: { invoiceMode: "POS" },
        },
      }),
    ]);

    const monthMap = new Map(
      monthByRestaurant.map((row) => [
        row.restaurantId,
        { count: row._count.id, total: Number(row._sum.amount ?? 0) },
      ]),
    );

    const formattedRestaurants = restaurants.map((restaurant) => {
      const month = monthMap.get(restaurant.id) ?? { count: 0, total: 0 };
      const unmappedTables = restaurant.tables.filter((table) => !table.posExternalId).length;
      const posStatus =
        restaurant.invoiceMode !== "POS"
          ? "NOT_CONFIGURED"
          : restaurant.posProvider && restaurant.posApiKeyEnc
            ? "CONNECTED"
            : "ACTION_REQUIRED";
      const paymentStatus = !restaurant.paymentsEnabled
        ? "DISABLED"
        : restaurant.paymentProvider === "STUB" || restaurant.paymentPrivateKeyEnc
          ? "CONNECTED"
          : "ACTION_REQUIRED";

      return {
        id: restaurant.id,
        name: restaurant.name,
        status: restaurant.status,
        plan: restaurant.plan,
        createdAt: restaurant.createdAt,
        ownerEmail: restaurant.users[0]?.email ?? "Sin propietario",
        ownerName: restaurant.users[0]?.name ?? null,
        tablesCount: restaurant.tables.length,
        unmappedTables,
        openBillsCount: restaurant.bills.length,
        staffCount: restaurant._count.users,
        month,
        integrations: {
          pos: {
            status: posStatus,
            provider: restaurant.posProvider,
            environment: restaurant.posEnvironment,
          },
          payments: {
            status: paymentStatus,
            provider: restaurant.paymentProvider,
            environment: restaurant.paymentEnvironment,
          },
        },
        needsAttention:
          restaurant.status === "PENDING" ||
          posStatus === "ACTION_REQUIRED" ||
          paymentStatus === "ACTION_REQUIRED" ||
          (restaurant.invoiceMode === "POS" && unmappedTables > 0),
      };
    });

    const monthVolume = monthByRestaurant.reduce(
      (sum, row) => sum + Number(row._sum.amount ?? 0),
      0,
    );
    const monthTransactions = monthByRestaurant.reduce(
      (sum, row) => sum + row._count.id,
      0,
    );
    const trendMap = new Map<string, { volume: number; transactions: number }>();
    for (let i = 0; i < 14; i += 1) {
      const date = new Date(trendStart);
      date.setDate(trendStart.getDate() + i);
      trendMap.set(dayKey(date), { volume: 0, transactions: 0 });
    }
    for (const payment of trendPayments) {
      const key = dayKey(payment.createdAt);
      const entry = trendMap.get(key);
      if (entry) {
        entry.volume += Number(payment.amount);
        entry.transactions += 1;
      }
    }

    const unmappedTables = formattedRestaurants.reduce(
      (sum, restaurant) => sum + restaurant.unmappedTables,
      0,
    );

    return successResponse(
      {
        summary: {
          totalRestaurants: restaurants.length,
          activeRestaurants: restaurants.filter((r) => r.status === "ACTIVE").length,
          pendingRestaurants: restaurants.filter((r) => r.status === "PENDING").length,
          needsAttention: formattedRestaurants.filter((r) => r.needsAttention).length,
          monthVolume: Number(monthVolume.toFixed(2)),
          monthTransactions,
          averageTicket: Number(
            (monthTransactions > 0 ? monthVolume / monthTransactions : 0).toFixed(2),
          ),
          allTimeVolume: Number(Number(allTimePayments._sum.amount ?? 0).toFixed(2)),
          allTimeTransactions: allTimePayments._count.id,
        },
        alerts: {
          failedPayments30d,
          pendingPosRegistrations,
          unmappedTables,
          pendingRestaurants: restaurants.filter((r) => r.status === "PENDING").length,
        },
        trend: Array.from(trendMap, ([date, values]) => ({
          date,
          volume: Number(values.volume.toFixed(2)),
          transactions: values.transactions,
        })),
        restaurants: formattedRestaurants,
        recentPayments: recentPayments.map((payment) => ({
          id: payment.id,
          restaurantId: payment.restaurant.id,
          restaurantName: payment.restaurant.name,
          tableName: payment.bill?.table?.name ?? "Mesa",
          amount: Number(payment.amount),
          status: payment.status,
          createdAt: payment.createdAt,
        })),
      },
      200,
    );
  } catch (error) {
    console.error("Error fetching admin platform overview:", error);
    // Demo deploy: si Postgres no responde, mostrar overview con La Doña Pepa.
    if (checkAdminSecret(request)) {
      return successResponse(buildAdminDemoOverview(), 200);
    }
    return errorResponse("Internal server error", 500);
  }
}
