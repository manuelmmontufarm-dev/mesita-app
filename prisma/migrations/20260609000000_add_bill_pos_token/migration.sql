-- Persist Contifico POS UUID from POS-created documents.
-- Required by POST /documento/{id}/cobro/ when registering MesitaQR payments back to Contifico.
ALTER TABLE "bills"
  ADD COLUMN IF NOT EXISTS "posToken" TEXT;
