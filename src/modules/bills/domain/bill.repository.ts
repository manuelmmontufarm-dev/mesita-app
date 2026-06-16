export interface BillSnapshotItem {
  id: string;
  isPaid: boolean;
  price: number;
  quantity: number;
}

export interface BillSnapshotPayment {
  id: string;
  status: string;
}

export interface BillSnapshot {
  id: string;
  posDocumentId: string | null;
  /** POS-authoritative total (D-07). When non-null it overrides item-derived math. */
  posTotal: number | null;
  items: BillSnapshotItem[];
  payments: BillSnapshotPayment[];
  equalSplitPeople: number | null;
  equalSharesPaid: number;
  invoiceRecipientPaymentId: string | null;
}

export interface BillPosInfo {
  posDocumentId: string;
  posToken: string | null;
}

export interface BillRepository {
  findSnapshot(billId: string): Promise<BillSnapshot | null>;
  findPosInfo(billId: string): Promise<BillPosInfo | null>;
}
