# PagaYa Frontend Skill Set

> ## 📓 REGLA OBLIGATORIA — Bitácora `TODAY.md`
>
> **Antes de editar cualquier cosa en este repo, LEE primero [`TODAY.md`](./TODAY.md)**
> para saber en qué estado está el proyecto y qué hay que tener cuidado.
>
> **Después de cada cambio (edit), REGÍSTRALO en `TODAY.md`** en la sección
> *"🗂️ Registro de cambios"* (lo más nuevo arriba), respondiendo siempre:
> - **QUÉ** se cambió (archivo/área),
> - **POR QUÉ** se cambió (el problema o el objetivo),
> - **QUÉ HACE** el cambio (el efecto concreto).
>
> No omitas esto aunque el cambio parezca pequeño. El formato exacto de cada
> entrada está descrito dentro de `TODAY.md`.

> ## 🧪 REGLA OBLIGATORIA — Red de regresión multi-usuario
>
> **Cada vez que aparece un bug en uso real de `/pay/demo` (o de cualquier
> parte del flujo guest/pago multi-dispositivo), antes de arreglarlo se
> agrega como un nuevo escenario en
> [`src/lib/demo-scenarios.ts`](./src/lib/demo-scenarios.ts)** (el catálogo
> compartido entre Layer 1 vitest y Layer 2 Playwright).
>
> El bug primero queda como un **test rojo que reproduce el problema**, luego
> se arregla el código hasta que el test pase. Así la suite crece como red
> de regresión permanente — cada bug encontrado ya no vuelve.
>
> ### Pasos concretos
>
> 1. **Reproducir el bug como escenario.** Abre `src/lib/demo-scenarios.ts`
>    y añade una entrada al array `SCENARIOS` con el próximo id (`"21"`,
>    `"22"`...), una `category`, un `name` corto y un `run(token)` que use
>    `SimulatedDevice` para reproducir los pasos.
>    - Si el bug NO tiene cara visible (solo afecta el store), marca
>      `storeOnly: true`. Layer 2 lo saltea automáticamente.
> 2. **Correr Layer 1 para confirmar que falla.**
>    ```bash
>    npm test -- multi-user-scenarios
>    ```
>    El nuevo escenario debería salir rojo. Si sale verde, el repro está
>    mal escrito y no captura el bug — reescríbelo antes de tocar código.
> 3. **Arreglar el código** en `demo-table-store.ts` /
>    `useDemoTableSession.ts` / etc. Re-corre hasta que TODOS los escenarios
>    queden verdes (cada uno corre 20× con jitter — si falla 1/20, es bug).
> 4. **Si el bug tiene UI observable**, añade un test correspondiente en
>    [`tests/e2e/demo-multi-device.spec.ts`](./tests/e2e/demo-multi-device.spec.ts)
>    que ejercite el mismo flujo con BrowserContexts reales. Reusa el helper
>    `enterTable()` y los testids existentes (`demo-enter-table-btn`,
>    `bill-name-input`, `demo-debug-panel`).
> 5. **Correr ambas capas verdes:**
>    ```bash
>    npm test          # Layer 1
>    npm run test:e2e  # Layer 2
>    ```
> 6. **Anotar en `TODAY.md`** qué bug se arregló, cómo, y que el escenario
>    N quedó en el catálogo.
> 7. **Commit + push.** El mensaje del commit debe nombrar el escenario:
>    `fix(demo): scenario [21] — <descripción> + repro test`.
>
> ### Para asistentes AI
>
> Si te dicen "hay un bug donde X cuando Y", **NO toques código de
> producción primero**. Empieza por:
> - Leer el último escenario en `SCENARIOS` para entender el patrón.
> - Escribir un nuevo escenario que reproduzca exactamente X-cuando-Y.
> - Correr Layer 1 y verificar que el nuevo test falla por la razón
>   correcta.
> - Solo entonces arreglar el código.
>
> Esta disciplina es lo que mantiene la demo airtight bajo carga real de
> 3-5 celulares simultáneos.

## Product Context
PagaYa es una app de pagos para restaurantes.

La UI debe sentirse:
- rápida
- clara
- confiable
- cálida
- fácil de usar bajo presión

Prioriza claridad sobre decoración. El usuario puede ser:
- un cliente pagando desde su celular después de escanear un QR
- un mesero manejando mesas, cuentas e items
- un manager revisando operaciones
- un owner revisando reportes

