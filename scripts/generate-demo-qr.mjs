/**
 * Generates public/demo-pay-qr.png for print / WhatsApp sharing.
 * Run: npm run qr:demo
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import QRCode from "qrcode";

const DEMO_URL = "https://mesita-demo.vercel.app/pay/demo";
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
