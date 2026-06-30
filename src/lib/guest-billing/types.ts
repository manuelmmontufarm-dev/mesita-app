/**
 * MesitaQR — Customer payment flow domain types.
 * Mirrors `design_handoff_customer/customer/data.jsx`.
 *
 * BACKEND SEAMS:
 *   BillItem[]       ← GET /pos/tables/:id/bill
 *   TableMember[]    ← live session roster (WebSocket join events)
 *   Claims           ← live session "who-claimed-what" state
 *   RestaurantConfig ← restaurant admin settings
 */

export type MemberId = string;
export type ItemId = string;

export interface BillItem {
  id: ItemId;
  name: string;
  note?: string;
  emoji?: string;
  qty: number;
  unitPrice: number;
  displayIndex?: number;
  displayLabel?: string;
}

export interface TableMember {
  id: MemberId;
  name: string;
  initials: string;
  hue: number;
  isYou?: boolean;
  /** Server-assigned sequential label, e.g. "Persona 2". */
  seatLabel?: string;
}

/** A payment recorded on the shared table session (for waiting/success summaries). */
export interface TablePaymentSummary {
  guestId: MemberId;
  guestName: string;
  amount: number;
  method: string;
  tip?: number;
  mode?: "item" | "equal" | "todo";
  createdAt?: string;
  itemCount?: number;
  subtotal?: number;
  /** Item ids covered by this payment (item split mode). */
  itemIds?: readonly ItemId[];
  /** Payment reference (demo / POS). */
  ref?: string;
  iva?: number;
  service?: number;
}

/** claims[itemId][memberId] = units (float, fractional allowed, Σ ≤ item.qty) */
export type Claims = Record<ItemId, Record<MemberId, number>>;

export interface RestaurantConfig {
  name: string;
  tagline?: string;
  table: string;
  city?: string;
  currency: string;
  /** SRI · IVA 15% */
  ivaRate: number;
  /** optional 10% servicio */
  serviceRate: number;
  /** toggled by restaurant administrator */
  serviceEnabled: boolean;
  tipPresets: number[];
  defaultTip: number;
  /** When true, card charges use the in-app demo adapter (no external provider). */
  demoMode?: boolean;
  /** Manual Reiniciar demo — only Mesa 12 UX sandbox. */
  showResetButton?: boolean;
}

export interface BillTotals {
  subtotal: number;
  iva: number;
  propina: number;
  servicio: number;
  total: number;
}

export type SplitMode = "item" | "equal" | "todo";

export type Stage =
  | "loading"
  | "error"
  | "bill"
  | "confirm"
  | "payment"
  | "waiting"
  | "success";

export type BillTab = "cuenta" | "mesa";
