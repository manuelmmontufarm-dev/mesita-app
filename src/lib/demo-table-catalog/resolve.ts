import { DEMO_TABLE_DEFINITIONS, type DemoTableDefinition } from "./definitions";

/** Strict slug regex — alphanumeric with optional internal hyphens, max 32 chars. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

const BY_TOKEN: Map<string, DemoTableDefinition> = new Map(
  DEMO_TABLE_DEFINITIONS.map((d) => [d.token, d]),
);

const DEFAULT_DEF =
  DEMO_TABLE_DEFINITIONS.find((d) => d.slug === "default") ??
  DEMO_TABLE_DEFINITIONS[0];

export function resolveDemoTableToken(
  token: string,
): DemoTableDefinition | null {
  if (typeof token !== "string" || token.length === 0) return null;

  if (token === "demo") return DEFAULT_DEF;

  if (!token.startsWith("demo-")) return null;
  const slug = token.slice("demo-".length);
  if (!SLUG_RE.test(slug)) return null;

  return BY_TOKEN.get(token) ?? null;
}

export function isCatalogDemoToken(token: string): boolean {
  return resolveDemoTableToken(token) !== null;
}

export function listDemoTables(): DemoTableDefinition[] {
  return DEMO_TABLE_DEFINITIONS.slice();
}

/** Mesa 12 / `/pay/demo` — only table with manual Reiniciar in the guest UI. */
export function isDemoUxTableToken(token: string): boolean {
  const def = resolveDemoTableToken(token);
  return def?.token === "demo" || def?.table.name === "12";
}
