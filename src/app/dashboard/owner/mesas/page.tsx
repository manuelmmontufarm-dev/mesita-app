"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { isOwnerDemoMode, demoTablePayUrl } from "@/lib/owner-data-source";
import { isOwnerReadOnlyClient } from "@/lib/owner-mode";

interface ProdTable {
  id: string;
  name: string;
  token: string;
  posExternalId: string | null;
  createdAt: string;
}

interface DemoTableRow {
  id: string;
  name: string;
  token?: string;
  payUrl?: string;
  posExternalId?: string | null;
  live?: boolean;
  kind?: "qr" | "demo" | "custom";
  status: string;
  guestCount: number;
  total: number;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  paying: "Pagando",
  paid: "Pagada",
  closed: "Cerrada",
  OPEN: "Abierta",
  PAID: "Pagada",
  CLOSED: "Cerrada",
};

export default function MesasPage() {
  const { toast } = useToast();
  const readonly = isOwnerReadOnlyClient();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [tables, setTables] = useState<ProdTable[]>([]);
  const [demoTables, setDemoTables] = useState<DemoTableRow[]>([]);
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
      const isDemo = await isOwnerDemoMode();
      setDemoMode(isDemo);

      if (isDemo) {
        const res = await fetch("/api/demo-dashboard", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("tables");
        const json = await res.json();
        const rows: DemoTableRow[] = (json.data?.tables ?? []).map((t: DemoTableRow) => ({
          ...t,
          token: t.id,
          payUrl: demoTablePayUrl(t.id),
        }));
        setDemoTables(rows.filter((t) => t.live !== false));
        return;
      }

      const [tablesRes, sessionRes] = await Promise.all([
        fetch("/api/tables", { credentials: "include" }),
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

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
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

  if (demoMode === true) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", margin: 0 }}>Mesas</h1>
          <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
            Mesas demo enlazadas al POS en vivo (mesas 1–4 + Mesa 12) · solo lectura
          </p>
        </div>

        {loading ? (
          <div style={{ height: 120, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
        ) : demoTables.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--on-light-mut)" }}>Sin mesas demo activas.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {demoTables.map((t) => {
              const url = t.payUrl ?? (t.token ? payUrl(t.token) : "");
              const statusKey = t.status.toLowerCase();
              return (
                <div key={t.id} style={{ padding: "14px 16px", borderRadius: 14, background: "var(--surface)", border: "1px solid rgba(27,25,22,.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: "var(--on-light-mut)", marginLeft: 10 }}>
                        POS: <strong style={{ color: "var(--ink-900)" }}>{t.posExternalId ?? "—"}</strong>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(47,179,126,.12)", color: "#1f6b4c" }}>
                        {STATUS_LABEL[statusKey] ?? t.status}
                      </span>
                      {t.guestCount > 0 && (
                        <span style={{ fontSize: 12, color: "var(--on-light-mut)", marginLeft: 8 }}>
                          · {t.guestCount} comensal{t.guestCount !== 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                    {url && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => copyUrl(url)}>Copiar enlace</Button>
                        <Button size="sm" variant="outline" className="h-8" asChild>
                          <a href={url} target="_blank" rel="noopener noreferrer">Abrir QR</a>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
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
        {!readonly && (
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
        )}
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
        <p style={{ fontSize: 14, color: "var(--on-light-mut)" }}>
          {readonly ? "No hay mesas registradas." : "No hay mesas. Crea la primera para generar un QR."}
        </p>
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
                  <Button size="sm" variant="outline" className="h-8" onClick={() => copyUrl(payUrl(t.token))}>Copiar enlace</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => downloadQr(t.id, "png")}>QR PNG</Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => downloadQr(t.id, "pdf")}>QR PDF</Button>
                  <Button size="sm" variant="outline" className="h-8" asChild>
                    <a href={payUrl(t.token)} target="_blank" rel="noopener noreferrer">Abrir</a>
                  </Button>
                  {!readonly && (
                    <>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => openEdit(t)}>Editar</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setDeleteTarget(t)}>Eliminar</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
