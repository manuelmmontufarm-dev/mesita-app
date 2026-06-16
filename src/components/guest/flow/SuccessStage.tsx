"use client";

/**
 * SuccessStage — end-of-flow "¡Cuenta completada!" screen.
 * Ported from `design_handoff_customer/customer/screens.jsx`.
 */

import type { useGuestPaymentFlow } from "@/hooks/useGuestPaymentFlow";
import type { RestaurantConfig } from "@/lib/guest-billing/types";

import { Ic, LogoMark } from "./_shared";
import { ReceiptDrawer } from "./ReceiptDrawer";

type Flow = ReturnType<typeof useGuestPaymentFlow>;

export interface SuccessStageProps {
  flow: Flow;
  config: RestaurantConfig;
}

export function SuccessStage({ flow, config }: SuccessStageProps) {
  const { state } = flow;
  return (
    <div
      className="cust-root cust-app"
      data-testid="guest-bill-flow"
      data-stage="success"
    >
      <div className="completed-wrap">
        <div className="state-wrap completed">
          <div className="ok-ring">
            <div className="disc">
              <svg
                viewBox="0 0 24 24"
                width="34"
                height="34"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 12.5l4.5 4.5L19 7.5"
                  stroke="#fff"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <div className="ok-title">¡Cuenta completada!</div>
          <div className="completed-sub">
            La mesa quedó pagada en su totalidad.
          </div>

          <div className="completed-brand">
            <LogoMark size={30} />
            <span>Gracias por visitar {config.name}</span>
          </div>

          <div className="completed-actions">
            <button
              className="completed-btn"
              data-testid="success-review-btn"
            >
              <Ic.star s={17} /> Déjanos una reseña
            </button>
            <button className="completed-btn" data-testid="success-ig-btn">
              <Ic.instagram s={17} /> Síguenos en Instagram
            </button>
          </div>

          <button
            className="btn-again"
            onClick={() =>
              flow.reset({ initialTip: 0, initialPeople: 1 })
            }
            data-testid="success-reset-btn"
          >
            <Ic.arrow s={16} /> Volver al inicio
          </button>
          <div style={{ height: 84, flex: "0 0 auto" }} aria-hidden="true" />
        </div>

        <ReceiptDrawer receipt={state.receipt} config={config} />
      </div>
    </div>
  );
}
