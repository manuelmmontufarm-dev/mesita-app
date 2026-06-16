import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Dev-only: creates a real NextAuth JWT session and redirects straight to the dashboard.
// Fail closed: requires BOTH an explicit opt-in (ENABLE_DEV_LOGIN=true) AND a
// development runtime. If NODE_ENV is unset or anything other than
// "development", the route refuses to run.
export async function GET() {
  if (
    process.env.ENABLE_DEV_LOGIN !== "true" ||
    process.env.NODE_ENV !== "development"
  ) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { email: "owner@lafloresta.ec" },
    select: { id: true, email: true, name: true, role: true, restaurantId: true },
  });

  if (!user) redirect("/login");

  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

  const token = await encode({
    token: {
      sub: user!.id,
      id: user!.id,
      email: user!.email,
      name: user!.name,
      role: user!.role,
      restaurantId: user!.restaurantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    },
    secret,
    salt: "authjs.session-token",
    maxAge: 24 * 60 * 60,
  });

  const jar = await cookies();
  jar.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });

  redirect("/dashboard/owner/panel");
}