Cada pantalla debe sentirse diseñada para su contexto real, no como una plantilla genérica.

## System Architecture — POS-Integrated (Camino A)

PagaYa is **POS-integrated**, not standalone. The restaurant's POS (Contífico/Siigo) owns the order and the factura electrónica. PagaYa is the QR pay-at-table UX + payment layer on top of it.

### Flow
1. **Order ingestion** — PagaYa **polls** the POS for open bills (Contífico *prefacturas*, type `PRE`) and creates a `Bill` + `BillItems` from the document's `detalles` (line items, quantities, unit prices, taxes). Contífico has **no webhooks**, so ingestion is polling-based and must be idempotent (keyed on the POS document id).
2. **Guest payment** — Guest scans the table QR, opens `/pay/[token]`, sees the bill, and pays via Kushki (full / equal split / by-item). This layer already exists and is unchanged.
3. **Payment confirmation** — On `FULLY_PAID`, PagaYa writes the result back to the POS (records a `cobro` / converts the prefactura to factura).
4. **Facturación electrónica** — **The POS issues the SRI factura, not PagaYa.**

### Hard rules
- **No Dátil.** Each POS issues its own factura electrónica. Do **not** create `FacturaJob`s or call Dátil. The existing Dátil/FacturaJob code (`payment.service.ts`, `/api/facturas/retry`) is legacy slated for removal — do not extend it.
- **Polling, not webhooks.** Build order ingestion for idempotent re-ingestion; never assume the POS will push.
- **POS is the source of truth for items and prices.** Mirror the POS amounts; don't recompute totals from scratch when the POS provides authoritative values.
- **Table↔document mapping** goes through `Table.posExternalId` → internal `Table.id`/token. A POS document has no concept of a physical table.

### POSAdapter contract
The `POSAdapter` interface (`src/lib/pos/adapter.interface.ts`) must support order ingestion and payment confirmation, not just `printReceipt()` / `ping()`:
- `pullOrders(restaurant)` — fetch open prefacturas from the POS
- `confirmPayment(order, payment)` — write the payment back / close the document

First concrete implementation: `ContificoAdapter` against `https://api.contifico.com/sistema/api/v1/` (API-key auth). New POS vendors (Siigo, Practicis) are added by implementing `POSAdapter` only — no changes to the payment flow.

## Visual Direction
Usa una paleta cálida y confiable:

- Primary: `#E86A33`
- Primary dark: `#C94F1D`
- Primary soft: `#FFF1E8`
- Success: `#2F9E73`
- Success soft: `#E8F7F0`
- Background: `#FFFDF9`
- Surface: `#FFFFFF`
- Surface muted: `#F7F2EC`
- Text main: `#1F2933`
- Text muted: `#6B7280`
- Border: `#E7DDD2`
- Error: `#D64545`
- Warning: `#F2A93B`

Do not create a UI dominated only by orange, beige, or warm tones. Use warm accents, neutral surfaces, and green only for success states.

## High-Fidelity UI Standard
All frontend work for PagaYa should aim for high-fidelity production UI, not rough wireframes or placeholder layouts.

High-fidelity means:
- spacing feels intentional and consistent
- typography hierarchy is clear
- buttons, inputs, cards, badges, and dialogs look production-ready
- loading, empty, error, and success states are visually polished
- mobile layouts feel designed, not just compressed desktop views
- colors are used with restraint and clear meaning
- icons are aligned, sized consistently, and used only when they clarify the action
- hover, focus, disabled, and loading states are included where relevant
- components feel like part of one coherent product

Avoid:
- generic AI-looking dashboards
- oversized cards with too much empty space
- random gradients, decorative blobs, or stock SaaS styling
- inconsistent border radius, shadows, spacing, or font sizes
- placeholder-looking layouts
- one-off styles that do not match the rest of the app

Before finishing UI work, review the screen as if it were shipping to real restaurant staff or customers today. If any section looks temporary, generic, or visually disconnected, refine it before stopping.

## UI Principles
- Build the actual app screen, not landing-page-style layouts.
- Avoid decorative hero sections, gradient blobs, oversized cards, and marketing-style composition.
- Restaurant ops screens should be dense, scannable, and action-oriented.
- Customer payment screens should be simple, reassuring, and mobile-first.
- Use clear hierarchy: total due, selected items, payment action, confirmation state.
- Never hide critical payment information behind hover-only interactions.
- Text must not overflow buttons, cards, tables, dialogs, or mobile containers.
- Important actions should be visually obvious without making the UI noisy.
- Do not introduce new UI libraries unless explicitly requested.

