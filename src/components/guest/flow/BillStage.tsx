"use client";

/**
 * BillStage — nueva versión del paso "Cuenta" del flujo de pago al cliente.
 *
 * Cambios vs. versión anterior:
 *   - Header compacto autónomo (sin tab Mesa — el shell lo suprimió).
 *   - SplitModeSelector inline de 3 opciones.
 *   - Items numerados con displayIndex/displayLabel (expandRepeatedItems).
 *   - AvatarStack de claimants visible bajo cada ítem solo en mode=item.
 *   - Badge "Pagado" + texto tachado + lock icon cuando isItemPaid().
 *   - Tip wired a flow.state.tip / flow.setTip.
 *   - CTA inferior via flow.goToConfirm() / derived.canPay.
 *
 * BillItemRow se coloca en este mismo archivo (helper interno nombrado) para
 * mantener cohesión: los tests existentes van contra la lógica pura
 * (split-math / bill-display), no contra esta UI. Si en el futuro se necesita
 * reusar BillItemRow desde otro stage se puede extraer sin romper nada.
 *
 * DECISIÓN DE TOTALES: El header muestra el saldo restante de mesa
 * (`computeTotals(derived.remainingSub, config, 0).total`) — baja cuando
 * alguien paga ítems. El dock sigue mostrando "Tu parte".
 */

import { useEffect, useMemo, useState } from "react";

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import {
  billSubtotal,
  claimantsOf,
  computeTotals,
  fmt,
  freeUnits,
  guestAvatarHue,
  guestLabel,
  initialsFor,
  isItemPaid,
  itemOwed,
  lineTotal,
  paidSubtotal,
  resolveMemberDisplay,
  resolveRoster,
  unclaimedItems,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  Claims,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";
import { expandRepeatedItems } from "@/lib/guest-billing/bill-display";
import type { PendingClaimOp } from "@/lib/demo-optimistic-merge";

import { AvatarStack, EqualShareVisual, Ic, LogoMark, NamePill } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

/* ── constantes de texto ─────────────────────────────────────── */

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
  { k: "item" as const, label: "Lo mío", icon: Ic.split },
  { k: "equal" as const, label: "Por iguales", icon: Ic.users },
  { k: "todo" as const, label: "Todo", icon: Ic.receipt },
];

/* ── NameField ───────────────────────────────────────────────── */

