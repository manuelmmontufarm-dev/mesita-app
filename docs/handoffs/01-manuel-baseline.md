# Fable 5 Relay 01 — Baseline (Phase 0)

Date: 2026-07-01
Session: FABLE5_01_MANUEL_FOUNDATION

## Branches and commits (starting points)

| Repo | Branch | Commit |
|------|--------|--------|
| mesita-app (`/Users/manue/mesita-app-1`) | `fable/01-manuel-foundation` | `81f0b3ef24a72559ec996472330290369f7a8d23` |
| Mesita-POS (`/Users/manue/Downloads/Mesita-POS`) | `fable/01-manuel-contifico-v2` | `bec7c188aed9b118a274d15d2af49a4594366958` |

Both worktrees clean at session start. Node v25.9.0, npm 11.12.1.

## Environments (names only — no secret values)

- App: Next.js 15 + Prisma 5 + Supabase (pooler `DATABASE_URL` + `DIRECT_URL`), Upstash Redis for demo table state, Vitest + Playwright.
- POS: Express 4 + Prisma 5, multi-tenant (per-restaurant Postgres schemas via `$executeRawUnsafe`), Jest + supertest.
- Payment providers present in app: `stub`, `demo`, `diners` (client stub) under `src/modules/payments/adapters/`.

## Baseline command results

### App (`mesita-app`)

| Command | Result |
|---------|--------|
| `npm run build` | RECORDED BELOW (see “Build/tsc/test output”) |
| `npx tsc --noEmit` | RECORDED BELOW |
| `npm test` | RECORDED BELOW |
| `npm audit --audit-level=high` | 7 vulnerabilities (4 moderate, 2 high, 1 critical). High: `launch-editor` (NTLMv2 hash disclosure), `vite` 8.0.0–8.0.15 (`server.fs.deny` bypass, Windows). Dev-dependency chain (vite/vitest). |

### POS (`Mesita-POS`)

| Command | Result |
|---------|--------|
| `npm test -- --runInBand` | **23 failed, 1 passed** (2 suites, both failing). All failures are HTTP 500 where 200/201 expected. |
| `npm audit --audit-level=high` | 3 vulnerabilities (2 moderate, 1 high). High: `uuid` (buffer bounds in v3/v5/v6; fix is breaking upgrade to uuid@14). |

**POS failure root cause (pre-existing, expected):** the Jest suites mock `@prisma/client` with per-model stubs (`tests/documento.test.js:72`, `tests/mesitaqr.test.js:21`) but do not stub `$executeRawUnsafe` / `$queryRawUnsafe`, which `src/services/platformService.js:395,418,428,504` calls during tenant bootstrap. Every authenticated route 500s before reaching the handler. This is the documented Phase 2 repair item — a pre-existing failure, not a regression.

## Verified “known evidence” items

1. **Simulator is v1, Token auth, count/results, subtotal_15, custom cobro** — confirmed:
   - `src/app.js:156` mounts `/sistema/api/v1` only; no v2 route exists.
   - `src/middlewares/auth.js` requires `Authorization: Token <API_KEY>` (or `Bearer` session) — documented v2 uses raw key.
   - `src/adapters/contificoAdapter.js:62,91` and `src/api/v1/documento.js:166` emit `subtotal_15` — official wire name is `subtotal_12` even at 15% IVA.
2. **App adapter drift** — confirmed in `src/modules/pos/adapters/contifico.adapter.ts`:
   - Queries `?tipo_documento=PRE` (`:99`); documented list query is `tipo=PRE` with `result_size`/`result_page` pagination.
   - `ping()` uses `?limit=1` (`:351`).
   - Undocumented **409 treated as success** in `confirmPayment` (`:212-214`) with no local reconciliation check.
   - Sends the Mesita `paymentId` (UUID, 36 chars) into `lote` (`:196` via `process-payment.ts:249`) despite documented max length.
   - Persona create payload shape (`:304-311`) unvalidated against official schema (persona-shape drift).
   - No response schema validation anywhere; only `Array.isArray(data) ? data : data?.results`.
