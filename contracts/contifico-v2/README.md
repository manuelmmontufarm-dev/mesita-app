# Frozen Contífico v2 Contract — Mesita subset (Relay 01)

Status: FROZEN for this milestone. Authority order: (1) official OpenAPI
(`https://contificostatics.azureedge.net/static/shell/media/docs/openapiv2.yaml?v=3`,
snapshot reviewed 2026-07-01), (2) official docs page, (3) sandbox observations
(marked OBSERVED), (4) nothing else. The Mesita POS simulator's `/sistema/api/v2`
façade MUST implement exactly this; the app adapter MUST consume exactly this.
Anything marked **UNVERIFIED** stays unverified until a real Contífico sandbox
key + test PRE documents exist.

Base URL: `{CONTIFICO_BASE_URL}` ending in `/sistema/api/v2`
(production `https://api.contifico.com/sistema/api/v2`). Switching between the
simulator and real Contífico is configuration only: base URL + API key.

## O1 — Authentication

Every request: header `Authorization: <API_KEY>` — the **raw key**, no `Token `
or `Bearer ` prefix (OpenAPI: "Authorization: SECRETKEY").
Missing/invalid → `401` (shape UNVERIFIED; parse defensively, never as success).

## O2 — List PRE documents

`GET /documento/?tipo=PRE&result_size={n}&result_page={p}`

- Documented query params: `tipo` (NOT `tipo_documento`), `result_size`,
  `result_page`, plus date/persona filters we do not use.
- Success `200`. Envelope **UNVERIFIED**: parser MUST accept both a bare JSON
  array and `{ "count": n, "results": [...] }`.
- Defensive client-side filter regardless of upstream honoring the query:
  keep only `tipo_documento === "PRE"` AND `estado ∈ {P, E}` (open/eligible).
- Retry: safe (idempotent read).
- Fixtures: `fixtures/documento-list-array.json`, `fixtures/documento-list-envelope.json`.

## O3 — Fetch single documento

`GET /documento/{id}/` — **OBSERVED working in sandbox 2026-06-02; NOT in the
OpenAPI** (only PUT is documented on that path). Frozen as used, marked
UNDOCUMENTED-OBSERVED. `404` → document gone/never existed. `200` → Documento.
Retry: safe. Fixture: `fixtures/documento-single-open.json`,
`fixtures/documento-single-closed.json`.

## O4 — Authoritative totals and items

From Documento (wire names are law; rename only inside the anti-corruption layer):

| Wire field | Type (max) | Notes |
|---|---|---|
| `id` | varchar(16) | document id |
| `tipo_documento` | varchar(3) | `PRE` for our subset |
| `estado` | char(1) | `P` pendiente, `C` cobrado, `G` pagado, `A` anulado, `E` generado, `F` facturado |
| `pos` | varchar(36) | POS API token; null for manually created docs |
| `documento` | varchar(17) | document number |
| `subtotal_0` | decimal(8,2) | 0%-IVA base |
| `subtotal_12` | decimal(8,2) | **taxed base — wire name stays `subtotal_12` even when applicable IVA is 15%. Never rename on the wire.** |
| `iva` | decimal | IVA amount |
| `servicio` | decimal(8,2) | service charge (propina) |
| `total` | decimal(8,2) | authoritative total |
| `adicional1` / `adicional2` | varchar(300) | free-text; default table-mapping carrier |
| `descripcion` | text | free-text |
| `detalles[]` | object | `producto_id` varchar(16), `cantidad` decimal(7,6-int? documented 7 int/6 dec on create), `precio` decimal, `porcentaje_iva` int |
| `cliente` | object | `cedula`(10) `ruc`(13) `razon_social`(300) `tipo`(1: N/J/I/P) `email`(50) |
| `cobros[]` | object | see O7 |

- Money values may arrive as JSON number or numeric string → parse to integer
  cents. No floating-point equality anywhere.
