// Generates .excalidraw files from a simplified element spec.
// Run: node scripts/gen-diagrams.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const rnd = () => Math.floor(Math.random() * 2 ** 31);
const base = (o) => ({
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
  fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1,
  opacity: 100, groupIds: [], frameId: null, roundness: null, seed: rnd(),
  version: 1, versionNonce: rnd(), isDeleted: false, boundElements: [],
  updated: 1, link: null, locked: false, ...o,
});

// Convert a simplified spec array into Excalidraw elements.
function convert(spec) {
  const out = [];
  for (const e of spec) {
    if (["cameraUpdate", "restoreCheckpoint", "delete"].includes(e.type)) continue;
    if (e.type === "text") {
      out.push(base({
        id: e.id, type: "text", x: e.x, y: e.y,
        width: (e.text.length * (e.fontSize || 16)) * 0.55,
        height: (e.fontSize || 16) * 1.25, text: e.text, fontSize: e.fontSize || 16,
        fontFamily: 1, textAlign: "left", verticalAlign: "top",
        strokeColor: e.strokeColor || "#1e1e1e", containerId: null,
        originalText: e.text, lineHeight: 1.25, baseline: (e.fontSize || 16),
      }));
      continue;
    }
    if (e.type === "arrow") {
      const arrowId = e.id;
      const el = base({
        id: arrowId, type: "arrow", x: e.x, y: e.y,
        width: e.width, height: e.height, points: e.points,
        strokeColor: e.strokeColor || "#1e1e1e", strokeWidth: e.strokeWidth || 2,
        strokeStyle: e.strokeStyle || "solid",
        startArrowhead: e.startArrowhead ?? null,
        endArrowhead: e.endArrowhead ?? "arrow",
        startBinding: null, endBinding: null, lastCommittedPoint: null,
      });
      if (e.label) {
        const tId = arrowId + "_lbl";
        el.boundElements = [{ type: "text", id: tId }];
        out.push(el);
        out.push(base({
          id: tId, type: "text", x: e.x, y: e.y - 10,
          width: e.label.text.length * (e.label.fontSize || 14) * 0.55,
          height: (e.label.fontSize || 14) * 1.25, text: e.label.text,
          fontSize: e.label.fontSize || 14, fontFamily: 1, textAlign: "center",
          verticalAlign: "middle", strokeColor: "#1e1e1e", containerId: arrowId,
          originalText: e.label.text, lineHeight: 1.25, baseline: e.label.fontSize || 14,
        }));
        continue;
      }
      out.push(el);
      continue;
    }
    // shapes: rectangle / ellipse / diamond
    const shapeId = e.id;
    const shape = base({
      id: shapeId, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height,
      backgroundColor: e.backgroundColor || "transparent",
      fillStyle: "solid", strokeColor: e.strokeColor || "#1e1e1e",
      strokeWidth: e.strokeWidth || 2, opacity: e.opacity ?? 100,
      roundness: e.roundness || (e.type === "rectangle" ? { type: 3 } : null),
    });
    if (e.label) {
      const tId = shapeId + "_lbl";
      shape.boundElements = [{ type: "text", id: tId }];
      out.push(shape);
      const fs = e.label.fontSize || 16;
      out.push(base({
        id: tId, type: "text", x: e.x + 8, y: e.y + e.height / 2 - fs * 0.6,
        width: e.width - 16, height: fs * 1.25, text: e.label.text, fontSize: fs,
        fontFamily: 1, textAlign: "center", verticalAlign: "middle",
        strokeColor: "#1e1e1e", containerId: shapeId, originalText: e.label.text,
        lineHeight: 1.25, baseline: fs,
      }));
      continue;
    }
    out.push(shape);
  }
  return out;
}

const scene = (elements) => ({
  type: "excalidraw", version: 2, source: "https://excalidraw.com",
  elements: convert(elements),
  appState: { viewBackgroundColor: "#ffffff", gridSize: null },
  files: {},
});

