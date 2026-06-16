"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { IVA_RATE, PROPINA_RATE } from "@/lib/constants/ecuador-tax";

interface BillItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  isPaid: boolean;
  paidAt: string | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  splitMode: string | null;
  kushkiTransactionId: string;
  guestEmail: string | null;
  guestNombre: string | null;
  createdAt: string;
}

interface Bill {
  id: string;
  status: string;
  splitMode: string | null;
  equalSplitPeople: number | null;
  equalSharesPaid: number;
  createdAt: string;
  closedAt: string | null;
  posDocumentId: string | null;
  table: { id: string; name: string };
  items: BillItem[];
  payments: Payment[];
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  UNPAID:         { label: "Sin pagar",        color: "#92400e", bg: "rgba(146,64,14,.1)" },
  PARTIALLY_PAID: { label: "Parcialmente pagado", color: "#1d4ed8", bg: "rgba(29,78,216,.1)" },
  FULLY_PAID:     { label: "Pagado",            color: "#166534", bg: "rgba(22,101,52,.1)" },
  REFUNDED:       { label: "Reembolsado",        color: "#6b7280", bg: "rgba(107,114,128,.1)" },
};

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "Completado", color: "#166534" },
  REFUNDED:  { label: "Reembolsado", color: "#6b7280" },
  FAILED:    { label: "Fallido",     color: "#dc2626" },
};

const SPLIT_LABEL: Record<string, string> = {
  FULL:    "Pago completo",
  EQUAL:   "División igualitaria",
  BY_ITEM: "Por ítem",
};

