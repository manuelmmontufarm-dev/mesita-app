# Demo QA Checklist — `/pay/demo`

> Manual reproducible checklist for the guest flow. Run on the URL
> **`https://mesitademo-two.vercel.app/pay/demo?debug=1`** with the
> debug panel enabled. Phase 0 instrumentation (`DemoDebugPanel` +
> `demo-debug.ts` ring buffer) feeds the panel that confirms each pass.

## Setup

1. Open in three browser contexts (or three phones):
   - iPhone SE / 13 mini (375 × 667)
   - iPhone 14 / 15 (390 × 844)
   - iPhone 15 Pro Max (430 × 932)
2. Add `?debug=1` to the URL on every device.
3. Confirm the debug panel shows `SSE on`, `poll 500ms`, and a unique
   `device <8-char>` value per browser.

## Pantalla 1 — Lobby (`DemoTableEntry`)

- [ ] Botón **Entrar a la mesa** centrado horizontalmente (testid
  `demo-enter-table-btn`).
- [ ] El logo MesitaQR sobre el botón no se corta en el notch en iPhone
  SE.
- [ ] El botón llega al área pulgar — no exige scroll para tocarlo.
- [ ] Color del botón: verde `#1A9E62` exacto.

## Pantalla 2 — Bill (primera página)

- [ ] Header sticky compacta sin saltos al hacer scroll (`bill-shell-head`
  pierde el tagline en estado `.compact`).
- [ ] `.live-pill` ("En vivo") con punto pulsante centrado verticalmente
  con el texto.
- [ ] Filas de platos: emoji + nombre + chip propietario alineados a la
  línea base (regla `_shared.tsx`).
- [ ] Plato compartido muestra `SharedPortionStrip` con **avatares
  superpuestos -7px**, ring blanco 1.5px, badge `50% c/u` o `Nombre %`
  al tocarlo. Sin pills duplicados.
- [ ] Dock mini ↔ full sin flicker — debug panel debe mostrar `dock mini`
  o `dock full`, no oscilación.
- [ ] CTA verde **siempre** `#1A9E62`. Glow verde sutil, no doble shadow.
- [ ] En 2.º pago (con recibo peek visible):
  - [ ] Stack pay-dock + recibo se ven **pegados** (sin gap gris).
  - [ ] Esquina superior del recibo pierde el radio (debug panel debe
    listar `has-pay-stack-above` en `<html>`).
  - [ ] Hairline blanca de 3px en la unión, sin edge duro.

## Pantalla 3 — Confirm ("Revisa y paga lo tuyo")

- [ ] Foot del confirm fijo fuera del scroll.
- [ ] Checkbox de ack: borde verde + tinte `--accent-soft` al activarse.
- [ ] Si el recibo peek está abajo, foot del confirm = dos botones
  (Editar | Pagar) **sin monto** en el foot.
- [ ] Padding inferior del scroll deja ver el último ítem sin
  superposición.
- [ ] Disclaimer ámbar tiene `var(--c-ink-2)` legible (≥ AA 4.5:1).

## Pantalla 4 — Payment

- [ ] Único CTA verde grande "Pagar".
- [ ] Campo tarjeta recuerda último valor si recargas (`payment-form-storage`).
- [ ] Estado disabled del botón visible pero no agresivo (no rojo).
- [ ] Mismo glow verde sutil que en bill.

## Pantalla 5 — Waiting (R4 — progress ring)

- [ ] Anillo de progreso **172×172px**, trazo **9px uniforme**.
- [ ] Drop-shadow verde sutil **NO presente** al 0% (sin estela fantasma).
- [ ] Drop-shadow verde sutil presente al 50%+ con transición suave.
- [ ] Porcentaje `38px / weight 760 / letter-spacing -0.035em` centrado
  ópticamente (no geométrico — debe sentirse centrado).
- [ ] `pagado` y monto restante alineados verticalmente bajo el %.
- [ ] Píldora "En vivo" + conteo de pagos abajo, sin solaparse con el
  anillo.

## Pantalla 6 — Success

- [ ] `.ok-ring` 112×112 con disco verde 76×76. Animación `okpop` se
  resuelve sin overshoot raro.
- [ ] Título "¡Cuenta completada!" **font-weight 750** (no 720 — fue lo
  que la cascada estaba aplicando antes del dedupe).
- [ ] Botón **"Regresar al resumen de mesa"** (R2):
  - [ ] Visible cuando vuelves a la pestaña Cuenta tras cerrar la mesa.
  - [ ] Funciona en demo y en live (no solo demo).
  - [ ] Al tocarlo regresa al success/ring view.

## Cross-screen

- [ ] Iconos consistentes (Ic.lock, Ic.check, Ic.shield) — mismo tamaño
  18px en CTAs.
- [ ] Animaciones de entrada de chips/avatars no rompen `prefers-reduced-motion`.
- [ ] Sin Tailwind/shadcn — todo viene de `customer.css`.
- [ ] CTA pago **nunca** coral. Verde `#1A9E62`.

## Multi-device sanity

- [ ] 3 dispositivos = Persona 1/2/3 con mismos colores en todos.
- [ ] Debug panel: `device` distinto por contexto, `joinCount` ≤ memberCount.
- [ ] Cambiar nombre en device A → device B lo ve en ≤ 1s.
- [ ] Tocar plato en device A → spinner local → check en todos en ≤ 1s.
- [ ] Pagar todo en device A → device B llega a success automáticamente.

## Debug panel — Phase 0 invariants

Con `?debug=1`, verifica que el panel muestra:

- [ ] `stage` actual (`bill` / `confirm` / `payment` / `waiting` / `success`)
- [ ] `dock` mode (`mini` / `full` / `none`)
- [ ] `stack <px>` — valor de `--pay-stack-height` en vivo
- [ ] `peek <px>` — valor de `--receipt-peek` en vivo
- [ ] Lista de clases `<html>`: `has-receipt-peek`, `has-pay-stack-above`,
  `has-sheet-open`, `has-receipt-open` cuando aplican
- [ ] Botón **copiar snapshot** copia JSON con `recentEvents[]`,
  `myDeviceId`, `myGuestId`, `joinCount`, layout actual.

## Done criteria

Pasar **todos** los checkboxes en los 3 viewports. Si alguno falla:

1. Anotar el screenshot + viewport
2. Reproducir como `demo-scenarios.ts` entry [36+] siguiendo la regla
   "bug → escenario primero" en `CLAUDE.md`
3. Ejecutar `npm test -- multi-user-scenarios` + `npm run test:e2e`
4. Bitácora en `TODAY.md`
