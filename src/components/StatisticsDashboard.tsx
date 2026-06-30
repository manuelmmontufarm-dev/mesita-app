"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { ownerDashboardEndpoint } from "@/lib/owner-data-source";
import { SkeletonCard } from "@/components/shared/LoadingState";

interface Confirmation {
  tableName: string;
  amount: number;
  guestName?: string;
  createdAt?: string;
}

interface TableRow {
  id: string;
  name: string;
  status: "open" | "paying" | "closed";
  guestCount: number;
  total: number;
  live?: boolean;
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
  demoMode?: boolean;
}

const ACCENT_GREEN = "#2fb37e";
const ACCENT_RED = "#FF4D4D";

const STATUS = {
  paying: { label: "Pagando", bg: "rgba(47,179,126,.14)", color: "#1f6b4c" },
  open: { label: "Abierta", bg: "rgba(232,106,51,.13)", color: "#c45a1a" },
  closed: { label: "Cerrada", bg: "rgba(27,25,22,.08)", color: "#6B7280" },
} as const;

const OCCUPANCY_COLOR: Record<TableRow["status"], string> = {
  open: ACCENT_RED,
  paying: ACCENT_GREEN,
  closed: "rgba(27,25,22,.10)",
};

function KpiCard({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div
      style={{
        padding: "15px 16px",
        borderRadius: 18,
        background: dark ? "var(--ink-900)" : "var(--surface)",
        border: dark ? "none" : "1px solid rgba(27,25,22,.08)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: dark ? "var(--on-dark-mut)" : "var(--on-light-mut)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 25,
          fontWeight: 600,
          letterSpacing: "-0.025em",
          color: dark ? "var(--on-dark)" : "var(--ink-900)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="rgba(47,179,126,.18)" />
      <path
        d="M5 8L7 10L11 6"
        stroke={ACCENT_GREEN}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LiveBadge() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        color: "#1f6b4c",
        padding: "6px 12px",
        borderRadius: 100,
        background: "rgba(47,179,126,0.10)",
        border: "1px solid rgba(47,179,126,0.18)",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: ACCENT_GREEN,
          boxShadow: "0 0 0 2px rgba(47,179,126,0.22)",
        }}
      />
      En vivo
    </div>
  );
}

