// Prisma client singleton with tenant isolation support
// Tenant isolation is handled at the query level in API routes, not globally in middleware.
// This approach is more explicit and easier to debug in Phase 1.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Tenant Isolation Pattern for Phase 1
 *
 * In Phase 1, tenant isolation is enforced at the query level in API routes.
 * Every query that touches tenant-scoped models (User, Table, Category, MenuItem, Session)
 * must include a `where` clause that filters by `restaurantId` from the session.
 *
 * Example:
 *   const tables = await prisma.table.findMany({
 *     where: {
 *       restaurantId: session.user.restaurantId,
 *     },
 *   });
 *
 * CRITICAL: Never trust a client-provided restaurantId. Always extract it from session.
 *
 * Future (Phase 2+): Global Prisma middleware can be added here to auto-inject
 * restaurantId into all queries, reducing boilerplate.
 */
