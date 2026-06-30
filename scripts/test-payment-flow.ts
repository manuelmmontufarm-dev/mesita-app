/**
 * Stub payment smoke test against local or deployed API + optional DB check.
 * Usage:
 *   BILL_ID=... TABLE_TOKEN=... APP_URL=... npx tsx scripts/test-payment-flow.ts
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const BILL_ID = process.env.BILL_ID;
const TABLE_TOKEN = process.env.TABLE_TOKEN;

if (!BILL_ID || !TABLE_TOKEN) {
  console.error("Set BILL_ID and TABLE_TOKEN (from an open bill after ingest)");
  process.exit(1);
}

async function main() {
  const url = `${APP_URL.replace(/\/$/, "")}/api/bills/${BILL_ID}/pay`;
  const body = {
    amount: Number(process.env.PAY_AMOUNT ?? "1.00"),
    tableToken: TABLE_TOKEN,
    paymentToken: "stub:4242",
    idempotencyKey: crypto.randomUUID(),
    splitMode: "FULL",
    guestData: { email: "test@mesita.ec" },
  };

  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
