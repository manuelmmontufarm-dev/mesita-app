import type { TableSessionState } from "@/hooks/useLiveTableSession";
import type { DemoTableState } from "@/lib/demo-table-store";

/** Map legacy demo store shape → table-session shape for GuestBillFlow. */
export function mapDemoStateToSession(state: DemoTableState): TableSessionState {
  const subtotal = state.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const iva = subtotal * state.restaurant.ivaRate;
  const service = state.restaurant.serviceEnabled
    ? subtotal * state.restaurant.serviceRate
    : 0;
  const total = subtotal + iva + service;

  const claims = Object.entries(state.claims).map(([billItemId, guestSessionId]) => ({
    billItemId,
    guestSessionId,
    units: 1,
    status: "ACTIVE" as const,
  }));

  return {
    restaurant: {
      id: "demo-restaurant",
      name: state.restaurant.name,
      logo: null,
      address: state.restaurant.city,
    },
    table: {
      id: "demo-table",
      name: state.table.name,
      token: state.token,
    },
    bill: {
      id: "demo-bill",
      status: state.paidItemIds.length ? "PARTIALLY_PAID" : "UNPAID",
      breakdown: { subtotal, propina: service, iva, total },
      remainingBalance: Math.max(
        0,
        total - state.payments.reduce((s, p) => s + p.subtotal, 0),
      ),
    },
    items: state.items.map((it) => ({
      id: it.id,
      name: it.name,
      price: it.unitPrice,
      quantity: it.qty,
      isPaid: state.paidItemIds.includes(it.id),
    })),
    guests: state.guests.map((g) => ({
      id: g.id,
      label: g.label,
      displayName: g.name,
      colorHue: g.hue,
      status:
        g.status === "paid"
          ? "PAID"
          : g.status === "in_payment"
            ? "IN_PAYMENT"
            : g.status === "reviewing"
              ? "REVIEWING"
              : "SELECTING",
    })),
    claims,
    payments: state.payments,
    version: state.version,
  };
}

export function mapSplitModeToDemo(
  mode: "FULL" | "EQUAL" | "BY_ITEM" | undefined,
): "item" | "equal" | "todo" {
  if (mode === "EQUAL") return "equal";
  if (mode === "FULL") return "todo";
  return "item";
}
