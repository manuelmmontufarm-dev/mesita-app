"use client";

import { useEffect, useState } from "react";

import {
  getDemoJoinCount,
  isDemoDebugEnabled,
  subscribeDemoDebug,
  type DemoDebugEntry,
} from "@/lib/demo-debug";

interface DemoGuestRow {
  id: string;
  name: string;
  seatLabel: string;
  hue: number;
}

interface DemoDebugPanelProps {
  version: number;
  resetSeq: number;
  guestSessionId: string | null;
  yourDisplayName: string;
  memberCount: number;
  sseConnected: boolean;
  /** Optional: full guest roster for richer debug. */
  guests?: readonly DemoGuestRow[];
  /** Optional: token for snapshot copy. */
  token?: string;
  /** Optional: receipt counts for diagnosing the "I see other guests'
   *  receipts" class of bug. `mine` = payments by this guest; `total` =
   *  every payment on the table. They should never be equal unless I
   *  paid every payment, which is rare. */
  paymentsMine?: number;
  paymentsTotal?: number;
}

function readDeviceId(): string {
  if (typeof window === "undefined") return "—";
  try {
    return window.localStorage.getItem("mesita:device-id") ?? "—";
  } catch {
    return "—";
  }
}

/** Read live CSS custom properties + html-level classes the layout depends on.
 *  Phase 0: surfacing this in the debug panel lets us diagnose dock/peek
 *  regressions in under 2 minutes without DevTools. */
interface LayoutSnapshot {
  payStackHeight: string;
  receiptPeek: string;
  receiptDockGap: string;
  classes: string[];
  stage: string;
  dockMode: "mini" | "full" | "none";
}

function readLayoutSnapshot(): LayoutSnapshot {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      payStackHeight: "—",
      receiptPeek: "—",
      receiptDockGap: "—",
      classes: [],
      stage: "—",
      dockMode: "none",
    };
  }
  const html = document.documentElement;
  const rootStyles = getComputedStyle(html);
  const classes = ["has-receipt-peek", "has-pay-stack-above", "has-sheet-open", "has-receipt-open"]
    .filter((c) => html.classList.contains(c));
  const stageEl = document.querySelector<HTMLElement>(".cust-app[data-stage]");
  const stage = stageEl?.dataset.stage ?? "—";
  const dock = document.querySelector<HTMLElement>(".c-dock");
  let dockMode: LayoutSnapshot["dockMode"] = "none";
  if (dock?.classList.contains("dock-mini")) dockMode = "mini";
  else if (dock?.classList.contains("dock-full")) dockMode = "full";
  return {
    payStackHeight: (rootStyles.getPropertyValue("--pay-stack-height") || "—").trim(),
    receiptPeek: (rootStyles.getPropertyValue("--receipt-peek") || "—").trim(),
    receiptDockGap: (rootStyles.getPropertyValue("--receipt-dock-gap") || "—").trim(),
    classes,
    stage,
    dockMode,
  };
}

