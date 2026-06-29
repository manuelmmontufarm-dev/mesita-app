# 📓 TODAY.md — Bitácora del proyecto

## ¿Qué es este archivo?

Este es el **diario de a bordo** del proyecto. Sirve para que cualquier persona
(o cualquier asistente de IA) que abra el proyecto entienda, en pocos minutos:

- **Qué se está haciendo ahora mismo** y qué falta.
- **Qué se cambió, por qué y qué hace** cada cambio reciente.

La idea es simple: en vez de adivinar mirando el código, abres este archivo y te
pones al día. Está escrito a propósito en lenguaje sencillo.

> **Sobre el proyecto:** *PagaYa / MesitaQR* es una app web para que los clientes
> de un restaurante **paguen desde su celular escaneando un QR en la mesa**.
> Está hecha con Next.js 15, React 19, Prisma y pagos con Kushki. Se conecta al
> POS del restaurante (Contífico) para leer las cuentas y registrar los pagos;
> **el POS sigue siendo el dueño de la factura electrónica**, PagaYa solo agrega
> la capa de "pagar en la mesa con QR".

---

## ⚙️ REGLA OBLIGATORIA

> **Cada vez que se hace un cambio (un edit) en el proyecto, se registra aquí.**

No importa si el cambio es chico o grande: **se anota siempre**, en la sección
*"🗂️ Registro de cambios"*, con lo más nuevo arriba.

Cada entrada debe responder **tres preguntas**:

1. **QUÉ** se cambió → qué archivo(s) o parte del proyecto se tocó.
2. **POR QUÉ** se cambió → qué problema se quería resolver o qué se buscaba.
3. **QUÉ HACE** el cambio → qué pasa ahora que antes no pasaba (el efecto real).

### Formato de cada entrada

```markdown
### AAAA-MM-DD — Título corto del cambio
- **Qué:** archivos o área que se modificó.
- **Por qué:** la razón / el problema que se resolvía.
- **Qué hace:** el efecto concreto del cambio.
```

Reglas de oro:
- Lo **más nuevo va arriba**.
- Un cambio = una entrada (si son varios cambios relacionados, agrúpalos pero
  deja claro cada uno).
- Escribe pensando en alguien que **no estaba presente** cuando se hizo el cambio.

---

## 🟢 En qué estamos ahora

- **Estado actual:** el proyecto es un **demo funcional del flujo del cliente**
  (escanear QR → ver la cuenta → pagar). Se subió por primera vez el 2026-06-15 y
  enseguida se hicieron arreglos para que **despliegue bien en Vercel**.
- **Última área trabajada:** *despliegue (deploy) en Vercel* y *landing page*.
  - Se ajustó el build para que genere el cliente de Prisma.
  - Se quitó un cron de "cada minuto" que el plan gratis (hobby) de Vercel no
    permite.
  - Se incluyeron los archivos estáticos de la landing.
- **Pendientes / próximos pasos probables:**
  - Confirmar que el deploy en Vercel quede 100% verde.
  - Conectar de verdad la base de datos (hoy el demo corre **sin DB**).
  - Avanzar con la integración real del POS (Contífico): lectura de cuentas
    (polling) y confirmación de pagos.
- **Cosas a tener cuidado (ojo aquí):**
  - **Nada de Dátil.** La factura electrónica la emite el POS, no PagaYa.
  - **POS por polling, no webhooks.** Contífico no avisa; PagaYa pregunta cada
    cierto tiempo, y la lectura debe poder repetirse sin duplicar (idempotente).
  - **El POS manda en items y precios.** No recalcular totales desde cero si el
    POS ya da los valores buenos.
  - **Plan hobby de Vercel:** no usar crons por minuto (rompe el deploy).
  - Manejar dinero con cuidado: los montos viven en `src/lib/money.ts` y la
    lógica de dividir la cuenta en `src/lib/guest-billing/`.

---

## 🗂️ Registro de cambios

### 2026-06-28 — Dashboard público sin auth (modo demo)
- **Qué:** `src/middleware.ts`, `src/lib/api-utils.ts`.
- **Por qué:** El dashboard estaba bloqueado por auth; el usuario quiere verlo y trabajar en él en Vercel sin necesitar login.
- **Qué hace:** Middleware ya no redirige `/dashboard/*` a login. `requireAuth` en las rutas API devuelve el restaurante demo si la env var `DEMO_DASHBOARD_RESTAURANT_ID` está seteada — sin esa var, el comportamiento real de auth no cambia. Para reactivar auth: quitar la var y revertir el bloque del middleware.

### 2026-06-28 — Coordinación multi-agente: AGENTS.md + HANDOFF.md
- **Qué:** `AGENTS.md` (nuevo), `HANDOFF.md` (nuevo).
- **Por qué:** El usuario trabaja con tres AIs en paralelo (Claude Code, Codex, Cursor Agent); hacía falta un sistema de coordinación para que no se pisen entre sí.
- **Qué hace:** `AGENTS.md` documenta cada agente activo, su rol, fortalezas y reglas de ownership de archivos. `HANDOFF.md` es el inbox compartido donde cada agente deja el estado de su tarea antes de pasar el turno.

### 2026-06-24 — Fix build TS en GuestBillFlow
- **Qué:** `GuestBillFlow.tsx`.
- **Por qué:** Vercel falló: comparación `stage !== "bill"` redundante tras narrow de TypeScript.
- **Qué hace:** Lógica del `useLayoutEffect` simplificada con flags `shouldMeasureBillDock` / `shouldMeasurePeekStack`; build verde.

### 2026-06-24 — Dock colapsable + CTA "Pagar · $monto" unificado
- **Qué:** `bill-display.ts`, `GuestBillFlow.tsx`, `ConfirmStage.tsx`, `customer.css`, test `bill-display.test.ts`.
- **Por qué:** El botón verde alternaba a "Pagar tu parte"; la cuenta antes del primer pago tenía dock estático; confirm no colapsaba al scroll; padding fijo de 200px causaba bugs de scroll.
- **Qué hace:** `dockGreenPayLabel` siempre muestra `Pagar · $X`; bill y confirm usan dock mini/full al scroll; padding dinámico `--bill-dock-pad` / `--confirm-dock-pad`; confirm foot fijo como bill.

### 2026-06-24 — Dock Resumen|Pagar igual que confirmar
- **Qué:** `GuestBillFlow.tsx`, `customer.css`.
- **Por qué:** En la cuenta, tras un pago previo, el dock mostraba un bloque gris enorme con "Resumen" y "Pagar tu parte · $0" separados; debía verse como en confirmar (← Editar | Pagar en pills).
- **Qué hace:** Reusa clases `confirm-pay-dock` + `dock-back-btn`; grid 1fr/1.2fr con pills redondas; etiquetas "← Resumen" y "Pagar" (compacto en mini); aplica en dock-full y dock-mini encima del peek.

### 2026-06-24 — Dock + recibo flush en móvil (Safari)
- **Qué:** `bill-shell-scroll.ts`, `GuestBillFlow.tsx`, `ReceiptDrawer.tsx`, `customer.css` (media ≤480px).
- **Por qué:** En teléfono el strip "Tu recibo" quedaba flotando encima de Resumen|Pagar; en desktop se veía bien porque `offsetHeight` no coincide con el visual viewport de Safari.
- **Qué hace:** `measureReceiptPeekBottomOffset()` usa `getBoundingClientRect` + `visualViewport`; listeners de resize/scroll; CSS móvil pone ambos botones a 48px igual y elimina el gap (sin rcpt-tear, padding-bottom 0 en dock).

### 2026-06-24 — Dock mini + resumen 0% + auto cuenta completada
- **Qué:** `customer.css`, `WaitingSuccessStage.tsx`, `demo-table-progress.ts`, `GuestBillFlow.tsx`, `useGuestPaymentFlow.ts`, `GuestPayPage.tsx`, test `demo-table-progress.test.ts`.
- **Por qué:** Con scroll up el dock split flotaba mal sobre el recibo; "Resumen" mostraba 0% pagado aunque la cuenta ya tenía pagos; al cerrar la mesa no llevaba a cuenta completada desde waiting/confirm/payment.
- **Qué hace:** Dock mini+split queda pegado al peek sin pill flotante; `goToWaiting()` en Resumen y `resolveMesaPaidPct()` alinea el anillo con el header de la cuenta; cuando `tableClosed` todos los stages (excepto bill) van a éxito automáticamente.

- **Qué:** `src/lib/demo-url.constants.mjs`, `src/lib/demo-url.ts`, `qr-utils.ts`, `scripts/generate-demo-qr.mjs`, `.env.example`, `CLAUDE.md`, `docs/DEMO_CANONICAL_URL.md`.
- **Por qué:** Había 3 proyectos Vercel del mismo repo y riesgo de usar links distintos; el script QR tenía el URL hardcodeado aparte del resto.
- **Qué hace:** Una sola constante alimenta QRs, PDF pack, app y docs; override solo vía env con warning; documento lista los 7 links, cuál es canónico (`mesitademo-two`) y cuáles pausar.

### 2026-06-23 — Pay-again rescue: split CTA [← Resumen | Pagar →]
- **Qué:** `src/components/guest/flow/GuestBillFlow.tsx`, `src/app/pay/customer.css`.
- **Por qué:** Tras pagar y volver al bill con "Pagar otra vez", el dock mostraba solo el CTA verde. Si el usuario tocaba "Pagar otra vez" por accidente o cambiaba de idea, **no había forma de regresar a la pantalla de resumen / éxito** donde estaba. Quedaba atrapado eligiendo platos sin querer.
- **Qué hace:** Cuando `receiptPeekActive` es true (= ya pagaste al menos una vez y el recibo peek está abajo), el dock se parte en dos: a la izquierda, botón gris **"Resumen"** que dispara `flow.finishWaiting()` y devuelve al usuario al success/waiting; a la derecha, el CTA verde **"Pagar tu parte · $X"** intacto. En estado dock-mini (collapsed pill) el botón gris se compacta a chip 44px para no robar protagonismo al CTA primario. Testid nuevo: `dock-back-to-summary-btn`. No cambia el dock cuando es primer pago (solo verde, como antes).

