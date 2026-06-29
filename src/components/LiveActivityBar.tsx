"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface Activity {
  id: string;
  type: "table_opened" | "guest_joined" | "payment";
  tableName: string;
  guestName?: string;
  guestCount?: number;
  amount?: number;
  createdAt: string;
}

function activityMessage(a: Activity): string {
  if (a.type === "table_opened") {
    return `${a.tableName} se abrió · ${a.guestCount ?? 1} comensal${(a.guestCount ?? 1) !== 1 ? "es" : ""}`;
  }
  if (a.type === "guest_joined") {
    return `${a.guestName ?? "Alguien"} entró a ${a.tableName} · pagando con Mesita`;
  }
  return `${a.tableName} · pago ${formatCurrency(a.amount ?? 0)}`;
}

function activityIcon(type: Activity["type"]): string {
  if (type === "table_opened") return "🪑";
  if (type === "guest_joined") return "👋";
  return "✓";
}

export function LiveActivityBar() {
  const [visible, setVisible] = useState<Activity[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-pos?view=activity");
      if (!res.ok) return;
      const json = await res.json();
      const incoming: Activity[] = json.data?.activities ?? [];

      if (!initializedRef.current) {
        incoming.slice(0, 3).forEach((a) => seenRef.current.add(a.id));
        initializedRef.current = true;
        return;
      }

      const fresh = incoming.filter((a) => !seenRef.current.has(a.id));
      if (fresh.length > 0) {
        fresh.forEach((a) => seenRef.current.add(a.id));
        setVisible((prev) => [...fresh, ...prev].slice(0, 4));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (visible.length === 0) return;
    const t = setTimeout(() => setVisible((prev) => prev.slice(0, -1)), 6000);
    return () => clearTimeout(t);
  }, [visible]);

  if (visible.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
      {visible.map((a) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 12,
            background: a.type === "payment" ? "#111110" : "rgba(47,179,126,.12)",
            border: a.type === "payment"
              ? "1px solid rgba(255,255,255,.08)"
              : "1px solid rgba(47,179,126,.22)",
            color: a.type === "payment" ? "#F5F4F2" : "#1f6b4c",
            fontSize: 13,
            fontWeight: 500,
            animation: "slideDown .2s ease",
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden>{activityIcon(a.type)}</span>
          <span style={{ flex: 1 }}>{activityMessage(a)}</span>
          <button
            type="button"
            onClick={() => setVisible((prev) => prev.filter((x) => x.id !== a.id))}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              opacity: 0.6,
              color: "inherit",
              fontSize: 16,
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
