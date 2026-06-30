"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  KeyRound,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";

type RestaurantStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
type UserRole = "OWNER" | "MANAGER" | "SERVER";

interface RestaurantDetail {
  id: string;
  name: string;
  status: RestaurantStatus;
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
  paymentEnvironment: string;
  paymentProvider: string;
  paymentConfigured: boolean;
  staff: Array<{ id: string; name: string; email: string; role: UserRole; createdAt: string }>;
  tables: Array<{
    id: string;
    name: string;
    posExternalId: string | null;
    openBillCount: number;
    payUrl: string;
    qrApiUrl: string;
  }>;
  openBills: Array<{ id: string; status: string; createdAt: string; tableName: string }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    tableName: string;
    providerTransactionId: string;
    posRegisteredAt: string | null;
    posRegistrationNote: string | null;
  }>;
  paymentsThisMonth: { count: number; total: number };
  paymentsAllTime: { count: number; total: number };
  averageTicketThisMonth: number;
  operationalAlerts: { failedPayments: number; pendingPosRegistrations: number; unmappedTables: number };
}

const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: "Propietario",
  MANAGER: "Gerente",
  SERVER: "Mesero",
};

const ROLE_DESCRIPTION: Record<UserRole, string> = {
  OWNER: "Control total, configuración, finanzas y equipo",
  MANAGER: "Operación, menú, mesas y equipo sin configuración sensible",
  SERVER: "Operación diaria y atención de mesas",
};

function money(value: number) {
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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
  const label = { ACTIVE: "Activo", PENDING: "Pendiente", SUSPENDED: "Suspendido" }[status];
  return <span className={`pill ${styles[status]}`}>{label}</span>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-black/[0.06] py-3 last:border-0">
      <span className="text-xs text-[var(--on-light-mut)]">{label}</span>
      <span className="max-w-[65%] break-words text-right text-xs font-medium text-[var(--ink-800)]">{value || "—"}</span>
    </div>
  );
}

function Metric({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Store }) {
  return (
    <div className="rounded-[18px] border border-black/[0.08] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--on-light-mut)]">{label}</p>
        <Icon className="h-4 w-4 text-[var(--on-light-mut)]" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--on-light-mut)]">{helper}</p>
    </div>
  );
}

