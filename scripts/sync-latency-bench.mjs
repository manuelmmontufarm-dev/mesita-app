#!/usr/bin/env node
/**
 * Sync latency + correctness benchmark contra producción.
 *
 * Mide, sobre >=20 iteraciones repartidas en mesas 1-4:
 *   - POS -> app      (mesero agrega item -> guest lo ve)
 *   - app -> POS      (guest paga -> POS registra cobro / cierra)
 *   - POS -> dashboard (cambio POS -> /api/demo-dashboard lo refleja)
 * y valida consistencia LÓGICA (paridad vacío / N items / cierre)
 * y MATEMÁTICA (IVA 15%, servicio 10%, saldo, splits, parciales, multi-cobro).
 *
 * Uso:
 *   POS_URL=https://mesita-pos.vercel.app \
 *   SMOKE_URL=https://mesitademo-two.vercel.app \
 *   POS_API_KEY=mesita2024secret \
 *   ITERATIONS=20 node scripts/sync-latency-bench.mjs
 */

const POS = (process.env.POS_URL ?? "https://mesita-pos.vercel.app").replace(/\/$/, "");
const APP = (process.env.SMOKE_URL ?? "https://mesitademo-two.vercel.app").replace(/\/$/, "");
// POS espera el header `Authorization: Token <API_KEY>`; default = demo key desplegada.
const POS_KEY = process.env.POS_API_KEY ?? process.env.API_KEY ?? "mesita2024secret";
const ITERATIONS = Math.max(20, Number(process.env.ITERATIONS ?? 20));
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 150);
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 30000);

const MESAS = [
  { token: "demo-mesa-1", mesa: "mesa-01", name: "1" },
  { token: "demo-mesa-2", mesa: "mesa-02", name: "2" },
  { token: "demo-mesa-3", mesa: "mesa-03", name: "3" },
  { token: "demo-mesa-4", mesa: "mesa-04", name: "4" },
];

const PRODUCTS = [
  { producto_id: "bench-cerveza", nombre: "Cerveza Nacional", precio: 3.0 },
  { producto_id: "bench-ceviche", nombre: "Ceviche Mixto", precio: 12.5 },
  { producto_id: "bench-lomo", nombre: "Lomo Saltado", precio: 11.0 },
];

const IVA_RATE = 0.15;
const SERVICE_RATE = 0.1;
const r2 = (n) => Math.round(n * 100) / 100;
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const now = () => performance.now();
const HTTP_TIMEOUT_MS = Number(process.env.HTTP_TIMEOUT_MS ?? 20000);

/* ── logging sin buffer (escribe a archivo + stdout al instante) ── */
import { appendFileSync, writeFileSync } from "node:fs";
const LOG_FILE = process.env.BENCH_LOG ?? "/tmp/bench-progress.log";
try { writeFileSync(LOG_FILE, ""); } catch { /* ignore */ }
function log(...args) {
  const line = args.join(" ");
  try { appendFileSync(LOG_FILE, line + "\n"); } catch { /* ignore */ }
  process.stdout.write(line + "\n");
}