- Open-for-cobro states: `P`, `E`. Closed: `C`, `G`, `A`, `F`.
  (`G:pagado` and `E:generado` exist in v2 docs and were missing from the old
  adapter's C/F/A logic.)

## O5 — Persona (read; create only when supported)

Lookup: `GET /persona/?search={identificacion}` — documented param is `search`
(matches razon_social, nombre_comercial, cedula, ruc). The old
`?identificacion=` param is UNDOCUMENTED — removed. Client MUST post-filter
results where `cedula === id || ruc === id` (search is fuzzy).

Create: `POST /persona/?pos={API_TOKEN}` — note the documented **`pos` query
param**. Body (documented):

```json
{
  "tipo": "N",
  "cedula": "0912345678",        // or "ruc" (13) for RUC
  "razon_social": "…(300)",
  "email": "…(50)",
  "es_cliente": true,
  "es_proveedor": false
}
```

Required: `tipo`, `razon_social`, `es_cliente`, `es_proveedor`, and at least
one of `es_cliente`/`es_proveedor` true (OpenAPI NOTA). The param table marks
`cedula` "Si" but the spec's own examples omit it for tipo I/extranjero — we
require `cedula`/`ruc` for tipo N/J (the only types Mesita creates); this
conditional reading is an interpretation, **UNVERIFIED** against the sandbox.
The old payload fields `tipo_identificacion`/`identificacion` are NOT in the
documented schema — removed. Persona create is **config-gated and UNVERIFIED**
against the real sandbox (a 400 on create degrades gracefully: cobro proceeds
with the document's existing cliente).
Retry: lookup safe; create NOT safe blind — reconcile via lookup first.

## O6 — Update document customer

Documented: `PUT /documento/{id}` requires the FULL document body (pos,
fecha_emision, tipo_documento, documento, cliente, detalles, totals…).
The old app behavior (partial `PUT { cliente_id }`) is UNDOCUMENTED.

Frozen decision: the operation is **disabled by default**
(`posAttachCliente=false` per restaurant). The simulator façade implements the
documented **partial-cliente update** `PUT /documento/{id}/` with body
`{ "cliente": { … } }` for parity experiments, but production code only calls
it when the config flag is on, and the call is best-effort (failure logs +
continues; the cobro still proceeds). Real-API semantics **UNVERIFIED**.
Retry: NOT safe blind; read back (O3) to verify.

## O7 — Cobros (list + create)

List: `GET /documento/{id}/cobro/` → `200` array of Cobro:

| Wire field | Type (max) |
|---|---|
| `id` | varchar(16) |
| `forma_cobro` | varchar(10) — `EF` efectivo, `TC` tarjeta (must exist in the account) |
| `monto` | decimal(8,2) |
| `fecha` | `dd/mm/yyyy` |
| `tipo_ping` | char(1): D datafast, M medianet, E dataexpress, P placetopay, A alignet |
| `lote` | varchar(16) — **response-only** |
| `numero_comprobante` | varchar(15) |
| `monto_propina` | decimal(8,2) |

Create: `POST /documento/{id}/cobro/` — documented body params ONLY:

```json
{
  "forma_cobro": "TC",
  "monto": 12.5,
  "fecha": "01/07/2026",
  "tipo_ping": "D",
  "numero_comprobante": "MSTA1A2B3C4D5E6"
}
```

- `forma_cobro` (req), `monto` (req, ≤ 8 int + 2 dec, > 0), `fecha` (opt,
  dd/mm/yyyy), `tipo_ping` (req for TC), `numero_comprobante` (opt, ≤15),
  `numero_cheque`, `cuenta_bancaria_id` (unused by Mesita).
- **`lote` and `descripcion` are absent from the documented POST param table —
  removed from the request.** (Caveat: the spec's own `tarjeta` example does
  include `lote` as a number; the param table wins here, and the official
  examples also show `lote`/`numero_comprobante` as JSON *numbers*, so
  response parsing tolerates number-or-string for those fields.)
  `tipo_ping` is marked "Si" in the table while the `efectivo` example omits
  it — interpreted as required-for-TC-only (UNVERIFIED).
  The Mesita payment reference travels in `numero_comprobante`,
  derived deterministically from the payment id to ≤15 chars
  (`MSTA` + first 11 hex chars of sha256(paymentId) uppercased — see
  `src/modules/pos/contract/payment-reference.ts`). The old
  36-char-UUID-into-`lote` violated the documented 16-char max.
- Success `201` → Cobro. `400` → validation. Any other status (409 included) is
  **NOT success**: run reconciliation — `GET /documento/{id}/cobro/` and treat
  as already-registered ONLY if a cobro with our `numero_comprobante` exists.
- Idempotency is owned by Mesita: at most one POST per Mesita payment
  (payment row carries `posRegistered` state; reconciliation read gates every
  retry). Partial payments: one cobro per split; Contífico marks the document
  `C` when Σ cobros = total.
- Retry: NOT safe blind. Retry only after a reconciliation read shows the
  cobro absent.

## O8 — Document state for reconciliation

Via O3 (`estado`) + O7 list. `exists=false` on 404. Closed ⇔ estado ∈ {C,G,A,F}.
(`GET /documento/estado/{id}` also exists in the OpenAPI but reports
SRI/electronic-authorization state, not payment state — NOT in our subset.)

## O9 — Faults every consumer must handle

| Fault | Representation | Client behavior |
|---|---|---|
| Validation | `400` (body shape UNVERIFIED) | surface safely, never retry same body |
| Auth | `401`/`403` | fail fast, alert config error |
| Not found | `404` | document gone → mark unavailable |
| Upstream error | `500` | retry reads with backoff; writes go through reconciliation |
| Timeout | client-side abort (45 s) | same as 500 |
| Stale read | old snapshot returned | freshness window logic (Phase 4 lease) |
| Delayed consistency | write not yet visible in list | reconciliation must tolerate; never double-write |

The simulator façade exposes deterministic fault profiles for all of these
(via `X-Fault-Profile` header / config — Phase 2).

## Table-mapping rule (frozen)

- Config: `posTableField` ∈ {`adicional1`, `adicional2`, `descripcion`};
  default **`adicional1`**.
- Wire value: `MESITA_TABLE:<posExternalId>`.
- Parser (`src/modules/pos/contract/table-mapping.ts`):
  - exact prefix `MESITA_TABLE:` required — anything else → not mapped;
  - `<posExternalId>` non-empty after trim, ≤ 64 chars, no whitespace/`:` inside;
  - two OPEN documents resolving to the same external id → **ambiguous**: both
    skipped and flagged, never guessed;
  - full value must fit varchar(300) (enforced by 64-char id cap).

## Still UNVERIFIED until a real sandbox exists

1. List envelope shape (array vs `{count, results}`).
2. Whether `GET /documento/{id}/` stays available (undocumented).
3. Persona create acceptance (`?pos=` query param semantics, exact 400s).
4. Partial `PUT /documento/{id}/` with `{cliente}` only.
5. Real 4xx/5xx body shapes.
6. Real-Contífico sync latency (the 2 s p95 SLO is simulator-only).
7. Whether real accounts accept `numero_comprobante` on TC cobros the way the
   docs state (previous sandbox runs used the undocumented `lote`).

## Fixture inventory (sanitized, golden)

`contracts/contifico-v2/fixtures/` — single source of truth. The Mesita-POS
repo carries a copy under `tests/contract/fixtures/` (synced manually; this
directory is canonical). No credentials, no real customer data.
