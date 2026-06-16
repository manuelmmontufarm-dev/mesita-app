"use client";

/**
 * ConfirmStage — pre-payment verification screen.
 *
 * Ported from `design_handoff_customer/customer/flow.jsx` (`ConfirmScreen`,
 * `ConfirmItem`, `ConfirmEqual`, `ConfirmTodo`, `Donut`, `PeopleStrip`).
 *
 * State lives in `useGuestPaymentFlow`; this component is presentational and
 * dispatches via `flow.goToBill()` / `flow.confirmPay()`. Owns local
 * `acked`/`nudge` UI state for the "I understand the table must be fully
 * paid" checkbox required when `mode !== "todo"`.
 */

import { useRef, useState } from "react";

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  billSubtotal,
  computeTotals,
  fmt,
  freeUnits,
  memberSubtotal,
  paidSubtotal,
  unclaimedItems,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Avatar, Ic, LogoMark } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

const HEADS = {
  item: { t: "Revisa y paga lo tuyo", s: "Confirma los platos que escogiste." },
  equal: {
    t: "Paga tu parte igual",
    s: "Lo que falta se divide en partes iguales.",
  },
  todo: {
    t: "Pagas toda la cuenta",
    s: "Cubres la mesa completa de un solo.",
  },
} as const;

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

/* ── Apple-style progress ring ─────────────────────────────── */

