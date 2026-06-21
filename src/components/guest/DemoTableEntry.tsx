"use client";

import { Ic, LogoMark } from "@/components/guest/flow/_shared";

export interface DemoTableEntryProps {
  restaurantName: string;
  tagline: string;
  table: string;
  city: string;
  onEnter: () => void;
  entering?: boolean;
  error?: string | null;
}

export function DemoTableEntry({
  restaurantName,
  tagline,
  table,
  city,
  onEnter,
  entering = false,
  error = null,
}: DemoTableEntryProps) {
  return (
    <div className="cust-root cust-app demo-entry" data-testid="demo-table-entry">
      <div className="demo-entry-glow" aria-hidden="true" />

      <div className="demo-entry-scroll">
        <div className="demo-entry-inner">
          <header className="demo-entry-brand glassx">
            <LogoMark size={34} />
            <div>
              <div className="demo-entry-brand-name">MesitaQR</div>
              <div className="demo-entry-brand-sub">Paga en la mesa</div>
            </div>
          </header>

          <p className="demo-entry-eyebrow">Bienvenidos</p>
          <h1 className="demo-entry-title">
            Paga tu parte con{" "}
            <span className="demo-entry-accent">MesitaQR</span>
          </h1>
          <p className="demo-entry-lede">
            Divide la cuenta, elige lo tuyo y paga desde el celular — sin filas ni
            esperar al mesero.
          </p>

          <div className="demo-entry-venue surfx">
            <div className="demo-entry-venue-label">Estás en</div>
            <div className="demo-entry-venue-name">{restaurantName}</div>
            <div className="demo-entry-venue-sub">
              {tagline} · {city}
            </div>
            <div className="demo-entry-mesa-pill glassx">
              <span className="demo-entry-mesa-icon" aria-hidden="true">
                🍽️
              </span>
              <span className="demo-entry-mesa-text">Mesa {table}</span>
            </div>
          </div>

          <ul className="demo-entry-perks">
            <li>
              <Ic.split s={16} /> Divide por plato o partes iguales
            </li>
            <li>
              <Ic.shield s={16} /> Pago seguro · factura automática
            </li>
            <li>
              <Ic.users s={16} /> Varios comensales, una sola cuenta
            </li>
          </ul>

          <p className="demo-entry-note">
            Toca <strong>Entrar</strong> solo si estás sentado en esta mesa. Así cada
            quien paga lo suyo — nadie entra por accidente al abrir el link.
          </p>
        </div>
      </div>

      <div className="demo-entry-foot glassx">
        <button
          type="button"
          className="c-pay-btn demo-entry-cta"
          onClick={onEnter}
          disabled={entering}
          data-testid="demo-enter-table-btn"
        >
          {entering ? (
            "Entrando a la mesa…"
          ) : (
            <>
              <Ic.lock s={18} /> Entrar a la mesa {table}
            </>
          )}
        </button>

        {error ? (
          <p className="demo-entry-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
