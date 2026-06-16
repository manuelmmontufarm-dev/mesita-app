/**
 * PractisisAdapter — stub implementation of PosPort.
 *
 * The Practisis API is documented at https://www.practisisdora.com/developer/
 * Single endpoint: GET http://practisis.net/apis/practipos/api.php
 * Params: key (API KEY), action=get, typedata, data={"desde":"dd/mm/yyyy","hasta":"dd/mm/yyyy"}
 * Auth: API key in query string. No webhooks. No HTTPS on the data endpoint.
 *
 * TODO (4 blockers to resolve with Practisis before any live integration):
 *  1. Table/mesa identifier on open dine-in documents — no `typedata` exposes it.
 *  2. Open-vs-closed bill state — `consumos` has no state field; `saldos` only covers already-issued facturas.
 *  3. Line items grouped by an open dine-in check — `consumos` has unclear grouping (sample id:"1" for all rows).
 *  4. Payment write-back endpoint — POST actions are crear facturas/productos/clientes/compras only; no register-cobro.
 *
 * Until these are resolved with Practisis directly, this adapter documents the contract gap.
 * MVP launches on Contífico only. Do NOT wire this into the ingestion cron (06-03).
 */

import type {
  PosPort,
  PosCapabilities,
  POSPulledOrder,
  POSConfirmPaymentParams,
  POSConfirmPaymentResult,
} from "../domain/pos.port";

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`PractisisAdapter.${method}: not implemented — see blockers in practisis.adapter.ts`);
    this.name = "NotImplementedError";
  }
}

export class PractisisAdapter implements PosPort {
  capabilities(): PosCapabilities {
    return {
      supportsWebhooks: false,
      supportsPolling: false,  // API shape insufficient for Camino A; see blockers above
      supportsPartialPayments: false,
      supportsCloseBill: false,
      supportsMenuSync: false,
    };
  }

  pullOrders(): Promise<POSPulledOrder[]> {
    throw new NotImplementedError("pullOrders");
  }

  confirmPayment(_params: POSConfirmPaymentParams): Promise<POSConfirmPaymentResult> {
    throw new NotImplementedError("confirmPayment");
  }

  ping(): Promise<boolean> {
    throw new NotImplementedError("ping");
  }
}
