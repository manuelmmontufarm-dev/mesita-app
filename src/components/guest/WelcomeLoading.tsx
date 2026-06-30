"use client";

import { LogoMark } from "@/components/guest/flow/_shared";

export interface WelcomeLoadingProps {
  restaurantName: string;
  table: string;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Pantalla de bienvenida para mesas POS-linked (1–4) — sin lobby manual.
 * Muestra "Bienvenido a Mesita" mientras se entra automáticamente a la mesa.
 */
export function WelcomeLoading({
  restaurantName,
  table,
  error = null,
  onRetry,
}: WelcomeLoadingProps) {
  return (
    <div
      className="cust-root cust-app demo-entry"
      data-testid="welcome-loading"
    >
      <div className="demo-entry-glow" aria-hidden="true" />
      <div className="welcome-loading">
        <header className="demo-entry-brand glassx">
          <LogoMark size={34} />
          <div>
            <div className="demo-entry-brand-name">MesitaQR</div>
            <div className="demo-entry-brand-sub">Paga en la mesa</div>
          </div>
        </header>

        <div className="welcome-loading-body">
          {error ? (
            <>
              <div className="welcome-loading-emoji" aria-hidden="true">
                😕
              </div>
              <h1 className="welcome-loading-title">No pudimos entrar a la mesa</h1>
              <p className="welcome-loading-sub">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  className="welcome-loading-retry"
                  onClick={onRetry}
                >
                  Reintentar
                </button>
              )}
            </>
          ) : (
            <>
              <div className="c-load-spinner welcome-spinner" aria-hidden="true" />
              <h1 className="welcome-loading-title">Bienvenido a Mesita</h1>
              <p className="welcome-loading-sub">
                Cargando tu cuenta en {restaurantName} · Mesa {table}…
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
