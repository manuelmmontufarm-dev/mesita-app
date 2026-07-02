# Fable 5 Relay 01 — Final Handoff (Manuel: Contífico Contract and Data Foundation)

Date: 2026-07-02
Baseline evidence + per-phase detail: [01-manuel-baseline.md](01-manuel-baseline.md) (kept as the running log; this file is the handoff summary Alejandro starts from).

## Commits and branches

| Repo | Branch | Start | End |
|------|--------|-------|-----|
| mesita-app | `fable/01-manuel-foundation` | `81f0b3ef24a72559ec996472330290369f7a8d23` | ``c8eebf81050650020bfac6232992548961955521` (`feat(foundation): Relay 01 …`)` |
| Mesita-POS | `fable/01-manuel-contifico-v2` | `bec7c188aed9b118a274d15d2af49a4594366958` | `be1ed3d` (`feat(v2): Contífico v2-compatible façade per frozen Relay-01 contract`) |

Neither branch touches `main`. Merge order proposal at the end.

## The frozen contract (what Alejandro may trust)

- **Contract:** `contracts/contifico-v2/README.md` — the executable Contífico v2 subset (auth, PRE list/fetch, totals, persona, cobros, estados, faults, table mapping, UNVERIFIED items). Golden fixtures: `contracts/contifico-v2/fixtures/` (canonical; the POS repo carries a copy under `tests/contract/fixtures/`).
- **Contract test command (app):** `npx vitest run src/modules/pos/contract` (19 tests).
- **Black-box suite vs live simulator v2:** documented in the baseline log — auth parity (raw key 200 / `Token` 401 / none 401), MESITA_TABLE parsing, partial→full cobro estado transitions, closed-doc cobro rejection with NO false success, 404 semantics — all PASS against `http://localhost:<port>/sistema/api/v2`.
- **Switching simulator ↔ real Contífico is configuration only:** base URL (`CONTIFICO_BASE_URL` override or environment presets) + API key. No code path inspects the URL.

## Simulator (Mesita-POS)

- `/sistema/api/v2` façade implements the frozen contract with strict validation and deterministic fault profiles (`X-Fault-Profile`: `latency:<ms>`, `timeout`, `error:400|401|403|500`, `stale`). Public `/health/` and `/contract-version/`.
- v1 + POS UI untouched and green; PRE/FAC documents created against an orden auto-carry `MESITA_TABLE:<mesaId>` in the configured field (`MESITA_TABLE_FIELD`, default `adicional1`).
- Duplicate cobro retries are NOT deduplicated upstream (worst-case semantics) — the app owns idempotency via `numero_comprobante` reconciliation. Tests: 47/47.

## Data & concurrency foundation (Supabase/Prisma is the sole durable owner)

- Migration `20260702000000_foundation_concurrency` (applied to the test Supabase; rollback notes in the file): `bill_guest_sessions.clientToken` + unique `(billId, clientToken)`; `tables.qrEnabled/qrStatusChangedAt/qrStatusChangedBy`; `pos_sync_state` lease table.
- Payments: per-bill `FOR UPDATE` serialization + integer-cent authoritative balance guard + idempotency winner-return (N identical retries ⇒ 1 completed payment). Claims: item-row lock, ACTIVE+PAID units ≤ quantity, losers get explicit 409. Joins: clientToken identity — reconnects can never mint a duplicate guest.
- Evidence: `tests/integration/concurrency-invariants.test.ts` — **10 repeated rounds × 9/9 against the real test Supabase** (10 unique guests under concurrent joins; 1 guest under same-token joins; 20-way claim race → 1 owner + 19 conflicts; fractional races ≤ quantity; 20 identical payment retries → 1 payment; balance cap holds under parallel payments).

## Active sync + provider boundary

