import type {
  PosPort,
  PosCapabilities,
  POSPulledOrder,
  POSPulledOrderItem,
  POSConfirmPaymentParams,
  POSConfirmPaymentResult,
  POSGuestData,
  POSOrderStatus,
} from "../domain/pos.port";
import type { PosConfig } from "./pos-config";
import {
  parseDocumentoList,
  parseDocumento,
  parseCobroList,
  parsePersonaList,
  matchPersonaByIdentificacion,
  filterOpenPre,
  isClosedEstado,
  wireAmountToCents,
  centsToWireAmount,
  zCobroCreateBody,
  zPersonaCreateBody,
  type ContificoDocumentoWire,
} from "../contract/contifico-v2.schema";
import { deriveNumeroComprobante } from "../contract/payment-reference";
import { parseTableMappingValue, resolveTableMappings } from "../contract/table-mapping";

/**
 * ONE Contífico v2 adapter for BOTH the real service and the Mesita POS
 * simulator façade. The only thing that may differ between the two is
 * configuration (base URL + API key). No code path in here may identify the
 * simulator by URL or change payload semantics for it — the frozen contract
 * (contracts/contifico-v2/README.md) is the single source of truth.
 */

const FETCH_TIMEOUT_MS = 45_000;
const LIST_PAGE_SIZE = 100;

// Sentinel cédula commonly used for Consumidor Final in Ecuador
const CONSUMIDOR_FINAL_ID = "9999999999";

// Network/timeout errors may contain the original URL or headers — never return them verbatim.
function sanitizeNetworkError(_err: unknown): string {
  return "POS connection error";
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Wire money → number for the PosPort (exact cents under the hood). */
function toAmount(value: unknown): number {
  const cents = wireAmountToCents(value);
  return cents === null ? 0 : centsToWireAmount(cents);
}

function isUsableGuestData(g: POSGuestData | undefined): g is POSGuestData {
  if (!g) return false;
  if (g.tipo === "CONSUMIDOR_FINAL") return false;
  if (!g.identificacion || g.identificacion === CONSUMIDOR_FINAL_ID) return false;
  if (!g.email) return false;
  return true;
}

function todayEC(): string {
  return new Date().toLocaleDateString("es-EC", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
  });
}

export class ContificoAdapter implements PosPort {
  private readonly config: PosConfig;

  constructor(config: PosConfig) {
    this.config = config;
  }

