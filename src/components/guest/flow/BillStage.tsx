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
  avatarColor,
  billSubtotal,
  claimantsOf,
  computeTotals,
  fmt,
  freeUnits,
  guestAvatarHue,
  guestLabel,
  isItemPaid,
  lineTotal,
  paidSubtotal,
  resolveMemberDisplay,
  resolveRoster,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  Claims,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";
import { expandRepeatedItems } from "@/lib/guest-billing/bill-display";
import { payerAvatarInitials } from "@/lib/guest-billing/bill-shell-scroll";
import type { PendingClaimOp } from "@/lib/demo-optimistic-merge";

import { AvatarStack, AvatarDot, EqualShareVisual, Ic, LogoMark, NamePill, OwnerChip, TableRosterCompact } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

/* ── constantes de texto ─────────────────────────────────────── */

const NAME_PLACEHOLDERS = [
  "Ej: Juanito",
  "Ej: La Ñaña",
  "Ej: El Panita",
  "Ej: María José",
];

const COPY = {
  nameRequired: "Pon tu nombre para saber quién paga qué",
  yourPart: "Tu parte",
};

const SPLIT_MODES = [
  { k: "item" as const, label: "Lo mío", icon: Ic.split },
  { k: "equal" as const, label: "Por iguales", icon: Ic.users },
  { k: "todo" as const, label: "Todo", icon: Ic.receipt },
];

/* ── PayerNameRow (First Page inline name) ─────────────────── */

