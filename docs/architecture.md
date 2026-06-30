# Architecture: Modular Monolith + Hexagonal

## Rationale

Single Next.js app, single PostgreSQL DB, single Vercel deploy. Modules are code-organization
boundaries, not separate services. Hexagonal (ports & adapters) applied only where it pays off:
`pos`, `payments`, `bills`, `invoicing` — the integration-heavy edges that change with new vendors.

## Module Layout

```
src/
  app/api/**/route.ts          ← driving adapters (import from @/modules/* only)
  modules/
    payments/
      domain/payment.port.ts   ← PaymentPort interface + shared types
      application/             ← processPayment use case (Prisma direct, see MVP note)
      adapters/stub/         ← STUB PaymentPort (demo/sandbox)
      adapters/diners/       ← Diners Club PaymentPort (production)
      index.ts                 ← public barrel
    pos/
      domain/pos.port.ts       ← PosPort + PosCapabilities interface
      adapters/                ← ContificoAdapter lands here in Phase 6
      index.ts
    bills/
      application/             ← calculateBillBreakdown, calculateRemainingBalance
      index.ts
    invoicing/
      domain/invoicing.port.ts ← InvoicingPort interface (Contífico / Dátil / SRI)
      adapters/datil/          ← legacy Dátil client (removed in Phase 6)
      index.ts
  lib/                         ← shared infra only: db, encryption, api-utils, env, auth
```

## Layering Rules

- `domain/` — interfaces (ports) + entities. No framework dependencies.
- `application/` — use cases orchestrating domain + ports.
- `adapters/` — driven adapters: STUB/Diners clients, Contífico POS client.
- `route.ts` files — driving adapters. Import only from `@/modules/<m>` barrels.

**Cross-module imports go only through barrels.** Never import into `domain/`, `application/`,
or `adapters/` of another module directly.

## MVP Shortcut: Prisma Direct in Application Layer

`application/` use cases may call Prisma directly (`@/lib/db`) for MVP. Every such call is marked:

```ts
// TODO: move to repository layer (H-12 — direct Prisma, MVP shortcut)
```

Post-MVP: introduce `Repository` ports so business logic is ORM-agnostic. Do not add the
abstraction prematurely — only when it aids testability or swapping persistence backends.

## Ports

| Port | Location | Current adapter | Why separate from POS |
|------|----------|-----------------|-----------------------|
| `PaymentPort` | `modules/payments/domain/payment.port.ts` | STUB (`adapters/stub/`) or Diners (`adapters/diners/`) | — |
| `PosPort` | `modules/pos/domain/pos.port.ts` | ContificoAdapter (Phase 6) | — |
| `InvoicingPort` | `modules/invoicing/domain/invoicing.port.ts` | Dátil legacy → Contífico (Phase 6) | Invoicing provider ≠ POS vendor (swap independently) |

## PosCapabilities Pattern

Not all POS vendors support the same features. Before calling optional methods, check capabilities:

```ts
const caps = adapter.capabilities();
if (caps.supportsCloseBill) {
  await adapter.closeBill!({ restaurantId, posDocumentId });
}
```

`PosCapabilities` flags: `supportsWebhooks`, `supportsPolling`, `supportsPartialPayments`,
`supportsCloseBill`, `supportsMenuSync`.

## Why `invoicing` Is a Separate Port from `pos`

The POS vendor and the factura electrónica provider are independent choices:
- A restaurant could use Contífico POS but Dátil for invoicing.
- Tomorrow they could switch to SRI directo without touching POS integration.
- Merging them into `PosPort` would force a full adapter rewrite on provider change.

## Adding a New POS Vendor

1. Create `src/modules/pos/adapters/<vendor>/` implementing `PosPort`
2. Implement `capabilities()` returning the vendor's actual feature flags
3. Export from `src/modules/pos/index.ts`
4. Wire via restaurant config `posProvider` field (Phase 6 schema)

No changes to `payments/`, `bills/`, `invoicing/`, or any route handler.

## Adding a New Invoicing Provider

1. Create `src/modules/invoicing/adapters/<provider>/` implementing `InvoicingPort`
2. Export from `src/modules/invoicing/index.ts`
3. Wire via restaurant config `invoicingProvider` field (Phase 6 schema)

No changes to `payments/`, `pos/`, `bills/`, or any route handler.
