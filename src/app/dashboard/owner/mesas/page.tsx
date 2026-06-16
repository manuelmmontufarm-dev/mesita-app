"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface TableItem {
  id: string;
  name: string;
  token: string;
  posExternalId: string | null;
}

function SkeletonRow() {
  return (
    <TableRow>
      {[80, 64, 120, 72].map((w, i) => (
        <TableCell key={i} className="h-12">
          <div className="h-4 rounded" style={{ width: w, background: "rgba(27,25,22,.07)" }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

export default function MesasPage() {
  const { toast } = useToast();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newPosId, setNewPosId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTable, setEditTable] = useState<TableItem | null>(null);
  const [editPosId, setEditPosId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableItem | null>(null);

  useEffect(() => {
    loadTables();
  }, []);

  async function loadTables() {
    try {
      const response = await fetch("/api/tables");
      if (response.ok) {
        const data = await response.json();
        setTables(data.data || []);
      }
    } catch {
      toast({ title: "Error", description: "Error al cargar mesas", variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  }

  async function createTable(e: React.FormEvent) {
    e.preventDefault();
    if (!newTableName.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTableName,
          posExternalId: newPosId.trim() || undefined,
        }),
      });

      if (response.ok) {
        setNewTableName("");
        setNewPosId("");
        setDialogOpen(false);
        toast({ title: "Mesa creada", description: `Mesa ${newTableName} fue creada` });
        loadTables();
      } else {
        toast({ title: "Error", description: "Error al crear mesa", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function savePosId() {
    if (!editTable) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/tables/${editTable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posExternalId: editPosId.trim() || null }),
      });

      if (response.ok) {
        toast({ title: "Guardado", description: "ID POS actualizado" });
        setEditTable(null);
        loadTables();
      } else {
        toast({ title: "Error", description: "No se pudo guardar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeleteTable() {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/tables/${deleteTarget.id}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Mesa eliminada", description: `${deleteTarget.name} fue eliminada` });
        loadTables();
      } else {
        toast({ title: "Error", description: "Error al eliminar mesa", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    }
  }

  async function downloadQR(id: string, format: "png" | "pdf") {
    try {
      const response = await fetch(`/api/qr/${id}?format=${format}`);
      if (response.ok) {
        if (format === "png") {
          const data = await response.json();
          const link = document.createElement("a");
          link.href = data.data.dataUrl;
          link.download = `qr-${id}.png`;
          link.click();
        } else {
          const blob = await response.blob();
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `qr-${id}.pdf`;
          link.click();
        }
      }
    } catch {
      toast({ title: "Error", description: "Error descargando QR", variant: "destructive" });
    }
  }

  const CreateForm = () => (
    <form onSubmit={createTable} className="space-y-4">
      <div>
        <Label htmlFor="tableName">Nombre o número de mesa</Label>
        <Input
          id="tableName"
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value)}
          placeholder="Mesa 1"
          className="h-12 mt-2"
          disabled={isLoading}
        />
      </div>
      <div>
        <Label htmlFor="posId">
          ID en POS{" "}
          <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          id="posId"
          value={newPosId}
          onChange={(e) => setNewPosId(e.target.value)}
          placeholder="Ej. T-004 o el código de tu POS"
          className="h-12 mt-2"
          disabled={isLoading}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Código con el que esta mesa aparece en Contífico u otro POS.
        </p>
      </div>
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-12 text-white"
        style={{ background: "var(--coral)" }}
      >
        {isLoading ? "Creando..." : "Crear mesa"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Mesas</h1>
          <p className="text-muted-foreground mt-1">Gestiona las mesas y sus códigos QR</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
              Agregar mesa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva mesa</DialogTitle>
            </DialogHeader>
            <CreateForm />
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete table confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`¿Eliminar ${deleteTarget?.name ?? "esta mesa"}?`}
        description="El código QR de esta mesa dejará de funcionar y los clientes ya no podrán pagar con él. Esta acción no se puede deshacer."
        confirmLabel="Eliminar mesa"
        variant="destructive"
        onConfirm={confirmDeleteTable}
      />

      {/* Edit posExternalId dialog */}
      <Dialog open={!!editTable} onOpenChange={(open) => { if (!open) setEditTable(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ID en POS — {editTable?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="editPosId">Código en POS</Label>
              <Input
                id="editPosId"
                value={editPosId}
                onChange={(e) => setEditPosId(e.target.value)}
                placeholder="Ej. T-004"
                className="h-12 mt-2"
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Déjalo vacío para desvincular esta mesa del POS.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setEditTable(null)} disabled={isSaving} className="h-10">
                Cancelar
              </Button>
              <Button
                onClick={savePosId}
                disabled={isSaving}
                className="h-10 text-white"
                style={{ background: "var(--ink-900)" }}
              >
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isFetching ? (
        <Card>
          <CardHeader>
            <div className="h-5 w-36 rounded" style={{ background: "rgba(27,25,22,.07)" }} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mesa</TableHead>
                  <TableHead>ID en POS</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : tables.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">No hay mesas registradas</h3>
            <p className="text-muted-foreground mt-2 mb-6">
              Agrega tu primera mesa para generar códigos QR.
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
                  Agregar mesa
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva mesa</DialogTitle>
                </DialogHeader>
                <CreateForm />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Mesas registradas</CardTitle>
            <CardDescription>
              {tables.length} mesa{tables.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mesa</TableHead>
                    <TableHead>ID en POS</TableHead>
                    <TableHead>QR</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => (
                    <TableRow key={table.id}>
                      <TableCell className="h-12 font-medium">{table.name}</TableCell>
                      <TableCell className="h-12">
                        {table.posExternalId ? (
                          <button
                            onClick={() => { setEditTable(table); setEditPosId(table.posExternalId ?? ""); }}
                            className="font-mono text-sm text-foreground hover:opacity-70 underline underline-offset-2 decoration-dashed"
                          >
                            {table.posExternalId}
                          </button>
                        ) : (
                          <button
                            onClick={() => { setEditTable(table); setEditPosId(""); }}
                            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 decoration-dashed"
                          >
                            Sin asignar
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="h-12 space-x-2">
                        <Button size="sm" variant="outline" onClick={() => downloadQR(table.id, "png")} className="h-8">
                          PNG
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadQR(table.id, "pdf")} className="h-8">
                          PDF
                        </Button>
                      </TableCell>
                      <TableCell className="h-12 text-right">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(table)}
                          className="h-8"
                        >
                          Eliminar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
