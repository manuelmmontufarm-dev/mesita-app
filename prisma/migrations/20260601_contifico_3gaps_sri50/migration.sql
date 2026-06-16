-- Phase 6.5: Close 3 Contifico gaps + SRI $50 rule (Option B: partial cobros)
-- All new columns are nullable / defaulted — safe for existing rows (D-13).
-- prisma migrate deploy only — NEVER migrate dev.

-- Gap #1: Per-restaurant Contífico `tipo_pago` (default preserves current "TARJETA" behavior;
-- operations switch to the Kushki-specific value via UPDATE once Contifico confirms it).
ALTER TABLE "restaurants"
  ADD COLUMN "posPaymentMethod" TEXT DEFAULT 'TARJETA';

-- SRI $50 rule: first Payment with valid guestData becomes the factura recipient on the Bill.
ALTER TABLE "bills"
  ADD COLUMN "invoiceRecipientPaymentId" TEXT;

-- Gap #2: Snapshot guest invoicing data on the Payment so the recipient survives later joins.
ALTER TABLE "payments"
  ADD COLUMN "guestIdentificacion" TEXT,
  ADD COLUMN "guestEmail" TEXT,
  ADD COLUMN "guestNombre" TEXT,
  ADD COLUMN "guestTipo" TEXT;
