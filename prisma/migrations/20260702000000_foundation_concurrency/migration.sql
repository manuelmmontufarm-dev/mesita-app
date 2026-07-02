-- Relay 01 foundation: guest reconnect identity, QR lifecycle state,
-- POS sync lease/cursor.
--
-- Rollback notes (manual):
--   DROP TABLE "pos_sync_state";
--   DROP INDEX "bill_guest_sessions_billId_clientToken_key";
--   ALTER TABLE "bill_guest_sessions" DROP COLUMN "clientToken";
--   ALTER TABLE "tables" DROP COLUMN "qrEnabled";
--   ALTER TABLE "tables" DROP COLUMN "qrStatusChangedAt";
--   ALTER TABLE "tables" DROP COLUMN "qrStatusChangedBy";
-- All changes are additive: no data rewrite, no lock-heavy backfill
-- (new columns are nullable or defaulted; unique index ignores NULLs).

-- QR lifecycle state + audit metadata (data layer for Relay 02 owner UI)
ALTER TABLE "tables" ADD COLUMN "qrEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tables" ADD COLUMN "qrStatusChangedAt" TIMESTAMP(3);
ALTER TABLE "tables" ADD COLUMN "qrStatusChangedBy" TEXT;

-- Guest client identity: same clientToken + same bill ⇒ same guest on reconnect
ALTER TABLE "bill_guest_sessions" ADD COLUMN "clientToken" TEXT;
CREATE UNIQUE INDEX "bill_guest_sessions_billId_clientToken_key"
  ON "bill_guest_sessions"("billId", "clientToken");

-- Per-restaurant POS sync lease/cursor — atomically elects at most one
-- upstream fetcher per freshness window (Phase 4 active sync)
CREATE TABLE "pos_sync_state" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cursor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_sync_state_restaurantId_key"
  ON "pos_sync_state"("restaurantId");
