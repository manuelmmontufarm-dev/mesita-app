import { billSubtotal, computeTotals, isTableFullyPaid, paidSubtotal } from "./split-math";
import type { BillItem, ItemId, MemberId, RestaurantConfig, TablePaymentSummary } from "./types";

/** Subtotal credited to a payment row — never returns 0 when amount > 0. */
export function paymentRecordSubtotal(p: {
  subtotal?: number;
  amount: number;
}): number {
  if (p.subtotal != null && p.subtotal > 0.001) return p.subtotal;
  if (p.amount > 0.001) return p.amount / 1.25;
  return 0;
}

export interface DemoTableProgressInput {
  items: readonly BillItem[];
  paidItemIds: readonly ItemId[];
  paidGuestIds: readonly MemberId[];
  guestCount: number;
  paymentsSubtotal?: number;
  /** Partial BY_ITEM units settled (item id → units paid). */
  itemPaidUnits?: Readonly<Record<string, number>>;
  /** Distinct payment transactions — drives "N pagos registrados". */
  paymentCount?: number;
  config: Pick<RestaurantConfig, "ivaRate" | "serviceRate" | "serviceEnabled">;
}

export interface DemoTableProgress {
  mesaTotal: number;
  remainingSub: number;
  paidPct: number;
  paidCount: number;
  tableClosed: boolean;
}

/** Subtotal covered by fully paid items plus partial unit payments. */
function paidSubtotalWithPartials(
  items: readonly BillItem[],
  paidItemIds: readonly ItemId[],
  itemPaidUnits?: Readonly<Record<string, number>>,
): number {
  return items.reduce((sum, it) => {
    if (paidItemIds.includes(it.id)) {
      return sum + it.qty * it.unitPrice;
    }
    const units = itemPaidUnits?.[it.id] ?? 0;
    if (units > 0.001) {
      return sum + Math.min(units, it.qty) * it.unitPrice;
    }
    return sum;
  }, 0);
}

/** Authoritative demo progress — merges items, payers, and payment totals. */
export function deriveDemoTableProgress(input: DemoTableProgressInput): DemoTableProgress {
  const fullSub = billSubtotal(input.items);
  const mesaTotal = computeTotals(fullSub, input.config, 0).total;

  const itemPaidSub = paidSubtotalWithPartials(
    input.items,
    input.paidItemIds,
    input.itemPaidUnits,
  );
  const remainingFromItems = Math.max(0, fullSub - itemPaidSub);

  const paymentsSub =
    input.paymentsSubtotal != null && input.paymentsSubtotal > 0
      ? input.paymentsSubtotal
      : 0;
  const remainingFromPayments =
    paymentsSub > 0 ? Math.max(0, fullSub - paymentsSub) : fullSub;

  const remainingSub = Math.min(remainingFromItems, remainingFromPayments);

  const allItemsPaid = isTableFullyPaid(input.items, input.paidItemIds);
  const paymentsCoverBill = paymentsSub >= fullSub - 0.02;
  /** Mesa cerrada solo cuando la cuenta está cubierta — no porque un comensal pagó su parte. */
  const tableClosed = allItemsPaid || paymentsCoverBill;

  const paidSubBase = Math.max(
    itemPaidSub,
    paymentsSub > 0 ? Math.min(paymentsSub, fullSub) : 0,
  );
  const paidPctRaw =
    fullSub > 0.001
      ? Math.min(100, Math.round((paidSubBase / fullSub) * 100))
      : tableClosed
        ? 100
        : 0;

  return {
    mesaTotal,
    remainingSub: tableClosed ? 0 : remainingSub,
    paidPct: tableClosed ? 100 : paidPctRaw,
    paidCount:
      input.paymentCount != null && input.paymentCount > 0
        ? input.paymentCount
        : input.paidGuestIds.length,
    tableClosed,
  };
}

/**
 * Mesa-wide % paid for the waiting/summary ring — tax-inclusive, matches
 * the BillStage header ("Pagado $X (Y%) · mesa $Z").
 */
export function resolveMesaPaidPct(input: {
  items: readonly BillItem[];
  paidItemIds: readonly ItemId[];
  paidSummaries?: readonly TablePaymentSummary[];
  config: Pick<RestaurantConfig, "ivaRate" | "serviceRate" | "serviceEnabled">;
  demoProgress?: DemoTableProgress | null;
}): number {
  const { items, paidItemIds, paidSummaries = [], config, demoProgress } = input;
  if (demoProgress?.tableClosed) return 100;

  const fullSub = billSubtotal(items);
  const mesaTotal =
    demoProgress?.mesaTotal ?? computeTotals(fullSub, config, 0).total;
  if (mesaTotal <= 0.01) return 100;

  const paidFromItems = computeTotals(
    paidSubtotal(items, paidItemIds),
    config,
    0,
  ).total;
  const paidFromPayments =
    paidSummaries.length > 0
      ? computeTotals(
          Math.min(
            paidSummaries.reduce((s, p) => s + paymentRecordSubtotal(p), 0),
            fullSub,
          ),
          config,
          0,
        ).total
      : 0;

  const paidTotal = Math.max(paidFromItems, paidFromPayments);
  if (paidTotal > 0.01) {
    return Math.min(100, Math.round((paidTotal / mesaTotal) * 100));
  }

  if (demoProgress?.paidPct != null && demoProgress.paidPct > 0) {
    return demoProgress.paidPct;
  }

  return 0;
}
