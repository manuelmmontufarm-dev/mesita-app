"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FiscalData {
  ruc: string; razonSocial: string; nombreComercial: string; direccionMatriz: string;
  establecimientoCodigo: string; puntoEmisionCodigo: string; regimen: string;
  obligadoContabilidad: boolean; contribuyenteEspecial: string; contactEmail: string; phone: string;
}
interface KushkiStatus { privateKeyConfigured: boolean; publicKey: string | null; environment: string; enabled: boolean; }
interface PosStatus { enabled: boolean; provider: string | null; apiKeyConfigured: boolean; environment: string; tableField: string | null; paymentMethod: string; }

const EMPTY_FISCAL: FiscalData = {
  ruc: "", razonSocial: "", nombreComercial: "", direccionMatriz: "",
  establecimientoCodigo: "001", puntoEmisionCodigo: "001", regimen: "",
  obligadoContabilidad: false, contribuyenteEspecial: "", contactEmail: "", phone: "",
};

function StatusBadge({ configured, enabled }: { configured: boolean; enabled?: boolean }) {
  if (enabled) return <Badge className="bg-green-100 text-green-800 border-green-200">Activo</Badge>;
  if (configured) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Configurado</Badge>;
  return <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200">Sin configurar</Badge>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { toast } = useToast();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoConfig, setDemoConfig] = useState<Record<string, unknown> | null>(null);
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [savingKushki, setSavingKushki] = useState(false);
  const [savingPos, setSavingPos] = useState(false);

  const [fiscal, setFiscal] = useState<FiscalData>(EMPTY_FISCAL);
  const [kushkiForm, setKushkiForm] = useState({ privateKey: "", publicKey: "", environment: "SANDBOX" });
  const [kushkiStatus, setKushkiStatus] = useState<KushkiStatus | null>(null);
  const [posForm, setPosForm] = useState({ apiKey: "", environment: "SANDBOX", tableField: "", paymentMethod: "EF" });
  const [posStatus, setPosStatus] = useState<PosStatus | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadData = useCallback(async (rid: string) => {
    try {
      const [fiscalRes, intRes] = await Promise.all([
        fetch(`/api/restaurant/${rid}/fiscal`),
        fetch(`/api/restaurant/${rid}/integrations`),
      ]);
      const fData = await fiscalRes.json();
      const iData = await intRes.json();

      if (fData?.data) {
        const f = fData.data;
        setFiscal({
          ruc: f.ruc ?? "", razonSocial: f.razonSocial ?? "", nombreComercial: f.nombreComercial ?? "",
          direccionMatriz: f.direccionMatriz ?? "", establecimientoCodigo: f.establecimientoCodigo ?? "001",
          puntoEmisionCodigo: f.puntoEmisionCodigo ?? "001", regimen: f.regimen ?? "",
          obligadoContabilidad: f.obligadoContabilidad ?? false, contribuyenteEspecial: f.contribuyenteEspecial ?? "",
          contactEmail: f.contactEmail ?? "", phone: f.phone ?? "",
        });
      }
      if (iData?.data) {
        const d = iData.data;
        setKushkiStatus(d.kushki ?? null);
        if (d.kushki?.publicKey)   setKushkiForm(p => ({ ...p, publicKey: d.kushki.publicKey ?? "" }));
        if (d.kushki?.environment) setKushkiForm(p => ({ ...p, environment: d.kushki.environment }));
        if (d.pos) {
          setPosStatus(d.pos);
          setPosForm(p => ({
            ...p,
            environment:   d.pos.environment  ?? "SANDBOX",
            tableField:    d.pos.tableField    ?? "",
            paymentMethod: d.pos.paymentMethod ?? "EF",
          }));
        }
      }
    } catch { toast({ title: "Error", description: "Error al cargar configuración", variant: "destructive" }); }
  }, [toast]);

  useEffect(() => {
    async function init() {
      const [sessionRes, demoRes] = await Promise.all([
        fetch("/api/auth/session"),
        fetch("/api/demo-pos?view=config"),
      ]);
      const s = await sessionRes.json();
      const rid = s?.user?.restaurantId as string | undefined;
      if (demoRes.ok) {
        const d = await demoRes.json();
        setDemoConfig(d.data ?? null);
        if (!rid) setIsDemoMode(true);
      }
      if (rid) {
        setRestaurantId(rid);
        loadData(rid);
      }
    }
    init();
  }, [loadData]);

  // ── Fiscal save ────────────────────────────────────────────────────────────

  async function saveFiscal(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return;
    if (fiscal.ruc && !/^\d{13}$/.test(fiscal.ruc)) {
      toast({ title: "RUC inválido", description: "El RUC debe tener 13 dígitos", variant: "destructive" });
      return;
    }
    setSavingFiscal(true);
    try {
      const res = await fetch(`/api/restaurant/${restaurantId}/fiscal`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fiscal, ruc: fiscal.ruc || undefined, contribuyenteEspecial: fiscal.contribuyenteEspecial || null }),
      });
      if (res.ok) toast({ title: "Datos fiscales guardados" });
      else { const e = await res.json(); toast({ title: "Error", description: e?.error, variant: "destructive" }); }
    } finally { setSavingFiscal(false); }
  }

  // ── Kushki save ────────────────────────────────────────────────────────────

  async function saveKushki(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return;
    setSavingKushki(true);
    try {
      const payload: Record<string, unknown> = { environment: kushkiForm.environment };
      if (kushkiForm.privateKey) payload.privateKey = kushkiForm.privateKey;
      if (kushkiForm.publicKey)  payload.publicKey  = kushkiForm.publicKey;
      const res = await fetch(`/api/restaurant/${restaurantId}/integrations`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kushki: payload }),
      });
      if (res.ok) {
        const d = await res.json();
        setKushkiStatus(d.data?.kushki ?? null);
        setKushkiForm(p => ({ ...p, privateKey: "" }));
        toast({ title: "Kushki configurado", description: "Credenciales guardadas de forma segura" });
      } else { const e = await res.json(); toast({ title: "Error", description: e?.error, variant: "destructive" }); }
    } finally { setSavingKushki(false); }
  }

  async function toggleKushki(enabled: boolean) {
    if (!restaurantId) return;
    if (enabled && !kushkiStatus?.privateKeyConfigured) {
      toast({ title: "Configura la Private Key de Kushki primero", variant: "destructive" }); return;
    }
    const res = await fetch(`/api/restaurant/${restaurantId}/integrations`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kushki: { enabled } }),
    });
    if (res.ok) {
      setKushkiStatus(p => p ? { ...p, enabled } : null);
      toast({ title: enabled ? "Pagos activados" : "Pagos desactivados" });
    }
  }

  // ── Contífico / POS save ───────────────────────────────────────────────────

  async function savePos(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return;
    setSavingPos(true);
    try {
      const payload: Record<string, unknown> = {
        environment:   posForm.environment,
        tableField:    posForm.tableField || null,
        paymentMethod: posForm.paymentMethod,
      };
      if (posForm.apiKey) payload.apiKey = posForm.apiKey;
      const res = await fetch(`/api/restaurant/${restaurantId}/integrations`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pos: payload }),
      });
      if (res.ok) {
        const d = await res.json();
        setPosStatus(d.data?.pos ?? null);
        setPosForm(p => ({ ...p, apiKey: "" }));
        toast({ title: "Contífico configurado", description: "API key guardada de forma segura" });
      } else { const e = await res.json(); toast({ title: "Error", description: e?.error, variant: "destructive" }); }
    } finally { setSavingPos(false); }
  }

  async function togglePos(enabled: boolean) {
    if (!restaurantId) return;
    if (enabled && !posStatus?.apiKeyConfigured) {
      toast({ title: "Configura el API key de Contífico primero", variant: "destructive" }); return;
    }
    const res = await fetch(`/api/restaurant/${restaurantId}/integrations`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pos: { enabled } }),
    });
    if (res.ok) {
      setPosStatus(p => p ? { ...p, enabled } : null);
      toast({ title: enabled ? "Contífico activado" : "Contífico desactivado" });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (isDemoMode && demoConfig) {
    const cfg = demoConfig as {
      name: string;
      enabled: boolean;
      environment: string;
      baseUrl: string;
      endpoints: Record<string, string>;
      sync: Record<string, string>;
      lastSyncAt: string;
      restaurant: { name: string; city: string; ruc: string };
    };

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--ink-900)" }}>Configuración</h1>
          <p className="text-sm mt-1" style={{ color: "var(--on-light-mut)" }}>
            Integraciones del restaurante · modo demo
          </p>
        </div>

        <Card style={{ borderColor: "rgba(47,179,126,.25)" }}>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>{cfg.name}</CardTitle>
                <CardDescription className="mt-1">
                  Conectado vía API al POS demo de Mesita — menú, mesas y facturación sincronizados
                </CardDescription>
              </div>
              <Badge className="bg-green-100 text-green-800 border-green-200">Activo</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg" style={{ background: "rgba(27,25,22,.03)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Restaurante</p>
                <p className="font-medium text-zinc-900">{cfg.restaurant.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{cfg.restaurant.city} · RUC {cfg.restaurant.ruc}</p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "rgba(27,25,22,.03)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">Ambiente</p>
                <p className="font-medium text-zinc-900">{cfg.environment}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Última sync: {new Date(cfg.lastSyncAt).toLocaleTimeString("es-EC")}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">API base</p>
              <code className="text-xs block p-3 rounded-lg bg-zinc-900 text-green-300 font-mono break-all">
                {cfg.baseUrl}
              </code>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Endpoints</p>
              <div className="space-y-1.5">
                {Object.entries(cfg.endpoints).map(([key, val]) => (
                  <div key={key} className="flex gap-3 text-xs font-mono p-2 rounded" style={{ background: "rgba(27,25,22,.03)" }}>
                    <span className="text-zinc-400 w-16 shrink-0">{key}</span>
                    <span className="text-zinc-700">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Sincronización</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(cfg.sync).map(([key, val]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {val}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Kushki Pagos</p>
                  <p className="text-xs text-zinc-500">Sandbox demo · pagos del app registrados en POS</p>
                </div>
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Sandbox</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Facturación SRI</p>
                  <p className="text-xs text-zinc-500">Datos demo de La Doña Pepa</p>
                </div>
                <Badge className="bg-zinc-100 text-zinc-600 border-zinc-200">Demo</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-zinc-900">Configuración</h1>
        <p className="text-zinc-600 mt-2">Integra tu restaurante con el POS, el proveedor de pago y datos fiscales</p>
      </div>

      <Tabs defaultValue="pos">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pos">Contífico</TabsTrigger>
          <TabsTrigger value="kushki">Kushki</TabsTrigger>
          <TabsTrigger value="fiscal">Datos SRI</TabsTrigger>
        </TabsList>

        {/* ── Contífico POS ─────────────────────────────────────────────────── */}
        <TabsContent value="pos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contífico POS</CardTitle>
                  <CardDescription className="mt-1">
                    Conecta tu cuenta de <span className="font-medium text-zinc-700">contifico.com</span> para importar
                    prefacturas y registrar cobros automáticamente
                  </CardDescription>
                </div>
                {posStatus && <StatusBadge configured={posStatus.apiKeyConfigured} enabled={posStatus.enabled} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={savePos} className="space-y-4">
                <div>
                  <Label>Ambiente</Label>
                  <Select value={posForm.environment} onValueChange={v => setPosForm({ ...posForm, environment: v })}>
                    <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SANDBOX">Sandbox (pruebas)</SelectItem>
                      <SelectItem value="PRODUCTION">Producción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="posApiKey">
                    API Key{posStatus?.apiKeyConfigured && <span className="ml-2 text-xs text-green-600 font-normal">✓ configurada</span>}
                  </Label>
                  <Input id="posApiKey" type="password" value={posForm.apiKey}
                    onChange={e => setPosForm({ ...posForm, apiKey: e.target.value })}
                    placeholder={posStatus?.apiKeyConfigured ? "Deja vacío para no cambiar" : "Tu API key de Contífico"}
                    className="mt-1 h-11" />
                  <p className="text-xs text-zinc-500 mt-1">
                    Obtén tu API key en <span className="font-medium">Configuración → API</span> dentro de Contífico. Se cifra con AES-256-GCM.
                  </p>
                </div>
                <div>
                  <Label htmlFor="posTableField">Campo de mesa (opcional)</Label>
                  <Input id="posTableField" value={posForm.tableField}
                    onChange={e => setPosForm({ ...posForm, tableField: e.target.value })}
                    placeholder="p.ej. mesa, table, num_mesa"
                    className="mt-1 h-11" />
                  <p className="text-xs text-zinc-500 mt-1">
                    Campo en el documento Contífico que identifica la mesa. Deja vacío para usar el comportamiento predeterminado.
                  </p>
                </div>
                <div>
                  <Label>Método de pago en POS</Label>
                  <Select value={posForm.paymentMethod} onValueChange={v => setPosForm({ ...posForm, paymentMethod: v })}>
                    <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EF">EF - Efectivo</SelectItem>
                      <SelectItem value="TC">TC - Tarjeta</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-zinc-500 mt-1">
                    Código de forma de cobro que Contífico espera al confirmar un pago.
                  </p>
                </div>
                <Button type="submit" disabled={savingPos || !restaurantId}
                  className="w-full h-11 bg-zinc-900 hover:bg-zinc-700 text-white">
                  {savingPos ? "Guardando..." : "Guardar configuración Contífico"}
                </Button>
              </form>
              {posStatus && (
                <div className="border-t pt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Activar integración Contífico</p>
                    <p className="text-xs text-zinc-500">Las prefacturas se importarán automáticamente desde el POS</p>
                  </div>
                  <Switch checked={posStatus.enabled} onCheckedChange={togglePos}
                    disabled={!posStatus.apiKeyConfigured} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Kushki ────────────────────────────────────────────────────────── */}
        <TabsContent value="kushki">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Kushki Pagos</CardTitle>
                  <CardDescription className="mt-1">
                    Obtén tus claves desde el portal de <span className="font-medium text-zinc-700">kushkipagos.com</span>
                  </CardDescription>
                </div>
                {kushkiStatus && <StatusBadge configured={kushkiStatus.privateKeyConfigured} enabled={kushkiStatus.enabled} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={saveKushki} className="space-y-4">
                <div>
                  <Label>Ambiente</Label>
                  <Select value={kushkiForm.environment} onValueChange={v => setKushkiForm({ ...kushkiForm, environment: v })}>
                    <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SANDBOX">Sandbox (pruebas)</SelectItem>
                      <SelectItem value="PRODUCTION">Producción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="kushkiPublicKey">Public Key (Merchant ID)</Label>
                  <Input id="kushkiPublicKey" value={kushkiForm.publicKey}
                    onChange={e => setKushkiForm({ ...kushkiForm, publicKey: e.target.value })}
                    placeholder="Tu Public Key de Kushki" className="mt-1 h-11" />
                  <p className="text-xs text-zinc-500 mt-1">Se usa en el frontend para tokenizar la tarjeta. No es sensible.</p>
                </div>
                <div>
                  <Label htmlFor="kushkiPrivateKey">
                    Private Key{kushkiStatus?.privateKeyConfigured && <span className="ml-2 text-xs text-green-600 font-normal">✓ configurada</span>}
                  </Label>
                  <Input id="kushkiPrivateKey" type="password" value={kushkiForm.privateKey}
                    onChange={e => setKushkiForm({ ...kushkiForm, privateKey: e.target.value })}
                    placeholder={kushkiStatus?.privateKeyConfigured ? "Deja vacío para no cambiar" : "Tu Private Key de Kushki"}
                    className="mt-1 h-11" />
                  <p className="text-xs text-zinc-500 mt-1">Se cifra con AES-256-GCM. Nunca se expone en texto plano.</p>
                </div>
                <Button type="submit" disabled={savingKushki || !restaurantId}
                  className="w-full h-11 bg-zinc-900 hover:bg-zinc-700 text-white">
                  {savingKushki ? "Guardando..." : "Guardar credenciales Kushki"}
                </Button>
              </form>
              {kushkiStatus && (
                <div className="border-t pt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Activar pagos en vivo</p>
                    <p className="text-xs text-zinc-500">Solo activa en producción tras probar en sandbox</p>
                  </div>
                  <Switch checked={kushkiStatus.enabled} onCheckedChange={toggleKushki}
                    disabled={!kushkiStatus.privateKeyConfigured} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Datos SRI ─────────────────────────────────────────────────────── */}
        <TabsContent value="fiscal">
          <Card>
            <CardHeader>
              <CardTitle>Datos Fiscales SRI</CardTitle>
              <CardDescription>Requeridos para emitir facturas electrónicas. La factura siempre se emite con el RUC del restaurante.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveFiscal} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ruc">RUC (13 dígitos)</Label>
                    <Input id="ruc" value={fiscal.ruc} maxLength={13}
                      onChange={e => setFiscal({ ...fiscal, ruc: e.target.value.replace(/\D/g, "") })}
                      placeholder="1790012345001" className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="razonSocial">Razón Social</Label>
                    <Input id="razonSocial" value={fiscal.razonSocial}
                      onChange={e => setFiscal({ ...fiscal, razonSocial: e.target.value })}
                      placeholder="RESTAURANTE EL BUEN SABOR S.A." className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="nombreComercial">Nombre Comercial</Label>
                    <Input id="nombreComercial" value={fiscal.nombreComercial}
                      onChange={e => setFiscal({ ...fiscal, nombreComercial: e.target.value })}
                      placeholder="El Buen Sabor" className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Correo de Contacto</Label>
                    <Input id="contactEmail" type="email" value={fiscal.contactEmail}
                      onChange={e => setFiscal({ ...fiscal, contactEmail: e.target.value })}
                      placeholder="info@restaurante.ec" className="mt-1 h-11" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="direccionMatriz">Dirección Matriz</Label>
                  <Input id="direccionMatriz" value={fiscal.direccionMatriz}
                    onChange={e => setFiscal({ ...fiscal, direccionMatriz: e.target.value })}
                    placeholder="Av. Amazonas N35-17 y Juan Pablo Sanz, Quito" className="mt-1 h-11" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="estCodigo">Cód. Establecimiento</Label>
                    <Input id="estCodigo" value={fiscal.establecimientoCodigo} maxLength={3}
                      onChange={e => setFiscal({ ...fiscal, establecimientoCodigo: e.target.value.replace(/\D/g, "") })}
                      placeholder="001" className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="ptoCodigo">Cód. Punto de Emisión</Label>
                    <Input id="ptoCodigo" value={fiscal.puntoEmisionCodigo} maxLength={3}
                      onChange={e => setFiscal({ ...fiscal, puntoEmisionCodigo: e.target.value.replace(/\D/g, "") })}
                      placeholder="001" className="mt-1 h-11" />
                  </div>
                  <div>
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" value={fiscal.phone}
                      onChange={e => setFiscal({ ...fiscal, phone: e.target.value })}
                      placeholder="02-234-5678" className="mt-1 h-11" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Régimen Tributario</Label>
                    <Select value={fiscal.regimen} onValueChange={(v: string) => setFiscal({ ...fiscal, regimen: v })}>
                      <SelectTrigger className="mt-1 h-11"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GENERAL">Régimen General</SelectItem>
                        <SelectItem value="RIMPE_EMPRENDEDOR">RIMPE — Emprendedor</SelectItem>
                        <SelectItem value="RIMPE_NEGOCIO_POPULAR">RIMPE — Negocio Popular</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="contribEsp">Contribuyente Especial (opcional)</Label>
                    <Input id="contribEsp" value={fiscal.contribuyenteEspecial}
                      onChange={e => setFiscal({ ...fiscal, contribuyenteEspecial: e.target.value })}
                      placeholder="Número si aplica" className="mt-1 h-11" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="obligado" checked={fiscal.obligadoContabilidad}
                    onCheckedChange={v => setFiscal({ ...fiscal, obligadoContabilidad: v })} />
                  <Label htmlFor="obligado" className="cursor-pointer">Obligado a llevar contabilidad</Label>
                </div>
                <Button type="submit" disabled={savingFiscal || !restaurantId}
                  className="w-full h-11 bg-zinc-900 hover:bg-zinc-700 text-white">
                  {savingFiscal ? "Guardando..." : "Guardar datos fiscales"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
