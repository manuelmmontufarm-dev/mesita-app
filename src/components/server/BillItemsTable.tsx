'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2 } from 'lucide-react';
import type { BillItem } from '@prisma/client';

interface BillItemsTableProps {
  items: BillItem[];
  billStatus: string;
  onDeleteItem: (itemId: string) => void;
  onQuantityChange: (itemId: string, quantity: number) => void;
}

export function BillItemsTable({
  items,
  billStatus,
  onDeleteItem,
  onQuantityChange,
}: BillItemsTableProps) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<number | null>(null);

  const isEditable = billStatus === 'UNPAID';

  const handleQuantityBlur = (itemId: string) => {
    if (editingQuantity !== null && editingQuantity > 0) {
      onQuantityChange(itemId, editingQuantity);
    }
    setEditingItemId(null);
    setEditingQuantity(null);
  };

  return (
    <Card className="overflow-hidden bg-zinc-100 border-0">
      <div className="divide-y">
        {items.length === 0 ? (
          <div className="p-4 text-center text-sm text-zinc-600">
            No hay items en la cuenta
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4 min-h-12">
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-900">{item.name}</div>
              </div>

              {/* Qty Spinbox */}
              <div className="flex items-center gap-2 px-4">
                {editingItemId === item.id && isEditable ? (
                  <Input
                    type="number"
                    min="1"
                    value={editingQuantity ?? ''}
                    onChange={(e) => setEditingQuantity(parseInt(e.target.value) || 1)}
                    onBlur={() => handleQuantityBlur(item.id)}
                    autoFocus
                    className="w-12 h-10 text-center text-sm"
                  />
                ) : (
                  <button
                    onClick={() => {
                      if (isEditable) {
                        setEditingItemId(item.id);
                        setEditingQuantity(item.quantity);
                      }
                    }}
                    disabled={!isEditable}
                    className={`w-12 h-10 text-sm text-center ${
                      isEditable
                        ? 'border border-zinc-300 rounded cursor-pointer hover:border-zinc-400'
                        : 'text-zinc-600'
                    }`}
                  >
                    {item.quantity}
                  </button>
                )}
              </div>

              {/* Price per unit */}
              <div className="w-20 text-right">
                <div className="text-sm text-zinc-700">${item.price.toNumber().toFixed(2)}</div>
              </div>

              {/* Subtotal */}
              <div className="w-24 text-right">
                <div className="text-sm font-semibold text-zinc-800">
                  ${(item.price.toNumber() * item.quantity).toFixed(2)}
                </div>
              </div>

              {/* Paid Badge */}
              {item.isPaid && (
                <div className="px-2">
                  <Badge className="bg-zinc-500 text-white text-xs">Pagado</Badge>
                </div>
              )}

              {/* Delete Button */}
              {isEditable && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteItem(item.id)}
                  className="h-10 w-10 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