export function StatisticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [staleAsOf, setStaleAsOf] = useState<Date | null>(null);

  const lastGoodAtRef = useRef<Date | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const endpoint = await ownerDashboardEndpoint();
      const res = await fetch(endpoint, { credentials: "include", cache: "no-store" });
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
        setStaleAsOf(new Date(lastGoodAtRef.current.getTime()));
      } else {
        setIsError(true);
      }
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const id = setInterval(() => { void load(); }, 5_000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [load]);

  const handleRetry = () => {
    setIsError(false);
    setIsLoading(true);
    load();
  };

  if (isError) {
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <div
          style={{
            padding: "36px 24px",
            borderRadius: 18,
            background: "var(--surface)",
            border: "1px solid rgba(27,25,22,.08)",
            textAlign: "center",
            display: "grid",
            gap: 10,
            justifyItems: "center",
          }}
        >
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>
            No pudimos cargar las estadísticas
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
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div className="stats-kpi-grid">
          <div style={{ padding: "15px 16px", borderRadius: 18, background: "var(--ink-900)" }}>
            <div
              style={{
                width: 72,
                height: 11,
                borderRadius: 6,
                background: "rgba(255,255,255,.12)",
                marginBottom: 12,
              }}
            />
            <div style={{ width: 80, height: 25, borderRadius: 6, background: "rgba(255,255,255,.12)" }} />
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="stats-split-grid">
          <div style={{ height: 140, borderRadius: 18, background: "rgba(27,25,22,.06)" }} />
          <div style={{ height: 140, borderRadius: 18, background: "rgba(27,25,22,.06)" }} />
        </div>
        <div style={{ height: 72, borderRadius: 18, background: "rgba(27,25,22,.06)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <p style={{ fontSize: 13.5, color: "var(--on-light-mut)" }}>
        Sin datos de estadísticas por el momento.
      </p>
    );
  }

  const { kpis } = data;
  const bars = data.hourlyActivity ?? [];
  const payments = data.recentConfirmations ?? [];
  const tables = data.tables ?? [];

  const nowH = new Date().getHours();
  const peakLabel = `${nowH}h – ${nowH + 1}h`;

  const occupancyCount = tables.filter((t) => t.status !== "closed").length;
  const occupancyPct =
    kpis.totalTables > 0 ? Math.round((occupancyCount / kpis.totalTables) * 100) : 0;

  const todayLabel = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const staleMinutes = staleAsOf
    ? Math.max(1, Math.round((Date.now() - staleAsOf.getTime()) / 60_000))
    : 0;

  return (
    <>
      <style>{`
        .stats-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 148px), 1fr));
          gap: 10px;
        }
        .stats-split-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
          gap: 10px;
        }
        .stats-occupancy-grid {
          display: grid;
          gap: 6px;
        }
        .stats-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 12px;
          flex-wrap: wrap;
        }
        .stats-payment-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(27,25,22,.06);
        }
        .stats-payment-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .stats-payment-meta {
          flex: 1;
          min-width: 0;
        }
        @media (max-width: 480px) {
          .stats-bar-labels {
            display: none;
          }
        }
      `}</style>

      <div style={{ display: "grid", gap: 14 }}>
        <div className="stats-header">
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                color: "var(--ink-900)",
                margin: "0 0 4px",
              }}
            >
              Estadísticas
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "var(--on-light-mut)",
                margin: 0,
                textTransform: "capitalize",
              }}
            >
              {todayLabel}
            </p>
          </div>
          <LiveBadge />
        </div>

        {staleAsOf && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 12,
              background: "rgba(242,169,59,.12)",
              border: "1px solid rgba(242,169,59,.3)",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "var(--warning)",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#8a5e0a" }}>
              Sin conexión con el servidor · Datos de hace {staleMinutes} min
            </span>
          </div>
        )}

        <div className="stats-kpi-grid">
          <KpiCard label="Ingresos hoy" value={formatCurrency(kpis.revenueToday)} dark />
          <KpiCard label="Mesas activas" value={`${kpis.activeTables} / ${kpis.totalTables}`} />
          <KpiCard label="Ticket promedio" value={formatCurrency(kpis.avgTicket)} />
          <KpiCard label="Propina media" value={`${kpis.propinaRate}%`} />
        </div>

        <div className="stats-split-grid">
          <div
            style={{
              padding: "15px 17px",
              borderRadius: 18,
              background: "var(--surface)",
              border: "1px solid rgba(27,25,22,.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
                Actividad por hora
              </span>
              {bars.length > 0 && (
                <span
                  className="stats-bar-labels"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: ACCENT_GREEN,
                    letterSpacing: ".05em",
                  }}
                >
                  {peakLabel}
                </span>
              )}
            </div>
            {bars.length === 0 ? (
              <div style={{ height: 72, display: "flex", alignItems: "center" }}>
                <p style={{ fontSize: 12.5, color: "var(--on-light-mut)", margin: 0 }}>
                  Sin datos por hora todavía.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
                {bars.map((h, i) => (
                  <div
                    key={i}
                    title={`${i >= bars.length - 1 ? "Ahora" : `Hace ${bars.length - 1 - i}h`}`}
                    style={{
                      flex: 1,
                      height: `${Math.max(h, 8)}%`,
                      borderRadius: 4,
                      background: i >= bars.length - 3 ? ACCENT_GREEN : "rgba(27,25,22,.11)",
                      transition: "height .4s var(--ease, ease), background .3s",
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              padding: "15px 17px",
              borderRadius: 18,
              background: "var(--surface)",
              border: "1px solid rgba(27,25,22,.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ACCENT_GREEN,
                  boxShadow: "0 0 0 3px rgba(47,179,126,.22)",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
                Pagos recientes
              </span>
            </div>
            {payments.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--on-light-mut)", margin: 0 }}>
                Sin pagos hoy aún.
              </p>
            ) : (
              <div>
                {payments.map((p, i) => (
                  <div key={`${p.createdAt ?? i}-${p.amount}`} className="stats-payment-row">
                    <CheckIcon />
                    <div className="stats-payment-meta">
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "var(--ink-900)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.tableName}
                        {p.guestName && (
                          <span
                            style={{
                              fontWeight: 400,
                              color: "var(--on-light-mut)",
                              marginLeft: 6,
                            }}
                          >
                            · {p.guestName}
                          </span>
                        )}
                      </div>
                      {p.createdAt && (
                        <div style={{ fontSize: 11.5, color: "var(--on-light-mut)", marginTop: 2 }}>
                          {formatRelativeTime(p.createdAt)}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--ink-900)",
                        fontVariantNumeric: "tabular-nums",
                        flexShrink: 0,
                      }}
                    >
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: "15px 17px",
            borderRadius: 18,
            background: "var(--surface)",
            border: "1px solid rgba(27,25,22,.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--on-light-mut)" }}>
              Ocupación de mesas
            </span>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: "var(--ink-900)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {occupancyCount} / {kpis.totalTables} · {occupancyPct}%
            </span>
          </div>

          <div
            className="stats-occupancy-grid"
            style={{
              gridTemplateColumns: `repeat(${Math.min(Math.max(tables.length, 1), 12)}, 1fr)`,
            }}
          >
            {tables.map((t) => {
              const sc = STATUS[t.status];
              return (
                <div
                  key={t.id}
                  title={`${t.name} — ${sc.label}`}
                  style={{
                    display: "grid",
                    gap: 6,
                    justifyItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 10,
                      borderRadius: 100,
                      background: OCCUPANCY_COLOR[t.status],
                      transition: "background .3s",
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--on-light-mut)",
                      textAlign: "center",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {t.name.replace(/^Mesa\s*/i, "")}
                  </span>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 14,
              flexWrap: "wrap",
            }}
          >
            {(Object.entries(STATUS) as [TableRow["status"], (typeof STATUS)[TableRow["status"]]][]).map(
              ([key, sc]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: OCCUPANCY_COLOR[key],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11.5, color: "var(--on-light-mut)", fontWeight: 500 }}>
                    {sc.label}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </>
  );
}
