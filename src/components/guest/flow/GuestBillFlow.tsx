"use client";

/**
 * GuestBillFlow — integration shell for the customer payment flow.
 *
 * Mounts the `useGuestPaymentFlow` state machine and routes to the correct
 * stage component. The ReceiptDrawer is rendered ONCE at this level so it
 * survives the Waiting→Success stage transition without unmounting.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from "react";

import { BillStage } from "./BillStage";
import { ConfirmStage } from "./ConfirmStage";
import { PaymentStage } from "./PaymentStage";
import { ReceiptDrawer } from "./ReceiptDrawer";
import { ShareSheet } from "./ShareSheet";
import { WaitingSuccessStage } from "./WaitingSuccessStage";
import { Ic, useBumpOnChange } from "./_shared";
import {
  type FlowInit,
  type PaidPayload,
  useGuestPaymentFlow,
} from "@/hooks/useGuestPaymentFlow";
import type { LiveSessionActions } from "@/hooks/useLiveTableSession";
import { fmt } from "@/lib/guest-billing";
import { computeBillShellScrollMetrics } from "@/lib/guest-billing/bill-shell-scroll";
import { mergeClaimsPreserveLocal } from "@/lib/demo-optimistic-merge";
import type { PendingClaimOp } from "@/lib/demo-optimistic-merge";
import { freeUnits, personNumberFromLabel, unitsOf } from "@/lib/guest-billing/split-math";
import type {
  BillItem,
  Claims,
  ItemId,
  MemberId,
  RestaurantConfig,
  TableMember,
  TablePaymentSummary,
} from "@/lib/guest-billing";
import type { DemoTableProgress } from "@/lib/guest-billing/demo-table-progress";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

interface StageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  sessionClaims?: Claims;
  pendingClaims?: Readonly<Record<string, PendingClaimOp>>;
  paidSummaries?: readonly TablePaymentSummary[];
  demoTableProgress?: DemoTableProgress;
  onResetDemo?: () => Promise<void>;
  tableToken?: string;
}

export interface GuestBillFlowProps {
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
  init: FlowInit;
  youId?: MemberId;
  /** Real backend hook (POS payment + SRI e-invoice). */
  onPaid?: (payload: PaidPayload) => Promise<void> | void;
  /** External loading/error signal — usually from the polling/data layer. */
  externalLoading?: boolean;
  externalError?: string | null;
  /** Deterministic clock for tests/storybook. */
  now?: () => Date;
  /** Postgres-backed live table session mutations. */
  liveSession?: LiveSessionActions | null;
  /** Server-authoritative sync payload (SSE / poll version bump). */
  serverSync?: {
    version: number;
    resetSeq?: number;
    claims: Claims;
    paidItemIds: ItemId[];
    paidIds: MemberId[];
    people: number;
    tableClosed?: boolean;
    syncRevision?: number;
  };
  /** Demo-only: reset shared table state for all devices. */
  onResetDemo?: () => Promise<void>;
  /** Server-authoritative claims for pill display (avoids one-frame stale local state). */
  sessionClaims?: Claims;
  /** In-flight claims on this device — loading spinner until server confirms. */
  pendingClaims?: Readonly<Record<string, PendingClaimOp>>;
  /** Payments recorded on the shared session (for waiting summaries). */
  paidSummaries?: readonly TablePaymentSummary[];
  /** Demo-only: merged live progress for waiting/success ring. */
  demoTableProgress?: DemoTableProgress;
  /** Table token for sessionStorage (payment form recall). */
  tableToken?: string;
}

