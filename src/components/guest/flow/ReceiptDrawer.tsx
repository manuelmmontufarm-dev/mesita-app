"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Receipt, receiptsTotal } from "@/hooks/useGuestPaymentFlow";
import { measureReceiptPeekBottomOffset } from "@/lib/guest-billing/bill-shell-scroll";
import { downloadReceiptPdf } from "@/lib/guest-billing/receipt-pdf";
import { fmt, guestLabel } from "@/lib/guest-billing/split-math";
import type { RestaurantConfig } from "@/lib/guest-billing/types";
import { Ic, LogoMark } from "./_shared";

let lastIntroRef: string | null = null;

export interface ReceiptDrawerProps {
  receipts: Receipt[];
  config: RestaurantConfig;
  peekLabel?: string;
  /** When true the bill is fully settled — show "Mesa cerrada" stamp. */
  tableClosed?: boolean;
}

function ReceiptSection({ receipt, config, index, total }: {
  receipt: Receipt; config: RestaurantConfig; index: number; total: number;
}) {
  const taxRows = [
    { k: "Subtotal", v: fmt(receipt.subtotal || 0) },
    ...(receipt.servicio > 0.001 ? [{ k: "Servicio", v: fmt(receipt.servicio) }] : []),
    ...(receipt.propina > 0.001 ? [{ k: "Propina", v: fmt(receipt.propina) }] : []),
    { k: `IVA ${Math.round((receipt.ivaRate || 0.15) * 100)}%`, v: fmt(receipt.iva || 0) },
  ];
  const items = receipt.items ?? [];
  return (
    <section className="rcpt-payment-block" data-testid={`receipt-payment-${index}`}>
      <div className="rcpt-payment-head">
        <span className="rcpt-payment-num">
          Pago {index + 1}
          {total > 1 ? ` de ${total}` : ""}
        </span>
        <span className="rcpt-payment-date">{receipt.date || "—"}</span>
      </div>
      <div className="rcpt-amount">{fmt(receipt.amount || 0)}</div>
      <div className="rcpt-amount-l">Pagado por {receipt.name?.trim() || guestLabel(1)}</div>
      {receipt.how && <div className="rcpt-how"><Ic.split s={14} /> {receipt.how}</div>}
      {items.length > 0 && (
        <>
          <div className="rcpt-hr dash" aria-hidden="true" />
          <div className="rcpt-items-h">Lo que pagaste</div>
          <div className="rcpt-rows">
            {items.map((it, i) => (
              <div key={i} className="rcpt-row">
                <span><span className="rcpt-e">{it.emoji}</span> {it.name}</span>
                <span className="rcpt-v">{fmt(it.amt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="rcpt-hr" aria-hidden="true" />
      <div className="rcpt-rows">
        {taxRows.map((row, i) => (
          <div key={i} className="rcpt-row muted"><span>{row.k}</span><span className="rcpt-v">{row.v}</span></div>
        ))}
        <div className="rcpt-row total"><span>Total</span><span className="rcpt-v">{fmt(receipt.amount || 0)}</span></div>
      </div>
      <div className="rcpt-hr dash" aria-hidden="true" />
      <div className="rcpt-meta">
        <div className="rm-row"><span>Mesa</span><span>{config.table}</span></div>
        <div className="rm-row"><span>Fecha</span><span>{receipt.date || "—"}</span></div>
        <div className="rm-row"><span>Método</span><span>{receipt.methodLabel || "Tarjeta"}</span></div>
        <div className="rm-row"><span>Referencia</span><span className="mono">{receipt.ref || "—"}</span></div>
      </div>
      <button type="button" className="rcpt-pdf" onClick={() => downloadReceiptPdf(receipt, config)} data-testid={`receipt-pdf-${index}`}>
        <Ic.receipt s={16} /> Descargar PDF
      </button>
    </section>
  );
}

export function ReceiptDrawer({
  receipts,
  config,
  peekLabel = "Tu recibo",
  tableClosed = false,
}: ReceiptDrawerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const perfRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; base: number; moved: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [pos, setPos] = useState<"peek" | "open">("peek");
  const [dragY, setDragY] = useState<number | null>(null);
  const count = receipts.length;
  const totalAmt = receiptsTotal(receipts);
  const introId = receipts.map((r) => r.ref).join("|");
  const [intro, setIntro] = useState(introId !== lastIntroRef);

  useEffect(() => {
    if (introId === lastIntroRef) return;
    lastIntroRef = introId;
    const id = setTimeout(() => setIntro(false), 760);
    return () => clearTimeout(id);
  }, [introId]);

  useEffect(() => {
    document.documentElement.classList.toggle("has-receipt-open", pos === "open");
    return () => document.documentElement.classList.remove("has-receipt-open");
  }, [pos]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    const hd = perfRef.current;
    const root = document.documentElement;
    if (!el || !hd) return;

    const syncPeekVars = () => {
      if (!perfRef.current || !containerRef.current) return;
      const header = perfRef.current;
      const headerH = Math.ceil(header.getBoundingClientRect().height);
      const peekForDrawer = `${headerH}px`;
      containerRef.current.style.setProperty("--peek", peekForDrawer);
      const bottomOffset = measureReceiptPeekBottomOffset(header);
      if (bottomOffset != null) {
        root.style.setProperty("--receipt-peek", `${bottomOffset}px`);
      }
    };

    syncPeekVars();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncPeekVars())
        : null;
    ro?.observe(hd);
    window.addEventListener("resize", syncPeekVars);
    window.visualViewport?.addEventListener("resize", syncPeekVars);
    window.visualViewport?.addEventListener("scroll", syncPeekVars);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncPeekVars);
      window.visualViewport?.removeEventListener("resize", syncPeekVars);
      window.visualViewport?.removeEventListener("scroll", syncPeekVars);
      root.style.removeProperty("--receipt-peek");
    };
  }, [count, pos, totalAmt]);

  const peekPx = () => {
    const el = containerRef.current;
    const hd = perfRef.current;
    if (!el || !hd) return 0;
    return el.offsetHeight - hd.offsetHeight;
  };

  if (count === 0) return null;

  const paymentsLabel = count === 1 ? "1 pago" : `${count} pagos`;
  const cls = "receipt-drawer" + (pos === "open" ? " open" : " peek") + (intro ? " intro" : "") + (dragY !== null ? " dragging" : "");
  const style = dragY !== null ? { transform: `translateY(${dragY}px)` } : undefined;

  return (
    <div ref={containerRef} className={cls} style={style} data-testid="receipt-drawer">
      <div className="rcpt-perf" ref={perfRef}
        onPointerDown={(e) => { dragRef.current = { startY: e.clientY, base: pos === "open" ? 0 : peekPx(), moved: 0, active: false }; }}
        onPointerMove={(e) => {
          const d = dragRef.current; if (!d) return;
          const dy = e.clientY - d.startY;
          if (Math.abs(dy) > 5) d.active = true;
          if (d.active) setDragY(Math.max(0, Math.min(peekPx(), d.base + dy)));
        }}
        onPointerUp={() => {
          const d = dragRef.current; if (!d) return;
          if (d.active) { setPos((dragY ?? 0) < peekPx() / 2 ? "open" : "peek"); suppressClick.current = true; }
          dragRef.current = null; setDragY(null);
        }}
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setPos((p) => (p === "open" ? "peek" : "open")); }}
      >
        <div className="rcpt-tear" aria-hidden="true" />
        <div className="rcpt-peek">
          <div className="rcpt-grab" />
          <div className="rcpt-peek-row">
            <span className="rcpt-peek-l">
              <Ic.receipt s={16} /> {peekLabel}
              {tableClosed && (
                <span className="rcpt-table-closed-chip" data-testid="receipt-table-closed-chip">
                  Mesa cerrada
                </span>
              )}
            </span>
            <span className="rcpt-peek-amt">
              <span className="rcpt-peek-badge">{paymentsLabel}</span>
              {fmt(totalAmt)} <Ic.chevron s={15} />
            </span>
          </div>
          {pos === "open" && count > 0 && (
            <div className="rcpt-peek-payments" data-testid="receipt-peek-payments">
              {receipts.map((r, i) => (
                <span key={r.ref} className="rcpt-peek-pay-chip">
                  Pago {i + 1} · {fmt(r.amount)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="rcpt-paper">
        <div className="rcpt-body">
          <div className="rcpt-brand">
            <LogoMark size={30} />
            <div className="rcpt-name">{config.name}</div>
            <div className="rcpt-tag">{(config.tagline ? config.tagline + " · " : "") + (config.city ?? "")}</div>
          </div>
          <div className="rcpt-header-row">
            <div className="rcpt-status"><span className="rcpt-status-dot" /> Pago aprobado</div>
            <span className="rcpt-proof-pill">Usar como comprobante de pago</span>
          </div>
          {tableClosed && (
            <div className="rcpt-stamp" data-testid="receipt-table-closed-stamp" aria-label="Mesa cerrada — toda la cuenta fue pagada">
              <span className="rcpt-stamp-border">
                <span className="rcpt-stamp-title">Mesa cerrada</span>
                <span className="rcpt-stamp-sub">Toda la cuenta pagada</span>
              </span>
            </div>
          )}
          {count > 1 && (
            <button type="button" className="rcpt-pdf rcpt-pdf-all" data-testid="receipt-pdf-all"
              onClick={() => receipts.forEach((r, i) => setTimeout(() => downloadReceiptPdf(r, config), i * 350))}>
              <Ic.receipt s={16} /> Descargar todo ({count})
            </button>
          )}
          {receipts.map((r, i) => <ReceiptSection key={r.ref} receipt={r} config={config} index={i} total={count} />)}
          <div className="rcpt-foot">Gracias por tu visita · MesitaQR</div>
        </div>
        <div className="rcpt-tear bottom" aria-hidden="true" />
      </div>
    </div>
  );
}
