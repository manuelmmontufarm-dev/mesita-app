import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { PROPINA_RATE } from '@/lib/constants/ecuador-tax';

/**
 * GET /api/reports/payments
 * Fetch payment summary for a date range with KPI aggregates and per-table breakdown
 * OWNER-only endpoint with tenant isolation
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // OWNER-only check per D-01
    if (!hasRole(role, "OWNER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Extract and validate date range query params
    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    // Validate date params exist
    if (!fromParam || !toParam) {
      return errorResponse("Missing required date range parameters: from, to", 400);
    }

    // Parse dates
    let fromDate: Date;
    let toDate: Date;

    try {
      fromDate = new Date(fromParam);
      toDate = new Date(toParam);

      // Validate dates are valid
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return errorResponse("Invalid date format. Use ISO format (YYYY-MM-DD or ISO 8601)", 400);
      }
    } catch (err) {
      return errorResponse("Invalid date format", 400);
    }

    // Validate date range
    if (fromDate > toDate) {
      return errorResponse("Invalid date range: from date must be before or equal to to date", 400);
    }

    // Set time boundaries for the range
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    // Fetch completed payments for the restaurant within date range
    const payments = await prisma.payment.findMany({
      where: {
        restaurantId,
        status: "COMPLETED",
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      include: {
        bill: {
          include: {
            table: true,
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate KPI cards
    let totalCollected = 0;
    let propinaTotal = 0;
    let paymentCount = 0;

    // Build table breakdown with aggregation
    const tableBreakdownMap = new Map<
      string,
      {
        tableId: string;
        tableName: string;
        totalPaid: number;
        propina: number;
        status: string;
        time: string;
        paymentIds: string[];
      }
    >();

    for (const payment of payments) {
      const amount = Number(payment.amount);
      totalCollected += amount;
      paymentCount += 1;

      // MED-10: Exclude voluntary tip before deriving mandatory propina (10%)
      // base = amount - voluntaryTip; derive the mandatory service component from the tax-included base.
      const tip = Number((payment as any).voluntaryTip ?? 0);
      const base = amount - tip;
      const propinaAmount = Math.round((base / (1 + PROPINA_RATE)) * PROPINA_RATE * 100) / 100;
      propinaTotal += propinaAmount;

      // Add to table breakdown
      const tableId = payment.bill.tableId;
      const tableName = payment.bill.table?.name || "Unknown Table";

      if (!tableBreakdownMap.has(tableId)) {
        tableBreakdownMap.set(tableId, {
          tableId,
          tableName,
          totalPaid: 0,
          propina: 0,
          status: payment.bill.status || "COMPLETED",
          time: new Date(payment.createdAt).toISOString(),
          paymentIds: [payment.id],
        });
      }

      const entry = tableBreakdownMap.get(tableId)!;
      entry.totalPaid += amount;
      entry.propina += propinaAmount;
      if (!entry.paymentIds.includes(payment.id)) {
        entry.paymentIds.push(payment.id);
      }
    }

    // Convert map to array
    const tableBreakdown = Array.from(tableBreakdownMap.values());

    // Calculate average payment
    const avgPayment = paymentCount > 0 ? totalCollected / paymentCount : 0;

    // Return response structure per spec
    return successResponse(
      {
        kpiCards: {
          totalCollected: Number(totalCollected.toFixed(2)),
          propinaTotal: Number(propinaTotal.toFixed(2)),
          paymentCount,
          avgPayment: Number(avgPayment.toFixed(2)),
        },
        tableBreakdown: tableBreakdown.map((entry) => ({
          tableId: entry.tableId,
          tableName: entry.tableName,
          totalPaid: Number(entry.totalPaid.toFixed(2)),
          propina: Number(entry.propina.toFixed(2)),
          status: entry.status,
          time: entry.time,
          paymentIds: entry.paymentIds,
        })),
      },
      200
    );
  } catch (error) {
    console.error("Error fetching payment summary:", error);
    return errorResponse("Internal server error", 500);
  }
}
