import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateTableSchema = z.object({
  name: z.string().min(1).optional(),
  posExternalId: z.string().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;
    const table = await prisma.table.findUnique({
      where: { id },
      include: { bills: true },
    });

    if (!table || table.restaurantId !== restaurantId) {
      return errorResponse("Table not found", 404);
    }

    return successResponse(table, 200);
  } catch (error) {
    console.error("Error fetching table:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) return authResult;

    const { restaurantId, role } = authResult;
    if (!hasRole(role, "MANAGER")) return errorResponse("Insufficient permissions", 403);

    const body = await request.json();
    const parsed = updateTableSchema.safeParse(body);
    if (!parsed.success) return errorResponse("Invalid request data", 400);

    const table = await prisma.table.findUnique({ where: { id } });
    if (!table || table.restaurantId !== restaurantId) return errorResponse("Table not found", 404);

    const updated = await prisma.table.update({
      where: { id },
      data: parsed.data,
    });

    return successResponse(updated, 200);
  } catch (error) {
    console.error("Error updating table:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Only OWNER and MANAGER can delete tables
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Verify the table belongs to the user's restaurant
    const table = await prisma.table.findUnique({
      where: { id: id },
    });

    if (!table) {
      return errorResponse("Table not found", 404);
    }

    if (table.restaurantId !== restaurantId) {
      return errorResponse("Forbidden", 403);
    }

    // Delete the table
    await prisma.table.delete({
      where: { id, restaurantId },
    });

    return successResponse({ success: true }, 200);
  } catch (error) {
    console.error("Error deleting table:", error);
    return errorResponse("Internal server error", 500);
  }
}
