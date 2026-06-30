import { requireAuth, errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { isOwnerReadOnly, ownerReadOnlyResponse } from "@/lib/owner-mode";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

const createTableSchema = z.object({
  name: z.string().min(1),
  posExternalId: z.string().optional(),
});

export async function GET(): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Get all tables for the authenticated user's restaurant
    const tables = await prisma.table.findMany({
      where: { restaurantId },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(tables, 200);
  } catch (error) {
    console.error("Error fetching tables:", error);
    return errorResponse("Internal server error", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (isOwnerReadOnly()) return ownerReadOnlyResponse();
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createTableSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // Generate unique UUID v4 token for the table
    const token = uuidv4();

    // Create table with the unique token
    const table = await prisma.table.create({
      data: {
        name: validatedData.data.name,
        token: token,
        restaurantId: restaurantId,
        posExternalId: validatedData.data.posExternalId ?? null,
      },
    });

    return successResponse(table, 201);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return errorResponse("Table token already exists", 409);
    }

    console.error("Error creating table:", error);
    return errorResponse("Internal server error", 500);
  }
}
