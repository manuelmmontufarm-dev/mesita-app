"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    logo: "",
    address: "",
  });

  useEffect(() => {
    async function init() {
      try {
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        const rid = session?.user?.restaurantId as string | undefined;
        if (!rid) return;
        setRestaurantId(rid);
        const res = await fetch(`/api/restaurant/${rid}`);
        const data = await res.json();
        if (data) {
          const r = data.data ?? data;
          setFormData({ name: r.name ?? "", logo: r.logo ?? "", address: r.address ?? "" });
        }
      } catch {
        toast({ title: "Error", description: "Error al cargar datos", variant: "destructive" });
      }
    }
    init();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId) return;
    setIsLoading(true);
    try {
      const response = await fetch(`/api/restaurant/${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        toast({ title: "Cambios guardados / Changes saved", description: "Tu restaurante fue actualizado", variant: "default" });
      } else {
        toast({ title: "Error", description: "No se pudieron guardar los cambios", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión / Connection error", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-zinc-900">Restaurante</h1>
        <p className="text-zinc-600 mt-2">Gestiona la información de tu restaurante</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Información del restaurante / Restaurant Info</CardTitle>
          <CardDescription>Actualiza los datos básicos de tu restaurante</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name" className="text-zinc-700">Nombre / Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="h-12 mt-2" disabled={isLoading} />
            </div>
            <div>
              <Label htmlFor="logo" className="text-zinc-700">Logo (URL) / Logo (URL)</Label>
              <Input id="logo" value={formData.logo} onChange={(e) => setFormData({ ...formData, logo: e.target.value })} placeholder="https://..." className="h-12 mt-2" disabled={isLoading} />
            </div>
            <div>
              <Label htmlFor="address" className="text-zinc-700">Dirección / Address</Label>
              <Textarea id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className="mt-2" rows={3} disabled={isLoading} />
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-zinc-900 mb-4">Configuración fiscal / Tax Settings</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-700">IVA (Impuesto al Valor Agregado)</span>
                  <span className="font-medium text-zinc-900">15% (fijo)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-700">Propina / Tip</span>
                  <span className="font-medium text-zinc-900">10% (mandatorio)</span>
                </div>
                <p className="text-zinc-600 text-xs mt-4">
                  Estos valores son obligatorios por ley ecuatoriana. / These values are required by Ecuadorian law.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={isLoading || !restaurantId} className="w-full h-12 bg-zinc-900 hover:bg-zinc-700 text-white font-medium">
              {isLoading ? "Guardando..." : "Guardar cambios / Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
