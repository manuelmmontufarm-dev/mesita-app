"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, Clock, RefreshCw, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Alert = {
  billId: string;
  tableName: string;
  status: string;
  billTotal: number;
  paidTotal: number;
  pendingTotal: number;
  unregisteredTotal: number;
  needsPosRegistration: boolean;
  unregisteredPaymentIds?: string[];
  paymentCount: number;
  lastPaymentAt: string | null;
  lastPaymentReference: string | null;
  displayStatus?: "paid" | "partial" | "review";
  displayMessage?: string;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function relativeTime(value: string | null): string {
  if (!value) return "Sin hora";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function statusFor(alert: Alert): "paid" | "partial" | "review" {
  if (alert.displayStatus) return alert.displayStatus;
  if (alert.status === "NEEDS_REVIEW") return "review";
  if (alert.pendingTotal > 0) return "partial";
  return "paid";
}

function messageFor(alert: Alert): string {
  if (alert.displayMessage) return alert.displayMessage;
  const status = statusFor(alert);
  if (status === "review") return "Revisar POS";
  if (status === "partial") return "Falta pagar";
  return "Pagado";
}

export default function CompanionPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBillId, setSavingBillId] = useState<string | null>(null);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/pos-companion/payments", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo cargar");
      }
      setAlerts((json.data.alerts ?? []).slice(0, 50));
    } catch (err) {
      setAlerts([]);
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    tick();
    const id = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const pendingAlerts = useMemo(() => alerts.filter((alert) => statusFor(alert) !== "paid"), [alerts]);
  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.billId === selectedBillId) ?? alerts[0] ?? null,
    [alerts, selectedBillId]
  );

  useEffect(() => {
    if (alerts.length === 0) {
      setSelectedBillId(null);
      return;
    }
    if (!selectedBillId || !alerts.some((alert) => alert.billId === selectedBillId)) {
      setSelectedBillId(pendingAlerts[0]?.billId ?? alerts[0].billId);
    }
  }, [alerts, pendingAlerts, selectedBillId]);

  async function retryCobro(paymentId: string) {
    setSavingBillId(paymentId);
    setError(null);
    try {
      const res = await fetch("/api/pos-companion/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo reintentar cobro");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingBillId(null);
    }
  }

  async function markRegistered(billId: string) {
    setSavingBillId(billId);
    setError(null);
    try {
      const res = await fetch("/api/pos-companion/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "No se pudo marcar");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingBillId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc,#e5e7eb_48%,#d1d5db)] p-2 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-16px)] w-full max-w-[360px] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/75 shadow-2xl shadow-zinc-900/20 backdrop-blur-xl">
        <header className="border-b border-zinc-200/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-950 text-white">
                  <Bell className="h-3.5 w-3.5" />
                </span>
                <span>MesitaQR</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-zinc-500">Widget de caja</p>
            </div>
            <div className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              {pendingAlerts.length} alertas
            </div>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {error && (
            <div className="m-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl bg-white/70 p-3 text-sm text-zinc-500">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Cargando pagos
              </div>
            ) : alerts.length === 0 ? (
              <div className="rounded-2xl bg-white/70 p-4 text-sm text-zinc-500">
                No hay pagos recientes.
              </div>
            ) : (
              <div className="space-y-1.5">
                {alerts.map((alert) => {
                  const selected = selectedAlert?.billId === alert.billId;
                  return (
                    <button
                      key={alert.billId}
                      className={[
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                        selected
                          ? "bg-zinc-950 text-white shadow-lg shadow-zinc-900/15"
                          : "bg-white/70 text-zinc-950 hover:bg-white",
                      ].join(" ")}
                      onClick={() => setSelectedBillId(alert.billId)}
                      type="button"
                    >
                      <span
                        className={[
                          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                          statusFor(alert) === "review"
                            ? selected
                              ? "bg-red-300 text-red-950"
                              : "bg-red-100 text-red-700"
                            : statusFor(alert) === "partial"
                            ? selected
                              ? "bg-amber-300 text-amber-950"
                              : "bg-amber-100 text-amber-800"
                            : selected
                              ? "bg-emerald-300 text-emerald-950"
                              : "bg-emerald-100 text-emerald-800",
                        ].join(" ")}
                      >
                        <WalletCards className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{alert.tableName}</span>
                          <span
                            className={[
                              "shrink-0 text-xs font-semibold",
                              selected ? "text-zinc-200" : "text-zinc-500",
                            ].join(" ")}
                          >
                            {formatCurrency(alert.unregisteredTotal || alert.paidTotal)}
                          </span>
                        </span>
                        <span
                          className={[
                            "mt-0.5 flex items-center gap-1.5 text-xs",
                            selected ? "text-zinc-300" : "text-zinc-500",
                          ].join(" ")}
                        >
                          <Clock className="h-3 w-3" />
                          {relativeTime(alert.lastPaymentAt)}
                          <span>·</span>
                          {messageFor(alert)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {selectedAlert && (
            <section className="border-t border-zinc-200/80 bg-white/80 p-3">
              <div className="rounded-3xl bg-zinc-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold leading-tight">
                      {selectedAlert.tableName}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {selectedAlert.paymentCount} pago
                      {selectedAlert.paymentCount === 1 ? "" : "s"} en MesitaQR
                    </p>
                  </div>
                  <Badge
                    className={
                      statusFor(selectedAlert) === "review"
                        ? "border-0 bg-red-200 text-red-950"
                        : statusFor(selectedAlert) === "partial"
                        ? "border-0 bg-amber-200 text-amber-950"
                        : "border-0 bg-emerald-200 text-emerald-950"
                    }
                  >
                    {messageFor(selectedAlert)}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-white p-2">
                    <div className="text-[11px] font-medium text-zinc-500">Pagado</div>
                    <div className="truncate text-sm font-semibold text-emerald-700">
                      {formatCurrency(selectedAlert.paidTotal)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-2">
                    <div className="text-[11px] font-medium text-zinc-500">Falta</div>
                    <div className="truncate text-sm font-semibold">
                      {formatCurrency(selectedAlert.pendingTotal)}
                    </div>
                  </div>
                </div>

                {selectedAlert.lastPaymentReference && (
                  <p className="mt-2 truncate px-1 text-[11px] text-zinc-500">
                    Ref. {selectedAlert.lastPaymentReference}
                  </p>
                )}

                {selectedAlert.needsPosRegistration && (
                  <div className="mt-3 space-y-2">
                    {(selectedAlert.unregisteredPaymentIds ?? []).slice(0, 1).map((paymentId) => (
                      <Button
                        key={paymentId}
                        variant="outline"
                        className="h-11 w-full rounded-2xl text-sm font-semibold"
                        disabled={savingBillId === paymentId}
                        onClick={() => retryCobro(paymentId)}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {savingBillId === paymentId ? "Reintentando..." : "Reintentar cobro en Contífico"}
                      </Button>
                    ))}
                    <Button
                      className="h-11 w-full rounded-2xl bg-emerald-500 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-600"
                      disabled={savingBillId === selectedAlert.billId}
                      onClick={() => markRegistered(selectedAlert.billId)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {savingBillId === selectedAlert.billId
                        ? "Marcando..."
                        : "Marcado manual en POS"}
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