- `sync-if-stale` with atomic Supabase lease election (`pos_sync_state`): N readers → ≤1 upstream fetch per freshness window; losers serve the last committed snapshot instantly; upstream failure preserves the snapshot and reports explicit `{fresh:false, upstreamAvailable:false}`. Wired into `GET /api/guest/table-session/[token]?sync=1` (returns `posSync` metadata). Daily cron = recovery backstop only.
- Ingest is O(1) DB round trips per pull (batch reads, unchanged-doc skip) and reflects POS-side closure exactly once; closed docs never create local bills.
- **Measured (workstation):** 30/30 samples, 0 failures, **578 diner reads → exactly 30 upstream pulls (coalescing PASS)**; p50 4027 ms / p95 6132 ms / max 7529 ms. The p95 misses 2 s **because of measurement geometry**: ~530–790 ms per DB query from this workstation to us-east-2 × ~5 sequential round trips. Deployment topology (same-region Vercel↔Supabase, ≤20 ms RTT) budgets ~0.3–0.5 s. **Re-measure from a same-region environment** (command in the baseline log §Phase 4) before claiming the SLO. Simulator-only either way.
- Payments: STUB valid ONLY for the demo tenant (Table 12 experience). Stub tokens on real restaurants are rejected; unconfigured restaurants get explicit 503 unavailable. DINERS = enum/config placeholder; its adapter declines everything; no invented endpoints/tokens/webhooks. No PAN/CVV touches the backend (audited).

## Security state

- Contífico sandbox key removed from tracked source — **the old value is burned and rotation with Contífico support is a deploy blocker** (it remains in git history).
- `mesita2024secret` removed from app scripts/UI. `.env.example` has no usable values; `NEXT_PUBLIC_APP_URL` example = `https://mesita-app.vercel.app`.
- POS fails closed in production when `API_KEY`/`MESITAQR_WEBHOOK_SECRET` are unset (audit finding, fixed). Timing-safe auth compares in POS v2 + app cron.
- Accepted risks (owner Manuel): POS demo key in the POS demo UI; `uuid` moderate advisory in POS; fault-profile socket-holding (simulator-only).
- `docs/INTEGRATION_PLAN.md` marked SUPERSEDED. `src/lib/pos-mesita/` quarantined demo-only.

## Test summaries (final runs)

| Suite | Result |
|---|---|
| App `npx prisma validate` | PASS |
| App `npx tsc --noEmit` | PASS (0 errors) |
| App `npm test` | **477/477** (42 files — includes the DB-backed concurrency + lease integration suites) |
| App `npm run build` | PASS |
| App `npm audit --audit-level=high` | 7 vulns (2 high, 1 critical) — ALL in the dev-only vite/vitest chain, not shipped code; fix requires major-version bumps; accepted for this relay, owner Manuel |
| App `git diff --check` | clean |
| POS `npm test -- --runInBand` | 47/47 |
| POS `npm audit --audit-level=high` | 1 moderate (uuid; accepted) |
| POS `git diff --check` | clean |
| Contract suite vs POS v2 (black-box) | PASS |
| Concurrency invariants ×10 rounds | 90/90 |
| Sync lease election | 3/3 |

## Environment variables (names only)

App: `DATABASE_URL` (pooler), `DIRECT_URL` (migrations), `ENCRYPTION_KEY`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` (**production: `https://mesita-app.vercel.app`**), `PAYMENT_PROVIDER`, `UPSTASH_REDIS_REST_URL/TOKEN` (demo/rate-limit only), `POS_MESITA_API_URL/KEY` (demo companion only), `CONTIFICO_BASE_URL` (simulator override), `CONTIFICO_API_KEY` (smoke script), `CONTIFICO_TABLE_FIELD`, `CONTIFICO_ATTACH_CLIENTE` (opt-in, default off), `OWNER_READONLY`/`NEXT_PUBLIC_OWNER_READONLY` (default ON).
POS: `API_KEY` (fail-closed in prod), `DATABASE_URL`, `MESITA_TABLE_FIELD`, `MESITAQR_WEBHOOK_SECRET` (fail-closed in prod), `PLATFORM_BOOTSTRAPPED`.

## Migration & configuration actions for Manuel