  private headers(): Record<string, string> {
    // Contract O1: RAW key as the full Authorization value — no "Token " prefix.
    return { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" };
  }

  capabilities(): PosCapabilities {
    return {
      supportsWebhooks: false,
      supportsPolling: true,
      supportsPartialPayments: true, // Option B: N partial cobros per Bill
      supportsCloseBill: false,
      supportsMenuSync: false,
    };
  }

  async pullOrders(): Promise<POSPulledOrder[]> {
    // Contract O2: documented query is tipo= (+ result_size/result_page).
    const url = `${this.config.baseUrl}/documento/?tipo=PRE&result_size=${LIST_PAGE_SIZE}&result_page=1`;
    let data: unknown;
    try {
      const resp = await fetchWithTimeout(url, { headers: this.headers() });
      if (!resp.ok) {
        throw new Error(`Contífico returned HTTP ${resp.status}`);
      }
      data = await resp.json();
    } catch (err) {
      throw new Error(`POS pullOrders failed: ${sanitizeNetworkError(err)}`);
    }

    // Envelope-tolerant parse (array | {count, results}) + per-row validation.
    const parsed = parseDocumentoList(data);
    if (parsed.rejected > 0) {
      console.warn(
        JSON.stringify({
          event: "POS_LIST_ROWS_REJECTED",
          rejected: parsed.rejected,
          ts: new Date().toISOString(),
        })
      );
    }

    // Contract O2: filter defensively to open PRE (estado P/E) even though the
    // query already asked for tipo=PRE — upstream honoring it is UNVERIFIED.
    // Closed docs are still returned to the caller (isClosedInPos: true) so
    // ingestion can close local bills; only non-PRE rows are dropped here.
    const preDocs = parsed.items.filter((d) => d.tipo_documento === "PRE");
    const openDocs = filterOpenPre(parsed.items);

    // Table mapping: parse MESITA_TABLE:<posExternalId> from the configured
    // field. Ambiguous duplicates (two OPEN docs claiming one table) are
    // blanked — the caller skips + logs them, never guesses (frozen rule).
    const mappingResolution = resolveTableMappings(
      openDocs.map((d) => ({
        id: d.id,
        mappingValue: (d as Record<string, unknown>)[this.config.tableField],
      }))
    );
    if (mappingResolution.ambiguous.size > 0) {
      console.warn(
        JSON.stringify({
          event: "POS_TABLE_MAPPING_AMBIGUOUS",
          conflicts: [...mappingResolution.ambiguous.entries()].map(([extId, docIds]) => ({
            posExternalId: extId,
            documentIds: docIds,
          })),
          ts: new Date().toISOString(),
        })
      );
    }
    const docIdToExternalId = new Map<string, string>();
    for (const [externalId, docId] of mappingResolution.mapped) {
      docIdToExternalId.set(docId, externalId);
    }

    return preDocs.map((doc) => this.toPulledOrder(doc, docIdToExternalId));
  }

  private toPulledOrder(
    doc: ContificoDocumentoWire,
    docIdToExternalId: Map<string, string>
  ): POSPulledOrder {
    const items: POSPulledOrderItem[] = (doc.detalles ?? []).map((d) => ({
      externalId: d.producto_id ?? d.id ?? undefined,
      // producto_nombre is sandbox-OBSERVED (not in the OpenAPI GET table)
      name: d.nombre_manual ?? d.producto_nombre ?? d.descripcion ?? "",
      quantity: toAmount(d.cantidad),
      unitPrice: toAmount(d.precio),
    }));

    // Closed docs are not in the open-mapping set; parse their field directly
    // (single-doc parse — ambiguity only matters across OPEN documents).
    const posTableId =
      docIdToExternalId.get(doc.id) ??
      (isClosedEstado(doc.estado)
        ? parseTableMappingValue((doc as Record<string, unknown>)[this.config.tableField]) ?? ""
        : "");

    return {
      posDocumentId: String(doc.id),
      posTableId,
      posToken: typeof doc.pos === "string" ? doc.pos : null,
      items,
      // Wire name subtotal_12 holds the taxed base even at 15% IVA (contract O4).
      subtotal: toAmount(doc.subtotal_12),
      iva: toAmount(doc.iva),
      propina: toAmount(doc.servicio),
      total: toAmount(doc.total),
      currency: "USD",
      // Contract O4/O8: open = P/E; closed = C/G/A/F (G:pagado + E:generado
      // were missing from the pre-relay adapter).
      isClosedInPos: isClosedEstado(doc.estado),
    };
  }

  /**
   * Records ONE partial cobro for THIS split (Option B). Never throws on POS
   * error (D-10).
   *
   * Contract O7:
   * - Body carries ONLY documented params; the Mesita reference travels in
   *   numero_comprobante (15 chars, derived from paymentReference). The old
   *   UUID-into-`lote` is gone (violated varchar(16) + undocumented param).
   * - 201 is the ONLY direct success. ANY other outcome (409 included, and
   *   network errors where the POST may have landed) goes through
   *   reconciliation: list the document's cobros and treat as registered ONLY
   *   if our numero_comprobante is present.
   */
  async confirmPayment(params: POSConfirmPaymentParams): Promise<POSConfirmPaymentResult> {
    // Optional cliente attach (SRI $50 rule) — config-gated, best-effort,
    // UNVERIFIED against the real sandbox (contract O5/O6).
    if (this.config.attachClienteEnabled && isUsableGuestData(params.guestData)) {
      try {
        const clienteId = await this.findOrCreateCliente(params.guestData, params.posToken);
        if (clienteId) {
          await this.attachClienteToDocumento(params.posDocumentId, params.guestData);
        }
      } catch (err) {
        // Never propagate — the cobro proceeds with the document's original cliente.
        console.error(
          JSON.stringify({
            event: "POS_DOC_CLIENTE_UPDATE_FAILED",
            severity: "HIGH",
            posDocumentId: params.posDocumentId,
            error: sanitizeNetworkError(err),
            ts: new Date().toISOString(),
          })
        );
      }
    }

    const numeroComprobante = deriveNumeroComprobante(params.paymentReference);
    const isCard = this.config.paymentMethod === "TC";
    const amountCents = wireAmountToCents(params.amount);
    if (amountCents === null || amountCents <= 0) {
      return { success: false, errorMessage: "Invalid cobro amount" };
    }

    const cobroBody = {
      forma_cobro: this.config.paymentMethod,
      monto: centsToWireAmount(amountCents),
      fecha: todayEC(),
      numero_comprobante: numeroComprobante,
      ...(isCard ? { tipo_ping: (this.config.tipoPing ?? "D") as "D" } : {}),
    };

    // Self-check against the frozen contract before anything hits the wire.
    const validation = zCobroCreateBody.safeParse(cobroBody);
    if (!validation.success) {
      return {
        success: false,
        errorMessage: `Cobro body violates frozen contract: ${validation.error.issues
          .map((i) => i.message)
          .join("; ")}`,
      };
    }

    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(params.posDocumentId)}/cobro/`;
    let failureDetail: string;
    try {
      const resp = await fetchWithTimeout(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(validation.data),
      });

      if (resp.status === 201) {
        const result: unknown = await resp.json().catch(() => ({}));
        const id = (result as { id?: unknown })?.id;
        return { success: true, posFacturaId: id != null ? String(id) : undefined };
      }
      const body = await resp.text().catch(() => "");
      failureDetail = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
    } catch (err) {
      // Timeout/network — the POST may or may not have landed upstream.
      failureDetail = sanitizeNetworkError(err);
    }

    // Reconciliation read (contract O7): undocumented statuses and ambiguous
    // network outcomes are success ONLY if our reference is on the document.
    const reconciled = await this.cobroExists(params.posDocumentId, numeroComprobante);
    if (reconciled === true) {
      return { success: true };
    }
    return {
      success: false,
      errorMessage:
        reconciled === false
          ? `Cobro not registered (${failureDetail}); reconciliation found no matching numero_comprobante`
          : `Cobro outcome unknown (${failureDetail}); reconciliation read failed — will retry`,
    };
  }

  /**
   * Reconciliation primitive: does a cobro with this numero_comprobante exist?
   * Returns null when the read itself failed (outcome unknown).
   */
  private async cobroExists(
    posDocumentId: string,
    numeroComprobante: string
  ): Promise<boolean | null> {
    try {
      const url = `${this.config.baseUrl}/documento/${encodeURIComponent(posDocumentId)}/cobro/`;
      const resp = await fetchWithTimeout(url, { headers: this.headers() });
      if (!resp.ok) return null;
      const data: unknown = await resp.json().catch(() => null);
      const { items } = parseCobroList(data);
      return items.some((c) => c.numero_comprobante === numeroComprobante);
    } catch {
      return null;
    }
  }

  /**
   * Freshness pre-check (Gap #3) — read-only.
   * Contract O3: GET /documento/{id}/ is UNDOCUMENTED-OBSERVED (sandbox
   * 2026-06-02). 404 → gone; estado C/G/A/F → closed.
   */
  async getOrderStatus(posDocumentId: string): Promise<POSOrderStatus> {
    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(posDocumentId)}/`;
    let resp: Response;
    try {
      resp = await fetchWithTimeout(url, { headers: this.headers() });
    } catch (err) {
      throw new Error(`POS getOrderStatus failed: ${sanitizeNetworkError(err)}`);
    }

    if (resp.status === 404) {
      return { exists: false, isClosedInPos: false };
    }
    if (!resp.ok) {
      throw new Error(`POS getOrderStatus failed: HTTP ${resp.status}`);
    }

    const doc = parseDocumento(await resp.json().catch(() => null));
    if (!doc) {
      throw new Error("POS getOrderStatus failed: unparseable document");
    }
    return { exists: true, isClosedInPos: isClosedEstado(doc.estado) };
  }

