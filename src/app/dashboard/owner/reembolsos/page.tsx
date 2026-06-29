"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/format";

interface ReportPayment {
  id: string;
  amount: number;
  guestName: string;
  method: string;
  viaMesita: boolean;
  ref: string;
  createdAt: string;
}

interface Report {
  id: string;
  tableName: string;
  status: "OPEN" | "PARTIAL" | "PAID" | "CLOSED";
  total: number;
  paid: number;
  mesitaPaid: number;
  posOnlyPaid: number;
  paidViaMesita: boolean;
  live: boolean;
  posDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
  payments: ReportPayment[];
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:     { label: "Abierta",   color: "#c45a1a", bg: "rgba(232,106,51,.13)" },
  PARTIAL:  { label: "Parcial",   color: "#4a5a78", bg: "rgba(91,107,140,.14)" },
  PAID:     { label: "Pagada",    color: "#166534", bg: "rgba(22,101,52,.1)" },
  CLOSED:   { label: "Cerrada",   color: "#6B7280", bg: "rgba(27,25,22,.08)" },
};

const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "OPEN", label: "Abiertas" },
  { value: "PARTIAL", label: "Parciales" },
  { value: "PAID", label: "Pagadas" },
  { value: "mesita", label: "Con Mesita" },
  { value: "pos", label: "Solo POS" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleString("es-EC", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ReembolsosPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-pos?view=reports");
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      setReports(json.data?.reports ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = reports.filter((r) => {
    if (filter === "all") return true;
    if (filter === "mesita") return r.paidViaMesita;
    if (filter === "pos") return r.posOnlyPaid > 0 && !r.paidViaMesita;
    return r.status === filter;
  });

  const totalRevenue = reports.reduce((s, r) => s + r.paid, 0);
  const mesitaTotal = reports.reduce((s, r) => s + r.mesitaPaid, 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-900)", margin: 0 }}>
          Reportes
        </h1>
        <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
          Cuentas y pagos desde el POS Mesita · sincronizado con el app
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Cobrado hoy", value: formatCurrency(totalRevenue) },
          { label: "Vía Mesita", value: formatCurrency(mesitaTotal), accent: true },
          { label: "Cuentas", value: String(reports.length) },
        ].map((kpi) => (
          <div key={kpi.label} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--on-light-mut)", marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: kpi.accent ? "#1f6b4c" : "var(--ink-900)" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 100,
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              background: filter === f.value ? "var(--ink-900)" : "rgba(27,25,22,.06)",
              color: filter === f.value ? "var(--on-dark)" : "var(--on-light-mut)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ height: 240, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
          <p style={{ fontSize: 14, color: "var(--on-light-mut)" }}>Sin cuentas con este filtro</p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(27,25,22,.08)", background: "var(--surface)" }}>
          {filtered.map((r, i) => {
            const st = STATUS[r.status] ?? STATUS.CLOSED;
            return (
              <div
                key={r.id}
                style={{
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(27,25,22,.06)" : undefined,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{r.tableName}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: st.bg, color: st.color }}>{st.label}</span>
                      {r.live && (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: "rgba(47,179,126,.12)", color: "#1f6b4c" }}>QR en vivo</span>
                      )}
                      {r.paidViaMesita ? (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 100, background: "rgba(47,179,126,.14)", color: "#1f6b4c" }}>✓ Mesita</span>
                      ) : r.paid > 0 ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: "rgba(27,25,22,.06)", color: "#6B7280" }}>Solo POS</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--on-light-mut)", marginTop: 4 }}>
                      {r.posDocumentId && <span style={{ fontFamily: "monospace" }}>{r.posDocumentId}</span>}
                      {r.posDocumentId && " · "}
                      {fmtDate(r.updatedAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}>{formatCurrency(r.paid)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--on-light-mut)" }}>/ {formatCurrency(r.total)}</span></div>
                    {r.mesitaPaid > 0 && (
                      <div style={{ fontSize: 11, color: "#1f6b4c", marginTop: 2 }}>Mesita: {formatCurrency(r.mesitaPaid)}</div>
                    )}
                  </div>
                </div>

                {r.payments.length > 0 && (
                  <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                    {r.payments.map((p) => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "rgba(27,25,22,.03)" }}>
                        <span style={{ color: "var(--ink-900)" }}>
                          {p.guestName} · {p.method}
                          {p.viaMesita && <span style={{ marginLeft: 6, color: "#1f6b4c", fontWeight: 600 }}>Mesita</span>}
                        </span>
                        <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--on-light-mut)", textAlign: "right" }}>
        Fuente: <strong>Mesita POS API</strong> · actualiza cada 12s
      </p>
    </div>
  );
}
