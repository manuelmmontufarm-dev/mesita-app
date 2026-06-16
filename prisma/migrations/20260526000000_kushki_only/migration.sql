-- Migration: Replace PayPhone + PlaceToPay with Kushki

-- 1. Restaurants: remove provider-agnostic columns, add Kushki columns
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "activePaymentProvider";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "payphoneTokenEnc";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "payphoneStoreId";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "payphoneEnvironment";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "placeToPayLoginEnc";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "placeToPayTranKeyEnc";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "placeToPayBaseUrl";
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "placeToPayEnvironment";

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "kushkiPrivateKeyEnc" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "kushkiPublicKey" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "kushkiEnvironment" TEXT NOT NULL DEFAULT 'SANDBOX';

-- 2. Payments: restore kushkiTransactionId, drop provider-agnostic columns
-- Step 1: add the column with a temporary default so existing rows satisfy NOT NULL
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "kushkiTransactionId" TEXT NOT NULL DEFAULT '';

-- Step 2: backfill from externalTransactionId for rows that were Kushki payments
UPDATE "payments"
  SET "kushkiTransactionId" = "externalTransactionId"
  WHERE "externalTransactionId" IS NOT NULL
    AND "kushkiTransactionId" = '';

-- Step 3: remove the temporary default (column stays NOT NULL, values already set)
ALTER TABLE "payments" ALTER COLUMN "kushkiTransactionId" DROP DEFAULT;

-- Step 4: drop the provider-agnostic columns no longer needed
ALTER TABLE "payments" DROP COLUMN IF EXISTS "externalTransactionId";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "externalProvider";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "externalReference";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "externalStatus";

-- Step 5: drop the index that referenced externalReference
DROP INDEX IF EXISTS "payments_externalReference_idx";