## Guest Payment Screen — iOS Liquid Glass Design System

The guest `/pay/[token]` screen uses the **iOS Liquid Glass** design, implemented in `src/app/pay/customer.css`. This is intentionally different from the rest of the app (which uses shadcn/Tailwind). Do NOT apply shadcn or Tailwind utility classes to this screen.

### Design tokens (customer.css)

| Token | Value | Role |
|---|---|---|
| `--c-bg` | `#F1EFEA` | Warm paper background |
| `--c-card` | `#FFFFFF` | Card surface |
| `--c-ink` | `#1B1714` | Primary text |
| `--ok` | `#1E9E63` | Success green |
| `--pay` | `#1A9E62` | **Pay button — GREEN CTA** |
| `--pay-dark` | `#14794B` | Pay button pressed |
| `--accent` | `#2fb37e` | Accent green |
| `--accent-soft` | `rgba(47,179,126,.12)` | Green tint / focus ring |

### Key CSS classes

- `.glassx` — backdrop-filter blur(26px) saturate(180%), used for header and dock
- `.c-pay-btn` — green CTA button (`background: var(--pay)`, green glow shadow) — **NEVER coral**
- `.modeseg` — segmented tab control for "Por ítem / Iguales / Por monto" split modes
- `.c-dock` — fixed bottom dock (full when at bottom, mini pill when scrolling up)
- `.checkout-card` — mode selector cards with `.on` active state
- `.c-sep-line` — divider rule

### Interaction rules

- Font: SF Pro Rounded (falls back to system-ui, rounded)
- Name input with placeholders: `['Ej: Juanito', 'Ej: La Ñaña', 'Ej: El Panita', ...]`
- Tabs: **Cuenta** (bill) | **Mesa** (table overview) — segmented control
- Split modes: `BY_ITEM` → item checkboxes, `EQUAL` → stepper (min 2), `FULL` → amount input
- Tip presets: 10%, 15%, 20%
- Dock scroll detection: scrolls to bottom → full dock; scrolling up → mini pill
- All backend logic (polling, Kushki, idempotency) lives in `src/app/pay/[token]/page.tsx`

For the guest screen, optimize for a customer using a phone after scanning a QR code.

Rules:
- Design mobile-first before desktop.
- The total amount due must be the strongest visual element.
- The primary payment CTA should be obvious and reachable with one thumb. It is **always green** (`var(--pay): #1A9E62`).
- Payment status must never feel ambiguous.
- Show restaurant/table context clearly, but secondary to the bill.
- Avoid dense admin UI patterns.
- Use reassuring copy for payment, confirmation, empty, and error states.
- Success states should feel final, clear, and trustworthy.
- Failed payment states should explain what happened and what the user can do next.
- Do not hide fees, totals, selected items, or payment state.

## Server Dashboard
For mesero/server screens, optimize for speed, scanning, and repeated actions.

Rules:
- Use compact layouts, clear table states, filters, and status badges.
- Avoid oversized cards and decorative layouts.
- Important actions should be one or two taps away.
- Loading states should avoid blocking the whole screen unless required.
- Failed user actions should use toast and keep the dashboard usable.
- Table/payment/order states should be visually distinct at a glance.
- Prefer dense but organized layouts over spacious marketing-style layouts.
- Disabled states are better than hiding unavailable actions when context matters.
- Make it easy to recover from mistakes.

## Login Screen
For login/auth screens, optimize for focus, trust, and polish.

Rules:
- Keep the layout simple, focused, and trustworthy.
- Make the form the primary focus.
- Use warm branding subtly, not as a full orange page.
- Avoid marketing-heavy hero sections unless explicitly requested.
- Show clear validation and auth errors.
- Disable submit while loading.
- Preserve a polished first impression; this screen represents product quality.
- Do not add unnecessary visual noise around the form.

## Manager / Owner Screens
For manager and owner views, optimize for operations, clarity, and decision-making.

Rules:
- Use tables, compact lists, tabs, filters, status badges, and summaries where helpful.
- Prioritize scanning, comparison, and repeated use.
- Avoid landing-page composition.
- Charts and reports must have clear labels, legends, empty states, and loading states.
- Important metrics should be easy to compare.
- Use color meaningfully, not decoratively.
- Keep dashboards dense but readable.

