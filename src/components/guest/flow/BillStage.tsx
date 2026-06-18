"use client";

/**
 * BillStage — pixel-faithful port of the "Cuenta" tab from
 * `design_handoff_customer/customer/bill.jsx` (BillScreen + BillItemRow +
 * BillListRow), plus the NameField from `ui.jsx` and the SharePicker from
 * `sheets.jsx`.
 *
 * State lives in `useGuestPaymentFlow`; this component is presentational and
 * dispatches via the `flow` API. Renders the scrollable inner content of the
 * Cuenta tab only — the sticky header, segmented tabs, and bottom pay dock
 * are owned by `GuestBillFlow` (the chrome shell).
 */

import { useEffect, useMemo, useState } from "react";

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  claimantsOf,
  fmt,
  freeUnits,
  initialsFor,
  itemOwed,
  lineTotal,
  paidSubtotal,
  unclaimedItems,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Avatar, AvatarStack, Ic } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

const NAME_PLACEHOLDERS = [
  "Ej: Juanito",
  "Ej: La Ñaña",
  "Ej: El Panita",
  "Ej: María José",
];

const COPY = {
  helperItem: "Toca los platos que pediste. Pagas solo lo tuyo.",
  helperEqual: "Lo que falta se reparte en partes iguales.",
  helperTodo: "Pagas toda la cuenta de un solo. ¡Listo!",
  nameRequired: "Pon tu nombre para saber quién paga qué",
  yourPart: "Tu parte",
};

const SPLIT_MODES = [
  { k: "item", label: "Lo mío", icon: Ic.split },
  { k: "equal", label: "Por igual", icon: Ic.users },
  { k: "todo", label: "Todo", icon: Ic.receipt },
] as const;

/* ── NameField with rotating placeholder ─────────────────────── */

function NameField({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  const [ph, setPh] = useState(NAME_PLACEHOLDERS[0]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value || focused) return;
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % NAME_PLACEHOLDERS.length;
      setPh(NAME_PLACEHOLDERS[i]);
    }, 2200);
    return () => clearInterval(id);
  }, [value, focused]);

  return (
    <div>
      <div
        className={"name-field glassx" + (invalid ? " invalid" : "")}
        style={{ borderRadius: 20 }}
      >
        <span className="name-emoji" aria-hidden="true">
          🙋
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={ph}
          aria-label="Tu nombre"
          autoComplete="off"
          spellCheck={false}
          maxLength={22}
          data-testid="bill-name-input"
        />
        {value.trim() ? (
          <Avatar
            member={{ initials: initialsFor(value), hue: 14, isYou: true }}
            size={34}
          />
        ) : null}
      </div>
      {invalid && (
        <div className="name-warn">
          <Ic.bell s={14} /> {COPY.nameRequired}
        </div>
      )}
    </div>
  );
}

/* ── Item rows ───────────────────────────────────────────────── */

