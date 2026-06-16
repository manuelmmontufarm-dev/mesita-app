import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { timingSafeEqual } from "crypto";

/**
 * Constant-time string comparison (Node runtime).
 * Length pre-check + crypto.timingSafeEqual prevents byte-by-byte timing attacks
 * against secret comparison.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Authenticate request and extract session
 * @returns Object with userId, restaurantId, role or a 401 Response
 */
export async function requireAuth(): Promise<
  {
    userId: string;
    restaurantId: string;
    role: string;
  } | Response
> {
  const session = await auth();

  if (!session || !session.user) {
    return errorResponse("Unauthorized", 401);
  }

  return {
    userId: session.user.id,
    restaurantId: session.user.restaurantId,
    role: session.user.role,
  };
}

/**
 * Check if request contains valid ADMIN_SECRET
 * Checks: Authorization header (Bearer token), X-Admin-Secret header, or admin_secret cookie.
 * All comparisons are constant-time.
 * @param request - The incoming request
 * @returns true if ADMIN_SECRET is valid, false otherwise
 */
export function checkAdminSecret(request: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) {
    // If no ADMIN_SECRET is configured, deny all admin requests
    return false;
  }

  // Check Authorization header: Bearer [secret]
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    if (timingSafeEqualStr(token, adminSecret)) {
      return true;
    }
  }

  // Check X-Admin-Secret header
  const headerSecret = request.headers.get("x-admin-secret");
  if (headerSecret !== null && timingSafeEqualStr(headerSecret, adminSecret)) {
    return true;
  }

  // Check admin_secret cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieMap = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    })
  );
  const cookieSecret = cookieMap["admin_secret"];
  if (cookieSecret !== undefined && timingSafeEqualStr(cookieSecret, adminSecret)) {
    return true;
  }

  return false;
}

/**
 * Extract restaurantId from session
 * @param session - The session object
 * @returns restaurantId or null if not present
 */
export function getTenantId(session: Session | null): string | null {
  if (!session || !session.user) {
    return null;
  }
  return session.user.restaurantId || null;
}

/**
 * Return error response with JSON
 * @param message - Error message
 * @param status - HTTP status code (default 500)
 * @returns Response with error JSON
 */
export function errorResponse(message: string, status: number = 500): Response {
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Return success response with JSON
 * @param data - Data to return
 * @param status - HTTP status code (default 200)
 * @returns Response with success JSON
 */
export function successResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Validate role hierarchy
 * @param userRole - The user's role
 * @param requiredRole - The required role
 * @returns true if user has required role or higher privilege
 */
export function hasRole(
  userRole: string | undefined | null,
  requiredRole: "OWNER" | "MANAGER" | "SERVER"
): boolean {
  if (!userRole) return false;

  const hierarchy: Record<string, number> = {
    OWNER: 3,
    MANAGER: 2,
    SERVER: 1,
  };

  const userLevel = hierarchy[userRole] ?? 0;
  const requiredLevel = hierarchy[requiredRole];

  return userLevel >= requiredLevel;
}
