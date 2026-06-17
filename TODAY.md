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
