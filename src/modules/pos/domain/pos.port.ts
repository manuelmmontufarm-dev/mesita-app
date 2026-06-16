// POS amounts are authoritative (D-07) — mirror verbatim, do not recompute.
// confirmPayment is best-effort (D-10) — never throw on POS error.

export interface POSPulledOrderItem {
  externalId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

/** One open POS document (prefactura) mapped from the POS API response. */
export interface POSPulledOrder {
  posDocumentId: string;
  posTableId: string;           // empty string when document has no table field (caller skips+logs)
  /** Contífico `pos` UUID from the document — must be passed back when posting cobros.
   *  Null when the document was created manually (not via POS desktop); cobro will fail. */
  posToken: string | null;
  items: POSPulledOrderItem[];
  subtotal: number;
  iva: number;
  propina: number;              // service charge (servicio field); 10% for restaurants
  total: number;
  currency: string;
  isClosedInPos: boolean;
}

/** Guest invoicing snapshot — when present and `tipo !== CONSUMIDOR_FINAL`,
 *  the adapter resolves/creates the Contífico cliente and attaches it to the document
 *  before recording the cobro (SRI $50 rule). */
export interface POSGuestData {
  tipo: "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL";
  identificacion: string;
  email: string;
  nombre?: string;
}

export interface POSConfirmPaymentParams {
  posDocumentId: string;
  /**
   * Option B: this is the PARTIAL amount of THIS split (one POST /cobro/ per Kushki transaction),
   * not the bill total. Contífico sums cobros internally and marks the PRE as Cobrado (C) when the
   * sum reaches the document total.
   */
  amount: number;
  /** Kushki transaction ID / authorization reference — sent as `lote` (TC) or `descripcion` (EF). */
  paymentReference: string;
  /** The `pos` UUID from the original Contífico document. Required for cobro to succeed.
   *  Null for manually-created docs — cobro will fail, caller must log + handle. */
  posToken: string | null;
  /** Optional. When present, adapter resolves Contífico cliente_id and PUTs it onto the documento
   *  before the cobro. Best-effort: a PUT failure logs and continues — never voids Kushki. */
  guestData?: POSGuestData;
}

export interface POSConfirmPaymentResult {
  success: boolean;
  posFacturaId?: string;
  errorMessage?: string;
}

/** Fresh-from-POS document state (Gap #3 freshness pre-check). */
export interface POSOrderStatus {
  exists: boolean;
  isClosedInPos: boolean;
}

export type PosCapabilities = {
  supportsWebhooks: boolean;
  supportsPolling: boolean;
  supportsPartialPayments: boolean;
  supportsCloseBill: boolean;
  supportsMenuSync: boolean;
};

export interface PosPort {
  capabilities(): PosCapabilities;

  /** Fetch all open orders (prefacturas) for the configured restaurant. */
  pullOrders(): Promise<POSPulledOrder[]>;

  /** Record a cobro / convert the prefactura to a factura. Never throws on POS failure. */
  confirmPayment(params: POSConfirmPaymentParams): Promise<POSConfirmPaymentResult>;

  /**
   * Optional — freshness check before charging Kushki (Gap #3).
   * Adapters that cannot expose this (e.g. Practisis stub) MAY omit it.
   * Throws (sanitized) on transport errors so the caller can fail-open.
   */
  getOrderStatus?(posDocumentId: string): Promise<POSOrderStatus>;

  ping?(): Promise<boolean>;
}