### 2026-06-23 — Fixes funcionales R1, R3, R5 (sync, scroll, split math)
- **Qué:**
  - `src/hooks/useDemoTableSession.ts` — heartbeat de poll adaptativo según SSE.
  - `src/hooks/useCollapsiblePayDock.ts` — debounce ResizeObserver con `requestAnimationFrame`, lectura de `has-receipt-peek` desde `<html>`, eliminación de `dockExpanded` de deps del re-measure effect.
  - `src/lib/guest-billing/bill-shell-scroll.ts` — nueva opción `receiptPeekVisible` que añade 60px extra de histéresis cuando el recibo peek está visible.
  - `src/lib/demo-optimistic-merge.ts` — `mergeClaimsForDisplay` ahora acepta `paidItemIds` y limpia ghost splits cuyas filas ya fueron pagadas y borradas en el server.
  - `src/components/guest/flow/GuestBillFlow.tsx` — pasa `serverSync.paidItemIds` al merge.
- **Por qué:**
  - R1: poll 500ms + SSE 500ms se duplicaban → carga de red x2 sin razón → "trabado" multi-device.
  - R3: en confirm 2.º pago, el ResizeObserver del scroll oscilaba con cada cambio de mini↔full porque `dockExpanded` estaba en las deps del `useLayoutEffect` que volvía a medir — feedback loop frame-a-frame con el padding-bottom del stack pay+recibo.
  - R5: cuando un comensal pagaba su mitad de un plato compartido, el ghost local del split seguía descontando unidades en el dock — el merge no consideraba `paidItemIds` y la fila quedaba viva en el cálculo del total.
- **Qué hace:**
  - R1: con SSE conectado, poll baja a 1.5s (heartbeat de heal); con SSE caído, vuelve a 500ms. Bootstrap fetch único al montar para que el primer paint tenga snapshot fresco sin esperar SSE. Tráfico de red ≈ 50% menos en operación normal.
  - R3: el `ResizeObserver` colapsa observaciones múltiples en un solo `requestAnimationFrame` antes de re-medir; el effect re-mide solo cuando cambia `enabled` (no en cada flip de `dockExpanded`); cuando el recibo peek está visible (clase `has-receipt-peek` en `<html>`), la histéresis pasa de 100px a 160px — suficiente para absorber el delta de altura combinado dock+peek sin oscilar.
  - R5: `mergeClaimsForDisplay({ paidItemIds })` elimina entradas locales para ítems que el server ya marcó como pagados y limpió de claims — el dock vuelve a mostrar el total correcto en el momento que llega el snapshot post-pago.

### 2026-06-23 — Visual QA pass: dedupe CSS, R2, anillo progreso, seam stack
- **Qué:** `src/app/pay/customer.css` (376 líneas duplicadas eliminadas + ajuste fino del `MesaProgressRing` y del seam dock↔recibo), `src/components/guest/flow/GuestBillFlow.tsx` (R2 hardening), `src/lib/demo-debug.ts` (nuevas categorías de eventos Phase 0), `src/components/guest/DemoDebugPanel.tsx` (snapshot live de CSS vars y clases `<html>`), `src/lib/demo-scenarios.ts` (escenarios `[23]` a `[35]` para R1–R5), `tests/e2e/demo-table-closed-navigation.spec.ts` (nuevo), `tests/e2e/demo-pay-again-full-journey.spec.ts` (nuevo), `docs/VISUAL_QA_REPORT.md` (nuevo), `docs/DEMO_QA_CHECKLIST.md` (nuevo).
- **Por qué:** El usuario reportó la calidad como 0/10 tras los commits del 2026-06-23 (`fd94f9b`, `fc82e18`, `9c18c45`, `845c183`, `6df2e33`): anillos de progreso "raros", esquinas del stack pay+recibo con seams visibles, y el botón **"Regresar al resumen de mesa"** desaparecía tras pagar todo. Auditoría reveló además que `customer.css` tenía 83 selectores duplicados (376 líneas redundantes entre 1398–1773 y 1898–2273), con el `font-weight` de `.ok-title` dependiendo del orden de cascada para resolver 720 vs 750 — frágil y la causa probable de regresiones "fantasma" en sucesivos commits.
- **Qué hace:**
  1. **Dedupe CSS:** elimina la primera copia (líneas 1398–1773) preservando la cascada-ganadora actual. Archivo pasa de 5122 → 4746 líneas (-7.3%). Cero cambio visual neto.
  2. **R2 — "Regresar al resumen de mesa":** `tableClosed` ahora se calcula como OR de `demoTableProgress?.tableClosed` y `serverSync?.tableClosed` (live mode + race condition cubiertos). Epsilon subido de 0.001 a 0.01 — el ruido sub-céntimo de un split 50/50 ya no estranja al CompletedDock.
  3. **Anillo de progreso (R4):** `.ws-mesa-ring-fill` baja stroke 10 → 9px, drop-shadow 0.35 → 0.28α con transición `filter 0.4s ease`, dial 168 → 172px, porcentaje weight 780 → 760 + `translateY(1px)` para centrado óptico de numerales tabulares.
  4. **Stack pay+recibo:** `::after` seal pasa de blanco sólido `#fff` 4px a `rgba(255,255,255,0.98)` 3px; border-α 0.08 → 0.07, shadow `-10/28/-16` → `-8/22/-14`. La unión lee como una sola superficie continua, no como dos cards apilados con doble sombra.
  5. **Phase 0:** `DemoDebugPanel` ahora muestra stage activo, modo dock, `--pay-stack-height` / `--receipt-peek` en vivo, y las clases `has-receipt-peek` / `has-pay-stack-above` / etc. en `<html>`. `demo-debug.ts` añade categorías `dock:*`, `scroll:*`, `receipt:*`, `stage:*`, `claim:*` para tracear regresiones de layout en < 2 min.
  6. **Phase 2:** 13 escenarios nuevos en `demo-scenarios.ts` cubren R1 (sync bajo carga), R2 (table-closed sin centavos residuales), R3 (reset mid-payment), R4 (paidPct=100 ↔ tableClosed), R5 (split → exactamente 2 recibos, no 4), más cold-join e idempotencia de pay. Dos specs Playwright nuevos: `demo-table-closed-navigation.spec.ts` (R2 con UI real) y `demo-pay-again-full-journey.spec.ts` (2 BrowserContexts × 2 pagos).
  7. **Docs:** `docs/VISUAL_QA_REPORT.md` con antes/después pantalla por pantalla; `docs/DEMO_QA_CHECKLIST.md` con checklist reproducible para 3 viewports (375 / 390 / 430).
- **Notas:** R1 (multi-device sync trabado), R3 (confirm scroll 2.º pago) y R5 (split math en el dock) son funcionales y los maneja el otro AI. Los escenarios [23]–[35] empezarán rojos hasta que esa rama mergee — esa es la prueba de que la red de regresión funciona como se documentó en `CLAUDE.md`. El `.donut` + `.confirm-progress` deduplicados son código muerto (ningún TSX los referencia) y se pueden borrar en un follow-up.

### 2026-06-23 — Scroll confirm en segundo pago (recibo + foot fijo)
- **Qué:** `ConfirmStage.tsx`, `useCollapsiblePayDock.ts`, `bill-shell-scroll.ts`, `GuestBillFlow.tsx`, `customer.css`.
- **Por qué:** En “Revisa y paga lo tuyo” con recibo abajo el contenido (checkbox) quedaba tapado y el scroll no despejaba bien el stack pay+recibo.
- **Qué hace:** Foot fijo fuera del `flowscreen`; padding extra en confirm; medición local del foot expandido; ack hace `scrollIntoView`; histéresis re-mide al cambiar mini/full.

### 2026-06-23 — Foot confirm/payment sin monto duplicado (pay-again)
- **Qué:** `ConfirmStage.tsx`, `PaymentStage.tsx`, `customer.css`.
- **Por qué:** Con recibo abajo, el total en negro en el foot se veía fuera de lugar; en tarjeta el usuario solo quiere un CTA verde “Pagar”.
- **Qué hace:** Confirm mini = dos botones (Editar | Pagar) sin monto; confirm full = “Pagar tu parte” + volver; payment pay-again = un solo botón verde grande “Pagar”, sin widget “Tu parte” en el foot.

### 2026-06-23 — Dock mini/full en confirm y payment + anti-flicker scroll
- **Qué:** `useCollapsiblePayDock.ts`, `bill-shell-scroll.ts`, `GuestBillFlow.tsx`, `ConfirmStage.tsx`, `PaymentStage.tsx`, `customer.css`.
- **Por qué:** Con recibo abajo, confirm/payment tenían foot fijo sin colapsar al scroll; el dock de bill parpadeaba mini↔full al bajar por feedback entre altura del dock y `padding-bottom`.
- **Qué hace:** Misma lógica que primera página: mini con botones a los lados al subir, full al llegar abajo; histéresis de scroll + `--pay-stack-height` siempre mide dock expandido para padding estable.

