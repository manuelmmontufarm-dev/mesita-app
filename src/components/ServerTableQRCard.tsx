'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { generateQRDataUrl } from '@/lib/qr-utils';

interface ServerTableQRCardProps {
  tableToken: string;
  tableName: string;
}

export function ServerTableQRCard({ tableToken, tableName }: ServerTableQRCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const paymentUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${tableToken}`;

  useEffect(() => {
    const generateQR = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const dataUrl = await generateQRDataUrl(paymentUrl);
        setQrDataUrl(dataUrl);
      } catch (err) {
        setError('No se pudo generar el código QR');
        console.error('Error generating QR:', err);
      } finally {
        setIsLoading(false);
      }
    };

    generateQR();
  }, [paymentUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('No se pudo copiar el enlace');
    }
  };

  return (
    <Card className="p-6 border border-border">
      <div className="space-y-4">
        {/* Title */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">Código QR - {tableName}</p>
          <p className="text-xs text-muted-foreground">Muestra este código al cliente para pagar</p>
        </div>

        {/* QR Container */}
        <div className="flex justify-center py-4 bg-surface rounded-lg border border-border">
          {isLoading && (
            <div className="flex items-center justify-center w-64 h-64">
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: 'var(--ink-700)', borderTopColor: 'transparent' }} />
            </div>
          )}

          {error && !isLoading && (
            <div className="flex items-center justify-center w-64 h-64">
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}

          {qrDataUrl && !isLoading && (
            <img
              src={qrDataUrl}
              alt={`QR para pagar Mesa ${tableName}`}
              className="w-64 h-64 rounded"
            />
          )}
        </div>

        {/* Payment URL Display */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Enlace de pago</p>
          <div className="flex gap-2 items-stretch">
            <input
              type="text"
              value={paymentUrl}
              readOnly
              className="flex-1 px-3 py-2 text-xs bg-muted text-foreground rounded-md border border-border font-mono truncate"
            />
            <Button
              onClick={handleCopyUrl}
              size="sm"
              variant="outline"
              className="h-auto"
            >
              {copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Instruction */}
        <div className="bg-primary/10 rounded-md p-3 border border-primary/20">
          <p className="text-xs text-foreground leading-relaxed">
            <strong>Escanear para pagar:</strong> El cliente escanea el código QR con su teléfono para acceder a la cuenta y pagar directamente.
          </p>
        </div>
      </div>
    </Card>
  );
}
