# AGENTS.md — Active AI Agents on mesita-app

This file tells every AI working on this repo who else is here, what each one owns,
and how to avoid stomping on each other's work.

**Rule:** Before starting any task, read HANDOFF.md to see what's in flight.
After finishing (or pausing), update HANDOFF.md with your status.

---

## Active Agents

### 1. Claude Code (Anthropic — Claude Sonnet 4.6)
- **Launched via:** Claude Code VSCode extension / CLI
- **Primary role:** Full-stack implementation, bug fixes, feature work
- **Strengths:** File edits, running tests, reading the whole codebase, git ops
- **Does NOT:** push to remote or deploy without user confirmation
- **Handoff style:** Updates HANDOFF.md after each task block

### 2. Codex (OpenAI)
- **Launched via:** Cursor left panel
- **Primary role:** Code generation, refactors, quick edits suggested in Cursor
- **Strengths:** Fast inline suggestions, agentic task execution in Cursor
- **Does NOT:** have access to terminal by default unless granted
- **Handoff style:** Should update HANDOFF.md or leave a `// CODEX:` comment near changed code

### 3. Cursor Agent (Claude / GPT — Cursor Tab)
- **Launched via:** Cursor right panel ("Agents Window")
- **Primary role:** Context-aware code completion, inline Q&A, architecture advice
- **Strengths:** Sees the open file and selection; good for explaining and quick patches
- **Does NOT:** run shell commands unless in agent mode
- **Handoff style:** Updates HANDOFF.md or flags open questions there

---

## Coordination Rules

1. **One agent per task at a time.** If HANDOFF.md shows an agent is mid-task on a file,
   don't touch that file until it marks the task done.

2. **HANDOFF.md is the shared inbox.** Check it first. Write to it last.

3. **TODAY.md is the permanent log.** Every completed change goes there (per CLAUDE.md rules).
   HANDOFF.md is for in-progress / ephemeral notes.

4. **Conflicts:** If two agents edited the same file, the human resolves it.
   Agents should not silently overwrite each other.

5. **Tests before handoff.** If you ran `npm test`, paste the summary in HANDOFF.md
   so the next agent knows the suite is green (or what's failing).

---

## File Ownership Defaults

| Area | Primary agent | Notes |
|---|---|---|
| `src/app/pay/customer.css` | Claude Code | iOS Liquid Glass system — careful with this |
| `src/lib/demo-scenarios.ts` | Any | Add scenarios for bugs before fixing them |
| `src/lib/demo-table-store.ts` | Claude Code | CAS logic is subtle — coordinate before touching |
| `TODAY.md` | All | Every agent writes here after a change |
| `HANDOFF.md` | All | Every agent reads/writes here |
| `AGENTS.md` | Human | Don't auto-edit this file |
| `prisma/` | Claude Code | Schema changes need migration |
| `landing/` | Any | Separate CSS system — don't mix with app Tailwind |

---

## Cursor Cloud specific instructions

This workspace contains **two repos** that form one product: `mesita-app` (this Next.js
customer + operator app) and `Mesita-POS` (a sibling Express POS demo backend). Both use
**npm + Prisma + PostgreSQL**. The startup update script already runs `npm install` +
`prisma generate` for both; the notes below are the non-obvious bits.

### PostgreSQL (provided by the VM, not the update script)
- A local PostgreSQL 16 cluster lives at `/var/lib/postgresql/data` with superuser
  `postgres` / password `postgres` on `localhost:5432`. Databases: `mesita_app` and
  `mesita_pos`.
- The server is **not auto-started** on boot. If `psql -h localhost -U postgres -l` fails,
  start it: `sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/data -l /var/lib/postgresql/data/logfile -o "-c listen_addresses='localhost' -p 5432" start`

### Env files (gitignored — recreate if missing)
- `mesita-app/.env` (read by Prisma CLI) + `mesita-app/.env.local` (read by Next.js) →
  `DATABASE_URL`/`DIRECT_URL` point at `postgresql://postgres:postgres@localhost:5432/mesita_app`.
  `.env.local` also sets `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ENABLE_DEV_LOGIN="true"`, and
  `POS_MESITA_API_URL=http://localhost:3001/sistema/api/v1`.
- `Mesita-POS/.env` → `DATABASE_URL=...mesita_pos`, `PORT=3001`, `API_KEY=demo-api-key-change-in-production`,
  empty `MESITAQR_API_KEY` (mock QR mode). POS runs on **3001** to avoid clashing with the app on 3000.

### Database setup — use `prisma db push`, NOT `migrate deploy`
- A committed migration (`20260512100000_add_payments_facturas_fields`) uses invalid Postgres
  syntax (`CREATE TYPE IF NOT EXISTS`), so `prisma migrate deploy` / `npm run db:setup` fails.
  For local dev, sync the schema directly instead:
  - `mesita-app`: `npx prisma db push` then `npx prisma db seed` (seeds restaurant
    "La Floresta Bistró"; demo logins `owner@lafloresta.ec` / `manager@…` / `carlos@…`, all
    password `Demo1234!`).
  - `Mesita-POS`: `npx prisma db push` then `node scripts/seed.js` (seeds mesas + productos).

### Running the services (dev)
- `mesita-app`: `npm run dev` → http://localhost:3000. Customer demo (no DB needed) at
  `/pay/demo`; operator app (DB-backed) at `/login` → `/dashboard/owner`.
- `Mesita-POS`: `npm run dev` → http://localhost:3001. Swagger at `/sistema/api/v1/docs`,
  health at `/sistema/api/v1/health/`. On boot it auto-creates a `tenant_demo` schema and
  copies `public` rows into it.

### Known pre-existing issues (NOT environment problems)
- `mesita-app` unit tests: ~7 of 421 vitest tests fail (demo-table seeding + customer.css
  contract assertions). `npx tsc --noEmit` reports errors only inside `**/__tests__/**` files.
  The Next.js production build (`npm run build`) still passes.
- `mesita-app` lint: `npm run lint` is unusable (ESLint not configured; `next lint` opens an
  interactive wizard) — CI disables it on purpose.
- `Mesita-POS` tests: most jest tests fail because they assume legacy `Authorization: Token`
  behavior that predates the session-based auth refactor (Prisma is mocked, so no DB needed).
- The POS MesitaQR webhook (`/mesitaqr/webhook/`) returns 200 but does not transition the
  session to `pagado`: it reads the `public` schema while sessions are created in `tenant_demo`.
  The rest of the POS QR flow (orden → detalle → totales → solicitar-pago → estado) works.
