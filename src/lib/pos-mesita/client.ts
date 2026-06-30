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
  subtotal_15?: number;
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
    id?: string;
    mesa?: { id: string; nombre: string } | null;
  } | null;
  created_at: string;
}

export interface PosMesitaProducto {
  id: string;
  nombre: string;
  precio: number;
}

export interface PosMesitaOrdenDetalle {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  productoId?: string | null;
  producto_id?: string | null;
}

export interface PosMesitaOrden {
  id: string;
  mesaId?: string;
  mesa_id?: string;
  estado: string;
  detalles?: PosMesitaOrdenDetalle[];
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

const POS_FETCH_TIMEOUT_MS = 12_000;

export interface PosMesaSession {
  mesa: {
    id: string;
    nombre: string;
    estado: string;
    capacidad?: number;
    ubicacion?: string;
  };
  orden: {
    id: string;
    estado: string;
    comensales: number;
    detalles: Array<{
      id: string;
      nombre: string;
      cantidad: number;
      precio: number;
      producto_id?: string | null;
    }>;
  } | null;
  documento: { id: string; total?: number; subtotal_15?: number; iva?: number; servicio?: number } | null;
  cobros: PosMesitaDocumento["cobros"];
  totales: { subtotal: number; iva: number; servicio: number; total: number };
  saldo: number;
  fully_paid: boolean;
}

export async function getPosMesaSession(mesaId: string): Promise<PosMesaSession> {
  return posFetch<PosMesaSession>(`/mesa/${encodeURIComponent(mesaId)}/session/`);
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POS_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      body: init?.json ? JSON.stringify(init.json) : init?.body,
      cache: "no-store",
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`POS Mesita timeout (${POS_FETCH_TIMEOUT_MS}ms): ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

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

export async function listPosDocumentosForOrden(
  ordenId: string,
): Promise<PosMesitaDocumento[]> {
  try {
    const data = await posFetch<{ results: PosMesitaDocumento[] }>(
      `/documento/?orden_id=${encodeURIComponent(ordenId)}&result_size=50`,
    );
    if (data.results?.length) return data.results;
  } catch {
    /* API may not filter — fallback below */
  }

  const docs = await listPosDocumentos({ limit: 80, page: 1 });
  return docs.filter((d) => {
    const oid =
      d.orden?.id ??
      (d as { orden_id?: string }).orden_id;
    return oid === ordenId;
  });
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

function normalizeOrdenDetalle(d: PosMesitaOrdenDetalle) {
  return {
    id: d.id,
    nombre: d.nombre,
    cantidad: typeof d.cantidad === "number" ? d.cantidad : Number(d.cantidad),
    precio: typeof d.precio === "number" ? d.precio : Number(d.precio),
    productoId: d.productoId ?? d.producto_id ?? null,
  };
}

export async function getPosOrden(ordenId: string): Promise<PosMesitaOrden> {
  const raw = await posFetch<PosMesitaOrden>(`/orden/${ordenId}/`);
  return {
    ...raw,
    detalles: (raw.detalles ?? []).map(normalizeOrdenDetalle),
  };
}

export async function findActivePosOrdenForMesa(
  mesaId: string,
): Promise<PosMesitaOrden | null> {
  const data = await posFetch<{ results: PosMesitaOrden[] }>(
    `/orden/?mesa_id=${encodeURIComponent(mesaId)}&estado=A&result_size=1`,
  );
  const orden = data.results?.[0];
  if (!orden) return null;
  return {
    ...orden,
    detalles: (orden.detalles ?? []).map(normalizeOrdenDetalle),
  };
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

/** Registra un pago del app en el POS Mesita (PRE/orden vinculada). */
export async function registerPaymentInPosMesita(input: {
  tableName: string;
  guestName: string;
  amount: number;
  ref: string;
  method?: string;
  items?: Array<{ name: string; qty: number; unitPrice: number }>;
  posMesaId?: string;
  posOrdenId?: string;
  posDocumentoId?: string;
  isDemoUx?: boolean;
  tableFullyPaid?: boolean;
}): Promise<{ ok: boolean; documentoId?: string; ordenId?: string; error?: string }> {
  const { registerPaymentInPosMesita: register } = await import("./sync");
  return register(input);
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
