-- Migration: Add InvoiceMode enum and invoiceMode field to restaurants
-- Additive only — defaults to DISABLED, existing behavior unchanged.

CREATE TYPE "InvoiceMode" AS ENUM ('DISABLED', 'DATIL', 'MANUAL');

ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "invoiceMode" "InvoiceMode" NOT NULL DEFAULT 'DISABLED';