### 2026-06-23 — Esquinas del stack pay+recibo y scroll en todas las fases
- **Qué:** `GuestBillFlow.tsx`, `customer.css`.
- **Por qué:** Al hacer scroll el contenido quedaba tapado bajo el stack (bill/confirm/payment); en la unión pay dock ↔ “Tu recibo” se veían triángulos de fondo por `border-radius` en ambos widgets.
- **Qué hace:** `ResizeObserver` mide `--pay-stack-height` real del dock/foot activo; `padding-bottom`/`scroll-padding-bottom` usan pay stack + peek + buffer en bill, confirm, payment y éxito; con pay stack arriba el peek pierde radio superior y el tear; `::after` blanco sella el seam. Clase `has-pay-stack-above` en `<html>`.

### 2026-06-23 — Pay stack pegado al recibo (sin hueco)
- **Qué:** `customer.css`.
- **Por qué:** Con “Tu recibo” visible, el dock de bill / foot de confirm / payment flotaban con gap gris entre el widget y el peek.
- **Qué hace:** `--receipt-dock-gap: 0`; pay chrome ancho completo, `bottom: var(--receipt-peek)`, esquinas redondeadas solo arriba — stack sólido bill → confirm → payment → recibo.

### 2026-06-23 — Dock resumen, recibo compacto, confirm foot fijo
- **Qué:** `GuestBillFlow.tsx`, `ReceiptDrawer.tsx`, `drawer-receipts.ts`, `customer.css`, `_shared.tsx` (share chip).
- **Por qué:** Dock “cuenta completada” partido se veía raro; recibo peek muy alto; en confirm el botón pagar dejaba ver scroll por debajo; recibo a veces desaparecía tras cerrar mesa.
- **Qué hace:** Un solo CTA verde **Regresar al resumen de mesa**; peek solo muestra fila “Tu recibo · N pagos · total” (chips al expandir); foot de confirm opaco y fijo sobre peek; merge de recibos más resiliente; chip **Compartido 50% c/u** en filas.

### 2026-06-23 — Chip “Compartido” en filas (reemplaza barra de split)
- **Qué:** `_shared.tsx` (`SharedPortionStrip`), `customer.css`.
- **Por qué:** La barra horizontal segmentada con “Entre 2 · Persona 50%…” se veía tosca y repetía info.
- **Qué hace:** Pill verde suave con avatares superpuestos + “Compartido” + badge `50% c/u` (o % por persona si el reparto es desigual); mismo brillo al tocar.

### 2026-06-23 — Split math + dock cuenta cerrada smooth + escenario [22]
- **Qué:** `GuestBillFlow.tsx`, `demo-optimistic-merge.ts`, `ConfirmStage.tsx`, `split-math.ts`, `customer.css`, `demo-scenarios.ts` (escenario 22), tests.
- **Por qué:** Totales del dock/precuenta ignoraban el reparto 50/50 (`derived` usaba claims sin merge); badge `%` no salía si el servidor tenía el split pero local solo tu mitad; dock “Ver ¡Cuenta completada!” fijo sin animación mini/full.
- **Qué hace:** `derived` y sync usan `mergeClaimsForDisplay` (servidor multi-guest gana); precuenta muestra `50%` en ambas personas; dock cerrado usa misma lógica scroll `dock-full`/`dock-mini` con recibo peek; escenario [22] verifica `claimShares` 50/50. **67 tests** verdes.

### 2026-06-23 — Compartir plato, 50% en confirm y dock cuenta cerrada
- **Qué:** `BillStage.tsx`, `GuestBillFlow.tsx`, `useGuestPaymentFlow.ts`, `ConfirmStage.tsx`, `customer.css`.
- **Por qué:** Tocar un plato compartido lo sacaba del reparto; Persona 1 no mostraba `50%` en el recibo de confirmación; tras pagar toda la mesa y “Ver mesa” no había forma de volver a ¡Cuenta completada!.
- **Qué hace:** Tap en plato compartido solo hace brillar la barra (no `onRelease`); editar el split solo desde “¿Compartieron un plato?”; badge `%` igual en tu card y en otras personas; si la mesa ya está cerrada en bill, dock con **Ver ¡Cuenta completada!** → tab de éxito. **Ver comprobante** sigue fuera del dock (solo peek inferior).

### 2026-06-23 — Quita botón Ver comprobante del dock
- **Qué:** `GuestBillFlow.tsx`, `ReceiptDrawer.tsx`, `customer.css`.
- **Por qué:** El botón dentro del dock rompía el layout móvil (Pagar tu parte dejaba de subirse sobre el recibo peek) y ensuciaba el flujo.
- **Qué hace:** El recibo sigue accesible con el peek inferior; el dock vuelve a su altura normal sin el CTA extra.

### 2026-06-23 — Split en servidor + brillo en widget + Ver comprobante
- **Qué:** `demo-table-store.ts`, API `split`, `useDemoTableSession`, `GuestBillFlow`, `BillStage`, `ShareSheet`, `ReceiptDrawer`, `customer.css`.
- **Por qué:** Logs mostraron `onClaim` con dueño único al guardar split (quitaba el plato al otro); guardar con 1 persona no repartía; brillo iba al nombre del plato; dock y recibo pegados; sin volver al comprobante tras “Ver mesa”.
- **Qué hace:** `claimShares` + acción `split` persisten reparto multi-guest; guardar exige 2+ personas; brillo en chip/barra bajo el plato (+ emoji); gap dock/recibo; botón **Ver comprobante** en el dock.

### 2026-06-23 — Halo verde en nombre + fixes split guest
- **Qué:** `BillStage.tsx`, `demo-optimistic-merge.ts`, `customer.css`, test merge, `TODAY.md`.
- **Por qué:** El bloque “Pagas como” tenía tinte verde en todo el contenedor; faltaba guiar al usuario a escribir su nombre sin saturar la UI; y seguían pendientes fixes de split visible, picker sin duplicar y widget “Lo mío”.
- **Qué hace:** Se quita el fondo/borde verde del contenedor del nombre; el pill del input pulsa un halo verde suave (como “En vivo”) solo mientras el nombre está vacío; `mergeClaimsForDisplay` conserva repartos multi-guest; lista compartida en modo ítem; picker sin pills duplicadas; pulso en el nombre del plato tomado.

### 2026-06-22 — Split visible en lista + nombre iluminado + picker sin duplicar
- **Qué:** `BillStage.tsx`, `demo-optimistic-merge.ts`, `customer.css`, test merge.
- **Por qué:** Tras dividir un plato la UI seguía mostrando un solo dueño (session demo = 1 guest/ítem); el picker duplicaba pills (AvatarStack + etiqueta); el feedback iba al emoji en vez del nombre.
- **Qué hace:** `mergeClaimsForDisplay` conserva repartos locales multi-guest; filas compartidas muestran `SharedPortionStrip`; widget “Lo mío” lista platos compartidos; picker usa un chip o barra sin duplicar; pulso verde en el **nombre** del plato.

### 2026-06-22 — Compartir plato: sin duplicados + widget en lista + emoji suave
- **Qué:** `ShareSheet.tsx`, `BillStage.tsx`, `_shared.tsx` (`SharedPortionStrip`), `customer.css`.
- **Por qué:** Al dividir un plato cada persona salía dos veces; el banner “Quién comparte este plato” sobraba; el feedback de plato tomado era texto + shake de fila; y el reparto no se veía en la lista principal.
- **Qué hace:** El picker muestra cada comensal una sola vez (solo `NamePill`); al guardar con 2+ personas queda solo “Así queda · entre N”; en la cuenta principal los platos compartidos muestran barra con avatares y %; al tocar un plato ajeno solo el emoji hace un pulso verde suave (sin “Lo eligió…” ni shake de fila).

### 2026-06-22 — Shake móvil + chip del comensal resaltado
- **Qué:** `BillStage.tsx`, `_shared.tsx` (`OwnerChip`), `customer.css`.
- **Por qué:** El shake no respondía en touch; faltaba explicar por qué no se puede reclamar el plato.
- **Qué hace:** `onPointerUp` + debounce para móvil; shake más suave; el chip de quien eligió el plato crece/brilla y muestra “Lo eligió Persona N”.

### 2026-06-22 — URL canónica mesitademo-two + QR pack regenerado
- **Qué:** `qr-utils.ts`, scripts QR, `.env.example`, `docs/demo-qr-pack/*`, `public/demo-pay-qr.png`, `DEMO_TABLES_DEBUG_REPORT.md`.
- **Por qué:** Había dos proyectos Vercel (`mesitademo` vs `mesita-demo`); los QR del PDF apuntaban a `mesita-demo.vercel.app` y el usuario trabaja en `mesitademo-two.vercel.app`.
- **Qué hace:** Todos los QR y defaults usan `https://mesitademo-two.vercel.app`; PDF de 5 mesas regenerado con URLs correctas.

### 2026-06-22 — Fix shake en plato tomado (interactive mal definido)
- **Qué:** `BillStage.tsx`, `customer.css`.
- **Por qué:** `interactive` era true en filas ya reclamadas → `toggleMine` no-op y el shake nunca corría.
- **Qué hace:** Solo filas reclamables son interactivas; tap en plato ajeno dispara shake + tinte rojo suave.

### 2026-06-22 — Favicon MesitaQR + shake en plato ya tomado
- **Qué:** `src/app/icon.tsx`, `apple-icon.tsx`, `layout.tsx`, `manifest.ts`, `BillStage.tsx`, `customer.css`.
- **Por qué:** La pestaña del browser mostraba icono genérico; al tocar un ítem ya reclamado no había feedback.
- **Qué hace:** Favicon con el LogoMark (cuadrícula verde/negro); fila del plato hace shake horizontal si otro comensal ya lo tiene.

