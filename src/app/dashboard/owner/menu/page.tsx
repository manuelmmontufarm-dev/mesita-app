"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface MenuItem {
  id: string;
  name: string;
  price: string;
  available: boolean;
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
  items: MenuItem[];
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 rounded" style={{ background: "rgba(27,25,22,.07)" }} />
      </CardHeader>
      <CardContent className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex justify-between items-center p-3 rounded border"
            style={{ borderColor: "rgba(27,25,22,.07)" }}
          >
            <div className="space-y-2">
              <div className="h-4 w-36 rounded" style={{ background: "rgba(27,25,22,.07)" }} />
              <div className="h-3 w-16 rounded" style={{ background: "rgba(27,25,22,.05)" }} />
            </div>
            <div className="h-8 w-16 rounded" style={{ background: "rgba(27,25,22,.07)" }} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function MenuPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  useEffect(() => {
    loadMenuData();
  }, []);

  async function loadMenuData() {
    try {
      const [categoriesRes, itemsRes] = await Promise.all([
        fetch("/api/menu/categories"),
        fetch("/api/menu/items"),
      ]);

      if (categoriesRes.ok && itemsRes.ok) {
        const categoriesData = await categoriesRes.json();
        const itemsData = await itemsRes.json();

        const grouped: Record<string, Category> = {};
        categoriesData.data.forEach((cat: any) => {
          grouped[cat.id] = { ...cat, items: [] };
        });

        itemsData.data.forEach((item: any) => {
          if (grouped[item.categoryId]) {
            grouped[item.categoryId].items.push(item);
          }
        });

        setCategories(Object.values(grouped));
      }
    } catch {
      toast({ title: "Error", description: "Error al cargar menú", variant: "destructive" });
    } finally {
      setIsFetching(false);
    }
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/menu/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });

      if (response.ok) {
        setNewCategoryName("");
        setCategoryDialogOpen(false);
        toast({ title: "Categoría creada" });
        loadMenuData();
      }
    } catch {
      toast({ title: "Error", description: "Error al crear categoría", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  const CategoryForm = () => (
    <form onSubmit={createCategory} className="space-y-4">
      <div>
        <Label>Nombre</Label>
        <Input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Platos principales"
          className="h-12 mt-2"
          disabled={isLoading}
        />
      </div>
      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-12 text-white"
        style={{ background: "var(--coral)" }}
      >
        {isLoading ? "Creando..." : "Crear categoría"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Menú</h1>
          <p className="text-muted-foreground mt-1">Gestiona categorías e ítems</p>
        </div>
        <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
          <DialogTrigger asChild>
            <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
              Agregar categoría
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nueva categoría</DialogTitle>
            </DialogHeader>
            <CategoryForm />
          </DialogContent>
        </Dialog>
      </div>

      {isFetching ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-8 text-center">
            <h3 className="text-lg font-semibold text-foreground">No hay categorías en el menú</h3>
            <p className="text-muted-foreground mt-2 mb-6">
              Agrega categorías e ítems para construir tu menú.
            </p>
            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 text-white" style={{ background: "var(--coral)" }}>
                  Agregar categoría
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nueva categoría</DialogTitle>
                </DialogHeader>
                <CategoryForm />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category.id}>
              <CardHeader>
                <CardTitle className="text-xl">{category.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {category.items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No hay ítems en esta categoría</p>
                ) : (
                  <div className="space-y-3">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-center p-3 border rounded-lg"
                        style={{ borderColor: "rgba(27,25,22,.08)" }}
                      >
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-sm text-muted-foreground">${item.price}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <Checkbox checked={item.available} disabled />
                            <span className="text-sm text-muted-foreground">
                              {item.available ? "Disponible" : "No disponible"}
                            </span>
                          </label>
                          <Button variant="outline" size="sm" className="h-9">
                            Editar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-4 h-9">
                  Agregar ítem
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
