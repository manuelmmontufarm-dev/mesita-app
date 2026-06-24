# Demo — URL canónica y proyectos Vercel

> **Regla:** siempre `https://mesitademo-two.vercel.app` — es la que tienen los QRs
> impresos (`docs/demo-qr-pack/`, `public/demo-pay-qr.png`).

## Por qué hay tantos links

El mismo repo de GitHub (`mesita-app`) se importó **3 veces** en Vercel. Cada
import crea un proyecto separado con su propio dominio `.vercel.app`, env vars y
pipeline de build. Cada `git push` a `main` dispara **3 builds en paralelo**.

La fuente única en código es [`src/lib/demo-url.constants.mjs`](../src/lib/demo-url.constants.mjs).

---

## Inventario completo (7 URLs públicas relevantes)

| # | URL | Proyecto Vercel | Rol | Commit prod (`main`) | Estado |
|---|-----|-----------------|-----|----------------------|--------|
| 1 | **mesitademo-two.vercel.app** | `mesitademo` | **⭐ CANÓNICA — QRs impresos** | `58c1c79` | ✅ Activa |
| 2 | mesita-demo.vercel.app | `mesita-demo` | Legacy duplicado | `58c1c79` | ⚠️ Pausar |
| 3 | mesitaappdemo.vercel.app | `mesita_app_demo` | Legacy duplicado | `58c1c79` | ⚠️ Pausar |
| 4 | mesitademo.vercel.app | *(otro dueño)* | No es tuyo | — | ❌ 404 |
| 5 | mesitademo-manuel-montufar-s-projects.vercel.app | `mesitademo` | Alias team del #1 | `58c1c79` | ✅ (mismo deploy) |
| 6 | mesita-demo-manuel-montufar-s-projects.vercel.app | `mesita-demo` | Alias team del #2 | `58c1c79` | ⚠️ Legacy |
| 7 | mesitaappdemo-manuel-montufar-s-projects.vercel.app | `mesita_app_demo` | Alias team del #3 | `58c1c79` | ⚠️ Legacy |

**Ninguna está desactualizada** respecto a `main` — las 3 proyectos activos sirven
el mismo commit `58c1c79`. El problema no es versión vieja sino **confusión** y
**triple facturación de builds**.

URLs preview por branch (`*-git-main-*.vercel.app`) requieren login Vercel (401)
— no son para compartir.

---

## URLs que debes usar

| Contexto | URL |
|----------|-----|
| QR / mesa impresa | `https://mesitademo-two.vercel.app/pay/demo` |
| Mesa 1–4 | `https://mesitademo-two.vercel.app/pay/demo/mesa-{1..4}` |
| QA manual con debug | `https://mesitademo-two.vercel.app/pay/demo?debug=1` |
| Regenerar QR PNG | `npm run qr:demo` |
| Regenerar PDF 5 mesas | `npm run demo:qr-pack` |

---

## Pausar proyectos legacy (recomendado)

No borrar todavía — **Pause** detiene auto-deploys sin perder historial.

1. **mesita-demo** → [Settings → General](https://vercel.com/manuel-montufar-s-projects/mesita-demo/settings) → **Pause Project**
2. **mesita_app_demo** → [Settings → General](https://vercel.com/manuel-montufar-s-projects/mesita_app_demo/settings) → **Pause Project**

Dejar **activo solo** [`mesitademo`](https://vercel.com/manuel-montufar-s-projects/mesitademo).

Después de pausar, `mesita-demo.vercel.app` y `mesitaappdemo.vercel.app` seguirán
sirviendo el último deploy hasta que decidas borrar el proyecto. Si compartiste
esas URLs con alguien, avísales del cambio a `mesitademo-two`.

---

## Verificación rápida

```bash
# Debe imprimir la URL canónica
npm run qr:demo

# Las 3 prod públicas (solo #1 es canónica)
curl -sI https://mesitademo-two.vercel.app/pay/demo | head -1   # 200
curl -sI https://mesita-demo.vercel.app/pay/demo | head -1    # 200 (legacy)
curl -sI https://mesitaappdemo.vercel.app/pay/demo | head -1    # 200 (legacy)
curl -sI https://mesitademo.vercel.app/pay/demo | head -1       # 404
```

Última verificación: 2026-06-24 — commit `58c1c79` en los 3 proyectos propios.
