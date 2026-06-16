import { Decimal } from "@prisma/client/runtime/library";
import type { BillStatus, SplitMode } from "@prisma/client";
import { PROPINA_RATE, IVA_RATE } from "@/lib/constants/ecuador-tax";
import { money, toNumberSafe, computeFallbackTotal } from "@/lib/money";

interface BillItem {
  price: number | Decimal | { toNumber(): number };
  quantity: number;
  isPaid: boolean;
}

interface BillPaymentLike {
  amount: number | Decimal | { toNumber(): number };
  voluntaryTip?: number | Decimal | { toNumber(): number } | null;
}

/** Sum of prior COMPLETED payments net of voluntary tips (= what counts toward posTotal). */
export function sumNetPayments(payments: BillPaymentLike[] | undefined): number {
  return (payments ?? []).reduce(
    (sum, p) => sum + toNumberSafe(p.amount) - toNumberSafe(p.voluntaryTip),
    0
  );
}

/**
 * Remaining balance for the requesting guest.
 *
 * When `bill.posTotal` is non-null the POS is the source of truth (D-07):
 * - EQUAL: per-share = money(posTotal / n); the CLOSING share pays the exact
 *   remainder (posTotal − prior net payments) so cobros sum EXACTLY to the
 *   document total — Contífico only flips PRE→FAC on an exact match.
 * - FULL: posTotal − prior net payments.
 *
 * Without posTotal we fall back to the legacy item-derived TAX_MULTIPLIER math.
 * `bill.payments` must contain only COMPLETED payments.
 */
export function calculateRemainingBalance(
  bill: {
    items: BillItem[];
    equalSplitPeople?: number | null;
    posTotal?: number | Decimal | { toNumber(): number } | null;
    equalSharesPaid?: number;
    payments?: BillPaymentLike[];
  },
  splitMode: string,
  equalSplitPeople: number
): number {
  const posTotal = bill.posTotal == null ? null : toNumberSafe(bill.posTotal);

  if (posTotal !== null) {
    const priorNet = sumNetPayments(bill.payments);

    if (splitMode === "EQUAL") {
      const sharesPaid = bill.equalSharesPaid ?? 0;
      const isClosingShare = sharesPaid + 1 >= equalSplitPeople;
      return isClosingShare
        ? money(posTotal - priorNet)
        : money(posTotal / equalSplitPeople);
    }

    // FULL: pay exactly what the POS document still needs to close.
    return money(posTotal - priorNet);
  }

  if (splitMode === "EQUAL") {
    return money(computeFallbackTotal(bill.items) / equalSplitPeople);
  }

  return computeFallbackTotal(bill.items.filter((i) => !i.isPaid));
}

export function calculateBillBreakdown(items: BillItem[]): {
  subtotal: Decimal;
  propina: Decimal;
  iva: Decimal;
  total: Decimal;
} {
  const subtotal = items.reduce(
    (acc, item) => acc + toNumberSafe(item.price) * item.quantity,
    0
  );
  const propina = subtotal * PROPINA_RATE;
  const iva = subtotal * IVA_RATE;
  const total = subtotal + propina + iva;

  return {
    subtotal: new Decimal(subtotal.toFixed(2)),
    propina: new Decimal(propina.toFixed(2)),
    iva: new Decimal(iva.toFixed(2)),
    total: new Decimal(total.toFixed(2)),
  };
}

export function determineBillStatus(
  currentStatus: BillStatus,
  allItems: { isPaid: boolean }[],
  splitMode: SplitMode | string,
  equalSharesPaid: number,
  totalPeople: number
): BillStatus {
  if (splitMode === "EQUAL") {
    if (equalSharesPaid >= totalPeople) return "FULLY_PAID";
    return currentStatus === "UNPAID" ? "PARTIALLY_PAID" : currentStatus;
  }

  if (allItems.every((i) => i.isPaid)) return "FULLY_PAID";
  if (allItems.some((i) => i.isPaid)) return "PARTIALLY_PAID";
  return currentStatus;
}
