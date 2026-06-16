-- Align default with Contifico forma_cobro short codes used by the adapter.
ALTER TABLE "restaurants"
  ALTER COLUMN "posPaymentMethod" SET DEFAULT 'EF';
