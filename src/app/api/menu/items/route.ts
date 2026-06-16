import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { Decimal } from "@prisma/client/runtime/library";

// Validation schema for menu item operations
const menuItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().min(0.01).max(10000).multipleOf(0.01),
  categoryId: z.string(),
  available: z.boolean().optional().default(true),
});

const updateMenuItemSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().min(0.01).max(10000).multipleOf(0.01).optional(),
  categoryId: z.string().optional(),
  available: z.boolean().optional(),
});

export async function GET(): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Get all menu items for the restaurant with category details
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(menuItems, 200);
  } catch (error) {
    console.error("Error fetching menu items:", error);
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

    // Only OWNER and MANAGER can create menu items
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = menuItemSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Verify category exists and belongs to this restaurant
    const category = await prisma.category.findUnique({
      where: { id: validatedData.data.categoryId },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return errorResponse("Category not found or does not belong to your restaurant", 400);
    }

    // Create menu item
    const menuItem = await prisma.menuItem.create({
      data: {
        name: validatedData.data.name,
        price: new Decimal(validatedData.data.price),
        categoryId: validatedData.data.categoryId,
        available: validatedData.data.available ?? true,
        restaurantId: restaurantId,
      },
      include: { category: true },
    });

    return successResponse(menuItem, 201);
  } catch (error) {
    console.error("Error creating menu item:", error);
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

    // Only OWNER and MANAGER can update menu items
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return errorResponse("Menu item ID is required", 400);
    }

    const validatedData = updateMenuItemSchema.safeParse(updateData);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Verify menu item belongs to user's restaurant
    const menuItem = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menuItem || menuItem.restaurantId !== restaurantId) {
      return errorResponse("Menu item not found", 404);
    }

    // If category is being updated, verify it belongs to this restaurant
    if (validatedData.data.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: validatedData.data.categoryId },
      });

      if (!category || category.restaurantId !== restaurantId) {
        return errorResponse("Category not found or does not belong to your restaurant", 400);
      }
    }

    // Update menu item
    const updatePayload: Record<string, any> = {};
    if (validatedData.data.name !== undefined) {
      updatePayload.name = validatedData.data.name;
    }
    if (validatedData.data.price !== undefined) {
      updatePayload.price = new Decimal(validatedData.data.price);
    }
    if (validatedData.data.categoryId !== undefined) {
      updatePayload.categoryId = validatedData.data.categoryId;
    }
    if (validatedData.data.available !== undefined) {
      updatePayload.available = validatedData.data.available;
    }

    const updatedMenuItem = await prisma.menuItem.update({
      where: { id, restaurantId },
      data: updatePayload,
      include: { category: true },
    });

    return successResponse(updatedMenuItem, 200);
  } catch (error) {
    console.error("Error updating menu item:", error);
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

    // Only OWNER and MANAGER can delete menu items
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse request body to get menu item ID
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return errorResponse("Menu item ID is required", 400);
    }

    // Verify menu item belongs to user's restaurant
    const menuItem = await prisma.menuItem.findUnique({
      where: { id },
    });

    if (!menuItem || menuItem.restaurantId !== restaurantId) {
      return errorResponse("Menu item not found", 404);
    }

    // Delete menu item
    await prisma.menuItem.delete({
      where: { id, restaurantId },
    });

    return successResponse({ success: true }, 200);
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return errorResponse("Internal server error", 500);
  }
}