3. **Hardcoded Contífico sandbox key** — confirmed at `scripts/test-contifico.mjs:9` (fallback default in tracked file). Flagged for rotation; Phase 5 removes it.
4. **Non-atomic Redis compare-and-set** — confirmed at `src/lib/demo-table-store.ts:298-305` (`tryCommitDemoState` does GET → compare → SET; not atomic across serverless instances; per-process serialization only).
5. **Owner read-only default mismatch** — `src/lib/owner-mode.ts:18` defaults to read-only (`?? "1"`); the tables route test expects a mutation to succeed (`src/app/api/tables/__tests__/route.test.ts`) — Phase 5 item.
6. **Cron as live mechanism** — `src/app/api/pos/ingest/route.ts` is a Vercel-cron-triggered poll across all POS restaurants; no lease/sync-if-stale path exists yet (Phase 4 item).
7. **Superseded plan** — `docs/INTEGRATION_PLAN.md` exists and contains v1/Kushki/Redis assumptions (to be marked superseded in Phase 5).

## Key files likely to change

App:
- `src/modules/pos/adapters/contifico.adapter.ts`, `pos-config.ts` — contract fixes, defensive parsing
- `src/modules/pos/application/ingest-orders.ts` — PRE filtering, sync path
- `src/modules/payments/application/process-payment.ts` + `adapters/prisma/payment.repository.ts` — idempotency/transaction boundary
- `src/modules/guest-session/application/table-session.service.ts` — join/claim concurrency
- `prisma/schema.prisma` — sync lease/cursor, constraints/indexes
- `scripts/test-contifico.mjs` — remove hardcoded key
- `docs/INTEGRATION_PLAN.md`, `.env.example`

POS:
- `tests/*.test.js` bootstrap mocks (add `$executeRawUnsafe`/`$queryRawUnsafe`)
- New `/sistema/api/v2` façade (router + translation layer + fault profiles)
- `src/app.js` (mount v2), `src/services/documentoService.js` / `mesaSessionService.js` (MESITA_TABLE writing)

## Pre-existing failures vs. new regressions

- **Pre-existing:** all 23 POS test failures (bootstrap mock gap); app audit vulns; POS audit vulns.
- **New regressions:** none — no code changed in Phase 0.

## Build/tsc/test output (app)

| Command | Result |
|---------|--------|
| `npm run build` | **PASS** — compiles, all routes emitted (Next.js 15 production build). |
| `npx tsc --noEmit` | **PASS** — zero type errors. |
| `npm test` | **427 passed / 1 failed** (37 files, 36 passing). Sole failure: `src/app/api/tables/__tests__/route.test.ts > POST creates table with posExternalId` — expected 201, got 403. This is the documented owner-readonly default/test mismatch (`src/lib/owner-mode.ts:18` defaults `OWNER_READONLY` to on). Pre-existing; scheduled for Phase 5. |

---

# Phase 1 — Contract freeze (CONTRACT PASS)

- Frozen contract: `contracts/contifico-v2/README.md`; golden fixtures in `contracts/contifico-v2/fixtures/` (13 files).
- Executable side: `src/modules/pos/contract/{contifico-v2.schema.ts, table-mapping.ts, payment-reference.ts}`.
- Contract tests: `npx vitest run src/modules/pos/contract` → **18/18 pass** (3 files).
- Read-only verifier reviewed the contract against the official OpenAPI; 4 confirmed findings fixed:
  1. `tipo_ping` now required when `forma_cobro=TC` (param table marks it Si).
  2. `monto` restricted to whole cents (documented decimal(8,2)).
  3. Persona create: `.strict()`, ≥1 of `es_cliente`/`es_proveedor` true, cedula/ruc required for tipo N/J (conditional reading marked UNVERIFIED).
  4. Response parsing of `lote`/`numero_comprobante` tolerates number|string (official examples use numbers) — prevents dropped rows breaking cobro reconciliation.

