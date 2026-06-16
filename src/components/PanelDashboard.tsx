"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { SkeletonCard } from "@/components/shared/LoadingState";

interface Confirmation {
  tableName: string;
  amount: number;
}

interface TableRow {
  id: string;
  name: string;
  status: "open" | "paying" | "closed";
  guestCount: number;
  total: number;
}

interface DashboardData {
  kpis: {
    revenueToday: number;
    activeTables: number;
    totalTables: number;
    avgTicket: number;
    propinaRate: number;
  };
  hourlyActivity: number[];
  recentConfirmations: Confirmation[];
  tables: TableRow[];
}

const STATUS = {
  paying: { label: "Pagando", bg: "rgba(91,107,140,.14)", color: "#4a5a78" },
  open:   { label: "Abierta", bg: "rgba(47,179,126,.13)", color: "#1f6b4c" },
  closed: { label: "Cerrada", bg: "rgba(27,25,22,.08)",   color: "#6B7280" },
} as const;

function UsersIcon() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" fill="none" style={{ flexShrink: 0 }}>
      <path
        d="M5 5.5C6.1 5.5 7 4.6 7 3.5S6.1 1.5 5 1.5 3 2.4 3 3.5s.9 2 2 2zm0 1C3.33 6.5.5 7.33.5 9v.5h9V9c0-1.67-2.83-2.5-4.5-2.5zM9.5 5.5c.83 0 1.5-.67 1.5-1.5S10.33 2.5 9.5 2.5M11.5 9v.5h1V9c0-1.25-1.75-1.9-2.5-2 .63.5 1.5 1.1 1.5 2z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="rgba(47,179,126,.18)" />
      <path d="M5 8L7 10L11 6" stroke="#2fb37e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KpiCard({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div style={{
      padding: "15px 16px",
      borderRadius: 18,
      background: dark ? "var(--ink-900)" : "var(--surface)",
      border: dark ? "none" : "1px solid rgba(27,25,22,.08)",
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: dark ? "var(--on-dark-mut)" : "var(--on-light-mut)",
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 25,
        fontWeight: 600,
        letterSpacing: "-0.025em",
        color: dark ? "var(--on-dark)" : "var(--ink-900)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </div>
    </div>
  );
}