function PayerNameRow({
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
  fallbackLabel?: string;
}) {
  const [ph, setPh] = useState(NAME_PLACEHOLDERS[0]);
  const [focused, setFocused] = useState(false);
  const trimmed = value.trim();
  const avatarInitials = payerAvatarInitials(value, fallbackLabel ?? "");

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
    <div className={"payer-name-block" + (invalid ? " invalid" : "")}>
      <span
        className="payer-av"
        style={{ background: avatarColor(youHue) }}
        aria-hidden="true"
        data-testid="payer-avatar-initials"
      >
        {avatarInitials}
      </span>
      <div className="payer-name-main">
        <span className="payer-label">Pagas como</span>
        <div className="payer-name-capsule">
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
            size={Math.max(4, trimmed.length || fallbackLabel?.length || 4)}
          />
          <span className="payer-chevron" aria-hidden="true">
            ›
          </span>
        </div>
      </div>
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
  const interactive = mode === "item" && !paid && !isLoading;
  const todoCovers = mode === "todo" && !paid;
  const rowSelected = (mode === "item" && mine && !paid) || todoCovers;

  const displayLabel = item.displayLabel ?? item.name;

  const cls =
    "item-row-fp" +
    (interactive ? " tappable" : "") +
    (rowSelected ? " on" : "") +
    (isLoading ? " syncing" : "") +
    (paid ? " paid" : "");

  const showCheck = mode === "item" || mode === "todo";
  const checkOn = paid || (mode === "item" && mine) || todoCovers;

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
      {showCheck ? (
        <span
          className={
            "item-fp-check" +
            (paid ? " paid" : isLoading ? " loading" : checkOn ? " on" : "")
          }
          aria-label={
            isLoading
              ? "Sincronizando"
              : paid
                ? "Pagado"
                : checkOn
                  ? "Incluido"
                  : "Disponible"
          }
        >
          {isLoading ? (
            <span className="c-tick-spinner" aria-hidden="true" />
          ) : paid || checkOn ? (
            <Ic.check s={13} w={2.2} />
          ) : null}
        </span>
      ) : paid ? (
        <span className="item-fp-check paid" aria-label="Pagado">
          <Ic.check s={13} w={2.2} />
        </span>
      ) : (
        <span className="item-fp-emoji" aria-hidden="true">
          {item.emoji}
        </span>
      )}

      {(mode === "item" || mode === "todo") && (
        <span className="item-fp-emoji" aria-hidden="true">
          {item.emoji}
        </span>
      )}

      <div className="item-fp-main">
        <div className={"item-fp-name" + (paid ? " struck" : "")}>
          {displayLabel}
          {paid && (
            <span className="paid-lock" aria-label="Pagado">
              <Ic.lock s={12} />
            </span>
          )}
        </div>
        <div className="item-fp-sub">
          {paid ? (
            <span className="paid-tag">Pagado</span>
          ) : mode === "item" && isLoading ? (
            <span className="sync-tag">Guardando…</span>
          ) : mode === "item" && claimants.length > 0 ? (
            <OwnerChip
              ids={claimants}
              roster={members}
              youId={youId}
              youName={state.name}
            />
          ) : mode === "todo" && !paid ? (
            <span className="todo-item-tag">Incluido en tu pago</span>
          ) : mode === "item" && free > 0.001 && !mine && claimants.length === 0 ? (
            <span className="free-tag">
              <span className="dot" /> Toca para escogerlo
            </span>
          ) : mode === "item" && free <= 0.001 && !mine && claimants.length === 0 ? (
            <span className="taken-tag">Escogido</span>
          ) : null}
        </div>
      </div>

      <span className={"item-fp-price" + (paid ? " struck" : "")}>
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
  const paidSub = paidSubtotal(items, paidItemIds);
  const someonePaid = paidItemIds.length > 0;

  const myItemCount = items.filter(
    (it) =>
      unitsOf(displayClaims, it.id, flow.youId) > 0 && !paidItemIds.includes(it.id),
  ).length;

  const tipPresets = config.tipPresets.filter((p) => p > 0);
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

  const payerDisplayName =
    state.name.trim() ||
    youMember.seatLabel ||
    members.find((m) => m.id === flow.youId)?.seatLabel ||
    guestLabel(Math.max(1, members.findIndex((m) => m.id === flow.youId) + 1));

  return (
    <>
      <div className="bill-card-fluid" data-testid="bill-card-fluid">
        {/* Venue + total */}
        <div className="bill-card-top">
          <div className="bill-card-venue-row">
            <LogoMark size={24} />
            <span className="bill-card-venue">{config.name}</span>
            <span className="live-pill-sm glassx">
              <span className="dot" /> Mesa {config.table}
            </span>
          </div>
          <div className="bill-card-total-block">
            <span className="bill-card-total-label">Total por pagar</span>
            {someonePaid && remainingTotal < mesaTotal - 0.009 && (
              <span className="bill-card-total-struck">{fmt(mesaTotal)}</span>
            )}
            <span className="bill-card-total-main">{fmt(remainingTotal)}</span>
          </div>
          {someonePaid && (
            <div className="bill-card-paid-hint">
              Pagado {fmt(paidTotalWithTax)} (
              {mesaTotal > 0.01
                ? Math.round((paidTotalWithTax / mesaTotal) * 100)
                : 0}
              %) · mesa {fmt(mesaTotal)}
            </div>
          )}
        </div>

        <hr className="bill-card-hr" />

        {/* Payer + roster */}
        <div className="payer-row">
          <PayerNameRow
            value={state.name}
            invalid={state.nameErr}
            onChange={(v) => flow.setName(v)}
            youHue={youMember.hue}
            fallbackLabel={
              youMember.seatLabel ??
              members.find((m) => m.id === flow.youId)?.seatLabel ??
              guestLabel(
                Math.max(1, members.findIndex((m) => m.id === flow.youId) + 1),
              )
            }
          />
          <TableRosterCompact members={displayMembers} />
        </div>
        {state.nameErr && (
          <div className="payer-warn">
            <Ic.bell s={14} /> {COPY.nameRequired}
          </div>
        )}

        {/* Split modes */}
        <div className="bill-card-modes">
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
        </div>

        {/* Mode context */}
        {mode === "item" && (
          <div className="mode-payer-widget item-mode-widget">
            <span className="owner-chip owner-chip-you owner-chip-header">
              <span className="owner-chip-avs">
                <AvatarDot member={youMember} name={state.name} size={22} />
              </span>
              <span className="owner-chip-label">{payerDisplayName}</span>
            </span>
            <div className="mode-payer-sub">Toca los platos que pediste</div>
          </div>
        )}
        {mode === "equal" && (
          <>
            <div className="bill-card-equal-controls">
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
                  min={2}
                  max={20}
                  onChange={(v) => flow.setPeople(v)}
                />
              </div>
            </div>
            <div className="mode-info-banner">
              Dividido en partes iguales entre <strong>{people}</strong> ·{" "}
              <strong>{fmt(derived.totals.total)}</strong> c/u
            </div>
            <EqualShareVisual
              members={displayMembers}
              people={people}
              perPersonLabel={fmt(derived.totals.total)}
              compact
            />
          </>
        )}
        {mode === "todo" && (
          <>
            <div className="mode-info-banner">
              Pagas la cuenta completa de la mesa
            </div>
            <div className="surfx todo-card">
              <div className="todo-payer-av">
                <span className="todo-payer-crown" aria-hidden="true">
                  👑
                </span>
                <NamePill member={youMember} name={state.name} size={60} />
              </div>
              <div className="todo-t">{payerDisplayName} cierra la mesa</div>
              <div className="todo-big">{fmt(derived.totals.total)}</div>
              <div className="todo-s">
                {someonePaid
                  ? `Ya se pagó ${fmt(paidSub)} · cubres lo que falta`
                  : "Todos los platos incluidos · cuenta completa"}
              </div>
            </div>
          </>
        )}

        {/* Items */}
        <div>
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

        {mode === "item" && myItemCount === 0 && (
          <div className="bill-empty-hint" data-testid="bill-empty-hint">
            <Ic.bell s={14} />
            Toca los platos que pediste para reclamarlos.
          </div>
        )}

        {mode === "item" && (
          <div className="bill-card-foot">
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

        <hr className="bill-card-hr" />

        {/* Fused totals + inline tip */}
        <div className="totals-fused">
          <div className="totals-fused-row">
            <span>
              {mode === "equal"
                ? `Tu parte · 1 de ${people}`
                : mode === "todo"
                  ? "Subtotal · cuenta completa"
                  : `Subtotal · ${myItemCount} plato${myItemCount !== 1 ? "s" : ""}`}
            </span>
            <span className="v">{fmt(derived.subtotal)}</span>
          </div>
          <div className="totals-fused-row">
            <span>IVA {Math.round(config.ivaRate * 100)}%</span>
            <span className="v">{fmt(derived.totals.iva)}</span>
          </div>
          {config.serviceEnabled && (
            <div className="totals-fused-row">
              <span>
                Servicio{" "}
                <span className="badge">{Math.round(config.serviceRate * 100)}%</span>
              </span>
              <span className="v">{fmt(derived.totals.servicio)}</span>
            </div>
          )}
          <div className="totals-fused-row tip-row">
            <span>Propina</span>
            <div className="tip-row-body">
              <div className="tip-inline-chips">
                {tipPresets.map((p) => (
                  <button
                    key={p}
                    className={!otherTip && tip === p ? "on" : ""}
                    onClick={() => {
                      setOtherTip(false);
                      setOtherUsd("");
                      flow.setTip(p);
                    }}
                    data-testid={`bill-tip-${p}`}
                  >
                    {`${p}%`}
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
              {tip > 0 && (
                <span className="tip-amount">{fmt(derived.totals.propina)}</span>
              )}
            </div>
          </div>
          {showOtherTip && (
            <div className="tip-other">
              <span className="tip-other-lbl">
                {derived.subtotal > 0
                  ? "Monto de propina"
                  : "Ingresa luego de tener cuenta"}
              </span>
              <div
                className="tip-pos-display"
                role="group"
                aria-label="Monto de propina en dólares"
              >
                <span className="tip-pos-amount" aria-live="polite">
                  ${(parseInt(otherUsd || "0", 10) / 100).toFixed(2)}
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
                    if (e.key >= "0" && e.key <= "9") {
                      const next = Math.min(
                        parseInt(otherUsd || "0", 10) * 10 + parseInt(e.key, 10),
                        99999999,
                      );
                      const nextStr = String(next);
                      setOtherUsd(nextStr);
                      const amount = next / 100;
                      if (amount > 0) {
                        const pct =
                          Math.round((amount / derived.subtotal) * 100 * 100) / 100;
                        flow.setTip(Math.max(0, pct));
                      } else {
                        flow.setTip(0);
                      }
                    } else if (e.key === "Backspace") {
                      const next = Math.floor(parseInt(otherUsd || "0", 10) / 10);
                      const nextStr = next > 0 ? String(next) : "";
                      setOtherUsd(nextStr);
                      if (next === 0) {
                        flow.setTip(0);
                      } else {
                        const amount = next / 100;
                        const pct =
                          Math.round((amount / derived.subtotal) * 100 * 100) / 100;
                        flow.setTip(Math.max(0, pct));
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <hr className="bill-card-hr" />

        <div className="bill-your-part-row">
          <span className="bill-your-part-label">{COPY.yourPart}</span>
          <span className="bill-your-part-amt" data-testid="bill-total">
            {fmt(derived.totals.total)}
          </span>
        </div>
      </div>

      {state.sharePicker && (
        <SharePicker flow={flow} items={items} members={members} />
      )}
    </>
  );
}
