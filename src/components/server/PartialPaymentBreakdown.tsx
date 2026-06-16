'use client';

import { Card } from '@/components/ui/card';
import { TAX_MULTIPLIER } from '@/lib/constants/ecuador-tax';
import type { Bill, BillItem, Payment } from '@prisma/client';

interface PartialPaymentBreakdownProps {
  bill: Bill & { items: BillItem[]; payments: Payment[] };
}

export function PartialPaymentBreakdown({ bill }: PartialPaymentBreakdownProps) {
  if (bill.status !== 'PARTIALLY_PAID') {
    return null;
  }

  const completedPayments = bill.payments.filter(p => p.status === 'COMPLETED');

  if (completedPayments.length === 0) {
    return null;
  }

  const totalPaid = completedPayments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
  const billTotal = bill.items.reduce(
    (sum, item) => sum + item.price.toNumber() * item.quantity * TAX_MULTIPLIER,
    0
  );
  const remainingBalance = billTotal - totalPaid;

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('es-EC', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSplitModeLabel = (mode: string | null) => {
    switch (mode) {
      case 'FULL':
        return 'Pago completo';
      case 'EQUAL':
        return 'Partes iguales';
      case 'BY_ITEM':
        return 'Por artículo';
      default:
        return '—';
    }
  };

  const paidItems = bill.items.filter(item => item.isPaid);

  return (
    <Card className="p-6 bg-emerald-50 border border-emerald-200">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">Historial de pagos</h3>

      <div className="space-y-3 mb-4">
        {completedPayments.map(payment => (
          <div key={payment.id} className="flex justify-between items-start text-sm">
            <div className="flex-1">
              <div className="text-zinc-900 font-medium">
                ${payment.amount.toNumber().toFixed(2)}
              </div>
              <div className="text-xs text-zinc-600">{formatDate(payment.createdAt)}</div>
              <div className="text-xs text-emerald-700 font-medium">
                {getSplitModeLabel(payment.splitMode)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-emerald-200 pt-3 space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-emerald-700">Pagado</span>
          <span className="text-emerald-900 font-semibold">${totalPaid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-amber-700">Pendiente</span>
          <span className="text-amber-900 font-semibold">${remainingBalance.toFixed(2)}</span>
        </div>
      </div>

      {paidItems.length > 0 && (
        <div className="border-t border-emerald-200 pt-3">
          <div className="text-xs font-semibold text-zinc-700 mb-2">Artículos pagos</div>
          <div className="space-y-1">
            {paidItems.map(item => (
              <div key={item.id} className="flex justify-between text-xs">
                <span className="text-zinc-700">
                  {item.name} ×{item.quantity}
                </span>
                <span className="text-zinc-900">${(item.price.toNumber() * item.quantity).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
