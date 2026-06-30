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

const FETCH_TIMEOUT_MS = 45_000;

// Contífico document type for open prefacturas
const DOC_TYPE_PRE = "PRE";

// Sentinel cédula commonly used for Consumidor Final in Ecuador
const CONSUMIDOR_FINAL_ID = "9999999999";

interface ContificoDocumento {
  id: string;
  tipo_documento: string;
  estado?: string;
  [key: string]: unknown;   // table field is configurable
  detalles: ContificoDetalle[];
  subtotal: number | string;        // base sin IVA (API field name)
  iva: number | string;
  servicio: number | string;        // propina / service charge (API field name)
  total: number | string;
}

interface ContificoDetalle {
  id?: string;
  producto_id?: string;
  producto_nombre?: string;         // primary name field in Contífico API
  nombre_manual?: string | null;    // override name when set manually
  descripcion?: string | null;      // per-line note (often null)
  cantidad: number | string;
  precio: number | string;
}

interface ContificoPersona {
  id?: string;
  tipo_identificacion?: string;
  identificacion?: string;
  email?: string;
  razon_social?: string;
  [key: string]: unknown;
}

// Network/timeout errors may contain the original URL or headers — never return them verbatim.
// HTTP errors from the server side are safe to surface (they come from POS, not from us).
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

function toNumber(val: number | string | undefined): number {
  return typeof val === "number" ? val : parseFloat(String(val ?? "0")) || 0;
}

function isUsableGuestData(g: POSGuestData | undefined): g is POSGuestData {
  if (!g) return false;
  if (g.tipo === "CONSUMIDOR_FINAL") return false;
  if (!g.identificacion || g.identificacion === CONSUMIDOR_FINAL_ID) return false;
  if (!g.email) return false;
  return true;
}

export class ContificoAdapter implements PosPort {
  private readonly config: PosConfig;

