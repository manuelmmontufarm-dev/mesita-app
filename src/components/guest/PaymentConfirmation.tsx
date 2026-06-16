'use client';

import { useState } from 'react';
import { formatCurrency, formatDateTime } from '@/lib/format';

interface PaymentConfirmationProps {
  billTotal: number;
  restaurantName: string;
  rideUrl?: string;
  checkoutMode: 'CONSUMIDOR_FINAL' | 'FACTURA_CON_DATOS';
  guestEmail?: string;
  language: 'es' | 'en';
  /** Kushki/PagaYa payment id — shown truncated as proof of payment. */
  paymentId?: string;
  tableName?: string;
  /** When the payment was confirmed. Defaults to now. */
  paidAt?: Date | string;
}

const translations = {
  es: {
    success: '¡Pago exitoso!',
    totalPaid: 'Total pagado',
    facturaSoon: 'Tu comprobante será enviado pronto.',
    facturaEmail: 'Tu factura ha sido enviada a',
    downloadRide: 'Descargar comprobante',
    thankYou: 'Gracias por tu visita',
    close: 'Listo',
    reference: 'Referencia de pago',
    copy: 'Copiar',
    copied: '¡Copiado!',
    table: 'Mesa',
    dateTime: 'Fecha y hora',
  },
  en: {
    success: 'Payment successful!',
    totalPaid: 'Amount paid',
    facturaSoon: 'Your receipt will be sent shortly.',
    facturaEmail: 'Your invoice has been sent to',
    downloadRide: 'Download receipt',
    thankYou: 'Thank you for visiting',
    close: 'Done',
    reference: 'Payment reference',
    copy: 'Copy',
    copied: 'Copied!',
    table: 'Table',
    dateTime: 'Date & time',
  },
};

/** Last 10 chars of the payment id — enough to reference, short enough to read aloud. */
function shortReference(id: string): string {
  const clean = id.replace(/-/g, '');
  return clean.length > 10 ? `…${clean.slice(-10)}` : clean;
}

export function PaymentConfirmation({
  billTotal,
  restaurantName,
  rideUrl,
  checkoutMode,
  guestEmail,
  language,
  paymentId,
  tableName,
  paidAt,
}: PaymentConfirmationProps) {
  const t = translations[language];
  const [copied, setCopied] = useState(false);
  const paidAtDate = paidAt ?? new Date();

  const handleCopy = async () => {
    if (!paymentId) return;
    try {
      await navigator.clipboard.writeText(paymentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (old browser / non-secure context) — keep silent,
      // the full reference is still visible on screen.
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10 safe-area-top safe-area-bottom"
      style={{ background: 'var(--background)' }}
    >
      <div className="w-full max-w-sm space-y-5">

        {/* Checkmark */}
        <div className="flex justify-center">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'var(--emerald-soft)' }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              style={{ color: 'var(--emerald)' }}
            >
              <path
                d="M10 21L17 28L30 14"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink-800)' }}>
            {t.success}
          </h1>
          {restaurantName && (
            <p className="text-sm" style={{ color: 'var(--on-light-mut)' }}>
              {restaurantName}
              {tableName ? ` · ${t.table} ${tableName}` : ''}
            </p>
          )}
        </div>

        {/* Amount */}
        <div
          className="rounded-2xl px-6 py-5 text-center border"
          style={{ background: 'var(--surface)', borderColor: 'rgba(27,25,22,.08)' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--on-light-mut)' }}
          >
            {t.totalPaid}
          </p>
          <p className="text-5xl font-bold tabular-nums" style={{ color: 'var(--coral)' }}>
            {formatCurrency(billTotal)}
          </p>
        </div>

        {/* Proof of payment — reference + timestamp */}
        <div
          className="rounded-2xl border divide-y"
          style={{ background: 'var(--surface)', borderColor: 'rgba(27,25,22,.08)' }}
        >
          {paymentId && (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--on-light-mut)' }}>
                  {t.reference}
                </p>
                <p
                  className="text-sm font-semibold font-mono truncate"
                  style={{ color: 'var(--ink-800)' }}
                >
                  {shortReference(paymentId)}
                </p>
              </div>
              <button
                onClick={handleCopy}
                aria-label={t.copy}
                className="min-h-[44px] px-4 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors"
                style={
                  copied
                    ? { borderColor: 'var(--emerald)', color: 'var(--emerald)', background: 'rgba(47,179,126,.08)' }
                    : { borderColor: 'rgba(27,25,22,.15)', color: 'var(--ink-800)', background: 'transparent' }
                }
              >
                {copied ? t.copied : t.copy}
              </button>
            </div>
          )}
          <div className="px-4 py-3">
            <p className="text-xs" style={{ color: 'var(--on-light-mut)' }}>
              {t.dateTime}
            </p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink-800)' }}>
              {formatDateTime(paidAtDate)}
            </p>
          </div>
        </div>

        {/* Receipt / factura note */}
        <div
          className="rounded-xl px-4 py-3 text-sm text-center"
          style={{ background: 'rgba(47,179,126,.10)', color: '#1a6647' }}
        >
          {checkoutMode === 'FACTURA_CON_DATOS' && guestEmail ? (
            <>
              {t.facturaEmail}{' '}
              <span className="font-semibold">{guestEmail}</span>
            </>
          ) : (
            t.facturaSoon
          )}
        </div>

        {/* Thank you */}
        <p className="text-center text-sm font-medium" style={{ color: 'var(--on-light-mut)' }}>
          {t.thankYou}
        </p>

        {/* RIDE download */}
        {rideUrl && (
          <button
            onClick={() => window.open(rideUrl, '_blank')}
            className="w-full min-h-[52px] rounded-2xl text-sm font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-800)', background: 'var(--surface)' }}
          >
            {t.downloadRide}
          </button>
        )}

        {/* Close */}
        <button
          onClick={() => (window.location.href = '/')}
          className="w-full min-h-[52px] rounded-2xl text-sm font-semibold"
          style={{ background: 'var(--ink-900)', color: 'var(--on-dark)' }}
        >
          {t.close}
        </button>
      </div>
    </div>
  );
}