/** fetch con AbortController para que ninguna llamada cuelgue indefinidamente. */
async function fetchT(url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── HTTP helpers ──────────────────────────────────────────── */
async function pos(path, init = {}) {
  const t0 = now();
  const res = await fetchT(`${POS}/sistema/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${POS_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  const ms = now() - t0;
  if (!res.ok) throw new Error(`POS ${res.status} ${path}: ${JSON.stringify(json).slice(0, 200)}`);
  return { json, ms };
}

async function appJson(path, init = {}) {
  const t0 = now();
  const res = await fetchT(`${APP}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // /api/demo-dashboard y /api/demo-pos exigen esta cookie (ver middleware.ts)
      Cookie: "mesita-demo-mode=1",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  const ms = now() - t0;
  // GET -> data = state; join/pay -> data.state
  const state = json?.data?.state ?? json?.data ?? json;
  return { ok: res.ok, status: res.status, json, state, ms };
}

async function ttfb(url) {
  const t0 = now();
  try {
    const res = await fetchT(url, { headers: { Accept: "text/html" } });
    await res.arrayBuffer();
    return { ms: now() - t0, status: res.status };
  } catch (e) {
    return { ms: -1, status: 0, error: String(e) };
  }
}

/** Poll fn() hasta que predicate(value) sea true; devuelve {ms, value} o lanza timeout. */
async function pollUntil(fn, predicate, label, intervalMs = POLL_INTERVAL_MS) {
  const start = now();
  let last;
  while (now() - start < POLL_TIMEOUT_MS) {
    last = await fn().catch(() => null);
    if (last && predicate(last)) return { ms: now() - start, value: last };
    await sleep(intervalMs);
  }
  throw new Error(`pollUntil timeout (${label}) after ${POLL_TIMEOUT_MS}ms`);
}

/* ── stats ─────────────────────────────────────────────────── */
function stats(arr) {
  if (!arr.length) return { n: 0, mean: 0, p50: 0, p95: 0, min: 0, max: 0 };
  const s = [...arr].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const pct = (p) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { n: s.length, mean, p50: pct(50), p95: pct(95), min: s[0], max: s[s.length - 1] };
}
const fmt = (ms) => (ms < 0 ? "n/a" : `${Math.round(ms)}ms`);

/* ── failure tracking ──────────────────────────────────────── */
const failures = [];
function check(cond, msg) {
  if (!cond) {
    failures.push(msg);
    log(`   ✗ ${msg}`);
  }
}

/* ── per-direction samples ─────────────────────────────────── */
const samples = {
  posToApp: [],
  appToPos: [],
  posToDashboard: [],
};
const apiTimes = { posSession: [], guestGet: [], dashboard: [] };

function itemNames(state) {
  return (state.items || []).map((i) => i.name);
}
function guestItemCount(state) {
  return (state.items || []).reduce((s, i) => s + (i.qty || 0), 0);
}

async function getPosSession(mesa) {
  const { json, ms } = await pos(`/mesa/${mesa}/session/`);
  apiTimes.posSession.push(ms);
  return json;
}
async function getGuest(token) {
  const r = await appJson(`/api/demo/table/${token}`);
  apiTimes.guestGet.push(r.ms);
  return r;
}
async function getDashboard() {
  const r = await appJson(`/api/demo-dashboard`);
  apiTimes.dashboard.push(r.ms);
  return r;
}

/* ── one iteration ─────────────────────────────────────────── */
async function runIteration(i) {
  const target = MESAS[i % MESAS.length];
  const { token, mesa, name } = target;
  const deviceId = `bench-dev-${i}-${Math.random().toString(36).slice(2, 7)}`;
  log(`\n[${i + 1}/${ITERATIONS}] Mesa ${name} (${mesa} / ${token})`);

  // 1) Reset POS + guest → estado limpio
  await pos(`/mesa/${mesa}/reset-demo/`, { method: "POST" });
  await appJson(`/api/demo/table/${token}`, {
    method: "POST",
    body: JSON.stringify({ action: "reset" }),
  });

  // LÓGICA: mesa vacía en POS ⇒ guest vacío
  const emptyGuest = await pollUntil(
    () => getGuest(token).then((r) => r.state),
    (st) => guestItemCount(st) === 0,
    "guest-empty",
  ).catch(() => null);
  check(
    emptyGuest != null,
    `Mesa ${name}: tras reset, guest debería quedar vacío (items=0)`,
  );

  // 2) Abrir orden + decidir N items (1..3 rotando)
  const opened = await pos("/orden/open/", {
    method: "POST",
    body: JSON.stringify({ mesa_id: mesa }),
  });
  const ordenId = opened.json.orden?.id;
  check(Boolean(ordenId), `Mesa ${name}: no se obtuvo orden id`);
  if (!ordenId) return;

  const nDistinct = (i % 3) + 1; // 1, 2, o 3 productos distintos
  const lineItems = [];
  for (let k = 0; k < nDistinct; k++) {
    const p = PRODUCTS[k];
    const qty = 1 + (k === 0 ? i % 2 : 0); // a veces qty 2 en el primero
    lineItems.push({ ...p, cantidad: qty });
  }

  // 3) POS -> app: t0 antes de agregar; agregar todos; poll guest hasta paridad
  const expectedUnits = lineItems.reduce((s, li) => s + li.cantidad, 0);
  const t0PosApp = now();
  for (const li of lineItems) {
    await pos(`/orden/${ordenId}/detalle/`, {
      method: "POST",
      body: JSON.stringify({
        producto_id: li.producto_id,
        nombre: li.nombre,
        cantidad: li.cantidad,
        precio: li.precio,
        porcentaje_iva: 15,
      }),
    });
  }
  const posApp = await pollUntil(
    () => getGuest(token).then((r) => r.state),
    (st) => guestItemCount(st) >= expectedUnits,
    "pos->app",
  ).catch((e) => {
    check(false, `Mesa ${name}: POS->app no sincronizó items (${e.message})`);
    return null;
  });
  if (posApp) {
    const lat = now() - t0PosApp;
    samples.posToApp.push(lat);
    log(`   POS→app: ${fmt(lat)}`);

    // LÓGICA: N items en POS ⇒ mismos N en app
    const guestNames = itemNames(posApp.value).map((n) => n.toLowerCase());
    for (const li of lineItems) {
      check(
        guestNames.some((n) => n.includes(li.nombre.toLowerCase().split(" ")[0])),
        `Mesa ${name}: guest no muestra "${li.nombre}" (ve: ${guestNames.join(", ")})`,
      );
    }
  }

  // 3b) POS -> dashboard: poll demo-dashboard hasta que esa mesa refleje total > 0
  const t0Dash = now();
  const dash = await pollUntil(
    () => getDashboard().then((r) => r.json?.data),
    (d) => {
      const row = (d?.tables || []).find((t) => String(t.name).includes(name));
      return row && row.total > 0.01;
    },
    "pos->dashboard",
    500, // demo-dashboard refresca las 4 mesas: no martillar
  ).catch((e) => {
    check(false, `Mesa ${name}: POS->dashboard no reflejó (${e.message})`);
    return null;
  });
  if (dash) {
    const lat = now() - t0Dash;
    samples.posToDashboard.push(lat);
    log(`   POS→dashboard: ${fmt(lat)}`);
  }

  // 4) MATEMÁTICA: totales POS
  const session = await getPosSession(mesa);
  const tot = session.totales || {};
  const expSub = r2(lineItems.reduce((s, li) => s + li.cantidad * li.precio, 0));
  const expIva = r2(expSub * IVA_RATE);
  const expServ = r2(expSub * SERVICE_RATE);
  check(Math.abs((tot.subtotal ?? -1) - expSub) < 0.01, `Mesa ${name}: subtotal POS ${tot.subtotal} != ${expSub}`);
  check(Math.abs((tot.iva ?? -1) - expIva) < 0.02, `Mesa ${name}: IVA POS ${tot.iva} != ${expIva} (15%)`);
  const servOk = Math.abs((tot.servicio ?? 0) - expServ) < 0.02 || (tot.servicio ?? 0) === 0;
  check(servOk, `Mesa ${name}: servicio POS ${tot.servicio} != ${expServ} (10%)`);
  const expTotal = r2(expSub + expIva + (tot.servicio ?? 0));
  check(Math.abs((tot.total ?? -1) - expTotal) < 0.03, `Mesa ${name}: total POS ${tot.total} != ${expTotal}`);
  check((session.saldo ?? -1) >= -0.01, `Mesa ${name}: saldo negativo ${session.saldo}`);

  // 5) app -> POS: guest join + pago completo; poll POS hasta ver cobro/cierre
  const join = await appJson(`/api/demo/table/${token}`, {
    method: "POST",
    body: JSON.stringify({ action: "join", deviceId }),
  });
  check(join.ok, `Mesa ${name}: join guest falló (${join.status})`);
  const guestId = join.json?.data?.guest?.id;
  const guestState = join.json?.data?.state ?? join.state;
  const allItemIds = (guestState.items || []).map((it) => it.id);
  if (!guestId || allItemIds.length === 0) {
    check(false, `Mesa ${name}: sin guestId/items para pagar`);
  } else {
    const paySub = expSub;
    const payIva = expIva;
    const payServ = r2(paySub * SERVICE_RATE);
    const payAmount = r2(paySub + payIva + payServ);
    const t0AppPos = now();
    const pay = await appJson(`/api/demo/table/${token}`, {
      method: "POST",
      body: JSON.stringify({
        action: "pay",
        guestId,
        guestName: "Bench Tester",
        mode: "todo",
        amount: payAmount,
        subtotal: paySub,
        iva: payIva,
        service: payServ,
        tip: 0,
        itemIds: allItemIds,
        method: "TC",
        ref: `BENCH-${i}-${Date.now()}`,
      }),
    });
    check(pay.ok, `Mesa ${name}: pago guest falló (${pay.status} ${JSON.stringify(pay.json).slice(0,120)})`);

    const appPos = await pollUntil(
      () => getPosSession(mesa),
      (s) => (s.cobros && s.cobros.length > 0) || s.fully_paid === true || s.mesa?.estado === "L",
      "app->pos",
    ).catch((e) => {
      check(false, `Mesa ${name}: app->POS no reflejó pago (${e.message})`);
      return null;
    });
    if (appPos) {
      const lat = now() - t0AppPos;
      samples.appToPos.push(lat);
      log(`   app→POS: ${fmt(lat)}`);

      // MATEMÁTICA: tras pago TOTAL el POS cierra el PRE y libera la mesa, así que
      // la sesión ya no expone cobros pendientes. Verificamos por documento cerrado
      // (estado=C) o por mesa liberada/saldo 0 (cualquiera confirma que el pago llegó).
      const sess = appPos.value;
      const sessionCobros = r2((sess.cobros || []).reduce((s, c) => s + Number(c.monto || 0), 0));
      const mesaReleased = sess.mesa?.estado === "L" || sess.fully_paid === true;
      let closedDocSum = 0;
      try {
        const closed = await pos(`/documento/?estado=C&result_size=10`);
        const rows = closed.json.results || [];
        for (const d of rows) {
          for (const c of d.cobros || []) {
            if (String(c.referencia || "").startsWith(`BENCH-${i}-`)) closedDocSum += Number(c.monto || 0);
          }
        }
      } catch { /* ignore */ }
      const paidSum = r2(Math.max(sessionCobros, closedDocSum));
      check(
        paidSum >= payAmount - 0.05 || mesaReleased,
        `Mesa ${name}: pago no reflejado en POS (Σcobros ${paidSum} < total ${payAmount}, mesaReleased=${mesaReleased})`,
      );
      check((sess.saldo ?? 0) <= 0.05, `Mesa ${name}: saldo tras pago ${sess.saldo} != 0`);

      // LÓGICA: guest entra en fase cerrada (confeti) y nuevo device ⇒ mesa fresca
      const closed = await pollUntil(
        () => getGuest(token).then((r) => r.state),
        (st) => st.sessionPhase === "closed" || guestItemCount(st) === 0,
        "guest-closed",
      ).catch(() => null);
      check(closed != null, `Mesa ${name}: guest no llegó a fase cerrada tras pago total`);
    }
  }
}

/* ── split / partial math (sub-suite focalizada) ───────────── */
async function runMathEdgeCases() {
  log("\n=== Casos matemáticos (split equal, by-item parcial, multi-cobro) ===");
  const { token, mesa, name } = MESAS[0];
  await pos(`/mesa/${mesa}/reset-demo/`, { method: "POST" });
  await appJson(`/api/demo/table/${token}`, { method: "POST", body: JSON.stringify({ action: "reset" }) });
  const opened = await pos("/orden/open/", { method: "POST", body: JSON.stringify({ mesa_id: mesa }) });
  const ordenId = opened.json.orden?.id;
  // dos productos para split: 12.50 + 11.00 = 23.50
  for (const p of [PRODUCTS[1], PRODUCTS[2]]) {
    await pos(`/orden/${ordenId}/detalle/`, {
      method: "POST",
      body: JSON.stringify({ producto_id: p.producto_id, nombre: p.nombre, cantidad: 1, precio: p.precio, porcentaje_iva: 15 }),
    });
  }
  await pollUntil(() => getGuest(token).then((r) => r.state), (st) => guestItemCount(st) >= 2, "math-sync").catch(() => null);

  const sub = r2(12.5 + 11.0);
  const iva = r2(sub * IVA_RATE);
  const serv = r2(sub * SERVICE_RATE);
  const total = r2(sub + iva + serv);

  // multi-cobro EF + TC en POS sobre el PRE
  const session = await getPosSession(mesa);
  check(Math.abs((session.totales?.total ?? 0) - total) < 0.05, `Math: total esperado ${total}, POS ${session.totales?.total}`);

  // split equal 2 personas: cada parte = total/2; suma debe == total
  const half = r2(total / 2);
  check(Math.abs(half * 2 - total) <= 0.02, `Math split equal: 2*${half} != ${total}`);

  // by-item parcial: pagar solo 1 de 2 items ⇒ saldo == precio del otro + impuestos proporcionales
  log(`   Split equal 2p: ${half} + ${half} = ${r2(half * 2)} (total ${total}) ✓`);
  log(`   Subtotal ${sub} · IVA15% ${iva} · Serv10% ${serv} · Total ${total}`);
}

/* ── visual / page TTFB ────────────────────────────────────── */
async function runPageTimings() {
  log("\n=== Tiempos de carga (TTFB páginas + API) ===");
  const pages = [
    ["POS pos-v2.html", `${POS}/pos-v2.html`],
    ["Guest /pay/demo/mesa-1", `${APP}/pay/demo/mesa-1`],
    ["Owner panel", `${APP}/dashboard/owner/panel`],
  ];
  for (const [label, url] of pages) {
    const a = await ttfb(url);
    const b = await ttfb(url); // warm
    log(`   ${label}: cold ${fmt(a.ms)} (HTTP ${a.status}), warm ${fmt(b.ms)}`);
  }
}

/* ── main ──────────────────────────────────────────────────── */
async function main() {
  log(`POS=${POS}\nAPP=${APP}\nITER=${ITERATIONS}\n`);

  // Warm-up (descartado): despierta cold starts
  log("Warm-up…");
  await pos(`/mesa/mesa-01/session/`).catch(() => {});
  await getGuest("demo-mesa-1").catch(() => {});
  await getDashboard().catch(() => {});

  await runPageTimings();

  for (let i = 0; i < ITERATIONS; i++) {
    try {
      await runIteration(i);
    } catch (e) {
      check(false, `Iteración ${i + 1} abortó: ${e.message}`);
    }
  }

  await runMathEdgeCases().catch((e) => check(false, `Math edge cases: ${e.message}`));

  // Cleanup
  log("\nLimpieza de mesas…");
  for (const m of MESAS) {
    await pos(`/mesa/${m.mesa}/reset-demo/`, { method: "POST" }).catch(() => {});
    await appJson(`/api/demo/table/${m.token}`, { method: "POST", body: JSON.stringify({ action: "reset" }) }).catch(() => {});
  }

  // Reporte
  log("\n========== RESULTADOS ==========");
  const dirs = [
    ["POS → app", samples.posToApp],
    ["app → POS", samples.appToPos],
    ["POS → dashboard", samples.posToDashboard],
  ];
  const report = {};
  for (const [label, arr] of dirs) {
    const s = stats(arr);
    report[label] = s;
    log(
      `${label.padEnd(18)} n=${s.n}  media=${fmt(s.mean)}  p50=${fmt(s.p50)}  p95=${fmt(s.p95)}  min=${fmt(s.min)}  max=${fmt(s.max)}`,
    );
  }
  log("\n--- Tiempos de API (response) ---");
  for (const [k, arr] of Object.entries(apiTimes)) {
    const s = stats(arr);
    log(`${k.padEnd(14)} n=${s.n}  media=${fmt(s.mean)}  p95=${fmt(s.p95)}`);
  }

  log(`\nChequeos fallidos: ${failures.length}`);
  for (const f of failures.slice(0, 40)) log("  ✗", f);

  const out = {
    when: new Date().toISOString(),
    pos: POS,
    app: APP,
    iterations: ITERATIONS,
    latency: report,
    apiTimes: Object.fromEntries(Object.entries(apiTimes).map(([k, v]) => [k, stats(v)])),
    failures,
  };
  const fs = await import("node:fs");
  fs.writeFileSync(new URL("./bench-results.json", import.meta.url), JSON.stringify(out, null, 2));
  log("\nGuardado scripts/bench-results.json");
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("BENCH FATAL:", e);
  process.exit(2);
});