  /**
   * Contract O5. Lookup via the documented ?search= param (the old
   * ?identificacion= was undocumented) with client-side exact matching.
   * Create via POST /persona/?pos=<token> with the documented body —
   * config-gated + UNVERIFIED; returns null on any failure (graceful degrade).
   */
  private async findOrCreateCliente(
    guestData: POSGuestData,
    posToken: string | null
  ): Promise<string | null> {
    if (!isUsableGuestData(guestData)) return null;

    try {
      const lookupUrl = `${this.config.baseUrl}/persona/?search=${encodeURIComponent(
        guestData.identificacion
      )}`;
      const resp = await fetchWithTimeout(lookupUrl, { headers: this.headers() });
      if (resp.ok) {
        const { items } = parsePersonaList(await resp.json().catch(() => null));
        const existing = matchPersonaByIdentificacion(items, guestData.identificacion);
        if (existing?.id) return String(existing.id);
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "POS_PERSONA_LOOKUP_FAILED",
          severity: "HIGH",
          error: sanitizeNetworkError(err),
          ts: new Date().toISOString(),
        })
      );
      return null;
    }

    // Create — documented body (cedula/ruc + role booleans), ?pos= required.
    if (!posToken) return null;
    const isRuc = /^\d{13}$/.test(guestData.identificacion);
    const personaBody = {
      tipo: "N" as const,
      ...(isRuc
        ? { ruc: guestData.identificacion }
        : { cedula: guestData.identificacion.slice(0, 10) }),
      razon_social: (guestData.nombre ?? guestData.email).slice(0, 300),
      email: guestData.email.slice(0, 50),
      es_cliente: true,
      es_proveedor: false,
    };
    const bodyCheck = zPersonaCreateBody.safeParse(personaBody);
    if (!bodyCheck.success) return null;

    try {
      const createResp = await fetchWithTimeout(
        `${this.config.baseUrl}/persona/?pos=${encodeURIComponent(posToken)}`,
        {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(bodyCheck.data),
        }
      );
      if (!createResp.ok) return null;
      const created: unknown = await createResp.json().catch(() => ({}));
      const id = (created as { id?: unknown })?.id;
      return id != null ? String(id) : null;
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "POS_PERSONA_CREATE_FAILED",
          severity: "HIGH",
          error: sanitizeNetworkError(err),
          ts: new Date().toISOString(),
        })
      );
      return null;
    }
  }

  /**
   * Contract O6: partial cliente update — UNVERIFIED against the real API
   * (the documented PUT wants the full document). Config-gated; best-effort.
   * Throws (sanitized) on transport failure so the caller can log + continue.
   */
  private async attachClienteToDocumento(
    posDocumentId: string,
    guestData: POSGuestData
  ): Promise<void> {
    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(posDocumentId)}/`;
    const isRuc = /^\d{13}$/.test(guestData.identificacion);
    const resp = await fetchWithTimeout(url, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({
        cliente: {
          ...(isRuc
            ? { ruc: guestData.identificacion }
            : { cedula: guestData.identificacion.slice(0, 10) }),
          razon_social: (guestData.nombre ?? guestData.email).slice(0, 300),
          tipo: "N",
          email: guestData.email.slice(0, 50),
        },
      }),
    });
    if (!resp.ok && resp.status !== 201) {
      const body = await resp.text().catch(() => "");
      throw new Error(`PUT /documento/ failed: HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Documented list params only (the old ?limit=1 was undocumented).
      const resp = await fetchWithTimeout(
        `${this.config.baseUrl}/documento/?tipo=PRE&result_size=1&result_page=1`,
        { headers: { AUTHORIZATION: this.config.apiKey } }
      );
      return resp.ok;
    } catch {
      return false;
    }
  }
}
