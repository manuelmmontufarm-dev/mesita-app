import { cookies } from "next/headers";
import { successResponse } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/** Indica si la sesión actual es modo demo (cookie httpOnly). */
export async function GET(): Promise<Response> {
  const jar = await cookies();
  const demoMode = jar.get("mesita-demo-mode")?.value === "1";
  return successResponse({ demoMode }, 200);
}
