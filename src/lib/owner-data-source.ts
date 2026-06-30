/**
 * Resuelve si el panel del dueño debe leer datos demo (POS en vivo) o Prisma.
 *
 * La cookie `mesita-demo-mode` es httpOnly, así que el cliente no puede leerla
 * directamente. Usamos GET /api/demo-auth/status o NEXT_PUBLIC_DEMO_PANEL=1.
 */

let demoModeCache: boolean | null = null;

export async function isOwnerDemoMode(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DEMO_PANEL === "1") return true;
  if (demoModeCache !== null) return demoModeCache;

  try {
    const res = await fetch("/api/demo-auth/status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      demoModeCache = false;
      return false;
    }
    const json = await res.json();
    demoModeCache = Boolean(json.data?.demoMode);
    return demoModeCache;
  } catch {
    demoModeCache = false;
    return false;
  }
}

/** Endpoint del panel/estadísticas según modo demo o producción. */
export async function ownerDashboardEndpoint(): Promise<string> {
  return (await isOwnerDemoMode()) ? "/api/demo-dashboard" : "/api/dashboard";
}

/** Invalida caché (p. ej. tras login demo). */
export function resetOwnerDemoModeCache(): void {
  demoModeCache = null;
}
