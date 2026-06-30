"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Search,
  Store,
  Unplug,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";

type RestaurantStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
type IntegrationStatus = "CONNECTED" | "ACTION_REQUIRED" | "NOT_CONFIGURED" | "DISABLED";

interface RestaurantRow {
  id: string;
  name: string;
  status: RestaurantStatus;
  plan: string | null;
  createdAt: string;
  ownerEmail: string;
  ownerName: string | null;
  tablesCount: number;
  unmappedTables: number;
  openBillsCount: number;
  staffCount: number;
  month: { count: number; total: number };
  integrations: {
    pos: { status: IntegrationStatus; provider: string | null; environment: string };
    payments: { status: IntegrationStatus; provider: string; environment: string };
  };
  needsAttention: boolean;
}

interface AdminOverview {
  summary: {
    totalRestaurants: number;
    activeRestaurants: number;
    pendingRestaurants: number;
    needsAttention: number;
    monthVolume: number;
    monthTransactions: number;
    averageTicket: number;
    allTimeVolume: number;
    allTimeTransactions: number;
  };
  alerts: {
    failedPayments30d: number;
    pendingPosRegistrations: number;
    unmappedTables: number;
    pendingRestaurants: number;
  };
  trend: Array<{ date: string; volume: number; transactions: number }>;
  restaurants: RestaurantRow[];
  recentPayments: Array<{
    id: string;
    restaurantId: string;
    restaurantName: string;
    tableName: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
}

const STATUS_LABEL: Record<RestaurantStatus, string> = {
  ACTIVE: "Activo",
  PENDING: "Pendiente",
  SUSPENDED: "Suspendido",
};

function money(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function compactMoney(value: number) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const styles: Record<RestaurantStatus, string> = {
    ACTIVE: "bg-emerald-500/10 text-emerald-700",
    PENDING: "bg-amber-500/10 text-amber-700",
    SUSPENDED: "bg-red-500/10 text-red-700",
  };
  return <span className={`pill ${styles[status]}`}>{STATUS_LABEL[status]}</span>;
}

function IntegrationDot({ status, label }: { status: IntegrationStatus; label: string }) {
  const color =
    status === "CONNECTED"
      ? "bg-[var(--emerald)]"
      : status === "ACTION_REQUIRED"
        ? "bg-[var(--warning)]"
        : "bg-black/20";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--on-light-mut)]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function Kpi({
  label,
  value,
  helper,
  icon: Icon,
  dark,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof WalletCards;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-4 ${
        dark
          ? "border-transparent bg-[var(--ink-900)] text-[var(--on-dark)]"
          : "border-black/[0.08] bg-[var(--surface)] text-[var(--ink-800)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${dark ? "text-[var(--on-dark-mut)]" : "text-[var(--on-light-mut)]"}`}>
          {label}
        </p>
        <Icon className={`h-4 w-4 ${dark ? "text-[var(--emerald)]" : "text-[var(--on-light-mut)]"}`} />
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
      <p className={`mt-1 text-xs ${dark ? "text-[var(--on-dark-mut)]" : "text-[var(--on-light-mut)]"}`}>{helper}</p>
    </div>
  );
}

export default function AdminPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | RestaurantStatus | "ATTENTION">("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<RestaurantRow | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      const response = await fetch("/api/admin/restaurants", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json.data);
      setLastUpdated(new Date());
    } catch {
      toast({
        title: "No se pudo actualizar el panel",
        description: "Conservamos la última información disponible.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    load(true);
    const interval = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function updateStatus(restaurant: RestaurantRow, status: "ACTIVE" | "SUSPENDED") {
    setUpdatingId(restaurant.id);
    try {
      const response = await fetch(`/api/admin/restaurants/${restaurant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
      toast({ title: status === "ACTIVE" ? "Restaurante activado" : "Restaurante suspendido" });
      setSuspendTarget(null);
      await load(true);
    } catch {
      toast({ title: "No se pudo cambiar el estado", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  }

  const visibleRestaurants = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.restaurants ?? []).filter((restaurant) => {
      const matchesSearch =
        !normalized ||
        restaurant.name.toLowerCase().includes(normalized) ||
        restaurant.ownerEmail.toLowerCase().includes(normalized);
      const matchesFilter =
        filter === "ALL" ||
        (filter === "ATTENTION" ? restaurant.needsAttention : restaurant.status === filter);
      return matchesSearch && matchesFilter;
    });
  }, [data, query, filter]);

  const maxTrend = Math.max(...(data?.trend.map((day) => day.volume) ?? [1]), 1);
  const alertTotal = data
    ? data.alerts.failedPayments30d +
      data.alerts.pendingPosRegistrations +
      data.alerts.unmappedTables +
      data.alerts.pendingRestaurants
    : 0;

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-10 w-72 rounded-xl bg-black/[0.07]" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-[18px] bg-black/[0.06]" />)}
        </div>
        <div className="h-96 rounded-[18px] bg-black/[0.06]" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
        <CardContent className="py-14 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-[var(--warning)]" />
          <h1 className="mt-4 text-xl font-semibold">No pudimos cargar el control de plataforma</h1>
          <Button className="mt-5" onClick={() => load()}>Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!suspendTarget}
        onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}
        title={`¿Suspender ${suspendTarget?.name ?? "este restaurante"}?`}
        description="El owner y su equipo perderán acceso, y el QR dejará de aceptar pagos hasta que vuelvas a activarlo."
        confirmLabel="Suspender restaurante"
        variant="destructive"
        onConfirm={() => {
          if (!suspendTarget) return Promise.resolve();
          return updateStatus(suspendTarget, "SUSPENDED");
        }}
      />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Control de plataforma</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[var(--ink-800)] sm:text-4xl">
            Operación MesitaQR
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-[var(--on-light-mut)]">
            Restaurantes, volumen procesado, integraciones y tareas operativas en una sola vista.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="hidden text-xs text-[var(--on-light-mut)] sm:inline">
              Actualizado {lastUpdated.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} disabled={refreshing} className="gap-2 bg-[var(--surface)]">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Volumen este mes"
          value={compactMoney(data.summary.monthVolume)}
          helper={`${data.summary.monthTransactions} transacciones · no es ingreso neto`}
          icon={WalletCards}
          dark
        />
        <Kpi
          label="Ticket promedio"
          value={money(data.summary.averageTicket)}
          helper={`${compactMoney(data.summary.allTimeVolume)} procesados históricamente`}
          icon={CreditCard}
        />
        <Kpi
          label="Restaurantes activos"
          value={`${data.summary.activeRestaurants} / ${data.summary.totalRestaurants}`}
          helper={`${data.summary.pendingRestaurants} pendientes de activación`}
          icon={Store}
        />
        <Kpi
          label="Requieren atención"
          value={String(data.summary.needsAttention)}
          helper={alertTotal === 0 ? "Operación sin alertas" : `${alertTotal} señales operativas abiertas`}
          icon={AlertTriangle}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Volumen procesado · 14 días</CardTitle>
              <p className="mt-1 text-xs text-[var(--on-light-mut)]">Misma fuente de pagos que usan los dashboards owner.</p>
            </div>
            <span className="pill pill-muted">USD</span>
          </CardHeader>
          <CardContent>
            <div className="flex h-52 items-end gap-2 pt-6">
              {data.trend.map((day, index) => {
                const height = day.volume > 0 ? Math.max(10, Math.round((day.volume / maxTrend) * 100)) : 3;
                const showLabel = index === 0 || index === data.trend.length - 1 || index === 6;
                return (
                  <div key={day.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="mb-2 hidden rounded-lg bg-[var(--ink-900)] px-2 py-1 text-center text-[10px] text-white group-hover:block">
                      {money(day.volume)} · {day.transactions}
                    </div>
                    <div
                      className="w-full rounded-t-md bg-[var(--emerald)]/80 transition-all group-hover:bg-[var(--emerald)]"
                      style={{ height: `${height}%` }}
                      title={`${day.date}: ${money(day.volume)} · ${day.transactions} transacciones`}
                    />
                    <span className="mt-2 h-4 text-center text-[10px] text-[var(--on-light-mut)]">
                      {showLabel ? new Date(`${day.date}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-[var(--emerald)]" /> Centro de atención
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: "Cobros sin confirmar en POS", value: data.alerts.pendingPosRegistrations, icon: Unplug },
              { label: "Mesas sin ID del POS", value: data.alerts.unmappedTables, icon: Building2 },
              { label: "Pagos fallidos · 30 días", value: data.alerts.failedPayments30d, icon: CreditCard },
              { label: "Restaurantes pendientes", value: data.alerts.pendingRestaurants, icon: Store },
            ].map((alert) => {
              const Icon = alert.icon;
              return (
                <div key={alert.label} className="flex items-center gap-3 border-b border-black/[0.06] py-3 last:border-0">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${alert.value > 0 ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                    {alert.value > 0 ? <Icon className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </div>
                  <span className="min-w-0 flex-1 text-sm text-[var(--ink-800)]">{alert.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{alert.value}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <Card id="restaurantes" className="scroll-mt-6 border-black/[0.08] bg-[var(--surface)] shadow-none">
        <CardHeader className="gap-4 pb-3 lg:flex-row lg:items-end lg:justify-between lg:space-y-0">
          <div>
            <CardTitle className="text-lg">Restaurantes</CardTitle>
            <p className="mt-1 text-xs text-[var(--on-light-mut)]">Estado, actividad e integraciones sincronizados con la misma base de la app.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--on-light-mut)]" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar restaurante o owner" className="bg-white pl-9" />
            </div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as typeof filter)}
              className="h-10 rounded-md border border-input bg-white px-3 text-sm text-[var(--ink-800)] focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="PENDING">Pendientes</option>
              <option value="SUSPENDED">Suspendidos</option>
              <option value="ATTENTION">Requieren atención</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {visibleRestaurants.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Building2 className="mx-auto h-7 w-7 text-black/25" />
              <p className="mt-3 text-sm font-medium">No hay restaurantes con estos filtros</p>
              <p className="mt-1 text-xs text-[var(--on-light-mut)]">Prueba otra búsqueda o muestra todos.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-black/[0.06] bg-[var(--paper-2)]/55 hover:bg-[var(--paper-2)]/55">
                    <TableHead className="pl-6 text-xs">Restaurante</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-right text-xs">Este mes</TableHead>
                    <TableHead className="text-xs">Integraciones</TableHead>
                    <TableHead className="text-xs">Operación</TableHead>
                    <TableHead className="pr-6 text-right text-xs">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRestaurants.map((restaurant) => (
                    <TableRow key={restaurant.id} className="border-black/[0.06]">
                      <TableCell className="py-3 pl-6">
                        <Link href={`/admin/restaurants/${restaurant.id}`} className="group inline-flex items-center gap-2 font-semibold text-[var(--ink-800)]">
                          {restaurant.name}
                          <ArrowUpRight className="h-3.5 w-3.5 text-black/25 transition-colors group-hover:text-[var(--emerald)]" />
                        </Link>
                        <p className="mt-0.5 max-w-[240px] truncate text-xs text-[var(--on-light-mut)]">{restaurant.ownerEmail}</p>
                      </TableCell>
                      <TableCell><StatusBadge status={restaurant.status} /></TableCell>
                      <TableCell className="text-right">
                        <p className="font-semibold tabular-nums">{money(restaurant.month.total)}</p>
                        <p className="text-xs text-[var(--on-light-mut)]">{restaurant.month.count} transacciones</p>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <IntegrationDot status={restaurant.integrations.pos.status} label={restaurant.integrations.pos.provider ?? "POS"} />
                          <IntegrationDot status={restaurant.integrations.payments.status} label={restaurant.integrations.payments.provider} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{restaurant.tablesCount} mesas · {restaurant.openBillsCount} abiertas</p>
                        <p className={`text-xs ${restaurant.unmappedTables > 0 ? "text-amber-700" : "text-[var(--on-light-mut)]"}`}>
                          {restaurant.unmappedTables > 0 ? `${restaurant.unmappedTables} sin mapear` : `${restaurant.staffCount} usuarios`}
                        </p>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        {restaurant.status === "ACTIVE" ? (
                          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setSuspendTarget(restaurant)} disabled={updatingId === restaurant.id}>
                            Suspender
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => updateStatus(restaurant, "ACTIVE")} disabled={updatingId === restaurant.id}>
                            Activar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-black/[0.06]">
          {data.recentPayments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--on-light-mut)]">Aún no hay pagos registrados.</p>
          ) : data.recentPayments.map((payment) => (
            <div key={payment.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <Link href={`/admin/restaurants/${payment.restaurantId}`} className="truncate text-sm font-medium hover:text-[var(--emerald)]">{payment.restaurantName}</Link>
                  <p className="text-xs text-[var(--on-light-mut)]">{payment.tableName} · {dateTime(payment.createdAt)}</p>
                </div>
              </div>
              <p className="pl-11 text-sm font-semibold tabular-nums sm:pl-0">{money(payment.amount)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