export function DemoDebugPanel({
  version,
  resetSeq,
  guestSessionId,
  yourDisplayName,
  memberCount,
  sseConnected,
  guests,
  token,
  paymentsMine,
  paymentsTotal,
}: DemoDebugPanelProps) {
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<readonly DemoDebugEntry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [joinCount, setJoinCount] = useState(0);
  const [deviceId, setDeviceId] = useState("—");
  const [copied, setCopied] = useState(false);
  const [layout, setLayout] = useState<LayoutSnapshot>(() => readLayoutSnapshot());

  useEffect(() => {
    setEnabled(isDemoDebugEnabled());
    setDeviceId(readDeviceId());
    return subscribeDemoDebug((e) => {
      setEntries(e);
      setJoinCount(getDemoJoinCount());
    });
  }, []);

  // Re-read layout snapshot on every debug event + every 750ms — cheap polling
  // is fine here because the panel is gated behind ?debug=1 (dev/QA only).
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setLayout(readLayoutSnapshot());
    tick();
    const interval = window.setInterval(tick, 750);
    return () => window.clearInterval(interval);
  }, [enabled, entries.length]);

  // Force a re-render every 500ms so the "since last sync" delta stays fresh
  // even when no new events are firing — important for diagnosing stuck SSE.
  const [, setTickNow] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setTickNow((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  /** Latency stats — derived from the live ring buffer. */
  const now = Date.now();
  const latestSyncEntry = entries.find((e) => e.event.startsWith("sync:"));
  const latestSyncSource = latestSyncEntry?.event.replace("sync:", "") ?? null;
  const sinceLastSyncMs = latestSyncEntry ? now - latestSyncEntry.ts : null;
  const latestClaimEntry = entries.find((e) => e.event.startsWith("claim"));
  const sinceLastClaimMs = latestClaimEntry ? now - latestClaimEntry.ts : null;
  // Cadencia real de poll: demo UX 800ms, mesas POS-linked 900ms (+ SSE check 1500ms server).
  const heartbeatLabel = sseConnected ? "SSE+~0.9s" : "~0.9s";
  const fmtMs = (ms: number | null) => {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const copySnapshot = async () => {
    const snapshot = {
      ts: new Date().toISOString(),
      token,
      version,
      resetSeq,
      sseConnected,
      myGuestId: guestSessionId,
      myDeviceId: deviceId,
      yourDisplayName,
      memberCount,
      joinCount,
      guests: guests ?? [],
      recentEvents: entries.slice(0, 20),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be unavailable on insecure contexts — fall back to console
      console.log("[demo:snapshot]", snapshot);
    }
  };

  return (
    <div className={`demo-debug${open ? " open" : ""}`} data-testid="demo-debug-panel">
      <button
        type="button"
        className="demo-debug-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾ Debug" : "▸ Debug"}
      </button>
      {open ? (
        <div className="demo-debug-body">
          <div className="demo-debug-row">
            <span>v{version}</span>
            <span>reset {resetSeq}</span>
            <span>SSE {sseConnected ? "on" : "off"}</span>
            <span title="poll heartbeat">poll {heartbeatLabel}</span>
          </div>
          <div
            className="demo-debug-row"
            title="time since the most recent sync event of each source"
          >
            <span>
              sync {latestSyncSource ?? "—"} · {fmtMs(sinceLastSyncMs)}
            </span>
            <span>claim · {fmtMs(sinceLastClaimMs)}</span>
            {paymentsMine != null || paymentsTotal != null ? (
              <span title="my receipts vs total table payments">
                pay {paymentsMine ?? "—"} / {paymentsTotal ?? "—"}
              </span>
            ) : null}
          </div>
          <div className="demo-debug-row">
            <span>guest {guestSessionId?.slice(0, 8) ?? "—"}</span>
            <span>{yourDisplayName || "—"}</span>
            <span>{memberCount} en mesa</span>
            <span title="join + rejoin events this session">joins {joinCount}</span>
          </div>
          <div className="demo-debug-row" title={deviceId}>
            <span>device {deviceId.slice(0, 8)}</span>
            <button
              type="button"
              className="demo-debug-toggle"
              onClick={() => void copySnapshot()}
            >
              {copied ? "✓ copiado" : "copiar snapshot"}
            </button>
          </div>
          <div className="demo-debug-row" title="Layout — stage, dock mode, CSS vars">
            <span>stage {layout.stage}</span>
            <span>dock {layout.dockMode}</span>
            <span title="--pay-stack-height">stack {layout.payStackHeight}</span>
            <span title="--receipt-peek">peek {layout.receiptPeek}</span>
          </div>
          {layout.classes.length > 0 ? (
            <div className="demo-debug-row" title="<html> classes">
              {layout.classes.map((c) => (
                <span key={c} className="demo-debug-ev">{c}</span>
              ))}
            </div>
          ) : null}
          {guests && guests.length > 0 ? (
            <div className="demo-debug-log">
              {guests.map((g) => (
                <div key={g.id} className="demo-debug-line">
                  <span className="demo-debug-ev">{g.seatLabel}</span>
                  <span>
                    {g.name} · {g.id.slice(0, 8)} · hue {g.hue}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="demo-debug-log">
            {entries.slice(0, 12).map((e) => (
              <div key={`${e.ts}-${e.event}`} className="demo-debug-line">
                <span className="demo-debug-ev">{e.event}</span>
                <span>{e.message}</span>
              </div>
            ))}
          </div>
          <div className="demo-debug-hint">
            Consola: <code>__mesitaDemoDebug.enable()</code> · URL{" "}
            <code>?debug=1</code>
          </div>
        </div>
      ) : null}
    </div>
  );
}
