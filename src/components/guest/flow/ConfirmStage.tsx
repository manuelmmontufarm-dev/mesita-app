"use client";

/**
 * ConfirmStage — pre-payment verification screen.
 *
 * Diseño: jerarquía de 3 cards de tamaño descendente.
 *   Card 1 "Lo tuyo"               — GRANDE, siempre visible.
 *   Card 2 "Otros"                 — MEDIA, colapsable, solo en mode=item.
 *   Card 3 "Falta por reclamar"    — CHICA, solo en mode=item con items libres.
 *
 * Eliminado: Donut / progress bar grande. Sigue: checkbox acknowledgement con
 * scroll-nudge, resumen tax/propina/total, CTA "Pagar tu parte".
 */

import { useMemo, useRef, useState } from "react";

import { payButtonLabel } from "@/lib/guest-billing/bill-display";
import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  billSubtotal,
  computeTotals,
  fmt,
  freeUnits,
  itemOwed,
  memberSubtotal,
  paidSubtotal,
  unclaimedItems,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import { expandRepeatedItems } from "@/lib/guest-billing/bill-display";
import type {
  BillItem,
  Claims,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Ic, LogoMark, NamePill, useBumpOnChange } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

/* ── smooth-scroll helper (some webviews ignore behavior:smooth) ── */

function smoothScrollTo(el: HTMLElement, to: number, ms = 440) {
  const start = el.scrollTop;
  const max = el.scrollHeight - el.clientHeight;
  const target = Math.max(0, Math.min(to, max));
  const t0 = Date.now();
  const ease = (p: number) => 1 - Math.pow(1 - p, 3);
  const id = setInterval(() => {
    const p = Math.min(1, (Date.now() - t0) / ms);
    el.scrollTop = start + (target - start) * ease(p);
    if (p >= 1) clearInterval(id);
  }, 16);
}

/* ── SummaryRow ────────────────────────────────────────────────── */

function SummaryRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="c-sum-row">
      <span>
        {label}
        {badge && <span className="badge">{badge}</span>}
      </span>
      <span className="v">{value}</span>
    </div>
  );
}


function PersonItemLine({
  item, claims, memberId, paid,
}: {
  item: BillItem;
  claims: Flow["state"]["claims"];
  memberId: string;
  paid: boolean;
}) {
  const u = unitsOf(claims, item.id, memberId);
  const shared = Object.keys(claims[item.id] ?? {}).filter((id) => (claims[item.id]?.[id] ?? 0) > 0).length > 1;
  const pct = item.qty > 0 ? Math.round((u / item.qty) * 100) : 0;
  return (
    <div className={"pi" + (paid ? " pi-paid" : "")}>
      <span className="e">{item.emoji}</span>
      <span className="pn"><b>{item.displayLabel ?? item.name}</b></span>
      {paid ? <span className="pi-paidtag"><Ic.check s={10} w={3} /> Pagado</span>
        : shared ? <span className="portion">{pct}%</span>
        : item.qty > 1 ? <span className="portion">×{u}</span> : null}
      <span className="amt">{fmt(itemOwed(item, claims, memberId))}</span>
    </div>
  );
}

function PersonCard({ member, claims, config, typedName, paid, paidItemIds, items }: {
  member: TableMember; claims: Flow["state"]["claims"]; config: RestaurantConfig;
  typedName: string; paid: boolean; paidItemIds: readonly string[]; items: readonly BillItem[];
}) {
  const expanded = useMemo(() => expandRepeatedItems(items), [items]);
  const claimed = expanded.filter((it) => unitsOf(claims, it.id, member.id) > 0);
  const sub = memberSubtotal(items, claims, member.id);
  const owed = computeTotals(sub, config, 0).total;
  return (
    <div className="person surfx" data-testid={`confirm-person-${member.id}`}>
      <div className="person-head">
        <NamePill
          member={member}
          name={member.isYou ? typedName : undefined}
          size={52}
        />
        <div className="nm">
          <div className="s">{claimed.length ? `${claimed.length} ítem${claimed.length > 1 ? "s" : ""}` : "Aún no escoge nada"}</div>
        </div>
        <div className={"owed" + (member.isYou ? " you-amt" : "")}>
          {paid ? <span className="tag-paid"><Ic.check s={11} w={3} /> Pagado</span>
            : <><div className="a">{fmt(owed)}</div><div className="l">con imp.</div></>}
        </div>
      </div>
      {claimed.length > 0 && (
        <div className="person-items">
          {claimed.map((it) => <PersonItemLine key={it.id} item={it} claims={claims} memberId={member.id} paid={paidItemIds.includes(it.id)} />)}
        </div>
      )}
    </div>
  );
}

