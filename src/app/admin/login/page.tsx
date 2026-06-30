"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [secret, setSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Acceso denegado",
          description: data.error ?? "Clave de administrador incorrecta",
          variant: "destructive",
        });
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      toast({
        title: "Error",
        description: "No se pudo verificar la clave",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin MesitaQR</CardTitle>
          <CardDescription>
            Ingresa la clave de super-administrador (ADMIN_SECRET).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Clave de administrador"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Verificando…" : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
