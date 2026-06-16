"use client";

/**
 * GuestBillFlow — Step 3 integration scaffold.
 *
 * Mounts the `useGuestPaymentFlow` state machine and routes to a placeholder
 * component per stage. The placeholders are intentionally minimal: they expose
 * the current state, derived totals, selected mode, active tab, and provide
 * just enough controls (buttons / inputs) to manually drive the flow forward.
 *
 * Step 4 will replace each placeholder with the pixel-faithful screen from
 * `design_handoff_customer/customer/{bill,screens}.jsx`.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";

import { BillStage } from "./BillStage";
import { ConfirmStage } from "./ConfirmStage";
import { MesaStage } from "./MesaStage";
import { PaymentStage } from "./PaymentStage";
import { ShareSheet } from "./ShareSheet";
import { SuccessStage } from "./SuccessStage";
import { WaitingStage } from "./WaitingStage";
import { Ic, LogoMark, useBumpOnChange } from "./_shared";
import {
  type FlowInit,
  type PaidPayload,
  useGuestPaymentFlow,
} from "@/hooks/useGuestPaymentFlow";
import { fmt } from "@/lib/guest-billing";
import type {
  BillItem,
  MemberId,
  RestaurantConfig,
  TableMember,
} from "@/lib/guest-billing";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

interface StageProps {
  flow: Flow;
  items: readonly BillItem[];
  members: readonly TableMember[];
  config: RestaurantConfig;
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
  } = props;

  const flow = useGuestPaymentFlow({
    items,
    members,
    config,
    init,
    youId,
    onPaid,
    now,
  });

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

  const stageProps: StageProps = { flow, items, members, config };

  switch (flow.state.stage) {
    case "loading":
      return <LoadingStage {...stageProps} />;
    case "error":
      return <ErrorStage {...stageProps} externalError={externalError ?? null} />;
    case "bill":
      return <BillShellStage {...stageProps} />;
    case "confirm":
      return <ConfirmStage {...stageProps} />;
    case "payment":
      return <PaymentStage {...stageProps} />;
    case "waiting":
      return <WaitingStage {...stageProps} />;
    case "success":
      return <SuccessStage {...stageProps} />;
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * BillShellStage — pixel-faithful chrome around BillStage / MesaStage.
 * Ported from `design_handoff_customer/customer/app.jsx` shell section
 * (sticky header + segmented tabs + sticky bottom pay dock).
 * ────────────────────────────────────────────────────────────────────────── */

function BillShellStage({ flow, items, members, config }: StageProps) {
  const { state, derived } = flow;
  const tab = state.tab;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(false);
  const [headCompact, setHeadCompact] = useState(false);
  const [scrollable, setScrollable] = useState(false);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 40);
    setHeadCompact(el.scrollTop > 16);
  };

  // Reset chrome state when the tab flips so the dock re-collapses correctly.
  useEffect(() => {
    setAtBottom(false);
    setHeadCompact(false);
  }, [tab]);

  // Measure whether the content is actually overflowing — if not, expand the
  // dock immediately (no scroll needed). Re-measure on every state mutation
  // that changes content height.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    setScrollable(el ? el.scrollHeight > el.clientHeight + 12 : false);
  }, [
    tab,
    state.mode,
    state.claims,
    state.people,
    state.tip,
    state.paidItemIds,
    config.serviceEnabled,
  ]);

  const dockExpanded = atBottom || !scrollable;
  const bump = useBumpOnChange(Math.round(derived.totals.total * 100));

  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="bill"
      data-tab={tab}
    >
      {/* sticky header */}
      <div className={"cust-head" + (headCompact ? " compact" : "")}>
        <div className="head-row">
          <div className="head-rest">
            <LogoMark size={32} />
            <div>
              <div className="head-name">{config.name}</div>
              <div className="head-sub">
                {config.tagline ? `${config.tagline} · ` : ""}
                {`Mesa ${config.table}`}
              </div>
            </div>
          </div>
          <span className="live-pill glassx">
            <span className="dot" />
            En vivo
          </span>
        </div>
        <div className="head-title">
          {tab === "cuenta" ? "Tu cuenta" : "La mesa"}
        </div>
        <div className="tabseg glassx" role="tablist">
          <button
            className={tab === "cuenta" ? "on" : ""}
            onClick={() => flow.setTab("cuenta")}
            role="tab"
            aria-selected={tab === "cuenta"}
            data-testid="shell-tab-cuenta"
          >
            <Ic.receipt s={16} /> Cuenta
          </button>
          <button
            className={tab === "mesa" ? "on" : ""}
            onClick={() => flow.setTab("mesa")}
            role="tab"
            aria-selected={tab === "mesa"}
            data-testid="shell-tab-mesa"
          >
            <Ic.users s={16} /> Mesa{" "}
            <span className="cnt">{state.people}</span>
          </button>
        </div>
      </div>

      {/* scrollable tab body */}
      <div
        className="cust-scroll"
        key={tab}
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {tab === "cuenta" ? (
          <BillStage
            flow={flow}
            items={items}
            members={members}
            config={config}
          />
        ) : (
          <MesaStage
            flow={flow}
            items={items}
            members={members}
            config={config}
          />
        )}
      </div>

      {/* sticky bottom pay dock */}
      <div className={"c-dock " + (dockExpanded ? "dock-full" : "dock-mini")}>
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
          <Ic.lock s={18} /> Pagar ahora
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
 * Placeholder stages. Each is a diagnostic harness so a human (or e2e test)
 * can manually advance the state machine. Step 4 replaces these.
 * ────────────────────────────────────────────────────────────────────────── */

function Shell({
  title,
  flow,
  children,
}: {
  title: string;
  flow: Flow;
  children: React.ReactNode;
}) {
  const { state, derived } = flow;
  return (
    <div
      data-testid="guest-bill-flow"
      data-stage={state.stage}
      style={{
        padding: 16,
        maxWidth: 480,
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Stage</p>
        <h2 style={{ margin: "2px 0 0", fontSize: 20 }}>{title}</h2>
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "2px 12px",
            fontSize: 12,
            margin: "8px 0 0",
            color: "#444",
          }}
        >
          <dt>mode</dt>
          <dd data-testid="flow-mode" style={{ margin: 0 }}>
            {state.mode}
          </dd>
          <dt>tab</dt>
          <dd data-testid="flow-tab" style={{ margin: 0 }}>
            {state.tab}
          </dd>
          <dt>subtotal</dt>
          <dd style={{ margin: 0 }}>${derived.subtotal.toFixed(2)}</dd>
          <dt>total</dt>
          <dd data-testid="flow-total" style={{ margin: 0 }}>
            ${derived.totals.total.toFixed(2)}
          </dd>
        </dl>
      </header>
      <section>{children}</section>
    </div>
  );
}

function LoadingStage({ flow }: StageProps) {
  return (
    <Shell title="Loading" flow={flow}>
      <p>Fetching bill…</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => flow.loadSuccess()}>force success</button>
        <button onClick={() => flow.loadError()}>force error</button>
      </div>
    </Shell>
  );
}

function ErrorStage({
  flow,
  externalError,
}: StageProps & { externalError: string | null }) {
  return (
    <Shell title="Error" flow={flow}>
      <p style={{ color: "#b00020" }}>
        {externalError ?? "Could not load the bill."}
      </p>
      <button onClick={() => flow.loadStart()}>retry</button>
    </Shell>
  );
}

