-- Payment provider refactor: replace Kushki with provider-agnostic architecture.
-- Adds PayPhone + PlaceToPay fields, renames kushkiTransactionId, adds PENDING status.

-- 1. Add PENDING to the PaymentStatus enum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';

-- 2. Replace Kushki columns on restaurants with provider-agnostic columns
ALTER TABLE "restaurants"
  DROP COLUMN IF EXISTS "kushkiMerchantId",
  DROP COLUMN IF EXISTS "kushkiPublicKey",
  DROP COLUMN IF EXISTS "kushkiSecretKeyEnc",
  DROP COLUMN IF EXISTS "kushkiEnvironment",
  ADD COLUMN IF NOT EXISTS "activePaymentProvider" TEXT NOT NULL DEFAULT 'PAYPHONE',
  ADD COLUMN IF NOT EXISTS "payphoneTokenEnc"       TEXT,
  ADD COLUMN IF NOT EXISTS "payphoneStoreId"        TEXT,
  ADD COLUMN IF NOT EXISTS "payphoneEnvironment"    TEXT NOT NULL DEFAULT 'SANDBOX',
  ADD COLUMN IF NOT EXISTS "placeToPayLoginEnc"     TEXT,
  ADD COLUMN IF NOT EXISTS "placeToPayTranKeyEnc"   TEXT,
  ADD COLUMN IF NOT EXISTS "placeToPayBaseUrl"      TEXT,
  ADD COLUMN IF NOT EXISTS "placeToPayEnvironment"  TEXT NOT NULL DEFAULT 'SANDBOX';

-- 3. Add provider-agnostic columns to payments (keep old column for migration)
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "externalProvider"      TEXT,
  ADD COLUMN IF NOT EXISTS "externalTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "externalReference"     TEXT,
  ADD COLUMN IF NOT EXISTS "externalStatus"        TEXT;

-- 4. Migrate existing Kushki payment data to the new columns
UPDATE "payments"
  SET "externalTransactionId" = "kushkiTransactionId",
      "externalProvider"      = 'KUSHKI_LEGACY',
      "externalStatus"        = 'APPROVED'
  WHERE "kushkiTransactionId" IS NOT NULL
    AND "externalTransactionId" IS NULL;

-- 5. Drop the old Kushki transaction ID column
ALTER TABLE "payments"
  DROP COLUMN IF EXISTS "kushkiTransactionId";

-- 6. Add index on externalReference for webhook lookups
CREATE INDEX IF NOT EXISTS "payments_externalReference_idx"
  ON "payments" ("externalReference");
