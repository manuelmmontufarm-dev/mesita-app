"use client";

import { useEffect, useState } from "react";

import {
  isDemoDebugEnabled,
  subscribeDemoDebug,
  type DemoDebugEntry,
} from "@/lib/demo-debug";

interface DemoDebugPanelProps {
  version: number;
  resetSeq: number;
  guestSessionId: string | null;
  yourDisplayName: string;
  memberCount: number;
  sseConnected: boolean;
}

export function DemoDebugPanel({
  version,
  resetSeq,
  guestSessionId,
  yourDisplayName,
  memberCount,
  sseConnected,
}: DemoDebugPanelProps) {
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<readonly DemoDebugEntry[]>([]);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isDemoDebugEnabled());
    return subscribeDemoDebug(setEntries);
  }, []);

  if (!enabled) return null;

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
          </div>
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
