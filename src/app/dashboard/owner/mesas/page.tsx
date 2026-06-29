"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatCurrency } from "@/lib/format";

interface TableRow {
  id: string;
  name: string;
  token?: string;
  slug?: string;
  payUrl?: string;
  posExternalId: string | null;
  live: boolean;
  kind: "qr" | "demo" | "custom";
  status: "open" | "paying" | "closed";
  guestCount: number;
  total: number;
}

const STATUS = {
  open: { label: "Abierta", bg: "rgba(232,106,51,.13)", color: "#c45a1a" },
  paying: { label: "Pagando con Mesita", bg: "rgba(47,179,126,.14)", color: "#1f6b4c" },
  closed: { label: "Cerrada", bg: "rgba(27,25,22,.08)", color: "#6B7280" },
};

const KIND = {
  qr: { label: "QR en vivo", color: "#1f6b4c", bg: "rgba(47,179,126,.12)" },
  demo: { label: "Solo demo", color: "#6B7280", bg: "rgba(27,25,22,.06)" },
  custom: { label: "Personalizada", color: "#4a5a78", bg: "rgba(91,107,140,.12)" },
};

export default function MesasPage() {
  const { toast } = useToast();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPosId, setNewPosId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableRow | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-pos?view=tables");
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      setTables(json.data.tables ?? []);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar las mesas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3_000);
    return () => clearInterval(id);
  }, [load]);

  async function createTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/demo-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "table", name: newName, posExternalId: newPosId || undefined }),
      });
      if (res.ok) {
        setNewName("");
        setNewPosId("");
        setDialogOpen(false);
        toast({ title: "Mesa creada", description: "Sincronizada con el POS demo" });
        load();
      } else {
        toast({ title: "Error", description: "No se pudo crear la mesa", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/demo-pos?entity=table&id=${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Mesa eliminada" });
      load();
    } else {
      toast({ title: "No se puede eliminar", description: "Las mesas QR y de demostración son fijas", variant: "destructive" });
    }
    setDeleteTarget(null);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "Enlace copiado", description: "Pégalo para compartir el QR" });
  }

  const qrTables = tables.filter((t) => t.kind === "qr");
  const otherTables = tables.filter((t) => t.kind !== "qr");

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-900)", margin: 0 }}>
            Mesas
          </h1>
          <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
            Mesas con QR conectadas al app · demostración con datos simulados
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }}>
              + Nueva mesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva mesa en POS</DialogTitle></DialogHeader>
            <form onSubmit={createTable} className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Mesa 9" className="h-11 mt-2" />
              </div>
              <div>
                <Label>ID en POS <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input value={newPosId} onChange={(e) => setNewPosId(e.target.value)} placeholder="T-009" className="h-11 mt-2" />
              </div>
              <Button type="submit" disabled={saving} className="w-full h-11" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }}>
                {saving ? "Creando..." : "Crear y sincronizar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={`¿Eliminar ${deleteTarget?.name}?`}
        description="Solo se pueden eliminar mesas personalizadas."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      {loading ? (
        <div style={{ display: "grid", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 72, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
          ))}
        </div>
      ) : (
        <>
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--on-light-mut)", marginBottom: 10 }}>
              Mesas con QR · en vivo
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {qrTables.map((t) => {
                const sc = STATUS[t.status];
                const kc = KIND.qr;
                return (
                  <div key={t.id} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-900)" }}>{t.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: kc.bg, color: kc.color }}>{kc.label}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {t.payUrl && (
                          <>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => copyUrl(t.payUrl!)}>Copiar enlace</Button>
                            <Button size="sm" variant="outline" className="h-8" asChild>
                              <a href={t.payUrl} target="_blank" rel="noopener noreferrer">Abrir app</a>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12.5, color: "var(--on-light-mut)" }}>
                      <span>POS: <strong style={{ color: "var(--ink-900)" }}>{t.posExternalId ?? "—"}</strong> · {t.guestCount} comensales</span>
                      <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{formatCurrency(t.total)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--on-light-mut)", marginBottom: 10 }}>
              Demostración · datos simulados
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {otherTables.map((t) => {
                const sc = STATUS[t.status];
                const kc = KIND[t.kind];
                return (
                  <div key={t.id} style={{ padding: "13px 14px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.07)", opacity: t.kind === "demo" ? 0.92 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 100, background: kc.bg, color: kc.color }}>{kc.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--on-light-mut)" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 100, background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 600 }}>{sc.label}</span>
                      <span style={{ fontWeight: 600, color: "var(--ink-900)" }}>{formatCurrency(t.total)}</span>
                    </div>
                    {t.kind === "custom" && (
                      <Button size="sm" variant="ghost" className="h-7 mt-2 text-destructive" onClick={() => setDeleteTarget(t)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
