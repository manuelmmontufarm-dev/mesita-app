-- Collaborative guest state for the Claude customer flow.
-- These tables sit beside the POS-owned bill/items data and can be replaced
-- or expanded when a real realtime transport is introduced.

CREATE TYPE "GuestSessionStatus" AS ENUM ('SELECTING', 'REVIEWING', 'IN_PAYMENT', 'PAID', 'LEFT');
CREATE TYPE "BillItemClaimStatus" AS ENUM ('ACTIVE', 'PAID', 'RELEASED');

CREATE TABLE "bill_guest_sessions" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "colorHue" INTEGER NOT NULL,
    "status" "GuestSessionStatus" NOT NULL DEFAULT 'SELECTING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_guest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bill_item_claims" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "billItemId" TEXT NOT NULL,
    "guestSessionId" TEXT NOT NULL,
    "units" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "status" "BillItemClaimStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bill_item_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_bill_items" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "billItemId" TEXT,
    "name" TEXT NOT NULL,
    "units" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_bill_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN "guestSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN "equalSplitPeople" INTEGER;

CREATE UNIQUE INDEX "bill_guest_sessions_billId_label_key" ON "bill_guest_sessions"("billId", "label");
CREATE INDEX "bill_guest_sessions_billId_status_idx" ON "bill_guest_sessions"("billId", "status");

CREATE UNIQUE INDEX "bill_item_claims_billItemId_guestSessionId_key" ON "bill_item_claims"("billItemId", "guestSessionId");
CREATE INDEX "bill_item_claims_billId_status_idx" ON "bill_item_claims"("billId", "status");
CREATE INDEX "bill_item_claims_guestSessionId_idx" ON "bill_item_claims"("guestSessionId");

CREATE INDEX "payments_guestSessionId_idx" ON "payments"("guestSessionId");

CREATE INDEX "payment_bill_items_paymentId_idx" ON "payment_bill_items"("paymentId");
CREATE INDEX "payment_bill_items_billItemId_idx" ON "payment_bill_items"("billItemId");

ALTER TABLE "bill_guest_sessions"
  ADD CONSTRAINT "bill_guest_sessions_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_item_claims"
  ADD CONSTRAINT "bill_item_claims_billId_fkey"
  FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_item_claims"
  ADD CONSTRAINT "bill_item_claims_billItemId_fkey"
  FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bill_item_claims"
  ADD CONSTRAINT "bill_item_claims_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "bill_guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_guestSessionId_fkey"
  FOREIGN KEY ("guestSessionId") REFERENCES "bill_guest_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_bill_items"
  ADD CONSTRAINT "payment_bill_items_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_bill_items"
  ADD CONSTRAINT "payment_bill_items_billItemId_fkey"
  FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
