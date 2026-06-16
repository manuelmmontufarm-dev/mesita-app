import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schema for restaurant updates
const updateRestaurantSchema = z.object({
  name: z.string().min(2).optional(),
  logo: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//.test(u), "URL debe ser http(s)")
    .nullable()
    .optional(),
  address: z.string().min(5).optional(),
});

export async function PATCH(
  request: Request,
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

    // Verify tenant isolation: restaurantId from params must match session
    if (restaurantId !== id) {
      return errorResponse("Forbidden", 403);
    }

    // Only OWNER and MANAGER can update restaurant profile
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateRestaurantSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Don't allow updates to protected fields
    if ("status" in body || "plan" in body || "facturaCount" in body) {
      return errorResponse("Cannot update protected fields", 400);
    }

    // Prepare update data (only include provided fields)
    const updateData: Record<string, any> = {};
    if (validatedData.data.name !== undefined) {
      updateData.name = validatedData.data.name;
    }
    if ("logo" in validatedData.data && validatedData.data.logo !== undefined) {
      updateData.logo = validatedData.data.logo;
    }
    if (validatedData.data.address !== undefined) {
      updateData.address = validatedData.data.address;
    }

    // Update restaurant
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: id },
      data: updateData,
    });

    return successResponse(updatedRestaurant, 200);
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return errorResponse("Restaurant not found", 404);
    }

    console.error("Error updating restaurant:", error);
    return errorResponse("Internal server error", 500);
  }
}