function fmt(v: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function BillDetailPage() {
  const { billId } = useParams<{ billId: string }>();
  const { toast } = useToast();

  const [bill, setBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [isRefunding, setIsRefunding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/bills/${billId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setBill(json.data);
      } catch {
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [billId]);

  async function processRefund() {
    if (!refundPayment) return;
    if (refundReason.trim().length < 5) {
      toast({ title: "Error", description: "La razón debe tener al menos 5 caracteres", variant: "destructive" });
      return;
    }
    setIsRefunding(true);
    try {
      const res = await fetch(`/api/payments/${refundPayment.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: refundPayment.amount, reason: refundReason }),
      });
      if (res.ok) {
        toast({ title: "Reembolso procesado" });
        setRefundPayment(null);
        setRefundReason("");
        // Reload bill
        const r2 = await fetch(`/api/bills/${billId}`);
        if (r2.ok) setBill((await r2.json()).data);
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: err.error ?? "No se pudo procesar el reembolso", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsRefunding(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-6 w-48 rounded bg-zinc-100 animate-pulse" />
        <div className="h-32 rounded-xl bg-zinc-100 animate-pulse" />
        <div className="h-48 rounded-xl bg-zinc-100 animate-pulse" />
      </div>
    );
  }

  if (isError || !bill) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/owner/reembolsos" className="text-sm text-zinc-500 hover:text-zinc-900">← Reembolsos</Link>
        <p className="text-sm text-red-600">No se pudo cargar el detalle de la cuenta.</p>
      </div>
    );
  }

  const subtotal = bill.items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const iva = subtotal * IVA_RATE;
  const propina = subtotal * PROPINA_RATE;
  const total = subtotal + iva + propina;
  const totalPaid = bill.payments.filter(p => p.status === "COMPLETED").reduce((s, p) => s + Number(p.amount), 0);

  const st = STATUS_LABEL[bill.status] ?? { label: bill.status, color: "#6b7280", bg: "rgba(107,114,128,.1)" };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Back + header */}
      <div>
        <Link
          href="/dashboard/owner/reembolsos"
          className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors mb-3 inline-block"
        >
          ← Reembolsos
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">{bill.table.name}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{fmtDate(bill.createdAt)}</p>
            {bill.posDocumentId && (
              <p className="text-xs text-zinc-400 mt-0.5">Prefactura POS: {bill.posDocumentId}</p>
            )}
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
            style={{ color: st.color, background: st.bg }}
          >
            {st.label}
          </span>
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Ítems</span>
        </div>
        <div className="divide-y divide-zinc-100">
          {bill.items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-zinc-400">Sin ítems.</p>
          ) : (
            bill.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: item.isPaid ? "#2fb37e" : "#d1d5db" }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-900 font-medium truncate">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      {item.quantity} × {fmt(Number(item.price))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {item.isPaid && (
                    <span className="text-xs text-emerald-600 font-medium hidden sm:inline">Pagado</span>
                  )}
                  <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                    {fmt(Number(item.price) * item.quantity)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
        {/* Totals */}
        <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-zinc-500">
            <span>IVA 15%</span>
            <span className="tabular-nums">{fmt(iva)}</span>
          </div>
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Propina 10%</span>
            <span className="tabular-nums">{fmt(propina)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold text-zinc-900 pt-1 border-t border-zinc-200">
            <span>Total</span>
            <span className="tabular-nums">{fmt(total)}</span>
          </div>
          {bill.status === "PARTIALLY_PAID" && (
            <div className="flex justify-between text-sm text-blue-600 font-medium pt-0.5">
              <span>Cobrado</span>
              <span className="tabular-nums">{fmt(totalPaid)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Payments */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Pagos</span>
          {bill.splitMode && (
            <span className="text-xs text-zinc-400">{SPLIT_LABEL[bill.splitMode] ?? bill.splitMode}</span>
          )}
        </div>
        {bill.payments.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-400">Sin pagos registrados.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {bill.payments.map((payment) => {
              const ps = PAYMENT_STATUS[payment.status] ?? { label: payment.status, color: "#6b7280" };
              const canRefund = payment.status === "COMPLETED";
              return (
                <div key={payment.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                        {fmt(Number(payment.amount))}
                      </span>
                      <span className="text-xs font-medium" style={{ color: ps.color }}>{ps.label}</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5">{fmtDate(payment.createdAt)}</p>
                    {payment.guestEmail && (
                      <p className="text-xs text-zinc-400">{payment.guestEmail}</p>
                    )}
                    <p className="text-xs text-zinc-300 font-mono mt-0.5">{payment.kushkiTransactionId}</p>
                  </div>
                  {canRefund && (
                    <Dialog
                      open={refundPayment?.id === payment.id}
                      onOpenChange={(open) => { if (!open) { setRefundPayment(null); setRefundReason(""); } }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex-shrink-0"
                          onClick={() => setRefundPayment(payment)}
                        >
                          Reembolsar
                        </Button>
                      </DialogTrigger>
                      {refundPayment?.id === payment.id && (
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Confirmar reembolso</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
                              <p className="text-sm text-zinc-500">Monto a reembolsar</p>
                              <p className="text-2xl font-semibold text-zinc-900 mt-1">
                                {fmt(Number(refundPayment.amount))}
                              </p>
                              <p className="text-sm text-zinc-500 mt-1">{bill.table.name}</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="reason">Razón del reembolso</Label>
                              <Textarea
                                id="reason"
                                placeholder="Ej. Error en pedido, cliente insatisfecho..."
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                className="min-h-24"
                                disabled={isRefunding}
                              />
                              <p className="text-xs text-zinc-500">Mínimo 5 caracteres</p>
                            </div>
                            <div className="flex gap-3 justify-end">
                              <Button
                                variant="outline"
                                className="h-10"
                                disabled={isRefunding}
                                onClick={() => { setRefundPayment(null); setRefundReason(""); }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                className="h-10 bg-red-600 hover:bg-red-700 text-white"
                                disabled={isRefunding || refundReason.trim().length < 5}
                                onClick={processRefund}
                              >
                                {isRefunding ? "Procesando..." : "Confirmar reembolso"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      )}
                    </Dialog>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Closed at */}
      {bill.closedAt && (
        <p className="text-xs text-zinc-400 text-center">
          Cuenta cerrada el {fmtDate(bill.closedAt)}
        </p>
      )}
    </div>
  );
}