function Donut({
  pct,
  size = 168,
  label,
  sub,
  tone = "pay",
}: {
  pct: number;
  size?: number;
  label?: string;
  sub?: string;
  tone?: "pay" | "accent";
}) {
  const p = Math.max(0, Math.min(100, pct));
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = tone === "accent" ? "var(--accent)" : "var(--pay)";
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="donut-svg">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--c-fill-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition:
              "stroke-dashoffset .9s cubic-bezier(.22,1,.36,1), stroke .3s",
          }}
        />
      </svg>
      <div className="donut-hole">
        <div className="donut-pct">
          {Math.round(p)}
          <span>%</span>
        </div>
        {label && <div className="donut-lbl">{label}</div>}
        {sub && <div className="donut-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ── PeopleStrip (used by Equal body) ───────────────────────── */

function PeopleStrip({
  members,
  label = "En la mesa",
  subtitle,
  youName,
}: {
  members: readonly TableMember[];
  label?: string;
  subtitle?: (id: string) => string;
  youName: string;
}) {
  return (
    <div>
      <div className="sec-label" style={{ marginBottom: 8 }}>
        {label}
        <span className="sec-count">{members.length}</span>
      </div>
      <div className="people-strip surfx">
        {members.map((m) => (
          <div key={m.id} className="ps-row">
            <Avatar member={m} size={26} />
            <span className="ps-name">
              {m.isYou ? youName.trim() || "Tú" : m.name}
              {m.isYou && youName.trim() && (
                <span className="tag-you">tú</span>
              )}
            </span>
            {subtitle && <span className="ps-sub">{subtitle(m.id)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ConfirmItem / ConfirmEqual / ConfirmTodo bodies ───────── */

function ConfirmItem({
  flow,
  items,
  members,
}: {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
}) {
  const { state } = flow;
  const { claims, paidItemIds } = state;
  const fullSub = billSubtotal(items);
  const claimedVal = members.reduce(
    (s, m) => s + memberSubtotal(items, claims, m.id),
    0,
  );
  const paidVal = paidSubtotal(items, paidItemIds);
  const coveredVal = Math.max(claimedVal, paidVal);
  const unclaimedVal = Math.max(0, fullSub - coveredVal);
  const pct = fullSub > 0 ? (coveredVal / fullSub) * 100 : 0;
  const free = unclaimedItems(items, claims).filter(
    (it) => !paidItemIds.includes(it.id),
  );
  const allClaimed = free.length === 0;

  return (
    <>
      <div className="confirm-progress surfx">
        <Donut
          pct={pct}
          label="de la mesa"
          tone={allClaimed ? "pay" : "accent"}
        />
        <div className="confirm-legend">
          <div className="cl-row">
            <span className="cl-dot ok" />
            <span className="cl-k">Reclamado o pagado</span>
            <span className="cl-v">{fmt(coveredVal)}</span>
          </div>
          <div className="cl-row">
            <span className="cl-dot warn" />
            <span className="cl-k">Falta</span>
            <span className="cl-v">{fmt(unclaimedVal)}</span>
          </div>
        </div>
      </div>

      {free.length > 0 && (
        <div className="confirm-unclaimed unclaimed-card">
          <div className="uc-h">
            <Ic.bell s={16} /> Aún sin reclamar
          </div>
          <div className="uc-list">
            {free.map((it) => (
              <div key={it.id} className="uc-item">
                <span className="e">{it.emoji}</span>
                <span className="nm">{it.name}</span>
                <span className="amt">
                  {fmt(freeUnits(it, claims) * it.unitPrice)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="disclaimer">
        <div className="disclaimer-em">😄</div>
        <div>
          <b>{allClaimed ? "¡Todo listo!" : "Tranqui:"}</b> puedes pagar lo
          tuyo ahora. Entre todos, la mesa debe quedar pagada antes de cerrar.
        </div>
      </div>
    </>
  );
}

function ConfirmEqual({
  flow,
  members,
  perPerson,
  mesaTotal,
  remainingPeople,
}: {
  flow: Flow;
  members: readonly TableMember[];
  perPerson: number;
  mesaTotal: number;
  remainingPeople: number;
}) {
  return (
    <>
      <div className="split-note surfx">
        <div className="ico">
          <Ic.users s={26} />
        </div>
        <div className="t">Se divide en partes iguales</div>
        <div className="big">{fmt(perPerson)}</div>
        <div className="s">
          La cuenta completa ({fmt(mesaTotal)} con impuestos) se reparte entre{" "}
          {remainingPeople}{" "}
          {remainingPeople === 1 ? "persona" : "personas"}. No importa quién
          pidió qué.
        </div>
      </div>
      <PeopleStrip
        members={members}
        subtitle={() => "Parte igual"}
        youName={flow.state.name}
      />
    </>
  );
}

function ConfirmTodo({
  yourTotal,
  paidSub,
  mesaTotal,
}: {
  yourTotal: number;
  paidSub: number;
  mesaTotal: number;
}) {
  const someonePaid = paidSub > 0.01;
  return (
    <>
      <div className="split-note surfx">
        <div className="ico">
          <Ic.receipt s={26} />
        </div>
        <div className="t">Pagas toda la cuenta</div>
        <div className="big">{fmt(yourTotal)}</div>
        <div className="s">
          {someonePaid
            ? `Ya se pagó ${fmt(paidSub)} de la mesa — tú cubres lo que falta y queda en cero.`
            : `Cubres la cuenta completa de la mesa (${fmt(mesaTotal)} con impuestos). Nadie más tiene que pagar.`}
        </div>
      </div>
      <div className="disclaimer">
        <div className="disclaimer-em">🎉</div>
        <div>
          <b>¡Qué generoso!</b> Con este pago la mesa queda saldada por
          completo.
        </div>
      </div>
    </>
  );
}

/* ── ConfirmStage ──────────────────────────────────────────── */

export interface ConfirmStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
}

export function ConfirmStage({
  flow,
  items,
  members,
  config,
}: ConfirmStageProps) {
  const { state, derived } = flow;
  const { mode } = state;

  const [acked, setAcked] = useState(false);
  const [nudge, setNudge] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ackRef = useRef<HTMLLabelElement | null>(null);

  const head = HEADS[mode] ?? HEADS.item;
  const needsAck = mode !== "todo";

  const fullSub = billSubtotal(items);
  const mesaTotal = computeTotals(fullSub, config, 0).total;
  const paidSub = paidSubtotal(items, state.paidItemIds);

  const tryPay = () => {
    if (needsAck && !acked) {
      // Don't block with an error — guide the eye down to the missed checkbox.
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
          <div className="flow-brand">
            <LogoMark size={28} />
            <span>
              {config.name} · Mesa {config.table}
            </span>
          </div>
          <h1 className="flow-title">{head.t}</h1>
          <p className="flow-lede">{head.s}</p>

          {mode === "equal" ? (
            <ConfirmEqual
              flow={flow}
              members={members}
              perPerson={derived.totals.total}
              mesaTotal={mesaTotal}
              remainingPeople={derived.remainingPeople}
            />
          ) : mode === "todo" ? (
            <ConfirmTodo
              yourTotal={derived.totals.total}
              paidSub={paidSub}
              mesaTotal={mesaTotal}
            />
          ) : (
            <ConfirmItem flow={flow} items={items} members={members} />
          )}

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

          <div className="confirm-yours surfx">
            <div className="cy-k">
              Tu parte
              <small>
                {state.name.trim() || "Invitado"} · Mesa {config.table}
              </small>
            </div>
            <div className="cy-v">{fmt(derived.totals.total)}</div>
          </div>
        </div>

        <div className="flow-foot">
          <button
            className={
              "c-pay-btn" + (needsAck && !acked ? " is-locked" : "")
            }
            onClick={tryPay}
            aria-disabled={needsAck && !acked}
            data-testid="confirm-pay-btn"
          >
            <Ic.lock s={18} /> Pagar {fmt(derived.totals.total)}
          </button>
          <button
            className="flow-secondary"
            onClick={() => flow.goToBill()}
            data-testid="confirm-back-btn"
          >
            Volver a editar
          </button>
        </div>
      </div>
    </div>
  );
}