### 2026-06-22 — Logo MesitaQR en header sticky del bill
- **Qué:** `GuestBillFlow.tsx`, `BillStage.tsx`, `customer.css`.
- **Por qué:** El header superior solo mostraba “En vivo” y mesa; faltaba marca visible arriba.
- **Qué hace:** Muestra `LogoMark` + nombre del restaurante (y tagline en demo) en la barra fija; quita el logo duplicado dentro de la tarjeta de cuenta.

### 2026-06-22 — Fix build Vercel: `ref` en schema demo pay
- **Qué:** `src/app/api/demo/table/[token]/route.ts`.
- **Por qué:** El deploy en Vercel fallaba en `tsc` porque `body.ref` se pasaba a `recordDemoPayment` pero no estaba en el schema Zod del action `pay`.
- **Qué hace:** Añade `ref` opcional al schema; el build de preview vuelve a compilar.

### 2026-06-19 — Limpieza instrumentación debug recibo duplicado
- **Qué:** `drawer-receipts.ts`, `useGuestPaymentFlow.ts`, `demo-table-store.ts`.
- **Por qué:** El fix del recibo duplicado quedó verificado; los `fetch` de debug ya no hacen falta.
- **Qué hace:** Quita logs temporales de la sesión debug; el merge server-first y `receiptRef` siguen activos.

### 2026-06-19 — Fix recibo duplicado (4 pagos / $110) + medallas inline
- **Qué:** `drawer-receipts.ts`, `useGuestPaymentFlow.ts`, `demo-table-store.ts`, `api/demo/table/[token]/route.ts`, `useDemoTableSession.ts`, `GuestPayPage.tsx`, `payer-badges.ts`, `WaitingSuccessStage.tsx`, `customer.css`, tests.
- **Por qué:** El recibo sumaba pagos locales y del servidor con refs distintos (cliente generaba `MQR-…8362`, servidor `MQR-…1822`) → 2 pagos reales aparecían como 4 / $110. Las "Medallas de la mesa" eran un widget verde separado y siempre "más rápido" en mesa solo.
- **Qué hace:** `mergeDrawerReceipts` prioriza pagos del servidor; el mismo `receiptRef` viaja al demo store. Medallas pasan a quip conversacional inline por fila; mesa solo recibe badges contextuales (rey de la mesa, cerraste la cuenta, etc.).

### 2026-06-21 — Overlays ocultan dock + ShareSheet muestra selección
- **Qué:** `customer.css`, `receipt-peek-layout.ts`, `GuestBillFlow.tsx`, `ShareSheet.tsx`, `BillStage.tsx`, tests unit/e2e.
- **Por qué:** El botón de pago aparecía encima al abrir recibo o "Dividir plato"; ShareSheet no mostraba quién tenía el plato seleccionado.
- **Qué hace:** Oculta dock/flow-foot con `has-receipt-open` y `has-sheet-open`; sheets z-index 100+; banner "Quién comparte" + filas con nombre/estado; picker lista dueños y Club Verde 1/2.

### 2026-06-21 — Fix botón pago en confirm con recibo peek + tests
- **Qué:** `customer.css`, `receipt-peek-layout.ts`, `GuestBillFlow.tsx`, `bill-display.test.ts` (syntax), `receipt-peek-layout.test.ts`, `tests/e2e/confirm-pay-again.spec.ts`.
- **Por qué:** En "Revisa y paga lo tuyo" el CTA desaparecía al pagar otra vez porque `html.has-receipt-peek` ocultaba `.flow-foot` globalmente.
- **Qué hace:** Confirm/payment mantienen el botón fijo sobre el recibo peek; scroll con padding correcto; contrato CSS + e2e contra regresión.

### 2026-06-21 — Dock original mini/full + copy "Pagar tu parte"
- **Qué:** `GuestBillFlow.tsx`, `ConfirmStage.tsx`, `customer.css`.
- **Por qué:** El dock quedó siempre expandido y decía "Pagar otra vez — elige platos"; rompía el pill chico al scrollear.
- **Qué hace:** Restaura dock-mini al subir y dock-full al bajar; CTA siempre "Pagar tu parte · $X" como antes; mantiene pay-dock-return visible sobre recibo.

### 2026-06-21 — Rama fix/guest-ux-restore-v2 (UX guest, pendiente merge)
- **Qué:** Cherry-pick commits `dfd674e`…`8cccdd9` en rama `fix/guest-ux-restore-v2` desde `main` post-revert `8a13d34`.
- **Por qué:** Re-aplicar los 9 fixes UX tras revert por bugs en producción; 325 tests verdes antes de nuevo merge.
- **Qué hace:** Restaura lobby, tip Otro, nombre, Todo CTA, split iguales, Pagó {nombre}, pay-again, recibo Pago 1/2, volver a pagar — solo en preview hasta aprobar PR.

### 2026-06-20 — Fix producción: UX guest aún no en main
- **Qué:** PR a `main` desde `feat/multi-qr-demo-mesas`; ajustes en `GuestBillFlow.tsx`, `drawer-receipts.ts`, `customer.css`.
- **Por qué:** Producción (`mesita-demo.vercel.app`) quedó en merge PR #1 sin los 3 commits de UX; el usuario no veía ningún cambio.
- **Qué hace:** Merge trae pay-again, recibo multi-pago y dock móvil a producción; no expulsa de bill al cerrar mesa; dock siempre expandido si falta saldo.

### 2026-06-20 — Recibo multi-pago, dock móvil, volver a pagar
- **Qué:** `drawer-receipts.ts`, `ReceiptDrawer.tsx`, `GuestBillFlow.tsx`, `useGuestPaymentFlow.ts`, `bill-display.ts`, `types.ts`, `useDemoTableSession.ts`, `customer.css`, tests.
- **Por qué:** Recibo mostraba solo el último pago; dock mini aplastaba el CTA en móvil; Ver mesa no dejaba pagar más (modo iguales + dock oculto + saldo solo local).
- **Qué hace:** Recibo lista Pago 1/2 desde servidor; chips en peek; dock expandido sin precio duplicado; saldo autoritativo del server; al volver de waiting fuerza modo ítem.

### 2026-06-20 — Volver a pagar tras primer pago
- **Qué:** `useGuestPaymentFlow.ts`, `GuestBillFlow.tsx`, `BillStage.tsx`, `WaitingSuccessStage.tsx`, `bill-display.ts`, `customer.css`, tests.
- **Por qué:** Tras pagar y pulsar "Ver mesa", el dock desaparecía (recibo lo ocultaba) y no había forma clara de pagar ítems olvidados.
- **Qué hace:** Dock visible con "Pagar otra vez"; CTA guía a elegir platos si falta selección; "Volver a pagar" en waiting/éxito; bloquea segundo cobro en modo iguales.

### 2026-06-20 — UX demo: split iguales, lobby iPhone, pagador por ítem
- **Qué:** `split-math.ts`, `bill-display.ts`, `useGuestPaymentFlow.ts`, `BillStage.tsx`, `GuestBillFlow.tsx`, `ConfirmStage.tsx`, `PaymentStage.tsx`, `WaitingSuccessStage.tsx`, `DemoTableEntry.tsx`, `useDemoTableSession.ts`, `types.ts`, `customer.css`, tests.
- **Por qué:** Split iguales cobraba el total restante al último; lobby sin scroll en iPhone pequeño; ítems pagados no mostraban quién pagó; modo Todo decía "Pagar tu parte"; propina Otro sin estilos; nombre poco visible.
- **Qué hace:** Cuota fija = total÷N; CTA "Pagar todo" en modo Todo; lobby con scroll + botón fijo abajo; badge "Pagó {nombre}" en ítems; tip Otro con display POS; campo nombre más destacado.

### 2026-06-20 — Multi-mesa demo + QR pack
- **Qué:** `src/lib/demo-table-catalog/` (nuevo), `demo-table-store.ts`, `demo-restaurant.ts`, `useDemoTableSession.ts`, `src/app/pay/demo/[slug]/`, `qr-utils.ts`, `scripts/generate-demo-qr-pack.mjs`, `scripts/smoke-demo-tables.mjs`, tests e2e por mesa, `docs/DEMO_TABLES_DEBUG_REPORT.md`.
- **Por qué:** Tener 4 mesas demo independientes con menús distintos (vacía, parcial, larga, ≥$50) para mostrar todos los flujos en una sola feria.
- **Qué hace:** Token `demo` sigue idéntico. `demo-mesa-1..4` resuelven a `/pay/demo/{slug}` con menús propios, una pre-pagada parcial, y un PDF A4 multi-página con QRs (`npm run demo:qr-pack`).

### 2026-06-20 — Fix recibo z-index, Ver mesa, PDF legible
- **Qué:** `customer.css`, `WaitingSuccessStage.tsx`, `ReceiptDrawer.tsx`, `receipt-pdf.ts`.
- **Por qué:** Ver mesa y Pagar tu parte quedaban encima del recibo; botón con fondo gris incorrecto; PDF A5 ilegible.
- **Qué hace:** Recibo z-index 92+ tapa dock/botones; Ver mesa inline en scroll con fondo blanco; PDF A4 con jerarquía clara; backdrop al abrir recibo.

### 2026-06-20 — Fix build: type error en GuestPayPage demo progress
- **Qué:** `GuestPayPage.tsx`, `demo-table-progress.ts`.
- **Por qué:** Vercel build falló — ternario `"paymentCount" in live` narrowing a `never`; import `paidSubtotal` sin usar.
- **Qué hace:** Usa `paidSummaries.length` en bloque demo ya acotado; quita import muerto. Build verde.

