/**
 * Payment-layer errors raised by `processPayment` and translated to HTTP codes by the
 * `/api/bills/[billId]/pay` route.
 *
 * Each error class has a stable `name` so the route can branch on `error.name` without
 * relying on `instanceof` (which is brittle across module boundaries / hot-reload).
 */

/** Bill no longer exists in the POS (deleted/voided server-side). HTTP 409. */
export class BillUnavailableError extends Error {
  constructor(message = "La cuenta ya no está disponible en el POS.") {
    super(message);
    this.name = "BillUnavailableError";
  }
}

/** Bill is closed/paid in the POS (waiter closed it after we read it). HTTP 409. */
export class BillAlreadyClosedError extends Error {
  constructor(
    message = "El mesero acaba de cerrar esta cuenta en el sistema. No se realizó ningún cargo."
  ) {
    super(message);
    this.name = "BillAlreadyClosedError";
  }
}

/**
 * The idempotency key was already used for a payment on a DIFFERENT bill.
 * Replaying the same key against another bill is a client bug or a tampering
 * attempt — never silently return the other bill's payment. HTTP 409.
 */
export class IdempotencyConflictError extends Error {
  constructor(
    message = "Esta solicitud de pago ya fue utilizada para otra cuenta. Recarga la página e intenta de nuevo."
  ) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

/**
 * SRI $50 rule: when a bill total > $50, at least one payer must provide cédula/RUC + email.
 * If the last split would close the bill with no recipient set and this split is CONSUMIDOR_FINAL,
 * we refuse with HTTP 422. The frontend should also enforce this visually before the last split.
 */
export class InvoiceDataRequiredError extends Error {
  constructor(
    message = "Por ley ecuatoriana esta cuenta de más de $50 requiere los datos de facturación de al menos una persona (cédula/RUC y email)."
  ) {
    super(message);
    this.name = "InvoiceDataRequiredError";
  }
}
