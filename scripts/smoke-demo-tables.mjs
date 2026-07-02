#!/usr/bin/env node
/**
 * Smoke test: demo table join + POS health + mesa alignment.
 * SMOKE_URL=https://mesitademo-two.vercel.app POS_URL=https://mesita-pos.vercel.app npm run demo:smoke
 */

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const POS = (process.env.POS_URL ?? "https://mesita-pos.vercel.app").replace(/\/$/, "");
const POS_KEY = process.env.POS_API_KEY;
if (!POS_KEY) { console.error("POS_API_KEY env var is required."); process.exit(1); }
const TOKENS = ["demo", "demo-mesa-1", "demo-mesa-2", "demo-mesa-3", "demo-mesa-4"];
const EXPECTED_MESAS = [
  "mesa-01", "mesa-02", "mesa-03", "mesa-04",
  "mesa-05", "mesa-06", "mesa-07", "mesa-08", "mesa-12",
];
const EXPECTED_ZONES = ["Interior", "Terraza", "Demo"];

const results = [];

async function checkPosHealth() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${POS}/sistema/api/v1/health/db/`);
    const ms = Date.now() - t0;
    const json = await res.json().catch(() => ({}));
    results.push({
      token: "pos-health/db",
      status: res.status,
      ok: res.ok && json.database === "connected",
      ms,
    });
  } catch (err) {
    results.push({
      token: "pos-health/db",
      status: 0,
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function checkPosMesas() {
  const t0 = Date.now();
  try {
    const res = await fetch(`${POS}/sistema/api/v1/bootstrap/`, {
      headers: { Authorization: `Token ${POS_KEY}`, Accept: "application/json" },
    });
    const ms = Date.now() - t0;
    const json = await res.json().catch(() => ({}));
    const mesas = (json.mesas || []).filter((m) => m.activa !== false);
    const ids = mesas.map((m) => m.id).sort();
    const zones = [...new Set(mesas.map((m) => m.ubicacion).filter(Boolean))].sort();
    const restaurant = json.restaurant?.name || "";
    const missing = EXPECTED_MESAS.filter((id) => !ids.includes(id));
    const badZones = zones.filter((z) => !EXPECTED_ZONES.includes(z));
    const ok =
      res.ok &&
      missing.length === 0 &&
      badZones.length === 0 &&
      /Doña Pepa|Dona Pepa/i.test(restaurant);
    results.push({
      token: "pos-mesas",
      status: res.status,
      ok,
      ms,
      error: ok
        ? undefined
        : `missing=${missing.join(",")} badZones=${badZones.join(",")} restaurant=${restaurant}`,
    });
  } catch (err) {
    results.push({
      token: "pos-mesas",
      status: 0,
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

await checkPosHealth();
await checkPosMesas();

for (const token of TOKENS) {
  const url = `${BASE}/api/demo/table/${token}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", deviceId: `smoke-${token}` }),
    });
    const ms = Date.now() - t0;
    results.push({
      token,
      status: res.status,
      ok: res.ok,
      ms,
    });
  } catch (err) {
    results.push({
      token,
      status: 0,
      ok: false,
      ms: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const pad = (s, n) => String(s).padEnd(n, " ");
console.log(pad("TOKEN", 16), pad("STATUS", 8), pad("MS", 6), "RESULT");
let failed = 0;
for (const r of results) {
  const result = r.ok ? "PASS" : `FAIL${r.error ? ` (${r.error})` : ""}`;
  if (!r.ok) failed++;
  console.log(pad(r.token, 16), pad(r.status, 8), pad(r.ms, 6), result);
}

console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
