import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import type { DemoFoodItem } from "@/lib/demo-table-store";
import type { DemoPosCategory, DemoPosConfig, DemoPosExtraTable, DemoPosMenuItem } from "./types";

const DRINK_KW = /jugo|cerveza|agua|cola|café|cafe|vino|club/i;
const DESSERT_KW = /tres leches|postre|humita|volcán|volcan|chocolate/i;

function categorize(name: string): string {
  if (DRINK_KW.test(name)) return "cat-bebidas";
  if (DESSERT_KW.test(name)) return "cat-postres";
  return "cat-platos";
}

const DEFAULT_CATEGORIES: DemoPosCategory[] = [
  { id: "cat-platos", name: "Platos principales", order: 0 },
  { id: "cat-bebidas", name: "Bebidas", order: 1 },
  { id: "cat-postres", name: "Postres", order: 2 },
];

function itemKey(item: DemoFoodItem): string {
  return `${item.name.toLowerCase()}|${item.unitPrice}`;
}

export function buildSeedMenu(): Pick<DemoPosConfig, "categories" | "menuItems"> {
  const seen = new Set<string>();
  const menuItems: DemoPosMenuItem[] = [];

  for (const def of DEMO_TABLE_DEFINITIONS) {
    for (const item of def.items) {
      const key = itemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      menuItems.push({
        id: `menu-${item.id}`,
        name: item.name,
        emoji: item.emoji || "🍽️",
        price: item.unitPrice,
        categoryId: categorize(item.name),
        available: true,
        posSku: item.posExternalId ?? `SKU-${item.id}`,
      });
    }
  }

  menuItems.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { categories: DEFAULT_CATEGORIES, menuItems };
}

/** Display-only tables for the dashboard demo (no live QR). */
export const SEED_DEMO_TABLES: DemoPosExtraTable[] = [
  { id: "demo-mesa-5", name: "Mesa 5", posExternalId: "T-005", createdAt: new Date().toISOString() },
  { id: "demo-mesa-6", name: "Mesa 6", posExternalId: "T-006", createdAt: new Date().toISOString() },
  { id: "demo-mesa-7", name: "Mesa 7", posExternalId: "T-007", createdAt: new Date().toISOString() },
  { id: "demo-mesa-8", name: "Mesa 8", posExternalId: "T-008", createdAt: new Date().toISOString() },
];
