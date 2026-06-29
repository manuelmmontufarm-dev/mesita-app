/**
 * Client for POS Mesita Demo API (Railway).
 * https://pos-mesita-demo-production.up.railway.app/sistema/api/v1/docs
 */

const DEFAULT_BASE =
  "https://pos-mesita-demo-production.up.railway.app/sistema/api/v1";

export interface PosMesitaDocumento {
  id: string;
  tipo_documento: string;
  estado: string;
  descripcion: string | null;
  total: number;
  iva: number;
  servicio: number;
  fecha_emision: string;
  cobros: Array<{
    id: string;
    forma_cobro: string;
    monto: number;
    referencia: string | null;
    procesador: string | null;
    detalle: string | null;
    created_at: string;
  }>;
  orden?: {
    mesa?: { id: string; nombre: string } | null;
  } | null;
  created_at: string;
}

function baseUrl(): string {
  return (process.env.POS_MESITA_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

function apiKey(): string | null {
  return process.env.POS_MESITA_API_KEY ?? null;
}

export function isPosMesitaConfigured(): boolean {
  return Boolean(apiKey());
}

async function posFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("POS_MESITA_API_KEY not configured");

  const headers: Record<string, string> = {
    Authorization: `Token ${key}`,
    Accept: "application/json",
    ...(init?.json ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string>) },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POS Mesita ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export async function checkPosMesitaHealth(): Promise<{
  ok: boolean;
  baseUrl: string;
  configured: boolean;
  error?: string;
}> {
  const configured = isPosMesitaConfigured();
  if (!configured) {
    return { ok: false, baseUrl: baseUrl(), configured: false, error: "API key no configurada" };
  }
  try {
    await posFetch<{ count: number }>("/documento/?result_size=1");
    return { ok: true, baseUrl: baseUrl(), configured: true };
  } catch (e) {
    return {
      ok: false,
      baseUrl: baseUrl(),
      configured: true,
      error: e instanceof Error ? e.message : "Error de conexión",
    };
  }
}

export async function listPosDocumentos(limit = 30): Promise<PosMesitaDocumento[]> {
  const data = await posFetch<{ count: number; results: PosMesitaDocumento[] }>(
    `/documento/?result_size=${limit}`,
  );
  return data.results ?? [];
}

function todayEc(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

/** Registra un pago del app como FAC + cobro en el POS Mesita. */
export async function registerPaymentInPosMesita(input: {
  tableName: string;
  guestName: string;
  amount: number;
  ref: string;
  method?: string;
}): Promise<{ ok: boolean; documentoId?: string; error?: string }> {
  if (!isPosMesitaConfigured()) {
    return { ok: false, error: "POS_MESITA_API_KEY not configured" };
  }

  try {
    const subtotal15 = Math.round((input.amount / 1.15) * 100) / 100;
    const iva = Math.round((input.amount - subtotal15) * 100) / 100;

    const doc = await posFetch<PosMesitaDocumento>("/documento/", {
      method: "POST",
      json: {
        tipo_documento: "FAC",
        fecha_emision: todayEc(),
        descripcion: `Pago MesitaQR — ${input.tableName} — ${input.guestName}`,
        subtotal_15: subtotal15,
        iva,
        total: input.amount,
        cobros: [
          {
            forma_cobro: input.method === "EF" ? "EF" : "TC",
            monto: input.amount,
            referencia: `MESITAQR:${input.ref}`,
            procesador: "MesitaQR",
            detalle: input.guestName,
          },
        ],
      },
    });

    return { ok: true, documentoId: doc.id };
  } catch (e) {
    console.error("[pos-mesita] register payment failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Error" };
  }
}

export function cobroViaMesita(
  cobro: PosMesitaDocumento["cobros"][number],
): boolean {
  const ref = cobro.referencia ?? "";
  const proc = cobro.procesador ?? "";
  return (
    ref.startsWith("MESITAQR:") ||
    ref.startsWith("MQR-") ||
    proc.toLowerCase().includes("mesita")
  );
}
