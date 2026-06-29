-- =============================================================================
-- MesitaQR — Full Schema Deploy (idempotent, safe to run on existing DB)
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run
-- Does NOT touch Juan's existing tables (cobros, webhook_logs, etc.)
-- =============================================================================

-- ─── Enums ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "RestaurantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'SERVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SplitMode" AS ENUM ('FULL', 'EQUAL', 'BY_ITEM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "InvoiceMode" AS ENUM ('DISABLED', 'MANUAL', 'POS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE "InvoiceMode" ADD VALUE IF NOT EXISTS 'POS';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GuestSessionStatus" AS ENUM ('SELECTING', 'REVIEWING', 'IN_PAYMENT', 'PAID', 'LEFT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BillItemClaimStatus" AS ENUM ('ACTIVE', 'PAID', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── restaurants ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "restaurants" (
  "id"                     TEXT NOT NULL,
  "name"                   TEXT NOT NULL,
  "slug"                   TEXT,
  "logo"                   TEXT,
  "address"                TEXT,
  "status"                 "RestaurantStatus" NOT NULL DEFAULT 'PENDING',
  "plan"                   TEXT,
  "facturaCount"           INTEGER NOT NULL DEFAULT 0,
  "ruc"                    TEXT,
  "contactEmail"           TEXT,
  "phone"                  TEXT,
  "invoiceSequence"        INTEGER NOT NULL DEFAULT 0,
  "timezone"               TEXT NOT NULL DEFAULT 'America/Guayaquil',
  "currency"               TEXT NOT NULL DEFAULT 'USD',
  -- SRI fiscal
  "razonSocial"            TEXT,
  "nombreComercial"        TEXT,
  "direccionMatriz"        TEXT,
  "establecimientoCodigo"  TEXT,
  "puntoEmisionCodigo"     TEXT,
  "regimen"                TEXT,
  "obligadoContabilidad"   BOOLEAN DEFAULT false,
  "contribuyenteEspecial"  TEXT,
  -- Kushki
  "paymentsEnabled"        BOOLEAN NOT NULL DEFAULT false,
  "invoiceMode"            "InvoiceMode" NOT NULL DEFAULT 'DISABLED',
  "kushkiEnvironment"      TEXT NOT NULL DEFAULT 'SANDBOX',
  "kushkiPrivateKeyEnc"    TEXT,
  "kushkiPublicKey"        TEXT,
  -- POS (Contífico / Siigo)
  "posProvider"            TEXT,
  "posApiKeyEnc"           TEXT,
  "posEnvironment"         TEXT NOT NULL DEFAULT 'SANDBOX',
  "posTableField"          TEXT,
  "posPaymentMethod"       TEXT DEFAULT 'EF',
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_name_key" ON "restaurants"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_slug_key" ON "restaurants"("slug");

-- ─── users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users" (
  "id"                 TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "password"           TEXT NOT NULL,
  "role"               "UserRole" NOT NULL,
  "restaurantId"       TEXT NOT NULL,
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"         ON "users"("email");
CREATE INDEX        IF NOT EXISTS "users_restaurantId_idx"  ON "users"("restaurantId");

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tables" (
  "id"            TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "posExternalId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tables_token_key"                       ON "tables"("token");
CREATE INDEX        IF NOT EXISTS "tables_restaurantId_idx"                ON "tables"("restaurantId");
CREATE INDEX        IF NOT EXISTS "tables_restaurantId_posExternalId_idx"  ON "tables"("restaurantId", "posExternalId");

DO $$ BEGIN
  ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── categories ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "categories" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "order"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "categories_restaurantId_idx" ON "categories"("restaurantId");

DO $$ BEGIN
  ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── menu_items ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "menu_items" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "price"        DECIMAL(10,2) NOT NULL,
  "available"    BOOLEAN NOT NULL DEFAULT true,
  "categoryId"   TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "menu_items_restaurantId_idx" ON "menu_items"("restaurantId");
CREATE INDEX IF NOT EXISTS "menu_items_categoryId_idx"   ON "menu_items"("categoryId");

DO $$ BEGIN
  ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── bills ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "bills" (
  "id"                        TEXT NOT NULL,
  "tableId"                   TEXT NOT NULL,
  "restaurantId"              TEXT NOT NULL,
  "status"                    "BillStatus" NOT NULL DEFAULT 'UNPAID',
  "splitMode"                 "SplitMode",
  "equalSplitPeople"          INTEGER,
  "equalSharesPaid"           INTEGER NOT NULL DEFAULT 0,
  "notes"                     TEXT,
  "posDocumentId"             TEXT,
  "posToken"                  TEXT,
  "posSubtotal"               DECIMAL(10,2),
  "posIva"                    DECIMAL(10,2),
  "posPropina"                DECIMAL(10,2),
  "posTotal"                  DECIMAL(10,2),
  "invoiceRecipientPaymentId" TEXT,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt"                  TIMESTAMP(3),
  CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bills_posDocumentId_key"                ON "bills"("posDocumentId");
CREATE INDEX        IF NOT EXISTS "bills_restaurantId_status_createdAt_idx" ON "bills"("restaurantId", "status", "createdAt");
CREATE INDEX        IF NOT EXISTS "bills_restaurantId_createdAt_idx"        ON "bills"("restaurantId", "createdAt");
CREATE INDEX        IF NOT EXISTS "bills_tableId_status_idx"                ON "bills"("tableId", "status");

DO $$ BEGIN
  ALTER TABLE "bills" ADD CONSTRAINT "bills_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── bill_items ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "bill_items" (
  "id"           TEXT NOT NULL,
  "billId"       TEXT NOT NULL,
  "menuItemId"   TEXT,
  "restaurantId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "price"        DECIMAL(10,2) NOT NULL,
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "isPaid"       BOOLEAN NOT NULL DEFAULT false,
  "paidAt"       TIMESTAMP(3),
  "version"      INTEGER NOT NULL DEFAULT 1,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bill_items_billId_idx"       ON "bill_items"("billId");
CREATE INDEX IF NOT EXISTS "bill_items_restaurantId_idx" ON "bill_items"("restaurantId");

DO $$ BEGIN
  ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_menuItemId_fkey"
    FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── bill_guest_sessions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "bill_guest_sessions" (
  "id"          TEXT NOT NULL,
  "billId"      TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "colorHue"    INTEGER NOT NULL,
  "status"      "GuestSessionStatus" NOT NULL DEFAULT 'SELECTING',
  "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_guest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bill_guest_sessions_billId_label_key"   ON "bill_guest_sessions"("billId", "label");
CREATE INDEX        IF NOT EXISTS "bill_guest_sessions_billId_status_idx"  ON "bill_guest_sessions"("billId", "status");

DO $$ BEGIN
  ALTER TABLE "bill_guest_sessions" ADD CONSTRAINT "bill_guest_sessions_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── bill_item_claims ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "bill_item_claims" (
  "id"             TEXT NOT NULL,
  "billId"         TEXT NOT NULL,
  "billItemId"     TEXT NOT NULL,
  "guestSessionId" TEXT NOT NULL,
  "units"          DECIMAL(10,3) NOT NULL DEFAULT 1,
  "status"         "BillItemClaimStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bill_item_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bill_item_claims_billItemId_guestSessionId_key" ON "bill_item_claims"("billItemId", "guestSessionId");
CREATE INDEX        IF NOT EXISTS "bill_item_claims_billId_status_idx"             ON "bill_item_claims"("billId", "status");
CREATE INDEX        IF NOT EXISTS "bill_item_claims_guestSessionId_idx"            ON "bill_item_claims"("guestSessionId");

DO $$ BEGIN
  ALTER TABLE "bill_item_claims" ADD CONSTRAINT "bill_item_claims_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bill_item_claims" ADD CONSTRAINT "bill_item_claims_billItemId_fkey"
    FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "bill_item_claims" ADD CONSTRAINT "bill_item_claims_guestSessionId_fkey"
    FOREIGN KEY ("guestSessionId") REFERENCES "bill_guest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── payments ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payments" (
  "id"                    TEXT NOT NULL,
  "billId"                TEXT NOT NULL,
  "restaurantId"          TEXT NOT NULL,
  "amount"                DECIMAL(10,2) NOT NULL,
  "voluntaryTip"          DECIMAL(10,2),
  "kushkiTransactionId"   TEXT NOT NULL DEFAULT '',
  "idempotencyKey"        TEXT NOT NULL,
  "status"                "PaymentStatus" NOT NULL,
  "splitMode"             "SplitMode",
  "guestSessionId"        TEXT,
  "equalSplitPeople"      INTEGER,
  "guestIdentificacion"   TEXT,
  "guestEmail"            TEXT,
  "guestNombre"           TEXT,
  "guestTipo"             TEXT,
  "posRegisteredAt"       TIMESTAMP(3),
  "posRegisteredByUserId" TEXT,
  "posRegistrationNote"   TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key"              ON "payments"("idempotencyKey");
CREATE INDEX        IF NOT EXISTS "payments_restaurantId_createdAt_idx"      ON "payments"("restaurantId", "createdAt");
CREATE INDEX        IF NOT EXISTS "payments_restaurantId_posRegisteredAt_idx" ON "payments"("restaurantId", "posRegisteredAt");
CREATE INDEX        IF NOT EXISTS "payments_billId_idx"                      ON "payments"("billId");
CREATE INDEX        IF NOT EXISTS "payments_guestSessionId_idx"              ON "payments"("guestSessionId");
CREATE INDEX        IF NOT EXISTS "payments_kushkiTransactionId_idx"         ON "payments"("kushkiTransactionId");

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_billId_fkey"
    FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_guestSessionId_fkey"
    FOREIGN KEY ("guestSessionId") REFERENCES "bill_guest_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── payment_bill_items ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payment_bill_items" (
  "id"         TEXT NOT NULL,
  "paymentId"  TEXT NOT NULL,
  "billItemId" TEXT,
  "name"       TEXT NOT NULL,
  "units"      DECIMAL(10,3) NOT NULL DEFAULT 1,
  "unitPrice"  DECIMAL(10,2) NOT NULL,
  "amount"     DECIMAL(10,2) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_bill_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payment_bill_items_paymentId_idx"  ON "payment_bill_items"("paymentId");
CREATE INDEX IF NOT EXISTS "payment_bill_items_billItemId_idx" ON "payment_bill_items"("billItemId");

DO $$ BEGIN
  ALTER TABLE "payment_bill_items" ADD CONSTRAINT "payment_bill_items_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payment_bill_items" ADD CONSTRAINT "payment_bill_items_billItemId_fkey"
    FOREIGN KEY ("billItemId") REFERENCES "bill_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Auth.js tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "accounts" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "type"              TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token"     TEXT,
  "access_token"      TEXT,
  "expires_at"        INTEGER,
  "token_type"        TEXT,
  "scope"             TEXT,
  "id_token"          TEXT,
  "session_state"     TEXT,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_provider_providerAccountId_key"
  ON "accounts"("provider", "providerAccountId");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id"           TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "expires"      TIMESTAMP(3) NOT NULL,
  "restaurantId" TEXT,
  "role"         TEXT,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_sessionToken_key" ON "sessions"("sessionToken");
CREATE INDEX        IF NOT EXISTS "sessions_userId_idx"       ON "sessions"("userId");

DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expires"    TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key"
  ON "verification_tokens"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_identifier_token_key"
  ON "verification_tokens"("identifier", "token");

-- ─── Prisma migration history ────────────────────────────────────────────────
-- Tells Prisma CLI that all migrations have been applied so future
-- `prisma migrate deploy` only runs NEW migrations from this point forward.

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                   VARCHAR(36) NOT NULL,
  "checksum"             VARCHAR(64) NOT NULL,
  "finished_at"          TIMESTAMPTZ,
  "migration_name"       VARCHAR(255) NOT NULL,
  "logs"                 TEXT,
  "rolled_back_at"       TIMESTAMPTZ,
  "started_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_steps_count"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","logs","rolled_back_at","started_at","applied_steps_count")
VALUES
  (gen_random_uuid()::text,'baseline',NOW(),'20260511000000_init',               NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260512042516_add_bill_models',     NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260512100000_add_payments_facturas_fields',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260513000000_restaurant_fiscal_integration',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260513100000_payment_provider_refactor',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260513200000_payment_item_tracking',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260526000000_kushki_only',         NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260529000000_add_invoice_mode',    NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260601000000_pos_integration_schema',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260601_contifico_3gaps_sri50',     NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260602000000_remove_invoicing_enabled_add_bill_item_updated_at',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260604000000_pos_manual_payment_registration',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260609000000_add_bill_pos_token',  NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260609001000_align_pos_payment_method_default',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260609120000_add_pos_totals',      NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260612110000_guest_table_sessions',NULL,NULL,NOW(),1),
  (gen_random_uuid()::text,'baseline',NOW(),'20260629000000_scale_and_merge',     NULL,NULL,NOW(),1)
ON CONFLICT DO NOTHING;
