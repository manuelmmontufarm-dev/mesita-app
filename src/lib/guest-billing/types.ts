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
}

export interface TableMember {
  id: MemberId;
  name: string;
  initials: string;
  hue: number;
  isYou?: boolean;
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
