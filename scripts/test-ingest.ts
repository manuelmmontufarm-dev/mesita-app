/**
 * Manual ingest trigger against deployed Mesita (or local).
 * Usage: CRON_SECRET=... APP_URL=https://mesitademo-two.vercel.app npx tsx scripts/test-ingest.ts
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error("Set CRON_SECRET env var");
  process.exit(1);
}

async function main() {
  const url = `${APP_URL.replace(/\/$/, "")}/api/pos/ingest`;
  console.log(`GET ${url}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
