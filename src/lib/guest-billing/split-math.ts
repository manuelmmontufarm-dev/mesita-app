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

/** Fixed N-way equal share, capped by what remains on the bill. */
export function equalShareSubtotal(
  fullSub: number,
  people: number,
  remainingSub: number,
): number {
  const splitCount = Math.max(2, Math.round(people));
  const share = round2(fullSub / splitCount);
  return Math.min(remainingSub, share);
}

/* ---------------- member / guest labelling ---------------- */

export const NAME_PILL_MAX = 10;

/** Legacy prefix — still recognised in receipts / old sessions. */
export const GUEST_PREFIX = "P";

/** Sequential label when a guest skips the name field. */
export function guestLabel(ordinal: number): string {
  return `Persona ${ordinal}`;
}

/** Avatar hue for the current payer — light green (Persona 1). */
export const AVATAR_HUE_YOU = 152;

/**
 * Cheerful fixed palette — Persona 1 green, 2 blue, 3 purple, then distinct hues.
 * `avatarColor(hue)` maps these to tuned HSL strings.
 */
export const GUEST_HUE_PALETTE = [152, 210, 275, 38, 330, 185, 25] as const;

/** @deprecated use GUEST_HUE_PALETTE */
export const AVATAR_HUE_GUESTS = GUEST_HUE_PALETTE;

const AVATAR_COLOR_BY_HUE: Record<number, string> = {
  152: "hsl(152 48% 52%)",
  210: "hsl(210 65% 52%)",
  275: "hsl(275 58% 55%)",
  38: "hsl(38 92% 55%)",
  330: "hsl(330 75% 58%)",
  185: "hsl(185 62% 48%)",
  25: "hsl(25 88% 56%)",
};

export function guestAvatarHue(guestIndex: number): number {
  const idx = Math.max(0, guestIndex) % GUEST_HUE_PALETTE.length;
  return GUEST_HUE_PALETTE[idx];
}

/** Parse "Persona 3" → 3 (stable slot for hue + label). */
export function personNumberFromLabel(label: string | null | undefined): number | null {
  const m = /^Persona\s+(\d+)$/i.exec((label ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** Stable hue for a guest id when roster row is missing (same on all devices). */
export function hueFromGuestId(guestId: string): number {
  let hash = 0;
  for (let i = 0; i < guestId.length; i++) {
    hash = (hash * 31 + guestId.charCodeAt(i)) | 0;
  }
  return guestAvatarHue(Math.abs(hash) % GUEST_HUE_PALETTE.length);
}

/** Never show "Invitado" — fall back to Persona N label. */
export function normalizeMemberName(
  name: string | null | undefined,
  fallbackLabel: string,
): string {
  const n = (name ?? "").trim();
  if (!n || n.toLowerCase() === "invitado") return fallbackLabel.trim() || guestLabel(1);
  return n;
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
    const m = /^Persona (\d+)$/i.exec(s);
    return m ? `P${m[1]}` : s.replace(/\s+/g, "").slice(0, 2).toUpperCase();
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

export const avatarColor = (hue: number): string =>
  AVATAR_COLOR_BY_HUE[hue] ?? `hsl(${hue} 58% 50%)`;

/** Apply typed name to the current payer's roster entry (hue stays server-assigned). */
export function resolveMemberDisplay(
  member: TableMember | null | undefined,
  typedName: string,
  youId: MemberId,
): TableMember {
  if (!member) {
    const name = typedName.trim() || "Tú";
    return {
      id: youId,
      name,
      initials: initialsFor(name),
      hue: guestAvatarHue(0),
      isYou: true,
    };
  }
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

/** True when every bill item has been marked paid. */
export function isTableFullyPaid(
  items: readonly BillItem[],
  paidItemIds: readonly ItemId[],
): boolean {
  return items.length > 0 && items.every((it) => paidItemIds.includes(it.id));
}

/** Resolve a roster entry for a claimant id (fallback uses Persona N, never "Invitado"). */
export function resolveClaimantMember(
  id: MemberId,
  roster: readonly TableMember[],
  youId?: MemberId,
  youName?: string,
): TableMember {
  const found = roster.find((m) => m.id === id);
  if (found) {
    const normalized = normalizeMemberName(
      found.name,
      found.seatLabel ?? guestLabel(roster.indexOf(found) + 1),
    );
    if (id === youId && youName?.trim()) {
      return { ...found, name: youName.trim(), isYou: true };
    }
    return { ...found, name: normalized };
  }
  const isYou = id === youId;
  const fallbackName = isYou ? youName?.trim() || "Tú" : guestLabel(1);
  return {
    id,
    name: fallbackName,
    initials: initialsFor(fallbackName),
    hue: hueFromGuestId(id),
    isYou,
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
): MemberId[] => {
  const itemMap = claims[itemId];
  if (!itemMap) return [];
  const ids = Object.entries(itemMap)
    .filter(([, units]) => units > 0.001)
    .map(([id]) => id);
  const order = new Map(roster.map((m, i) => [m.id, i]));
  return [...ids].sort(
    (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999),
  );
};

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
