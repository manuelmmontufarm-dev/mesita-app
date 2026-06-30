"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "SERVER";
  createdAt: string;
}

function SkeletonRow() {
  return (
    <TableRow>
      {[120, 160, 80, 72].map((w, i) => (
        <TableCell key={i} className="h-12">
          <div className="h-4 rounded" style={{ width: w, background: "rgba(27,25,22,.07)" }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

const roleLabels: Record<StaffMember["role"], string> = {
  OWNER: "Propietario",
  MANAGER: "Gerente",
  SERVER: "Mesero",
};

export default function PersonalPage() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState({ name: "", email: "", role: "SERVER" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    try {
      const response = await fetch("/api/staff");
      if (response.ok) {
        const data = await response.json();
        setStaff(data.data || []);
      }
    } catch {
      toast({ title: "Error", description: "Error al cargar personal", variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  }

  async function createStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!newStaff.name || !newStaff.email) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStaff),
      });

      if (response.ok) {
        const data = await response.json();
        setTempPassword(data.data.temporaryPassword);
        setNewStaff({ name: "", email: "", role: "SERVER" });
        loadStaff();
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "Error al crear personal", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function confirmDeleteStaff() {
    if (!deleteTarget) return;
    try {
      const response = await fetch(`/api/staff/${deleteTarget.id}`, { method: "DELETE" });
      if (response.ok) {
        toast({ title: "Personal eliminado" });
        loadStaff();
      } else {
        toast({ title: "Error", description: "Error al eliminar personal", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Personal</h1>
          <p className="text-muted-foreground mt-1">Gestiona el equipo de tu restaurante</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
              Agregar personal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {tempPassword ? "Contraseña temporal" : "Nuevo personal"}
              </DialogTitle>
            </DialogHeader>

            {tempPassword ? (
              <div className="space-y-4">
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{ background: "rgba(47,179,126,.10)", color: "#1a6647" }}
                >
                  Personal creado exitosamente
                </div>
                <div className="space-y-2">
                  <Label>Contraseña temporal</Label>
                  <div className="flex gap-2">
                    <Input value={tempPassword} readOnly className="h-12 font-mono" />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(tempPassword);
                        toast({ title: "Copiado", description: "Contraseña copiada al portapapeles" });
                      }}
                      className="h-12"
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Comparte esta contraseña. La cambiarán al primer inicio de sesión.
                </p>
                <Button
                  type="button"
                  onClick={() => { setTempPassword(null); setDialogOpen(false); }}
                  className="w-full h-12 text-white"
                  style={{ background: "var(--ink-900)" }}
                >
                  Listo
                </Button>
              </div>
            ) : (
              <form onSubmit={createStaff} className="space-y-4">
                <div>
                  <Label>Nombre completo</Label>
                  <Input
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    placeholder="Juan García"
                    className="h-12 mt-2"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label>Correo</Label>
                  <Input
                    type="email"
                    value={newStaff.email}
                    onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                    placeholder="juan@ejemplo.com"
                    className="h-12 mt-2"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <Label>Rol</Label>
                  <Select value={newStaff.role} onValueChange={(value) => setNewStaff({ ...newStaff, role: value })}>
                    <SelectTrigger className="h-12 mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MANAGER">Gerente</SelectItem>
                      <SelectItem value="SERVER">Mesero</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 text-white"
                  style={{ background: "var(--coral)" }}
                >
                  {isLoading ? "Creando..." : "Crear personal"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Delete staff confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title={`¿Eliminar a ${deleteTarget?.name ?? "este miembro"}?`}
        description={`${deleteTarget ? roleLabels[deleteTarget.role] : "Esta persona"} perderá el acceso a MesitaQR de inmediato. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar personal"
        variant="destructive"
        onConfirm={confirmDeleteStaff}
      />

      {isFetching ? (
        <Card>
          <CardHeader>
            <div className="h-5 w-40 rounded" style={{ background: "rgba(27,25,22,.07)" }} />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Acciones</TableHead>
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
      ) : staff.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">No hay personal registrado</h3>
            <p className="text-muted-foreground mt-2 mb-6">
              Agrega miembros del personal para darles acceso.
            </p>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
                  Agregar personal
                </Button>
              </DialogTrigger>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Personal registrado</CardTitle>
            <CardDescription>
              {staff.length} miembro{staff.length !== 1 ? "s" : ""} del equipo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="h-12 font-medium">{member.name}</TableCell>
                      <TableCell className="h-12 text-muted-foreground">{member.email}</TableCell>
                      <TableCell className="h-12">{roleLabels[member.role]}</TableCell>
                      <TableCell className="h-12">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDeleteTarget(member)}
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
