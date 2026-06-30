import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_secret";
const MAX_AGE_SEC = 24 * 60 * 60;

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/admin/session — validate ADMIN_SECRET and set httpOnly cookie.
 * Body: { secret: string }
 */
export async function POST(request: Request): Promise<Response> {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { success: false, error: "Admin access is not configured" },
      { status: 503 }
    );
  }

  let secret: string;
  try {
    const body = await request.json();
    secret = typeof body.secret === "string" ? body.secret : "";
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }

  if (!secret || !secretsMatch(secret, adminSecret)) {
    return NextResponse.json(
      { success: false, error: "Invalid admin secret" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: adminSecret,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });

  return response;
}

/** DELETE /api/admin/session — clear admin cookie (logout). */
export async function DELETE(): Promise<Response> {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
