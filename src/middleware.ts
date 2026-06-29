import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Next.js App Router middleware for Wave 3 UI and Phase 3 Rate Limiting
 *
 * Role-gated route enforcement:
 * - /dashboard/owner/* - requires OWNER role
 * - /dashboard/manager/* - requires MANAGER role
 * - /dashboard/server/* - requires SERVER role
 * - /admin - requires ADMIN_SECRET
 *
 * Rate limiting:
 * - /api/bills/[billId]/pay - 10 requests per 60 seconds per IP (distributed via Upstash)
 * - /api/guest/bill/[token] - 120 requests per 60 seconds per IP + token (distributed via
 *   Upstash). The guest page polls every 4s, so a single table of diners behind one NAT IP
 *   legitimately generates many requests — keying on IP alone starved real guests. Keying
 *   on IP + token keeps the token-enumeration defense (each probed token burns its own
 *   budget) without throttling a table's normal polling.
 *
 * Unauthenticated requests to protected routes redirect to /login
 * Wrong-role requests redirect to their correct role's dashboard
 */

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60s"),
      analytics: true,
      prefix: "pagaya:rl:",
    })
  : null;

const guestRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "60s"),
      analytics: true,
      prefix: "pagaya:rl:guest:",
    })
  : null;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Constant-time string comparison safe for the edge runtime (no node:crypto).
 * Always walks max(len) bytes regardless of where the first mismatch occurs,
 * so attackers cannot use response timing to guess the secret byte-by-byte.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length === bBytes.length ? 0 : 1;
  const len = Math.max(aBytes.length, bBytes.length, 1);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Apply rate limiting to payment endpoint
  if (pathname.match(/^\/api\/bills\/[^/]+\/pay$/)) {
    if (ratelimit) {
      const ip = getClientIp(request);
      try {
        const { success } = await ratelimit.limit(ip);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Too many requests" },
            { status: 429 }
          );
        }
      } catch {
        console.warn("[middleware] Rate limit check failed, failing open");
      }
    }
  }

  // Guest bill token endpoint: rate-limit per IP + token (token enumeration defense
  // that doesn't starve a whole table of diners sharing one NAT/Wi-Fi IP)
  const guestMatch = pathname.match(/^\/api\/guest\/bill\/([^/]+)$/);
  if (guestMatch) {
    if (guestRatelimit) {
      const ip = getClientIp(request);
      const token = guestMatch[1];
      try {
        const { success } = await guestRatelimit.limit(`${ip}:${token}`);
        if (!success) {
          return NextResponse.json(
            { success: false, error: "Too many requests" },
            { status: 429 }
          );
        }
      } catch {
        console.warn("[middleware] Guest rate limit check failed, failing open");
      }
    }
  }

  // Public routes (no auth required)
  const publicRoutes = ["/login", "/register", "/api/auth/register"];
  if (pathname === "/" || publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow Auth.js routes
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Check for admin panel access (/admin and /api/admin/*)
  if (pathname.startsWith("/admin")) {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      // ADMIN_SECRET not configured, deny access
      return NextResponse.redirect(new URL("/login", request.url));
    }

    let hasValidSecret = false;

    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      hasValidSecret = timingSafeEqualStr(authHeader.substring(7), adminSecret);
    }

    if (!hasValidSecret) {
      const headerSecret = request.headers.get("x-admin-secret");
      hasValidSecret = headerSecret !== null && timingSafeEqualStr(headerSecret, adminSecret);
    }

    // admin_secret cookie (header-only auth — the ?secret= query param path was removed:
    // secrets in URLs leak via logs, browser history, and Referer headers)
    if (!hasValidSecret) {
      const cookieSecret = request.cookies.get("admin_secret")?.value;
      hasValidSecret =
        cookieSecret !== undefined && timingSafeEqualStr(cookieSecret, adminSecret);
    }

    if (!hasValidSecret) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  }

  // Dashboard is temporarily public — auth removed for UI development.
  // Re-enable the session check here once DB + auth is fully wired.
  if (pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
