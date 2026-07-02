/**
 * Frozen table-mapping rule (contracts/contifico-v2/README.md).
 *
 * A Contífico document is linked to a Mesita table by writing
 * `MESITA_TABLE:<posExternalId>` into a configurable free-text document field
 * (default `adicional1`). Parsing is strict: wrong prefix, empty id, oversized
 * id and ambiguous duplicates are all explicit rejections — never guesses.
 */

export const MESITA_TABLE_PREFIX = "MESITA_TABLE:";

/** Documented free-text Documento fields allowed to carry the mapping. */
export const ALLOWED_TABLE_FIELDS = ["adicional1", "adicional2", "descripcion"] as const;
export type TableField = (typeof ALLOWED_TABLE_FIELDS)[number];

export const DEFAULT_TABLE_FIELD: TableField = "adicional1";

/** Sane cap well inside the varchar(300) wire limit. */
export const MAX_POS_EXTERNAL_ID_LENGTH = 64;

export function isAllowedTableField(field: string): field is TableField {
  return (ALLOWED_TABLE_FIELDS as readonly string[]).includes(field);
}

/** Normalize a configured field name, falling back to the default. */
export function resolveTableField(configured: string | null | undefined): TableField {
  if (configured && isAllowedTableField(configured)) return configured;
  return DEFAULT_TABLE_FIELD;
}

export function buildTableMappingValue(posExternalId: string): string {
  const id = posExternalId.trim();
  if (!isValidPosExternalId(id)) {
    throw new Error(`Invalid posExternalId for table mapping: "${posExternalId}"`);
  }
  return `${MESITA_TABLE_PREFIX}${id}`;
}

export function isValidPosExternalId(id: string): boolean {
  if (!id || id.length > MAX_POS_EXTERNAL_ID_LENGTH) return false;
  // no whitespace, no ":" (would make prefix parsing ambiguous)
  return !/[\s:]/.test(id);
}

/**
 * Parse a raw wire value. Returns the posExternalId or null when the value is
 * not a valid Mesita mapping (missing prefix, empty/oversized/malformed id).
 */
export function parseTableMappingValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value.startsWith(MESITA_TABLE_PREFIX)) return null;
  const id = value.slice(MESITA_TABLE_PREFIX.length).trim();
  return isValidPosExternalId(id) ? id : null;
}

export interface TableMappingResolution {
  /** posExternalId → documentId for unambiguous OPEN documents */
  mapped: Map<string, string>;
  /** documents with no valid mapping value (skip + log) */
  unmapped: string[];
  /** posExternalIds claimed by 2+ open documents — ALL skipped, none guessed */
  ambiguous: Map<string, string[]>;
}

/**
 * Resolve mappings across a set of open documents. Two open documents mapping
 * to the same table are ambiguous: both are excluded and reported.
 */
export function resolveTableMappings(
  docs: Array<{ id: string; mappingValue: unknown }>
): TableMappingResolution {
  const byExternalId = new Map<string, string[]>();
  const unmapped: string[] = [];

  for (const doc of docs) {
    const externalId = parseTableMappingValue(doc.mappingValue);
    if (externalId === null) {
      unmapped.push(doc.id);
      continue;
    }
    const list = byExternalId.get(externalId) ?? [];
    list.push(doc.id);
    byExternalId.set(externalId, list);
  }

  const mapped = new Map<string, string>();
  const ambiguous = new Map<string, string[]>();
  for (const [externalId, docIds] of byExternalId) {
    if (docIds.length === 1) mapped.set(externalId, docIds[0]);
    else ambiguous.set(externalId, docIds);
  }

  return { mapped, unmapped, ambiguous };
}
