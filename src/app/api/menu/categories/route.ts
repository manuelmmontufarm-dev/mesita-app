import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schema for category operations
const categorySchema = z.object({
  name: z.string().min(1),
});

const updateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().optional(),
});

export async function GET(): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Get all categories for the restaurant, ordered by order field
    const categories = await prisma.category.findMany({
      where: { restaurantId },
      orderBy: { order: "asc" },
    });

    return successResponse(categories, 200);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Only OWNER and MANAGER can create categories
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = categorySchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Create category
    const category = await prisma.category.create({
      data: {
        name: validatedData.data.name,
        restaurantId: restaurantId,
        order: 0,
      },
    });

    return successResponse(category, 201);
  } catch (error) {
    console.error("Error creating category:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Only OWNER and MANAGER can update categories
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return errorResponse("Category ID is required", 400);
    }

    const validatedData = updateCategorySchema.safeParse(updateData);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Verify category belongs to user's restaurant
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return errorResponse("Category not found", 404);
    }

    // Update category
    const updatePayload: Record<string, any> = {};
    if (validatedData.data.name !== undefined) {
      updatePayload.name = validatedData.data.name;
    }
    if (validatedData.data.order !== undefined) {
      updatePayload.order = validatedData.data.order;
    }

    const updatedCategory = await prisma.category.update({
      where: { id, restaurantId },
      data: updatePayload,
    });

    return successResponse(updatedCategory, 200);
  } catch (error) {
    console.error("Error updating category:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId, role } = authResult;

    // Only OWNER and MANAGER can delete categories
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse request body to get category ID
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return errorResponse("Category ID is required", 400);
    }

    // Verify category belongs to user's restaurant
    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return errorResponse("Category not found", 404);
    }

    // Delete category (cascade deletes menu items)
    await prisma.category.delete({
      where: { id, restaurantId },
    });

    return successResponse({ success: true }, 200);
  } catch (error) {
    console.error("Error deleting category:", error);
    return errorResponse("Internal server error", 500);
  }
}
