# MesitaQR — Evaluación de producto y plan de lanzamiento

*Preparado por el equipo senior (audit swarm + inspector + QA), junio 2026. Branch: `senior-upgrade`.*

---

## 1. Veredicto sobre la idea

**La idea es buena y el timing en Ecuador es correcto.** El modelo está validado globalmente: sunday (el comparable más directo) levantó $24M de seed, luego $100M, y en noviembre 2025 levantó $21M más con 3,500 restaurantes y 3x de crecimiento anual. El comportamiento de "escanear y pagar" ya no requiere educación de mercado en Ecuador: Deuna supera los 6 millones de usuarios y 620,000 comercios, y PayPhone normalizó el cobro QR sin datáfono. El guest ya sabe escanear un QR para pagar.

**Tu diferenciación real no es el QR — es la integración POS + facturación SRI.** Deuna y PayPhone cobran, pero no saben qué hay en la cuenta: no hacen split por ítem, no cierran la prefactura en Contífico, y no resuelven la factura electrónica. MesitaQR sí. Esa es la moat: el flujo completo *prefactura → pago dividido → cobro registrado en POS → factura SRI emitida por el POS* es doloroso de replicar y muy valioso para el restaurante (cuadre contable automático). La decisión de arquitectura "Camino A" (el POS es dueño de la orden y de la factura) es la correcta — no compites con el POS, lo completas.

**El riesgo principal no es técnico, es de distribución y de hábito del mesero.** El producto muere si el mesero no genera la prefactura a tiempo o si el guest no encuentra el QR. El pilot debe diseñarse alrededor de eso.

## 2. Estado del producto (post-upgrade)

El swarm ejecutó 3 auditorías senior (~70 hallazgos), un inspector verificó cada hallazgo crítico contra el código (descartó 4 falsos positivos), 3 workers implementaron 13 órdenes de trabajo aprobadas, QA encontró 9 defectos (1 blocker) y la iteración 2 los cerró todos.

**Estado verificado:** TypeScript limpio · 127/127 tests · `next build` exitoso · 2 commits en `senior-upgrade`.

Lo que se arregló (resumen):

- **Seguridad:** dev-login bloqueado (doble flag), secreto admin solo por header con comparación timing-safe, rate limit al endpoint de guest (120/min por IP+token), webhook Kushki devuelve 500 ante fallo de DB (para que Kushki reintente), headers de seguridad (HSTS, nosniff, X-Frame-Options), validación zod endurecida (precios, logo http(s), nombres).
- **Pagos (el fix más importante):** los totales del POS (`subtotal/iva/propina/total` de Contífico) ahora se persisten y son la fuente de verdad. Antes se recalculaban con un multiplicador fijo — cualquier descuento o ítem con IVA 0% hacía que los cobros nunca sumaran exacto al documento y la prefactura **jamás se convertía en factura**. El último pago de un split ahora paga el remanente exacto. Además: claves de idempotencia atadas al bill, guard contra doble pago concurrente del mismo ítem y del último share, refund con claim atómico (imposible doble reembolso).
- **UX del guest:** propina 10% etiquetada "(incluida por el restaurante)" vs propina adicional opcional, recuperación clara ante tarjeta rechazada / pérdida de red (retry seguro con la misma clave de idempotencia), referencia de pago + fecha + mesa en la confirmación (comprobante), sección "Pagos hasta ahora" en cuentas parcialmente pagadas, dashboard sin datos falsos y con botón de reintentar, diálogos de confirmación reales, errores en español.

## 3. Mercado y competencia

| Jugador | Qué hace | Qué no hace (tu espacio) |
|---|---|---|
| **Deuna** (Banco Pichincha) | Wallet QR masivo, 620k comercios | No ve la cuenta, no split por ítem, no cierra el POS, no factura |
| **PayPhone** | Cobro con tarjeta sin datáfono, links/QR | Mismo gap: es un medio de cobro, no una capa de mesa |
| **Datafast / datáfonos** | Cobro tradicional en mesa | 14 min de fricción, sin split, el mesero atado al datáfono |
| **sunday (global)** | Exactamente tu producto, en US/EU | No está en Ecuador; no integra Contífico/Siigo ni SRI |
| **POS locales (Contífico, Siigo)** | Dueños de la orden y la factura | No tienen pay-at-table; son tu socio, no tu rival |

Lectura estratégica: tienes una ventana de 12–24 meses antes de que un jugador grande (Deuna, Kushki mismo, o sunday expandiéndose) ataque el nicho. La defensa es profundidad de integración POS + base instalada de restaurantes. Cada integración nueva (Siigo, Practicis) ensancha la moat porque el `POSAdapter` ya está diseñado para eso.

## 4. Modelo de negocio recomendado

- **Cobro por transacción, no SaaS puro al inicio.** Para un restaurante de Quito, $X fijos/mes es fricción; 1.5–2.5% sobre lo procesado vía MesitaQR (encima del MDR de Kushki) se siente "gratis hasta que vendo". sunday usa este modelo.
- **Ancla el pitch en datos duros del propio restaurante:** rotación de mesa (+1 turno en almuerzo = el simulador del landing ya lo muestra), propinas (+15–25% típico en pay-at-table por los presets), y cero descuadre contable (cobros = documento POS exacto — esto ahora es literalmente cierto en el código).
- **Pricing piloto:** gratis 60–90 días para los primeros 3–5 restaurantes a cambio de data, testimonios y tolerancia a bugs. Luego grandfathering a tarifa preferencial.
- **No toques el flujo de dinero todavía** (no seas adquirente ni hagas split de fondos): Kushki liquida directo al restaurante, tú cobras tu fee por separado. Menos riesgo regulatorio, cierre de ventas más fácil.

