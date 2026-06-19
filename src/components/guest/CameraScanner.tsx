'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, CreditCard, Keyboard, ScanLine, X } from 'lucide-react';

export interface CameraCardData {
  number: string;
  expiryMonth: string;
  expiryYear: string;
  cvv?: string;
  name?: string;
}

interface CameraScannerProps {
  isOpen: boolean;
  onCardDetected: (card: CameraCardData) => void;
  onManualEntry?: (card: CameraCardData) => void;
  onClose: () => void;
  language: 'es' | 'en';
  allowManual?: boolean;
}

const labels = {
  es: {
    title: 'Escanear tarjeta',
    subtitle: 'Centra la tarjeta dentro del marco.',
    cameraDenied: 'No pudimos abrir la cámara. Puedes ingresar los datos manualmente.',
    demoDetect: 'Usar deteccion demo',
    manual: 'Manual',
    scan: 'Cámara',
    cardNumber: 'Número de tarjeta',
    expiry: 'MM/AA',
    cvv: 'CVV',
    name: 'Nombre en la tarjeta',
    save: 'Usar tarjeta',
    close: 'Cerrar',
  },
  en: {
    title: 'Scan card',
    subtitle: 'Center the card inside the frame.',
    cameraDenied: 'We could not open the camera. You can enter the card manually.',
    demoDetect: 'Use demo detection',
    manual: 'Manual',
    scan: 'Camera',
    cardNumber: 'Card number',
    expiry: 'MM/YY',
    cvv: 'CVV',
    name: 'Name on card',
    save: 'Use card',
    close: 'Close',
  },
};

export function CameraScanner({
  isOpen,
  onCardDetected,
  onManualEntry,
  onClose,
  language,
  allowManual = false,
}: CameraScannerProps) {
  const t = labels[language];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualNumber, setManualNumber] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');
  const [manualCvv, setManualCvv] = useState('');
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    if (!isOpen || mode !== 'scan') return;

    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraError(null);
      } catch {
        setCameraError(t.cameraDenied);
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [isOpen, mode, t.cameraDenied]);

  if (!isOpen) return null;

  const submitManual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const [expiryMonth = '', expiryYear = ''] = manualExpiry.split('/').map(part => part.trim());
    onManualEntry?.({
      number: manualNumber.replace(/\s+/g, ''),
      expiryMonth,
      expiryYear,
      cvv: manualCvv,
      name: manualName,
    });
    onClose();
  };

  const useDemoDetection = () => {
    onCardDetected({
      number: '4242424242424242',
      expiryMonth: '12',
      expiryYear: '30',
      cvv: '123',
      name: 'Demo Mesita',
    });
    onClose();
  };

  return (
    <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label={t.title}>
      <button className="scanner-scrim" aria-label={t.close} onClick={onClose} />
      <section className="scanner-sheet">
        <div className="scanner-head">
          <div>
            <p>{t.title}</p>
            <span>{mode === 'scan' ? t.subtitle : t.cameraDenied}</span>
          </div>
          <button className="scanner-icon-btn" aria-label={t.close} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {allowManual && (
          <div className="scanner-tabs">
            <button className={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')} type="button">
              <Camera size={17} />{t.scan}
            </button>
            <button className={mode === 'manual' ? 'on' : ''} onClick={() => setMode('manual')} type="button">
              <Keyboard size={17} />{t.manual}
            </button>
          </div>
        )}

        {mode === 'scan' || !allowManual ? (
          <div className="scanner-camera">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="scanner-frame">
              <ScanLine size={28} />
            </div>
            {cameraError && <p className="scanner-error">{cameraError}</p>}
            <button className="scanner-primary" type="button" onClick={useDemoDetection}>
              <CreditCard size={18} />
              {t.demoDetect}
            </button>
          </div>
        ) : (
          <form className="scanner-form" onSubmit={submitManual}>
            <label>
              <span>{t.cardNumber}</span>
              <input
                value={manualNumber}
                onChange={event => setManualNumber(event.target.value)}
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="4242 4242 4242 4242"
                required
              />
            </label>
            <div className="scanner-form-grid">
              <label>
                <span>{t.expiry}</span>
                <input
                  value={manualExpiry}
                  onChange={event => setManualExpiry(event.target.value)}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="12/30"
                  required
                />
              </label>
              <label>
                <span>{t.cvv}</span>
                <input
                  value={manualCvv}
                  onChange={event => setManualCvv(event.target.value)}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="123"
                />
              </label>
            </div>
            <label>
              <span>{t.name}</span>
              <input
                value={manualName}
                onChange={event => setManualName(event.target.value)}
                autoComplete="cc-name"
                placeholder="Maria Perez"
              />
            </label>
            <button className="scanner-primary" type="submit">
              <CreditCard size={18} />
              {t.save}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
