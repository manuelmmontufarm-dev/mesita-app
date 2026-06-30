-- Rename Kushki columns to provider-agnostic payment fields
ALTER TABLE "restaurants" RENAME COLUMN "kushkiEnvironment" TO "paymentEnvironment";
ALTER TABLE "restaurants" RENAME COLUMN "kushkiPrivateKeyEnc" TO "paymentPrivateKeyEnc";
ALTER TABLE "restaurants" RENAME COLUMN "kushkiPublicKey" TO "paymentPublicKey";
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT NOT NULL DEFAULT 'STUB';

ALTER TABLE "payments" RENAME COLUMN "kushkiTransactionId" TO "providerTransactionId";

DROP INDEX IF EXISTS "payments_kushkiTransactionId_idx";
CREATE INDEX IF NOT EXISTS "payments_providerTransactionId_idx" ON "payments"("providerTransactionId");
