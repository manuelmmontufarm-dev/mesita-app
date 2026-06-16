// Tenant isolation helpers and middleware for Phase 1
// This file provides utilities for enforcing tenant isolation in API routes and server actions.

import { auth } from "@/lib/auth";

export interface SessionContext {
  userId: string;
  restaurantId: string;
  role: "OWNER" | "MANAGER" | "SERVER";
}

/**
 * Get the current user's session context for tenant isolation.
 * Always use this before querying any tenant-scoped data.
 *
 * Returns null if the user is not authenticated.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  return {
    userId: session.user.id,
    restaurantId: session.user.restaurantId,
    role: session.user.role,
  };
}

/**
 * Assert that a user is authenticated and has a valid session context.
 * Throws an error if the user is not authenticated.
 */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();

  if (!context) {
    throw new Error("Unauthorized: Session required");
  }

  return context;
}

/**
 * Assert that a user has a specific role.
 * @param requiredRole The role required to proceed
 */
export async function requireRole(
  requiredRole: "OWNER" | "MANAGER" | "SERVER"
): Promise<SessionContext> {
  const context = await requireSession();

  const roleHierarchy: Record<string, number> = {
    OWNER: 3,
    MANAGER: 2,
    SERVER: 1,
  };

  const userRoleLevel = roleHierarchy[context.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  if (userRoleLevel < requiredLevel) {
    throw new Error(`Unauthorized: ${requiredRole} role required`);
  }

  return context;
}

/**
 * Next.js App Router Middleware for role-based route protection.
 * This middleware will be applied to protected routes.
 *
 * Usage in middleware.ts or route handlers:
 *   export async function middleware(request: NextRequest) {
 *     const pathName = request.nextUrl.pathname;
 *
 *     // Protect /dashboard routes
 *     if (pathName.startsWith("/dashboard")) {
 *       const session = await auth();
 *       if (!session) {
 *         return NextResponse.redirect(new URL("/login", request.url));
 *       }
 *
 *       // Route to correct dashboard based on role
 *       const role = session.user.role.toLowerCase();
 *       if (!pathName.includes(`/dashboard/${role}`)) {
 *         const correctPath = pathName.replace(
 *           /\/dashboard\/[^/]+/,
 *           `/dashboard/${role}`
 *         );
 *         return NextResponse.redirect(new URL(correctPath, request.url));
 *       }
 *     }
 *
 *     return NextResponse.next();
 *   }
 *
 *   export const config = {
 *     matcher: ["/dashboard/:path*", "/api/:path*"],
 *   };
 */

/**
 * Tenant Isolation Pattern Summary
 *
 * 1. QUERY LEVEL: Every Prisma query includes `where: { restaurantId: context.restaurantId }`
 * 2. SESSION LEVEL: restaurantId is verified from Auth.js session, never from client
 * 3. ROUTE LEVEL: Protected routes check session before processing
 * 4. TYPE LEVEL: Session type includes restaurantId, ensuring it's always available
 *
 * CRITICAL RULES:
 * - Never trust client-provided restaurantId
 * - Always extract restaurantId from session.user.restaurantId
 * - Always include restaurantId in WHERE clauses for tenant-scoped queries
 * - Log security events when restaurantId mismatch is detected
 */