## State Handling
Use explicit early returns for page-level states:

```tsx
if (isError) return <ErrorState />
if (isLoading) return <LoadingState />
if (!data) return <EmptyState />
return <MainContent />
```

For list data:

```tsx
if (!items) return <ErrorState />
if (!items.length) return <EmptyState />
return <ItemList items={items} />
```

Preferred order — Error → Loading → Empty → Data:

```tsx
if (isError) return <Error />
if (isLoading) return <Loader />
if (!data?.length) return <Empty />
return <Data />
```

Avoid `const items = data ?? []` unless the fallback is explicitly intentional and does not hide missing data.

## Error Handling
- React Query hooks may throw.
- Async handlers must use `try/catch`.
- Failed user actions should show `toast.error(...)`.
- Do not send the whole page into an error state for a failed button action.
- Initial load failures may use a full-page error state.
- Polling/refetch failures should use soft feedback or silent handling only if intentional and documented.
- Do not silently swallow errors unless there is a clear UX reason.

## Component Patterns
Use consistent components for:
- loading states
- empty states
- error states
- confirmation states
- destructive actions
- payment success
- table status
- bill status
- order item rows
- summaries and totals

Prefer small components with clear responsibility:
- `BillSummary`
- `PaymentMethodSelector`
- `TableStatusBadge`
- `OrderItemRow`
- `EmptyBillState`
- `PaymentSuccessState`
- `ServerTableCard`
- `LoginForm`

Avoid large components that mix fetching, mutation, rendering, formatting, and interaction logic.

## Forms
- Disable submit while loading.
- Show inline validation where useful.
- Use toast for submit failures.
- Keep labels clear and short.
- Avoid placeholders as the only label.
- Use currency formatting consistently.
- Make destructive actions explicit and confirmed.
- Keep form spacing consistent and mobile-friendly.

## Responsive Rules
- Customer payment flow: optimize first for mobile.
- Staff/server views: work well on mobile and tablet.
- Manager/owner views: work well on tablet and desktop.
- Text must never overflow UI containers.
- Touch targets should be comfortable on mobile.
- Important actions should remain reachable without excessive scrolling.
- Mobile views should feel intentionally designed, not like squeezed desktop screens.

## Code Style
- Follow existing project patterns.
- Prefer existing components from the codebase.
- Keep changes incremental.
- Do not rewrite whole screens unless necessary.
- Do not rename files or change public APIs unless explicitly requested.
- Explain UX tradeoffs before making large changes.
- Maintain current behavior unless changing it is necessary to improve clarity, error handling, or UX.

---

# MesitaQR Design System

Source of truth for the **marketing landing page** (`landing/`). The product app (PagaYa/operator screens above) has different rules — see "Landing vs App" at the end. When in doubt, the landing implementation in `landing/src/` is the reference.

## Brand Personality

MesitaQR is a **premium hospitality operating layer**, not a generic QR menu or SaaS startup. The page should feel like:

> *Apple × Sunday × Stripe × Linear — designed a restaurant payment company.*

- Premium, elegant, confident
- Hospitality-first, human, warm
- Sophisticated, calm, expensive
- Inevitable — "why doesn't every restaurant already work like this?"

**Avoid:** generic SaaS, AI startup aesthetics, crypto, neon, cyberpunk, banking-corporate, template marketplace, decorative gradient blobs.

## Color System

The whole landing is built on CSS variables. All colors live in `landing/src/index.css` under `:root`.

| Token | Hex | Use |
|---|---|---|
| `--ink-900` | `#0b0a09` | Rich warm black — dark sections, body text, primary buttons |
| `--ink-850` | `#131210` | Graphite step |
| `--ink-800` | `#1b1916` | Graphite — secondary dark surfaces |
| `--paper` | `#f6f3ee` | **Warm white page background** (light sections) |
| `--paper-2` | `#efeae2` | Slightly deeper warm — alternating section rhythm |
| `--surface` | `#fdfbf7` | Card white |
| `--gold-1` | `#2fb37e` | **Green primary accent** (var name kept for compatibility) |
| `--gold-2` | `#1f9b6a` | Green dark — pressed/active |
| `--gold-soft` | `#cdf2e1` | Green tint — eyebrows on dark |
| `--emerald` | `#2fb37e` | Same family as `--gold-1`; used for success states |
| `--glow-rgb` | `47, 179, 126` | RGB triplet for the green glow (`rgba(var(--glow-rgb), …)`) |
| `--on-dark` | `#f4f1ea` | Text on dark sections |
| `--on-light` | `#1b1916` | Text on light sections |

