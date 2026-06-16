-- Remove invoicingEnabled from restaurants.
-- invoiceMode (DISABLED/DATIL/MANUAL) is the single source of truth.
-- Application code derives: invoicingEnabled = invoiceMode != 'DISABLED'.
ALTER TABLE "restaurants" DROP COLUMN IF EXISTS "invoicingEnabled";

-- Add updatedAt to bill_items so mutable fields (isPaid, paidAt) have an audit timestamp.
ALTER TABLE "bill_items"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
