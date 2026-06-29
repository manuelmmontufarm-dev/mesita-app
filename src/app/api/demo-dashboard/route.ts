import { getDemoTableState } from "@/lib/demo-table-store";
import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { successResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const states = await Promise.all(
    DEMO_TABLE_DEFINITIONS.map((d) =>
      getDemoTableState(d.token).catch(() => null)
    )
  );

  // today's payments across all tables
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const allPayments = states
    .flatMap((s, i) => {
      if (!s) return [];
      return s.payments
        .filter((p) => new Date(p.createdAt) >= todayStart)
        .map((p) => ({
          ...p,
          tableName: `Mesa ${DEMO_TABLE_DEFINITIONS[i].table.name}`,
        }));
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const revenueToday = allPayments.reduce((s, p) => s + p.amount, 0);
  const avgTicket =
    allPayments.length > 0 ? revenueToday / allPayments.length : 0;
  const tipTotal = allPayments.reduce((s, p) => s + (p.tip ?? 0), 0);
  const propinaRate =
    revenueToday > 0 ? (tipTotal / revenueToday) * 100 : 14.2;

  const activeTables = states.filter(
    (s) => s && s.guests.some((g) => g.status !== "paid")
  ).length;
  const totalTables = DEMO_TABLE_DEFINITIONS.length;

  const hasLiveData = allPayments.length > 0;
  const displayRevenue = hasLiveData ? revenueToday : 4820;
  const displayAvgTicket = hasLiveData ? avgTicket : 31.4;
  const displayActiveTables = hasLiveData ? activeTables : 4;
  const displayPropina = hasLiveData ? propinaRate : 14.2;

  // 12-bucket hourly activity
  const nowHour = new Date().getHours();
  const buckets = Array(12).fill(0);
  allPayments.forEach((p) => {
    const h = new Date(p.createdAt).getHours();
    const offset = (nowHour - h + 24) % 24;
    if (offset < 12) buckets[11 - offset] += p.amount;
  });
  const mockBase = [22, 18, 35, 42, 58, 71, 85, 92, 78, 65, 45, 38];
  const finalBuckets = buckets.some((v) => v > 0) ? buckets : mockBase;
  const maxVal = Math.max(...finalBuckets, 1);
  const hourlyActivity = finalBuckets.map((v) => Math.round((v / maxVal) * 100));

  const recentConfirmations = allPayments.slice(0, 5).map((p) => ({
    tableName: p.tableName,
    amount: p.amount,
    guestName: p.guestName,
    createdAt: p.createdAt,
  }));

  const tables = states.map((s, i) => {
    const def = DEMO_TABLE_DEFINITIONS[i];
    const tableTotal = def.items.reduce(
      (sum, it) => sum + it.qty * it.unitPrice,
      0
    );
    if (!s)
      return {
        id: def.token,
        name: `Mesa ${def.table.name}`,
        status: "closed" as const,
        guestCount: 0,
        total: tableTotal,
      };
    const hasGuests = s.guests.length > 0;
    const hasPayments = s.payments.length > 0;
    const allPaid =
      s.paidItemIds.length >= s.items.length && s.items.length > 0;
    let status: "open" | "paying" | "closed";
    if (allPaid) status = "closed";
    else if (hasPayments) status = "paying";
    else if (hasGuests) status = "open";
    else status = "closed";
    return {
      id: def.token,
      name: `Mesa ${def.table.name}`,
      status,
      guestCount: s.guests.length,
      total: tableTotal,
    };
  });

  return successResponse(
    {
      kpis: {
        revenueToday: Math.round(displayRevenue * 100) / 100,
        activeTables: displayActiveTables,
        totalTables,
        avgTicket: Math.round(displayAvgTicket * 100) / 100,
        propinaRate: Math.round(displayPropina * 10) / 10,
      },
      hourlyActivity,
      recentConfirmations,
      tables,
      demoMode: true,
    },
    200
  );
}
