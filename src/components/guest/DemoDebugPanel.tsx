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
}

function readDeviceId(): string {
  if (typeof window === "undefined") return "—";
  try {
    return window.localStorage.getItem("mesita:device-id") ?? "—";
  } catch {
    return "—";
  }
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
}: DemoDebugPanelProps) {
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<readonly DemoDebugEntry[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [joinCount, setJoinCount] = useState(0);
  const [deviceId, setDeviceId] = useState("—");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEnabled(isDemoDebugEnabled());
    setDeviceId(readDeviceId());
    return subscribeDemoDebug((e) => {
      setEntries(e);
      setJoinCount(getDemoJoinCount());
    });
  }, []);

  if (!enabled) return null;

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
            <span>poll 500ms</span>
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
