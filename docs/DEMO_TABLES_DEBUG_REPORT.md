# Demo Tables Debug Report

Five demo tables share the `/pay/demo` infrastructure. Token `demo` is the
legacy default (byte-identical to the prior single-table flow). Tokens
`demo-mesa-1..4` are new and each exercise a different scenario.

| Slug      | Token         | Mesa | URL                                                         |
| --------- | ------------- | ---- | ----------------------------------------------------------- |
| `default` | `demo`        | 12   | `https://mesitademo-two.vercel.app/pay/demo`                   |
| `mesa-1`  | `demo-mesa-1` | 1    | `https://mesitademo-two.vercel.app/pay/demo/mesa-1`            |
| `mesa-2`  | `demo-mesa-2` | 2    | `https://mesitademo-two.vercel.app/pay/demo/mesa-2`            |
| `mesa-3`  | `demo-mesa-3` | 3    | `https://mesitademo-two.vercel.app/pay/demo/mesa-3`            |
| `mesa-4`  | `demo-mesa-4` | 4    | `https://mesitademo-two.vercel.app/pay/demo/mesa-4`            |

> URLs use `NEXT_PUBLIC_APP_URL` at build time. Override with
> `NEXT_PUBLIC_APP_URL=https://your-host npm run demo:qr-pack`.

---

## `default` — Baseline

- **Token**: `demo`
- **URL**: `https://mesitademo-two.vercel.app/pay/demo`
- **Restaurant**: La Doña Pepa · Mesa 12 · Quito

| qty | item                 | $    |
| --- | -------------------- | ---- |
| 1   | Locro de papa        | 4.50 |
| 1   | Seco de chivo        | 8.90 |
| 1   | Encebollado          | 6.00 |
| 1   | Ceviche de camarón   | 9.50 |
| 1   | Jugo de naranjilla   | 2.50 |
| 1   | Jugo de naranjilla   | 2.50 |
| 1   | Club Verde           | 2.75 |
| 1   | Club Verde           | 2.75 |

- **Scenario**: Baseline — escenario actual de `/pay/demo`.
- **Expected**: identical to historical behaviour. No seeded payments.
- **E2E**: covered indirectly by `tests/e2e/demo-multi-device.spec.ts`.

## `mesa-1` — Almuerzo clásico

- **Token**: `demo-mesa-1`
- **URL**: `https://mesitademo-two.vercel.app/pay/demo/mesa-1`
- **Restaurant**: La Doña Pepa · Mesa 1 · Quito

| qty | item                 | $    |
| --- | -------------------- | ---- |
| 1   | Bolón de verde       | 4.25 |
| 1   | Churrasco            | 9.50 |
| 1   | Llapingachos         | 6.75 |
| 1   | Jugo de mora         | 2.50 |
| 1   | Agua sin gas         | 1.25 |
| 1   | Cerveza Pilsener     | 2.75 |

- **Scenario**: Mesa limpia — prueba join + split by item + pay desde cero.
- **Expected**: empty start; normal join + split + pay flow.
- **E2E**: `tests/e2e/demo-mesa-1.spec.ts`.

## `mesa-2` — Pagos parciales

- **Token**: `demo-mesa-2`
- **URL**: `https://mesitademo-two.vercel.app/pay/demo/mesa-2`
- **Restaurant**: La Doña Pepa · Mesa 2 · Quito

| qty | item                  | $    |
| --- | --------------------- | ---- |
| 1   | Fritada               | 8.50 |
| 1   | Tigrillo              | 5.50 |
| 2   | Empanada de viento    | 2.25 |
| 1   | Cola nacional         | 1.75 |
| 1   | Café pasado           | 2.00 |
| 1   | Humita                | 3.25 |

- **Scenario**: Pagos parciales — prueba % progreso y gracias parcial sin
  cerrar mesa.
- **Seed**: `paidItemIds: ["fritada"]`, `itemPaidUnits: { fritada: 1, empanada: 1 }`.
- **Expected**: at entry, Fritada is fully paid, 1 of 2 Empanadas paid.
- **E2E**: `tests/e2e/demo-mesa-2.spec.ts`.

## `mesa-3` — Grupo grande

- **Token**: `demo-mesa-3`
- **URL**: `https://mesitademo-two.vercel.app/pay/demo/mesa-3`
- **Restaurant**: La Doña Pepa · Mesa 3 · Quito

| qty | item                       | $     |
| --- | -------------------------- | ----- |
| 2   | Ceviche mixto              | 10.50 |
| 1   | Encocado de pescado        | 9.75  |
| 1   | Seco de pollo              | 7.50  |
| 1   | Arroz marinero             | 11.00 |
| 2   | Patacones                  | 3.00  |
| 3   | Cerveza Club Verde         | 2.75  |
| 2   | Jugo de maracuyá           | 2.50  |
| 1   | Agua con gas               | 1.50  |
| 2   | Tres leches                | 4.00  |

- **Scenario**: Cuenta larga — prueba scroll bill, dock, recibo, performance sync.
- **Expected**: ~9 line items, several with qty>1. UI should scroll.
- **E2E**: `tests/e2e/demo-mesa-3.spec.ts`.

## `mesa-4` — Cierre total (≥$50)

- **Token**: `demo-mesa-4`
- **URL**: `https://mesitademo-two.vercel.app/pay/demo/mesa-4`
- **Restaurant**: La Doña Pepa · Mesa 4 · Quito

| qty | item                       | $     |
| --- | -------------------------- | ----- |
| 1   | Parrillada para dos        | 22.50 |
| 1   | Langostinos al ajillo      | 14.50 |
| 1   | Arroz verde                | 3.50  |
| 1   | Ensalada de la casa        | 4.75  |
| 2   | Copa de vino tinto         | 5.50  |
| 1   | Volcán de chocolate        | 5.25  |

- **Scenario**: Modo Todo — cuenta ≥$50, factura obligatoria, cierre mesa.
- **Expected**: bill total ≥ $50 triggers invoice flow on Modo Todo.
- **E2E**: `tests/e2e/demo-mesa-4.spec.ts`.

---

## How to regenerate

```bash
# QR pack (multi-page PDF + manifest.json)
npm run demo:qr-pack
# → docs/demo-qr-pack/demo-tables-qr.pdf
# → docs/demo-qr-pack/manifest.json

# Unit + store tests
npm run test

# Playwright e2e (single mesa or all four)
npm run test:e2e -- demo-mesa

# Smoke against a running dev server
SMOKE_URL=http://localhost:3000 npm run demo:smoke
```

## Known issues / follow-ups

- The dev list page (`/pay/demo/qr`) is out of scope for this PR.
- E2E specs cover lobby + menu visibility; deeper interaction (claim → pay
  → reflect across devices) reuses the helpers in
  `tests/e2e/helpers/demo.ts` and can be extended per-mesa as needed.
