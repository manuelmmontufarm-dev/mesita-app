/**
 * Phase 4 SLO bench — simulator propagation: POS mutation → app database/read model.
 *
 * Target (Relay 01): p95 ≤ 2000 ms over ≥30 samples with 10 simulated diners,
 * WITHOUT the diners multiplying upstream calls (lease coalescing).
 *
 * Setup expected:
 *   - Mesita POS running locally with the v2 façade, e.g.
 *       cd /Users/manue/Downloads/Mesita-POS && API_KEY=$BENCH_POS_KEY PORT=4123 node src/app.js
 *   - App repo .env pointing DATABASE_URL/DIRECT_URL at the TEST Supabase.
 *
 * Run:
 *   BENCH_POS_URL=http://localhost:4123 BENCH_POS_KEY=bench-test-key \
 *   SAMPLES=30 DINERS=10 npx tsx scripts/sync-slo-bench.mts
 *
 * The bench measures the real chain: v2 façade POST /documento/ (PRE with
 * MESITA_TABLE mapping) → ContificoAdapter.pullOrders (frozen contract) →
 * ingest → Supabase commit → bill visible. Diners call syncIfStale exactly
 * like the app read path; upstream fetches are counted via an adapter wrapper.
 */
import { randomUUID } from "crypto";
import type { PosConfig } from "../src/modules/pos/adapters/pos-config";

// The bench runs 10 concurrent "diners" from ONE process. In production each
// diner is a separate serverless invocation with its own Prisma connection —
// so the single-process bench must widen its pool or every poll queues on the
// one pooled connection (connection_limit=1) and the measurement reflects
// bench artifact, not the system. Mutate the URL BEFORE the client loads.
if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("connection_limit", String(Number(process.env.DINERS ?? 10) + 2));
  process.env.DATABASE_URL = url.toString();
}

const { prisma } = await import("../src/lib/db");
const { encrypt } = await import("../src/lib/encryption");
const { ContificoAdapter } = await import("../src/modules/pos/adapters/contifico.adapter");
const { syncIfStale } = await import("../src/modules/pos/application/sync-if-stale");
const { PrismaPosOrderRepository } = await import(
  "../src/modules/pos/adapters/prisma/pos-order.repository"
);