### Explicit color rules

- **DO use green/emerald (`#2fb37e`, via `var(--gold-1)` / `var(--accent)`) as the dominant accent.** It carries the brand.
- **DO use emerald (`#2fb37e`) for CTAs, active states, success states, and all accent moments** — buttons, ✓, paid confirmations.
- **DO alternate dark sections (`--ink-900`) and warm light sections (`--paper` / `--paper-2`)** to create editorial rhythm.
- **DO NOT use the legacy coral (`#ff5a4f`) direction.** That was the previous theme and was explicitly rejected. If you see it anywhere, replace with `var(--gold-1)` (`#2fb37e`).
- **DO NOT use the legacy champagne-gold / yellow-brown direction (`#C9A441` and friends).** Also rejected. Replace with green.
- **DO NOT introduce blues, purples, or neon.** The accent palette is green/emerald only.
- **DO NOT add multi-color gradients as decoration.** Use warm radial glows of `rgba(var(--glow-rgb), …)` instead — the green glow (`47, 179, 126`) is the only colored light.

## Typography

- Font stack: SF Pro Display → BlinkMacSystemFont → Inter → Helvetica Neue (defined in `--font`).
- Scale (from `index.css`):
  - `.display` — hero/final-CTA headlines: `clamp(40px, 7vw, 92px)`, weight 600, tracking `-0.035em`, line-height 0.98.
  - `.h-section` — section headers: `clamp(32px, 4.6vw, 60px)`, weight 600, tracking `-0.03em`.
  - `.lede` — supporting paragraphs: `clamp(17px, 1.55vw, 21px)`, line-height 1.5, color `--on-light-mut` (or `.on-dark` modifier).
  - `.eyebrow` — labels above headlines: 13px, weight 600, uppercase, letter-spacing 0.14em, color `--accent` (or `.on-dark` for `--gold-soft` tint).
- Spanish is the primary language. Default language is `es`, English is a toggle. Copy is written natively for Quito restaurant owners — not translated from English. Persist the choice in `localStorage['mesita_lang']`.
- Editorial discipline: large headlines, short sentences, generous whitespace. Avoid walls of text — if a section has more than two paragraphs, it needs a visual anchor.

## Liquid Glass Surfaces

Three Apple-Wallet-inspired surface treatments — use them sparingly and let them carry the premium feel.

- **`.glass`** — translucent floating cards on dark hero/scene backgrounds. Edge sheen via `::after`, deep shadow, blur 26px saturate 165%.
- **`.glass-dark`** — dark glass on light pages (dashboard mockup, AI panel). Same blur/saturate, dark fill.
- **`.card-light`** — solid warm-white product cards on light sections. Apple product page register.

Pair every glass surface with **floating animations** (`.float-a`, `.float-b`) when it sits over imagery, never on flat color.

## Photography & Image Slots

The site uses **scene placeholders** (`PhotoSlot` in `landing/src/lib/photoslot.jsx`), not stock photos. Every major section after the hero has a visual anchor.

- **9 photo slots minimum** across the page: hero, lunch (problem), why-now collage (4 tiles), why (3 alternating rows).
- Three warm variants: `warm` (orange-cream), `evening` (warm pink-orange), `fresh` (green-cream). Pick the one that fits the section's mood.
- Each slot has a monospace `ps-cap` caption ("Imagen de muestra · …") so the slot reads as intentional even without real photography.
- When real restaurant photography arrives, it paints over the placeholder — the scene becomes a graceful fallback.
- Subjects must feel **upscale Quito lunch-rush**, not generic stock — busy professionals, warm light, table-level intimacy.

## Real-Time Shared Table — The Centerpiece

This section (`SharedTable.jsx`) is the visual and product centerpiece of the page. The product story is real-time multi-guest checkout — not QR codes, not payment processing.

