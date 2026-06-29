"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";

interface MenuItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  categoryId: string;
  available: boolean;
  posSku?: string;
}

interface Category {
  id: string;
  name: string;
  order: number;
}

export default function MenuPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catDialog, setCatDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [form, setForm] = useState({ name: "", emoji: "🍽️", price: "", categoryId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/demo-pos?view=menu");
      if (!res.ok) throw new Error("failed");
      const json = await res.json();
      setCategories(json.data.categories ?? []);
      setItems(json.data.menuItems ?? []);
    } catch {
      toast({ title: "Error", description: "No se pudo cargar el menú", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const grouped = categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({
      ...cat,
      items: items.filter((i) => i.categoryId === cat.id),
    }));

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/demo-pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "category", name: newCatName }),
      });
      if (res.ok) {
        setNewCatName("");
        setCatDialog(false);
        toast({ title: "Categoría creada" });
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  function openNewItem(categoryId: string) {
    setEditItem(null);
    setForm({ name: "", emoji: "🍽️", price: "", categoryId });
    setItemDialog(true);
  }

  function openEditItem(item: MenuItem) {
    setEditItem(item);
    setForm({
      name: item.name,
      emoji: item.emoji,
      price: String(item.price),
      categoryId: item.categoryId,
    });
    setItemDialog(true);
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(form.price);
    if (!form.name.trim() || Number.isNaN(price)) return;
    setSaving(true);
    try {
      if (editItem) {
        const res = await fetch("/api/demo-pos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "menu-item",
            id: editItem.id,
            name: form.name,
            emoji: form.emoji,
            price,
            categoryId: form.categoryId,
          }),
        });
        if (res.ok) {
          toast({ title: "Ítem actualizado", description: "Sincronizado con POS demo" });
          setItemDialog(false);
          load();
        }
      } else {
        const res = await fetch("/api/demo-pos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: "menu-item",
            name: form.name,
            emoji: form.emoji,
            price,
            categoryId: form.categoryId,
          }),
        });
        if (res.ok) {
          toast({ title: "Ítem agregado", description: "Disponible en POS y dashboard" });
          setItemDialog(false);
          load();
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch("/api/demo-pos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "menu-item", id: item.id, available: !item.available }),
    });
    load();
  }

  async function deleteItem(id: string) {
    const res = await fetch(`/api/demo-pos?entity=menu-item&id=${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: "Ítem eliminado" });
      load();
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", color: "var(--ink-900)", margin: 0 }}>
            Menú
          </h1>
          <p style={{ fontSize: 13, color: "var(--on-light-mut)", marginTop: 4 }}>
            Catálogo del POS demo · se refleja en el dashboard y nuevas órdenes
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Dialog open={catDialog} onOpenChange={setCatDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-10">+ Categoría</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
              <form onSubmit={createCategory} className="space-y-4">
                <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Entradas" className="h-11" />
                <Button type="submit" disabled={saving} className="w-full h-11" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }}>
                  Crear
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(47,179,126,.10)",
        border: "1px solid rgba(47,179,126,.18)",
        fontSize: 12.5,
        color: "#1f6b4c",
      }}>
        <strong>POS demo conectado</strong> · Los cambios de precio y disponibilidad se guardan en el catálogo central. Las mesas QR activas mantienen su cuenta actual hasta cerrar.
      </div>

      {loading ? (
        <div style={{ height: 200, borderRadius: 14, background: "rgba(27,25,22,.06)" }} />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {grouped.map((cat) => (
            <section key={cat.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-900)", margin: 0 }}>{cat.name}</h2>
                <Button size="sm" variant="outline" className="h-8" onClick={() => openNewItem(cat.id)}>
                  + Agregar ítem
                </Button>
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 8,
              }}>
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 14,
                      background: "var(--surface)",
                      border: "1px solid rgba(27,25,22,.08)",
                      opacity: item.available ? 1 : 0.55,
                    }}
                  >
                    <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }} aria-hidden>{item.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-900)" }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: "var(--on-light-mut)", marginTop: 2 }}>
                        {formatCurrency(item.price)}
                        {item.posSku && <span> · {item.posSku}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--on-light-mut)" }}>
                        <Checkbox checked={item.available} onCheckedChange={() => toggleAvailable(item)} />
                        Disp.
                      </label>
                      <div style={{ display: "flex", gap: 4 }}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEditItem(item)}>Editar</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => deleteItem(item.id)}>×</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveItem} className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 mt-2" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 10 }}>
              <div>
                <Label>Emoji</Label>
                <Input value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} className="h-11 mt-2 text-center text-xl" maxLength={4} />
              </div>
              <div>
                <Label>Precio (USD)</Label>
                <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} type="number" step="0.01" min="0" className="h-11 mt-2" />
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-full h-11" style={{ background: "var(--ink-900)", color: "var(--on-dark)" }}>
              {saving ? "Guardando..." : editItem ? "Guardar cambios" : "Agregar al menú"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