export default function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const [data, setData] = useState<RestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [qr, setQr] = useState<{ tableName: string; dataUrl: string; payUrl: string; apiUrl: string } | null>(null);
  const [qrLoading, setQrLoading] = useState<string | null>(null);
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error();
      const json = await response.json();
      setData(json.data);
    } catch {
      toast({ title: "No se pudo cargar el restaurante", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(status: "ACTIVE" | "SUSPENDED") {
    setUpdating(true);
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
      toast({ title: status === "ACTIVE" ? "Restaurante activado" : "Restaurante suspendido" });
      setSuspendOpen(false);
      await load();
    } catch {
      toast({ title: "No se pudo actualizar el estado", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  }

  async function openQr(table: RestaurantDetail["tables"][number]) {
    setQrLoading(table.id);
    try {
      const response = await fetch(table.qrApiUrl, { credentials: "include" });
      if (!response.ok) throw new Error();
      const json = await response.json();
      setQr({ tableName: table.name, dataUrl: json.data.dataUrl, payUrl: json.data.payUrl, apiUrl: table.qrApiUrl });
    } catch {
      toast({ title: "No se pudo generar el QR", variant: "destructive" });
    } finally {
      setQrLoading(null);
    }
  }

  async function updateRole(userId: string, role: UserRole) {
    setRoleUpdating(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "No se pudo cambiar el rol");
      toast({ title: "Permisos actualizados", description: `Nuevo rol: ${ROLE_LABEL[role]}` });
      await load();
    } catch (error) {
      toast({ title: "No se pudo cambiar el rol", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setRoleUpdating(null);
    }
  }

  if (loading) {
    return <div className="h-96 animate-pulse rounded-[18px] bg-black/[0.06]" />;
  }

  if (!data) {
    return (
      <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
        <CardContent className="py-14 text-center">
          <Store className="mx-auto h-8 w-8 text-black/25" />
          <p className="mt-3 font-medium">Restaurante no encontrado</p>
          <Button asChild variant="outline" className="mt-5"><Link href="/admin">Volver al admin</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const alertTotal = Object.values(data.operationalAlerts).reduce((sum, value) => sum + value, 0);

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={`¿Suspender ${data.name}?`}
        description="El equipo perderá acceso y sus QR dejarán de aceptar pagos hasta que vuelvas a activarlo."
        confirmLabel="Suspender restaurante"
        variant="destructive"
        onConfirm={() => updateStatus("SUSPENDED")}
      />

      <Dialog open={!!qr} onOpenChange={(open) => { if (!open) setQr(null); }}>
        <DialogContent className="max-w-sm border-black/[0.08] bg-[var(--surface)]">
          <DialogHeader><DialogTitle>QR · {qr?.tableName}</DialogTitle></DialogHeader>
          {qr && (
            <div className="space-y-4">
              <div className="rounded-[18px] border border-black/[0.08] bg-white p-5">
                <img src={qr.dataUrl} alt={`QR de ${qr.tableName}`} className="mx-auto aspect-square w-full max-w-[260px]" />
              </div>
              <p className="break-all rounded-xl bg-[var(--paper-2)] px-3 py-2 text-xs text-[var(--on-light-mut)]">{qr.payUrl}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-2" onClick={() => { navigator.clipboard.writeText(qr.payUrl); toast({ title: "Enlace copiado" }); }}>
                  <Copy className="h-4 w-4" /> Copiar
                </Button>
                <Button asChild className="gap-2">
                  <a href={`${qr.apiUrl}?format=pdf`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> PDF</a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <header>
        <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--on-light-mut)] hover:text-[var(--ink-800)]">
          <ArrowLeft className="h-3.5 w-3.5" /> Control de plataforma
        </Link>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-[var(--ink-800)]">{data.name}</h1>
              <StatusBadge status={data.status} />
            </div>
            <p className="mt-1.5 text-sm text-[var(--on-light-mut)]">
              {data.ownerName || "Sin nombre de propietario"} · {data.ownerEmail || "sin email"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2 bg-[var(--surface)]"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</Button>
            {data.status === "ACTIVE" ? (
              <Button variant="destructive" size="sm" onClick={() => setSuspendOpen(true)} disabled={updating}>Suspender</Button>
            ) : (
              <Button size="sm" onClick={() => updateStatus("ACTIVE")} disabled={updating}>Activar restaurante</Button>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Volumen este mes" value={money(data.paymentsThisMonth.total)} helper={`${data.paymentsThisMonth.count} transacciones`} icon={WalletCards} />
        <Metric label="Ticket promedio" value={money(data.averageTicketThisMonth)} helper={`${money(data.paymentsAllTime.total)} históricos`} icon={CreditCard} />
        <Metric label="Mesas" value={String(data.tables.length)} helper={`${data.openBills.length} cuentas abiertas`} icon={Store} />
        <Metric label="Alertas" value={String(alertTotal)} helper={alertTotal === 0 ? "Operación al día" : "Requieren revisión"} icon={AlertTriangle} />
      </section>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-[var(--paper-2)] p-1 sm:w-auto">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="tables">Mesas y QR</TabsTrigger>
          <TabsTrigger value="integrations">Integraciones</TabsTrigger>
          <TabsTrigger value="access">Accesos</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base">Información del restaurante</CardTitle></CardHeader>
              <CardContent>
                <InfoRow label="Propietario" value={data.ownerName ? `${data.ownerName} · ${data.ownerEmail}` : data.ownerEmail} />
                <InfoRow label="RUC" value={data.ruc} />
                <InfoRow label="Email de contacto" value={data.contactEmail} />
                <InfoRow label="Teléfono" value={data.phone} />
                <InfoRow label="Dirección" value={data.address} />
                <InfoRow label="Plan" value={data.plan ?? "Sin plan"} />
                <InfoRow label="Registro" value={dateTime(data.createdAt)} />
              </CardContent>
            </Card>

            <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
              <CardHeader className="pb-2"><CardTitle className="text-base">Atención operativa</CardTitle></CardHeader>
              <CardContent>
                {[
                  ["Cobros pendientes en POS", data.operationalAlerts.pendingPosRegistrations],
                  ["Mesas sin ID externo", data.operationalAlerts.unmappedTables],
                  ["Pagos fallidos", data.operationalAlerts.failedPayments],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center gap-3 border-b border-black/[0.06] py-3 last:border-0">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${Number(value) > 0 ? "bg-amber-500/10 text-amber-700" : "bg-emerald-500/10 text-emerald-700"}`}>
                      {Number(value) > 0 ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </span>
                    <span className="flex-1 text-sm">{label}</span>
                    <strong className="text-sm tabular-nums">{value}</strong>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base">Últimas transacciones</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {data.recentPayments.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-[var(--on-light-mut)]">Sin pagos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow className="border-black/[0.06]"><TableHead className="pl-6 text-xs">Mesa</TableHead><TableHead className="text-xs">Monto</TableHead><TableHead className="text-xs">Proveedor</TableHead><TableHead className="text-xs">POS</TableHead><TableHead className="pr-6 text-right text-xs">Fecha</TableHead></TableRow></TableHeader>
                    <TableBody>{data.recentPayments.map((payment) => (
                      <TableRow key={payment.id} className="border-black/[0.06]">
                        <TableCell className="pl-6 font-medium">{payment.tableName}</TableCell>
                        <TableCell className="font-semibold tabular-nums">{money(payment.amount)}</TableCell>
                        <TableCell className="font-mono text-xs text-[var(--on-light-mut)]">{payment.providerTransactionId || "—"}</TableCell>
                        <TableCell>{data.invoiceMode !== "POS" ? <span className="pill pill-muted">No aplica</span> : payment.posRegisteredAt ? <span className="pill pill-success">Conciliado</span> : <span className="pill bg-amber-500/10 text-amber-700">Pendiente</span>}</TableCell>
                        <TableCell className="pr-6 text-right text-xs text-[var(--on-light-mut)]">{dateTime(payment.createdAt)}</TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tables">
          <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Mesas y accesos QR</CardTitle>
              <p className="text-xs text-[var(--on-light-mut)]">Cada QR abre la misma cuenta que alimentan el POS y el dashboard owner.</p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {data.tables.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-[var(--on-light-mut)]">No hay mesas configuradas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow className="border-black/[0.06]"><TableHead className="pl-6 text-xs">Mesa</TableHead><TableHead className="text-xs">ID en POS</TableHead><TableHead className="text-xs">Cuenta</TableHead><TableHead className="pr-6 text-right text-xs">QR</TableHead></TableRow></TableHeader>
                    <TableBody>{data.tables.map((table) => (
                      <TableRow key={table.id} className="border-black/[0.06]">
                        <TableCell className="pl-6 font-semibold">{table.name}</TableCell>
                        <TableCell>{table.posExternalId ? <code className="rounded bg-[var(--paper-2)] px-2 py-1 text-xs">{table.posExternalId}</code> : <span className="pill bg-amber-500/10 text-amber-700">Sin mapear</span>}</TableCell>
                        <TableCell>{table.openBillCount > 0 ? <span className="text-sm font-medium text-amber-700">{table.openBillCount} abierta{table.openBillCount > 1 ? "s" : ""}</span> : <span className="text-sm text-[var(--on-light-mut)]">Sin cuenta</span>}</TableCell>
                        <TableCell className="pr-6">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openQr(table)} disabled={qrLoading === table.id}><QrCode className="h-3.5 w-3.5" /> Ver QR</Button>
                            <Button asChild variant="ghost" size="sm"><a href={table.payUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}</TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div><CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> POS</CardTitle><p className="mt-1 text-xs text-[var(--on-light-mut)]">Origen de cuentas y destino de cobros.</p></div>
                <span className={`pill ${data.posConfigured && data.invoiceMode === "POS" ? "pill-success" : "bg-amber-500/10 text-amber-700"}`}>{data.posConfigured && data.invoiceMode === "POS" ? "Conectado" : "Revisar"}</span>
              </CardHeader>
              <CardContent>
                <InfoRow label="Proveedor" value={data.posProvider ?? "Sin POS"} />
                <InfoRow label="Entorno" value={data.posEnvironment} />
                <InfoRow label="API key" value={data.posConfigured ? "Configurada" : "No configurada"} />
                <InfoRow label="Campo de mesa" value={data.posTableField} />
                <InfoRow label="Método de cobro" value={data.posPaymentMethod} />
                <InfoRow label="Modo factura" value={data.invoiceMode} />
              </CardContent>
            </Card>
            <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Pagos</CardTitle><p className="mt-1 text-xs text-[var(--on-light-mut)]">Proveedor que autoriza la transacción.</p></div>
                <span className={`pill ${data.paymentsEnabled ? "pill-success" : "pill-muted"}`}>{data.paymentsEnabled ? "Habilitado" : "Deshabilitado"}</span>
              </CardHeader>
              <CardContent>
                <InfoRow label="Proveedor" value={data.paymentProvider || "STUB"} />
                <InfoRow label="Entorno" value={data.paymentEnvironment} />
                <InfoRow label="Credenciales" value={data.paymentProvider === "STUB" ? "No requeridas" : data.paymentConfigured ? "Configuradas" : "No configuradas"} />
                <InfoRow label="Transacciones históricas" value={data.paymentsAllTime.count.toString()} />
                <InfoRow label="Volumen histórico" value={money(data.paymentsAllTime.total)} />
              </CardContent>
            </Card>
            <div className="xl:col-span-2 rounded-[18px] border border-black/[0.08] bg-[var(--paper-2)] px-5 py-4 text-sm text-[var(--on-light-mut)]">
              <strong className="text-[var(--ink-800)]">Fuente única:</strong> este panel solo observa y administra la plataforma. La configuración sensible sigue perteneciendo al restaurante y se guarda cifrada; nunca se muestra la clave aquí.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <Card className="border-black/[0.08] bg-[var(--surface)] shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Usuarios y permisos</CardTitle>
              <p className="text-xs text-[var(--on-light-mut)]">Asigna el rol mínimo necesario. Siempre debe quedar al menos un propietario.</p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow className="border-black/[0.06]"><TableHead className="pl-6 text-xs">Usuario</TableHead><TableHead className="text-xs">Rol</TableHead><TableHead className="text-xs">Acceso</TableHead><TableHead className="pr-6 text-right text-xs">Alta</TableHead></TableRow></TableHeader>
                  <TableBody>{data.staff.map((member) => (
                    <TableRow key={member.id} className="border-black/[0.06]">
                      <TableCell className="pl-6"><p className="font-medium">{member.name}</p><p className="text-xs text-[var(--on-light-mut)]">{member.email}</p></TableCell>
                      <TableCell>
                        <select value={member.role} onChange={(event) => updateRole(member.id, event.target.value as UserRole)} disabled={roleUpdating === member.id} className="h-9 rounded-md border border-input bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="OWNER">Propietario</option><option value="MANAGER">Gerente</option><option value="SERVER">Mesero</option>
                        </select>
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-[var(--on-light-mut)]">{ROLE_DESCRIPTION[member.role]}</TableCell>
                      <TableCell className="pr-6 text-right text-xs text-[var(--on-light-mut)]">{dateTime(member.createdAt)}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
            {(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => (
              <div key={role} className="rounded-[18px] border border-black/[0.08] bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700">{role === "OWNER" ? <KeyRound className="h-4 w-4" /> : role === "MANAGER" ? <ShieldCheck className="h-4 w-4" /> : <Users className="h-4 w-4" />}</span><strong className="text-sm">{ROLE_LABEL[role]}</strong></div>
                <p className="mt-3 text-xs leading-5 text-[var(--on-light-mut)]">{ROLE_DESCRIPTION[role]}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
