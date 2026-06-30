"use client";

/**
 * WaitingSuccessStage — unified Waiting + Success screen.
 *
 * Replaces the separate WaitingStage and SuccessStage so the component root
 * never unmounts during the waiting→success transition. The ReceiptDrawer
 * lives in GuestBillFlow (one level up) and therefore also survives.
 *
 * Phase derivation:
 *   phase = derived.remainingSub <= 0.01 ? "success" : "waiting"
 *
 * Cross-fade between phases is handled with CSS transitions + a `displayedPhase`
 * state that lags 300 ms behind the real phase (no framer-motion dependency).
 *
 * Diner mode fallback (useMultiGuestState does NOT expose per-member mode):
 *   - member has any claim entry  → "item"
 *   - state.mode === "todo"       → "todo"
 *   - otherwise                  → "equal"
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { latestReceipt, type useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import { expandRepeatedItems, backToBillLabel } from "@/lib/guest-billing/bill-display";
import {
  assignPayerBadges,
  badgesForGuest,
  type PayerBadge,
  type PaymentForBadges,
} from "@/lib/guest-billing/payer-badges";
import {
  billSubtotal,
  computeTotals,
  equalShareSubtotal,
  fmt,
  memberSubtotal,
  resolveMemberDisplay,
  resolveRoster,
  initialsFor,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  MemberId,
  RestaurantConfig,
  TableMember,
  TablePaymentSummary,
} from "@/lib/guest-billing/types";
import type { DemoTableProgress } from "@/lib/guest-billing/demo-table-progress";
import { resolveMesaPaidPct } from "@/lib/guest-billing/demo-table-progress";

import { Ic, LogoMark, NamePill, useBumpOnChange } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

export interface WaitingSuccessStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  paidSummaries?: readonly TablePaymentSummary[];
  demoTableProgress?: DemoTableProgress;
  onResetDemo?: () => Promise<void>;
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function unitLabel(units: number): string {
  if (Math.abs(units - 0.5) < 0.01) return "(½)";
  if (Math.abs(units - Math.round(units)) > 0.01) return `(${units})`;
  return "";
}

function toBadgePayments(
  paidSummaries: readonly TablePaymentSummary[],
): PaymentForBadges[] {
  return paidSummaries.map((p) => ({
    guestId: p.guestId,
    guestName: p.guestName,
    amount: p.amount,
    tip: p.tip ?? 0,
    mode: p.mode ?? "equal",
    createdAt: p.createdAt ?? new Date(0).toISOString(),
    itemCount: p.itemCount,
  }));
}

function PayerBadgeChip({ badge }: { badge: PayerBadge }) {
  return (
    <p className="ws-payer-quip" title={badge.title}>
      <span className="ws-payer-quip-emoji" aria-hidden="true">
        {badge.emoji}
      </span>
      {badge.subtitle}
    </p>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────── */


function CelebrateMood() {
  return (
    <div className="ws-celebrate" aria-hidden="true">
      <div className="ws-celebrate-frame">
        <span className="ws-celebrate-emoji ws-celebrate-emoji-1">🕺</span>
        <span className="ws-celebrate-emoji ws-celebrate-emoji-2">💃</span>
        <span className="ws-celebrate-emoji ws-celebrate-emoji-3">🎉</span>
      </div>
      <p className="ws-celebrate-cap">Tú ya pagaste. La mesa sigue en modo fiesta</p>
    </div>
  );
}

function PaymentRegisteredEyebrow({ count }: { count: number }) {
  const bump = useBumpOnChange(count);
  const label =
    count === 1 ? "1 pago registrado" : `${count} pagos registrados`;
  return (
    <p
      className={"ws-reg-eyebrow" + (bump ? " ws-pay-count-pop" : "")}
      data-testid="ws-payment-count"
    >
      {label}
    </p>
  );
}