export function PanelDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  // Background-refetch failure: keep last good data and surface its age.
  const [staleAsOf, setStaleAsOf] = useState<Date | null>(null);
  const lastGoodAtRef = useRef<Date | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      if (mountedRef.current) {
        setData(json.data);
        setIsError(false);
        setStaleAsOf(null);
        lastGoodAtRef.current = new Date();
      }
    } catch {
      if (!mountedRef.current) return;
      if (lastGoodAtRef.current) {
        // We still have good data — degrade softly instead of blanking the panel.
        // New Date instance on every failure so the "hace X min" badge re-renders.
        setStaleAsOf(new Date(lastGoodAtRef.current.getTime()));
      } else {
        setIsError(true);
      }
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = setInterval(load, 30_000);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [load]);

  const handleRetry = () => {
    setIsError(false);
    setIsLoading(true);
    load();
  };

  // ── Error (initial load failed, no data to show) ─────────────────────────
  if (isError) {
    return (
      <div style={{
        padding: "36px 24px",
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid rgba(27,25,22,.08)",
        textAlign: "center",
        display: "grid",
        gap: 10,
        justifyItems: "center",
      }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
          No pudimos cargar el panel
        </p>
        <p style={{ fontSize: 13, color: "var(--on-light-mut)", margin: 0 }}>
          Revisa tu conexión e intenta de nuevo.
        </p>
        <button
          onClick={handleRetry}
          style={{
            marginTop: 6,
            minHeight: 44,
            padding: "0 22px",
            borderRadius: 12,
            border: "none",
            background: "var(--ink-900)",
            color: "var(--on-dark)",
            fontSize: 13.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          <div style={{ padding: "15px 16px", borderRadius: 18, background: "var(--ink-900)" }}>
            <div style={{ width: 72, height: 11, borderRadius: 6, background: "rgba(255,255,255,.12)", marginBottom: 12 }} />
            <div style={{ width: 80, height: 25, borderRadius: 6, background: "rgba(255,255,255,.12)" }} />
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 10 }}>
          <div style={{ height: 110, borderRadius: 18, background: "rgba(27,25,22,.06)" }} />
          <div style={{ height: 110, borderRadius: 18, background: "rgba(27,25,22,.06)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 78, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    // Shouldn't happen (error/loading cover it), but never render with fake numbers.
    return (
      <p style={{ fontSize: 13.5, color: "var(--on-light-mut)" }}>
        Sin datos del panel por el momento.
      </p>
    );
  }

  const { kpis } = data;
  const bars = data.hourlyActivity ?? [];
  const confs = data.recentConfirmations ?? [];
  const tables = data.tables ?? [];

  // ── Empty / first day: no activity yet ────────────────────────────────────
  const noActivityToday =
    kpis.revenueToday === 0 &&
    confs.length === 0 &&
    bars.every((v) => v === 0);

  if (noActivityToday) {
    return (
      <div style={{
        padding: "44px 24px",
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid rgba(27,25,22,.08)",
        textAlign: "center",
        display: "grid",
        gap: 8,
        justifyItems: "center",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          background: "rgba(47,179,126,.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 4,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2fb37e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1" />
          </svg>
        </div>
        <p style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
          Aún no hay actividad hoy
        </p>
        <p style={{ fontSize: 13.5, color: "var(--on-light-mut)", margin: 0, maxWidth: 360 }}>
          Comparte los códigos QR de tus mesas para que tus clientes empiecen a pagar desde su celular.
        </p>
        <Link
          href="/dashboard/owner/mesas"
          style={{
            marginTop: 8,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--ink-900)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Ver mis mesas y códigos QR
        </Link>
      </div>
    );
  }

  // ── Data ──────────────────────────────────────────────────────────────────
  const nowH = new Date().getHours();
  const peakLabel = `${nowH}h – ${nowH + 1}h`;

  const occupancy =
    `${kpis.activeTables} / ${kpis.totalTables} · ${kpis.totalTables > 0 ? Math.round((kpis.activeTables / kpis.totalTables) * 100) : 0}%`;

  const staleMinutes = staleAsOf
    ? Math.max(1, Math.round((Date.now() - staleAsOf.getTime()) / 60_000))
    : 0;

  return (
    <div style={{ display: "grid", gap: 12 }}>

      {/* Stale-data badge: refetch failed but last good data is still shown */}
      {staleAsOf && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 12,
          background: "rgba(242,169,59,.12)",
          border: "1px solid rgba(242,169,59,.3)",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--warning)", flexShrink: 0, display: "inline-block",
          }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8a5e0a" }}>
            Sin conexión con el servidor · Datos de hace {staleMinutes} min
          </span>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <KpiCard label="Ingresos hoy"     value={formatCurrency(kpis.revenueToday)} dark />
        <KpiCard label="Mesas activas"    value={String(kpis.activeTables)} />
        <KpiCard label="Ticket promedio"  value={formatCurrency(kpis.avgTicket)} />
        <KpiCard label="Propina media"    value={`${kpis.propinaRate}%`} />
      </div>

      {/* Activity + Confirmations */}
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 10 }}>

        {/* Bar chart */}
        <div style={{ padding: "15px 17px", borderRadius: 18, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
              Actividad por hora
            </span>
            {bars.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--emerald)", letterSpacing: ".05em" }}>
                {peakLabel}
              </span>
            )}
          </div>
          {bars.length === 0 ? (
            <div style={{ height: 58, display: "flex", alignItems: "center" }}>
              <p style={{ fontSize: 12.5, color: "var(--on-light-mut)", margin: 0 }}>
                Sin datos por hora todavía.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 58 }}>
              {bars.map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.max(h, 8)}%`,
                    borderRadius: 4,
                    background: i >= 9 ? "var(--emerald)" : "rgba(27,25,22,.11)",
                    transition: "height .4s var(--ease)",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live confirmations */}
        <div style={{ padding: "15px 17px", borderRadius: 18, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--emerald)",
              boxShadow: "0 0 0 3px rgba(47,179,126,.22)",
              display: "inline-block", flexShrink: 0,
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
              Confirmaciones en vivo
            </span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {confs.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--on-light-mut)" }}>Sin pagos hoy aún.</p>
            ) : (
              confs.slice(0, 3).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckIcon />
                  <span style={{ flex: 1, fontSize: 13, color: "var(--ink-900)" }}>{c.tableName}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(c.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Occupancy */}
      <div style={{ padding: "15px 17px", borderRadius: 18, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
            Ocupación de la sala
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
            {occupancy}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
          {Array.from({ length: Math.max(kpis.totalTables, 1) }).slice(0, 24).map((_, i) => {
            const active = i < kpis.activeTables;
            return (
              <div
                key={i}
                style={{
                  aspectRatio: "1",
                  borderRadius: 6,
                  background: active ? "var(--emerald)" : "rgba(27,25,22,.1)",
                  boxShadow: active ? "0 0 8px -2px rgba(47,179,126,.45)" : "none",
                  transition: "background .3s",
                  gridColumn: i >= 12 ? "auto" : undefined,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Tables */}
      <div>
        <div style={{
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--on-light-mut)",
          marginBottom: 11,
        }}>
          Mesas
        </div>

        {tables.length === 0 ? (
          <p style={{ fontSize: 13.5, color: "var(--on-light-mut)" }}>
            No hay mesas registradas.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {tables.map((t) => {
              const sc = STATUS[t.status];
              return (
                <div
                  key={t.id}
                  style={{
                    padding: "13px 14px",
                    borderRadius: 14,
                    background: "var(--surface)",
                    border: "1px solid rgba(27,25,22,.07)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>
                      {t.name}
                    </span>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "3px 9px",
                      borderRadius: 100,
                      background: sc.bg,
                      color: sc.color,
                    }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--on-light-mut)", display: "flex", alignItems: "center", gap: 4 }}>
                      <UsersIcon />
                      {t.guestCount > 0 ? t.guestCount : "—"}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)", fontVariantNumeric: "tabular-nums" }}>
                      {t.total > 0 ? formatCurrency(t.total) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
