/**
 * Client for POS Mesita Demo API (Railway).
 * https://pos-mesita-demo-production.up.railway.app/sistema/api/v1/docs
 */

const DEFAULT_BASE =
  "https://mesita-pos.vercel.app/sistema/api/v1";

export interface PosMesitaDetalle {
  id: string;
  producto_id: string | null;
  cantidad: number;
  precio: number;
  porcentaje_iva: number;
  porcentaje_descuento: number;
  base_cero: number;
  base_gravable: number;
  base_no_gravable: number;
}

export interface PosMesitaDocumento {
  id: string;
  tipo_documento: string;
  estado: string;
  descripcion: string | null;
  total: number;
  iva: number;
  servicio: number;
  fecha_emision: string;
  detalles?: PosMesitaDetalle[];
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

export interface PosMesitaProducto {
  id: string;
  nombre: string;
  precio: number;
}

function baseUrl(): string {
  return (process.env.POS_MESITA_API_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

/** Strip whitespace/quotes — common Vercel copy-paste mistakes. */
function normalizeApiKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key || null;
}

function apiKey(): string | null {
  return normalizeApiKey(process.env.POS_MESITA_API_KEY);
}

export function isPosMesitaConfigured(): boolean {
  return Boolean(apiKey());
}

export function posMesitaKeyFingerprint(): string | null {
  const key = apiKey();
  if (!key) return null;
  if (key.length <= 4) return "****";
  return `…${key.slice(-4)}`;
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
    if (res.status === 401) {
      throw new Error(
        `POS Mesita 401: credenciales inválidas. POS_MESITA_API_KEY debe coincidir con API_KEY en Vercel (proyecto Mesita-POS). ${text.slice(0, 120)}`,
      );
    }
    throw new Error(`POS Mesita ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

export async function checkPosMesitaHealth(): Promise<{
  ok: boolean;
  baseUrl: string;
  configured: boolean;
  keyFingerprint: string | null;
  error?: string;
}> {
  const configured = isPosMesitaConfigured();
  const fingerprint = posMesitaKeyFingerprint();
  if (!configured) {
    return {
      ok: false,
      baseUrl: baseUrl(),
      configured: false,
      keyFingerprint: null,
      error: "API key no configurada en Vercel (POS_MESITA_API_KEY)",
    };
  }
  try {
    await posFetch<{ count: number }>("/documento/?result_size=1");
    return { ok: true, baseUrl: baseUrl(), configured: true, keyFingerprint: fingerprint };
  } catch (e) {
    return {
      ok: false,
      baseUrl: baseUrl(),
      configured: true,
      keyFingerprint: fingerprint,
      error: e instanceof Error ? e.message : "Error de conexión",
    };
  }
}

export interface ListPosDocumentosOpts {
  limit?: number;
  fechaEmision?: string;
  page?: number;
}

export async function listPosDocumentos(
  opts: ListPosDocumentosOpts | number = 30,
): Promise<PosMesitaDocumento[]> {
  const limit = typeof opts === "number" ? opts : (opts.limit ?? 30);
  const page = typeof opts === "number" ? 1 : (opts.page ?? 1);
  const fecha =
    typeof opts === "number" ? undefined : opts.fechaEmision;

  const params = new URLSearchParams({
    result_size: String(limit),
    result_page: String(page),
  });
  if (fecha) params.set("fecha_emision", fecha);

  const data = await posFetch<{ count: number; results: PosMesitaDocumento[] }>(
    `/documento/?${params}`,
  );
  return data.results ?? [];
}

export async function getPosDocumento(id: string): Promise<PosMesitaDocumento> {
  return posFetch<PosMesitaDocumento>(`/documento/${id}/`);
}

export async function listPosProductos(): Promise<PosMesitaProducto[]> {
  const data = await posFetch<{ results: PosMesitaProducto[] }>(
    "/producto/?result_size=100",
  );
  return data.results ?? [];
}

export function todayEcPosDate(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

export function isoToPosDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return todayEcPosDate();
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

export function extractMesaName(doc: PosMesitaDocumento): string {
  if (doc.orden?.mesa?.nombre) return doc.orden.mesa.nombre;
  const match = doc.descripcion?.match(/Mesa\s+[\w-]+/i);
  return match?.[0] ?? "POS";
}

/** Registra un pago del app como FAC + cobro en el POS Mesita. */
export async function registerPaymentInPosMesita(input: {
  tableName: string;
  guestName: string;
  amount: number;
  ref: string;
  method?: string;
  items?: Array<{ name: string; qty: number; unitPrice: number }>;
}): Promise<{ ok: boolean; documentoId?: string; error?: string }> {
  if (!isPosMesitaConfigured()) {
    return { ok: false, error: "POS_MESITA_API_KEY not configured" };
  }

  try {
    const detalles =
      input.items && input.items.length > 0
        ? input.items.map((item) => {
            const line = Math.round(item.qty * item.unitPrice * 100) / 100;
            return {
              cantidad: item.qty,
              precio: item.unitPrice,
              porcentaje_iva: 15,
              base_gravable: line,
              base_cero: 0,
              base_no_gravable: 0,
            };
          })
        : undefined;

    const subtotalFromItems = detalles
      ? detalles.reduce((s, d) => s + d.cantidad * d.precio, 0)
      : input.amount / 1.15;
    const subtotal15 = Math.round(subtotalFromItems * 100) / 100;
    const iva = Math.round((input.amount - subtotal15) * 100) / 100;

    const doc = await posFetch<PosMesitaDocumento>("/documento/", {
      method: "POST",
      json: {
        tipo_documento: "FAC",
        fecha_emision: todayEcPosDate(),
        descripcion: `Pago MesitaQR — ${input.tableName} — ${input.guestName}`,
        subtotal_15: subtotal15,
        iva: iva > 0 ? iva : Math.round(subtotal15 * 0.15 * 100) / 100,
        total: input.amount,
        ...(detalles ? { detalles } : {}),
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
