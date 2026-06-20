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
