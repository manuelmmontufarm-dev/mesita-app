/** Stable ids for the public /pay/demo experience (Postgres-backed, no POS). */
export const DEMO_RESTAURANT_ID = "rest-mesita-demo";
export const DEMO_TABLE_ID = "tbl-mesita-demo";
export const DEMO_TABLE_TOKEN = "demo";
export const DEMO_BILL_ID = "bill-mesita-demo";

export function isDemoRestaurant(restaurantId: string): boolean {
  return restaurantId === DEMO_RESTAURANT_ID;
}

export function isDemoTableToken(token: string): boolean {
  return token === DEMO_TABLE_TOKEN;
}

/** Copy + defaults for the public demo lobby (/pay/demo). */
export const DEMO_LOBBY = {
  restaurantName: "La Doña Pepa",
  tagline: "Comida casera ecuatoriana",
  table: "12",
  city: "Quito",
} as const;

/** Client-side emoji hints for seeded demo menu copy. */
export function emojiForItemName(name: string): string | undefined {
  const rules: Array<[RegExp, string]> = [
    [/locro/i, "🥣"],
    [/seco/i, "🍖"],
    [/encebollado/i, "🐟"],
    [/ceviche/i, "🦐"],
    [/jugo|naranjilla/i, "🧃"],
    [/club/i, "🍺"],
  ];
  for (const [re, emoji] of rules) {
    if (re.test(name)) return emoji;
  }
  return undefined;
}