## Key contract decisions

- Auth: raw API key in `Authorization` header — no `Token ` prefix (v1 sim behavior is drift to be fixed by the v2 façade).
- List query: `tipo=PRE` + `result_size`/`result_page` (not `tipo_documento`, not `limit`).
- Wire name `subtotal_12` preserved at 15% IVA. Estado machine: open = P/E; closed = C/G/A/F (G and E were missing from the old adapter).
- Payment reference: `numero_comprobante` = `MSTA` + 11 hex of sha256(paymentId) (15 chars) — replaces UUID-into-`lote` (violated varchar(16) + not a documented POST param).
- 409 (or any undocumented status) is NEVER success — reconciliation reads the cobro list and matches `numero_comprobante`.
- Table mapping: `posTableField` ∈ {adicional1, adicional2, descripcion}, default adicional1; value `MESITA_TABLE:<posExternalId>`; ambiguous duplicates skipped, never guessed.

---

# Phase 2 — Simulator v2 façade (SIMULATOR PASS)

Mesita-POS branch `fable/01-manuel-contifico-v2` changes:

- **Test bootstrap repaired**: Prisma mocks now stub `$executeRawUnsafe`/`$queryRawUnsafe`/`$transaction` + platform models (`tests/documento.test.js`, `tests/mesitaqr.test.js`). Baseline 1/24 → **47/47 passing** (3 suites: v1 documento, v1 mesitaqr, v2 façade).
- **New `/sistema/api/v2` façade** (`src/api/v2/`): raw-key auth (v1 `Token `-prefix rejected 401), `GET/POST /documento/`, `GET /documento/:id/` (OBSERVED op), `PUT /documento/:id/` (cliente update, UNVERIFIED op), `GET/POST /documento/:id/cobro/`, `GET/POST /persona/`, public `/health/` + `/contract-version/`.
- **Wire translation**: internal `subtotal15` → wire `subtotal_12`; internal cobro `referencia` ↔ wire `numero_comprobante`; `tipo_ping` ↔ `procesador`; deterministic synthetic `lote` for card cobros.
- **Strictness decisions** (façade takes the strict side where real behavior is unverified): undocumented cobro POST params (`lote`, `descripcion`) → 400; TC without `tipo_ping` → 400; sub-cent `monto` → 400; overpay → 400; closed estados (C/G/A/F) refuse cobros; duplicate retries create a second cobro (worst-case, NO upstream dedupe) — the app must own idempotency.
- **Estado parity**: PRE flips to `C` exactly when Σ cobros = total.
- **Table mapping**: `Documento.adicional1/adicional2` columns added (schema.prisma + tenant DDL + ALTERs + copy list); `crearDocumento` auto-writes `MESITA_TABLE:<mesaId>` into the configured field (`MESITA_TABLE_FIELD` env, default adicional1) for orden-linked documents; 300-char cap enforced.
- **Fault profiles** (simulator-only test extension, header `X-Fault-Profile`): `latency:<ms>`, `timeout`, `error:400/401/403/500`, `stale` (delayed-consistency reads).
- **v1 untouched** for the POS UI: v1 suites still green; `adicional1/2` added to the v1 formatter (additive).
- **Audit**: `npm audit fix` applied → was 3 vulns (1 high), now **1 moderate** (`uuid` — fix is a breaking major; the vulnerable v3/v5/v6-with-buffer API is not called anywhere in `src/`; accepted risk, owner Manuel, revisit on next dependency pass).
- **Black-box evidence** (live server, port 4123, real Supabase DB): no-auth → 401, `Token <key>` → 401, raw key → 200 with `{count, results}` envelope and `subtotal_12`/`adicional1` wire fields.

