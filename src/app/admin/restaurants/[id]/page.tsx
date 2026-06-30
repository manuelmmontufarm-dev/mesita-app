"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

interface RestaurantDetail {
  id: string;
  name: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  plan: string | null;
  ruc: string | null;
  contactEmail: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  posProvider: string | null;
  posEnvironment: string;
  posConfigured: boolean;
  posTableField: string | null;
  posPaymentMethod: string | null;
  paymentsEnabled: boolean;
  invoiceMode: string;
  kushkiEnvironment: string;
  kushkiConfigured: boolean;
  tables: { id: string; name: string; posExternalId: string | null; openBillCount: number }[];
  openBills: { id: string; status: string; createdAt: string; tableName: string }[];
  recentPayments: { id: string; amount: number; status: string; createdAt: string; tableName: string }[];
  paymentsThisMonth: { count: number; total: number };
  paymentsAllTime: { count: number; total: number };
}

const STATUS_CYCLE: Record<string, "ACTIVE" | "SUSPENDED"> = {
  PENDING: "ACTIVE",
  ACTIVE: "SUSPENDED",
  SUSPENDED: "ACTIVE",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
};

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800",
    ACTIVE: "bg-green-100 text-green-800",
    SUSPENDED: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-zinc-100 text-zinc-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: "bg-green-100 text-green-800",
    FAILED: "bg-red-100 text-red-800",
    REFUNDED: "bg-zinc-100 text-zinc-600",
  };
  const labels: Record<string, string> = {
    COMPLETED: "Completado",
    FAILED: "Fallido",
    REFUNDED: "Reembolsado",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-zinc-100 text-zinc-700"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2.5 border-b border-zinc-100 last:border-0">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-medium text-zinc-900 text-right max-w-[60%] truncate">{value ?? "—"}</span>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(s: string) {
  return new Date(s).toLocaleString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [data, setData] = useState<RestaurantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/restaurants/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch {
      toast({ title: "Error", description: "No se pudo cargar el restaurante", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function updateStatus(newStatus: "ACTIVE" | "SUSPENDED") {
    if (!data) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast({ title: newStatus === "ACTIVE" ? "Restaurante activado" : "Restaurante suspendido" });
      load();
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar el estado", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-900 font-medium">Restaurante no encontrado</p>
          <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-700 mt-2 inline-block">← Volver al panel</Link>
        </div>
      </div>
    );
  }

  const nextStatus = STATUS_CYCLE[data.status];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-6xl mx-auto px-8 py-8 space-y-6">

        {/* Back + header */}
        <div>
          <Link href="/admin" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            ← Admin
          </Link>
          <div className="flex items-start justify-between mt-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-zinc-900">{data.name}</h1>
              <StatusBadge status={data.status} />
            </div>
            <Button
              size="sm"
              variant={nextStatus === "SUSPENDED" ? "destructive" : "outline"}
              onClick={() => updateStatus(nextStatus)}
              disabled={isUpdating}
              className="h-8 text-xs"
            >
              {isUpdating ? "..." : nextStatus === "SUSPENDED" ? "Suspender" : "Activar"}
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Mesas", value: data.tables.length.toString() },
            { label: "Cuentas abiertas", value: data.openBills.length.toString() },
            { label: "Pagos este mes", value: `${data.paymentsThisMonth.count} · ${formatCurrency(data.paymentsThisMonth.total)}` },
            { label: "Pagos totales", value: `${data.paymentsAllTime.count} · ${formatCurrency(data.paymentsAllTime.total)}` },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-zinc-200 px-4 py-3">
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className="text-sm font-semibold text-zinc-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Restaurant info */}
          <Card className="shadow-none border-zinc-200">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-zinc-900">Información</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <InfoRow label="Propietario" value={data.ownerName ? `${data.ownerName} · ${data.ownerEmail}` : data.ownerEmail} />
              <InfoRow label="RUC" value={data.ruc} />
              <InfoRow label="Email contacto" value={data.contactEmail} />
              <InfoRow label="Teléfono" value={data.phone} />
              <InfoRow label="Dirección" value={data.address} />
              <InfoRow label="Registro" value={formatDate(data.createdAt)} />
              <InfoRow label="Plan" value={data.plan ?? "Sin plan"} />
            </CardContent>
          </Card>

          {/* Integrations */}
          <Card className="shadow-none border-zinc-200">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-zinc-900">Integraciones</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <InfoRow label="POS" value={data.posProvider ?? "Sin POS"} />
              <InfoRow label="POS entorno" value={data.posEnvironment} />
              <InfoRow label="POS API key" value={data.posConfigured ? "Configurada" : "No configurada"} />
              <InfoRow label="Campo de mesa POS" value={data.posTableField} />
              <InfoRow label="Método pago POS" value={data.posPaymentMethod} />
              <InfoRow label="Pagos Kushki" value={data.paymentsEnabled ? "Habilitados" : "Deshabilitados"} />
              <InfoRow label="Kushki entorno" value={data.kushkiEnvironment} />
              <InfoRow label="Kushki API key" value={data.kushkiConfigured ? "Configurada" : "No configurada"} />
              <InfoRow label="Modo factura" value={data.invoiceMode} />
            </CardContent>
          </Card>
        </div>

        {/* Tables */}
        <Card className="shadow-none border-zinc-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-zinc-900">
              Mesas <span className="text-zinc-400 font-normal">({data.tables.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.tables.length === 0 ? (
              <p className="text-sm text-zinc-400 px-5 pb-4">Sin mesas configuradas</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-100">
                    <TableHead className="px-5 text-xs">Mesa</TableHead>
                    <TableHead className="text-xs">ID en POS</TableHead>
                    <TableHead className="text-xs">Cuentas abiertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tables.map((t) => (
                    <TableRow key={t.id} className="border-zinc-100">
                      <TableCell className="px-5 h-10 text-sm font-medium text-zinc-900">{t.name}</TableCell>
                      <TableCell className="h-10 text-sm">
                        {t.posExternalId ? (
                          <span className="font-mono text-xs text-zinc-700">{t.posExternalId}</span>
                        ) : (
                          <span className="text-xs text-zinc-400">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell className="h-10 text-sm">
                        {t.openBillCount > 0 ? (
                          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{t.openBillCount} abierta{t.openBillCount !== 1 ? "s" : ""}</span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Open bills */}
        {data.openBills.length > 0 && (
          <Card className="shadow-none border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold text-amber-900">
                Cuentas abiertas <span className="font-normal">({data.openBills.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-amber-100">
                    <TableHead className="px-5 text-xs">Mesa</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Abierta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.openBills.map((b) => (
                    <TableRow key={b.id} className="border-amber-100">
                      <TableCell className="px-5 h-10 text-sm font-medium text-zinc-900">{b.tableName}</TableCell>
                      <TableCell className="h-10 text-sm">
                        <span className="text-xs">{b.status === "PARTIALLY_PAID" ? "Pago parcial" : "Sin pagar"}</span>
                      </TableCell>
                      <TableCell className="h-10 text-xs text-zinc-500">{formatDateTime(b.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent payments */}
        <Card className="shadow-none border-zinc-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-zinc-900">Últimos pagos</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {data.recentPayments.length === 0 ? (
              <p className="text-sm text-zinc-400 px-5 pb-4">Sin pagos registrados</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-100">
                    <TableHead className="px-5 text-xs">Mesa</TableHead>
                    <TableHead className="text-xs">Monto</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentPayments.map((p) => (
                    <TableRow key={p.id} className="border-zinc-100">
                      <TableCell className="px-5 h-10 text-sm text-zinc-900">{p.tableName}</TableCell>
                      <TableCell className="h-10 text-sm font-semibold text-zinc-900">{formatCurrency(p.amount)}</TableCell>
                      <TableCell className="h-10"><PaymentStatusBadge status={p.status} /></TableCell>
                      <TableCell className="h-10 text-xs text-zinc-500">{formatDateTime(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
