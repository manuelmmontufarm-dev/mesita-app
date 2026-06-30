export type BillStatus = "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID" | "REFUNDED";
export type SplitMode = "FULL" | "EQUAL" | "BY_ITEM";

export interface RecordPaymentInput {
  paymentId: string;
  billId: string;
  restaurantId: string;
  amount: number;
  voluntaryTip: number;
  providerTransactionId: string;
  idempotencyKey: string;
  splitMode: SplitMode;
  selectedItemIds?: string[];
  requestedSplitPeople?: number;
  guestSessionId?: string;
  guestIdentificacion: string | null;
  guestEmail: string | null;
  guestNombre: string | null;
  guestTipo: "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL";
  hasUsableGuestData: boolean;
}

export interface RecordPaymentResult {
  billStatus: BillStatus;
  thisPaymentIsRecipient: boolean;
}

export interface PaymentRepository {
  /** Returns billId too so callers can detect a key reused across DIFFERENT bills (conflict). */
  findByIdempotencyKey(key: string): Promise<{ id: string; billId: string } | null>;
  recordPaymentAtomically(input: RecordPaymentInput): Promise<RecordPaymentResult>;
  updatePosRegistration(
    paymentId: string,
    data: { registered: boolean; note?: string | null }
  ): Promise<void>;
}
