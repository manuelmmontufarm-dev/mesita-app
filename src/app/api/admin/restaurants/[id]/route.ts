import { checkAdminSecret, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Validation schema for updating restaurant status
const updateRestaurantStatusSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]),
  notes: z.string().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    if (!checkAdminSecret(request)) {
      return errorResponse("Unauthorized", 401);
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        users: {
          where: { role: "OWNER" },
          select: { email: true, name: true },
          take: 1,
        },
        tables: {
          select: {
            id: true,
            name: true,
            posExternalId: true,
            bills: {
              where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
              select: { id: true },
            },
          },
          orderBy: { name: "asc" },
        },
        bills: {
          where: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
          select: {
            id: true,
            status: true,
            createdAt: true,
            table: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            bill: { select: { table: { select: { name: true } } } },
          },
        },
      },
    });

    if (!restaurant) {
      return errorResponse("Restaurant not found", 404);
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paymentsThisMonth = await prisma.payment.aggregate({
      where: {
        restaurantId: id,
        status: "COMPLETED",
        createdAt: { gte: startOfMonth },
      },
      _count: { id: true },
      _sum: { amount: true },
    });
    const paymentsAllTime = await prisma.payment.aggregate({
      where: { restaurantId: id, status: "COMPLETED" },
      _count: { id: true },
      _sum: { amount: true },
    });

    const { posApiKeyEnc, kushkiPrivateKeyEnc, ...safeRestaurant } = restaurant;

    return successResponse({
      ...safeRestaurant,
      ownerEmail: restaurant.users[0]?.email ?? null,
      ownerName: restaurant.users[0]?.name ?? null,
      posConfigured: !!posApiKeyEnc,
      kushkiConfigured: !!kushkiPrivateKeyEnc,
      tables: restaurant.tables.map((t) => ({
        id: t.id,
        name: t.name,
        posExternalId: t.posExternalId,
        openBillCount: t.bills.length,
      })),
      openBills: restaurant.bills.map((b) => ({
        id: b.id,
        status: b.status,
        createdAt: b.createdAt,
        tableName: b.table.name,
      })),
      recentPayments: restaurant.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        status: p.status,
        createdAt: p.createdAt,
        tableName: p.bill?.table?.name ?? "—",
      })),
      paymentsThisMonth: {
        count: paymentsThisMonth._count.id,
        total: Number(paymentsThisMonth._sum.amount ?? 0),
      },
      paymentsAllTime: {
        count: paymentsAllTime._count.id,
        total: Number(paymentsAllTime._sum.amount ?? 0),
      },
    });
  } catch (error) {
    console.error("Error fetching restaurant detail:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  try {
    // Check ADMIN_SECRET
    if (!checkAdminSecret(request)) {
      return errorResponse("Unauthorized", 401);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateRestaurantStatusSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Verify restaurant exists
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: id },
    });

    if (!restaurant) {
      return errorResponse("Restaurant not found", 404);
    }

    // Update restaurant status
    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: id },
      data: {
        status: validatedData.data.status,
      },
    });

    return successResponse(updatedRestaurant, 200);
  } catch (error) {
    console.error("Error updating restaurant status:", error);
    return errorResponse("Internal server error", 500);
  }
}
