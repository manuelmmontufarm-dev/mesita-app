"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface ProdTable {
  id: string;
  name: string;
  token: string;
  posExternalId: string | null;
  createdAt: string;
}

export default function MesasPage() {
  const { toast } = useToast();
  const [tables, setTables] = useState<ProdTable[]>([]);
  const [invoiceMode, setInvoiceMode] = useState<string>("DISABLED");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProdTable | null>(null);
  const [newName, setNewName] = useState("");
  const [newPosId, setNewPosId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProdTable | null>(null);

  const posRequired = invoiceMode === "POS";

  const load = useCallback(async () => {
    try {
      const [tablesRes, sessionRes] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/auth/session"),
      ]);
      if (!tablesRes.ok) throw new Error("tables");
      const tablesJson = await tablesRes.json();
      setTables(tablesJson.data ?? []);

      const session = await sessionRes.json();
      const rid = session?.user?.restaurantId as string | undefined;
      if (rid) {
        const fiscalRes = await fetch(`/api/restaurant/${rid}/fiscal`);
        if (fiscalRes.ok) {
          const fiscalJson = await fiscalRes.json();
          setInvoiceMode(fiscalJson.data?.invoiceMode ?? "DISABLED");
        }
      }
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar las mesas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setNewName("");
    setNewPosId("");
    setDialogOpen(true);
  }

  function openEdit(t: ProdTable) {
    setEditTarget(t);
    setNewName(t.name);
    setNewPosId(t.posExternalId ?? "");
    setDialogOpen(true);
  }

  async function saveTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (posRequired && !newPosId.trim()) {
      toast({ title: "Nombre en el POS requerido", description: "Debe coincidir con Contífico", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = { name: newName.trim(), posExternalId: newPosId.trim() || null };
      const res = editTarget
        ? await fetch(`/api/tables/${editTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/tables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("save");
      setDialogOpen(false);
      toast({ title: editTarget ? "Mesa actualizada" : "Mesa creada" });
      load();
    } catch {
      toast({ title: "Error", description: "No se pudo guardar la mesa", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/tables/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Mesa eliminada" });
      load();
    } else {
      toast({ title: "No se pudo eliminar", variant: "destructive" });
    }
    setDeleteTarget(null);
  }

  function payUrl(token: string) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin).replace(/\/+$/, "");
    return `${base}/pay/${token}`;
  }

  function copyUrl(token: string) {
    navigator.clipboard.writeText(payUrl(token));
    toast({ title: "Enlace copiado" });
  }

  async function downloadQr(tableId: string, format: "png" | "pdf") {
    const res = await fetch(`/api/qr/${tableId}?format=${format}`);
    if (!res.ok) {
      toast({ title: "Error al generar QR", variant: "destructive" });
      return;
    }
    if (format === "png") {
      const json = await res.json();
      const a = document.createElement("a");
      a.href = json.dataUrl;
      a.download = `mesa-qr.png`;
      a.click();
    } else {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mesa-qr.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>Mesas</h1>
          <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
            Mesas de producción con QR · cada mesa necesita un nombre en el POS para Contífico
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }} onClick={openCreate}>
              + Nueva mesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editTarget ? "Editar mesa" : "Nueva mesa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={saveTable} className="space-y-4">
              <div>
                <Label>Nombre visible</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Mesa 5" className="h-11 mt-2" required />
              </div>
              <div>
                <Label>
                  Nombre en el POS {posRequired ? "" : <span className="text-muted-foreground font-normal">(recomendado)</span>}
                </Label>
                <Input
                  value={newPosId}
                  onChange={(e) => setNewPosId(e.target.value)}
                  placeholder="Mesa 5"
                  className="h-11 mt-2"
                  required={posRequired}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Debe coincidir exactamente con el nombre de la mesa en Contífico.
                </p>
              </div>
              <Button type="submit" disabled={saving} className="w-full h-11" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={`¿Eliminar ${deleteTarget?.name}?`}
        description="Se eliminará la mesa y su QR dejará de funcionar."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={confirmDelete}
      />

      {loading ? (
        <div style={{ height: 120, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
      ) : tables.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--on-light-mut)" }}>No hay mesas. Crea la primera para generar un QR.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {tables.map((t) => (
            <div key={t.id} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                  <span style={{ fontSize: 12, color: "var(--on-light-mut)", marginLeft: 10 }}>
                    POS: <strong style={{ color: "var(--ink-900)" }}>{t.posExternalId ?? "—"}</strong>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => copyUrl(t.token)}>Copiar enlace</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => downloadQr(t.id, "png")}>QR PNG</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => downloadQr(t.id, "pdf")}>QR PDF</Button>
                  <Button size="sm" variant="outline" className="h-8" asChild>
                    <a href={payUrl(t.token)} target="_blank" rel="noopener noreferrer">Abrir</a>
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(t)}>Editar</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setDeleteTarget(t)}>Eliminar</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
