"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface DemoSettings {
  restaurant: {
    name: string;
    nombreComercial: string;
    city: string;
    ruc: string;
    direccion: string;
    email: string;
    phone: string;
  };
  posMesita: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
    syncMenu: boolean;
    syncTables: boolean;
    syncBilling: boolean;
  };
  payments: {
    enabled: boolean;
    environment: "SANDBOX" | "PRODUCTION";
  };
  fiscal: {
    establecimientoCodigo: string;
    puntoEmisionCodigo: string;
    regimen: string;
    obligadoContabilidad: boolean;
  };
}

interface DemoConfig extends DemoSettings {
  posMesitaStatus?: {
    name: string;
    url: string;
    connected: boolean;
    configured: boolean;
    error: string | null;
  };
}

const SANDBOX_HELP =
  "Sandbox = modo de pruebas. Los pagos y facturas no son reales ni van al SRI. Úsalo para probar sin riesgo antes de activar Producción.";

export function DemoConfiguracionPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [posStatus, setPosStatus] = useState<DemoConfig["posMesitaStatus"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-pos?view=config");
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      const d = json.data;
      setSettings(d.settings);
      setPosStatus(d.posMesita);
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la configuración", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  async function save(patch: Partial<DemoSettings>) {
    setSaving(true);
    try {
      const res = await fetch("/api/demo-pos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "settings", ...patch }),
      });
      if (res.ok) {
        const json = await res.json();
        setSettings((prev) => (prev ? { ...prev, ...json.data } : json.data));
        toast({ title: "Guardado", description: "Configuración actualizada" });
        load();
      } else {
        toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <div style={{ height: 320, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--ink-900)" }}>Configuración</h1>
        <p className="text-sm mt-1" style={{ color: "var(--on-light-mut)" }}>
          Integraciones del restaurante · modo demo editable
        </p>
      </div>

      <div className="p-3 rounded-lg text-xs" style={{ background: "rgba(47,179,126,.08)", color: "#1f6b4c", border: "1px solid rgba(47,179,126,.18)" }}>
        <strong>¿Qué es Sandbox?</strong> {SANDBOX_HELP}
      </div>

      <Tabs defaultValue="pos">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pos">POS Mesita</TabsTrigger>
          <TabsTrigger value="payments">Botón de pago</TabsTrigger>
          <TabsTrigger value="fiscal">Datos SRI</TabsTrigger>
        </TabsList>

        {/* POS Mesita */}
        <TabsContent value="pos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>POS Mesita (API)</CardTitle>
                  <CardDescription className="mt-1">
                    Conectado vía API a Railway — menú, mesas y facturación
                  </CardDescription>
                </div>
                {posStatus && (
                  <Badge className={posStatus.connected ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200"}>
                    {posStatus.connected ? "Conectado" : posStatus.configured ? "Error conexión" : "Sin API key"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {posStatus && (
                <p className="text-xs font-mono text-zinc-500 break-all">{posStatus.url}</p>
              )}
              {posStatus?.error && (
                <p className="text-xs text-amber-700">{posStatus.error}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del restaurante</Label>
                  <Input className="mt-1 h-11" value={settings.restaurant.name}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, name: e.target.value } })} />
                </div>
                <div>
                  <Label>Ciudad</Label>
                  <Input className="mt-1 h-11" value={settings.restaurant.city}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, city: e.target.value } })} />
                </div>
              </div>

              <div>
                <Label>Ambiente POS</Label>
                <Select value={settings.posMesita.environment}
                  onValueChange={(v: "SANDBOX" | "PRODUCTION") => setSettings({ ...settings, posMesita: { ...settings.posMesita, environment: v } })}>
                  <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SANDBOX">Sandbox (pruebas)</SelectItem>
                    <SelectItem value="PRODUCTION">Producción</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 border-t pt-4">
                {[
                  { key: "syncMenu" as const, label: "Sincronizar menú", desc: "Cambios en menú ↔ POS" },
                  { key: "syncTables" as const, label: "Sincronizar mesas", desc: "Mesas y QR ↔ POS" },
                  { key: "syncBilling" as const, label: "Sincronizar facturación", desc: "Pagos del app → POS → dashboard" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </div>
                    <Switch checked={settings.posMesita[item.key]}
                      onCheckedChange={(v) => setSettings({ ...settings, posMesita: { ...settings.posMesita, [item.key]: v } })} />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Integración POS activa</p>
                  <p className="text-xs text-zinc-500">Desactiva para usar solo datos locales</p>
                </div>
                <Switch checked={settings.posMesita.enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, posMesita: { ...settings.posMesita, enabled: v } })} />
              </div>

              <Button disabled={saving} className="w-full h-11 bg-zinc-900 text-white"
                onClick={() => save({ restaurant: settings.restaurant, posMesita: settings.posMesita })}>
                {saving ? "Guardando..." : "Guardar POS Mesita"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Botón de pago */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Botón de pago Mesita</CardTitle>
                  <CardDescription className="mt-1">
                    Cómo los comensales pagan desde el QR en la mesa
                  </CardDescription>
                </div>
                <Badge className={settings.payments.enabled ? "bg-green-100 text-green-800 border-green-200" : "bg-zinc-100 text-zinc-600"}>
                  {settings.payments.enabled ? "Activo" : "Inactivo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Ambiente de pagos</Label>
                <Select value={settings.payments.environment}
                  onValueChange={(v: "SANDBOX" | "PRODUCTION") => setSettings({ ...settings, payments: { ...settings.payments, environment: v } })}>
                  <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SANDBOX">Sandbox — pagos de prueba, sin cargo real</SelectItem>
                    <SelectItem value="PRODUCTION">Producción — cobros reales</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500 mt-2">{SANDBOX_HELP}</p>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <p className="text-sm font-medium">Botón de pago habilitado</p>
                  <p className="text-xs text-zinc-500">Los comensales pueden pagar desde el QR</p>
                </div>
                <Switch checked={settings.payments.enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, payments: { ...settings.payments, enabled: v } })} />
              </div>

              <Button disabled={saving} className="w-full h-11 bg-zinc-900 text-white"
                onClick={() => save({ payments: settings.payments })}>
                {saving ? "Guardando..." : "Guardar botón de pago"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fiscal */}
        <TabsContent value="fiscal">
          <Card>
            <CardHeader>
              <CardTitle>Datos fiscales SRI</CardTitle>
              <CardDescription>Para facturas electrónicas de La Doña Pepa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>RUC (13 dígitos)</Label>
                  <Input className="mt-1 h-11" maxLength={13} value={settings.restaurant.ruc}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, ruc: e.target.value.replace(/\D/g, "") } })} />
                </div>
                <div>
                  <Label>Razón social / Nombre comercial</Label>
                  <Input className="mt-1 h-11" value={settings.restaurant.nombreComercial}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, nombreComercial: e.target.value } })} />
                </div>
                <div className="md:col-span-2">
                  <Label>Dirección matriz</Label>
                  <Input className="mt-1 h-11" value={settings.restaurant.direccion}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, direccion: e.target.value } })} />
                </div>
                <div>
                  <Label>Correo</Label>
                  <Input type="email" className="mt-1 h-11" value={settings.restaurant.email}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, email: e.target.value } })} />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input className="mt-1 h-11" value={settings.restaurant.phone}
                    onChange={(e) => setSettings({ ...settings, restaurant: { ...settings.restaurant, phone: e.target.value } })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cód. establecimiento</Label>
                  <Input className="mt-1 h-11" maxLength={3} value={settings.fiscal.establecimientoCodigo}
                    onChange={(e) => setSettings({ ...settings, fiscal: { ...settings.fiscal, establecimientoCodigo: e.target.value } })} />
                </div>
                <div>
                  <Label>Cód. punto de emisión</Label>
                  <Input className="mt-1 h-11" maxLength={3} value={settings.fiscal.puntoEmisionCodigo}
                    onChange={(e) => setSettings({ ...settings, fiscal: { ...settings.fiscal, puntoEmisionCodigo: e.target.value } })} />
                </div>
              </div>

              <div>
                <Label>Régimen tributario</Label>
                <Select value={settings.fiscal.regimen}
                  onValueChange={(v) => setSettings({ ...settings, fiscal: { ...settings.fiscal, regimen: v } })}>
                  <SelectTrigger className="mt-1 h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL">Régimen General</SelectItem>
                    <SelectItem value="RIMPE_EMPRENDEDOR">RIMPE Emprendedor</SelectItem>
                    <SelectItem value="RIMPE_NEGOCIO_POPULAR">RIMPE Negocio Popular</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={settings.fiscal.obligadoContabilidad}
                  onCheckedChange={(v) => setSettings({ ...settings, fiscal: { ...settings.fiscal, obligadoContabilidad: v } })} />
                <Label>Obligado a llevar contabilidad</Label>
              </div>

              <Button disabled={saving} className="w-full h-11 bg-zinc-900 text-white"
                onClick={() => save({ restaurant: settings.restaurant, fiscal: settings.fiscal })}>
                {saving ? "Guardando..." : "Guardar datos fiscales"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
