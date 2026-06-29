import { successResponse } from "@/lib/api-utils";
import { getDemoTableState } from "@/lib/demo-table-store";
import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { listAllTables, listInvoices } from "@/lib/demo-pos";

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
  const allTables = await listAllTables();
  const totalTables = allTables.length;
  const invoices = await listInvoices(20);

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

  const recentConfirmations = (allPayments.length > 0
    ? allPayments
    : invoices.map((inv) => ({
        tableName: inv.tableName,
        amount: inv.amount,
        guestName: inv.guestName,
        createdAt: inv.createdAt,
      }))
  ).slice(0, 5).map((p) => ({
    tableName: p.tableName,
    amount: p.amount,
    guestName: p.guestName,
    createdAt: p.createdAt,
  }));

  const tables = allTables.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    guestCount: t.guestCount,
    total: t.total,
    live: t.live,
    kind: t.kind,
  }));

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
