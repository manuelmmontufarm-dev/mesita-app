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
import { expandRepeatedItems } from "@/lib/guest-billing/bill-display";
import {
  billSubtotal,
  computeTotals,
  fmt,
  memberSubtotal,
  resolveMemberDisplay,
  resolveRoster,
  unitsOf,
} from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  MemberId,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing/types";

import { Ic, LogoMark, NamePill } from "./_shared";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

export interface WaitingSuccessStageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function unitLabel(units: number): string {
  if (Math.abs(units - 0.5) < 0.01) return "(½)";
  if (Math.abs(units - Math.round(units)) > 0.01) return `(${units})`;
  return "";
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

function MesaProgressRing({
  paidPct,
  remainingAmt,
  paidCount,
  totalCount,
}: {
  paidPct: number;
  remainingAmt: string;
  paidCount: number;
  totalCount: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, paidPct));
  const offset = c * (1 - clamped / 100);

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
          <span className="ws-mesa-ring-pct">{clamped}%</span>
          <span className="ws-mesa-ring-lbl">pagado</span>
          <span className="ws-mesa-ring-amt">{remainingAmt}</span>
        </div>
      </div>

      <CelebrateMood />

      <div className="ws-mesa-ring-meta">
        <span className="live-pill-sm glassx">
          <span className="dot" /> En vivo
        </span>
        <span className="ws-mesa-ring-count">
          {paidCount} de {totalCount} pagaron
        </span>
      </div>
    </div>
  );
}

function TodoChampionHero({
  member,
}: {
  member: { initials?: string; hue?: number; isYou?: boolean };
}) {
  return (
    <div className="ws-king-hero" data-testid="ws-todo-champion">
      <span className="ws-king-crown" aria-hidden="true">
        👑
      </span>
      <NamePill member={member} size={76} />
      <span className="ws-king-scepter" aria-hidden="true">
        🪄
      </span>
      <p className="ws-king-title">Rey de la mesa</p>
      <p className="ws-king-sub">Pagaste TODO. Leyenda.</p>
    </div>
  );
}

const SUCCESS_QUIPS = [
  "El mesero ya te admira.",
  "Factura en camino — sin filas.",
  "Mesa cerrada. Buen servicio.",
  "Eso sí es pagar con estilo.",
];

function AnimatedCheckRing() {
  return (
    <div className="ws-check-wrap" aria-hidden="true">
      <span className="ws-pulse-ring ws-pulse-ring-1" />
      <span className="ws-pulse-ring ws-pulse-ring-2" />
      <div className="ws-disc ws-disc-pop">
        <svg
          viewBox="0 0 24 24"
          width="38"
          height="38"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            className="ws-check-stroke"
            d="M5 12.5l5 5 9-10"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
          />
        </svg>
      </div>
    </div>
  );
}

/* ── main component ─────────────────────────────────────────────────────── */

export function WaitingSuccessStage({
  flow,
  items,
  members,
  config,
}: WaitingSuccessStageProps) {
  const { state, derived, youId } = flow;
  const { mode, claims, paidIds, people } = state;

  /* ── phase derivation ─────────────────────────────────────────────────── */

  const phase: "waiting" | "success" =
    derived.remainingSub <= 0.01 ? "success" : "waiting";

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

  const fullSub = billSubtotal(items);
  const mesaTotal = computeTotals(fullSub, config, 0).total;
  const paidPct =
    mesaTotal > 0.01
      ? Math.round(((mesaTotal - derived.remainingSub) / mesaTotal) * 100)
      : 100;

  const displayMembers = resolveRoster(members, state.name, youId);
  const youDisplay = resolveMemberDisplay(
    displayMembers.find((m) => m.id === youId) ?? displayMembers[0],
    state.name,
    youId,
  );

  const remainingPeople = Math.max(1, people - paidIds.length);

  const owed = (id: MemberId): number => {
    if (mode === "equal") {
      return computeTotals(
        derived.remainingSub / remainingPeople,
        config,
        0,
      ).total;
    }
    const itemAmt = computeTotals(
      memberSubtotal(items, claims, id),
      config,
      0,
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
        <p className="ws-reg-eyebrow">Un pago registrado</p>
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
          derived.remainingSub > 0.01
            ? `Faltan ${fmt(derived.remainingSub)}`
            : "¡Mesa completa!"
        }
        paidCount={state.paidIds.length}
        totalCount={members.length}
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
    </div>
  );

  /* ── render: success phase ────────────────────────────────────────────── */

  const successContent = (
    <div className="ws-success state-wrap completed">
      {mode === "todo" ? (
        <TodoChampionHero member={youDisplay} />
      ) : (
        <AnimatedCheckRing />
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

      <div className="completed-brand">
        <LogoMark size={30} />
        <span>Gracias por visitar {config.name}</span>
      </div>

      <div className="completed-actions">
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
      <div style={{ height: 84, flex: "0 0 auto" }} aria-hidden="true" />
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
        <>
          <div className={"ws-waiting-wrap" + (fading ? " ws-fading" : "")}>
            {waitingScroll}
          </div>
          <div className="flow-foot ws-wait-foot">
            <button
              type="button"
              className="flow-secondary solid"
              onClick={() => flow.goToBill()}
              data-testid="waiting-back-btn"
            >
              <Ic.users s={16} /> Ver mesa
            </button>
          </div>
        </>
      ) : (
        <div className={"ws-content" + (fading ? " ws-fading" : "")}>
          {successContent}
        </div>
      )}
    </div>
  );
}
