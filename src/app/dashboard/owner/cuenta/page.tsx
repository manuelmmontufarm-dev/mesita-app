"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CuentaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-zinc-900">Cuenta / Account</h1>
        <p className="text-zinc-600 mt-2">Estado y configuración de tu cuenta</p>
      </div>

      <Alert className="border-blue-500 bg-blue-50">
        <AlertDescription>
          No se realizan cobros en esta fase beta. Tu restaurante está activado manualmente por el equipo de MesaQR.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Estado / Status</CardTitle>
            <CardDescription>Estado actual de tu cuenta</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-900">
              Activo / Active
            </div>
            <p className="text-sm text-zinc-600 mt-2">Tu restaurante está activo y disponible</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Plan / Plan</CardTitle>
            <CardDescription>Tu plan actual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-900">
              Beta / Beta
            </div>
            <p className="text-sm text-zinc-600 mt-2">Plan fase beta sin costo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Facturas / Invoices</CardTitle>
            <CardDescription>Total de facturas generadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-900">
              0
            </div>
            <p className="text-sm text-zinc-600 mt-2">Aún no hay facturas emitidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Activación / Activation date</CardTitle>
            <CardDescription>Cuando tu cuenta fue activada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-zinc-900">
              2026-05-12
            </div>
            <p className="text-sm text-zinc-600 mt-2">Fecha de activación</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información de facturación / Billing Information</CardTitle>
          <CardDescription>
            Detalles de facturación y cobros
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-zinc-50 rounded border border-zinc-200">
            <p className="text-sm text-zinc-700 font-medium">Próximos pasos / Next steps:</p>
            <ul className="text-sm text-zinc-600 mt-2 space-y-1">
              <li>• Fase beta: sin cobros / Beta phase: no charges</li>
              <li>• Integración de pagos en Fase 2 / Payment integration in Phase 2</li>
              <li>• Facturación electrónica vía tu POS / Electronic invoicing via your POS</li>
              <li>• Soporte 24/7 disponible / 24/7 support available</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
