import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');
    const tableIds = searchParams.get('tableIds');

    // Handle single tableId query for backward compatibility
    if (tableId) {
      const bills = await prisma.bill.findMany({
        where: {
          restaurantId,
          tableId
        },
        include: { items: true, table: true, payments: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });

      return successResponse(bills, 200);
    }

    // Handle batch tableIds query (comma-separated)
    if (tableIds) {
      const tableIdArray = tableIds.split(',').filter(id => id.trim());

      const bills = await prisma.bill.findMany({
        where: {
          restaurantId,
          tableId: { in: tableIdArray }
        },
        include: { items: true, table: true, payments: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "desc" },
      });

      // Group bills by tableId for easier consumption
      const billsByTableId: Record<string, any[]> = {};
      tableIdArray.forEach(id => {
        billsByTableId[id] = [];
      });
      bills.forEach(bill => {
        if (billsByTableId[bill.tableId]) {
          billsByTableId[bill.tableId].push(bill);
        }
      });

      return successResponse(billsByTableId, 200);
    }

    // Get all bills for the restaurant if no filters
    const bills = await prisma.bill.findMany({
      where: {
        restaurantId,
      },
      include: { items: true, table: true, payments: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 200, // LOW-04: default pagination guard
    });

    return successResponse(bills, 200);
  } catch (error) {
    console.error("Error fetching bills:", error);
    return errorResponse("Internal server error", 500);
  }
}

