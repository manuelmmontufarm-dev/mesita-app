"use client";

/**
 * WaitingStage — live table status while the rest of the diners pay.
 * Ported from `design_handoff_customer/customer/flow.jsx` (`WaitingScreen`).
 */

import { useEffect, useState } from "react";

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  billSubtotal,
  computeTotals,
  fmt,
  memberSubtotal,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Avatar, Ic } from "./_shared";
import { ReceiptDrawer } from "./ReceiptDrawer";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

const WAIT_LABEL: Record<string, string> = {
  paid: "Pagó",
  checkout: "En pago",
  reviewing: "Revisando",
  selecting: "Eligiendo",
};

export interface WaitingStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
}

export function WaitingStage({
  flow,
  items,
  members,
  config,
}: WaitingStageProps) {
  const { state, derived, youId } = flow;
  const { mode, claims, paidIds, people } = state;

  const fullSub = billSubtotal(items);
  const mesaTotal = computeTotals(fullSub, config, 0).total;
  const perPersonEqual = mesaTotal / Math.max(1, people);

  const owed = (id: string): number => {
    if (mode === "equal") return perPersonEqual;
    const itemAmt = computeTotals(
      memberSubtotal(items, claims, id),
      config,
      0,
    ).total;
    if (mode === "todo") return id === youId ? derived.totals.total : itemAmt;
    return itemAmt;
  };
  const totalOwed = members.reduce((s, m) => s + owed(m.id), 0);

  const [paid, setPaid] = useState<Set<string>>(
    () => new Set(paidIds.includes(youId) ? paidIds : [...paidIds, youId]),
  );
  const [statuses, setStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    const unpaid = members.filter(
      (m) => !paid.has(m.id) && owed(m.id) > 0.001,
    );
    const timers: ReturnType<typeof setTimeout>[] = [];
    unpaid.forEach((m, i) => {
      const base = 1200 + i * 3000;
      setStatuses((s) => ({ ...s, [m.id]: "selecting" }));
      timers.push(
        setTimeout(
          () => setStatuses((s) => ({ ...s, [m.id]: "reviewing" })),
          base,
        ),
      );
      timers.push(
        setTimeout(
          () => setStatuses((s) => ({ ...s, [m.id]: "checkout" })),
          base + 1100,
        ),
      );
      timers.push(
        setTimeout(
          () => setPaid((p) => new Set([...p, m.id])),
          base + 2200,
        ),
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paidValue = members
    .filter((m) => paid.has(m.id))
    .reduce((s, m) => s + owed(m.id), 0);
  const pct = totalOwed > 0 ? (paidValue / totalOwed) * 100 : 100;
  const remaining = Math.max(0, totalOwed - paidValue);
  const allPaid = members.every(
    (m) => paid.has(m.id) || owed(m.id) <= 0.001,
  );

  useEffect(() => {
    if (!allPaid) return;
    const id = setTimeout(() => flow.finishWaiting(), 2400);
    return () => clearTimeout(id);
  }, [allPaid, flow]);

  const displayName =
    state.name.trim() || state.receipt?.name || "tú";

  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="waiting"
    >
      <div className="flowscreen">
        <div className="flow-scroll wait-scroll">
          <div className="wait-thanks">
            <div className="wait-check">
              <Ic.check s={24} w={3} />
            </div>
            <h1 className="flow-title">
              ¡Gracias{state.name.trim() ? `, ${state.name.trim()}` : ""}!
            </h1>
            <p className="flow-lede">
              Pagaste en {config.name} con MesitaQR{" "}
              <span aria-hidden="true">❤️</span>
            </p>
          </div>

          <div className="wait-meter">
            <div className="wait-meter-top">
              <span className="wait-meter-k">La mesa en vivo</span>
              <span className="wait-meter-v">
                {members.filter((m) => paid.has(m.id)).length}/
                {members.length} pagaron
              </span>
            </div>
            <div className="wait-bar">
              <div className="wait-bar-fill" style={{ width: pct + "%" }} />
            </div>
            <div className="wait-meter-sub">
              {remaining > 0.001
                ? `${fmt(remaining)} por pagar`
                : "¡La mesa quedó completa!"}
            </div>
          </div>

          <div className="wait-list surfx">
            {members.map((m) => {
              const isPaid = paid.has(m.id);
              const noConsumo = owed(m.id) <= 0.001;
              const st = isPaid
                ? "paid"
                : noConsumo
                  ? "selecting"
                  : statuses[m.id] || "selecting";
              const name = m.isYou ? displayName : m.name;
              return (
                <div
                  key={m.id}
                  className={"wait-row" + (isPaid ? " is-paid" : "")}
                  data-testid={`wait-row-${m.id}`}
                >
                  <Avatar member={m} size={30} />
                  <span className="wait-name">
                    {name}
                    {m.isYou && <span className="wait-you">tú</span>}
                  </span>
                  <div className={"wait-status st-" + st}>
                    {isPaid ? (
                      <Ic.check s={12} w={3} />
                    ) : (
                      <span className="st-dot" />
                    )}
                    {WAIT_LABEL[st]}
                  </div>
                  <span className="wait-amt">
                    {noConsumo && !isPaid ? "—" : fmt(owed(m.id))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <ReceiptDrawer receipt={state.receipt} config={config} />
      </div>
    </div>
  );
}
