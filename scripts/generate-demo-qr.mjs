/**
 * Generates public/demo-pay-qr.png for print / WhatsApp sharing.
 * Run: npm run qr:demo
 *
 * Canonical URL lives in src/lib/demo-url.constants.mjs (single source of truth).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";

import { CANONICAL_DEMO_PAY_URL } from "../src/lib/demo-url.constants.mjs";

const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_PAY_URL ?? CANONICAL_DEMO_PAY_URL;
if (DEMO_URL !== CANONICAL_DEMO_PAY_URL) {
  console.warn(
    `[qr:demo] WARNING — overriding canonical URL via NEXT_PUBLIC_DEMO_PAY_URL: ${DEMO_URL}`,
  );
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../public/demo-pay-qr.png");

const buffer = await QRCode.toBuffer(DEMO_URL, {
  type: "png",
  width: 1024,
  margin: 2,
  errorCorrectionLevel: "H",
  color: {
    dark: "#14794B",
    light: "#FFFDF9",
  },
});

writeFileSync(OUT, buffer);
console.log(`Wrote ${OUT}`);
console.log(`URL: ${DEMO_URL}`);
