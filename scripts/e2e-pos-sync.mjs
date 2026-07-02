#!/usr/bin/env node
/**
 * E2E: POS item → guest app sync + two-device join.
 * POS_URL=https://mesita-pos.vercel.app SMOKE_URL=https://mesitademo-two.vercel.app node scripts/e2e-pos-sync.mjs
 */

const POS = (process.env.POS_URL ?? "https://mesita-pos.vercel.app").replace(/\/$/, "");
const APP = (process.env.SMOKE_URL ?? "https://mesitademo-two.vercel.app").replace(/\/$/, "");
const POS_KEY = process.env.POS_API_KEY;
if (!POS_KEY) { console.error("POS_API_KEY env var is required."); process.exit(1); }
const TOKEN = "demo-mesa-1";
const MESA = "mesa-01";

async function pos(path, init = {}) {
  const res = await fetch(`${POS}/sistema/api/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${POS_KEY}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POS ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function appJson(path, init = {}) {
  const res = await fetch(`${APP}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

function itemNames(state) {
  return (state.items || []).map((i) => i.name);
}

const steps = [];

try {
  steps.push("reset POS mesa");
  await pos(`/mesa/${MESA}/reset-demo/`, { method: "POST" });

  steps.push("open orden");
  const opened = await pos("/orden/open/", { method: "POST", body: JSON.stringify({ mesa_id: MESA }) });
  const ordenId = opened.orden?.id;
  if (!ordenId) throw new Error("no orden id");

  steps.push("add cerveza x2");
  await pos(`/orden/${ordenId}/detalle/`, {
    method: "POST",
    body: JSON.stringify({
      producto_id: "prod-cerveza",
      nombre: "Cerveza Nacional",
      cantidad: 2,
      precio: 3,
      porcentaje_iva: 15,
    }),
  });

  steps.push("guest device A join");
  const joinA = await appJson(`/api/demo/table/${TOKEN}`, {
    method: "POST",
    body: JSON.stringify({ action: "join", deviceId: "e2e-device-a" }),
  });
  if (!joinA.ok) throw new Error(`join A ${joinA.status}`);

  steps.push("guest GET sync");
  const get1 = await appJson(`/api/demo/table/${TOKEN}`);
  if (!get1.ok) throw new Error(`GET ${get1.status}`);
  const names1 = itemNames(get1.json);
  if (!names1.some((n) => /cerveza/i.test(n))) {
    throw new Error(`items missing cerveza: ${JSON.stringify(names1)}`);
  }

  steps.push("guest device B join");
  const joinB = await appJson(`/api/demo/table/${TOKEN}`, {
    method: "POST",
    body: JSON.stringify({ action: "join", deviceId: "e2e-device-b" }),
  });
  if (!joinB.ok) throw new Error(`join B ${joinB.status}`);
  const guests = joinB.json.guests?.length ?? joinB.json.state?.guests?.length ?? 0;
  if (guests < 2) throw new Error(`expected 2 guests, got ${guests}`);

  steps.push("device B GET sees same items");
  const get2 = await appJson(`/api/demo/table/${TOKEN}`);
  const names2 = itemNames(get2.json);
  if (!names2.some((n) => /cerveza/i.test(n))) {
    throw new Error(`device B missing items: ${JSON.stringify(names2)}`);
  }

  console.log("E2E PASS");
  for (const s of steps) console.log(" ✓", s);
  process.exit(0);
} catch (e) {
  console.error("E2E FAIL:", e.message || e);
  console.error("Completed:", steps.join(" → "));
  process.exit(1);
}