---

# Phase 3 — One adapter + Supabase concurrency (CONCURRENCY PASS)

## Adapter refactor (single Contífico v2 adapter)

- `src/modules/pos/adapters/contifico.adapter.ts` rewritten against the frozen contract: `tipo=PRE` + `result_size`/`result_page` query; envelope-tolerant, per-row-validated parsing; defensive open-PRE filter; estado machine C/G/A/F closed, P/E open; MESITA_TABLE parsing with ambiguity → blank + log; `numero_comprobante` (derived, ≤15) replaces UUID-into-`lote`; **201-only direct success — any other outcome (409 included, timeouts too) goes through cobro-list reconciliation matching our `numero_comprobante`**; persona via documented `?search=` + exact match; persona-create/cliente-attach config-gated behind `CONTIFICO_ATTACH_CLIENTE=1` (UNVERIFIED ops, default off).
- `pos-config.ts`: base URL from environment presets or `CONTIFICO_BASE_URL` override (simulator↔real is configuration ONLY — no URL inspection anywhere); `posTableField` restricted to documented free-text fields, default `adicional1`.
- Adapter tests rewritten to the frozen contract: 25 tests including the real captured sandbox fixture (which confirmed: real list = bare array, string money, BOTH `subtotal` alias and documented `subtotal_12` present — we read `subtotal_12`).
- Null-tolerance hardening (found by running against the live façade): optional wire string fields accept `null` (live responses emit null, not absence); `lote`/`numero_comprobante` accept number|string (official examples use numbers). A rejected row would have silently dropped a document → duplicate-cobro risk via failed reconciliation.

## Schema migration `20260702000000_foundation_concurrency` (applied to test Supabase)

- `bill_guest_sessions.clientToken` + unique `(billId, clientToken)` — reconnect identity.
- `tables.qrEnabled/qrStatusChangedAt/qrStatusChangedBy` — QR state + audit metadata for Alejandro's UI (data layer only).
- `pos_sync_state` table — per-restaurant sync lease/cursor (unique restaurantId).
- Rollback notes in the migration header; all changes additive.

## Transactional safety (Supabase/Prisma is the sole durable owner)

- **Payments** (`payment.repository.ts`): bill-row `FOR UPDATE` lock serializes payments per bill; authoritative remaining-balance guard in integer cents (Σ net settled + this net ≤ posTotal-or-fallback) inside the transaction; FULL-mode zero-rows guard; iTX limits raised so queued retries fail by guard, not timeout. Raw SQL is schema-qualified (`"public"."bills"`) — the Supabase transaction pooler does not inherit search_path.
- **Idempotency** (`process-payment.ts`): any post-charge failure where an identical idempotency key already exists on the bill returns THAT payment as `alreadyProcessed` (and best-effort voids our duplicate charge) — N identical retries ⇒ exactly one completed payment.
- **Guest identity** (`table-session.service.ts`): join accepts an opaque `clientToken`; same token + same bill returns the same guest (unique constraint wins races); label allocation serialized via bill-row lock inside a transaction.
- **Claims**: `claimBillItem` now locks the bill-item row (`FOR UPDATE`) inside a transaction; ACTIVE+PAID units both consume capacity; a lost race is an explicit conflict (409), never a silent erase.
- **Provider boundary hardening** (`pay/route.ts`): STUB valid ONLY for the demo tenant; a `stub:`/`demo:` charge token on a real restaurant no longer bypasses to a fake approval (was a payment-marked-completed-without-charge hole); non-demo restaurants without an implemented provider get an explicit 503.

## Concurrency evidence (REAL parallel promises against test Supabase)

