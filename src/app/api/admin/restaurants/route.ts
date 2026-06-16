import { checkAdminSecret, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";

export async function GET(request: Request): Promise<Response> {
  try {
    // Check ADMIN_SECRET
    if (!checkAdminSecret(request)) {
      return errorResponse("Unauthorized", 401);
    }

    // Get all restaurants with owner email
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        users: {
          where: { role: "OWNER" },
          select: { email: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Format response to include owner email
    const formattedRestaurants = restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      status: restaurant.status,
      createdAt: restaurant.createdAt,
      ownerEmail: restaurant.users[0]?.email || "N/A",
    }));

    return successResponse(formattedRestaurants, 200);
  } catch (error) {
    console.error("Error fetching restaurants:", error);
    return errorResponse("Internal server error", 500);
  }
}
