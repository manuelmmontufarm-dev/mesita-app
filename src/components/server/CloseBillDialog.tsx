'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface CloseBillDialogProps {
  isOpen: boolean;
  onClose: () => void;
  billId: string;
  billStatus: string;
  billTotal?: number;
  onBillClosed: () => void;
}

export function CloseBillDialog({
  isOpen,
  onClose,
  billId,
  billStatus,
  billTotal,
  onBillClosed,
}: CloseBillDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleCloseBill = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bills/${billId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FULLY_PAID' }),
      });

      if (!res.ok) {
        throw new Error('Failed to close bill');
      }

      toast({
        title: 'Cuenta cerrada',
        description: `$${(billTotal ?? 0).toFixed(2)}`,
      });

      onBillClosed();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error al cerrar cuenta',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const isCloseable = billStatus === 'UNPAID' || billStatus === 'PARTIALLY_PAID';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-zinc-900">¿Marcar cuenta como pagada?</DialogTitle>
          <DialogDescription className="text-sm text-zinc-600 mt-2">
            Esto cerrará la cuenta por ${(billTotal ?? 0).toFixed(2)}. Esta acción no puede deshacerse.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex gap-4 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 border-zinc-300 text-zinc-900 hover:bg-zinc-100"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCloseBill}
            disabled={!isCloseable || isLoading}
            className="flex-1 h-12 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? 'Marcando...' : 'Sí, marcar como pagada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
