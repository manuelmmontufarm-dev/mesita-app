'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Bill, Table } from '@prisma/client';

interface BillStatusCardProps {
  bill: Bill;
  table: Table;
}

export function BillStatusCard({ bill }: BillStatusCardProps) {
  const getStatusBadge = () => {
    switch (bill.status) {
      case 'UNPAID':
        return <Badge className="bg-green-500 text-white">Cuenta abierta</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge className="bg-yellow-500 text-white">Pago parcial</Badge>;
      case 'FULLY_PAID':
        return <Badge className="bg-blue-500 text-white">Pagada</Badge>;
      case 'REFUNDED':
        return <Badge className="bg-gray-500 text-white">Reembolsada</Badge>;
      default:
        return <Badge className="bg-gray-500 text-white">Desconocido</Badge>;
    }
  };

  const getCreatedTime = () => {
    const now = new Date();
    const created = new Date(bill.createdAt);
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / 60000);

    if (diffMinutes < 1) return 'hace unos segundos';
    if (diffMinutes === 1) return 'hace 1 minuto';
    if (diffMinutes < 60) return `hace ${diffMinutes} minutos`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return 'hace 1 hora';
    return `hace ${diffHours} horas`;
  };

  return (
    <Card className="p-4 bg-zinc-100 border-0">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div>
            {getStatusBadge()}
          </div>
          {bill.status !== 'FULLY_PAID' && (
            <div className="text-sm text-zinc-600">
              Abierta {getCreatedTime()}
            </div>
          )}
          {bill.status === 'FULLY_PAID' && bill.closedAt && (
            <div className="text-sm text-zinc-600">
              Cerrada: {new Date(bill.closedAt).toLocaleString('es-ES')}
            </div>
          )}
        </div>
        {bill.status !== 'FULLY_PAID' && (
          <div className="text-sm text-zinc-700">
            ID: {bill.id.substring(0, 8)}...
          </div>
        )}
      </div>
    </Card>
  );
}
