import type { POSPulledOrderItem } from "./pos.port";

export interface PosIngestBill {
  id: string;
  posDocumentId: string;
  /** local bill lifecycle — ingest uses it to make closure idempotent */
  status: string;
  closedAt: Date | null;
  posTotal: number | null;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
}

/** POS-authoritative document totals (D-07) — mirrored verbatim, never recomputed. */
export interface PosDocumentTotals {
  subtotal: number;
  iva: number;
  propina: number;
  total: number;
}

export interface CreateBillInput {
  tableId: string;
  restaurantId: string;
  posDocumentId: string;
  posToken: string | null;
  items: POSPulledOrderItem[];
  /**
   * Optional so existing ingestion call sites compile unchanged —
   * wired through from `pullOrders()` by the ingestion orchestrator.
   */
  totals?: PosDocumentTotals;
}

export interface SyncBillItemsInput {
  existingBillId: string;
  restaurantId: string;
  posToken: string | null;
  existingItems: Array<{ id: string; name: string }>;
  items: POSPulledOrderItem[];
  /**
   * Optional so existing ingestion call sites compile unchanged —
   * wired through from `pullOrders()` by the ingestion orchestrator.
   */
  totals?: PosDocumentTotals;
}

export interface PosEnabledRestaurant {
  id: string;
  name: string;
  invoiceMode: string;
  posProvider: string | null;
  posApiKeyEnc: string | null;
  posEnvironment: string;
  posTableField: string | null;
}

export interface PosOrderRepository {
  findPosEnabledRestaurants(): Promise<PosEnabledRestaurant[]>;
  /** Batch: one round trip for every table referenced by a pull (perf: the
   *  ingest loop must not issue one query per document). */
  findTablesByPosExternalIds(
    restaurantId: string,
    posExternalIds: string[]
  ): Promise<Array<{ id: string; posExternalId: string | null }>>;
  /** Batch: one round trip for every bill referenced by a pull. */
  findBillsByPosDocumentIds(posDocumentIds: string[]): Promise<PosIngestBill[]>;
  syncBillItems(input: SyncBillItemsInput): Promise<void>;
  createBillWithItems(input: CreateBillInput): Promise<void>;
  /**
   * Reflect a POS-side closure (estado C/G/A/F) onto the local bill.
   * Conditional: only flips bills still in UNPAID/PARTIALLY_PAID (idempotent).
   */
  markBillClosedFromPos(billId: string): Promise<void>;
}
