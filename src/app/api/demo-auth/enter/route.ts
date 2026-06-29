import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const COOKIE = "mesita-demo-mode";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Sets demo session cookie and returns success (client redirects to panel). */
export async function POST(): Promise<Response> {
  const res = NextResponse.json({ success: true, redirect: "/dashboard/owner/panel" });
  res.cookies.set(COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
