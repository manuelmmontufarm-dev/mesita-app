-- Add SRI fiscal fields, Kushki/Dátil integration fields, and onboarding flags to restaurants
-- All new columns are nullable / have defaults so existing rows are unaffected

ALTER TABLE "restaurants"
  -- SRI fiscal
  ADD COLUMN "razonSocial"           TEXT,
  ADD COLUMN "nombreComercial"       TEXT,
  ADD COLUMN "direccionMatriz"       TEXT,
  ADD COLUMN "establecimientoCodigo" TEXT,
  ADD COLUMN "puntoEmisionCodigo"    TEXT,
  ADD COLUMN "regimen"               TEXT,
  ADD COLUMN "obligadoContabilidad"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contribuyenteEspecial" TEXT,
  -- Kushki
  ADD COLUMN "kushkiMerchantId"      TEXT,
  ADD COLUMN "kushkiPublicKey"       TEXT,
  ADD COLUMN "kushkiSecretKeyEnc"    TEXT,
  ADD COLUMN "kushkiEnvironment"     TEXT NOT NULL DEFAULT 'SANDBOX',
  -- Dátil
  ADD COLUMN "datilApiKeyEnc"        TEXT,
  ADD COLUMN "datilEnvironment"      TEXT NOT NULL DEFAULT 'SANDBOX',
  -- Status flags
  ADD COLUMN "paymentsEnabled"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "invoicingEnabled"      BOOLEAN NOT NULL DEFAULT false;
