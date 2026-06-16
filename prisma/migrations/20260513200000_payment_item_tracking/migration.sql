-- Add selectedItemIds and compradorData to payments for correct BY_ITEM marking and
-- single-source-of-truth factura comprador (FacturaJob now created only in webhook).

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "selectedItemIds" TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "compradorData"   JSONB;