### 2026-06-20 — Gracias: factura todo ≥$50, sync %, scroll, animación pagos
- **Qué:** `PaymentStage.tsx`, `WaitingSuccessStage.tsx`, `GuestBillFlow.tsx`, `GuestPayPage.tsx`, `useGuestPaymentFlow.ts`, `demo-table-progress.ts`, `useDemoTableSession.ts`, `customer.css`, tests.
- **Por qué:** Pagar toda la cuenta ≥$50 debe pedir factura aunque haya más gente; quien no pagó debe ver mesa cerrada; % y “1 pago” no se actualizaban con pagos por ítem; scroll/recibo tapaba contenido; falta “Ver mesa” en éxito.
- **Qué hace:** Factura obligatoria en modo Todo ≥$50; todos avanzan a éxito al cerrar mesa; progreso usa `itemPaidUnits` + conteo de pagos; eyebrow animado “N pagos registrados”; botón Ver mesa en éxito; mejor scroll con recibo abierto.

### 2026-06-20 — Fix join 500 + swarm 20×10 + personas Grandpa/Child
- **Qué:** `demo-table-store.ts`, `demo-rigorous-swarm.ts`, `demo-persona-simulation.ts`, `demo-scenarios.ts`, tests (`rigorous-swarm`, `persona-simulation`, `cold-join`), `docs/PERSONA_RECOMMENDATIONS.md`.
- **Por qué:** "Internal server error" al pulsar Entrar en Vercel demo; necesidad de stress-test 20 escenarios × 10 comensales y simular usuarios reales (abuelo / niño).
- **Qué hace:** Join precarga estado + normaliza `itemPaidUnits` en Redis stale; 25 reintentos CAS; 290 tests pasan (20 rigurosos + 40 personas); recomendaciones UX en `docs/PERSONA_RECOMMENDATIONS.md`.

### 2026-06-20 — Fix: pagos parciales (½ plato, ¼ mesa) no cierran la mesa
- **Qué:** `useGuestPaymentFlow.ts`, `demo-table-store.ts`, `GuestPayPage.tsx`, `WaitingSuccessStage.tsx`, `GuestBillFlow.tsx`, `customer.css`, tests/scenarios.
- **Por qué:** Pagar ½ plato marcaba el ítem entero como pagado y saltaba a éxito; modo equal solo cerraba por headcount; subtotal demo mal calculado (`amount/1.25`).
- **Qué hace:** Solo marca ítem pagado si cubres el qty completo; pagos parciales restan vía receipts/`itemPaidUnits`; guest queda `reviewing` hasta cerrar mesa; botón Ver mesa en pill; fase success solo si `tableClosed`.

### 2026-06-20 — Polish guest UX: widget MA+name, propina, % real, medallas al final, recall tarjeta
- **Qué:** `BillStage.tsx`, `WaitingSuccessStage.tsx`, `ConfirmStage.tsx`, `GuestBillFlow.tsx`, `PaymentStage.tsx`, `demo-table-progress.ts`, `payment-form-storage.ts`, `customer.css`, tests, tip presets en hooks demo/live.
- **Por qué:** Nombre duplicado en Lo mío; propina "Sin" no deseada; % pagado inflado por headcount; medallas antes de cerrar mesa; keys duplicadas en resumen; tarjeta/factura no se recordaban al volver a pagar; espaciado dock; Reiniciar visible al scrollear.
- **Qué hace:** Widget estilo OwnerChip (MA + manuel); propina 10/15/20/Otro; progreso por monto real; medallas solo en éxito; dedupe pagos por guest; sessionStorage para tarjeta/factura; más aire antes del dock; Reiniciar se oculta al bajar scroll; fix duplicate React keys.

### 2026-06-20 — Fix: pantalla en blanco en `/pay/demo` antes de hidratar
- **Qué:** `GuestPayPage.tsx`, `useDemoTableSession.ts`, `customer.css`.
- **Por qué:** El demo mostraba un `<div>` vacío hasta que React hidrataba; si el JS tardaba o fallaba, la página quedaba blanca.
- **Qué hace:** Mientras carga la sesión se muestra el lobby (`DemoTableEntry`) con botón en loading; `useLayoutEffect` lee sessionStorage antes del primer paint.

### 2026-06-20 — Fix: mesa no cierra con 1 ítem; UI modos Lo mío / Todo
- **Qué:** `demo-table-progress.ts`, `GuestBillFlow.tsx`, `BillStage.tsx`, `_shared.tsx` (`OwnerChip`), `customer.css`, tests.
- **Por qué:** Pagar un solo plato cerraba la mesa (allGuestsPaid con 1 comensal); Todo sin checks; Lo mío mostraba "Tú" y números en ítems.
- **Qué hace:** Mesa cerrada solo si todos los platos están pagos; waiting hasta que la cuenta esté cubierta; Todo = todos los ítems con ✓ + corona; Lo mío = widget con tu nombre + chip con nombre en filas; solo checks, sin números.

### 2026-06-20 — Fix: scroll roto en Bill First Page + tests de layout
- **Qué:** `customer.css` (`min-height:0` en `.cust-scroll`, padding dock), `GuestBillFlow.tsx` (header compacto, ResizeObserver), `bill-shell-scroll.ts` + tests, `bill-first-page.spec.ts`, e2e multi-device actualizado, `split-math.ts` (iniciales P1/P2).
- **Por qué:** La tarjeta First Page no scrolleaba — flex child sin `min-height:0` crecía fuera del viewport y `overflow:hidden` del shell la recortaba.
- **Qué hace:** Scroll táctil funciona; dock no tapa totales; header sin duplicar restaurante; 263 unit tests + suite e2e bill-first-page; avatares Persona N distinguibles (P1, P2…).

### 2026-06-20 — UI: Mesita First Page en BillStage (tarjeta fluida + dock)
- **Qué:** `BillStage.tsx`, `_shared.tsx` (`OwnerChip`, `TableRosterCompact`, `AvatarDot`), `GuestBillFlow.tsx`, `customer.css`.
- **Por qué:** Alinear la pantalla de cuenta del demo con el prototipo Mesita First Page — una tarjeta, nombre inline, roster compacto, propina inline, dock glass.
- **Qué hace:** Cuenta en tarjeta única con payer row + "En la mesa", filas de plato con owner chips, banners azules en iguales/todo, stepper + EqualShareVisual compact, propina Sin/10/15/Otro fusionada en totales, botón dock "Pagar tu parte · $X"; sync demo sin cambios.

### 2026-06-20 — Fix: "Internal server error" al Entrar (join en Redis vacío)
- **Qué:** `demo-table-store.ts` (`mutateDemoState` bootstrap), test `cold-join.test.ts`.
- **Por qué:** Primer join en Upstash sin GET previo usaba `tryCommit(…, 0)` que nunca inserta → 10 retries → 500 en "Entrar a la mesa".
- **Qué hace:** Si no hay estado, seed con `getDemoTableState` antes de mutar; entrar al demo funciona en producción.

### 2026-06-19 — Fix: build Vercel — typecheck demo (BillStage, debug, actionChain)
- **Qué:** `BillStage.tsx` (`itemOwed` args), `demo-debug.ts` (`sync:reset` event), `useDemoTableSession.ts` (`actionChain` typing).
- **Por qué:** Deploy en Vercel falló en `npm run build` — typecheck estricto no corre igual en dev.
- **Qué hace:** Build de producción pasa; Vercel puede deployar con Upstash + spinner.

### 2026-06-19 — UX: spinner en plato hasta sync confirmado + pendingClaims
- **Qué:** `BillStage.tsx`, `BillItemRow`, `useDemoTableSession`, `demo-optimistic-merge.ts`, `customer.css`, `GuestBillFlow`, `GuestPayPage`.
- **Por qué:** Al tocar un plato el check parpadeaba o desaparecía; el usuario quiere feedback claro (loading) hasta que el server confirme y los otros devices vean la selección.
- **Qué hace:** Check/avatar solo con claims del server; mientras el POST está en vuelo → círculo spinner + "Guardando…"; si el server responde al instante no hay spinner; `pendingClaims` expuesto desde el hook.

### 2026-06-19 — Fix: reset demo borra claims; claims paralelos atómicos (CAS)
- **Qué:** `demo-optimistic-merge.ts`, `demo-table-store.ts` (`mutateDemoState` CAS), `useDemoTableSession.ts`, `GuestBillFlow.tsx`, `demo-scenarios.ts` (esc. 16 + 21), tests merge + multi-user.
- **Por qué:** Tras "Reiniciar demo" reaparecían platos seleccionados (pending ops + merge local); taps rápidos perdían claims (lost-update entre lambdas); 409 en claim hacía re-join con `clearStored` y rompía identidad.
- **Qué hace:** Al subir `resetSeq` se limpian pending ops y el flow usa solo claims del server una vez (`trustLocal: false`); writes al store usan CAS atómico + cola por token en el server y cola serial en el cliente; escenario 21 fuzz de 4 claims en paralelo; reset verifica `claims === {}`. 250 tests verdes.

### 2026-06-19 — Fix: claims/nombres optimistas sobreviven al sync live
- **Qué:** `demo-optimistic-merge.ts`, `useDemoTableSession`, `GuestBillFlow`, `BillStage`, `payer-badges`.
- **Por qué:** Al tipear nombre o seleccionar ítems, poll/SSE aplicaba snapshot viejo y borraba claims/renames en vuelo — selects desaparecían y el otro device no veía tu nombre.
- **Qué hace:** Claims/rename optimistas en raw + merge en ingest; `syncRevision` mantiene flow al día; un solo badge chistoso por persona; 5 tests nuevos de merge.

