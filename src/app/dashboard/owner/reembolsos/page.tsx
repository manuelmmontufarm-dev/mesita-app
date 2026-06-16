"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IVA_RATE, PROPINA_RATE } from "@/lib/constants/ecuador-tax";

interface BillItem {
  price: number;
  quantity: number;
}

interface Payment {
  status: string;
  amount: number;
}

interface Bill {
  id: string;
  status: string;
  createdAt: string;
  posDocumentId: string | null;
  table: { name: string };
  items: BillItem[];
  payments: Payment[];
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  UNPAID:         { label: "Sin pagar",         color: "#92400e", bg: "rgba(146,64,14,.1)" },
  PARTIALLY_PAID: { label: "Parcial",            color: "#1d4ed8", bg: "rgba(29,78,216,.1)" },
  FULLY_PAID:     { label: "Pagado",             color: "#166534", bg: "rgba(22,101,52,.1)" },
  REFUNDED:       { label: "Reembolsado",        color: "#6b7280", bg: "rgba(107,114,128,.1)" },
};

const FILTER_OPTIONS = [
  { value: "all",          label: "Todos" },
  { value: "FULLY_PAID",   label: "Pagados" },
  { value: "PARTIALLY_PAID", label: "Parciales" },
  { value: "REFUNDED",     label: "Reembolsados" },
  { value: "UNPAID",       label: "Sin pagar" },
];

function fmt(v: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function billTotal(items: BillItem[]) {
  const subtotal = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  return subtotal * (1 + IVA_RATE + PROPINA_RATE);
}

export default function ReembolsosPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/bills");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setBills(json.data ?? []);
      } catch {
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = filter === "all" ? bills : bills.filter((b) => b.status === filter);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-7 w-36 rounded bg-zinc-100 animate-pulse" />
        <div className="h-10 w-full rounded-lg bg-zinc-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-zinc-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Reembolsos</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Historial de cuentas y pagos</p>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === opt.value
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {isError && (
        <p className="text-sm text-red-600">No se pudo cargar el historial de cuentas.</p>
      )}

      {/* Empty */}
      {!isError && filtered.length === 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl px-4 py-12 text-center">
          <p className="text-sm font-medium text-zinc-700">Sin cuentas</p>
          <p className="text-xs text-zinc-400 mt-1">
            {filter === "all"
              ? "Las cuentas del restaurante aparecerán aquí."
              : "No hay cuentas con este estado."}
          </p>
        </div>
      )}

      {/* List */}
      {!isError && filtered.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Mesa</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 text-right">Total</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 text-right">Cobrado</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Fecha</span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Estado</span>
          </div>

          <div className="divide-y divide-zinc-100">
            {filtered.map((bill) => {
              const total = billTotal(bill.items);
              const paid = bill.payments
                .filter((p) => p.status === "COMPLETED")
                .reduce((s, p) => s + Number(p.amount), 0);
              const st = STATUS_LABEL[bill.status] ?? { label: bill.status, color: "#6b7280", bg: "rgba(107,114,128,.1)" };

              return (
                <Link
                  key={bill.id}
                  href={`/dashboard/owner/reembolsos/${bill.id}`}
                  className="flex sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 items-center px-4 py-3 hover:bg-zinc-50 transition-colors group gap-3"
                >
                  {/* Mesa + date (mobile stacks) */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate group-hover:text-[#E86A33] transition-colors">
                      {bill.table.name}
                    </p>
                    <p className="text-xs text-zinc-400 sm:hidden">{fmtDate(bill.createdAt)}</p>
                    {bill.posDocumentId && (
                      <p className="text-xs text-zinc-300 font-mono hidden sm:block">{bill.posDocumentId}</p>
                    )}
                  </div>

                  {/* Total */}
                  <span className="text-sm font-semibold text-zinc-900 tabular-nums text-right hidden sm:block">
                    {fmt(total)}
                  </span>

                  {/* Cobrado */}
                  <span className="text-sm text-zinc-500 tabular-nums text-right hidden sm:block">
                    {paid > 0 ? fmt(paid) : <span className="text-zinc-300">—</span>}
                  </span>

                  {/* Date */}
                  <span className="text-xs text-zinc-400 hidden sm:block whitespace-nowrap">
                    {fmtDate(bill.createdAt)}
                  </span>

                  {/* Status badge */}
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {!isError && bills.length > 0 && (
        <p className="text-xs text-zinc-400 text-right">
          {filtered.length} cuenta{filtered.length !== 1 ? "s" : ""}
          {filter !== "all" && ` · ${bills.length} en total`}
        </p>
      )}
    </div>
  );
}
