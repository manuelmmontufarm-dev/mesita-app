'use client';

import { useMemo, useState } from 'react';
import { Check, Download, Mail, Share2, X } from 'lucide-react';
import { formatCurrency, formatDateTime } from '@/lib/format';

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  restaurantName: string;
  tableNumber: string;
  guestName: string;
  guestIdentifier: string;
  itemsOrAmount: { items: ReceiptItem[] } | { amount: number; people: number };
  subtotal: number;
  ivaAmount: number;
  mandatoryPropina: number;
  voluntaryTip: number;
  totalPaid: number;
  paymentMethod: string;
  referenceNumber: string;
  timestamp: Date;
  paymentMode: 'BY_ITEM' | 'EQUAL' | 'FULL';
}

interface ReceiptDrawerProps {
  receipt: ReceiptData;
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiptDrawer({ receipt, isOpen, onClose }: ReceiptDrawerProps) {
  const [dragStart, setDragStart] = useState<number | null>(null);
  const shortGuestId = useMemo(
    () => receipt.guestIdentifier.slice(0, 8).toUpperCase(),
    [receipt.guestIdentifier]
  );

  if (!isOpen) return null;

  const handleAction = (action: string) => {
    console.log(`Receipt ${action} requested`, receipt);
  };

  return (
    <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Recibo de pago">
      <button className="receipt-scrim" aria-label="Cerrar recibo" onClick={onClose} />
      <section
        className="receipt-drawer"
        onPointerDown={event => setDragStart(event.clientY)}
        onPointerUp={event => {
          if (dragStart === null) return;
          const delta = event.clientY - dragStart;
          setDragStart(null);
          if (delta > 120 || delta < -100) onClose();
        }}
      >
        <div className="receipt-grabber" />
        <div className="receipt-head">
          <div className="receipt-ok">
            <Check size={26} strokeWidth={2.6} />
          </div>
          <button className="receipt-icon-btn" aria-label="Cerrar recibo" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="receipt-title-block">
          <p className="receipt-kicker">Pago recibido</p>
          <h2>{formatCurrency(receipt.totalPaid)}</h2>
          <p>{receipt.restaurantName}{receipt.tableNumber ? ` · Mesa ${receipt.tableNumber}` : ''}</p>
        </div>

        <div className="receipt-paper">
          <div className="receipt-row">
            <span>Persona</span>
            <strong>{receipt.guestName || shortGuestId}</strong>
          </div>
          <div className="receipt-row">
            <span>Fecha</span>
            <strong>{formatDateTime(receipt.timestamp)}</strong>
          </div>
          <div className="receipt-row">
            <span>Metodo</span>
            <strong>{receipt.paymentMethod}</strong>
          </div>
          <div className="receipt-row">
            <span>Referencia</span>
            <strong>{receipt.referenceNumber}</strong>
          </div>

          <div className="receipt-divider" />

          {'items' in receipt.itemsOrAmount ? (
            <div className="receipt-items">
              {receipt.itemsOrAmount.items.map((item, index) => (
                <div className="receipt-item" key={`${item.name}-${index}`}>
                  <span>{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}</span>
                  <strong>{formatCurrency(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="receipt-row">
              <span>{receipt.paymentMode === 'EQUAL' ? `Parte de ${receipt.itemsOrAmount.people}` : 'Monto pagado'}</span>
              <strong>{formatCurrency(receipt.itemsOrAmount.amount)}</strong>
            </div>
          )}

          <div className="receipt-divider" />

          <div className="receipt-row">
            <span>Subtotal</span>
            <strong>{formatCurrency(receipt.subtotal)}</strong>
          </div>
          <div className="receipt-row">
            <span>IVA</span>
            <strong>{formatCurrency(receipt.ivaAmount)}</strong>
          </div>
          <div className="receipt-row">
            <span>Propina 10%</span>
            <strong>{formatCurrency(receipt.mandatoryPropina)}</strong>
          </div>
          {receipt.voluntaryTip > 0 && (
            <div className="receipt-row">
              <span>Propina voluntaria</span>
              <strong>{formatCurrency(receipt.voluntaryTip)}</strong>
            </div>
          )}
          <div className="receipt-total">
            <span>Total pagado</span>
            <strong>{formatCurrency(receipt.totalPaid)}</strong>
          </div>
        </div>

        <div className="receipt-actions">
          <button type="button" onClick={() => handleAction('email')}>
            <Mail size={18} />
            Email
          </button>
          <button type="button" onClick={() => handleAction('download')}>
            <Download size={18} />
            PDF
          </button>
          <button type="button" onClick={() => handleAction('share')}>
            <Share2 size={18} />
            Compartir
          </button>
        </div>
      </section>
    </div>
  );
}
