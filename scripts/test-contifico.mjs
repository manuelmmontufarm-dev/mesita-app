#!/usr/bin/env node
/**
 * Smoke-test the Contifico test API without a database or running app.
 * Uses curl directly — the Contifico test API has very high latency (>20s TTFB)
 * so curl with --max-time 90 is more reliable than Node's fetch.
 *
 * Usage:
 *   node scripts/test-contifico.mjs
 *
 * Optional env vars:
 *   CONTIFICO_API_KEY     — override the default test key
 *   CONTIFICO_TABLE_FIELD — document field holding the table id (default: adicional1)
 */

import { execSync } from "child_process";

const API_KEY = process.env.CONTIFICO_API_KEY ?? "FrguR1kDpFHaXHLQwplZ2CwTX3p8p9XHVTnukL98V5U";
const TABLE_FIELD = process.env.CONTIFICO_TABLE_FIELD ?? "adicional1";
const BASE_URL = "https://api.contifico.com/sistema/api/v1";

function get(path) {
  const cmd = [
    "curl",
    "--max-time 90",
    "-s",
    `-H "AUTHORIZATION: ${API_KEY}"`,
    `-H "Content-Type: application/json"`,
    `"${BASE_URL}${path}"`,
  ].join(" ");

  try {
    const output = execSync(cmd, { timeout: 95_000, encoding: "utf-8" });
    return JSON.parse(output);
  } catch (err) {
    throw new Error(`Request to ${path} failed: ${err.message}`);
  }
}

function toNumber(v) {
  return typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
}

function fmt(n) {
  return `$${toNumber(n).toFixed(2)}`;
}

// ── 1. Ping ───────────────────────────────────────────────────────────────────

console.log("=== Contifico API Smoke Test ===");
console.log(`Key: ${API_KEY.slice(0, 8)}...  Table field: ${TABLE_FIELD}`);
console.log("\n── 1. PING (auth check) ─────────────────────────────────────");
console.log("   (Contifico test API has ~30-60s latency — please wait…)");

const pingData = get("/registro/documento/?tipo_documento=PRE&limit=5");

if (!Array.isArray(pingData) && !Array.isArray(pingData?.results)) {
  console.log("❌  Unexpected response:", JSON.stringify(pingData).slice(0, 200));
  process.exit(1);
}
console.log("✅  Authenticated OK");

// ── 2. Pull PRE documents ─────────────────────────────────────────────────────

const docs = Array.isArray(pingData) ? pingData : (pingData.results ?? []);
const preDocs = docs.filter((d) => d.tipo_documento === "PRE");

console.log(`\n── 2. PRE DOCUMENTS ─────────────────────────────────────────`);
console.log(`   Found ${preDocs.length} PRE document(s) in response`);

for (const doc of preDocs.slice(0, 5)) {
  const tableId = String(doc[TABLE_FIELD] ?? "");
  const isClosed = doc.estado === "P" || doc.estado === "A";
  const items = (doc.detalles ?? []).map((d) => ({
    name: d.nombre_manual ?? d.producto_nombre ?? d.descripcion ?? "(no name)",
    qty: toNumber(d.cantidad),
    price: toNumber(d.precio),
  }));

  console.log(`\n  📄 ${doc.id}`);
  console.log(`     documento: ${doc.documento}  estado: ${doc.estado}  isClosedInPos: ${isClosed}`);
  console.log(`     ${TABLE_FIELD}: "${tableId || "(empty — not set in test account)"}"`);
  console.log(`     subtotal: ${fmt(doc.subtotal)}  iva: ${fmt(doc.iva)}  servicio: ${fmt(doc.servicio)}  total: ${fmt(doc.total)}`);
  console.log(`     ${items.length} item(s):`);
  for (const it of items) {
    console.log(`       - "${it.name}"  x${it.qty}  @ ${fmt(it.price)}`);
  }
}

// ── 3. Get order status for the first open PRE ────────────────────────────────

const openDoc = preDocs.find((d) => d.estado !== "P" && d.estado !== "A");

console.log(`\n── 3. GET ORDER STATUS ──────────────────────────────────────`);
if (!openDoc) {
  console.log("   No open PRE docs found — skipping status check");
} else {
  const statusDoc = get(`/registro/documento/${encodeURIComponent(openDoc.id)}/`);
  const isClosed = statusDoc?.estado === "P" || statusDoc?.estado === "A";
  console.log(`   doc ${openDoc.id}: estado=${statusDoc?.estado}  isClosedInPos=${isClosed}`);
  console.log("✅  getOrderStatus works");
}

// ── 4. cobro dry run ──────────────────────────────────────────────────────────

console.log(`\n── 4. COBRO DRY RUN ─────────────────────────────────────────`);
console.log("   (Skipping actual POST to avoid mutating test account)");
if (openDoc) {
  console.log(`   To test confirmPayment manually, run:`);
  console.log(`   curl -X POST "${BASE_URL}/cobro/" \\`);
  console.log(`     -H "AUTHORIZATION: ${API_KEY.slice(0, 8)}..." \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"documento_id":"${openDoc.id}","valor":1.00,"referencia":"TEST-001","tipo_pago":"TARJETA"}'`);
}

console.log("\n✅  Smoke test complete\n");
