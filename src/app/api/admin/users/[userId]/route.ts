import { checkAdminSecret, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updateRoleSchema = z.object({ role: z.enum(["OWNER", "MANAGER", "SERVER"]) });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const { userId } = await context.params;
  try {
    if (!checkAdminSecret(request)) return errorResponse("Unauthorized", 401);

    const parsed = updateRoleSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("Invalid role", 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse("User not found", 404);

    if (user.role === "OWNER" && parsed.data.role !== "OWNER") {
      const ownerCount = await prisma.user.count({
        where: { restaurantId: user.restaurantId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        return errorResponse("A restaurant must keep at least one owner", 409);
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: parsed.data.role },
      select: { id: true, name: true, email: true, role: true, restaurantId: true },
    });
    return successResponse(updated, 200);
  } catch (error) {
    console.error("Admin role update failed:", error);
    return errorResponse("Internal server error", 500);
  }
}
