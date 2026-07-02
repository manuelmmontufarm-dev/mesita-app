import { z } from "zod";

/**
 * Frozen Contífico v2 wire contract — Mesita subset.
 * Authority: contracts/contifico-v2/README.md (OpenAPI snapshot 2026-07-01).
 *
 * Wire names (subtotal_12, adicional1, forma_cobro, …) are the law at this
 * boundary. Internal renames happen ONLY in the anti-corruption layer
 * (ContificoAdapter), never here.
 *
 * All parsers are defensive: money accepts number or numeric string and is
 * converted to integer cents; unknown fields pass through; malformed rows are
 * rejected individually (list parsing never throws on one bad row).
 */

// ---------------------------------------------------------------------------
// Money — decimal(8,2) wire values → integer cents. No float equality ever.
// ---------------------------------------------------------------------------

/** Max documented decimal(8,2): 8 integer digits + 2 decimals. */
export const MAX_WIRE_AMOUNT_CENTS = 99_999_999_99;

/**
 * Parse a Contífico money value (JSON number or numeric string) into integer
 * cents. Returns null for missing/malformed values — callers decide whether
 * that is fatal for the field in question.
 */
export function wireAmountToCents(value: unknown): number | null {
  let str: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Fixed 2-decimal wire domain — round half-up in cents.
    return Math.round(value * 100 + (value >= 0 ? 1e-7 : -1e-7));
  } else if (typeof value === "string") {
    str = value.trim();
  } else {
    return null;
  }
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  const [intPart, decPart = ""] = str.replace("-", "").split(".");
  const sign = str.startsWith("-") ? -1 : 1;
  const cents =
    parseInt(intPart, 10) * 100 +
    Math.round(parseFloat(`0.${decPart || "0"}`) * 100);
  return sign * cents;
}

/** Integer cents → wire decimal number with exactly 2 decimals of precision. */
export function centsToWireAmount(cents: number): number {
  return Math.round(cents) / 100;
}

const zWireMoney = z.union([z.number(), z.string()]);

// ---------------------------------------------------------------------------
// Estado machine
// ---------------------------------------------------------------------------

/** P pendiente, C cobrado, G pagado, A anulado, E generado, F facturado. */
export const DOCUMENT_ESTADOS = ["P", "C", "G", "A", "E", "F"] as const;
export type DocumentoEstado = (typeof DOCUMENT_ESTADOS)[number];

/** Open = still accepts cobros. G:pagado / E:generado were missing pre-relay. */
export function isOpenEstado(estado: string | null | undefined): boolean {
  return estado === "P" || estado === "E";
}
export function isClosedEstado(estado: string | null | undefined): boolean {
  return estado === "C" || estado === "G" || estado === "A" || estado === "F";
}

// ---------------------------------------------------------------------------
// Wire schemas (passthrough: tolerate additive upstream fields)
// ---------------------------------------------------------------------------

// Optional string fields tolerate null throughout: live responses (simulator
// confirmed; real API plausible) emit null rather than omitting the key, and
// a rejected row would silently drop a document from ingestion.
export const zContificoDetalle = z
  .object({
    id: z.string().nullable().optional(),
    producto_id: z.string().max(16).nullable().optional(),
    producto_nombre: z.string().nullable().optional(),
    nombre_manual: z.string().nullable().optional(),
    descripcion: z.string().nullable().optional(),
    cantidad: zWireMoney,
    precio: zWireMoney,
    porcentaje_iva: z.number().nullable().optional(),
  })
  .passthrough();

/**
 * Identifier-ish response fields tolerate number|string: the official POST
 * examples send `lote`/`numero_comprobante` as JSON numbers, so responses may
 * echo numbers. A dropped cobro row here would break O7 reconciliation and
 * cause a duplicate cobro — coerce instead of reject.
 */
const zWireRef = z
  .union([z.string(), z.number()])
  .transform((v) => String(v));

