-- Track manual POS registration for payments when the POS has no payment API.
ALTER TABLE "payments"
  ADD COLUMN "posRegisteredAt" TIMESTAMP(3),
  ADD COLUMN "posRegisteredByUserId" TEXT,
  ADD COLUMN "posRegistrationNote" TEXT;

CREATE INDEX "payments_restaurantId_posRegisteredAt_idx"
  ON "payments"("restaurantId", "posRegisteredAt");