Mandatory elements (don't simplify these out):

- **Items rendered as separate rows** — never aggregate "Jugo de maracuyá ×2" into one line. Each diner can own one.
- **Split-by-item interaction with avatar stack** — tapping the split toggle (↔) shares an item between two diners; their avatars overlap; tap each chip to reassign.
- **"Pizza para compartir"** loads pre-split between Tú + Manuel as a default — shows the shared scenario immediately.
- **"Tu parte" total has a green glow** (`textShadow: 0 0 20px rgba(var(--glow-rgb),.55)` — `--glow-rgb: 47, 179, 126`). High contrast is non-negotiable.
- **Pay cascade** — when "you" pay, the other three guests settle on a 1.1s / 2.4s / 3.7s timer with a live feed. The remaining-balance ticks to $0 and the banner flips to "Mesa cerrada."
- **Reset button** brings the table back to the initial claim state. Always.

## Motion

Subtle, Apple-restrained. Never flashy.

- Reveal-on-scroll via `useReveal()` — `.reveal` → `.reveal.in` (opacity + translateY).
- `.float-a` / `.float-b` for cards over imagery (7s / 9s sine).
- `.pop` for elements that appear (avatar chips, toasts).
- `pulseRing` only on "live" status dots.
- Honor `prefers-reduced-motion` — disable transitions globally.

## Contact & CTA

- Primary CTA across the page: "Reservar una demo" → `#contact`.
- Contact section has **three cards with `tel:` / `mailto:` / `wa.me` hrefs AND copy-to-clipboard buttons** — every phone and email must be both dialable and copyable. Confirmation reads "¡Copiado!" for 1.6s.
- Real contacts (in `translations.js > contact`): WhatsApp Ecuador `+593 99 372 8763`, US `+1 872 888 4995`, `contacto@mesitaqr.com`, team emails.
- Footer auto-detects emails (`/@/`) → mailto, phones (`/^\+/`) → tel.

## Mesita AI

- Floating orb (`.ai-orb`) bottom-right, conic-gradient ring, green/emerald primary glow (`var(--glow-rgb)`).
- Canned answers in `translations.js > ai.answers` — **1-2 sentences max, witty, warm, a tiny emoji is fine**. Never long, never salesy. The keyword resolver in `MesitaAI.jsx` maps free-text to one of five canned answers; unknown queries get the `ai.fallback` line.
- Reset messages on language change.

## Section Order (the page is a story, not a feature list)

1. **Hero** — dark cinematic scene + glass bill card + floating pills + QR scan card + stat band
2. **Lunch** — the emotional problem: 14 min of friction
3. **WhyNow** — every other industry already pays this way
4. **How** — three steps, synced phone mockup
5. **Why** — alternating image/text rows, restaurant benefits
6. **Simulator** — interactive ROI with occupancy floor
7. **BeforeAfter** — 14 min → < 1 min, shared-scale bars
8. **SharedTable** — the centerpiece (interactive)
9. **Dashboard** — operator product mock with live toast
10. **Integrations** — modular modes
11. **Trust** — PCI, encryption, SRI, infrastructure
12. **Contact** — three cards + team chips + copy buttons
13. **FinalCTA** — dark scene + floating pills

Don't reorder casually. The emotional arc (problem → context → solution → proof → action) is the design.

## Landing vs App

Two intentionally different registers — don't confuse them.

| Landing pages (`landing/`) | Application screens (rest of repo) |
|---|---|
| Emotional, cinematic, image-led | Dense, operational, task-oriented |
| Large rounded corners, glass surfaces | Compact lists, tables, status badges |
| Editorial spacing, big type | Mobile-first density, scannable hierarchy |
| Warm scene placeholders | No decorative imagery |
| `var(--gold-1)` green (`#2fb37e`), `--ink-900` dark | App palette (PagaYa rules above) |
| Built with vanilla CSS + design tokens | Existing app conventions |

Marketing rules **stop at `landing/`**. Apply them only there.

## Files of Record

- `landing/src/index.css` — full design system (CSS variables, components, animations)
- `landing/src/translations.js` — every string in ES + EN
- `landing/src/lib/` — `lang.jsx` (LangProvider + useLang + money), `reveal.js` (useReveal + useCountTo), `icons.jsx` (Ic), `qr.jsx` (QRCode + QRScanCard), `photoslot.jsx` (PhotoSlot + scene variants), `common.jsx` (LogoMark, Wordmark, SectionHead)
- `landing/src/App.jsx` — section order + LangProvider wrapping
- `landing/src/components/*.jsx` — one file per section, ordered above

When adding to the landing, copy the patterns in these files — don't introduce Tailwind utility classes (the theme is CSS-variable driven by design).
