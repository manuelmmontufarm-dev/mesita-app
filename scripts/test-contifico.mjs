#!/usr/bin/env node
/**
 * Smoke-test Contífico sandbox v2 API.
 * Usage: node scripts/test-contifico.mjs
 */

import { execSync } from "child_process";

const API_KEY = process.env.CONTIFICO_API_KEY ?? "FrguR1kDpFHaXHLQwplZ2CwTX3p8p9XHVTnukL98V5U";
const TABLE_FIELD = process.env.CONTIFICO_TABLE_FIELD ?? "adicional1";
const BASE_URL =
  process.env.CONTIFICO_BASE_URL ?? "https://integracionapi.contifico.com/sistema/api/v2";

function get(path) {
  const cmd = [
    "curl",
    "--max-time 90",
    "-s",
    `-H "AUTHORIZATION: ${API_KEY}"`,
    `-H "Content-Type: application/json"`,
    `"${BASE_URL}${path}"`,
  ].join(" ");

  const output = execSync(cmd, { timeout: 95_000, encoding: "utf-8" });
  return JSON.parse(output);
}

function toNumber(v) {
  return typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0;
}

function fmt(n) {
  return `$${toNumber(n).toFixed(2)}`;
}

console.log("=== Contífico Sandbox v2 Smoke Test ===");
console.log(`Base: ${BASE_URL}`);
console.log(`Key: ${API_KEY.slice(0, 8)}...  Table field: ${TABLE_FIELD}`);

const pingData = get("/documento/?tipo_documento=PRE&limit=20");
const docs = Array.isArray(pingData) ? pingData : pingData.results ?? [];
const preDocs = docs.filter((d) => d.tipo_documento === "PRE");
const openPres = preDocs.filter((d) => d.estado === "P");

console.log(`\nPRE in page: ${preDocs.length}  open (P): ${openPres.length}`);

for (const doc of openPres.slice(0, 3)) {
  const tableId = String(doc[TABLE_FIELD] ?? "");
  console.log(`\n  ${doc.id}  total=${fmt(doc.total)}  ${TABLE_FIELD}="${tableId || "(empty)"}"`);
  for (const it of (doc.detalles ?? []).slice(0, 3)) {
    const name = it.nombre_manual ?? it.producto_nombre ?? it.descripcion ?? "?";
    console.log(`    - ${name} x${it.cantidad} @ ${fmt(it.precio)}`);
  }
}

if (openPres[0]) {
  const statusDoc = get(`/documento/${encodeURIComponent(openPres[0].id)}/`);
  console.log(`\ngetOrderStatus OK — estado=${statusDoc.estado}`);
}

console.log("\n✅ Smoke test complete\n");
