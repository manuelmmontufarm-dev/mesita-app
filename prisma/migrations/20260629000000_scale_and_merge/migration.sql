-- Migration: scale_and_merge
-- Merges Juan's schema improvements + production indexes for 50-restaurant scale.
--
-- Changes:
--   1. Restaurant: add slug (unique, nullable), timezone, currency
--   2. Bill: replace (restaurantId, status) index with (restaurantId, status, createdAt)
--           add (restaurantId, createdAt) for date-range dashboard queries
--           add (tableId, status) for POS "open bill for this table" hot path
--   3. Payment: add index on kushkiTransactionId (from Juan's 20260612000000_add_kushki_txn_index)
--              add index on guestSessionId
-- Note: directUrl in datasource is schema-config only — no SQL needed.

-- 1. Restaurant fields
ALTER TABLE "restaurants"
  ADD COLUMN IF NOT EXISTS "slug"     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Guayaquil',
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';

-- 2. Bill indexes
-- Drop the narrow (restaurantId, status) index; replaced by the 3-column version.
DROP INDEX IF EXISTS "bills_restaurantId_status_idx";

CREATE INDEX IF NOT EXISTS "bills_restaurantId_status_createdAt_idx"
  ON "bills" ("restaurantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "bills_restaurantId_createdAt_idx"
  ON "bills" ("restaurantId", "createdAt");

CREATE INDEX IF NOT EXISTS "bills_tableId_status_idx"
  ON "bills" ("tableId", "status");

-- 3. Payment indexes
CREATE INDEX IF NOT EXISTS "payments_kushkiTransactionId_idx"
  ON "payments" ("kushkiTransactionId");

CREATE INDEX IF NOT EXISTS "payments_guestSessionId_idx"
  ON "payments" ("guestSessionId");
