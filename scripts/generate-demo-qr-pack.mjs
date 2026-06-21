#!/usr/bin/env node
/**
 * Multi-page QR PDF pack for the demo tables.
 * - Reads catalog from src/lib/demo-table-catalog via tsx loader
 * - Writes docs/demo-qr-pack/demo-tables-qr.pdf and manifest.json
 * Run: npm run demo:qr-pack
 */
// Run with: node --import tsx scripts/generate-demo-qr-pack.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { listDemoTables } = await import("../src/lib/demo-table-catalog/index.ts");
const { generateDemoTableQrPdfPack, buildDemoPayUrl } = await import(
  "../src/lib/qr-utils.ts"
);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "docs", "demo-qr-pack");
mkdirSync(outDir, { recursive: true });

const defs = listDemoTables();
const pdfBuffer = await generateDemoTableQrPdfPack(defs);
const pdfPath = join(outDir, "demo-tables-qr.pdf");
writeFileSync(pdfPath, pdfBuffer);

const manifest = defs.map((def) => {
  const totalBill = def.items.reduce(
    (sum, it) => sum + it.qty * it.unitPrice,
    0,
  );
  return {
    token: def.token,
    slug: def.slug,
    url: buildDemoPayUrl(def.token),
    restaurant: def.restaurant.name,
    table: def.table.name,
    itemCount: def.items.length,
    totalBill: Math.round(totalBill * 100) / 100,
    itemsSummary: def.items
      .map((it) => `${it.qty}×${it.name}`)
      .join(", "),
    scenarioDescription: def.scenarioDescription,
  };
});

const manifestPath = join(outDir, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(`Wrote ${pdfPath}`);
console.log(`Wrote ${manifestPath}`);
console.log(`Pages: ${defs.length}`);
