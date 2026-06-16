-- Phase 6: POS Integration schema foundation
-- Adds POS config to Restaurant, posExternalId to Table,
-- posDocumentId to Bill, and POS value to InvoiceMode enum.
-- All new columns are nullable/defaulted — safe for existing rows (D-13).

-- Restaurant: POS credentials + config
ALTER TABLE "restaurants"
  ADD COLUMN "posProvider"    TEXT,
  ADD COLUMN "posApiKeyEnc"   TEXT,
  ADD COLUMN "posEnvironment" TEXT NOT NULL DEFAULT 'SANDBOX',
  ADD COLUMN "posTableField"  TEXT;

-- Table: POS table identifier for ingestion mapping
ALTER TABLE "tables"
  ADD COLUMN "posExternalId" TEXT;

CREATE INDEX "tables_restaurantId_posExternalId_idx"
  ON "tables"("restaurantId", "posExternalId");

-- Bill: POS source document id (unique for idempotent ingestion)
ALTER TABLE "bills"
  ADD COLUMN "posDocumentId" TEXT;

CREATE UNIQUE INDEX "bills_posDocumentId_key"
  ON "bills"("posDocumentId");

-- InvoiceMode enum: add POS value
ALTER TYPE "InvoiceMode" ADD VALUE IF NOT EXISTS 'POS';
