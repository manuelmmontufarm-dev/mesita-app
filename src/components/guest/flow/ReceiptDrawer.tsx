"use client";

/**
 * ReceiptDrawer — paper-receipt bottom drawer with peek/open states,
 * pointer-drag, and a one-time bounce-in per receipt.
 * Ported from `design_handoff_customer/customer/receipt.jsx`.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import type { Receipt } from "@/hooks/useGuestPaymentFlow";
import { fmt } from "@/lib/guest-billing/split-math";
import type { RestaurantConfig } from "@/lib/guest-billing/types";

import { Ic, LogoMark } from "./_shared";

/* Module-level so the bounce only plays once across waiting → success. */
let lastIntroRef: string | null = null;

export interface ReceiptDrawerProps {
  receipt: Receipt | null;
  config: RestaurantConfig;
  peekLabel?: string;
}

export function ReceiptDrawer({
  receipt,
  config,
  peekLabel = "Tu recibo",
}: ReceiptDrawerProps) {
  const r = receipt;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const perfRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startY: number;
    base: number;
    moved: number;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [pos, setPos] = useState<"peek" | "open">("peek");
  const [dragY, setDragY] = useState<number | null>(null);

  const introId = r?.ref ?? "x";
  const [intro, setIntro] = useState(introId !== lastIntroRef);

  useEffect(() => {
    if (introId === lastIntroRef) return;
    lastIntroRef = introId;
    const id = setTimeout(() => setIntro(false), 760);
    return () => clearTimeout(id);
  }, [introId]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const hd = perfRef.current;
    if (el && hd) el.style.setProperty("--peek", hd.offsetHeight + "px");
  });

  const peekPx = (): number => {
    const el = containerRef.current;
    const hd = perfRef.current;
    if (!el || !hd) return 0;
    return el.offsetHeight - hd.offsetHeight;
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startY: e.clientY,
      base: pos === "open" ? 0 : peekPx(),
      moved: 0,
      active: false,
    };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const max = peekPx();
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 5) d.active = true;
    d.moved = Math.abs(dy);
    if (d.active) setDragY(Math.max(0, Math.min(max, d.base + dy)));
  };
  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    const max = peekPx();
    if (d.active) {
      setPos((dragY ?? 0) < max / 2 ? "open" : "peek");
      suppressClick.current = true;
    }
    dragRef.current = null;
    setDragY(null);
  };
  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setPos((p) => (p === "open" ? "peek" : "open"));
  };

  const cls =
    "receipt-drawer" +
    (pos === "open" ? " open" : " peek") +
    (intro ? " intro" : "") +
    (dragY !== null ? " dragging" : "");
  const style =
    dragY !== null ? { transform: `translateY(${dragY}px)` } : undefined;

  if (!r) return null;

  const taxRows: { k: string; v: string }[] = [
    { k: "Subtotal", v: fmt(r.subtotal || 0) },
    ...(r.servicio > 0.001 ? [{ k: "Servicio", v: fmt(r.servicio) }] : []),
    ...(r.propina > 0.001 ? [{ k: "Propina", v: fmt(r.propina) }] : []),
    {
      k: `IVA ${Math.round((r.ivaRate || 0.15) * 100)}%`,
      v: fmt(r.iva || 0),
    },
  ];

  const items = r.items ?? [];

  return (
    <div
      ref={containerRef}
      className={cls}
      style={style}
      data-testid="receipt-drawer"
    >
      <div
        className="rcpt-perf"
        ref={perfRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onClick={onClick}
      >
        <div className="rcpt-tear" aria-hidden="true" />
        <div className="rcpt-peek">
          <div className="rcpt-grab" />
          <div className="rcpt-peek-row">
            <span className="rcpt-peek-l">
              <Ic.receipt s={16} /> {peekLabel}
            </span>
            <span className="rcpt-peek-amt">
              {fmt(r.amount || 0)} <Ic.chevron s={15} />
            </span>
          </div>
        </div>
      </div>

      <div className="rcpt-paper">
        <div className="rcpt-body">
          <div className="rcpt-brand">
            <LogoMark size={30} />
            <div className="rcpt-name">{config.name}</div>
            <div className="rcpt-tag">
              {config.tagline ? `${config.tagline} · ` : ""}
              {config.city ?? ""}
            </div>
          </div>

          <div className="rcpt-status">
            <span className="rcpt-status-dot" /> Pago aprobado
          </div>

          <div className="rcpt-amount">{fmt(r.amount || 0)}</div>
          <div className="rcpt-amount-l">Pagado por {r.name || "Invitado"}</div>

          {r.how && (
            <div className="rcpt-how">
              <Ic.split s={14} /> {r.how}
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="rcpt-hr dash" aria-hidden="true" />
              <div className="rcpt-items-h">Lo que pagaste</div>
              <div className="rcpt-rows">
                {items.map((it, i) => (
                  <div key={i} className="rcpt-row">
                    <span>
                      <span className="rcpt-e">{it.emoji}</span> {it.name}
                    </span>
                    <span className="rcpt-v">{fmt(it.amt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="rcpt-hr" aria-hidden="true" />

          <div className="rcpt-rows">
            {taxRows.map((row, i) => (
              <div key={i} className="rcpt-row muted">
                <span>{row.k}</span>
                <span className="rcpt-v">{row.v}</span>
              </div>
            ))}
            <div className="rcpt-row total">
              <span>Total</span>
              <span className="rcpt-v">{fmt(r.amount || 0)}</span>
            </div>
          </div>

          <div className="rcpt-hr dash" aria-hidden="true" />

          <div className="rcpt-meta">
            <div className="rm-row">
              <span>Mesa</span>
              <span>{config.table}</span>
            </div>
            <div className="rm-row">
              <span>Fecha</span>
              <span>{r.date || "—"}</span>
            </div>
            <div className="rm-row">
              <span>Método</span>
              <span>{r.methodLabel || "Tarjeta"}</span>
            </div>
            <div className="rm-row">
              <span>Referencia</span>
              <span className="mono">{r.ref || "—"}</span>
            </div>
            {r.eInvoice && (
              <div className="rm-row">
                <span>Factura</span>
                <span>{r.eInvoice.idNumber || "registrada"}</span>
              </div>
            )}
          </div>

          <button className="rcpt-pdf">
            <Ic.receipt s={16} /> Descargar PDF
          </button>
          <div className="rcpt-foot">Gracias por tu visita · MesitaQR</div>
        </div>
        <div className="rcpt-tear bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
