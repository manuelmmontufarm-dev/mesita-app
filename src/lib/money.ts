import { TAX_MULTIPLIER } from "@/lib/constants/ecuador-tax";

/**
 * Single source of truth for money math.
 *
 * POS-integrated rule (CLAUDE.md): the POS is the source of truth for amounts.
 * When `Bill.posTotal` is present it must be mirrored, never recomputed —
 * Contífico only converts PRE→FAC when cobros sum EXACTLY to the document
 * total. `computeFallbackTotal` is the ONE definition of the legacy
 * TAX_MULTIPLIER-based math, used only when a bill has no POS totals
 * (non-POS restaurants / manually created bills).
 */

/** Structural match for Prisma.Decimal without importing the Prisma runtime. */
interface DecimalLike {
  toNumber(): number;
}

/**
 * Round to cents, half-up (10.005 → 10.01).
 *
 * Works in the cents domain with a tiny epsilon (1e-7 cents ≈ $1e-9) so binary
 * float artifacts like `10.005 * 100 === 1000.4999999999999` still round up.
 */
export function money(n: number): number {
  const cents = n * 100;
  return Math.round(cents + (cents >= 0 ? 1e-7 : -1e-7)) / 100;
}

/** Convert a Prisma.Decimal | number | null | undefined to a plain number (null → 0). */
export function toNumberSafe(value: DecimalLike | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return value.toNumber();
}

/**
 * Legacy item-derived bill total: subtotal × TAX_MULTIPLIER (1 + propina 10% + IVA 15%),
 * rounded to cents. ONLY for bills without POS-authoritative totals — when
 * `bill.posTotal` is non-null, use it directly instead of calling this.
 */
export function computeFallbackTotal(
  items: Array<{ price: number | DecimalLike; quantity: number }>
): number {
  const subtotal = items.reduce((sum, item) => sum + toNumberSafe(item.price) * item.quantity, 0);
  return money(subtotal * TAX_MULTIPLIER);
}
