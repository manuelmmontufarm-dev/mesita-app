import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { PROPINA_RATE, TAX_MULTIPLIER } from "@/lib/constants/ecuador-tax";

/**
 * GET /api/reports/propinas
 * Fetch per-server propina assignment report for a date range
 * OWNER-only endpoint with tenant isolation
 * Returns aggregated propina data grouped by server/shift/day
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // OWNER-only check per D-02
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

    // Fetch completed payments with bill and items for server propina aggregation
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
        createdAt: "asc",
      },
    });

    // Aggregate propina data by server and shift (date)
    // Structure: Map<serverKey, Map<shiftDate, { tables, propinaTotal }>>
    const propinasMap = new Map<
      string,
      Map<
        string,
        {
          servidor: string;
          turno: string;
          mesasAtendidas: Set<string>;
          propinaAsignada: number;
        }
      >
    >();

    for (const payment of payments) {
      const amount = Number(payment.amount);

      // Extract propina component: propina = subtotal × PROPINA_RATE; subtotal = amount / TAX_MULTIPLIER
      const propinaAmount = Math.round((amount / TAX_MULTIPLIER) * PROPINA_RATE * 100) / 100;

      // Get shift/turno as date (YYYY-MM-DD)
      const shiftDate = new Date(payment.createdAt);
      shiftDate.setHours(0, 0, 0, 0);
      const turno = shiftDate.toISOString().split("T")[0];

      // Get server from table assignment or use default server
      // For MVP, we use a default server mapping or distribute equally
      // If no explicit server assignment on table, we'll use table name as identifier
      // and distribute to "Default Server" or the first assigned server
      const servidor = payment.bill.table?.name || "General";

      // Initialize maps if needed
      if (!propinasMap.has(servidor)) {
        propinasMap.set(servidor, new Map());
      }

      const serverShifts = propinasMap.get(servidor)!;
      const key = turno;

      if (!serverShifts.has(key)) {
        serverShifts.set(key, {
          servidor,
          turno,
          mesasAtendidas: new Set(),
          propinaAsignada: 0,
        });
      }

      const entry = serverShifts.get(key)!;
      entry.mesasAtendidas.add(payment.bill.table?.name || payment.bill.tableId);
      entry.propinaAsignada += propinaAmount;
    }

    // Convert map structure to response array
    const result: Array<{
      servidor: string;
      turno: string;
      mesasAtendidas: number;
      propinaAsignada: number;
    }> = [];

    for (const [, shifts] of propinasMap.entries()) {
      for (const [, entry] of shifts.entries()) {
        result.push({
          servidor: entry.servidor,
          turno: entry.turno,
          mesasAtendidas: entry.mesasAtendidas.size,
          propinaAsignada: Number(entry.propinaAsignada.toFixed(2)),
        });
      }
    }

    // Sort by turno (date) ascending
    result.sort((a, b) => a.turno.localeCompare(b.turno));

    // Return response structure per spec
    return successResponse(result, 200);
  } catch (error) {
    console.error("Error fetching propina report:", error);
    return errorResponse("Internal server error", 500);
  }
}