function PersonasEnMesa({
  flow,
  items,
  members,
  config,
  claims,
}: {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  claims: Claims;
}) {
  const { state, youId } = flow;
  const others = members.filter((m) => m.id !== youId);
  if (others.length === 0) return null;
  return (
    <div data-testid="confirm-personas-mesa">
      <div className="sec-label" style={{ marginBottom: 10 }}>Personas en la mesa</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {others.map((m) => (
          <PersonCard key={m.id} member={m} claims={claims} config={config}
            typedName={state.name} paid={state.paidIds.includes(m.id)}
            paidItemIds={state.paidItemIds} items={items} />
        ))}
      </div>
    </div>
  );
}

function CardSinReclamar({ items, flow }: { items: readonly BillItem[]; flow: Flow; }) {
  const { claims, paidItemIds } = flow.state;
  const freeItems = unclaimedItems(items, claims).filter((it) => !paidItemIds.includes(it.id));
  if (freeItems.length === 0) return null;
  const expandedFree = useMemo(() => expandRepeatedItems(freeItems), [freeItems.map((i) => i.id).join(",")]);
  return (
    <>
      <div className="confirm-unclaimed unclaimed-card surfx" data-testid="confirm-card-falta">
        <div className="uc-h"><Ic.bell s={16} /> Aún sin reclamar</div>
        <div className="uc-list">
          {expandedFree.map((it) => (
            <div key={it.id} className="uc-item">
              <span className="e">{it.emoji}</span>
              <span className="nm">{it.displayLabel ?? it.name}</span>
              <span className="amt">{fmt(freeUnits(it, claims) * it.unitPrice)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


function ConfirmYoursCard({
  flow, items, members, config, mode, derived, claims,
}: {
  flow: Flow; items: readonly BillItem[]; members: readonly TableMember[];
  config: RestaurantConfig; mode: "item" | "equal" | "todo";
  derived: Flow["derived"];
  claims: Claims;
}) {
  const { state, youId } = flow;
  const youMember = members.find((m) => m.id === youId) ?? members[0];
  const expanded = useMemo(() => expandRepeatedItems(items), [items]);
  const myItems = expanded.filter(
    (it) => itemOwed(it, claims, youId) > 0 && !state.paidItemIds.includes(it.id),
  );
  const fullSub = billSubtotal(items);
  const paidSub = paidSubtotal(items, state.paidItemIds);
  return (
    <div className="confirm-card confirm-card-lg surfx" data-testid="confirm-card-lotuyo">
      <div className="confirm-yours-head">
        {youMember && (
          <NamePill
            member={{ ...youMember, isYou: true }}
            name={state.name}
            size={54}
          />
        )}
        <div className="confirm-yours-info">
          <div className="s" style={{ fontSize: 13, color: "var(--c-ink-2)" }}>
            {mode === "item" && myItems.length ? `${myItems.length} ítem${myItems.length > 1 ? "s" : ""}` : mode === "equal" ? `1 de ${state.people} · partes iguales` : "Toda la cuenta"}
          </div>
        </div>
        <div className="confirm-yours-total">{fmt(derived.totals.total)}</div>
      </div>
      {mode === "item" && myItems.length > 0 && (
        <div className="confirm-my-items">
          {myItems.map((it) => {
            const u = unitsOf(claims, it.id, youId);
            const shared =
              Object.keys(claims[it.id] ?? {}).filter(
                (id) => (claims[it.id]?.[id] ?? 0) > 0,
              ).length > 1;
            const pct = it.qty > 0 ? Math.round((u / it.qty) * 100) : 0;
            return (
              <div key={it.id} className="confirm-my-row">
                <span className="confirm-my-emoji">{it.emoji}</span>
                <span className="confirm-my-name">{it.displayLabel ?? it.name}</span>
                {shared ? (
                  <span className="portion">{pct}%</span>
                ) : it.qty > 1 ? (
                  <span className="portion">×{u}</span>
                ) : null}
                <span className="confirm-my-amt">{fmt(itemOwed(it, claims, youId))}</span>
              </div>
            );
          })}
        </div>
      )}
      {mode === "equal" && (
        <p className="confirm-equal-note">
          1 de {state.people} {state.people === 1 ? "persona" : "personas"} — partes iguales
        </p>
      )}
      {mode === "todo" && (
        <p className="confirm-todo-note">
          {paidSub > 0.01 ? `Ya se pagó ${fmt(paidSub)} — cubres lo que falta.` : `Cuenta completa (${fmt(computeTotals(fullSub, config, 0).total)} con imp.).`}
        </p>
      )}
      <div className="confirm-yours-breakdown c-sum-rows">
        <SummaryRow label="Subtotal" value={fmt(derived.totals.subtotal)} />
        <SummaryRow label={`IVA ${Math.round(config.ivaRate * 100)}%`} value={fmt(derived.totals.iva)} />
        {config.serviceEnabled && <SummaryRow label="Servicio" badge={`${Math.round(config.serviceRate * 100)}%`} value={fmt(derived.totals.servicio)} />}
        {derived.totals.propina > 0 && <SummaryRow label="Propina" value={fmt(derived.totals.propina)} />}
        <hr className="c-sum-hair" />
        <div className="c-sum-total-row"><span className="k">Total a pagar</span><span className="v" data-testid="confirm-total">{fmt(derived.totals.total)}</span></div>
      </div>
    </div>
  );
}

/* ── ConfirmStage ──────────────────────────────────────────────── */

export interface ConfirmStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  displayClaims?: Claims;
}

export function ConfirmStage({
  flow,
  items,
  members,
  config,
  displayClaims,
}: ConfirmStageProps) {
  const { state, derived } = flow;
  const { mode } = state;
  const claims = displayClaims ?? state.claims;

  const [acked, setAcked] = useState(false);
  const [nudge, setNudge] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ackRef = useRef<HTMLLabelElement | null>(null);

  const needsAck = mode !== "todo";

  // Bump animation on total change (used by CTA label)
  const bump = useBumpOnChange(Math.round(derived.totals.total * 100));


  const tryPay = () => {
    if (needsAck && !acked) {
      const c = scrollRef.current;
      const a = ackRef.current;
      if (c && a) {
        const to =
          c.scrollTop +
          a.getBoundingClientRect().top -
          c.getBoundingClientRect().top -
          90;
        smoothScrollTo(c, Math.max(0, to));
      }
      setNudge(true);
      setTimeout(() => setNudge(false), 700);
      return;
    }
    flow.confirmPay();
  };

  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="confirm"
    >
      <div className="flowscreen">
        <div className="flow-scroll" ref={scrollRef}>
          {/* ── Header compacto ─────────────────────────────── */}
          <div className="bill-head-compact glassx">
            <div className="bill-head-row">
              <LogoMark size={26} />
              <span className="bill-head-venue">
                {config.name} · Mesa {config.table}
              </span>
              <span className="live-pill-sm glassx">
                <span className="dot" /> En vivo
              </span>
            </div>
          </div>

          {/* Thin progress line — decorative, cool but no Donut */}
          <div
            aria-hidden="true"
            style={{
              height: 3,
              borderRadius: 2,
              background: "var(--c-fill-2)",
              margin: "0 0 18px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, derived.subtotal > 0 ? 100 : 0)}%`,
                background: "var(--pay, var(--accent))",
                borderRadius: 2,
                transition: "width 0.6s cubic-bezier(.22,1,.36,1)",
              }}
            />
          </div>

          <h1 className="flow-title" style={{ marginBottom: 4 }}>
            Revisa y paga lo tuyo
          </h1>
{/* ── Lo tuyo unificado ── */}
          <ConfirmYoursCard flow={flow} items={items} members={members} config={config} mode={mode} derived={derived} claims={claims} />

          {mode === "item" && (
            <PersonasEnMesa flow={flow} items={items} members={members} config={config} claims={claims} />
          )}
          {mode === "item" && <CardSinReclamar items={items} flow={flow} />}

          {/* ── Checkbox acknowledgement ───────────────────────── */}
          {needsAck && (
            <label
              ref={ackRef}
              className={
                "ack" + (acked ? " on" : "") + (nudge ? " nudge" : "")
              }
              data-testid="confirm-ack"
            >
              <input
                type="checkbox"
                checked={acked}
                onChange={(e) => setAcked(e.target.checked)}
              />
              <span className="ack-box">
                {acked && <Ic.check s={14} w={3} />}
              </span>
              <span className="ack-txt">
                Entiendo que{" "}
                <b>toda la cuenta debe quedar pagada</b> entre todos antes de
                cerrar.
              </span>
            </label>
          )}
        </div>

        {/* ── Footer CTA ─────────────────────────────────────── */}
        <div className="flow-foot">
          <button
            className={
              "c-pay-btn" +
              (bump ? " bump" : "") +
              (needsAck && !acked ? " is-locked" : "")
            }
            onClick={tryPay}
            aria-disabled={!derived.canPay || (needsAck && !acked)}
            disabled={!derived.canPay}
            data-testid="confirm-pay-btn"
          >
            <Ic.lock s={18} /> {payButtonLabel(state.mode, fmt(derived.totals.total))}
          </button>
          <button className="flow-secondary solid" onClick={() => flow.goToBill()} data-testid="confirm-back-btn">
            ← Volver a editar
          </button>
        </div>
      </div>
    </div>
  );
}