function MesaProgressRing({
  paidPct,
  remainingAmt,
  paidCount,
  totalCount,
  paidRows,
  showBadges = false,
  tableOpen = true,
}: {
  paidPct: number;
  remainingAmt: string;
  paidCount: number;
  totalCount: number;
  paidRows: Array<{ member: TableMember; amount: string; badges: PayerBadge[]; key: string }>;
  showBadges?: boolean;
  tableOpen?: boolean;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, paidPct));
  const offset = c * (1 - clamped / 100);
  const pctBump = useBumpOnChange(clamped);
  const countBump = useBumpOnChange(paidCount);

  return (
    <div
      className="ws-mesa-ring surfx"
      data-testid="ws-mesa-ring"
      aria-label={`${clamped}% de la mesa ya está pagado`}
    >
      <div className="ws-mesa-ring-dial">
        <svg viewBox="0 0 128 128" className="ws-mesa-ring-svg" aria-hidden="true">
          <circle className="ws-mesa-ring-track" cx="64" cy="64" r={r} />
          <circle
            className="ws-mesa-ring-fill"
            cx="64"
            cy="64"
            r={r}
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="ws-mesa-ring-center">
          <span className={"ws-mesa-ring-pct" + (pctBump ? " bump" : "")}>
            {clamped}%
          </span>
          <span className="ws-mesa-ring-lbl">de la mesa pagado</span>
          <span className="ws-mesa-ring-amt">{remainingAmt}</span>
        </div>
      </div>

      <CelebrateMood />

      <div className="ws-mesa-ring-meta">
        <span className="live-pill-sm glassx">
          <span className="dot" /> En vivo
        </span>
        <span
          className={"ws-mesa-ring-count" + (countBump ? " ws-pay-count-pop" : "")}
        >
          {tableOpen
            ? paidCount === 1
              ? "1 pago en la mesa"
              : `${paidCount} pagos en la mesa`
            : `${paidCount} de ${Math.max(totalCount, paidCount)} pagaron`}
        </span>
      </div>

      {paidRows.length > 0 && (
        <div className="ws-paid-sofar">
          <div className="ws-paid-sofar-title">Ya pagaron</div>
          {paidRows.map(({ member, amount, badges, key }) => (
            <div key={key} className="ws-paid-sofar-row">
              <div className="ws-paid-sofar-left">
                <NamePill member={member} size={34} />
                {showBadges && badges[0] ? (
                  <div className="ws-payer-badge-row ws-payer-badge-row-inline">
                    <PayerBadgeChip badge={badges[0]} />
                  </div>
                ) : null}
              </div>
              <span className="ws-paid-sofar-amt">{amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodoChampionHero({
  member,
}: {
  member: { name?: string; initials?: string; hue?: number; isYou?: boolean };
}) {
  return (
    <div className="ws-king-hero" data-testid="ws-todo-champion">
      <span className="ws-hero-emoji-row" aria-hidden="true">
        👑
      </span>
      <NamePill member={member} size={56} />
      <p className="ws-king-title">Rey de la mesa</p>
      <p className="ws-king-sub">Pagaste TODO. Leyenda.</p>
    </div>
  );
}

const PAYER_EMOJIS = ["🎉", "✨", "🙌", "😎", "🔥", "💚"] as const;

function PayerCelebrationHero({
  member,
  name,
}: {
  member: TableMember;
  name?: string;
}) {
  const emoji = PAYER_EMOJIS[Math.abs(member.id.charCodeAt(0)) % PAYER_EMOJIS.length];
  return (
    <div className="ws-payer-hero" data-testid="ws-payer-celebration">
      <span className="ws-hero-emoji-row" aria-hidden="true">
        {emoji}
      </span>
      <NamePill member={member} name={name} size={56} />
      <p className="ws-payer-title">¡Listo, pagaste!</p>
      <p className="ws-payer-sub">Tu parte quedó registrada. Buen provecho.</p>
    </div>
  );
}

const SUCCESS_QUIPS = [
  "El mesero ya te admira.",
  "Factura en camino — sin filas.",
  "Mesa cerrada. Buen servicio.",
  "Eso sí es pagar con estilo.",
];

/* ── main component ─────────────────────────────────────────────────────── */

export function WaitingSuccessStage({
  flow,
  items,
  members,
  config,
  paidSummaries = [],
  demoTableProgress,
  onResetDemo,
}: WaitingSuccessStageProps) {
  const { state, derived, youId } = flow;
  const { mode, claims, paidIds, people } = state;
  const [resetting, setResetting] = useState(false);

  /* ── phase derivation ─────────────────────────────────────────────────── */

  const phase: "waiting" | "success" = demoTableProgress
    ? demoTableProgress.tableClosed
      ? "success"
      : "waiting"
    : derived.remainingSub <= 0.01
      ? "success"
      : "waiting";

  // Lag the displayed phase by 300 ms for a CSS cross-fade.
  const [displayedPhase, setDisplayedPhase] = useState<"waiting" | "success">(
    phase,
  );
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase === displayedPhase) return;
    setFading(true);
    timerRef.current = setTimeout(() => {
      setDisplayedPhase(phase);
      setFading(false);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, displayedPhase]);

  /* ── confetti burst on success ────────────────────────────────────────── */
  //
  // Stripe-Atlas / Strava-grade celebration: 4 capped bursts using the brand
  // palette (verde MesitaQR + dorado cálido + crema). Mixed shapes (circles +
  // squares) for the main bursts, plus a star sparkle layer at the end. The
  // timing is sequenced to feel like a single confident "yes you did it"
  // moment rather than a chain of pops. `confetti.reset()` runs on unmount.
  const thanksConfettiRef = useRef(false);
  useEffect(() => {
    if (phase === "waiting" && !thanksConfettiRef.current) {
      thanksConfettiRef.current = true;
    }
    if (phase !== "success" && phase !== "waiting") return;
    if (phase === "waiting" && thanksConfettiRef.current === false) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;
    let cancelled = false;
    type ConfettiFn = ((opts: Record<string, unknown>) => void) & {
      reset: () => void;
    };
    let confettiInstance: ConfettiFn | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Brand palette — verde MesitaQR + dorado cálido + blanco crema.
    const colors = ["#1A9E62", "#2fb37e", "#F5C100", "#FFF7E0", "#FFFFFF"];

    (async () => {
      const confetti = (await import("canvas-confetti")).default as ConfettiFn;
      if (cancelled) return;
      confettiInstance = confetti;

      // Burst 1 (0 ms): center-high, the hero burst.
      confetti({
        particleCount: 180,
        spread: 70,
        startVelocity: 50,
        origin: { x: 0.5, y: 0.42 },
        colors,
        shapes: ["circle", "square"],
        scalar: 1,
        ticks: 220,
        gravity: 0.95,
        disableForReducedMotion: true,
      });

      // Burst 2 (200 ms): from-left low, angled up-right.
      timers.push(
        setTimeout(() => {
          if (cancelled || !confettiInstance) return;
          confettiInstance({
            particleCount: 100,
            angle: 60,
            spread: 60,
            startVelocity: 60,
            origin: { x: 0, y: 0.75 },
            colors,
            shapes: ["circle", "square"],
            scalar: 0.95,
            ticks: 200,
            gravity: 1.0,
            disableForReducedMotion: true,
          });
        }, 200),
      );

      // Burst 3 (450 ms): from-right low, mirroring burst 2.
      timers.push(
        setTimeout(() => {
          if (cancelled || !confettiInstance) return;
          confettiInstance({
            particleCount: 100,
            angle: 120,
            spread: 60,
            startVelocity: 60,
            origin: { x: 1, y: 0.75 },
            colors,
            shapes: ["circle", "square"],
            scalar: 0.95,
            ticks: 200,
            gravity: 1.0,
            disableForReducedMotion: true,
          });
        }, 450),
      );

      // Burst 4 (800 ms): center sparkle layer — tiny "stars" with high
      // spread that drift slowly down on top of the main confetti.
      timers.push(
        setTimeout(() => {
          if (cancelled || !confettiInstance) return;
          confettiInstance({
            particleCount: 60,
            spread: 160,
            startVelocity: 25,
            origin: { x: 0.5, y: 0.4 },
            colors,
            shapes: ["star"],
            scalar: 0.7,
            ticks: 260,
            gravity: 0.55,
            decay: 0.93,
            disableForReducedMotion: true,
          });
        }, 800),
      );
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      // Clear any in-flight particles when the stage flips away.
      if (confettiInstance) {
        try {
          confettiInstance.reset();
        } catch {
          /* canvas-confetti may already be torn down — safe to ignore */
        }
      }
    };
  }, [phase]);

  /* ── shared math ──────────────────────────────────────────────────────── */

  // Both `mesaTotal` and `fullSub` are derived inside `resolveMesaPaidPct`
  // now — kept here as a comment so future readers don't reintroduce them.
  const remainingSub =
    demoTableProgress?.remainingSub ?? derived.remainingSub;
  const remainingTotal = computeTotals(
    Math.max(0, remainingSub),
    config,
    state.tip,
  ).total;
  const paidPct = useMemo(
    () =>
      resolveMesaPaidPct({
        items,
        paidItemIds: state.paidItemIds,
        paidSummaries,
        config,
        demoProgress: demoTableProgress,
      }),
    [
      items,
      state.paidItemIds,
      paidSummaries,
      config,
      demoTableProgress,
    ],
  );
  const paidGuestCount =
    paidSummaries.length > 0
      ? paidSummaries.length
      : demoTableProgress?.paidCount ??
        Math.max(paidSummaries.length, state.paidIds.length);
  const totalGuestCount = Math.max(
    members.length,
    people,
    paidGuestCount,
    paidSummaries.length,
  );

  const tableClosed = demoTableProgress?.tableClosed ?? remainingTotal <= 0.01;
  const backToBillCta = backToBillLabel(remainingTotal, tableClosed);
  const displayMembers = resolveRoster(members, state.name, youId);
  const youDisplay = resolveMemberDisplay(
    displayMembers.find((m) => m.id === youId) ?? displayMembers[0],
    state.name,
    youId,
  );

  const owed = (id: MemberId): number => {
    if (mode === "equal") {
      const shareSub = equalShareSubtotal(
        billSubtotal(items),
        people,
        derived.remainingSub,
      );
      return computeTotals(shareSub, config, state.tip).total;
    }
    const itemAmt = computeTotals(
      memberSubtotal(items, claims, id),
      config,
      state.tip,
    ).total;
    if (mode === "todo") return id === youId ? derived.totals.total : itemAmt;
    return itemAmt;
  };

  const displayName = state.name.trim() || latestReceipt(state)?.name || "tú";

  const successQuip = useMemo(
    () => SUCCESS_QUIPS[Math.floor(Math.random() * SUCCESS_QUIPS.length)] ?? SUCCESS_QUIPS[0],
    [],
  );

  /* ── expanded items for per-diner item list ───────────────────────────── */

  const expandedItems = useMemo(() => expandRepeatedItems(items), [items]);

  const badgePayments = useMemo(
    () => toBadgePayments(paidSummaries),
    [paidSummaries],
  );

  const badgeAwards = useMemo(
    () => assignPayerBadges(badgePayments, { final: phase === "success" }),
    [badgePayments, phase],
  );

  const paidRows = useMemo(() => {
    type Acc = {
      member: TableMember;
      amount: number;
    };
    const byGuest = new Map<string, Acc>();

    const upsert = (guestId: string, member: TableMember, amount: number) => {
      const existing = byGuest.get(guestId);
      if (existing) {
        existing.amount += amount;
        return;
      }
      byGuest.set(guestId, { member, amount });
    };

    for (const payment of paidSummaries) {
      const member =
        displayMembers.find((m) => m.id === payment.guestId) ??
        resolveMemberDisplay(
          {
            id: payment.guestId,
            name: payment.guestName,
            initials: initialsFor(payment.guestName),
            hue: 210,
          },
          payment.guestId === youId ? state.name : "",
          youId,
        );
      upsert(
        payment.guestId,
        resolveMemberDisplay(
          member,
          member.id === youId ? state.name : "",
          youId,
        ),
        payment.amount,
      );
    }

    if (byGuest.size === 0) {
      for (const id of paidIds) {
        const member = displayMembers.find((m) => m.id === id);
        if (!member) continue;
        upsert(
          id,
          resolveMemberDisplay(member, state.name, youId),
          latestReceipt(state)?.amount ?? 0,
        );
      }
    }

    return Array.from(byGuest.entries()).map(([guestId, row]) => ({
      key: guestId,
      member: row.member,
      amount: fmt(row.amount),
      badges: badgesForGuest(badgeAwards, guestId),
    }));
  }, [paidSummaries, paidIds, displayMembers, youId, state.name, state, badgeAwards]);

  /* ── pending members list (for waiting phase) ─────────────────────────── */

  const pendingMembers = members.filter(
    (m) => !paidIds.includes(m.id) && owed(m.id) > 0.001,
  );

  function memberModeFor(memberId: MemberId): "item" | "equal" | "todo" {
    // Fallback: useMultiGuestState does not expose per-member mode.
    if (mode === "todo" && memberId === youId) return "todo";
    const hasClaims = Object.keys(claims).some(
      (itemId) => (claims[itemId]?.[memberId] ?? 0) > 0,
    );
    if (hasClaims) return "item";
    if (mode === "equal") return "equal";
    return "equal";
  }

  function memberItemLabel(memberId: MemberId): string {
    const memberMode = memberModeFor(memberId);
    if (memberMode === "todo") return "Toda la cuenta";
    if (memberMode === "equal") {
      return "Parte igual";
    }
    // item mode — build compact item list
    const claimed = expandedItems.filter(
      (it) => unitsOf(claims, it.id, memberId) > 0,
    );
    if (claimed.length === 0) return "Sin consumo";
    return claimed
      .map((it) => {
        const units = unitsOf(claims, it.id, memberId);
        const suffix = unitLabel(units);
        return it.name + (suffix ? ` ${suffix}` : "");
      })
      .join(" · ");
  }

  /* ── render: waiting phase ────────────────────────────────────────────── */

  const waitingScroll = (
    <div className="flow-scroll wait-scroll ws-waiting-body">
      <div className="ws-payment-registered">
        <div className="ws-reg-badge" aria-hidden="true">
          <Ic.check s={22} w={3} />
        </div>
        <PaymentRegisteredEyebrow count={paidGuestCount} />
        <h1 className="flow-title ws-reg-title">
          ¡Gracias{displayName !== "tú" ? `, ${displayName}` : ""}!
        </h1>
        <p className="flow-lede ws-reg-lede">
          Tu pago en {config.name} quedó guardado en MesitaQR{" "}
          <span aria-hidden="true">❤️</span>
        </p>
      </div>

      <MesaProgressRing
        paidPct={paidPct}
        remainingAmt={
          remainingTotal > 0.01
            ? `Faltan ${fmt(remainingTotal)}`
            : "¡Mesa completa!"
        }
        paidCount={paidGuestCount}
        totalCount={totalGuestCount}
        paidRows={paidRows}
        showBadges={false}
        tableOpen={!demoTableProgress?.tableClosed}
      />

        {pendingMembers.length > 0 && (
          <div className="ws-pending-list surfx">

          <div className="ws-pending-title">Pendientes de pago</div>
          {pendingMembers.map((m) => {
            const resolved = resolveMemberDisplay(m, state.name, youId);
            return (
              <div
                key={m.id}
                className="ws-pending-row"
                data-testid={`ws-pending-${m.id}`}
              >
                <NamePill member={resolved} name={m.isYou ? state.name : undefined} size={38} />
                <div className="ws-pending-info">
                  <span className="ws-pending-items">{memberItemLabel(m.id)}</span>
                </div>
                <span className="ws-pending-amt">{fmt(owed(m.id))}</span>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="ws-back-mesa-btn ws-back-mesa-inline"
        onClick={() => flow.goToBill()}
        data-testid="waiting-back-btn"
      >
        <Ic.users s={16} /> {backToBillCta}
      </button>
    </div>
  );

  /* ── render: success phase ────────────────────────────────────────────── */

  const successContent = (
    <div className="ws-success state-wrap completed">
      {mode === "todo" ? (
        <TodoChampionHero member={youDisplay} />
      ) : (
        <PayerCelebrationHero member={youDisplay} name={state.name} />
      )}
      <div className="ok-title">
        {mode === "todo" ? "¡Cuenta completada!" : "¡Mesa cerrada!"}
      </div>
      <div className="completed-sub">
        {mode === "todo"
          ? "Cerraste la mesa entera. Respeto total."
          : "Entre todos lo lograron. Buen servicio."}
      </div>
      <p className="ws-success-quip">{successQuip}</p>

      {paidRows.length > 0 && (
        <div className="ws-paid-sofar ws-paid-sofar-success surfx">
          <div className="ws-paid-sofar-title">Resumen de la mesa</div>
          {paidRows.map(({ member, amount, badges, key }) => (
            <div key={key} className="ws-paid-sofar-row">
              <div className="ws-paid-sofar-left">
                <NamePill member={member} size={36} />
                {badges.length > 0 && (
                  <PayerBadgeChip badge={badges[0]!} />
                )}
              </div>
              <span className="ws-paid-sofar-amt">{amount}</span>
            </div>
          ))}
        </div>
      )}

      <div className="completed-brand">
        <LogoMark size={30} />
        <span>Gracias por visitar {config.name}</span>
      </div>

      <div className="completed-actions">
        <button
          type="button"
          className="ws-back-mesa-btn ws-back-mesa-inline"
          onClick={() => flow.goToBill()}
          data-testid="success-back-mesa-btn"
        >
          <Ic.users s={16} /> {backToBillCta}
        </button>
        {config.showResetButton && onResetDemo ? (
          <button
            type="button"
            className="completed-btn demo-reset-success-btn"
            disabled={resetting}
            onClick={() => {
              setResetting(true);
              void onResetDemo().finally(() => setResetting(false));
            }}
            data-testid="demo-reset-success-btn"
          >
            {resetting ? "Reiniciando…" : "Reiniciar demo"}
          </button>
        ) : null}
        <button
          className="completed-btn"
          data-testid="success-review-btn"
        >
          <Ic.star s={17} /> Déjanos una reseña
        </button>
        <button className="completed-btn" data-testid="success-ig-btn">
          <Ic.instagram s={17} /> Síguenos en Instagram
        </button>
      </div>
    </div>
  );

  /* ── root render ──────────────────────────────────────────────────────── */

  return (
    <div
      className={
        "ws-stage" +
        (displayedPhase === "success" ? " completed-wrap" : " flowscreen")
      }
      aria-live="polite"
    >
      {displayedPhase === "waiting" ? (
        <div className={"ws-waiting-wrap" + (fading ? " ws-fading" : "")}>
          {waitingScroll}
        </div>
      ) : (
        <div className={"ws-content ws-success-wrap" + (fading ? " ws-fading" : "")}>
          <div className="wait-scroll ws-success-scroll">{successContent}</div>
        </div>
      )}
    </div>
  );
}
