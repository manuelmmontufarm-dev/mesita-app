/**
 * MesitaQR — Customer split / tax math.
 *
 * Ported line-for-line from `design_handoff_customer/customer/data.jsx`
 * (lines 82–131). Pure functions only — framework-agnostic, safe on
 * server and client.
 *
 * Encodes:
 *   - IVA 15% (SRI rule)
 *   - optional 10% service (restaurant config)
 *   - tip % (stepper-adjustable)
 *   - fractional item claims (a half-portion = 0.5 units)
 *   - paid-item lockout (a diner who pays their dish marks it paid for all)
 *
 * RECONCILIATION WITH POS (see `src/lib/money.ts`):
 *   `computeTotals` recomputes the table total from items + config. This is
 *   correct ONLY when the source bill has no POS-provided total. When
 *   `Bill.posTotal` is present (POS-integrated restaurants), the totals MUST
 *   be mirrored from the POS — use `money.ts` for the table-level total and
 *   use the per-member helpers here (`memberSubtotal`, `itemOwed`,
 *   `freeUnits`) to apportion each diner's share of that POS total. This
 *   module never overwrites `posTotal`.
 */

import type {
  BillItem,
  BillTotals,
  Claims,
  ItemId,
  MemberId,
  RestaurantConfig,
  TableMember,
} from "./types";

/* ---------------- currency primitives ---------------- */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const fmt = (n: number): string => "$" + round2(n).toFixed(2);

export const lineTotal = (it: Pick<BillItem, "qty" | "unitPrice">): number =>
  it.qty * it.unitPrice;

export const billSubtotal = (items: readonly BillItem[]): number =>
  items.reduce((s, it) => s + lineTotal(it), 0);

/* ---------------- member / guest labelling ---------------- */

/** Guests who skip the name field pay as "P1", "P2"… (sequential per table). */
export const GUEST_PREFIX = "P";

/** Avatar hue for the current payer — brand green. */
export const AVATAR_HUE_YOU = 160;

/** Cheerful hues for tablemates (blue, yellow, purple). No tomato/brown. */
export const AVATAR_HUE_GUESTS = [210, 48, 280] as const;

export function guestAvatarHue(guestIndex: number): number {
  return AVATAR_HUE_GUESTS[guestIndex % AVATAR_HUE_GUESTS.length];
}

/**
 * Avatar label. Empty name → "Tú". Guest labels (P1, P2…) are kept whole.
 * Real names → first two letters, uppercase (e.g. "manuel" → "MA").
 */
export const initialsFor = (name: string | null | undefined): string => {
  const s = (name || "").trim();
  if (!s) return "Tú";
  if (new RegExp("^" + GUEST_PREFIX + "\\d+$", "i").test(s)) {
    return s.toUpperCase();
  }
  const letters = s.replace(/\s+/g, "").slice(0, 2);
  return letters.toUpperCase();
};

export const avatarColor = (hue: number): string => `hsl(${hue} 62% 47%)`;

/** Apply typed name + green hue to the current payer's roster entry. */
export function resolveMemberDisplay(
  member: TableMember,
  typedName: string,
  youId: MemberId,
): TableMember {
  const isYou = member.id === youId || member.isYou === true;
  if (!isYou) return member;
  const name = typedName.trim() || member.name;
  return {
    ...member,
    isYou: true,
    name,
    initials: initialsFor(name),
    hue: AVATAR_HUE_YOU,
  };
}

export function resolveRoster(
  members: readonly TableMember[],
  typedName: string,
  youId: MemberId,
): TableMember[] {
  return members.map((m) => resolveMemberDisplay(m, typedName, youId));
}

/* ---------------- claims helpers ---------------- */

export const unitsOf = (
  claims: Claims,
  itemId: ItemId,
  memberId: MemberId,
): number => (claims[itemId] && claims[itemId][memberId]) || 0;

export const claimedUnits = (claims: Claims, itemId: ItemId): number =>
  Object.values(claims[itemId] || {}).reduce((s, u) => s + u, 0);

export const claimantsOf = (
  claims: Claims,
  itemId: ItemId,
  roster: readonly TableMember[],
): MemberId[] =>
  roster
    .filter((m) => unitsOf(claims, itemId, m.id) > 0)
    .map((m) => m.id);

export const freeUnits = (item: BillItem, claims: Claims): number =>
  round2(item.qty - claimedUnits(claims, item.id));

export const itemOwed = (
  item: BillItem,
  claims: Claims,
  memberId: MemberId,
): number => unitsOf(claims, item.id, memberId) * item.unitPrice;

export const memberSubtotal = (
  items: readonly BillItem[],
  claims: Claims,
  memberId: MemberId,
): number =>
  items.reduce((s, it) => s + itemOwed(it, claims, memberId), 0);

export const unclaimedItems = (
  items: readonly BillItem[],
  claims: Claims,
): BillItem[] => items.filter((it) => freeUnits(it, claims) > 0.001);

/* ---------------- paid-items helpers ---------------- */

export const isItemPaid = (
  paidItemIds: readonly ItemId[],
  itemId: ItemId,
): boolean => paidItemIds.includes(itemId);

export const paidSubtotal = (
  items: readonly BillItem[],
  paidItemIds: readonly ItemId[],
): number =>
  items.reduce(
    (s, it) => s + (paidItemIds.includes(it.id) ? lineTotal(it) : 0),
    0,
  );

export const unpaidItems = (
  items: readonly BillItem[],
  paidItemIds: readonly ItemId[],
): BillItem[] => items.filter((it) => !paidItemIds.includes(it.id));

/* ---------------- totals ---------------- */

/**
 * Roll subtotal → IVA + propina + servicio + total using admin config.
 * Tip is a percentage (e.g. 10 means 10%).
 *
 * Use only for non-POS bills (see RECONCILIATION note at top of file).
 */
export function computeTotals(
  subtotal: number,
  config: Pick<RestaurantConfig, "ivaRate" | "serviceRate" | "serviceEnabled">,
  tipPct: number,
): BillTotals {
  const iva = subtotal * config.ivaRate;
  const propina = subtotal * (tipPct / 100);
  const servicio = config.serviceEnabled
    ? subtotal * config.serviceRate
    : 0;
  return {
    subtotal,
    iva,
    propina,
    servicio,
    total: subtotal + iva + propina + servicio,
  };
}