export function GuestBillFlow(props: GuestBillFlowProps) {
  const {
    items,
    members,
    config,
    init,
    youId,
    onPaid,
    externalLoading,
    externalError,
    now,
    liveSession,
    serverSync,
    onResetDemo,
    sessionClaims,
    pendingClaims,
    paidSummaries,
    demoTableProgress,
    tableToken,
  } = props;

  const resolvedYouId = youId ?? liveSession?.guestSessionId ?? "you";

  const flow = useGuestPaymentFlow({
    items,
    members,
    config,
    init,
    youId: resolvedYouId,
    onPaid,
    now,
  });

  const liveFlow = useMemo(() => {
    if (!liveSession) return flow;
    const sid = liveSession.guestSessionId;
    return {
      ...flow,
      setName: (name: string) => {
        flow.setName(name);
        liveSession.onRename(name);
      },
      toggleMine: (item: BillItem) => {
        if (flow.state.paidItemIds.includes(item.id)) return;
        const yours = unitsOf(flow.state.claims, item.id, sid);
        if (yours > 0) {
          flow.toggleMine(item);
          liveSession.onRelease(item.id);
          return;
        }
        const free = freeUnits(item, flow.state.claims);
        if (free > 0.001) {
          flow.toggleMine(item);
          liveSession.onClaim(item.id, free);
        }
      },
      setClaimUnits: (itemId: MemberId, memberId: MemberId, units: number) => {
        flow.setClaimUnits(itemId, memberId, units);
        if (memberId === sid) {
          if (units <= 0) liveSession.onRelease(itemId);
          else liveSession.onClaim(itemId, units);
        }
      },
      replaceClaim: (itemId: MemberId, unitsMap: Record<MemberId, number>) => {
        flow.replaceClaim(itemId, unitsMap);
        const yours = unitsMap[sid] ?? 0;
        if (yours <= 0) liveSession.onRelease(itemId);
        else liveSession.onClaim(itemId, yours);
      },
      goToConfirm: () => {
        flow.goToConfirm();
        liveSession.onStatus("REVIEWING");
      },
      confirmPay: () => {
        flow.confirmPay();
        liveSession.onStatus("IN_PAYMENT");
      },
      submitPayment: async (payload: PaidPayload) => {
        await flow.submitPayment(payload);
        liveSession.onStatus("PAID");
      },
    };
  }, [flow, liveSession]);

  const activeFlow = liveSession ? liveFlow : flow;

  const youMember = members.find((m) => m.isYou);
  const seededName = useRef(false);
  const lastResetSeq = useRef<number | null>(null);
  const trustLocalClaims = useRef(true);

  useLayoutEffect(() => {
    if (!serverSync) return;
    flow.syncFromServer({
      claims: mergeClaimsPreserveLocal(
        serverSync.claims,
        flow.state.claims,
        resolvedYouId,
        { trustLocal: trustLocalClaims.current },
      ),
      paidItemIds: serverSync.paidItemIds,
      paidIds: serverSync.paidIds,
      people: serverSync.people,
    });
    trustLocalClaims.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSync?.version, serverSync?.syncRevision]);

  useEffect(() => {
    if (serverSync?.resetSeq == null) return;
    if (lastResetSeq.current === null) {
      lastResetSeq.current = serverSync.resetSeq;
      return;
    }
    if (serverSync.resetSeq === lastResetSeq.current) return;
    lastResetSeq.current = serverSync.resetSeq;
    seededName.current = false;
    trustLocalClaims.current = false;
    flow.reset({
      ...init,
      initialStage: "bill",
      initialName:
        (() => {
          const fromMember = youMember?.name?.trim();
          if (fromMember && personNumberFromLabel(fromMember) == null) return fromMember;
          const fromFlow = flow.state.name.trim();
          if (fromFlow && personNumberFromLabel(fromFlow) == null) return fromFlow;
          return undefined;
        })(),
      initialClaims: serverSync.claims,
      initialPaidItemIds: serverSync.paidItemIds,
      initialPaidIds: serverSync.paidIds,
      initialPeople: serverSync.people,
      initialReceipts: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSync?.resetSeq]);

  useEffect(() => {
    if (!serverSync || items.length === 0) return;
    const tableClosed = serverSync.tableClosed === true;
    if (!tableClosed) return;
    const { stage } = flow.state;
    // Solo avanzar a éxito desde waiting — no saltar confirm/pago ni cerrar mesa parcial.
    if (stage === "waiting") {
      flow.finishWaiting();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSync?.version, serverSync?.tableClosed, items.length, flow.state.stage]);

  useEffect(() => {
    if (seededName.current || !youMember?.name.trim()) return;
    if (!flow.state.name.trim()) {
      // Skip auto-seed when the server name is just a "Persona N" auto-label —
      // we want the input EMPTY so the placeholder ("Ej: Juanito…") signals that
      // the field is editable. The avatar pill shows the Persona N as fallback.
      const isAutoLabel = personNumberFromLabel(youMember.name) != null;
      if (!isAutoLabel) {
        flow.setName(youMember.name);
        seededName.current = true;
      }
    }
  }, [youMember?.name, flow.state.name, flow]);

  // Mirror external data-layer signals onto the flow state machine.
  useEffect(() => {
    if (externalLoading) {
      if (flow.state.stage !== "loading") flow.loadStart();
      return;
    }
    if (externalError) {
      if (flow.state.stage !== "error") flow.loadError();
      return;
    }
    if (flow.state.stage === "loading") flow.loadSuccess();
    // We only want to react to the external signal, not to internal stage churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLoading, externalError]);

  const stageProps: StageProps = {
    flow: activeFlow,
    items,
    members,
    config,
    sessionClaims,
    pendingClaims,
    paidSummaries,
    demoTableProgress,
    onResetDemo,
    tableToken,
  };
  const stage = flow.state.stage;
  const receiptDrawer =
    flow.state.receipts.length > 0 ? (
      <ReceiptDrawer receipts={flow.state.receipts} config={config} />
    ) : null;

  useEffect(() => {
    document.documentElement.classList.toggle(
      "has-receipt-peek",
      flow.state.receipts.length > 0,
    );
    return () => document.documentElement.classList.remove("has-receipt-peek");
  }, [flow.state.receipts.length]);

  // Waiting and Success share a single WaitingSuccessStage so the component
  // root never unmounts during the transition. ReceiptDrawer is also kept
  // alive here — it does not re-mount when the inner phase flips.
  if (stage === "waiting" || stage === "success") {
    return (
      <>
        <div className="cust-root cust-app" data-testid="guest-bill-flow" data-stage={stage}>
          <WaitingSuccessStage {...stageProps} />
        </div>
        {receiptDrawer}
      </>
    );
  }

  switch (stage) {
    case "loading":
      return (<>{<LoadingStage {...stageProps} />}{receiptDrawer}</>);
    case "error":
      return (<><ErrorStage {...stageProps} externalError={externalError ?? null} />{receiptDrawer}</>);
    case "bill":
      return (<><BillShellStage {...stageProps} />{receiptDrawer}</>);
    case "confirm":
      return (<><ConfirmStage {...stageProps} />{receiptDrawer}</>);
    case "payment":
      return (<><PaymentStage {...stageProps} tableToken={tableToken} />{receiptDrawer}</>);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * BillShellStage — pixel-faithful chrome around BillStage.
 * Ported from `design_handoff_customer/customer/app.jsx` shell section
 * (sticky header + sticky bottom pay dock).
 * ────────────────────────────────────────────────────────────────────────── */

function BillShellStage({
  flow,
  items,
  members,
  config,
  sessionClaims,
  pendingClaims,
  onResetDemo,
}: StageProps) {
  const { state, derived } = flow;
  const [resetting, setResetting] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [headCompact, setHeadCompact] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const metrics = computeBillShellScrollMetrics(el);
    setAtBottom(metrics.atBottom);
    setHeadCompact(el.scrollTop > 16);
  };

  const remeasureScroll = () => {
    const el = scrollRef.current;
    const metrics = computeBillShellScrollMetrics(el);
    setScrollable(metrics.scrollable);
    setAtBottom(metrics.atBottom);
  };

  // Measure whether the content is actually overflowing — if not, expand the
  // dock immediately (no scroll needed). Re-measure on every state mutation
  // that changes content height.
  useLayoutEffect(() => {
    remeasureScroll();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => remeasureScroll());
    ro.observe(el);
    for (const child of el.children) {
      ro.observe(child);
    }
    return () => ro.disconnect();
  }, [
    state.mode,
    state.claims,
    state.people,
    state.tip,
    state.paidItemIds,
    state.name,
    config.serviceEnabled,
    items.length,
  ]);

  const dockExpanded = atBottom || !scrollable;
  const bump = useBumpOnChange(Math.round(derived.totals.total * 100));

  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="bill"
    >
      {/* minimal sticky header — venue/total live inside bill card */}
      <div className={"cust-head bill-shell-head" + (headCompact ? " compact" : "")}>
        <div className="bill-shell-top">
          <span className="live-pill glassx">
            <span className="dot" />
            En vivo
          </span>
          <span className="bill-shell-mesa">Mesa {config.table}</span>
          {config.demoMode && onResetDemo ? (
            <button
              type="button"
              className={
                "demo-reset-btn" + (headCompact ? " demo-reset-hidden" : "")
              }
              disabled={resetting}
              onClick={() => {
                setResetting(true);
                void onResetDemo().finally(() => setResetting(false));
              }}
              data-testid="demo-reset-btn"
            >
              {resetting ? "Reiniciando…" : "Reiniciar"}
            </button>
          ) : null}
        </div>
      </div>

      {/* scrollable bill body */}
      <div
        className="cust-scroll bill-first-page"
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="bill-scroll"
      >
        <BillStage
          flow={flow}
          items={items}
          members={members}
          config={config}
          sessionClaims={sessionClaims}
          pendingClaims={pendingClaims}
        />
      </div>

      {/* sticky bottom pay dock */}
      <div className={"c-dock glass-dock " + (dockExpanded ? "dock-full" : "dock-mini") + (flow.state.receipts.length > 0 ? " has-receipt-dock" : "")}>
        <div className="dock-top">
          <div className="dock-k">
            Tu parte
            <small>
              {state.name.trim() || "tu parte"} · Mesa {config.table}
            </small>
          </div>
          <div className={"dock-total" + (bump ? " bump" : "")}>
            {fmt(derived.totals.total)}
          </div>
        </div>
        <button
          className="c-pay-btn"
          onClick={() => flow.goToConfirm()}
          disabled={!derived.canPay}
          data-testid="dock-pay-btn"
        >
          <Ic.lock s={18} /> Pagar tu parte · {fmt(derived.totals.total)}
        </button>
        <div className="pay-secure">
          <Ic.shield s={13} /> Pago cifrado · Factura electrónica automática
        </div>
      </div>

      {state.shareItem && (
        <ShareSheet flow={flow} items={items} members={members} />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Loading & Error stages — polished, customer-facing.
 *
 * - Loading uses shimmer-bone skeleton rows that mimic the BillItemRow layout
 *   so the eye lands on what's coming, not a lonely spinner.
 * - Error uses an emoji + friendly Spanish copy + a single retry CTA wired to
 *   `flow.loadStart()`. The retry preserves form data because we only reset
 *   the load lifecycle, never the form state.
 * ────────────────────────────────────────────────────────────────────────── */

function LoadingStage({ flow }: StageProps) {
  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage={flow.state.stage}
    >
      <div className="load-stage">
        <div className="c-load-spinner" aria-hidden="true" />
        <div className="load-title">Cargando tu cuenta…</div>
        <div className="skeleton-list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skel-row">
              <span className="skel-emoji" />
              <span className="skel-lines">
                <span className="skel-bar" />
                <span className="skel-bar short" />
              </span>
              <span className="skel-price" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorStage({
  flow,
  externalError,
}: StageProps & { externalError: string | null }) {
  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage={flow.state.stage}
    >
      <div className="err-stage" role="alert" aria-live="polite">
        <span className="err-emoji" aria-hidden="true">
          😕
        </span>
        <div className="err-title">Ay, no pudimos cargar tu cuenta</div>
        <div className="err-sub">
          {externalError ??
            "Algo falló al traer los datos de la mesa. Intenta otra vez."}
        </div>
        <button
          className="err-retry"
          onClick={() => flow.loadStart()}
          data-testid="error-retry-btn"
        >
          <Ic.arrow s={17} /> Intentar de nuevo
        </button>
      </div>
    </div>
  );
}

