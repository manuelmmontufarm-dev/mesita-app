import { prisma } from "@/lib/db";
import { hashPassword, validateEmail } from "@/lib/auth-utils";
import { AuthResponse } from "@/types/auth";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { email, password, restaurantName } = body;

    // Validate email format
    if (!validateEmail(email)) {
      return Response.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password length
    if (!password || password.length < 8) {
      return Response.json(
        {
          success: false,
          message: "Password must be at least 8 characters",
        },
        { status: 400 }
      );
    }

    // Validate restaurant name
    if (!restaurantName || restaurantName.trim().length < 2) {
      return Response.json(
        { success: false, message: "Restaurant name required" },
        { status: 400 }
      );
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return Response.json(
        { success: false, message: "Email already registered" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create restaurant
    const restaurant = await prisma.restaurant.create({
      data: {
        name: restaurantName,
        status: "PENDING",
      },
    });

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: email.split("@")[0],
        role: "OWNER",
        restaurantId: restaurant.id,
        mustChangePassword: false,
      },
    });

    const response: AuthResponse = {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        restaurantId: user.restaurantId,
      },
    };

    return Response.json(response, { status: 201 });
  } catch (error) {
    // Handle Prisma unique constraint errors
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint failed")
    ) {
      return Response.json(
        { success: false, message: "Email already in use" },
        { status: 409 }
      );
    }

    console.error("Registration error:", error);
    return Response.json(
      {
        success: false,
        message: "Registration failed. Please try again.",
      },
      { status: 500 }
    );
  }
}