## 5. Qué falta antes del primer restaurante real

**Bloqueantes (1–2 semanas):**

1. **Prueba end-to-end contra Contífico real** (sandbox y luego producción): prefactura → ingest → pago split → cobro → conversión PRE→FAC. Es la única parte del sistema que ningún test cubre — los tests mockean el adapter. Hazlo con tu propia cuenta Contífico antes de tocar la de un cliente.
2. **Webhook Kushki en producción:** registrar la URL, verificar firma con el secreto real, y probar un pago real de $1 con tarjeta propia.
3. **Variables de entorno de producción auditadas:** `CRON_SECRET`, `KUSHKI_WEBHOOK_SECRET`, `ADMIN_SECRET` largos y únicos; `ENABLE_DEV_LOGIN` ausente; verificar que el cron de ingest esté agendado en Vercel.
4. **Backup y runbook mínimo:** qué hacer cuando un pago quedó COMPLETED en MesitaQR pero el cobro falló en Contífico (el código ya loguea `POS_COBRO_FAILED` — define quién lo revisa y cómo se reconcilia a mano).

**Importantes (antes de escalar más allá del pilot) — diferidos por el inspector con razón:**

- Verificación de email en registro + CAPTCHA (hoy cualquiera crea restaurantes PENDING).
- Recibo por WhatsApp/email para CONSUMIDOR_FINAL (la referencia de pago ya existe; falta el envío).
- Rotación de QR al cerrar la cuenta.
- Filtros por fecha + export CSV en transacciones (lo pedirá el contador del restaurante el día 1 del mes).
- Rediseño de login/register a la paleta de la app.
- Page de estado/monitoreo (UptimeRobot + alertas de `POS_INGEST_DOC_ERROR` y `POS_COBRO_FAILED` a tu WhatsApp).

## 6. Plan de pilot (Quito)

**Semana 0 — dogfood:** monta una "mesa" en tu casa/oficina con tu cuenta Contífico. Tú eres el mesero. 20 pagos reales de $1–2 con tarjetas de amigos, incluyendo splits de 3–4 personas en la misma mesa (el caso que el fix del blocker arregló) y un refund.

**Semanas 1–4 — 1 restaurante amigo:** idealmente uno que ya use Contífico y tenga almuerzo ejecutivo concurrido (tu segmento del landing). Tú presente en el servicio de almuerzo los primeros 5 días. Mide: % de cuentas pagadas vía QR, tiempo de cierre de mesa, propina promedio, y cada intervención manual que tuviste que hacer.

**Semanas 5–12 — 3–5 restaurantes:** solo cuando el primero opere 2 semanas sin que toques nada. Aquí pruebas el onboarding sin ti: ¿puede un manager configurar mesas + credenciales Contífico solo con una guía?

**Criterio de éxito del pilot:** >40% de cuentas pagadas por QR en mesas con QR visible, cero descuadres contables a fin de mes, y al menos un owner dispuesto a pagar y a dar testimonio.

## 7. Roadmap 30 / 60 / 90

- **Días 1–30:** bloqueantes técnicos + dogfood + restaurante 1. Landing apuntando a "Reservar una demo" con WhatsApp real (ya está). Nada de features nuevas.
- **Días 31–60:** restaurantes 2–5. Recibo WhatsApp, export CSV, verificación de email. Primer caso de estudio con números reales para el landing.
- **Días 61–90:** definir pricing con data del pilot y empezar a cobrar. Segunda integración POS (Siigo) solo si un cliente pagante la pide. Decidir si levantas pre-seed con el caso de estudio (el deck ya existe en el repo) o creces orgánico.

## 8. Métricas que importan (no vanity)

Adopción por mesa (% cuentas via QR), tiempo prefactura→mesa cerrada, % splits multi-guest, propina voluntaria promedio, tasa PRE→FAC automática (debe ser ~100% — es tu promesa central), pagos con intervención manual (debe tender a 0), y churn de restaurantes (el norte real del negocio).

---

## Apéndice: deuda técnica conocida (priorizada)

1. E2E test contra Contífico sandbox (nada lo cubre hoy).
2. `syncBillItems` matchea ítems por nombre — riesgo con ítems duplicados; migrar a `externalId` (diseño pendiente de backfill).
3. Legacy: cuentas no-POS parcialmente pagadas en EQUAL pueden rechazar un pago FULL posterior con error claro (tradeoff deliberado documentado por QA — antes cobraba doble en silencio).
4. CSP header pendiente (requiere inventariar los requisitos inline del SDK de Kushki).
5. Rate limiter falla abierto si Redis cae (tradeoff documentado; agregar alerta).
6. Colores hardcodeados fuera del token set en algunos componentes del dashboard (cosmético).
7. La sección de paleta PagaYa en CLAUDE.md parece desactualizada vs `globals.css` (coral/emerald) — alinear el documento.
