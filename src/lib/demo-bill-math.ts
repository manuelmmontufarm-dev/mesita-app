import type { DemoFoodItem, DemoTableState } from "@/lib/demo-table-store";

export interface DemoRestaurantRates {
  ivaRate: number;
  serviceRate: number;
  serviceEnabled: boolean;
}

export interface DemoBillBreakdown {
  subtotal: number;
  iva: number;
  service: number;
  /** Subtotal + IVA + servicio (sin propina — igual que el header del app). */
  billTotal: number;
}

export function computeDemoSubtotal(
  items: readonly DemoFoodItem[],
): number {
  return items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
}

export function computeDemoBillBreakdown(
  items: readonly DemoFoodItem[],
  restaurant: DemoRestaurantRates,
): DemoBillBreakdown {
  const subtotal = computeDemoSubtotal(items);
  const iva = subtotal * restaurant.ivaRate;
  const service = restaurant.serviceEnabled
    ? subtotal * restaurant.serviceRate
    : 0;
  const billTotal = Math.round((subtotal + iva + service) * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    service: Math.round(service * 100) / 100,
    billTotal,
  };
}

export function computeDemoPaidAmount(
  state: Pick<DemoTableState, "payments"> | null,
): number {
  if (!state?.payments?.length) return 0;
  return Math.round(
    state.payments.reduce((s, p) => s + p.amount, 0) * 100,
  ) / 100;
}

/** Monto a mostrar en tarjetas del dashboard — cobrado si hay pagos, si no cuenta con impuestos. */
export function computeDemoDisplayAmount(
  items: readonly DemoFoodItem[],
  restaurant: DemoRestaurantRates,
  state: Pick<DemoTableState, "payments"> | null,
): { billTotal: number; paidAmount: number; displayAmount: number } {
  const { billTotal } = computeDemoBillBreakdown(items, restaurant);
  const paidAmount = computeDemoPaidAmount(state);
  const displayAmount = paidAmount > 0 ? paidAmount : billTotal;
  return { billTotal, paidAmount, displayAmount };
}