  constructor(config: PosConfig) {
    this.config = config;
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
    // v2 API: /documento/ (confirmed working 2026-06-02)
    const url = `${this.config.baseUrl}/documento/?tipo_documento=${DOC_TYPE_PRE}`;
    let data: unknown;
    try {
      const resp = await fetchWithTimeout(url, {
        headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        throw new Error(`Contífico returned HTTP ${resp.status}`);
      }
      data = await resp.json();
    } catch (err) {
      throw new Error(`POS pullOrders failed: ${sanitizeNetworkError(err)}`);
    }

    const docs: ContificoDocumento[] = Array.isArray(data) ? data : (data as any)?.results ?? [];
    const orders: POSPulledOrder[] = [];

    for (const doc of docs) {
      // Tolerate missing table field — caller skips+logs (D-05)
      const posTableId = String((doc as any)[this.config.tableField] ?? "");

      const items: POSPulledOrderItem[] = (doc.detalles ?? []).map((d) => ({
        externalId: d.producto_id ?? d.id,
        name: d.nombre_manual ?? d.producto_nombre ?? d.descripcion ?? "",
        quantity: toNumber(d.cantidad),
        unitPrice: toNumber(d.precio),
      }));

      // posToken is the Contífico `pos` UUID — required when registering cobros.
      // Documents created manually (not via POS desktop) have pos=null; cobro will fail for those.
      const posToken = typeof (doc as any).pos === "string" ? (doc as any).pos : null;

      orders.push({
        posDocumentId: String(doc.id),
        posTableId,
        posToken,
        items,
        subtotal: toNumber(doc.subtotal),
        iva: toNumber(doc.iva),
        propina: toNumber(doc.servicio),
        total: toNumber(doc.total),
        currency: "USD",
        // P = Pendiente (open), C = Cobrado (fully paid), F = Facturado (invoice issued), A = Anulado
        // C, F, A all mean the document no longer accepts cobros.
        isClosedInPos: doc.estado === "C" || doc.estado === "F" || doc.estado === "A",
      });
    }

    return orders;
  }

  /**
   * Records a partial cobro and (when applicable) updates the document's cliente before the cobro
   * so Contífico issues the SRI factura to the right guest. Never throws on POS error (D-10).
   *
   * Option B semantics: called ONCE per card transaction with the PARTIAL split amount.
   * Contífico converts PRE → FAC automatically when the sum of cobros equals the document total.
   */
  async confirmPayment(params: POSConfirmPaymentParams): Promise<POSConfirmPaymentResult> {
    // Best-effort PUT documento with resolved cliente_id (Gap #2) — failure logs + continues.
    if (isUsableGuestData(params.guestData)) {
      try {
        const clienteId = await this.findOrCreateCliente(params.guestData);
        if (clienteId) {
          await this.attachClienteToDocumento(params.posDocumentId, clienteId);
        }
      } catch (err) {
        // Never propagate — fall through to the cobro with the original cliente on the document.
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

    // Cobro: POST /documento/{id}/cobro/ (v2 API, confirmed 2026-06-02)
    // Body structure varies by forma_cobro:
    //   EF (efectivo): { forma_cobro, monto, fecha, descripcion, pos }
    //   TC (tarjeta):  { forma_cobro, monto, fecha, tipo_ping, lote, pos }
    // `pos` is the UUID from the original document — required, null = cobro will be rejected.
    const today = new Date().toLocaleDateString("es-EC", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
    });
    const isCard = this.config.paymentMethod === "TC";
    const cobroBody: Record<string, unknown> = {
      forma_cobro: this.config.paymentMethod,
      monto: params.amount,
      fecha: today,
      pos: params.posToken,
    };
    if (isCard) {
      cobroBody.tipo_ping = this.config.tipoPing ?? "D"; // "D" = Datafast; Diners TBD
      cobroBody.lote = params.paymentReference;          // provider transaction ID
    } else {
      cobroBody.descripcion = params.paymentReference;
    }

    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(params.posDocumentId)}/cobro/`;
    try {
      const resp = await fetchWithTimeout(url, {
        method: "POST",
        headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(cobroBody),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        // 409 = already paid/factured in POS → treat as success (idempotent, D-10)
        if (resp.status === 409) {
          return { success: true };
        }
        return { success: false, errorMessage: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
      }

      const result: any = await resp.json().catch(() => ({}));
      return {
        success: true,
        posFacturaId: result?.id ? String(result.id) : undefined,
      };
    } catch (err) {
      return { success: false, errorMessage: sanitizeNetworkError(err) };
    }
  }

  /**
   * Freshness pre-check (Gap #3) — read-only against Contífico.
   * 404 → not found (treat as removed/closed-on-POS).
   * 200 → returns the document's POS-side estado mapped to isClosedInPos.
   * Transport errors → throw sanitized so the caller can fail-open.
   */
  async getOrderStatus(posDocumentId: string): Promise<POSOrderStatus> {
    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(posDocumentId)}/`;
    let resp: Response;
    try {
      resp = await fetchWithTimeout(url, {
        headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
      });
    } catch (err) {
      throw new Error(`POS getOrderStatus failed: ${sanitizeNetworkError(err)}`);
    }

    if (resp.status === 404) {
      return { exists: false, isClosedInPos: false };
    }
    if (!resp.ok) {
      throw new Error(`POS getOrderStatus failed: HTTP ${resp.status}`);
    }

    const doc: any = await resp.json().catch(() => ({}));
    const estado = typeof doc?.estado === "string" ? doc.estado : "";
    return {
      exists: true,
      // C = Cobrado (fully paid), F = Facturado, A = Anulado — none accept more cobros
      // P = Pendiente (open, may still have partial cobros)
      isClosedInPos: estado === "C" || estado === "F" || estado === "A",
    };
  }

  /**
   * Look up an existing cliente by identification; if absent, create one.
   * Returns the cliente_id or null if the lookup/create cannot be completed.
   *
   * Returns null (without throwing) when:
   *  - guestData is missing or CONSUMIDOR_FINAL (caller should not invoke this in that case)
   *  - the network call fails — log + degrade gracefully (D-10)
   */
  private async findOrCreateCliente(guestData: POSGuestData): Promise<string | null> {
    if (!isUsableGuestData(guestData)) return null;

    // 1) Look up by identification
    try {
      const lookupUrl = `${this.config.baseUrl}/persona/?identificacion=${encodeURIComponent(
        guestData.identificacion
      )}`;
      const resp = await fetchWithTimeout(lookupUrl, {
        headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
      });
      if (resp.ok) {
        const body: any = await resp.json().catch(() => null);
        const list: ContificoPersona[] = Array.isArray(body) ? body : body?.results ?? [];
        const existing = list.find((p) => p?.id);
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

    // 2) Create persona
    try {
      const createResp = await fetchWithTimeout(`${this.config.baseUrl}/persona/`, {
        method: "POST",
        headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "N", // natural person — Contífico shorthand
          tipo_identificacion: guestData.tipo, // CEDULA | RUC | PASAPORTE
          identificacion: guestData.identificacion,
          razon_social: guestData.nombre ?? guestData.email,
          email: guestData.email,
          es_cliente: true,
        }),
      });
      if (!createResp.ok) {
        return null;
      }
      const created: any = await createResp.json().catch(() => ({}));
      return created?.id ? String(created.id) : null;
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
   * Update the documento with the resolved cliente_id before the cobro. Best-effort.
   * Throws (sanitized) only on transport failure so the caller can log + continue.
   */
  private async attachClienteToDocumento(posDocumentId: string, clienteId: string): Promise<void> {
    const url = `${this.config.baseUrl}/documento/${encodeURIComponent(posDocumentId)}/`;
    const resp = await fetchWithTimeout(url, {
      method: "PUT",
      headers: { AUTHORIZATION: this.config.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    if (!resp.ok) {
      // 400/409 — Contífico rejected the swap (e.g. document already factured). Treat as soft failure.
      const body = await resp.text().catch(() => "");
      throw new Error(`PUT /documento/ failed: HTTP ${resp.status}: ${body.slice(0, 200)}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const resp = await fetchWithTimeout(`${this.config.baseUrl}/documento/?limit=1`, {
        headers: { AUTHORIZATION: this.config.apiKey },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