`tests/integration/concurrency-invariants.test.ts` — **10 repeated rounds, 9/9 tests each (90/90)**:
- 10 concurrent anonymous joins → 10 stable unique guests.
- 10 concurrent same-clientToken joins → exactly 1 guest; reconnect returns the same guest.
- 20 claims racing for 1 unit → 1 owner + 19 explicit conflicts; DB shows 1 ACTIVE claim.
- Fractional races (10× 0.5 on quantity 2) → winners ≤ 4, Σ units ≤ quantity.
- 20 identical payment retries → all 20 resolve to ONE paymentId; DB has exactly 1 COMPLETED payment.
- Two $6 payments on a $10 bill (structurally valid BY_ITEM on different items) → exactly 1 succeeds; settled ≤ total.
- Over-balance payment rejected outright with 0 payment rows.

Repeated-run command: `for i in $(seq 10); do npx vitest run tests/integration/concurrency-invariants.test.ts; done` → 10× "9 passed".

---

# Phase 4 — Active sync + provider boundary

- `src/modules/pos/application/sync-if-stale.ts`: sync-if-stale with atomic Supabase lease election (`pos_sync_state` conditional updateMany re-checking freshness inside the claim). Losers never wait and never fetch; upstream failure preserves the last committed snapshot and reports `{fresh:false, upstreamAvailable:false, lastError}` — values never fabricated. Cron (`/api/pos/ingest`) remains a recovery backstop only.
- Guest read path: `GET /api/guest/table-session/[token]?sync=1` runs the lease-gated sync and returns `posSync` staleness metadata alongside the state.
- Lease evidence (`tests/integration/sync-lease.test.ts`, real DB, 3/3): 10 concurrent stale reads → exactly 1 upstream fetch; fresh snapshot → 0 upstream calls; failure → snapshot preserved + explicit unavailability + next-window recovery.
- **Ingest scalability fix found by the SLO bench** (`ingest-orders.ts` + repository): batch lookups (ONE bills query + ONE tables query per pull), unchanged-document skip (zero writes), and POS-side closure handling — estado C/G/A/F now closes the local bill exactly once (`markBillClosedFromPos`, conditional ⇒ idempotent) and never creates local bills for already-closed documents. Pre-fix, every pull re-wrote every accumulated closed PRE (O(docs) round trips growing per pull — a production defect, not just bench noise).
- Round-trip surgery driven by the bench: lease election is now ONE conditional UPDATE on the hot path (read only on miss/first-run); bills+tables batch lookups run in parallel; `createBillWithItems` is a single nested-create statement (was N+1 inside an iTX). Sync fetch = ~5 sequential DB round trips total.

## SLO measurement (`scripts/sync-slo-bench.mts`) — 30 samples, 10 diners, real chain

`v2 façade POST → ContificoAdapter.pullOrders → ingest → Supabase commit → bill visible`, upstream pulls counted via adapter wrapper; freshness window 750 ms.

| Metric | Value |
|---|---|
| samples / failures | 30 / 0 |
| p50 / p95 / max | **4027 ms / 6132 ms / 7529 ms** (workstation) |
| diner sync attempts → upstream pulls | **578 → 30** (exactly 1 pull per sample; 19.3× coalescing) |

**Coalescing: PASS** — ten diners provably do not multiply upstream calls (lease election measured at exactly one fetch per freshness window, plus the dedicated lease test: 10 concurrent stale reads → 1 pull).

**p95 ≤ 2 s: NOT VERIFIED in this measurement environment.** Measured per-query RTT from this workstation to the test Supabase (us-east-2 pooler) is ~530–790 ms; the ~5-round-trip sync chain has a geometric floor of ~3 s here regardless of implementation. In the deployment topology (Vercel us-east functions ↔ same-region Supabase, RTT ≤ 20 ms; POS deployment co-located with its DB) the same chain budgets to ~0.3–0.5 s — comfortably inside the SLO — but that is a projection, not a measurement. **Manuel: re-run the measurement from a same-region environment** (preview deployment or us-east shell):
`BENCH_POS_URL=<pos-url> BENCH_POS_KEY=<key> SAMPLES=30 DINERS=10 node --env-file=.env --import tsx scripts/sync-slo-bench.mts`
The claim stays simulator-only either way — real-Contífico latency is untested until a sandbox exists.

