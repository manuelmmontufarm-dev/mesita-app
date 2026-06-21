#!/usr/bin/env node
/**
 * Smoke test: POST {action:"join",deviceId:"smoke-test"} to each demo token.
 * Prints PASS/FAIL table. Exits non-zero on any FAIL.
 *
 * SMOKE_URL=http://localhost:3000 npm run demo:smoke
 */

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const TOKENS = ["demo", "demo-mesa-1", "demo-mesa-2", "demo-mesa-3", "demo-mesa-4"];

const results = [];

for (const token of TOKENS) {
  const url = `${BASE}/api/demo/table/${token}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", deviceId: "smoke-test" }),
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
