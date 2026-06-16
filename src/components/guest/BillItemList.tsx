'use client';

import { BillItem } from '@prisma/client';
import { Checkbox } from '@/components/ui/checkbox';

interface BillItemListProps {
  items: BillItem[];
  splitMode: string;
  selectedItems: Set<string>;
  onSelectItem: (id: string) => void;
  showPaidBadge: boolean;
}

export function BillItemList({
  items,
  splitMode,
  selectedItems,
  onSelectItem,
  showPaidBadge,
}: BillItemListProps) {
  return (
    <div className="rounded-2xl overflow-hidden divide-y divide-border border border-border">
      {items.map((item) => {
        const pricePerUnit = Number(item.price);
        return (
          <div
            key={item.id}
            className={`flex items-center gap-4 px-4 py-4 ${item.isPaid ? 'bg-muted/40' : 'bg-card'}`}
          >
            {splitMode === 'BY_ITEM' && (
              <Checkbox
                checked={selectedItems.has(item.id)}
                onCheckedChange={() => onSelectItem(item.id)}
                disabled={item.isPaid}
                className="h-6 w-6 rounded-md"
              />
            )}
            <div className="flex-1">
              <span className={`text-base font-medium ${item.isPaid ? 'text-muted-foreground' : 'text-foreground'}`}>
                {item.name}
              </span>
              {item.quantity > 1 && (
                <span className="ml-2 text-sm text-muted-foreground">× {item.quantity}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {showPaidBadge && item.isPaid && (
                <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-1 rounded">
                  Pagado
                </span>
              )}
              <span className={`text-base font-semibold ${item.isPaid ? 'text-muted-foreground' : 'text-foreground'}`}>
                ${(pricePerUnit * item.quantity).toFixed(2)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
