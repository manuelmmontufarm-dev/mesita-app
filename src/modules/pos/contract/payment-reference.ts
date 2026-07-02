import { createHash } from "crypto";

/**
 * Contífico cobro `numero_comprobante` is varchar(15). Mesita payment ids are
 * 36-char UUIDs, so the wire reference is a deterministic derivation:
 * "MSTA" + first 11 uppercase hex chars of sha256(paymentId) → exactly 15.
 *
 * Deterministic ⇒ the same payment always produces the same reference, which
 * is what reconciliation matches on (contracts/contifico-v2/README.md §O7).
 * Collision odds at 11 hex chars (44 bits) are negligible at restaurant scale.
 *
 * The previous behavior (raw UUID into `lote`) violated both the documented
 * 16-char max and the documented POST param list — do not reintroduce it.
 */
export const NUMERO_COMPROBANTE_PREFIX = "MSTA";
export const NUMERO_COMPROBANTE_LENGTH = 15;

export function deriveNumeroComprobante(paymentId: string): string {
  if (!paymentId) throw new Error("paymentId is required to derive numero_comprobante");
  const digest = createHash("sha256").update(paymentId, "utf8").digest("hex");
  return `${NUMERO_COMPROBANTE_PREFIX}${digest.slice(0, 11).toUpperCase()}`;
}
