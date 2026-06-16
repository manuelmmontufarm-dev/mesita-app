'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface KushkiCheckoutProps {
  amount: number;
  currency?: string;
  onTokenReceived: (token: string) => void;
  onError: (error: string) => void;
  language: 'es' | 'en';
  isLoading?: boolean;
}

const translations = {
  es: {
    pay: 'Pagar',
    paying: 'Procesando...',
    cardRequired: 'Ingresa datos de tarjeta',
    error: 'Error al procesar pago. Intenta de nuevo.',
    applePay: 'Apple Pay',
    googlePay: 'Google Pay',
    or: 'o',
    loadingKushki: 'Cargando...',
  },
  en: {
    pay: 'Pay',
    paying: 'Processing...',
    cardRequired: 'Enter card details',
    error: 'Payment processing error. Try again.',
    applePay: 'Apple Pay',
    googlePay: 'Google Pay',
    or: 'or',
    loadingKushki: 'Loading...',
  },
};

// TypeScript augmentation for Kushki global
declare global {
  interface Window {
    Kushki?: {
      init: (config: { publicKey: string; locale: string }) => void;
      requestToken: () => Promise<{ token: string; deferred?: any }>;
      requestWalletPaymentAvailable: () => boolean;
    };
  }
}

export function KushkiCheckout({
  amount,
  currency = 'USD',
  onTokenReceived,
  onError,
  language,
  isLoading = false,
}: KushkiCheckoutProps) {
  const t = translations[language];
  const [isProcessing, setIsProcessing] = useState(false);
  const [kushkiReady, setKushkiReady] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const scriptLoadedRef = useRef(false);

  // Load Kushki.js script dynamically
  useEffect(() => {
    if (scriptLoadedRef.current) return;

    const publicKey = process.env.NEXT_PUBLIC_KUSHKI_PUBLIC_KEY;
    if (!publicKey) {
      onError('Kushki not configured');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.kushkipagos.com/kushki-hosted-fields.js';
    script.async = true;

    script.onload = () => {
      if (window.Kushki) {
        try {
          window.Kushki.init({
            publicKey,
            locale: language === 'es' ? 'es' : 'en',
          });
          setKushkiReady(true);
          scriptLoadedRef.current = true;

          // Check wallet availability
          const walletSupported =
            window.Kushki?.requestWalletPaymentAvailable?.() || false;
          setWalletAvailable(walletSupported);
        } catch (err) {
          onError(
            err instanceof Error ? err.message : 'Failed to initialize Kushki'
          );
        }
      }
    };

    script.onerror = () => {
      onError('Failed to load Kushki script');
    };

    document.body.appendChild(script);

    return () => {
      // Don't remove script; Kushki needs to persist
    };
  }, [language, onError]);

  const handlePayClick = async () => {
    if (!window.Kushki) {
      onError(t.cardRequired);
      return;
    }

    setIsProcessing(true);

    try {
      const result = await window.Kushki.requestToken();

      if (result?.token) {
        onTokenReceived(result.token);
      } else {
        onError(t.cardRequired);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Payment failed';
      onError(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!kushkiReady) {
    return (
      <div className="space-y-4 p-4 bg-zinc-50 rounded-lg text-center">
        <p className="text-zinc-600">{t.loadingKushki}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-zinc-900">
        {language === 'es' ? 'Datos de Tarjeta' : 'Card Details'}
      </h3>

      {/* Kushki Hosted Fields Container */}
      <div className="border border-zinc-300 rounded-lg p-4 bg-white space-y-4">
        {/* Card number field will be rendered by Kushki */}
        <div
          id="kushki-card-number"
          className="p-3 border border-zinc-200 rounded bg-white min-h-[48px] flex items-center text-zinc-600"
        >
          <span className="text-sm">
            {language === 'es' ? 'Número de Tarjeta' : 'Card Number'}
          </span>
        </div>

        {/* Expiry and CVV fields in a row */}
        <div className="grid grid-cols-2 gap-3">
          <div
            id="kushki-card-expiry"
            className="p-3 border border-zinc-200 rounded bg-white min-h-[48px] flex items-center text-zinc-600"
          >
            <span className="text-sm">
              {language === 'es' ? 'Vencimiento' : 'Expiry'}
            </span>
          </div>
          <div
            id="kushki-card-cvv"
            className="p-3 border border-zinc-200 rounded bg-white min-h-[48px] flex items-center text-zinc-600"
          >
            <span className="text-sm">CVV</span>
          </div>
        </div>
      </div>

      {/* Amount Display */}
      <div className="bg-zinc-50 p-4 rounded-lg">
        <p className="text-sm text-zinc-600">
          {language === 'es' ? 'Total a pagar:' : 'Total to pay:'}
        </p>
        <p className="text-2xl font-bold text-zinc-900">
          ${amount.toFixed(2)} {currency}
        </p>
      </div>

      {/* Wallet Payment Buttons (conditional) */}
      {walletAvailable && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={isProcessing || isLoading}
              className="w-full min-h-[48px] bg-black text-white hover:bg-zinc-800 font-semibold disabled:bg-zinc-300 disabled:text-zinc-600"
            >
              {t.applePay}
            </Button>
            <Button
              type="button"
              disabled={isProcessing || isLoading}
              className="w-full min-h-[48px] bg-white border-2 border-black text-black hover:bg-zinc-50 font-semibold disabled:bg-zinc-100 disabled:text-zinc-600 disabled:border-zinc-300"
            >
              {t.googlePay}
            </Button>
          </div>
          <p className="text-center text-sm text-zinc-600">{t.or}</p>
        </div>
      )}

      {/* Card Payment Button */}
      <Button
        onClick={handlePayClick}
        disabled={isProcessing || isLoading || !kushkiReady}
        className="w-full min-h-[48px] text-base font-semibold bg-zinc-900 text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-600 disabled:cursor-not-allowed"
      >
        {isProcessing || isLoading
          ? t.paying
          : `${t.pay} $${amount.toFixed(2)}`}
      </Button>
    </div>
  );
}
