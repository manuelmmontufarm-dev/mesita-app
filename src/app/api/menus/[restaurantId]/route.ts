import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ restaurantId: string }> }
): Promise<Response> {
  const { restaurantId } = await context.params;

  try {
    // Require authentication and verify restaurantId matches user's restaurant
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId: userRestaurantId } = authResult;

    // Tenant isolation check
    if (restaurantId !== userRestaurantId) {
      return errorResponse("Forbidden", 403);
    }

    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: { name: "asc" },
    });

    return successResponse(menuItems, 200);
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return errorResponse("Internal server error", 500);
  }
}
