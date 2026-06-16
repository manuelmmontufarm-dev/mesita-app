import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schema for updating a bill
const updateBillSchema = z.object({
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "FULLY_PAID", "REFUNDED"]).optional(),
  splitMode: z.enum(["FULL", "EQUAL", "BY_ITEM"]).optional(),
  notes: z.string().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ billId: string }> }
): Promise<Response> {
  const { billId } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Verify bill exists
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true, table: true, payments: { orderBy: { createdAt: "asc" } } },
    });

    if (!bill) {
      return errorResponse("Bill not found", 404);
    }

    // Verify bill belongs to user's restaurant
    if (bill.restaurantId !== restaurantId) {
      return errorResponse("Forbidden", 403);
    }

    return successResponse(bill, 200);
  } catch (error) {
    console.error("Error fetching bill:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ billId: string }> }
): Promise<Response> {
  const { billId } = await context.params;
  try {
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Verify bill exists and belongs to restaurant
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
    });

    if (!bill || bill.restaurantId !== restaurantId) {
      return errorResponse("Bill not found", 404);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateBillSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // MED-09: Only MANAGER+ can change bill status — SERVER can only update notes/splitMode
    if (validatedData.data.status && !hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions to change bill status", 403);
    }

    // Validate status enum values if provided
    if (validatedData.data.status) {
      const validStatuses = ["UNPAID", "PARTIALLY_PAID", "FULLY_PAID", "REFUNDED"];
      if (!validStatuses.includes(validatedData.data.status)) {
        return errorResponse("Invalid bill status", 400);
      }
    }

    // Validate splitMode enum values if provided
    if (validatedData.data.splitMode) {
      const validSplitModes = ["FULL", "EQUAL", "BY_ITEM"];
      if (!validSplitModes.includes(validatedData.data.splitMode)) {
        return errorResponse("Invalid split mode", 400);
      }
    }

    // Build update data
    const updateData: any = {};
    if (validatedData.data.status) {
      updateData.status = validatedData.data.status;
      // If closing bill, set closedAt timestamp
      if (validatedData.data.status === "FULLY_PAID") {
        updateData.closedAt = new Date();
      }
    }
    if (validatedData.data.splitMode) {
      updateData.splitMode = validatedData.data.splitMode;
    }
    if (validatedData.data.notes !== undefined) {
      updateData.notes = validatedData.data.notes;
    }

    // Update bill
    const updatedBill = await prisma.bill.update({
      where: { id: billId, restaurantId },
      data: updateData,
      include: { items: true, table: true, payments: { orderBy: { createdAt: "asc" } } },
    });

    return successResponse(updatedBill, 200);
  } catch (error) {
    console.error("Error updating bill:", error);
    return errorResponse("Internal server error", 500);
  }
}
