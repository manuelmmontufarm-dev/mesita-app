"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/format";
import { isOwnerDemoMode } from "@/lib/owner-data-source";

interface PaymentRow {
  paymentId: string;
  billId: string;
  tableId: string;
  tableName: string;
  amount: number;
  voluntaryTip: number;
  splitMode: string | null;
  guestNombre: string | null;
  providerTransactionId: string;
  posRegisteredAt: string | null;
  posRegistrationNote: string | null;
  createdAt: string;
  status: string;
}

interface KpiCards {
  totalCollected: number;
  propinaTotal: number;
  paymentCount: number;
  avgPayment: number;
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  COMPLETED: { label: "Completado", color: "#166534", bg: "rgba(22,101,52,.1)" },
  REFUNDED: { label: "Reembolsado", color: "#6B7280", bg: "rgba(27,25,22,.08)" },
  FAILED: { label: "Fallido", color: "#b91c1c", bg: "rgba(185,28,28,.1)" },
  PENDING: { label: "Pendiente", color: "#c45a1a", bg: "rgba(232,106,51,.13)" },
};

const FILTERS = [
  { value: "all", label: "Todos" },
  { value: "COMPLETED", label: "Completados" },
  { value: "REFUNDED", label: "Reembolsados" },
  { value: "pos_pending", label: "POS pendiente" },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" });
}

function refTail(id: string) {
  return id.length > 8 ? id.slice(-8) : id;
}

export default function ReembolsosPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [kpis, setKpis] = useState<KpiCards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [date, setDate] = useState(todayIso());

  const load = useCallback(async () => {
    try {
      setError(null);
      const isDemo = await isOwnerDemoMode();
      setDemoMode(isDemo);

      if (isDemo) {
        const res = await fetch(`/api/demo-pos?view=reports&date=${encodeURIComponent(date)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("No se pudieron cargar los pagos");
        const json = await res.json();
        const reports: Array<{
          id: string;
          tableName: string;
          tableToken: string;
          payments: Array<{
            id: string;
            amount: number;
            guestName?: string;
            ref?: string;
            createdAt: string;
            viaMesita?: boolean;
          }>;
        }> = json.data?.reports ?? [];

        const rows: PaymentRow[] = reports.flatMap((r) =>
          r.payments.map((p) => ({
            paymentId: p.id,
            billId: r.id,
            tableId: r.tableToken,
            tableName: r.tableName,
            amount: p.amount,
            voluntaryTip: 0,
            splitMode: null,
            guestNombre: p.guestName ?? null,
            providerTransactionId: p.ref ?? p.id,
            posRegisteredAt: p.viaMesita ? p.createdAt : null,
            posRegistrationNote: null,
            createdAt: p.createdAt,
            status: "COMPLETED",
          })),
        ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const totalCollected = rows.reduce((s, p) => s + p.amount, 0);
        setPayments(rows);
        setKpis({
          totalCollected,
          propinaTotal: 0,
          paymentCount: rows.length,
          avgPayment: rows.length > 0 ? totalCollected / rows.length : 0,
        });
        return;
      }

      const params = new URLSearchParams({ from: date, to: date });
      const res = await fetch(`/api/reports/payments?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("No se pudieron cargar los pagos");
      const json = await res.json();
      const data = json.data ?? {};
      setPayments(data.payments ?? []);
      setKpis(data.kpiCards ?? null);
    } catch (e) {
      setPayments([]);
      setKpis(null);
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = payments.filter((p) => {
    if (filter === "COMPLETED" && p.status !== "COMPLETED") return false;
    if (filter === "REFUNDED" && p.status !== "REFUNDED") return false;
    if (filter === "pos_pending" && p.posRegisteredAt) return false;
    if (q) {
      const hay = [p.tableName, p.guestNombre ?? "", p.providerTransactionId]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput.trim());
  }

  const netRevenue = kpis?.totalCollected ?? payments.reduce((s, p) => s + p.amount, 0);
  const tipsTotal = payments.reduce((s, p) => s + p.voluntaryTip, 0);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-900)", margin: 0 }}>
          Pagos y reembolsos
        </h1>
        <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
          {demoMode
            ? `Historial de pagos MesitaQR · POS demo en vivo · ${date}`
            : `Historial de pagos MesitaQR · base de datos del restaurante · ${date}`}
        </p>
      </div>

      {error && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(242,169,59,.1)", border: "1px solid rgba(242,169,59,.25)", fontSize: 12.5, color: "#92400e" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Cobrado (neto)", value: formatCurrency(netRevenue) },
          { label: "Propinas voluntarias", value: formatCurrency(tipsTotal), accent: true },
          { label: "Pagos", value: String(kpis?.paymentCount ?? payments.length) },
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
            placeholder="Buscar mesa, comensal, referencia…"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(27,25,22,.12)", fontSize: 13 }}
          />
          <button type="submit" style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--ink-900)", color: "var(--on-dark)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            Buscar
          </button>
        </form>
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
          <p style={{ fontSize: 14, color: "var(--on-light-mut)" }}>Sin pagos con este filtro</p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(27,25,22,.08)", background: "var(--surface)" }}>
          {filtered.map((p, i) => {
            const st = STATUS[p.status] ?? STATUS.PENDING;
            const net = p.amount - p.voluntaryTip;
            return (
              <div
                key={p.paymentId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(27,25,22,.06)" : undefined,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{p.tableName}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: st.bg, color: st.color }}>{st.label}</span>
                    {!p.posRegisteredAt && p.status === "COMPLETED" && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: "rgba(242,169,59,.12)", color: "#92400e" }}>Cobro POS pendiente</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--on-light-mut)", marginTop: 4 }}>
                    {p.guestNombre ?? "Comensal"} · ref …{refTail(p.providerTransactionId)} · {fmtDate(p.createdAt)}
                  </div>
                  {p.posRegistrationNote && (
                    <div style={{ fontSize: 11, color: "#92400e", marginTop: 4 }}>{p.posRegistrationNote}</div>
                  )}
                </div>
                <div style={{ textAlign: "right", display: "grid", gap: 6, justifyItems: "end" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: p.status === "REFUNDED" ? "var(--on-light-mut)" : "var(--ink-900)", textDecoration: p.status === "REFUNDED" ? "line-through" : undefined }}>
                    {formatCurrency(net)}
                    {p.voluntaryTip > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#1f6b4c", marginLeft: 6 }}>+{formatCurrency(p.voluntaryTip)} propina</span>
                    )}
                  </div>
                  {p.status === "COMPLETED" && (
                    <Link
                      href={`/dashboard/owner/reembolsos/${p.billId}`}
                      style={{ fontSize: 12, fontWeight: 600, color: "#1f6b4c", textDecoration: "underline", textUnderlineOffset: 2 }}
                    >
                      Ver detalle / reembolsar
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--on-light-mut)", textAlign: "right" }}>
        Fuente: <strong>{demoMode ? "POS demo" : "Postgres"}</strong>
        {" · "}
        {demoMode ? "GET /api/demo-pos?view=reports" : "GET /api/reports/payments"}
        {" · actualiza cada 12s"}
      </p>
    </div>
  );
}