### 2026-06-19 — Docs: regla obligatoria "bug → escenario primero" en CLAUDE.md
- **Qué:** Bloque nuevo en `CLAUDE.md` titulado "🧪 REGLA OBLIGATORIA — Red de regresión multi-usuario", justo después de la regla del TODAY.md. Documenta el flujo: ante un bug en `/pay/demo` o multi-device, primero se agrega el escenario en `src/lib/demo-scenarios.ts`, se confirma que falla con `npm test`, luego se arregla, y ambas capas (vitest + Playwright) deben quedar verdes antes del commit. Incluye una sección "Para asistentes AI" con la secuencia exacta a seguir.
- **Por qué:** La suite multi-usuario (20 escenarios × 5 dispositivos, vitest + Playwright) es solo útil si crece con cada bug real. Sin disciplina explícita en la doc, futuras sesiones (humanas o AI) iban a saltarse el repro-primero y la red se quedaría estancada en los 20 iniciales.
- **Qué hace:** Cualquier persona o AI que abra el repo lee CLAUDE.md y ve los 7 pasos concretos (incluido el comando exacto `npm test -- multi-user-scenarios`) más la sección dedicada para AI con la orden de no tocar código de producción antes de tener el repro rojo. La suite ahora tiene contrato escrito, no convención implícita.

### 2026-06-19 — Test: harness multi-usuario 20 escenarios × 5 dispositivos + fix seed Persona N residual
- **Qué:** Nuevos archivos `src/lib/demo-scenarios.ts` (catálogo de 20 escenarios + clase `SimulatedDevice` reusable), `src/lib/demo-table-store/__tests__/multi-user-scenarios.test.ts` (Layer 1 vitest: 20 escenarios × 20 reps con jitter aleatorio = 400 invocaciones por corrida), `tests/e2e/demo-multi-device.spec.ts` (Layer 2 Playwright: 6 escenarios con UI observable y 1-5 BrowserContexts paralelos), `playwright.config.ts`, devDep `@playwright/test`, script `npm run test:e2e`, `vitest.config.ts` excluye `tests/e2e/**`. Además: fix en `GuestPayPage.tsx` para no sembrar el input con "Persona N" cuando viene de `live.yourDisplayName` (el guard original en GuestBillFlow solo cubría una de las rutas; el seed verdadero llegaba antes vía `init.initialName`).
- **Por qué:** El usuario pidió "20 pruebas con 5 usuarios donde todos tratan diferentes cosas, hasta que las 20 pruebas salgan sin un bug". Necesitábamos validación rigurosa post-fixes anteriores (idempotencia deviceId + identity-safe pay). Catálogo cubre join races, claim/release ping-pong, rename concurrente, pay en 3 modos, reset/recovery, edge cases con itemIds vacíos y nombre "Invitado" prohibido. Cada escenario corre 20 veces con jitter para forzar carreras invisibles en runs de 1.
- **Qué hace:** Layer 1 verde a la primera (400 invocaciones en ~32 seg, 0 fallos — los fixes anteriores sostienen presión multi-usuario). Layer 2 verde tras 7 iteraciones del loop autónomo: descubrió y arregló (1) `init.initialName` seedeaba el input con "Persona N" desde GuestPayPage saltándose el guard local, (2) test [03] de refresh timeoute-aba en `waitForLoadState("networkidle")` porque SSE mantiene conexión perpetua → reemplazado por `domcontentloaded` + waitFor del input directo, (3) timeouts ajustados a 60s para cold-start de compilación Next dev. Comando `npm run test:e2e` levanta dev server, abre Chrome headless, corre 6 escenarios en 14 seg. Toda la suite de 242+6 tests pasa verde.

### 2026-06-19 — Demo: medalla chill, input vacío con placeholder, identidad estable al pagar
- **Qué:** `WaitingSuccessStage.tsx` (una sola medalla destacada por persona, sin chips secundarios, "Tu paso por la mesa" como título), `customer.css` (badge card más compacta y de baja saturación), `BillStage.tsx` + `_shared.tsx` + `GuestBillFlow.tsx` (input vacío con placeholder rotativo cuando el server solo devolvió una etiqueta "Persona N"; el avatar/pill SIEMPRE muestra el seatLabel como fallback), `useDemoTableSession.ts` (nuevo `flushRename` que envía cualquier rename pendiente síncrono antes del pay; `paying.current` que bloquea el heal silencioso durante la ventana de pago; `payDemo` acepta `typedName` y lo prefiere sobre `guestName` derivado), `useGuestPaymentFlow.ts` + `GuestPayPage.tsx` (PaidPayload incluye `typedName` del form state, GuestPayPage lo pasa a payDemo), `demo-table-store.ts` (guardrail en `recordDemoPayment`: no clobbear un nombre real con una etiqueta auto "Persona N"). Tests nuevos: `pay-identity.test.ts` (4 casos).
- **Por qué:** El usuario reportó (1) medallas demasiado agresivas — cada pagador recibía 3–4 de un catálogo de 10, saturando la pantalla de éxito; (2) al ir a pagar la identidad "se reseteaba" y aparecían Personas nuevas + el nombre tipeado se veía distinto en otro device — causa: el rename tenía debounce de 150ms, si el usuario tipeaba "Manuel" y tocaba pagar antes, el pay POST viajaba con guestName derivado del raw stale (era "Persona 1") y el servidor lo escribía como nombre final; además el heal silencioso podía dispararse mid-pay creando la sensación de reset; (3) el campo de nombre venía precargado con "Persona 1" y no se notaba editable.
- **Qué hace:** En éxito solo se ve UNA medalla por pagador con emoji + título + subtítulo explicativo (ej. "Fuiste el primero en pagar. Sin miedo al éxito.") en estilo verde tenue compacto. El input de nombre arranca vacío con placeholder rotativo "Ej: Juanito / Ej: La Ñaña…" mientras el avatar al lado muestra "Persona 1" como pista del default. Al tocar pagar: cualquier rename pendiente se envía síncrono primero y se espera, el pay POST viaja con `guestName` tomado del form state directo (no del raw derivado), y un `paying` ref bloquea el heal de re-join durante toda la ventana. Como cinturón y tirantes: el server ya no sobrescribe un nombre real ("Manuel") con una etiqueta auto ("Persona 1") aunque alguna ruta legacy lo intente. Resultado: tipeas tu nombre, tocas pagar, otros devices te ven con TU nombre, sin Personas fantasma generados durante el flujo de pago.

### 2026-06-19 — Fix multi-device: ghosts y Personas duplicadas (Persona 1..10 con solo 3 amigos)
- **Qué:** `demo-table-store.ts` (joinDemoTable idempotente por deviceId + número derivado de labels), `api/demo/table/[token]/route.ts` (acepta deviceId en join), `useDemoTableSession.ts` (genera/persiste deviceId en localStorage, lo envía en cada join y en recovery de 409, heal silencioso si guest desaparece sin reset), `demo-debug.ts` (`getDemoJoinCount`), `DemoDebugPanel.tsx` (lista guests + deviceId + joins counter + copiar snapshot JSON), tests nuevos `join-idempotency.test.ts` (6 casos).
- **Por qué:** Repro con 3 celulares: se creaban ~10 "Persona N", dos teléfonos mostraban "Persona 1" al mismo tiempo, los nombres saltaban bajo lag. Causa raíz: (1) `joinDemoTable` hacía read→mutate→write sin atomicidad → carrera de "lost update" en Redis → los devices perdedores quedaban con un `guestId` que no existía en el snapshot; (2) al actuar (claim/pay) recibían 409 → `clearStoredGuestId` → fresh join SIN identificador estable → server asignaba `nextGuestNumber` (contador monotónico que solo subía, nunca reciclaba) → cada ciclo de recovery sumaba +1 (Persona 4, 5, 6…); (3) `isFreshDocumentNavigation` borraba el guestId en demasiados casos móviles, agravando lo anterior.
- **Qué hace:** Ahora cada navegador tiene un `deviceId` UUID estable en `localStorage` (`mesita:device-id`), que sobrevive nav/refresh/QR. El server hace join idempotente: lookup por deviceId primero → si existe, devuelve el MISMO guest; si no, deriva el número de Persona desde `max(personNumberFromLabel)+1` (reciclando huecos en vez de inflar). El cliente reenvía deviceId incluso en el recovery de 409 y, cuando un snapshot llega y mi guest no está pero no hubo reset, dispara un re-join silencioso que se resuelve idempotente. Resultado: 3 dispositivos = exactamente Persona 1/2/3, mismos colores en todos, ningún fantasma. Debug panel ahora muestra deviceId, conteo de joins (señal de carreras), roster completo con hue/id, y un botón "copiar snapshot" para comparar entre dispositivos.

### 2026-06-19 — Fix: progreso live + éxito al cerrar mesa + QR → lobby
- **Qué:** `demo-table-progress`, `WaitingSuccessStage`, `GuestBillFlow`, `GuestPayPage`, `useGuestPaymentFlow`, `useDemoTableSession`, `navigation-kind`.
- **Por qué:** Al pagar (todo/igual) el % no subía, decía "0 de 2 pagaron" y no pasaba a mesa cerrada; el QR saltaba el lobby.
- **Qué hace:** Progreso fusiona ítems + pagadores + pagos; sync no borra estado local; auto-éxito desde waiting; escaneo QR = visita nueva → pantalla Entrar.

### 2026-06-19 — QR de marca para demo `/pay/demo`
- **Qué:** `DemoQRPoster`, `/pay/demo/qr`, `qr-utils`, `scripts/generate-demo-qr.mjs`, `public/demo-pay-qr.png`, `customer.css`.
- **Por qué:** Necesitaban un QR listo para imprimir/compartir del link de demo sin ir a otra herramienta.
- **Qué hace:** Página en `/pay/demo/qr` con QR verde Mesita + logo al centro, botón descargar PNG; también `npm run qr:demo` genera `public/demo-pay-qr.png`.

