import type { POSPulledOrderItem } from "./pos.port";

export interface PosIngestBill {
  id: string;
  items: Array<{ id: string; name: string }>;
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
  findTableByPosExternalId(restaurantId: string, posExternalId: string): Promise<{ id: string } | null>;
  findBillByPosDocumentId(posDocumentId: string): Promise<PosIngestBill | null>;
  syncBillItems(input: SyncBillItemsInput): Promise<void>;
  createBillWithItems(input: CreateBillInput): Promise<void>;
}
