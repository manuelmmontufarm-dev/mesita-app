"use client";

import { useEffect, useRef, useState } from "react";

import { LogoMark } from "@/components/guest/flow/_shared";
import {
  DEMO_PAY_URL,
  generateBrandedQRToCanvas,
} from "@/lib/qr-utils";

export function DemoQRPoster() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    void (async () => {
      try {
        await generateBrandedQRToCanvas(canvas, DEMO_PAY_URL, { width: 640 });
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("No se pudo generar el QR");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "mesita-demo-pay-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="demo-qr-page">
      <div className="demo-qr-card">
        <div className="demo-qr-head">
          <LogoMark size={36} />
          <div>
            <p className="demo-qr-eyebrow">Demo en vivo</p>
            <h1 className="demo-qr-title">La Doña Pepa · Mesa 12</h1>
          </div>
        </div>

        <p className="demo-qr-lede">
          Escanea para probar el pago compartido en MesitaQR — varios celulares,
          una sola mesa.
        </p>

        <div className="demo-qr-frame" aria-busy={!ready}>
          <canvas
            ref={canvasRef}
            className="demo-qr-canvas"
            width={640}
            height={640}
            aria-label={`Código QR para ${DEMO_PAY_URL}`}
          />
          {!ready && !error && <div className="demo-qr-loading">Generando QR…</div>}
          {error && <div className="demo-qr-error">{error}</div>}
        </div>

        <p className="demo-qr-url">{DEMO_PAY_URL}</p>

        <div className="demo-qr-actions">
          <button
            type="button"
            className="demo-qr-btn demo-qr-btn-primary"
            disabled={!ready}
            onClick={downloadPng}
          >
            Descargar PNG
          </button>
          <a className="demo-qr-btn" href={DEMO_PAY_URL}>
            Abrir demo
          </a>
        </div>

        <p className="demo-qr-foot">
          Imprime en A6 o comparte el PNG en WhatsApp. Funciona mejor con 2–3
          dispositivos.
        </p>
      </div>
    </div>
  );
}
