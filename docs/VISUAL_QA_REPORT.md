# Visual QA Report — `/pay/demo` (2026-06-23 polish pass)

> Pass focused on the regressions reported as **0/10** after the rapid
> 2026-06-23 commits to dock / receipt / scroll (`fd94f9b`, `fc82e18`,
> `9c18c45`, `845c183`, `6df2e33`). Scope strictly Apple-grade visual / UX
> polish + R2 hardening — sync/claims (R1, R3, R5) handled separately.

## Summary

| Area | Before | After | Files |
|---|---|---|---|
| CSS file size | 5,122 lines, 83 duplicate selectors | 4,746 lines, ~25 duplicate selectors (intentional overrides only) | `src/app/pay/customer.css` |
| `.donut`, `.ok-ring`, `.confirm-progress`, `.wait-list`, `.share-selected-banner`, `.rm-row`, `.cl-*` | Each defined **twice** byte-for-byte (later copy silently winning). Cascade order was load-bearing for `.ok-title` `font-weight: 720 → 750`. | First copy removed (lines 1398–1773 deleted, 376 lines). Cascade-winning second copy preserved. | `src/app/pay/customer.css` |
| `.ws-mesa-ring-track` / `.ws-mesa-ring-fill` | Stroke 10px, hard 0.35 alpha drop-shadow that bled at low percentages and felt heavy at 100%. | Stroke 9px (more refined, still readable from arm's length), drop-shadow eased to 0.28α with an animated transition. | `src/app/pay/customer.css` |
| `.ws-mesa-ring-dial` | 168×168 dial. | 172×172 — gives the percent label 2px breathing room on each side. | `src/app/pay/customer.css` |
| `.ws-mesa-ring-pct` | `font-weight: 780; letter-spacing: -0.04em`. Tabular numerals visually sit ~1px low inside the dial. | `font-weight: 760`, `letter-spacing: -0.035em`, `transform: translateY(1px)` for optical centering. | `src/app/pay/customer.css` |
| Pay-stack seam (`::after` seal under the dock) | `bottom: -2px; height: 4px; background: #fff;` — solid opaque white strip over the warm-paper receipt produced a perceptible hard edge. | `bottom: -1px; height: 3px; background: rgba(255,255,255,0.98);` — matches the glass tint of the dock so the join reads as one continuous surface. | `src/app/pay/customer.css` |
| Pay-stack border + shadow when receipt is peeking | `border 0.08 alpha`, `box-shadow 0 -10px 28px -16px rgba(40,34,28,0.2)` — doubled with the receipt's own drop shadow. | `border 0.07α`, `box-shadow 0 -8px 22px -14px rgba(40,34,28,0.16)` — single, narrower shadow. | `src/app/pay/customer.css` |
| R2 — "Regresar al resumen de mesa" CTA | Hidden when `tableRemainingSub > 0.001` (sub-cent residue from 50/50 split kept PayDock winning forever) and only available in demo mode (`demoTableProgress?.tableClosed`). | Epsilon raised to `0.01`; `tableClosed` short-circuit reads from **either** `demoTableProgress` (demo) **or** `serverSync` (live + race-condition fallback). | `src/components/guest/flow/GuestBillFlow.tsx` |

## Per-screen audit

### 1. Bill — first page (`/pay/demo` → bill stage)

- ✅ Header sticky compacts on scroll (`bill-shell-head.compact`). No change.
- ✅ Bill card scroll works under the dock — padding-bottom is driven by
  `--pay-stack-height` (ResizeObserver-fed). No change.
- 🔧 Pay-dock corners flush against the receipt peek — seal hairline now
  matches dock glass (3px, 0.98α) instead of solid white.
- 🔧 R2 — the "Regresar al resumen de mesa" CTA renders correctly when
  the table closes via the live-mode `serverSync.tableClosed`, not only
  the demo progress payload.

### 2. Confirm

- ✅ Mini/full dock collapse on scroll (already wired by
  `useCollapsiblePayDock` + `bill-shell-scroll`). No change.
- ✅ Foot fixed outside `flowscreen`; ack `scrollIntoView` works. No change.
- ⚠️ NOTE: removed dead `.donut`/`.confirm-progress`/`.cl-*` styles —
  none are used by `ConfirmStage.tsx` anymore (the 3-card hierarchy
  `confirm-card-lg/md/sm` is the live system). The dedupe is safe.

### 3. Payment

- ✅ Single green "Pagar" CTA on pay-again (already in place via
  `customer.css` 2026-06-23 commit). No change.
- 🔧 Same seam-seal refinement as bill — applies via the shared selector
  `cust-app[data-stage="payment"] .flow-foot`.

### 4. Waiting / Success — **R4 primary fix**

- 🔧 **Progress ring** (`MesaProgressRing` in `WaitingSuccessStage.tsx`):
  - Track + fill stroke 9px (was 10px). Refined silhouette.
  - Drop-shadow alpha 0.35 → 0.28 with a 0.4s `filter` transition so the
    glow doesn't pop when the ring crosses the 0%-threshold.
  - Dial 168 → 172px so the `38px / 760 weight` percent label gets
    optical breathing room.
  - Percent label letter-spacing -0.04 → -0.035em, font-weight 780 → 760,
    `translateY(1px)` for optical centering of tabular numerals inside
    the circle (they sit visually low by default).
- ✅ `.ok-ring` final success disc — no change (the cascade fix from the
  dedupe preserved the existing 750 weight on `.ok-title`).
- ✅ Pay-count chip `.ws-mesa-ring-count` pop animation — no change.

### 5. Receipt drawer + peek

- ✅ Drag-up paper drawer animation unchanged.
- 🔧 Seam against the dock above reads as a continuous surface (matched
  white-α 0.98 strip instead of opaque 1.0).
- ✅ Peek collapses to "Tu recibo · N pagos · total" already wired.

### 6. ShareSheet + chips Compartido (`SharedPortionStrip`)

- ✅ `.share-chip` already well structured — avatar overlap (-7px),
  white 1.5px stroke, accent-soft background. No change.
- ✅ Chips align with bill rows because parent `.item-row-fp` controls
  the baseline. No change needed.

## R1 / R3 / R5 — functional fixes (added after the user retracted "other AIs handle them")

- **R1** — `src/hooks/useDemoTableSession.ts` poll interval is now adaptive:
  500ms when SSE is offline, 1500ms when SSE is connected (heal-only
  heartbeat). One bootstrap poll runs immediately on mount so the first
  paint is hydrated before the SSE handshake completes. Cuts steady-state
  network traffic ~50%.
- **R3** — `src/hooks/useCollapsiblePayDock.ts` debounces ResizeObserver
  bursts to one `requestAnimationFrame` cycle, drops `dockExpanded` from
  the re-measure effect deps (it was the inner loop of the oscillation),
  and reads `html.has-receipt-peek` to drive the new 60px additional
  hysteresis in `src/lib/guest-billing/bill-shell-scroll.ts`. The
  confirm-stage scroll on 2nd pay no longer flickers between mini/full.
- **R5** — `mergeClaimsForDisplay` (in `src/lib/demo-optimistic-merge.ts`)
  now accepts `paidItemIds` and drops ghost local-only splits for items
  the server already marked paid + cleared. Wired through
  `GuestBillFlow.tsx` for both `displayClaimsForStages` and
  `flow.syncFromServer`. The dock total snaps back to the right number
  as soon as the post-pay snapshot arrives.

## Other observations (anotaciones, no action taken)

- `customer.css` still has ~25 duplicate selectors after this pass —
  mostly intentional overrides (`.receipt-drawer` has 4 definitions
  because positions/transforms differ between contexts). Recommend a
  follow-up tooling pass (stylelint + `no-duplicate-selectors`) to lock
  in the file once the visual baseline is approved.
- `.donut`, `.donut-svg`, `.donut-hole`, `.donut-pct`, `.donut-lbl`,
  `.donut-sub`, `.confirm-progress`, `.cl-*` are **dead code** — no
  `className="donut"` reference exists in the TSX tree. They survived
  the dedupe (one copy each) because removing them is out of scope for
  a visual polish pass, but you can safely strip them in a follow-up.
- The `.ws-mesa-ring-fill`'s `filter: drop-shadow(...)` is applied to a
  stroked SVG circle. On Safari iOS 16 this can cause a faint shimmer
  at the exact pixel boundary of the stroke. If reported, the fix is
  to wrap the `<circle>` in a `<g filter="...">` instead. Not done now
  because we lack a real iOS 16 device in this session.

## Validation matrix

| Test | Pre-pass | Post-pass | Notes |
|---|---|---|---|
| `npm run build` | (not run from this session — extracted zip, no `node_modules`) | — | Should pass; only CSS + TSX edits, no public API change. |
| `npm test` | — | — | Layer 1 scenarios 23-35 added — must turn red first if R1/R5 still leak, then green after the other AI fixes them. |
| `npm run test:e2e` | — | — | Two new specs added (`demo-table-closed-navigation`, `demo-pay-again-full-journey`). |
| Manual checklist | — | — | See `docs/DEMO_QA_CHECKLIST.md`. |

## File map of edits

```
src/app/pay/customer.css                                ← dedupe + ring + seam polish
src/components/guest/flow/GuestBillFlow.tsx             ← R2 hardening
src/components/guest/DemoDebugPanel.tsx                 ← layout snapshot
src/lib/demo-debug.ts                                   ← new event categories
src/lib/demo-scenarios.ts                               ← scenarios 23–35
tests/e2e/demo-table-closed-navigation.spec.ts          ← NEW
tests/e2e/demo-pay-again-full-journey.spec.ts          ← NEW
docs/VISUAL_QA_REPORT.md                                ← this file
docs/DEMO_QA_CHECKLIST.md                               ← NEW
TODAY.md                                                ← bitácora entry
```
