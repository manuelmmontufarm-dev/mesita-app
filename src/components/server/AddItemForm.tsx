'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import type { MenuItem } from '@prisma/client';

interface AddItemFormProps {
  billId: string;
  restaurantId: string;
  billStatus: string;
  onItemAdded: () => void;
}

export function AddItemForm({
  billId,
  restaurantId,
  billStatus,
  onItemAdded,
}: AddItemFormProps) {
  const { toast } = useToast();
  const isDisabled = billStatus !== 'UNPAID';

  // Menu tab state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>('');
  const [selectedMenuItemPrice, setSelectedMenuItemPrice] = useState<number | null>(null);
  const [menuQty, setMenuQty] = useState(1);
  const [menuLoading, setMenuLoading] = useState(false);

  // Personalizado tab state
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customPrice, setCustomPrice] = useState('');
  const [customLoading, setCustomLoading] = useState(false);

  // Fetch menu items on mount
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const res = await fetch(`/api/menus/${restaurantId}`);
        if (res.ok) {
          const data = (await res.json()).data as MenuItem[];
          setMenuItems(data);
        }
      } catch (err) {
        console.error('Failed to fetch menu items:', err);
      }
    };

    fetchMenuItems();
  }, [restaurantId]);

  const handleMenuItemSelect = (itemId: string) => {
    const item = menuItems.find((m) => m.id === itemId);
    setSelectedMenuItemId(itemId);
    setSelectedMenuItemPrice(item ? item.price.toNumber() : null);
    setMenuQty(1);
  };

  const handleAddMenuItemClick = async () => {
    if (!selectedMenuItemId || selectedMenuItemPrice === null) {
      toast({
        title: 'Error',
        description: 'Por favor selecciona un ítem',
        variant: 'destructive',
      });
      return;
    }

    setMenuLoading(true);
    try {
      const res = await fetch(`/api/bills/${billId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menuItemId: selectedMenuItemId,
          quantity: menuQty,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to add item');
      }

      toast({
        title: 'Éxito',
        description: 'Ítem agregado',
      });

      setSelectedMenuItemId('');
      setSelectedMenuItemPrice(null);
      setMenuQty(1);
      onItemAdded();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error al agregar ítem',
        variant: 'destructive',
      });
    } finally {
      setMenuLoading(false);
    }
  };

  const handleAddCustomItemClick = async () => {
    if (!customName || !customPrice) {
      toast({
        title: 'Error',
        description: 'Todos los campos son requeridos',
        variant: 'destructive',
      });
      return;
    }

    setCustomLoading(true);
    try {
      const res = await fetch(`/api/bills/${billId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customName,
          quantity: customQty,
          price: parseFloat(customPrice),
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to add custom item');
      }

      toast({
        title: 'Éxito',
        description: 'Ítem personalizado agregado',
      });

      setCustomName('');
      setCustomPrice('');
      setCustomQty(1);
      onItemAdded();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error al agregar ítem personalizado',
        variant: 'destructive',
      });
    } finally {
      setCustomLoading(false);
    }
  };

  return (
    <Card
      className={`p-6 bg-zinc-100 border-0 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {isDisabled && (
        <div className="mb-4 text-sm text-zinc-600">
          No se pueden agregar ítems después de pago parcial
        </div>
      )}

      <Tabs defaultValue="menu" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="menu">Menú</TabsTrigger>
          <TabsTrigger value="custom">Personalizado</TabsTrigger>
        </TabsList>

        {/* Menu Tab */}
        <TabsContent value="menu" className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Buscar ítem</label>
            <select
              value={selectedMenuItemId}
              onChange={(e) => handleMenuItemSelect(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm text-zinc-900"
            >
              <option value="">Buscar ítem...</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} - ${item.price.toNumber().toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {selectedMenuItemId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700">Cantidad</label>
              <Input
                type="number"
                min="1"
                value={menuQty}
                onChange={(e) => setMenuQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-10"
              />
            </div>
          )}

          <Button
            onClick={handleAddMenuItemClick}
            disabled={!selectedMenuItemId || menuLoading}
            className="w-full h-12 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {menuLoading ? 'Agregando...' : 'Agregar'}
          </Button>
        </TabsContent>

        {/* Personalizado Tab */}
        <TabsContent value="custom" className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Nombre del ítem</label>
            <Input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Ej: Cerveza artesanal"
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Cantidad</label>
            <Input
              type="number"
              min="1"
              value={customQty}
              onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Precio</label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="0.00"
              className="h-10"
            />
          </div>

          <Button
            onClick={handleAddCustomItemClick}
            disabled={customLoading}
            className="w-full h-12 bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {customLoading ? 'Agregando...' : 'Agregar'}
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