export const zContificoCobro = z
  .object({
    id: zWireRef.nullable().optional(),
    forma_cobro: z.string().max(10),
    monto: zWireMoney,
    fecha: z.string().nullable().optional(),
    tipo_ping: z.string().max(1).nullable().optional(),
    lote: zWireRef.nullable().optional(),
    numero_comprobante: zWireRef.nullable().optional(),
    monto_propina: zWireMoney.nullable().optional(),
  })
  .passthrough();

export const zContificoCliente = z
  .object({
    cedula: z.string().optional(),
    ruc: z.string().optional(),
    razon_social: z.string().optional(),
    tipo: z.string().optional(),
    email: z.string().optional(),
  })
  .passthrough();

export const zContificoDocumento = z
  .object({
    id: z.string().min(1),
    tipo_documento: z.string().max(3),
    estado: z.string().max(1).nullable().optional(),
    pos: z.string().nullable().optional(),
    documento: z.string().nullable().optional(),
    fecha_emision: z.string().nullable().optional(),
    descripcion: z.string().nullable().optional(),
    adicional1: z.string().nullable().optional(),
    adicional2: z.string().nullable().optional(),
    subtotal_0: zWireMoney.optional(),
    subtotal_12: zWireMoney.optional(), // wire name stays subtotal_12 at 15% IVA
    iva: zWireMoney.optional(),
    servicio: zWireMoney.optional(),
    total: zWireMoney,
    cliente: zContificoCliente.nullable().optional(),
    detalles: z.array(zContificoDetalle).optional(),
    cobros: z.array(zContificoCobro).optional(),
  })
  .passthrough();

export type ContificoDocumentoWire = z.infer<typeof zContificoDocumento>;
export type ContificoCobroWire = z.infer<typeof zContificoCobro>;

export const zContificoPersona = z
  .object({
    id: z.string().min(1),
    tipo: z.string().nullable().optional(),
    cedula: z.string().nullable().optional(),
    ruc: z.string().nullable().optional(),
    razon_social: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    es_cliente: z.boolean().nullable().optional(),
  })
  .passthrough();

export type ContificoPersonaWire = z.infer<typeof zContificoPersona>;

/**
 * Documented persona create body (POST /persona/?pos=<token>).
 * - strict: undocumented fields (tipo_identificacion/identificacion) rejected.
 * - at least one of es_cliente/es_proveedor must be true (OpenAPI NOTA).
 * - cedula is marked "Si" in the param table but the spec's own examples omit
 *   it for tipo I (sin id) / extranjero — we require identification for
 *   tipo N/J (Mesita only creates those) and leave I/P conditional. This
 *   interpretation is UNVERIFIED against the real sandbox.
 */
export const zPersonaCreateBody = z
  .object({
    tipo: z.enum(["N", "J", "I", "P"]),
    cedula: z.string().max(10).optional(),
    ruc: z.string().max(13).optional(),
    razon_social: z.string().min(1).max(300),
    email: z.string().max(50).optional(),
    es_cliente: z.boolean(),
    es_proveedor: z.boolean(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (!body.es_cliente && !body.es_proveedor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "at least one of es_cliente/es_proveedor must be true",
      });
    }
    if ((body.tipo === "N" || body.tipo === "J") && !body.cedula && !body.ruc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tipo N/J requires cedula or ruc",
      });
    }
  });