function BillItemRow({
  item,
  index,
  flow,
  members,
  mode,
  paid,
}: {
  item: BillItem;
  index: number;
  flow: Flow;
  members: readonly TableMember[];
  mode: "item" | "equal" | "todo";
  paid: boolean;
}) {
  const { state, youId } = flow;
  const yours = unitsOf(state.claims, item.id, youId);
  const free = freeUnits(item, state.claims);
  const others = claimantsOf(state.claims, item.id, members).filter(
    (id) => id !== youId,
  );
  const mine = yours > 0;
  const interactive = mode === "item" && !paid;
  const myAmt = itemOwed(item, state.claims, youId);
  const shared = others.length + (mine ? 1 : 0) > 1;

  const cls =
    "c-item" +
    (interactive ? " tappable" : " passive") +
    (mine && interactive ? " mine" : "") +
    (paid ? " paid" : "");

  return (
    <div
      className={cls}
      onClick={interactive ? () => flow.toggleMine(item) : undefined}
      role={interactive ? "button" : undefined}
      aria-pressed={interactive ? mine : undefined}
      data-testid={`bill-item-${item.id}`}
    >
      {paid ? (
        <span className="c-tick paid-tick on">
          <span className="c-tick-num">{index}</span>
        </span>
      ) : (
        <span className={"c-tick" + (mine ? " on" : "")}>
          <span className="c-tick-num">{index}</span>
        </span>
      )}
      <div className="c-item-main">
        <div className="c-item-name">
          {item.name}{" "}
          <span className="c-item-emoji-inline" aria-hidden="true">
            {item.emoji}
          </span>
        </div>
        <div className="c-item-sub">
          {paid ? (
            <span className="paid-tag">Pagado</span>
          ) : mode === "item" ? (
            <>
              {mine && <span className="tag-you">Tú</span>}
              {others.length > 0 && (
                <AvatarStack
                  ids={
                    shared && mine
                      ? claimantsOf(state.claims, item.id, members)
                      : others
                  }
                  roster={members}
                  size={20}
                  max={4}
                />
              )}
              {shared && <span className="shared-tag">compartido</span>}
              {free > 0.001 && !mine && (
                <span className="free-tag">
                  <span className="dot" /> Toca para escogerlo
                </span>
              )}
            </>
          ) : (
            <span>{item.note}</span>
          )}
        </div>
      </div>
      <div className="c-item-right">
        <span className={"c-item-price" + (paid ? " struck" : "")}>
          {fmt(lineTotal(item))}
        </span>
        {interactive && mine && myAmt > 0 && (
          <span className="c-item-yourshare">tú · {fmt(myAmt)}</span>
        )}
      </div>
    </div>
  );
}

function BillListRow({
  item,
  flow,
  members,
  paid,
}: {
  item: BillItem;
  flow: Flow;
  members: readonly TableMember[];
  paid: boolean;
}) {
  const claimants = claimantsOf(flow.state.claims, item.id, members);
  const shared = claimants.length > 1;
  const first = claimants.length
    ? (members.find((m) => m.id === claimants[0]) ?? null)
    : null;
  return (
    <div className={"c-bl-row" + (paid ? " paid" : "")}>
      <span className="c-bl-emoji">
        {paid ? (
          <span className="bl-paidtick">
            <Ic.check s={13} w={3} />
          </span>
        ) : (
          item.emoji
        )}
      </span>
      <div className="bl-main">
        <div className="c-bl-name">{item.name}</div>
        {paid ? (
          <div className="bl-claim">
            <span className="paid-tag">Pagado</span>
          </div>
        ) : claimants.length > 0 ? (
          <div className="bl-claim">
            {shared ? (
              <>
                <AvatarStack
                  ids={claimants}
                  roster={members}
                  size={18}
                  max={4}
                />
                <span>Compartido</span>
              </>
            ) : (
              <>
                <Avatar member={first} size={18} />
                <span>{first?.isYou ? "Tú" : (first?.name ?? "")}</span>
              </>
            )}
          </div>
        ) : null}
      </div>
      <span className={"c-bl-price" + (paid ? " struck" : "")}>
        {fmt(lineTotal(item))}
      </span>
    </div>
  );
}

/* ── Stepper ─────────────────────────────────────────────────── */

function Stepper({
  value,
  min = 1,
  max = 20,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="c-stepper glassx">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Menos"
      >
        <Ic.minus s={18} />
      </button>
      <span className="ct">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Más"
      >
        <Ic.plus s={18} />
      </button>
    </div>
  );
}

/* ── SharePicker bottom sheet ───────────────────────────────── */

