import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";

const byNamePrice = new Map<string, string>();
const byName = new Map<string, string>();

function priceKey(name: string, price: number): string {
  return `${name.trim().toLowerCase()}|${Math.round(price * 100)}`;
}

for (const def of DEMO_TABLE_DEFINITIONS) {
  for (const item of def.items) {
    const emoji = item.emoji || "🍽️";
    byNamePrice.set(priceKey(item.name, item.unitPrice), emoji);
    if (!byName.has(item.name.trim().toLowerCase())) {
      byName.set(item.name.trim().toLowerCase(), emoji);
    }
  }
}

const RULES: Array<[RegExp, string]> = [
  [/empanada/i, "🥟"],
  [/bol[oó]n/i, "🥟"],
  [/humita/i, "🌽"],
  [/tigrillo/i, "🍳"],
  [/fritada/i, "🍖"],
  [/seco/i, "🍖"],
  [/churrasco/i, "🥩"],
  [/parrillada/i, "🍖"],
  [/locro/i, "🥣"],
  [/arroz/i, "🍚"],
  [/encebollado/i, "🐟"],
  [/encocado/i, "🐟"],
  [/ceviche/i, "🦐"],
  [/langostino/i, "🦐"],
  [/llapingacho/i, "🥔"],
  [/patac[oó]n/i, "🥔"],
  [/ensalada/i, "🥗"],
  [/jugo|naranjilla|maracuy[aá]/i, "🧃"],
  [/cerveza|pilsener|club/i, "🍺"],
  [/cola/i, "🥤"],
  [/caf[eé]/i, "☕"],
  [/agua/i, "💧"],
  [/vino/i, "🍷"],
  [/tres leches|postre|volc[aá]n|chocolate/i, "🍰"],
  [/pollo/i, "🍗"],
];

/** Emoji for a POS línea — catalog first, then heuristics, then plate default. */
export function emojiForPosDish(name: string, unitPrice?: number): string {
  const trimmed = name.trim();
  if (unitPrice != null && Number.isFinite(unitPrice)) {
    const exact = byNamePrice.get(priceKey(trimmed, unitPrice));
    if (exact) return exact;
  }
  const loose = byName.get(trimmed.toLowerCase());
  if (loose) return loose;
  for (const [re, emoji] of RULES) {
    if (re.test(trimmed)) return emoji;
  }
  return "🍽️";
}
