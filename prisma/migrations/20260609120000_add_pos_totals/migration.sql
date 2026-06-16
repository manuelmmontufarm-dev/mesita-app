-- Persist POS-authoritative totals (D-07) mirrored verbatim from the POS document at ingestion.
-- Contifico only converts PRE -> FAC when cobros sum EXACTLY to the document total, so payment
-- math must use these columns (when non-null) instead of recomputing via TAX_MULTIPLIER.
ALTER TABLE "bills"
  ADD COLUMN IF NOT EXISTS "posSubtotal" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "posIva" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "posPropina" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "posTotal" DECIMAL(10,2);