function SharePicker({
  flow,
  items,
  members,
}: {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
}) {
  const visible = items.filter((it) => !flow.state.paidItemIds.includes(it.id));
  return (
    <>
      <div className="sheet-scrim" onClick={() => flow.closeSharePicker()} />
      <div
        className="sheet glassx"
        role="dialog"
        aria-label="Elegir plato para compartir"
        data-testid="share-picker"
      >
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-title">
            <Ic.users s={22} /> Compartir un plato
          </div>
          <div className="sheet-sub">
            Elige el plato que dividieron entre varios.
          </div>
        </div>
        <div className="sheet-body">
          <div className="c-items">
            {visible.map((it) => {
              const claimants = claimantsOf(flow.state.claims, it.id, members);
              const shared = claimants.length > 1;
              return (
                <div
                  key={it.id}
                  className="c-item tappable"
                  role="button"
                  onClick={() => flow.openShareItem(it.id)}
                >
                  <span className="c-item-emoji">{it.emoji}</span>
                  <div className="c-item-main">
                    <div className="c-item-name">{it.name}</div>
                    <div className="c-item-sub">
                      {shared ? (
                        <>
                          <AvatarStack
                            ids={claimants}
                            roster={members}
                            size={20}
                            max={4}
                          />
                          <span className="shared-tag">compartido</span>
                        </>
                      ) : (
                        <span>{it.note}</span>
                      )}
                    </div>
                  </div>
                  <div className="c-item-right">
                    <span className="c-item-price">{fmt(lineTotal(it))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="sheet-foot">
          <button
            className="sheet-btn ghost"
            onClick={() => flow.closeSharePicker()}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

/* ── BillStage (Cuenta tab content) ──────────────────────────── */

export interface BillStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  shareEnabled?: boolean;
}

export function BillStage({
  flow,
  items,
  members,
  config,
  shareEnabled = true,
}: BillStageProps) {
  const { state, derived } = flow;
  const { mode, tip, people, paidItemIds, claims } = state;

  const [otherTip, setOtherTip] = useState(false);

  const fullSub = useMemo(
    () => items.reduce((s, it) => s + lineTotal(it), 0),
    [items],
  );
  const claimedAll = unclaimedItems(items, claims).length === 0;
  const paidSub = paidSubtotal(items, paidItemIds);
  const someonePaid = paidItemIds.length > 0;

  const helper =
    mode === "equal"
      ? COPY.helperEqual
      : mode === "todo"
        ? COPY.helperTodo
        : COPY.helperItem;

  const myItemCount = items.filter(
    (it) =>
      unitsOf(claims, it.id, flow.youId) > 0 && !paidItemIds.includes(it.id),
  ).length;

  const tipPresets = config.tipPresets;
  const tipIsPreset = tipPresets.includes(tip);
  const showOtherTip = otherTip || !tipIsPreset;

  return (
    <>
      {/* name */}
      <div>
        <div className="sec-label" style={{ marginBottom: 9 }}>
          ¿Quién paga?
        </div>
        <NameField
          value={state.name}
          invalid={state.nameErr}
          onChange={(v) => flow.setName(v)}
        />
      </div>

      {/* split mode */}
      <div>
        <div className="sec-label" style={{ marginBottom: 9 }}>
          ¿Cómo dividimos?
        </div>
        <div className="modeseg glassx" role="tablist">
          {SPLIT_MODES.map((m) => {
            const Icon = m.icon;
            const on = mode === m.k;
            return (
              <button
                key={m.k}
                className={on ? "on" : ""}
                onClick={() => flow.setMode(m.k)}
                role="tab"
                aria-selected={on}
                data-testid={`bill-mode-${m.k}`}
              >
                <span className="mi">
                  <Icon s={19} />
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="c-helper" style={{ marginTop: 11 }}>
          {helper}
        </p>
      </div>

      {/* mode-specific control */}
      {mode === "equal" && (
        <div className="surfx" style={{ borderRadius: 22 }}>
          <div className="row-control">
            <div className="lbl">
              ¿Entre cuántos van?
              <small>
                {someonePaid
                  ? `${fmt(derived.remainingSub)} restante ÷ ${people}`
                  : `${fmt(fullSub)} ÷ ${people} personas`}
              </small>
            </div>
            <Stepper
              value={people}
              min={1}
              max={20}
              onChange={(v) => flow.setPeople(v)}
            />
          </div>
        </div>
      )}
      {mode === "todo" && (
        <div className="surfx todo-card">
          <div className="todo-ic">
            <Ic.receipt s={28} />
          </div>
          <div className="todo-t">Pagas toda la cuenta</div>
          <div className="todo-big">{fmt(derived.totals.total)}</div>
          <div className="todo-s">
            {someonePaid
              ? `Ya se pagó ${fmt(paidSub)} · tú cubres lo que falta`
              : "Cubres la cuenta completa de la mesa"}
          </div>
        </div>
      )}

      {/* items */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            margin: "0 6px 9px",
          }}
        >
          <span className="sec-label">
            {mode === "item" ? "Escoge tus platos" : "Cuenta de la mesa"}
          </span>
          <span
            style={{
              fontSize: 13.5,
              color: "var(--c-ink-2)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {mode === "item" && myItemCount > 0
              ? `${myItemCount} tuyo${myItemCount > 1 ? "s" : ""}`
              : `${items.length} platos · ${fmt(fullSub)}`}
          </span>
        </div>
        {mode === "item" ? (
          <div className="surfx c-items">
            {items.map((it, i) => (
              <BillItemRow
                key={it.id}
                item={it}
                index={i + 1}
                flow={flow}
                members={members}
                mode={mode}
                paid={paidItemIds.includes(it.id)}
              />
            ))}
          </div>
        ) : (
          <div className="surfx c-bl-list">
            {items.map((it) => (
              <BillListRow
                key={it.id}
                item={it}
                flow={flow}
                members={members}
                paid={paidItemIds.includes(it.id)}
              />
            ))}
          </div>
        )}
        {mode === "item" && (
          <div className="items-foot">
            {!claimedAll && (
              <p className="c-helper" style={{ margin: 0 }}>
                Toca un plato para escogerlo como tuyo.
              </p>
            )}
            {shareEnabled && (
              <button
                className="share-entry"
                onClick={() => flow.openSharePicker()}
                data-testid="bill-share-entry"
              >
                <Ic.users s={15} /> ¿Compartieron un plato? Divídelo
              </button>
            )}
          </div>
        )}
      </div>

      {/* propina */}
      <div className="surfx" style={{ borderRadius: 22 }}>
        <div className="row-control">
          <div className="lbl">
            Propina<small>Sobre tu parte · opcional</small>
          </div>
          <div className="tip-chips">
            {tipPresets.map((p) => (
              <button
                key={p}
                className={!otherTip && tip === p ? "on" : ""}
                onClick={() => {
                  setOtherTip(false);
                  flow.setTip(p);
                }}
                data-testid={`bill-tip-${p}`}
              >
                {p}%
              </button>
            ))}
            <button
              className={showOtherTip ? "on" : ""}
              onClick={() => setOtherTip(true)}
              data-testid="bill-tip-other"
            >
              Otro
            </button>
          </div>
        </div>
        {showOtherTip && (
          <div className="tip-other">
            <span className="tip-other-lbl">Propina personalizada</span>
            <div className="tip-other-input">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={tip}
                onChange={(e) =>
                  flow.setTip(
                    Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round(parseFloat(e.target.value) || 0),
                      ),
                    ),
                  )
                }
                aria-label="Propina personalizada"
                autoFocus
              />
              <span>%</span>
            </div>
          </div>
        )}
      </div>

      {/* summary */}
      <div className="c-sum glassx">
        <div className="sec-label" style={{ marginBottom: 14 }}>
          {COPY.yourPart}
        </div>
        <SummaryRow
          label={
            mode === "equal"
              ? "Subtotal (tu parte)"
              : mode === "todo"
                ? "Subtotal de la cuenta"
                : `Subtotal · ${myItemCount} ítem${myItemCount !== 1 ? "s" : ""}`
          }
          value={fmt(derived.subtotal)}
        />
        <div className="c-sum-rows" style={{ marginTop: 11 }}>
          <SummaryRow
            label={`IVA ${Math.round(config.ivaRate * 100)}%`}
            value={fmt(derived.totals.iva)}
          />
          {tip > 0 && (
            <SummaryRow
              label={`Propina ${tip}%`}
              value={fmt(derived.totals.propina)}
            />
          )}
          {config.serviceEnabled && (
            <SummaryRow
              label="Servicio"
              badge={`${Math.round(config.serviceRate * 100)}%`}
              value={fmt(derived.totals.servicio)}
            />
          )}
          <hr className="c-sum-hair" />
          <div className="c-sum-total-row">
            <span className="k">Total a pagar</span>
            <span className="v" data-testid="bill-total">
              {fmt(derived.totals.total)}
            </span>
          </div>
        </div>
      </div>

      {state.sharePicker && (
        <SharePicker flow={flow} items={items} members={members} />
      )}
    </>
  );
}

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
