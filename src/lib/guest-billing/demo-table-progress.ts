import { billSubtotal, computeTotals, isTableFullyPaid, paidSubtotal } from "./split-math";
import type { BillItem, ItemId, MemberId, RestaurantConfig } from "./types";

export interface DemoTableProgressInput {
  items: readonly BillItem[];
  paidItemIds: readonly ItemId[];
  paidGuestIds: readonly MemberId[];
  guestCount: number;
  paymentsSubtotal?: number;
  config: Pick<RestaurantConfig, "ivaRate" | "serviceRate" | "serviceEnabled">;
}

export interface DemoTableProgress {
  mesaTotal: number;
  remainingSub: number;
  paidPct: number;
  paidCount: number;
  tableClosed: boolean;
}

/** Authoritative demo progress — merges items, payers, and payment totals. */
export function deriveDemoTableProgress(input: DemoTableProgressInput): DemoTableProgress {
  const fullSub = billSubtotal(input.items);
  const mesaTotal = computeTotals(fullSub, input.config, 0).total;

  const itemPaidSub = paidSubtotal(input.items, input.paidItemIds);
  const remainingFromItems = Math.max(0, fullSub - itemPaidSub);

  const paymentsSub =
    input.paymentsSubtotal != null && input.paymentsSubtotal > 0
      ? input.paymentsSubtotal
      : 0;
  const remainingFromPayments =
    paymentsSub > 0 ? Math.max(0, fullSub - paymentsSub) : fullSub;

  const remainingSub = Math.min(remainingFromItems, remainingFromPayments);

  const itemPct =
    fullSub > 0.001 ? Math.round((itemPaidSub / fullSub) * 100) : 100;
  const paymentPct =
    fullSub > 0.001 && paymentsSub > 0
      ? Math.round((Math.min(paymentsSub, fullSub) / fullSub) * 100)
      : 0;
  const guestDenom = Math.max(input.guestCount, input.paidGuestIds.length, 1);
  const guestPct = Math.round((input.paidGuestIds.length / guestDenom) * 100);

  const paidPct = Math.min(
    100,
    Math.max(itemPct, paymentPct, input.paidGuestIds.length > 0 ? guestPct : 0),
  );

  const allItemsPaid = isTableFullyPaid(input.items, input.paidItemIds);
  const allGuestsPaid =
    input.guestCount > 0 &&
    input.paidGuestIds.length >= input.guestCount;
  const paymentsCoverBill = paymentsSub >= fullSub - 0.02;
  const tableClosed =
    allItemsPaid || allGuestsPaid || paymentsCoverBill || remainingSub <= 0.01;

  return {
    mesaTotal,
    remainingSub: tableClosed ? 0 : remainingSub,
    paidPct: tableClosed ? 100 : paidPct,
    paidCount: input.paidGuestIds.length,
    tableClosed,
  };
}
