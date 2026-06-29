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

interface ReportConsumption {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
  documentId: string;
  documentType: string;
  fecha: string;
}

interface ReportDocument {
  id: string;
  tipo: string;
  estado: string;
  descripcion: string | null;
  fecha: string;
  total: number;
  consumptions: ReportConsumption[];
  payments: ReportPayment[];
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
  consumptions: ReportConsumption[];
  documents: ReportDocument[];
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

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

export default function ReembolsosPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [date, setDate] = useState(todayIso());
  const [history, setHistory] = useState(false);
  const [posConnected, setPosConnected] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: "reports", date });
      if (search) params.set("q", search);
      if (history || search) params.set("history", "1");
      const res = await fetch(`/api/demo-pos?${params}`);
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      const data = json.data ?? {};
      setReports(data.reports ?? []);
      setPosConnected(Boolean(data.posConnected));
      setPosError(data.posError ?? null);
      setReportDate(data.date ?? "");
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [date, search, history]);

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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
    if (searchInput.trim()) setHistory(true);
    setLoading(true);
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-900)", margin: 0 }}>
          Reportes
        </h1>
        <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
          Consumos y facturas del POS Mesita · sincronizado con el app
          {reportDate && <> · {reportDate}</>}
        </p>
      </div>

      {!posConnected && posError && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(242,169,59,.1)", border: "1px solid rgba(242,169,59,.25)", fontSize: 12.5, color: "#92400e" }}>
          <strong>POS desconectado:</strong> {posError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Cobrado", value: formatCurrency(totalRevenue) },
          { label: "Vía Mesita", value: formatCurrency(mesitaTotal), accent: true },
          { label: "Mesas", value: String(reports.length) },
        ].map((kpi) => (
          <div key={kpi.label} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--on-light-mut)", marginBottom: 6 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: kpi.accent ? "#1f6b4c" : "var(--ink-900)" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setLoading(true); }}
          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(27,25,22,.12)", fontSize: 13 }}
        />
        <form onSubmit={runSearch} style={{ display: "flex", gap: 6, flex: 1, minWidth: 200 }}>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar mesa, factura, comensal, plato…"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(27,25,22,.12)", fontSize: 13 }}
          />
          <button type="submit" style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--ink-900)", color: "var(--on-dark)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Buscar
          </button>
        </form>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--on-light-mut)", cursor: "pointer" }}>
          <input type="checkbox" checked={history} onChange={(e) => { setHistory(e.target.checked); setLoading(true); }} />
          Ver historial completo
        </label>
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
            const isOpen = expanded.has(r.id);
            const consumptions = r.consumptions.length > 0
              ? r.consumptions
              : r.documents.flatMap((d) => d.consumptions);

            return (
              <div
                key={r.id}
                style={{
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(27,25,22,.06)" : undefined,
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(r.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, color: "var(--on-light-mut)" }}>{isOpen ? "▼" : "▶"}</span>
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
                      {consumptions.length > 0 && (
                        <span style={{ fontSize: 10, color: "var(--on-light-mut)" }}>{consumptions.length} consumos</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--on-light-mut)", marginTop: 4, paddingLeft: 22 }}>
                      {r.documents.length > 0
                        ? `${r.documents.length} factura(s) POS`
                        : r.posDocumentId && <span style={{ fontFamily: "monospace" }}>{r.posDocumentId}</span>}
                      {" · "}{fmtDate(r.updatedAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-900)" }}>{formatCurrency(r.paid)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--on-light-mut)" }}>/ {formatCurrency(r.total)}</span></div>
                    {r.mesitaPaid > 0 && (
                      <div style={{ fontSize: 11, color: "#1f6b4c", marginTop: 2 }}>Mesita: {formatCurrency(r.mesitaPaid)}</div>
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 12, paddingLeft: 22, display: "grid", gap: 14 }}>
                    {consumptions.length > 0 && (
                      <section>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--on-light-mut)", marginBottom: 8 }}>
                          Consumos del día (POS)
                        </p>
                        <div style={{ display: "grid", gap: 6 }}>
                          {consumptions.map((c) => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "rgba(27,25,22,.03)" }}>
                              <span style={{ color: "var(--ink-900)" }}>
                                {c.name}
                                <span style={{ color: "var(--on-light-mut)", marginLeft: 6 }}>×{c.qty}</span>
                                <span style={{ marginLeft: 8, fontSize: 10, fontFamily: "monospace", color: "#6B7280" }}>{c.documentType} {c.documentId.slice(0, 8)}</span>
                              </span>
                              <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(c.total)}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {r.documents.length > 0 && (
                      <section>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--on-light-mut)", marginBottom: 8 }}>
                          Facturas POS
                        </p>
                        {r.documents.map((doc) => (
                          <div key={doc.id} style={{ marginBottom: 10, padding: 10, borderRadius: 10, border: "1px solid rgba(27,25,22,.06)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
                              <span style={{ fontWeight: 600 }}>{doc.tipo} · <span style={{ fontFamily: "monospace" }}>{doc.id.slice(0, 12)}…</span></span>
                              <span>{formatCurrency(doc.total)} · {doc.fecha}</span>
                            </div>
                            {doc.descripcion && (
                              <p style={{ fontSize: 11, color: "var(--on-light-mut)", marginBottom: 6 }}>{doc.descripcion}</p>
                            )}
                            {doc.payments.map((p) => (
                              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", color: "var(--ink-900)" }}>
                                <span>{p.guestName} · {p.method}{p.viaMesita && <span style={{ color: "#1f6b4c", marginLeft: 4 }}>Mesita</span>}</span>
                                <span style={{ fontWeight: 600 }}>{formatCurrency(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </section>
                    )}

                    {r.payments.length > 0 && r.documents.length === 0 && (
                      <section>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--on-light-mut)", marginBottom: 8 }}>Pagos</p>
                        {r.payments.map((p) => (
                          <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: "rgba(27,25,22,.03)" }}>
                            <span style={{ color: "var(--ink-900)" }}>
                              {p.guestName} · {p.method}
                              {p.viaMesita && <span style={{ marginLeft: 6, color: "#1f6b4c", fontWeight: 600 }}>Mesita</span>}
                            </span>
                            <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(p.amount)}</span>
                          </div>
                        ))}
                      </section>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--on-light-mut)", textAlign: "right" }}>
        Fuente: <strong>POS Mesita API</strong> · {posConnected ? "conectado" : "sin conexión"} · actualiza cada 12s
      </p>
    </div>
  );
}
