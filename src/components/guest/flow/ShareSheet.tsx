"use client";

/**
 * ShareSheet — bottom sheet to split a single dish between selected diners.
 * Ported from `design_handoff_customer/customer/sheets.jsx`.
 */

import { useEffect, useMemo, useState } from "react";

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import { expandRepeatedItems } from "@/lib/guest-billing/bill-display";
import {
  fmt,
  lineTotal,
  memberPillLabel,
  resolveRoster,
  round2,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  MemberId,
  TableMember,
} from "@/lib/guest-billing/types";

import { Ic, NamePill } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

export interface ShareSheetProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
}

function selectedFromClaims(
  claims: Flow["state"]["claims"],
  itemId: string,
  youId: MemberId,
): MemberId[] {
  const existing = claims[itemId] ?? {};
  const ids = Object.entries(existing)
    .filter(([, units]) => (units ?? 0) > 0.001)
    .map(([id]) => id);
  return ids.length ? ids : [youId];
}

export function ShareSheet({ flow, items, members }: ShareSheetProps) {
  const itemId = flow.state.shareItem;
  const item = itemId ? items.find((i) => i.id === itemId) ?? null : null;
  const displayItem = useMemo(() => {
    if (!item) return null;
    return expandRepeatedItems([item])[0] ?? item;
  }, [item]);

  const [sel, setSel] = useState<MemberId[]>(() =>
    itemId
      ? selectedFromClaims(flow.state.claims, itemId, flow.youId)
      : [flow.youId],
  );

  useEffect(() => {
    if (!itemId) return;
    setSel(selectedFromClaims(flow.state.claims, itemId, flow.youId));
  }, [itemId, flow.state.claims, flow.youId]);

  if (!item || !displayItem) return null;
  const qty = item.qty;
  const displayMembers = resolveRoster(
    members,
    flow.state.name,
    flow.youId,
  );

  const toggle = (id: MemberId) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const resolve = (): Record<MemberId, number> => {
    const out: Record<MemberId, number> = {};
    if (sel.length === 0) return out;
    const u = round2(qty / sel.length);
    sel.forEach((id, i) => {
      out[id] = i === sel.length - 1 ? round2(qty - u * (sel.length - 1)) : u;
    });
    return out;
  };
  const units = resolve();
  const pct = (id: MemberId) =>
    units[id] ? Math.round((units[id] / qty) * 100) : 0;

  const save = () => {
    flow.replaceClaim(item.id, units);
    flow.closeShareItem();
  };

  return (
    <>
      <div className="sheet-scrim" onClick={() => flow.closeShareItem()} />
      <div
        className="sheet glassx"
        role="dialog"
        aria-label="Compartir plato"
        data-testid="share-sheet"
      >
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-title">
            <span style={{ fontSize: 24 }}>{item.emoji}</span> Compartir plato
          </div>
          <div className="sheet-sub">
            {displayItem.displayLabel ?? displayItem.name} · {fmt(lineTotal(item))}{" "}
            · se reparte en partes iguales entre quienes elijas
          </div>
        </div>

        <div className="sheet-body">
          {sel.length > 0 && (
            <div
              className="share-selected-banner"
              data-testid="share-selected-summary"
            >
              <div className="sec-label">Quién comparte este plato</div>
              <div className="portion-chips">
                {sel.map((id) => {
                  const m = displayMembers.find((mm) => mm.id === id) ?? null;
                  return (
                    <span key={id} className="pchip">
                      <NamePill
                        member={m}
                        name={m?.isYou ? flow.state.name : undefined}
                        size={28}
                      />
                      <b className="pp">{pct(id)}%</b>
                      <span
                        style={{
                          color: "var(--c-ink-2)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmt((units[id] ?? 0) * item.unitPrice)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {displayMembers.map((m) => {
              const on = sel.includes(m.id);
              return (
                <div
                  key={m.id}
                  className={"pick" + (on ? " on" : "")}
                  onClick={() => toggle(m.id)}
                  role="button"
                  data-testid={`share-pick-${m.id}`}
                >
                  <NamePill
                    member={m}
                    name={m.isYou ? flow.state.name : undefined}
                    size={38}
                  />
                  <span className="nm">
                    {memberPillLabel(m, m.isYou ? flow.state.name : undefined)}
                  </span>
                  <span className="share-pick-status">
                    {on ? "Seleccionado" : "Toca para incluir"}
                  </span>
                  <span className="c-tick tick">
                    {on && <Ic.check s={14} w={2.6} />}
                  </span>
                </div>
              );
            })}
          </div>

          {sel.length > 1 && (
            <div>
              <div className="sec-label" style={{ marginBottom: 9 }}>
                Así queda · entre {sel.length}
              </div>
              <div className="portion-chips">
                {sel.map((id) => {
                  const m = displayMembers.find((mm) => mm.id === id) ?? null;
                  return (
                    <span key={id} className="pchip">
                      <NamePill
                        member={m}
                        name={m?.isYou ? flow.state.name : undefined}
                        size={28}
                      />
                      <b className="pp">{pct(id)}%</b>
                      <span
                        style={{
                          color: "var(--c-ink-2)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmt((units[id] ?? 0) * item.unitPrice)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="sheet-foot">
          <button
            className="sheet-btn"
            disabled={sel.length === 0}
            onClick={save}
            data-testid="share-save"
          >
            <Ic.check s={18} w={2.6} /> Guardar reparto
          </button>
          <button
            className="sheet-btn ghost"
            onClick={() => flow.closeShareItem()}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
