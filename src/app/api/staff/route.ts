import { requireAuth, errorResponse, successResponse, hasRole } from "@/lib/api-utils";
import { prisma } from "@/lib/db";
import { validateEmail, generateTemporaryPassword, hashPassword } from "@/lib/auth-utils";
import { z } from "zod";

// Validation schema for creating staff
const createStaffSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(["OWNER", "MANAGER", "SERVER"]),
});

export async function GET(): Promise<Response> {
  try {
    // Authenticate request
    const authResult = await requireAuth();
    if (authResult instanceof Response) {
      return authResult;
    }

    const { restaurantId } = authResult;

    // Get all staff for the restaurant
    const staff = await prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return successResponse(staff, 200);
  } catch (error) {
    console.error("Error fetching staff:", error);
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

    // Only OWNER and MANAGER can create staff
    if (!hasRole(role, "MANAGER")) {
      return errorResponse("Insufficient permissions", 403);
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createStaffSchema.safeParse(body);

    if (!validatedData.success) {
      return errorResponse("Invalid request data", 400);
    }

    // HIGH-04: MANAGER cannot create OWNER accounts — only OWNER can
    if (validatedData.data.role === "OWNER" && role !== "OWNER") {
      return errorResponse("Only OWNER can create another OWNER account", 403);
    }

    // Validate email format using auth-utils
    if (!validateEmail(validatedData.data.email)) {
      return errorResponse("Invalid email format", 400);
    }

    // Check if email is already used globally
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.data.email },
    });

    if (existingUser) {
      return errorResponse("Email already in use", 409);
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();

    // Hash the temporary password
    const hashedPassword = await hashPassword(tempPassword);

    // Create staff account
    const newStaff = await prisma.user.create({
      data: {
        name: validatedData.data.name,
        email: validatedData.data.email,
        password: hashedPassword,
        role: validatedData.data.role,
        restaurantId: restaurantId,
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    // HIGH-05: Return temp password once in response body — admin must share it manually.
    // No email delivery in v1. Do NOT log tempPassword (server logs are not encrypted).
    // Future: replace with email delivery via SendGrid and remove from response.
    return successResponse(
      {
        ...newStaff,
        temporaryPassword: tempPassword,
        _note: "Share this password with the staff member. It will not be shown again.",
      },
      201
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return errorResponse("Email already in use", 409);
    }

    console.error("Error creating staff:", error);
    return errorResponse("Internal server error", 500);
  }
}
