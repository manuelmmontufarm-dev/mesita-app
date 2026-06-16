'use client';

import { Decimal } from '@prisma/client/runtime/library';
import { formatCurrency } from '@/lib/format';

interface BillBreakdownProps {
  subtotal: Decimal;
  propina: Decimal;
  iva: Decimal;
  total: Decimal;
  currency?: string;
}

export function BillBreakdown({
  subtotal,
  propina,
  iva,
  total,
}: BillBreakdownProps) {
  return (
    <div className="bg-zinc-100 rounded-lg p-4">
      <div className="space-y-3">
        <div className="flex justify-between items-center text-base text-zinc-700">
          <span>Subtotal</span>
          <span className="text-lg text-zinc-900 font-medium">{formatCurrency(Number(subtotal))}</span>
        </div>
        <div className="flex justify-between items-start gap-3 text-base text-zinc-700">
          <span className="flex-1 min-w-0">
            Propina 10%{' '}
            <span className="text-zinc-500 text-sm">(incluida por el restaurante)</span>
          </span>
          <span className="text-lg text-zinc-900 font-medium whitespace-nowrap">{formatCurrency(Number(propina))}</span>
        </div>
        <div className="flex justify-between items-center text-base text-zinc-700">
          <span>IVA 15%</span>
          <span className="text-lg text-zinc-900 font-medium">{formatCurrency(Number(iva))}</span>
        </div>
        <div className="pt-3 border-t border-zinc-300">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-zinc-900">Total a pagar</span>
            <span className="text-4xl font-bold text-zinc-950">{formatCurrency(Number(total))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
