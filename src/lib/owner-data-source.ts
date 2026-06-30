/**
 * Resuelve si el panel del dueño debe leer datos demo (POS en vivo) o Prisma.
 */

let demoModeCache: boolean | null = null;

/** Deploy demo (mesitademo*.vercel.app) — siempre usa APIs demo/POS. */
export function isDemoDeploymentHost(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_PANEL === "1") return true;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host.includes("mesitademo") || host === "localhost" || host === "127.0.0.1";
  }
  const vercel = process.env.VERCEL_URL ?? "";
  return vercel.includes("mesitademo");
}

export async function isOwnerDemoMode(): Promise<boolean> {
  if (isDemoDeploymentHost()) return true;
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

export async function ownerDashboardEndpoint(): Promise<string> {
  return (await isOwnerDemoMode()) ? "/api/demo-dashboard" : "/api/dashboard";
}

export function resetOwnerDemoModeCache(): void {
  demoModeCache = null;
}

/** URL de pago guest para una mesa demo por token/id. */
export function demoTablePayUrl(token: string): string {
  const base =
    (typeof window !== "undefined" ? window.location.origin : "") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mesitademo-two.vercel.app";
  const root = base.replace(/\/+$/, "");
  if (token === "demo") return `${root}/pay/demo`;
  if (token.startsWith("demo-mesa-")) {
    return `${root}/pay/demo/${token.replace("demo-", "")}`;
  }
  return `${root}/pay/${token}`;
}