function NameField({
  value,
  invalid,
  onChange,
  youHue,
  fallbackLabel,
}: {
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
  youHue: number;
  /** Shown in the avatar pill when the input is empty — e.g. "Persona 1". */
  fallbackLabel?: string;
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
          maxLength={10}
          data-testid="bill-name-input"
        />
        {value.trim() ? (
          <NamePill
            name={value}
            member={{
              initials: initialsFor(value),
              hue: youHue,
              isYou: true,
            }}
            size={40}
          />
        ) : fallbackLabel ? (
          <NamePill
            label={fallbackLabel}
            member={{ hue: youHue, isYou: true }}
            size={40}
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

/* ── BillItemRow ─────────────────────────────────────────────── */
//
// Renderiza un ítem de la cuenta con:
//   - Chip "#N" (displayIndex) monoespacio a la izquierda.
//   - Emoji + displayLabel (fallback a name).
//   - AvatarStack de claimants visible solo en mode=item.
//   - Precio a la derecha.
//   - Badge "Pagado" + lock + texto tachado cuando isItemPaid.
//   - Tap solo interactivo en mode=item y cuando no está pagado.

export function BillItemRow({
  item,
  flow,
  members,
  mode,
  paid,
  displayClaims,
  pendingClaims = {},
}: {
  item: BillItem;
  flow: Flow;
  members: readonly TableMember[];
  mode: "item" | "equal" | "todo";
  paid: boolean;
  displayClaims: Claims;
  pendingClaims?: Readonly<Record<string, PendingClaimOp>>;
}) {
  const { state, youId } = flow;
  const pendingOp = pendingClaims[item.id];
  const yours = unitsOf(displayClaims, item.id, youId);
  const free = freeUnits(item, displayClaims);
  const claimants = claimantsOf(displayClaims, item.id, members);
  const serverMine = yours > 0;
  const isLoading =
    (pendingOp === "claim" && !serverMine) ||
    (pendingOp === "release" && serverMine);
  const mine = serverMine && !isLoading;
  const shared = claimants.length > 1;
  const interactive = mode === "item" && !paid && !isLoading;
  const myAmt = itemOwed(item, displayClaims, youId);

  const displayIndex = item.displayIndex ?? null;
  const displayLabel = item.displayLabel ?? item.name;

  const cls =
    "c-item" +
    (interactive ? " tappable" : " passive") +
    (mine && mode === "item" && !paid ? " mine" : "") +
    (isLoading ? " syncing" : "") +
    (paid ? " paid" : "");

  return (
    <div
      className={cls}
      onClick={interactive ? () => flow.toggleMine(item) : undefined}
      role={interactive ? "button" : undefined}
      aria-pressed={interactive ? mine : undefined}
      aria-busy={isLoading || undefined}
      data-testid={`bill-item-${item.id}`}
      data-syncing={isLoading ? "true" : undefined}
    >
      {/* Número siempre visible en círculo */}
      {displayIndex !== null ? (
        <span
          className={
            "c-tick" +
            (paid ? " paid-tick on" : isLoading ? " loading" : mine && mode === "item" ? " on" : "")
          }
          aria-label={
            isLoading
              ? `Sincronizando ítem ${displayIndex}`
              : paid
                ? `Ítem ${displayIndex} pagado`
                : mine
                  ? `Ítem ${displayIndex} escogido`
                  : `Ítem ${displayIndex}`
          }
        >
          {isLoading ? (
            <span className="c-tick-spinner" aria-hidden="true" />
          ) : (
            <span className="c-tick-num">{displayIndex}</span>
          )}
        </span>
      ) : (
        paid ? (
          <span className="c-tick paid-tick on" aria-label="Pagado">
            <span className="c-tick-num">✓</span>
          </span>
        ) : mode === "item" ? (
          <span
            className={
              "c-tick" +
              (isLoading ? " loading" : mine ? " on" : "")
            }
            aria-busy={isLoading || undefined}
          >
            {isLoading ? (
              <span className="c-tick-spinner" aria-hidden="true" />
            ) : (
              <span className="c-tick-num">{mine ? "✓" : "·"}</span>
            )}
          </span>
        ) : (
          <span className="c-item-emoji">{item.emoji}</span>
        )
      )}

      <div className="c-item-main">
        {/* Nombre con emoji inline */}
        <div className={"c-item-name" + (paid ? " struck" : "")}>
          {item.emoji && <span className="c-item-emoji-inline">{item.emoji} </span>}
          {displayLabel}
          {paid && (
            <span className="paid-lock" aria-label="Pagado">
              <Ic.lock s={13} />
            </span>
          )}
        </div>

        {/* Fila de subtexto: badge pagado O claimants + estado */}
        <div className="c-item-sub">
          {paid ? (
            <span className="paid-tag">Pagado</span>
          ) : (
            <>
              {mode === "item" && isLoading && (
                <span className="sync-tag">Guardando…</span>
              )}
              {mode === "item" && !isLoading && claimants.length > 0 && (
                <AvatarStack
                  ids={claimants}
                  roster={members}
                  size={28}
                  max={4}
                  youId={youId}
                  youName={state.name}
                />
              )}
              {mode === "item" && shared && (
                <span className="shared-tag">compartido</span>
              )}
              {mode === "item" && free > 0.001 && !mine && claimants.length === 0 && (
                <span className="free-tag">
                  <span className="dot" /> Toca para escogerlo
                </span>
              )}
              {mode === "item" && free <= 0.001 && !mine && !paid && claimants.length === 0 && (
                <span className="taken-tag">Escogido</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Precio a la derecha */}
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
                            size={28}
                            max={4}
                            youId={flow.youId}
                            youName={flow.state.name}
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

/* ── SummaryRow helper ────────────────────────────────────────── */

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

/* ── BillStage ───────────────────────────────────────────────── */

export interface BillStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  shareEnabled?: boolean;
  /** Authoritative claims from server — check + avatars only after sync. */
  sessionClaims?: Claims;
  /** In-flight claim/release on this device — spinner until server confirms. */
  pendingClaims?: Readonly<Record<string, PendingClaimOp>>;
}

export function BillStage({
  flow,
  items,
  members,
  config,
  shareEnabled = true,
  sessionClaims,
  pendingClaims = {},
}: BillStageProps) {
  const { state, derived } = flow;
  const { mode, tip, people, paidItemIds, claims: localClaims } = state;
  /** Server is source of truth for item selection UI (no optimistic check flicker). */
  const displayClaims = sessionClaims ?? localClaims;

  const [otherTip, setOtherTip] = useState(false);
  // Monto en USD que el usuario teclea en "Otro" — persiste aunque el parent
  // solo guarde tipPct.
  const [otherUsd, setOtherUsd] = useState<string>('');

  // items numerados; pagados primero en la lista
  const sortedItems = useMemo(() => {
    const expanded = expandRepeatedItems(items);
    const paid: BillItem[] = [];
    const unpaid: BillItem[] = [];
    for (const it of expanded) {
      if (isItemPaid(paidItemIds, it.id)) paid.push(it);
      else unpaid.push(it);
    }
    return [...paid, ...unpaid];
  }, [items, paidItemIds]);

  // Saldo restante de mesa incl. IVA + servicio sin propina (header).
  const remainingTotal = useMemo(
    () => computeTotals(derived.remainingSub, config, 0).total,
    [derived.remainingSub, config],
  );

  const paidTotalWithTax = useMemo(
    () => computeTotals(paidSubtotal(items, paidItemIds), config, 0).total,
    [items, paidItemIds, config],
  );

  const fullSub = useMemo(() => billSubtotal(items), [items]);
  const claimedAll = unclaimedItems(items, displayClaims).length === 0;
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
      unitsOf(displayClaims, it.id, flow.youId) > 0 && !paidItemIds.includes(it.id),
  ).length;

  const tipPresets = config.tipPresets;
  const tipIsPreset = tipPresets.includes(tip);
  const showOtherTip = otherTip || !tipIsPreset;

  const mesaTotal = useMemo(
    () => computeTotals(fullSub, config, 0).total,
    [fullSub, config],
  );

  const displayMembers = useMemo(
    () => resolveRoster(members, state.name, flow.youId),
    [members, state.name, flow.youId],
  );

  const youMember = useMemo(
    () =>
      displayMembers.find((m) => m.id === flow.youId) ??
      resolveMemberDisplay(
        {
          id: flow.youId,
          name: "Tú",
          initials: "Tú",
          hue: members.find((m) => m.id === flow.youId)?.hue ?? guestAvatarHue(0),
          isYou: true,
        },
        state.name,
        flow.youId,
      ),
    [displayMembers, flow.youId, state.name, members],
  );

  return (
    <>
      {/* ── Header compacto ─────────────────────────────────── */}
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
        <div className="bill-head-total-row">
          <span className="bill-head-total-label">Total por pagar:</span>
          <span className="bill-head-total-amount">{fmt(remainingTotal)}</span>
        </div>
        {someonePaid && (
          <div className="bill-head-paid-hint">
            Pagado {fmt(paidTotalWithTax)} · mesa {fmt(mesaTotal)}
          </div>
        )}
      </div>

      {/* ── Nombre ──────────────────────────────────────────── */}
      <div>
        <div className="sec-label" style={{ marginBottom: 9 }}>
          ¿Quién paga?
        </div>
        <NameField
          value={state.name}
          invalid={state.nameErr}
          onChange={(v) => flow.setName(v)}
          youHue={youMember.hue}
          fallbackLabel={
            youMember.seatLabel ??
            members.find((m) => m.id === flow.youId)?.seatLabel ??
            guestLabel(Math.max(1, members.findIndex((m) => m.id === flow.youId) + 1))
          }
        />
      </div>

      {/* ── SplitModeSelector ───────────────────────────────── */}
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

      {/* ── Control específico del modo ─────────────────────── */}
      {mode === "equal" && (
        <>
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
          <EqualShareVisual
            members={displayMembers}
            people={people}
            perPersonLabel={fmt(derived.totals.total)}
          />
        </>
      )}
      {mode === "todo" && (
        <div className="surfx todo-card">
          <div className="todo-payer-av">
            <span className="todo-payer-crown" aria-hidden="true">
              👑
            </span>
            <NamePill member={youMember} name={state.name} size={60} />
          </div>
          <div className="todo-t">Tú cierras la mesa</div>
          <div className="todo-big">{fmt(derived.totals.total)}</div>
          <div className="todo-s">
            {someonePaid
              ? `Ya se pagó ${fmt(paidSub)} · tú cubres lo que falta`
              : "Cubres la cuenta completa de la mesa"}
          </div>
        </div>
      )}

      {/* ── Lista de ítems ──────────────────────────────────── */}
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

        <div className="surfx c-items">
          {sortedItems.map((it) => (
            <BillItemRow
              key={it.id}
              item={it}
              flow={flow}
              members={displayMembers}
              mode={mode}
              paid={isItemPaid(paidItemIds, it.id)}
              displayClaims={displayClaims}
              pendingClaims={pendingClaims}
            />
          ))}
        </div>

        {/* Empty-state hint when in item mode and the user has claimed 0 items —
            gentle nudge that disappears the moment they tap their first plate. */}
        {mode === "item" && myItemCount === 0 && (
          <div className="bill-empty-hint" data-testid="bill-empty-hint">
            <Ic.bell s={14} />
            Toca los platos que pediste para reclamarlos.
          </div>
        )}

        {mode === "item" && (
          <div className="items-foot">
            {!claimedAll && myItemCount > 0 && (
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

      {/* ── Propina ─────────────────────────────────────────── */}
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
                  setOtherUsd('');
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
            <span className="tip-other-lbl">
              {derived.subtotal > 0
                ? 'Monto de propina'
                : 'Ingresa luego de tener cuenta'}
            </span>
            {/* POS-style centavos display — fills right-to-left as user types digits */}
            <div
              className="tip-pos-display"
              role="group"
              aria-label="Monto de propina en dólares"
            >
              <span className="tip-pos-amount" aria-live="polite">
                ${(parseInt(otherUsd || '0', 10) / 100).toFixed(2)}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value=""
                readOnly={derived.subtotal <= 0}
                disabled={derived.subtotal <= 0}
                aria-label="Monto de propina en dólares"
                autoFocus
                className="tip-pos-hidden-input"
                onKeyDown={(e) => {
                  if (derived.subtotal <= 0) return;
                  if (e.key >= '0' && e.key <= '9') {
                    const next = Math.min(
                      parseInt(otherUsd || '0', 10) * 10 + parseInt(e.key, 10),
                      99999999,
                    );
                    const nextStr = String(next);
                    setOtherUsd(nextStr);
                    const amount = next / 100;
                    if (amount > 0) {
                      const pct = Math.round((amount / derived.subtotal) * 100 * 100) / 100;
                      flow.setTip(Math.max(0, pct));
                    } else {
                      flow.setTip(0);
                    }
                  } else if (e.key === 'Backspace') {
                    const next = Math.floor(parseInt(otherUsd || '0', 10) / 10);
                    const nextStr = next > 0 ? String(next) : '';
                    setOtherUsd(nextStr);
                    if (next === 0) {
                      flow.setTip(0);
                    } else {
                      const amount = next / 100;
                      const pct = Math.round((amount / derived.subtotal) * 100 * 100) / 100;
                      flow.setTip(Math.max(0, pct));
                    }
                  }
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Resumen (tu parte) ──────────────────────────────── */}
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
              label={showOtherTip ? 'Propina' : `Propina ${tip}%`}
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

      {/* CTA handled by the sticky dock in BillShellStage — no inline button here */}
      <div style={{ height: 8 }} aria-hidden="true" />

      {state.sharePicker && (
        <SharePicker flow={flow} items={items} members={members} />
      )}
    </>
  );
}