### 2026-06-19 — Medallas playfull al pagar + fix lobby en sync
- **Qué:** `payer-badges.ts`, `WaitingSuccessStage`, `customer.css`, `useDemoTableSession`, `GuestPayPage`, tests.
- **Por qué:** Hacer más cool el cierre de mesa con badges chistosos (el más rápido, Mr. Money, el más lento…) y no expulsar al lobby al tocar ítems.
- **Qué hace:** Cada comensal recibe medallas según orden, monto, propina y modo de pago; se muestran en espera y en éxito; sync solo expulsa tras reset real.

### 2026-06-19 — Fix: sync ya no expulsa al lobby al tocar ítems
- **Qué:** `useDemoTableSession`, `GuestPayPage`, test `reset-detect.test.ts`.
- **Por qué:** Cada poll/SSE comparaba solo `resetSeq` y mandaba al lobby; un 409 en claim también expulsaba.
- **Qué hace:** Solo sale al lobby si hubo reset real (resetSeq sube Y tu guest ya no está); 409 intenta re-join; no flash de lobby mientras carga.

### 2026-06-19 — Demo: pantalla de entrada + reset expulsa a lobby
- **Qué:** `DemoTableEntry`, `useDemoTableSession`, `GuestPayPage`, `demo-restaurant`, `demo-table-store`, `customer.css`.
- **Por qué:** Abrir el link no debe unir a la mesa solo por abrirlo; solo quien toca Entrar participa; reiniciar demo debe sacar a todos a la entrada.
- **Qué hace:** Lobby “La Doña Pepa · Mesa 12” con CTA verde; join solo tras Entrar; `sessionStorage` de consentimiento; reset → lobby en todos los dispositivos.

### 2026-06-19 — Demo: 1 usuario = 1 ID, sync 500ms, éxito scroll + emojis
- **Qué:** `useDemoTableSession`, `demo-table-store`, `split-math`, `WaitingSuccessStage`, `customer.css`, API join.
- **Por qué:** Mismo usuario aparecía como Persona 3 con otro color; sync lento; emojis tapaban el pill en éxito; recibo bloqueaba botones en mobile.
- **Qué hace:** Sin re-join fantasma (solo reset); join con ID inválido → 409 + fresh join; claims huérfanos limpiados; poll/SSE 500ms; rename optimista; emojis arriba del pill; scroll en pantalla final con padding por recibo.

### 2026-06-19 — Demo: sync 1s, colores Persona 1/2/3, sin Invitado, debug
- **Qué:** `useDemoTableSession`, `demo-table-store`, `split-math`, `DemoDebugPanel`, `demo-debug.ts`, `GuestPayPage`, `ReceiptDrawer`, `customer.css`.
- **Por qué:** El usuario quería actualización continua cada segundo, colores verde/azul/morado por persona, nombres Persona N (no "Invitado"), y debug robusto.
- **Qué hace:** Poll + SSE cada 1s; paleta fija (verde claro, azul, morado…); migración v3 limpia "Invitado" en Redis; panel debug con `?debug=1` o `__mesitaDemoDebug.enable()`.

### 2026-06-19 — Demo estabilidad: sin lag/restart, nombres estables
- **Qué:** `useDemoTableSession`, `demo-table-store`, `GuestBillFlow`, `GuestPayPage`, `useGuestPaymentFlow`, rutas demo API/SSE, tests `version.test.ts`.
- **Por qué:** La demo iba bien y de repente laggeaba, “reiniciaba”, recordaba estado viejo y cambiaba nombres (Invitado / Persona N).
- **Qué hace:** Snapshots viejos se ignoran (versión monótona); cada pestaña tiene su guest en `sessionStorage`; re-join único tras reset (sin doble Persona); pay no manda "Invitado"; SSE cada 2s + poll solo si cae SSE; 409 re-join automático; nombre inicial en flow sin loop de rename.

### 2026-06-19 — Demo UX: nombres en pills, resumen pagos, éxito con emoji + reset
- **Qué:** `useDemoTableSession`, `split-math`, `BillStage`, `WaitingSuccessStage`, `GuestBillFlow`, `GuestPayPage`, `customer.css`, `types.ts`.
- **Por qué:** Pills mostraban "Invitado" en otro dispositivo; pantalla de espera sin resumen de pagos; check roto en éxito parcial; faltaba reiniciar demo al cerrar mesa.
- **Qué hace:** Roster desde Redis + claims con nombre/Persona N; pills usan claims del servidor; waiting muestra "Ya pagaron"; éxito parcial muestra pill + emoji; botón Reiniciar demo en pantalla final.

### 2026-06-19 — Fix demo: locro fantasma, pills invisibles, crash al pagar
- **Qué:** `demo-table-store`, `split-math`, `GuestBillFlow`, `WaitingSuccessStage`, `_shared`, `BillStage`, `customer.css`.
- **Por qué:** Locro precargado como “Persona 1” confundía numeración; ítems bloqueados sin pill; pagar solo crashaba la app (cierre de mesa prematuro + member undefined).
- **Qué hace:** Demo arranca limpia (v2 resetea Redis viejo); pills siempre visibles bajo platos; mesa cerrada solo cuando todos los ítems están pagados; sin crash en pago.

### 2026-06-19 — Demo: colores compartidos, mesa cerrada sync, reiniciar demo
- **Qué:** `split-math`, `useDemoTableSession`, `demo-table-store`, `GuestBillFlow`, `BillStage`, `WaitingSuccessStage`, `GuestPayPage`, `customer.css`.
- **Por qué:** En multi-device el color de cada persona debía verse igual para todos; al pagar la mesa completa todos debían llegar a “Mesa cerrada”; hacía falta resetear la demo sin recargar.
- **Qué hace:** El hue asignado en servidor es el mismo en todos los dispositivos; cuando todos pagan (ítems o invitados) todos pasan a la pantalla final; botón “Reiniciar demo” resetea la mesa vía Redis/SSE para todos.

### 2026-06-19 — /pay/demo usa API demo + Redis (sin Postgres)
- **Qué:** `useDemoTableSession`, `demo-table-store` async + Upstash, `GuestPayPage` bifurcado demo/live.
- **Por qué:** Postgres en Vercel devuelve 500; `/api/demo/table/demo` sí funciona pero no tenía el nuevo UI cableado.
- **Qué hace:** `/pay/demo` carga menú Mesita Demo precargado, sync multi-device vía Redis/SSE, pagos demo sin DB.

### 2026-06-19 — Demo auto-bootstrap en `/pay/demo` (sin seed manual)
- **Qué:** `ensure-demo-table.ts`, `findActiveBillByToken` solo cuentas abiertas, IDs de ítems demo sin UUID en API.
- **Por qué:** `/pay/demo` fallaba si no corrías seed; el usuario quiere menú demo precargado + sync multi-device.
- **Qué hace:** Al primer request a token `demo`, se crea Mesita Demo + Mesa 12 + cuenta ecuatoriana (locro pagado); otros teléfonos ven join/claims en vivo.

### 2026-06-19 — Revert migrate en build (Vercel P1001 localhost)
- **Qué:** `package.json` — quitado `migrate deploy` del build; scripts `db:deploy`, `db:seed`, `db:setup`.
- **Por qué:** Build en Vercel falló: `DATABASE_URL` apunta a `localhost:5432` (noop) durante build.
- **Qué hace:** Deploy vuelve a compilar; migraciones/seed se corren manualmente con la URL real de Supabase.

### 2026-06-19 — /pay/demo 500 en Vercel: DB sin migrar/conectar
- **Qué:** diagnóstico prod + `package.json` build con `prisma migrate deploy`.
- **Por qué:** API `/api/guest/table-session/demo` responde 500; frontend muestra "Internal server error".
- **Qué hace:** Cada deploy aplica migraciones; falta confirmar `DATABASE_URL` en Vercel y correr seed una vez.

### 2026-06-19 — Backend live sync + demo Postgres en Vercel
- **Qué:** `useLiveTableSession`, `GuestPayPage`, seed Mesita Demo (`/pay/demo`), `DemoPaymentAdapter`, `GuestBillFlow` live callbacks, SSE `maxDuration`, rutas `/pay/[token]` y `/pay/demo` unificadas.
- **Por qué:** El flujo nuevo era solo local; multi-dispositivo y deploy en Vercel necesitan Postgres + SSE, no `localStorage` ni Map en memoria.
- **Qué hace:** Unir mesa, renombrar y reclamar platos se sincroniza en vivo entre teléfonos; demo usa ítems ecuatorianos sembrados y tarjeta de prueba (`demo:4242`) sin proveedor externo.

### 2026-06-19 — Commit NamePill + Persona N
- **Qué:** commit `71328cc` — píldoras, labels Persona N, tests.
- **Por qué:** UX aprobada antes del backend.
- **Qué hace:** Base visual estable en `main` antes de cablear live sync.

### 2026-06-19 — Ajuste fino tipografía cilindros (un poco más chico)
- **Qué:** `_shared.tsx`, `customer.css`, tamaños de pill en stages.
- **Por qué:** Texto quedó demasiado grande tras el bump anterior.
- **Qué hace:** Escala font ~10% menor (mín 12px); pills ligeramente más compactos — punto medio legible/sutil.

### 2026-06-19 — Tipografía más grande en cilindros NamePill
- **Qué:** `_shared.tsx` (escala font), `customer.css`, tamaños de pill en stages.
- **Por qué:** Texto dentro del widget ilegible en móvil.
- **Qué hace:** Fuente ~40% más grande (mín 13px), weight 800; pills de confirm/mesa/items un poco más altos.