const architecture = [
  { type: "text", id: "title", x: 218, y: 10, text: "MesitaQR — Hexagonal Architecture", fontSize: 24 },
  { type: "text", id: "sub", x: 288, y: 46, text: "Modular Monolith · Ports & Adapters", fontSize: 14, strokeColor: "#757575" },
  { type: "text", id: "hh1", x: 51, y: 86, text: "Driving Adapters", fontSize: 16, strokeColor: "#2563eb" },
  { type: "rectangle", id: "gq", x: 30, y: 118, width: 170, height: 64, backgroundColor: "#a5d8ff", strokeColor: "#4a9eed", label: { text: "Guest QR /pay/[token]", fontSize: 16 } },
  { type: "rectangle", id: "cr", x: 30, y: 218, width: 170, height: 64, backgroundColor: "#a5d8ff", strokeColor: "#4a9eed", label: { text: "Vercel Cron /api/pos/ingest", fontSize: 16 } },
  { type: "rectangle", id: "cz", x: 250, y: 100, width: 300, height: 300, backgroundColor: "#e5dbff", strokeColor: "#8b5cf6", strokeWidth: 1, opacity: 35 },
  { type: "text", id: "hh2", x: 300, y: 86, text: "Core (src/modules)", fontSize: 16, strokeColor: "#6d28d9" },
  { type: "text", id: "cl", x: 262, y: 108, text: "domain · application · adapters", fontSize: 14, strokeColor: "#6d28d9" },
  { type: "rectangle", id: "mb", x: 262, y: 150, width: 110, height: 66, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", label: { text: "bills", fontSize: 16 } },
  { type: "rectangle", id: "mp", x: 415, y: 150, width: 118, height: 52, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", label: { text: "payments", fontSize: 16 } },
  { type: "rectangle", id: "mo", x: 415, y: 214, width: 118, height: 52, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", label: { text: "pos", fontSize: 16 } },
  { type: "rectangle", id: "mi", x: 415, y: 278, width: 118, height: 52, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", label: { text: "invoicing", fontSize: 16 } },
  { type: "text", id: "pn", x: 262, y: 352, text: "each module exposes a Port", fontSize: 14, strokeColor: "#6d28d9" },
  { type: "arrow", id: "r_ag", x: 200, y: 150, width: 50, height: 18, points: [[0, 0], [50, 18]], strokeColor: "#4a9eed", label: { text: "pay", fontSize: 14 } },
  { type: "arrow", id: "r_ac", x: 200, y: 250, width: 50, height: -10, points: [[0, 0], [50, -10]], strokeColor: "#4a9eed", label: { text: "ingest", fontSize: 14 } },
  { type: "text", id: "hh3", x: 630, y: 86, text: "Driven Adapters", fontSize: 16, strokeColor: "#b45309" },
  { type: "rectangle", id: "ak", x: 600, y: 148, width: 180, height: 50, backgroundColor: "#b2f2bb", strokeColor: "#22c55e", label: { text: "Kushki — PaymentPort", fontSize: 14 } },
  { type: "arrow", id: "r_pk", x: 533, y: 176, width: 67, height: -3, points: [[0, 0], [67, -3]], strokeColor: "#22c55e", label: { text: "charge", fontSize: 13 } },
  { type: "rectangle", id: "acn", x: 600, y: 214, width: 180, height: 50, backgroundColor: "#b2f2bb", strokeColor: "#22c55e", label: { text: "Contifico (active)", fontSize: 14 } },
  { type: "arrow", id: "r_pc", x: 533, y: 240, width: 67, height: -1, points: [[0, 0], [67, -1]], strokeColor: "#22c55e", label: { text: "pull/confirm", fontSize: 13 } },
  { type: "rectangle", id: "apr", x: 600, y: 280, width: 180, height: 50, backgroundColor: "#fff3bf", strokeColor: "#f59e0b", label: { text: "Practisis (stub)", fontSize: 14 } },
  { type: "arrow", id: "r_pp", x: 533, y: 240, width: 67, height: 65, points: [[0, 0], [67, 65]], strokeColor: "#f59e0b" },
  { type: "rectangle", id: "adt", x: 600, y: 346, width: 180, height: 50, backgroundColor: "#ffc9c9", strokeColor: "#ef4444", label: { text: "Datil (legacy)", fontSize: 14 } },
  { type: "arrow", id: "r_pi", x: 533, y: 304, width: 67, height: 67, points: [[0, 0], [67, 67]], strokeColor: "#ef4444" },
  { type: "rectangle", id: "inf", x: 250, y: 420, width: 300, height: 46, backgroundColor: "#c3fae8", strokeColor: "#06b6d4", label: { text: "@/lib · Prisma -> PostgreSQL", fontSize: 15 } },
  { type: "arrow", id: "r_inf", x: 400, y: 400, width: 0, height: 20, points: [[0, 0], [0, 20]], strokeColor: "#06b6d4" },
  { type: "rectangle", id: "ex", x: 600, y: 420, width: 180, height: 60, backgroundColor: "#ffd8a8", strokeColor: "#f59e0b", label: { text: "External: Contifico POS · Kushki · SRI", fontSize: 13 } },
  { type: "arrow", id: "r_ex", x: 690, y: 396, width: 0, height: 24, points: [[0, 0], [0, 24]], strokeColor: "#f59e0b", label: { text: "HTTPS", fontSize: 12 } },
  { type: "text", id: "cp", x: 110, y: 505, text: "Camino A: POS prefactura -> ingest -> guest pays (Kushki) -> confirm back -> POS issues factura", fontSize: 14, strokeColor: "#757575" },
];

const paymentFlow = [
  { type: "text", id: "t", x: 140, y: 12, text: "Contifico Flow — Model B (API crea el FAC)", fontSize: 21 },
  { type: "text", id: "r", x: 120, y: 44, text: "No se puede cobrar la prefactura del POS -> creamos un FAC nuevo por API", fontSize: 12, strokeColor: "#b45309" },
  { type: "rectangle", id: "hg", x: 30, y: 74, width: 110, height: 40, backgroundColor: "#a5d8ff", strokeColor: "#4a9eed", label: { text: "Guest", fontSize: 16 } },
  { type: "arrow", id: "lg", x: 85, y: 114, width: 0, height: 368, points: [[0, 0], [0, 368]], strokeColor: "#b0b0b0", strokeWidth: 1, strokeStyle: "dashed", endArrowhead: null },
  { type: "rectangle", id: "hm", x: 200, y: 74, width: 160, height: 40, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", label: { text: "MesitaQR", fontSize: 16 } },
  { type: "arrow", id: "lm", x: 280, y: 114, width: 0, height: 368, points: [[0, 0], [0, 368]], strokeColor: "#b0b0b0", strokeWidth: 1, strokeStyle: "dashed", endArrowhead: null },
  { type: "rectangle", id: "hk", x: 420, y: 74, width: 110, height: 40, backgroundColor: "#b2f2bb", strokeColor: "#22c55e", label: { text: "Kushki", fontSize: 16 } },
  { type: "arrow", id: "lk", x: 475, y: 114, width: 0, height: 368, points: [[0, 0], [0, 368]], strokeColor: "#b0b0b0", strokeWidth: 1, strokeStyle: "dashed", endArrowhead: null },
  { type: "rectangle", id: "hc", x: 610, y: 74, width: 175, height: 40, backgroundColor: "#ffd8a8", strokeColor: "#f59e0b", label: { text: "Contifico API", fontSize: 15 } },
  { type: "arrow", id: "lc", x: 697, y: 114, width: 0, height: 368, points: [[0, 0], [0, 368]], strokeColor: "#b0b0b0", strokeWidth: 1, strokeStyle: "dashed", endArrowhead: null },
  { type: "arrow", id: "m1", x: 85, y: 148, width: 195, height: 0, points: [[0, 0], [195, 0]], strokeColor: "#4a9eed", label: { text: "1. ve prefactura POS + datos", fontSize: 12 } },
  { type: "arrow", id: "m2", x: 280, y: 196, width: 195, height: 0, points: [[0, 0], [195, 0]], strokeColor: "#8b5cf6", label: { text: "2. chargeCard", fontSize: 13 } },
  { type: "arrow", id: "m3", x: 475, y: 228, width: -195, height: 0, points: [[0, 0], [-195, 0]], strokeColor: "#22c55e", strokeStyle: "dashed", label: { text: "3. APPROVED + ticket", fontSize: 12 } },
  { type: "rectangle", id: "n4", x: 205, y: 250, width: 150, height: 24, backgroundColor: "#d0bfff", strokeColor: "#8b5cf6", strokeWidth: 1, opacity: 50, label: { text: "4. verifica + guarda Payment", fontSize: 11 } },
  { type: "arrow", id: "m5", x: 280, y: 300, width: 417, height: 0, points: [[0, 0], [417, 0]], strokeColor: "#8b5cf6", label: { text: "5. POST /documento/ CREA FAC (detalles+cliente+cobro)", fontSize: 11 } },
  { type: "rectangle", id: "n6", x: 600, y: 322, width: 195, height: 40, backgroundColor: "#ffd8a8", strokeColor: "#f59e0b", strokeWidth: 1, opacity: 70, label: { text: "6. emite SRI + emaila al cliente", fontSize: 12 } },
  { type: "arrow", id: "m7", x: 697, y: 382, width: -417, height: 0, points: [[0, 0], [-417, 0]], strokeColor: "#f59e0b", strokeStyle: "dashed", label: { text: "7. FAC id", fontSize: 12 } },
  { type: "arrow", id: "m8", x: 280, y: 415, width: 417, height: 0, points: [[0, 0], [417, 0]], strokeColor: "#8b5cf6", label: { text: "8. PUT prefactura estado=A (reconcile)", fontSize: 11 } },
  { type: "arrow", id: "m9", x: 280, y: 462, width: -195, height: 0, points: [[0, 0], [-195, 0]], strokeColor: "#22c55e", strokeStyle: "dashed", label: { text: "9. pago exitoso", fontSize: 12 } },
  { type: "rectangle", id: "fail", x: 90, y: 498, width: 620, height: 44, backgroundColor: "#ffc9c9", strokeColor: "#ef4444", strokeWidth: 1, opacity: 70, label: { text: "Si crear FAC falla -> NEEDS_REVIEW + dead-letter (NUNCA void Kushki). Fallback: el staff cierra/factura en el POS.", fontSize: 11 } },
];

mkdirSync("docs/diagrams", { recursive: true });
writeFileSync("docs/diagrams/architecture.excalidraw", JSON.stringify(scene(architecture), null, 2));
writeFileSync("docs/diagrams/payment-flow.excalidraw", JSON.stringify(scene(paymentFlow), null, 2));
console.log("Wrote docs/diagrams/architecture.excalidraw and docs/diagrams/payment-flow.excalidraw");