/** Exact-2-decimal check without float traps: value must be whole cents. */
function isWholeCents(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

/**
 * Documented cobro create body. `lote`/`descripcion` are not in the POST
 * param table and are never sent (the official tarjeta *example* does show
 * lote — treated as spec noise; numero_comprobante is our reference slot).
 * tipo_ping is required for TC (param table marks it "Si"; the efectivo
 * example omits it — interpreted as card-only, UNVERIFIED).
 */
export const zCobroCreateBody = z
  .object({
    forma_cobro: z.string().min(1).max(10),
    monto: z
      .number()
      .positive()
      .max(99_999_999.99)
      .refine(isWholeCents, "monto must have at most 2 decimals (whole cents)"),
    fecha: z
      .string()
      .regex(/^\d{2}\/\d{2}\/\d{4}$/, "fecha must be dd/mm/yyyy")
      .optional(),
    tipo_ping: z.enum(["D", "M", "E", "P", "A"]).optional(),
    numero_comprobante: z.string().min(1).max(15).optional(),
    numero_cheque: z.string().max(15).optional(),
    cuenta_bancaria_id: z.string().max(16).optional(),
  })
  .strict() // reject undocumented params (lote, descripcion, pos, …)
  .superRefine((body, ctx) => {
    if (body.forma_cobro === "TC" && !body.tipo_ping) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tipo_ping is required when forma_cobro is TC",
      });
    }
  });

export type CobroCreateBody = z.infer<typeof zCobroCreateBody>;

// ---------------------------------------------------------------------------
// Envelope-tolerant list parsing
// ---------------------------------------------------------------------------

export interface ParsedList<T> {
  items: T[];
  /** rows that failed schema validation — logged, never fatal */
  rejected: number;
  /** true when the response used the {count, results} envelope */
  enveloped: boolean;
}

function extractRows(data: unknown): { rows: unknown[]; enveloped: boolean } | null {
  if (Array.isArray(data)) return { rows: data, enveloped: false };
  if (data && typeof data === "object" && Array.isArray((data as { results?: unknown[] }).results)) {
    return { rows: (data as { results: unknown[] }).results, enveloped: true };
  }
  return null;
}

/**
 * Parse a documento list response. Envelope shape is UNVERIFIED upstream, so
 * both a bare array and {count, results} are accepted. Each row is validated
 * independently; bad rows are counted and skipped, never fatal.
 */
export function parseDocumentoList(data: unknown): ParsedList<ContificoDocumentoWire> {
  const extracted = extractRows(data);
  if (!extracted) return { items: [], rejected: 0, enveloped: false };
  const items: ContificoDocumentoWire[] = [];
  let rejected = 0;
  for (const row of extracted.rows) {
    const parsed = zContificoDocumento.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else rejected++;
  }
  return { items, rejected, enveloped: extracted.enveloped };
}

/**
 * Defensive PRE filter — applied even when the upstream query already asked
 * for tipo=PRE, because the upstream honoring the filter is UNVERIFIED.
 */
export function filterOpenPre(docs: ContificoDocumentoWire[]): ContificoDocumentoWire[] {
  return docs.filter((d) => d.tipo_documento === "PRE" && isOpenEstado(d.estado));
}

export function parseDocumento(data: unknown): ContificoDocumentoWire | null {
  const parsed = zContificoDocumento.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function parseCobroList(data: unknown): ParsedList<ContificoCobroWire> {
  const extracted = extractRows(data);
  if (!extracted) return { items: [], rejected: 0, enveloped: false };
  const items: ContificoCobroWire[] = [];
  let rejected = 0;
  for (const row of extracted.rows) {
    const parsed = zContificoCobro.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else rejected++;
  }
  return { items, rejected, enveloped: extracted.enveloped };
}

export function parsePersonaList(data: unknown): ParsedList<ContificoPersonaWire> {
  const extracted = extractRows(data);
  if (!extracted) return { items: [], rejected: 0, enveloped: false };
  const items: ContificoPersonaWire[] = [];
  let rejected = 0;
  for (const row of extracted.rows) {
    const parsed = zContificoPersona.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else rejected++;
  }
  return { items, rejected, enveloped: extracted.enveloped };
}

/**
 * Persona search (`?search=`) is fuzzy across razon_social/nombre_comercial/
 * cedula/ruc — exact-match the identification client-side.
 */
export function matchPersonaByIdentificacion(
  personas: ContificoPersonaWire[],
  identificacion: string
): ContificoPersonaWire | null {
  return (
    personas.find((p) => p.cedula === identificacion || p.ruc === identificacion) ?? null
  );
}