### 2026-06-19 — Cilindros/píldoras en toda la UI + Persona 1/2
- **Qué:** `NamePill`, `guestLabel`, `memberPillLabel`, `NAME_PILL_MAX=10`; `_shared`, `BillStage`, `ConfirmStage`, `MesaStage`, `ShareSheet`, `WaitingSuccessStage`, `customer.css`, demo, hooks.
- **Por qué:** Círculos de 2 letras ilegibles; P2/P3 fríos; nombre duplicado al lado del widget en confirm.
- **Qué hace:** Todos los chips son píldoras más grandes; invitados = "Persona 1/2"; input max 10 chars; confirm/mesa solo muestran el cilindro + ítems/monto (sin "MANUEL" repetido).

### 2026-06-19 — Name pill expandible bajo platos (Lo mío)
- **Qué:** `NamePill` + `namePillLabel` en `split-math.ts`, `_shared.tsx`, `BillStage.tsx`, `customer.css`.
- **Por qué:** Círculo de 2 letras no mostraba el nombre que escribes al reclamar platos.
- **Qué hace:** Chip verde crece como píldora (hasta 8 chars) en input de nombre y bajo ítems en "Lo mío"; equal/mesa/confirm siguen con 2 letras.

### 2026-06-19 — Descartado experimento labels 1,2,3; vuelta a P1,P2,P3
- **Qué:** `git restore` de cambios locales sin commitear (labels numéricos, demo `initialStage`, `useLayoutEffect`).
- **Por qué:** No convenció visualmente; `main` ya tenía el UX bueno con P1/P2/P3.
- **Qué hace:** Working copy alineada con `origin/main` (`9a8b903`).

### 2026-06-19 — Guest UX v2: avatares, totales, Gracias, rey Todo
- **Qué:** `split-math.ts`, `BillStage`, `WaitingSuccessStage`, `ShareSheet`, `ConfirmStage`, `customer.css`, `page.tsx`, `demo/page.tsx`.
- **Por qué:** Copy total redundante; avatares tomate/1 letra; pendientes sin estilo y mal calculados en equal; cuenta completada plana.
- **Qué hace:** "Total por pagar" + sublínea mesa original; avatares MA verde + paleta alegre; corona en Todo; pendientes estilizados; "Ver mesa"; hero rey en success todo; sin "Volver al inicio".

### 2026-06-19 — Guest pay: pagados arriba, footer confirm, visual por iguales
- **Qué:** `BillStage.tsx`, `_shared.tsx`, `ConfirmStage` CSS en `customer.css`.
- **Por qué:** Platos pagados perdidos en la lista; botones solapados en confirm; balanza fea en por iguales.
- **Qué hace:** Ítems pagados van primero; footer confirm con gap entre CTAs; meter de segmentos iguales + avatares en lugar de balanza.

### 2026-06-19 — Guest pay: total dinámico, propina 15%, avatares por modo
- **Qué:** `BillStage.tsx`, `GuestBillFlow.tsx`, `_shared.tsx`, `customer.css`, `page.tsx`, `demo/page.tsx`.
- **Por qué:** "Tu cuenta" no reflejaba pagos parciales; propina arrancaba en 0%; avatares bajo platos aparecían en todos los modos de split.
- **Qué hace:** Header dice **Total por pagar** y muestra saldo restante de mesa (baja al pagar); propina default 15%; avatars solo en **Lo mío**; equal share meter; corona en **Todo**; demo con locro ya pagado.

### 2026-06-18 — Restaurar items numerados en la cuenta del guest
- **Qué:** `src/components/guest/flow/BillStage.tsx`.
- **Por qué:** En Vercel la lista "Escoge tus platos" salía como checkboxes vacíos sin numerar; localhost ya tenía la versión correcta numerada. El JSX no usaba las clases `.c-item-emoji-inline` y `.c-tick-num` que sí existen en `customer.css`.
- **Qué hace:** Cada `BillItemRow` ahora recibe `index` y muestra el número del plato (1, 2, 3...) dentro del círculo `.c-tick`. El círculo se pone verde con número blanco cuando el plato es tuyo (`.c-tick.on`) y aparece el badge "Tú" en la fila. El emoji se renderiza inline al lado del nombre (`.c-item-emoji-inline`). Selección, montos, estados shared/paid y "Toca para escogerlo" intactos.

### 2026-06-18 — Home abre la app demo
- **Qué:** `src/app/page.tsx`.
- **Por qué:** El dominio principal abría la landing estática en vez del flujo real de la app.
- **Qué hace:** Redirige `/` hacia `/pay/demo` para que el deploy abra directamente la experiencia demo de pago.

### 2026-06-18 — Arreglo build Vercel en pantalla Gracias
- **Qué:** `WaitingSuccessStage.tsx`, `package.json`, `package-lock.json`.
- **Por qué:** El deploy fallaba por imports inexistentes (`latestReceipt`, `bill-display`) y por usar `canvas-confetti` sin declararlo como dependencia.
- **Qué hace:** Usa `state.receipt?.name` como fallback del nombre, calcula etiquetas de ítems con los datos existentes y agrega `canvas-confetti` + sus tipos para que `npm run build` compile en Vercel.

### 2026-06-18 — Anillo Gracias: % pagado + celebración
- **Qué:** `WaitingSuccessStage.tsx`, `customer.css`.
- **Por qué:** El anillo mostraba % por pagar (confuso); texto descentrado; faltaba un toque festivo post-pago.
- **Qué hace:** Muestra % pagado con anillo verde proporcional; "Faltan $X" como subtítulo; mini animación 🕺💃🎉 debajo; centrado corregido con `.ws-mesa-ring-dial`.

### 2026-06-18 — Gracias con anillo de progreso + layout dock/recibo
- **Qué:** `WaitingSuccessStage.tsx`, `ReceiptDrawer.tsx`, `GuestBillFlow.tsx`, `customer.css`.
- **Por qué:** Pantalla Gracias confusa y dock/recibo tapaban el botón pagar.
- **Qué hace:** "Un pago registrado" + anillo % por pagar; dock sube sobre peek; scroll con padding correcto.

### 2026-06-18 — Recibo acumulativo, drawer global y volver a pagar
- **Qué:** `ReceiptDrawer.tsx`, `GuestBillFlow.tsx`, `WaitingSuccessStage.tsx`, `customer.css`, `useGuestPaymentFlow.ts` (receipts[]), `receipt-pdf.ts`.
- **Por qué:** Unificar confirm, soportar pagos parciales con varios comprobantes, y permitir volver a la cuenta sin perder el recibo.
- **Qué hace:** Drawer con total acumulado + badge N pagos en todos los stages; PDF descargable; botón "Volver a la cuenta" en Gracias; ítems pagados persisten al regresar.

> Lo más nuevo arriba. Lo reciente con detalle; lo viejo, resumido.

### 2026-06-17 — Se creó la bitácora TODAY.md y la regla de registro
- **Qué:** se agregó este archivo `TODAY.md` en la raíz y se añadió una nota
  obligatoria al inicio de `CLAUDE.md`.
- **Por qué:** para tener un diario claro del proyecto y forzar que, en cada
  sesión futura, todo cambio quede registrado con su qué/por qué/qué hace.
- **Qué hace:** ahora cualquiera (persona o IA) que abra el repo lee primero
  `TODAY.md` para ponerse al día, y queda obligado a anotar aquí cada edit.

### 2026-06-15 — Incluir los assets estáticos de la landing (`2538f1a`)
- **Qué:** se agregaron los archivos de la landing en `public/landing/index.html`
  y `public/assets/` (CSS y JS compilados), y se ajustó `.gitignore` para que
  esos archivos sí se suban.
- **Por qué:** la página de inicio (landing) no se veía bien en producción porque
  faltaban sus archivos estáticos.
- **Qué hace:** la landing ya carga completa con sus estilos y scripts al desplegar.

### 2026-06-15 — Generar el cliente de Prisma durante el build (`5981a8f`)
- **Qué:** se cambió el script `build` en `package.json` para correr
  `prisma generate` antes de `next build`.
- **Por qué:** en Vercel el build fallaba porque el cliente de Prisma no estaba
  generado.
- **Qué hace:** ahora el deploy genera el cliente de Prisma automáticamente y el
  build pasa.

### 2026-06-15 — Quitar el cron de cada minuto de `vercel.json` (`206cbe1`)
- **Qué:** se eliminaron 8 líneas de `vercel.json` que definían un cron por minuto.
- **Por qué:** el plan gratis (hobby) de Vercel **no permite** crons tan
  frecuentes, y eso bloqueaba el despliegue.
- **Qué hace:** el deploy en Vercel ya no es rechazado por el cron incompatible.

### 2026-06-15 — Commit inicial: demo del flujo del cliente (sin DB) (`84efecc`)
- **Qué:** primera subida del proyecto completo (224 archivos). Incluye:
  toda la app Next.js (`src/`), el flujo de pago del cliente (`/pay`, componentes
  `guest/`), panel de owner y admin, módulos de dominio (`bills`, `payments`,
  `pos`, `guest-session`), el adaptador de Contífico, el esquema y migraciones de
  Prisma, pruebas (vitest), documentación (`docs/`) y configuración (CI, Tailwind,
  TypeScript).
- **Por qué:** punto de partida del proyecto — dejar funcionando el recorrido del
  cliente (escanear → ver cuenta → pagar) como demo.
- **Qué hace:** sienta toda la base del producto: la arquitectura POS-integrada,
  el flujo de pago con QR y la estructura por módulos sobre la que se construye
  todo lo demás.