---

# Phase 5 — Security and obsolete assumptions

- Hardcoded Contífico sandbox key REMOVED from `scripts/test-contifico.mjs` (env-required now). **The old key value is burned — rotation with Contífico support is a DEPLOY BLOCKER for any real-credential work** (owner: Manuel).
- `mesita2024secret` (deployed demo-POS key) removed from app repo: 4 scripts now require `POS_API_KEY` env; `DemoConfiguracionPanel.tsx` no longer renders the key value to browsers. (The POS repo keeps its own demo key in its demo UI — accepted risk, demo-only product, owner Manuel, revisit before the POS fronts anything real.)
- `.env.example`: no usable values; `NEXT_PUBLIC_APP_URL` example is now `https://mesita-app.vercel.app` with preview-override notes; `CONTIFICO_*` variables documented (`CONTIFICO_BASE_URL` override, `CONTIFICO_ATTACH_CLIENTE` opt-in).
- `docs/INTEGRATION_PLAN.md` marked **SUPERSEDED** (v1/Kushki/Redis/multi-demo-table assumptions) pointing to the frozen contract + handoffs.
- `src/lib/pos-mesita/` quarantined with an explicit demo-only header (one-adapter rule); verified only demo-* code imports it.
- Owner read-only default/test mismatch fixed: tests now set the env EXPLICITLY for both directions (mutation-enabled 201 and read-only 403 including the default posture) — the sole baseline test failure is gone.
- Secret scan: app repo clean (git grep patterns for key-like literals, AWS keys, PEM headers — no hits outside placeholders).

## Read-only security audit (one pass, both repos) — findings and resolutions

- **CONFIRMED MEDIUM (fixed):** POS `env.js` fallback `demo-api-key-change-in-production` silently satisfied v1+v2 auth on production deploys missing `API_KEY`; same class for `MESITAQR_WEBHOOK_SECRET` (HMAC forgery with a public default). Both now **fail closed in production** (empty key can never match; webhook verification rejects when no secret configured).
- **Hygiene (fixed):** timing-safe credential comparison in the POS v2 auth and the app cron-ingest auth; v2 auth error detail now only in explicit `development`; `POS_PRECHECK_FAILED_FAIL_OPEN` log now hashes ids via `redact()`/`hashForLog` like its siblings.
- **Accepted risks (documented, owner Manuel):** POS demo key visible in the POS repo's own demo UI (demo-only product; rotate before fronting anything real); `uuid` moderate advisory in POS (breaking-only fix; vulnerable API unused); fault-profile socket-holding in the simulator (bounded consequence of the public demo key; simulator-only).
- **Deploy blocker (unchanged):** the burned Contífico sandbox key lives in git history — rotation with Contífico support required before any real-credential work.
- **Checked clean by the auditor:** no PAN/CVV stored/logged/sent anywhere (opaque paymentToken only, never persisted/logged; server-computed amount charged); STUB boundary unreachable from non-demo restaurants (503→503→400 before any charge; demo detection is a closed 5-token allowlist; real tokens are server-minted UUIDv4); all raw SQL parameterized or identifier-sanitized; v2 public endpoints leak nothing; `?sync=1` cannot amplify upstream traffic (lease-gated); no remaining read-check-write races in live paths; deprecated `claimBillItemOptimistic` has zero imports.

## Unresolved sandbox questions (blocked on real credentials)

1. List envelope shape (array vs `{count,results}`).
2. `GET /documento/{id}/` availability (undocumented; sandbox-observed 2026-06-02).
3. Persona create `?pos=` semantics and cedula conditionality.
4. Partial `PUT /documento/{id}` with cliente only.
5. Real error body shapes; real acceptance of `numero_comprobante` on TC cobros.