const POS_URL = (process.env.BENCH_POS_URL ?? "http://localhost:4123").replace(/\/$/, "");
const POS_KEY = process.env.BENCH_POS_KEY ?? "bench-test-key";
const BASE = `${POS_URL}/sistema/api/v2`;
const SAMPLES = Math.max(30, Number(process.env.SAMPLES ?? 30));
const DINERS = Number(process.env.DINERS ?? 10);
const POLL_MS = Number(process.env.POLL_MS ?? 150);
const FRESHNESS_MS = Number(process.env.FRESHNESS_MS ?? 1_000);
const SAMPLE_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function posFetch(path: string, init: RequestInit = {}) {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      AUTHORIZATION: POS_KEY, // raw key — v2 contract
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok && resp.status !== 201) {
    throw new Error(`POS ${resp.status} on ${path}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  // --- Preconditions -------------------------------------------------------
  const health = await fetch(`${BASE}/health/`).then((r) => r.json());
  if (health?.status !== "ok") throw new Error("POS v2 façade not healthy");
  await prisma.$queryRaw`SELECT 1`;

  // --- Fixture -------------------------------------------------------------
  const suffix = randomUUID().slice(0, 8);
  const posExternalId = `bench-mesa-${suffix}`;
  const restaurant = await prisma.restaurant.create({
    data: {
      name: `bench-slo-${suffix}`,
      status: "ACTIVE",
      invoiceMode: "POS",
      posProvider: "CONTIFICO",
      posApiKeyEnc: encrypt(POS_KEY),
      posEnvironment: "sandbox",
      posTableField: "adicional1",
      posPaymentMethod: "EF",
    },
  });
  const table = await prisma.table.create({
    data: {
      name: `Bench ${suffix}`,
      token: randomUUID(),
      restaurantId: restaurant.id,
      posExternalId,
    },
  });

  // ONE adapter, config-only wiring (contract rule) + upstream call counter.
  const config: PosConfig = {
    provider: "CONTIFICO",
    apiKey: POS_KEY,
    environment: "sandbox",
    tableField: "adicional1",
    baseUrl: BASE,
    paymentMethod: "EF",
    attachClienteEnabled: false,
  };
  const realAdapter = new ContificoAdapter(config);
  let upstreamPulls = 0;
  const countingAdapter = {
    pullOrders: async () => {
      upstreamPulls += 1;
      return realAdapter.pullOrders();
    },
  };
  const repo = new PrismaPosOrderRepository();
  const restaurantRef = { id: restaurant.id, name: restaurant.name };

  // --- Sample loop ---------------------------------------------------------
  const latencies: number[] = [];
  let failures = 0;
  let dinerSyncAttempts = 0;

  for (let s = 0; s < SAMPLES; s++) {
    const total = Math.round((5 + s) * 100) / 100;
    const doc = await posFetch(`/documento/`, {
      method: "POST",
      body: JSON.stringify({
        tipo_documento: "PRE",
        fecha_emision: new Date().toLocaleDateString("es-EC", {
          day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Guayaquil",
        }),
        adicional1: `MESITA_TABLE:${posExternalId}`,
        descripcion: `bench sample ${s}`,
        subtotal_0: 0,
        subtotal_12: total,
        iva: 0,
        servicio: 0,
        total,
        detalles: [],
      }),
    });
    const t0 = performance.now();

    // 10 simulated diners polling sync-if-stale until THIS document's bill
    // is committed locally. First diner to see it stops the pack.
    let visibleAt: number | null = null;
    const diner = async () => {
      while (visibleAt === null && performance.now() - t0 < SAMPLE_TIMEOUT_MS) {
        dinerSyncAttempts += 1;
        await syncIfStale(restaurantRef, countingAdapter, repo, {
          freshnessWindowMs: FRESHNESS_MS,
        });
        const bill = await prisma.bill.findUnique({ where: { posDocumentId: String(doc.id) } });
        if (bill && visibleAt === null) visibleAt = performance.now();
        if (visibleAt === null) await sleep(POLL_MS);
      }
    };
    await Promise.all(Array.from({ length: DINERS }, diner));

    if (visibleAt === null) {
      failures += 1;
      console.log(`sample ${s}: TIMEOUT (doc ${doc.id})`);
    } else {
      const ms = Math.round(visibleAt - t0);
      latencies.push(ms);
      console.log(`sample ${s}: ${ms} ms (doc ${doc.id}, pulls so far ${upstreamPulls})`);
    }

    // Close the PRE upstream (cobro = total → estado C) so the next sample's
    // open-PRE mapping is unambiguous, and let ingestion observe the closure.
    await posFetch(`/documento/${doc.id}/cobro/`, {
      method: "POST",
      body: JSON.stringify({ forma_cobro: "EF", monto: total, numero_comprobante: `MSTABENCH${String(s).padStart(5, "0")}` }),
    }).catch((err) => console.warn(`sample ${s}: close failed: ${err.message}`));
  }

  // --- Report --------------------------------------------------------------
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1] ?? 0;
  console.log("\n=== SYNC SLO REPORT (simulator) ===");
  console.log(`samples: ${latencies.length}/${SAMPLES}  diners: ${DINERS}  failures: ${failures}`);
  console.log(`p50: ${p50} ms   p95: ${p95} ms   max: ${max} ms`);
  console.log(`diner sync attempts: ${dinerSyncAttempts}   upstream pulls: ${upstreamPulls}`);
  console.log(
    `coalescing ratio: ${(dinerSyncAttempts / Math.max(1, upstreamPulls)).toFixed(1)} sync-reads per upstream call`
  );
  const pass = p95 <= 2_000 && failures === 0 && upstreamPulls < dinerSyncAttempts / 3;
  console.log(pass ? "\nSLO: PASS (p95 ≤ 2000 ms, coalescing verified)" : "\nSLO: FAIL");

  // --- Cleanup -------------------------------------------------------------
  await prisma.posSyncState.deleteMany({ where: { restaurantId: restaurant.id } });
  await prisma.restaurant.delete({ where: { id: restaurant.id } });
  await prisma.$disconnect();
  void table;
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error("BENCH ERROR:", err.message);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
});
