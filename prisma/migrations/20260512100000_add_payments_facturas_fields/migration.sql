-- CreateEnum
CREATE TYPE IF NOT EXISTS "PaymentStatus" AS ENUM ('COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE IF NOT EXISTS "FacturaJobStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable (payments) — skipped if already exists via IF NOT EXISTS
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "voluntaryTip" DECIMAL(10,2),
    "kushkiTransactionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "splitMode" "SplitMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable (factura_jobs)
CREATE TABLE IF NOT EXISTS "factura_jobs" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "paymentId" TEXT,
    "restaurantId" TEXT NOT NULL,
    "status" "FacturaJobStatus" NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "rideUrl" TEXT,
    "claveAcceso" TEXT,
    "comprador" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factura_jobs_pkey" PRIMARY KEY ("id")
);

-- AddColumn: version to bill_items (idempotent)
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- AddColumns: SRI / invoice fields to restaurants
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "ruc" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "invoiceSequence" INTEGER NOT NULL DEFAULT 0;

-- AddColumn: voluntaryTip to payments (idempotent for reruns)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voluntaryTip" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "payments_restaurantId_createdAt_idx" ON "payments"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "payments_billId_idx" ON "payments"("billId");
CREATE INDEX IF NOT EXISTS "factura_jobs_restaurantId_status_idx" ON "factura_jobs"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "factura_jobs_status_lastAttemptAt_idx" ON "factura_jobs"("status", "lastAttemptAt");
CREATE INDEX IF NOT EXISTS "factura_jobs_billId_idx" ON "factura_jobs"("billId");

-- AddForeignKey (payments)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_billId_fkey'
  ) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_billId_fkey"
      FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_restaurantId_fkey'
  ) THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey (factura_jobs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'factura_jobs_billId_fkey'
  ) THEN
    ALTER TABLE "factura_jobs" ADD CONSTRAINT "factura_jobs_billId_fkey"
      FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'factura_jobs_paymentId_fkey'
  ) THEN
    ALTER TABLE "factura_jobs" ADD CONSTRAINT "factura_jobs_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'factura_jobs_restaurantId_fkey'
  ) THEN
    ALTER TABLE "factura_jobs" ADD CONSTRAINT "factura_jobs_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