1. **Rotate the burned Contífico sandbox key** with Contífico support (deploy blocker for real-credential work).
2. Production migration when promoting: `npx prisma migrate deploy` with `DIRECT_URL` (already applied to the TEST Supabase; dry-run verified there).
3. Set `NEXT_PUBLIC_APP_URL=https://mesita-app.vercel.app` in the production Vercel project (preview scopes get their own URLs).
4. Re-run the sync SLO bench from a same-region environment and record p50/p95/max in this file.
5. POS deploys must set `API_KEY` and `MESITAQR_WEBHOOK_SECRET` explicitly (now fail-closed).
6. Keep `CONTIFICO_ATTACH_CLIENTE` unset until a real sandbox verifies persona create + cliente PUT.

## What Alejandro may rely on / must not redesign

**Rely on (stable foundation):**
- `contracts/contifico-v2/` + `src/modules/pos/contract/` (frozen — changes require a new contract review)
- `src/modules/pos/adapters/contifico.adapter.ts`, `pos-config.ts` (ONE adapter; config-only switching)
- `src/modules/pos/application/{ingest-orders,sync-if-stale}.ts` + `pos_sync_state`
- `src/modules/payments/**` transaction/idempotency semantics; `src/modules/guest-session/**` join/claim semantics + `clientToken`
- `prisma/schema.prisma` incl. `Table.qrEnabled/qrStatusChangedAt/qrStatusChangedBy` (his UI's data layer)
- Guest route contract: `GET /api/guest/table-session/[token]?sync=1` → `posSync` metadata; join action accepts `clientToken`

**Must NOT redesign in Relay 02:** the frozen wire contract, the lease/sync mechanism, the payment provider boundary (STUB/demo-only + DINERS placeholder), the one-adapter rule, the MESITA_TABLE mapping rule.

**Known limitations:** real Contífico NEVER validated (sandbox key pending rotation — every UNVERIFIED item in the contract stands); sync SLO verified for coalescing but p95 pending same-region re-measurement; POS-closed bills are marked FULLY_PAID locally without app-side payment rows (POS-authoritative closure — revisit if refund flows need distinction); demo (Redis) table experience unchanged and out of scope.

## Candidate merge order

1. `Mesita-POS: fable/01-manuel-contifico-v2` → `fable/integration-contifico` (façade is additive; v1 untouched).
2. `mesita-app: fable/01-manuel-foundation` → `fable/integration-final` (migration is additive; deploy migration before or with the code).
3. Alejandro branches from the exact `fable/integration-final` merge commit only after this file + both diffs are reviewed.

## Checklist final (entrega)

- [x] CONTRATO: la misma suite pasa contra Mesita POS v2 — **PASS** (19 contract tests + black-box vs servidor vivo)
- [x] CAMBIO: simulador/Contífico cambia solo por configuración — **PASS** (base URL + credenciales; sin inspección de URL)
- [x] DATOS: Supabase es la única fuente durable para sesión y pagos — **PASS** (guests/claims/payments/lease en Prisma; Redis solo demo/rate-limit)
- [x] CONCURRENCIA: diez invitados y carreras de reclamo pasan repetidamente — **PASS** (10 rondas × 9/9 contra Supabase real)
- [x] DINERO: idempotencia y límites de saldo usan aritmética exacta — **PASS** (centavos enteros; 20 reintentos → 1 pago; tope de saldo bajo carrera)
- [ ] SYNC: p95 del simulador ≤ 2 s — **NOT VERIFIED** (coalescing PASS medido: 578 lecturas → 30 fetches; p95 6.1 s por geometría estación↔us-east-2 a ~600 ms/RT; presupuesto en topología de despliegue ~0.3–0.5 s; re-medir en misma región — factor externo al código)
- [x] SEGURIDAD: no hay secretos ni PAN/CVV en código, logs o diff — **PASS** (auditoría de solo-lectura; clave quemada marcada para rotación como bloqueo de despliegue)
- [x] DEUDA: la falta de sandbox real está claramente marcada — **PASS** (items UNVERIFIED en el contrato + este documento)
- [x] ENTREGA: ambos branches y el documento final fueron publicados — **PASS** (hashes arriba; push confirmado)
