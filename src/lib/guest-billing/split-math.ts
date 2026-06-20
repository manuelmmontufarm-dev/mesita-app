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

export const NAME_PILL_MAX = 10;

/** Legacy prefix — still recognised in receipts / old sessions. */
export const GUEST_PREFIX = "P";

/** Sequential label when a guest skips the name field. */
export function guestLabel(ordinal: number): string {
  return `Persona ${ordinal}`;
}

/** Avatar hue for the current payer — brand green. */
export const AVATAR_HUE_YOU = 160;

/** Cheerful hues for tablemates (blue, yellow, purple). No tomato/brown. */
export const AVATAR_HUE_GUESTS = [210, 48, 280] as const;

export function guestAvatarHue(guestIndex: number): number {
  return AVATAR_HUE_GUESTS[guestIndex % AVATAR_HUE_GUESTS.length];
}

/**
 * Compact initials for receipts / legacy paths (2 letters).
 * Pill widgets use `memberPillLabel` instead.
 */
export const initialsFor = (name: string | null | undefined): string => {
  const s = (name || "").trim();
  if (!s) return "Tú";
  if (new RegExp("^" + GUEST_PREFIX + "\\d+$", "i").test(s)) {
    return s.toUpperCase();
  }
  if (/^Persona \d+$/i.test(s)) {
    return s.replace(/\s+/g, "").slice(0, 2).toUpperCase();
  }
  const letters = s.replace(/\s+/g, "").slice(0, 2);
  return letters.toUpperCase();
};

/** Truncate a typed name for pill display (max 10 chars). */
export function namePillLabel(name: string, maxLen = NAME_PILL_MAX): string {
  const s = name.trim();
  if (!s) return "Tú";
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

/** Normalise legacy P2 / Persona 2 / real names into pill text. */
export function displayPillLabel(
  name: string | null | undefined,
  maxLen = NAME_PILL_MAX,
): string {
  const s = (name || "").trim();
  if (!s || s === "Tú") return "Tú";
  const legacyP = /^P(\d+)$/i.exec(s);
  if (legacyP) return guestLabel(Number(legacyP[1]));
  return namePillLabel(s, maxLen);
}

/** Label shown inside a name pill for a roster member. */
export function memberPillLabel(
  member: { name?: string; isYou?: boolean } | null | undefined,
  typedName?: string,
  maxLen = NAME_PILL_MAX,
): string {
  const m = member ?? {};
  if (m.isYou) {
    const typed = (typedName ?? "").trim();
    if (typed) return namePillLabel(typed, maxLen);
    const fallback = (m.name ?? "").trim();
    if (fallback && fallback !== "Tú") return displayPillLabel(fallback, maxLen);
    return "Tú";
  }
  return displayPillLabel(m.name, maxLen);
}

export const avatarColor = (hue: number): string => `hsl(${hue} 62% 47%)`;

/** Apply typed name to the current payer's roster entry (hue stays server-assigned). */
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
  };
}

/** True when every item is paid or every guest at the table has paid. */
export function isTableFullyPaid(
  items: readonly BillItem[],
  paidItemIds: readonly ItemId[],
  paidIds: readonly MemberId[],
  people: number,
): boolean {
  const allItems =
    items.length > 0 && items.every((it) => paidItemIds.includes(it.id));
  const allGuests = people > 0 && paidIds.length >= people;
  return allItems || allGuests;
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
