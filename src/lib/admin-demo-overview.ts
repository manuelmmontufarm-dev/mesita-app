/**
 * Overview de admin cuando Postgres no está disponible (deploy demo en Vercel).
 * Muestra La Doña Pepa como restaurante activo enlazado al POS demo.
 */

export function buildAdminDemoOverview() {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const trend: Array<{ date: string; volume: number; transactions: number }> = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    trend.push({
      date: d.toISOString().slice(0, 10),
      volume: 120 + Math.round(Math.random() * 80),
      transactions: 4 + Math.round(Math.random() * 6),
    });
  }

  const restaurant = {
    id: "demo-la-dona-pepa",
    name: "La Doña Pepa",
    status: "ACTIVE" as const,
    plan: "DEMO",
    createdAt,
    ownerEmail: "demo@mesitaqr.com",
    ownerName: "Demo Propietario",
    tablesCount: 5,
    unmappedTables: 0,
    openBillsCount: 0,
    staffCount: 3,
    month: { count: 24, total: 482.5 },
    integrations: {
      pos: {
        status: "CONNECTED" as const,
        provider: "mesita-pos",
        environment: "production",
      },
      payments: {
        status: "CONNECTED" as const,
        provider: "STUB",
        environment: "demo",
      },
    },
    needsAttention: false,
  };

  return {
    summary: {
      totalRestaurants: 1,
      activeRestaurants: 1,
      pendingRestaurants: 0,
      needsAttention: 0,
      monthVolume: 482.5,
      monthTransactions: 24,
      averageTicket: 20.1,
      allTimeVolume: 4820,
      allTimeTransactions: 240,
    },
    alerts: {
      failedPayments30d: 0,
      pendingPosRegistrations: 0,
      unmappedTables: 0,
      pendingRestaurants: 0,
    },
    trend,
    restaurants: [restaurant],
    recentPayments: [
      {
        id: "demo-pay-1",
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        tableName: "Mesa 1",
        amount: 19.25,
        status: "COMPLETED",
        createdAt: now.toISOString(),
      },
    ],
    demoMode: true,
  };
}
