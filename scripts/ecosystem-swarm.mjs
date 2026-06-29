#!/usr/bin/env node
/**
 * Ecosystem swarm — 5 demo mesas × 10 tests + estadísticas page (51 total).
 * APP + DASHBOARD + POS connectivity.
 *
 * SMOKE_URL=http://localhost:3000 POS_URL=https://mesita-pos.vercel.app POS_API_KEY=... npm run demo:swarm
 */

export const BASE_URL = (process.env.SMOKE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const POS_URL = (process.env.POS_URL ?? "https://mesita-pos.vercel.app").replace(/\/$/, "");
export const POS_API_KEY = process.env.POS_API_KEY ?? "mesita2024secret";
const isRemote =
  !BASE_URL.includes("localhost") && !BASE_URL.includes("127.0.0.1");
export const LATENCY_MS = Number(
  process.env.SWARM_LATENCY_MS ?? (isRemote ? 8000 : 2000),
);
const RETRIES = Number(process.env.SWARM_RETRIES ?? (isRemote ? 3 : 1));

/** @type {readonly { token: string; label: string; tableName: string; posMesaId: string; catalogItems: boolean }[]} */
export const MESAS = [
  { token: "demo", label: "mesa-12", tableName: "12", posMesaId: "mesa-12", catalogItems: true },
  { token: "demo-mesa-1", label: "mesa-1", tableName: "1", posMesaId: "mesa-01", catalogItems: false },
  { token: "demo-mesa-2", label: "mesa-2", tableName: "2", posMesaId: "mesa-02", catalogItems: false },
  { token: "demo-mesa-3", label: "mesa-3", tableName: "3", posMesaId: "mesa-03", catalogItems: false },
  { token: "demo-mesa-4", label: "mesa-4", tableName: "4", posMesaId: "mesa-04", catalogItems: false },
];

/** @type {readonly { id: string; layer: string; description: string }[]} */
export const TEST_DEFS = [
  { id: "join", layer: "APP", description: "POST join returns guest + state" },
  { id: "get-state", layer: "APP", description: "GET state returns table metadata" },
  { id: "reset", layer: "APP", description: "POST reset clears guests" },
  { id: "latency-join", layer: "APP", description: "join responds in <2s" },
  { id: "latency-get", layer: "APP", description: "GET state responds in <2s" },
  { id: "dashboard-tables", layer: "DASHBOARD", description: "demo-dashboard tables include mesa" },
  { id: "dashboard-kpis", layer: "DASHBOARD", description: "demo-dashboard KPIs shape valid" },
  { id: "pos-tables", layer: "POS", description: "demo-pos tables + POS bootstrap mesa" },
  { id: "items-profile", layer: "APP", description: "mesa-12 catalog items vs mesas 1-4 POS mirror" },
  { id: "guest-activity", layer: "POS", description: "join registers guest_joined activity" },
];

const DEMO_HEADERS = { Cookie: "mesita-demo-mode=1", Accept: "application/json" };
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

/** @typedef {{ ok: boolean; ms: number; error?: string; skipped?: boolean }} TestResult */

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchJson(url, init = {}) {
  const t0 = Date.now();
  const res = await fetch(url, init);
  const ms = Date.now() - t0;
  const json = await res.json().catch(() => null);
  return { res, json, ms };
}

function tableApi(token) {
  return `${BASE_URL}/api/demo/table/${token}`;
}

/** @type {Map<string, unknown> | null} */
let dashboardCache = null;
/** @type {unknown[] | null} */
let posTablesCache = null;
/** @type {Set<string> | null} */
let posMesaIdsCache = null;

async function loadDashboard() {
  if (dashboardCache) return dashboardCache;
  const { res, json } = await fetchJson(`${BASE_URL}/api/demo-dashboard`, {
    headers: DEMO_HEADERS,
  });
  if (!res.ok || !json?.success) throw new Error(`demo-dashboard ${res.status}`);
  dashboardCache = json.data;
  return dashboardCache;
}

async function loadPosTables() {
  if (posTablesCache) return posTablesCache;
  const { res, json } = await fetchJson(`${BASE_URL}/api/demo-pos?view=tables`, {
    headers: DEMO_HEADERS,
  });
  if (!res.ok || !json?.success) throw new Error(`demo-pos tables ${res.status}`);
  posTablesCache = json.data?.tables ?? [];
  return posTablesCache;
}

async function loadPosMesaIds() {
  if (posMesaIdsCache) return posMesaIdsCache;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { res, json } = await fetchJson(`${POS_URL}/sistema/api/v1/bootstrap/`, {
        headers: { Authorization: `Token ${POS_API_KEY}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`POS bootstrap ${res.status}`);
      const ids = new Set(
        (json.mesas ?? []).filter((m) => m.activa !== false).map((m) => m.id),
      );
      posMesaIdsCache = ids;
      return posMesaIdsCache;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * @param {typeof MESAS[number]} mesa
 * @param {typeof TEST_DEFS[number]} test
 * @returns {Promise<TestResult>}
 */
async function runTest(mesa, test) {
  const t0 = Date.now();
  try {
    switch (test.id) {
      case "join": {
        await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "reset" }),
        });
        const { res, json } = await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "join", deviceId: `swarm-${mesa.token}` }),
        });
        if (!res.ok || !json?.success) {
          return { ok: false, ms: Date.now() - t0, error: `status ${res.status}` };
        }
        const guest = json.data?.guest;
        const state = json.data?.state;
        if (!guest?.id || !state?.table?.name) {
          return { ok: false, ms: Date.now() - t0, error: "missing guest/state" };
        }
        if (String(state.table.name) !== mesa.tableName) {
          return {
            ok: false,
            ms: Date.now() - t0,
            error: `table name ${state.table.name} != ${mesa.tableName}`,
          };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "get-state": {
        const { res, json } = await fetchJson(tableApi(mesa.token), { method: "GET" });
        if (!res.ok || !json?.success) {
          return { ok: false, ms: Date.now() - t0, error: `status ${res.status}` };
        }
        const state = json.data;
        if (!state || state.token !== mesa.token) {
          return { ok: false, ms: Date.now() - t0, error: "token mismatch" };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "reset": {
        await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "join", deviceId: `swarm-reset-${mesa.token}` }),
        });
        const { res, json } = await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "reset" }),
        });
        if (!res.ok || !json?.success) {
          return { ok: false, ms: Date.now() - t0, error: `reset status ${res.status}` };
        }
        const guests = json.data?.guests ?? [];
        if (guests.length !== 0) {
          return { ok: false, ms: Date.now() - t0, error: `guests=${guests.length}` };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "latency-join": {
        await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "reset" }),
        });
        const { res, ms } = await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "join", deviceId: `swarm-latency-${mesa.token}` }),
        });
        if (!res.ok) return { ok: false, ms, error: `status ${res.status}` };
        if (ms >= LATENCY_MS) return { ok: false, ms, error: `${ms}ms >= ${LATENCY_MS}ms` };
        return { ok: true, ms };
      }

      case "latency-get": {
        const { res, ms } = await fetchJson(tableApi(mesa.token), { method: "GET" });
        if (!res.ok) return { ok: false, ms, error: `status ${res.status}` };
        if (ms >= LATENCY_MS) return { ok: false, ms, error: `${ms}ms >= ${LATENCY_MS}ms` };
        return { ok: true, ms };
      }

      case "dashboard-tables": {
        const dash = await loadDashboard();
        const tables = /** @type {Array<{ id?: string; token?: string; name?: string }>} */ (
          dash.tables ?? []
        );
        const match = tables.find(
          (t) => t.id === mesa.token || t.token === mesa.token || t.name?.includes(mesa.tableName),
        );
        if (!match) {
          return {
            ok: false,
            ms: Date.now() - t0,
            error: `mesa ${mesa.token} not in dashboard (${tables.length} tables)`,
          };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "dashboard-kpis": {
        const dash = await loadDashboard();
        const kpis = dash.kpis;
        if (!kpis || typeof kpis.revenueToday !== "number" || typeof kpis.activeTables !== "number") {
          return { ok: false, ms: Date.now() - t0, error: "invalid KPIs" };
        }
        if (typeof kpis.avgTicket !== "number" || typeof kpis.propinaRate !== "number") {
          return { ok: false, ms: Date.now() - t0, error: "missing avgTicket/propinaRate" };
        }
        if (!Array.isArray(dash.hourlyActivity) || dash.hourlyActivity.length !== 12) {
          return { ok: false, ms: Date.now() - t0, error: "hourlyActivity invalid" };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "pos-tables": {
        const tables = await loadPosTables();
        const match = tables.find(
          (t) => t.id === mesa.token || t.token === mesa.token,
        );
        if (!match) {
          return {
            ok: false,
            ms: Date.now() - t0,
            error: `demo-pos missing ${mesa.token}`,
          };
        }
        if (!mesa.catalogItems) {
          try {
            const ids = await loadPosMesaIds();
            if (!ids.has(mesa.posMesaId)) {
              return {
                ok: false,
                ms: Date.now() - t0,
                error: `POS missing ${mesa.posMesaId}`,
              };
            }
          } catch (err) {
            return {
              ok: false,
              ms: Date.now() - t0,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "items-profile": {
        await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "reset" }),
        });
        const { res, json } = await fetchJson(tableApi(mesa.token), { method: "GET" });
        if (!res.ok || !json?.success) {
          return { ok: false, ms: Date.now() - t0, error: `status ${res.status}` };
        }
        const items = json.data?.items ?? [];
        if (mesa.catalogItems) {
          if (items.length < 4) {
            return {
              ok: false,
              ms: Date.now() - t0,
              error: `mesa-12 expected catalog items, got ${items.length}`,
            };
          }
          const names = items.map((i) => i.name ?? "").join(" ");
          if (!/locro|seco|encebollado/i.test(names)) {
            return { ok: false, ms: Date.now() - t0, error: "mesa-12 missing baseline items" };
          }
          return { ok: true, ms: Date.now() - t0 };
        }
        const seedIds = ["bolon", "fritada", "ceviche-mixto", "parrillada"];
        const hasSeed = items.some((i) => seedIds.includes(i.id));
        if (hasSeed) {
          return {
            ok: false,
            ms: Date.now() - t0,
            error: `catalog seed leaked: ${items.map((i) => i.id).join(",")}`,
          };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      case "guest-activity": {
        const deviceId = `swarm-activity-${mesa.token}-${Date.now()}`;
        await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "reset" }),
        });
        const joinRes = await fetchJson(tableApi(mesa.token), {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ action: "join", deviceId }),
        });
        if (!joinRes.res.ok) {
          return { ok: false, ms: Date.now() - t0, error: `join ${joinRes.res.status}` };
        }
        await new Promise((r) => setTimeout(r, 300));
        const { res, json } = await fetchJson(`${BASE_URL}/api/demo-pos?view=activity`, {
          headers: DEMO_HEADERS,
        });
        if (!res.ok || !json?.success) {
          return { ok: false, ms: Date.now() - t0, error: `activity ${res.status}` };
        }
        const activities = json.data?.activities ?? [];
        const joined = activities.find(
          (a) =>
            a.type === "guest_joined" &&
            (a.tableToken === mesa.token ||
              a.tableName === `Mesa ${mesa.tableName}`),
        );
        if (!joined) {
          return {
            ok: false,
            ms: Date.now() - t0,
            error: `no guest_joined for ${mesa.token}`,
          };
        }
        return { ok: true, ms: Date.now() - t0 };
      }

      default:
        return { ok: false, ms: Date.now() - t0, error: `unknown test ${test.id}` };
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{ skipPos?: boolean }} [opts]
 * @returns {Promise<{ matrix: Record<string, Record<string, TestResult>>; failed: number; passed: number; total: number }>}
 */
export async function runEcosystemSwarm(opts = {}) {
  dashboardCache = null;
  posTablesCache = null;
  posMesaIdsCache = null;

  /** @type {Record<string, Record<string, TestResult>>} */
  const matrix = {};
  let failed = 0;
  let passed = 0;

  for (const mesa of MESAS) {
    matrix[mesa.label] = {};
    for (const test of TEST_DEFS) {
      if (opts.skipPos && test.layer === "POS") {
        matrix[mesa.label][test.id] = { ok: true, ms: 0, skipped: true };
        passed++;
        continue;
      }
      let result = await runTest(mesa, test);
      for (let attempt = 1; attempt < RETRIES && !result.ok; attempt++) {
        const retryable =
          result.error?.includes("fetch failed") ||
          result.error?.includes(">= ") ||
          result.error?.includes("ECONNRESET") ||
          result.error?.includes("timeout");
        if (!retryable) break;
        await new Promise((r) => setTimeout(r, 800 * attempt));
        result = await runTest(mesa, test);
      }
      matrix[mesa.label][test.id] = result;
      if (result.ok) passed++;
      else failed++;
    }
  }

  const statsT0 = Date.now();
  let statsOk = false;
  for (let attempt = 0; attempt < RETRIES && !statsOk; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/dashboard/owner/estadisticas`, {
        headers: { Cookie: "mesita-demo-mode=1" },
      });
      if (res.ok) {
        statsOk = true;
        passed++;
        console.log(`  PASS global/estadisticas-page (${Date.now() - statsT0}ms)`);
      } else if (attempt === RETRIES - 1) {
        failed++;
        console.log(`  FAIL global/estadisticas-page: HTTP ${res.status}`);
      } else {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    } catch (err) {
      if (attempt === RETRIES - 1) {
        failed++;
        console.log(
          `  FAIL global/estadisticas-page: ${err instanceof Error ? err.message : String(err)}`,
        );
      } else {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }

  const total = MESAS.length * TEST_DEFS.length + 1;
  return { matrix, failed, passed, total };
}

function pad(s, n) {
  return String(s).padEnd(n, " ");
}

function printMatrix(matrix) {
  const cols = TEST_DEFS.map((t) => t.id);
  const colW = 18;
  console.log("\n" + pad("MESA \\ TEST", 12), cols.map((c) => pad(c, colW)).join(""));
  console.log("-".repeat(12 + cols.length * colW));

  for (const mesa of MESAS) {
    const cells = cols.map((id) => {
      const r = matrix[mesa.label][id];
      if (r.skipped) return pad("SKIP", colW);
      const mark = r.ok ? "PASS" : "FAIL";
      return pad(`${mark} ${r.ms}ms`, colW);
    });
    console.log(pad(mesa.label, 12), cells.join(""));
  }

  console.log("\nTest catalog:");
  for (const t of TEST_DEFS) {
    console.log(`  [${t.layer}] ${t.id}: ${t.description}`);
  }
}

async function main() {
  console.log(`Ecosystem swarm — ${BASE_URL}`);
  console.log(`POS — ${POS_URL} (key ${POS_API_KEY ? "set" : "missing"})`);
  console.log(`Latency budget: ${LATENCY_MS}ms | retries: ${RETRIES}`);

  const { matrix, failed, passed, total } = await runEcosystemSwarm();
  printMatrix(matrix);

  if (failed > 0) {
    console.log(`\n${passed}/${total} passed (${failed} FAILED)`);
    for (const mesa of MESAS) {
      for (const test of TEST_DEFS) {
        const r = matrix[mesa.label][test.id];
        if (!r.ok && !r.skipped) {
          console.log(`  FAIL ${mesa.label}/${test.id}: ${r.error ?? "unknown"}`);
        }
      }
    }
    process.exit(1);
  }

  console.log(`\n${passed}/${total} passed`);
  process.exit(0);
}

const isMain =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("ecosystem-swarm.mjs") ||
    process.argv[1].includes("ecosystem-swarm"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
