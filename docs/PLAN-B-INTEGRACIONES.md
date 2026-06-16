# Plan B — Alternativas de integración cuando no hay API del POS

*Contexto: las precuentas creadas en el POS local pueden no sincronizarse a la nube hasta volverse facturas. Necesitamos demostrar valor (pagos reales, data, escenarios) sin depender de que `pullOrders()` funcione contra Contífico. Regla inviolable: **MesitaQR no es POS y no emite facturas** — el POS del restaurante sigue siendo dueño de la orden fiscal.*

---

## 0. Antes de todo: validar el supuesto (1 día)

Con tu propia cuenta Contífico: crea una precuenta desde el módulo Punto de Venta y consulta `GET /documento/?tipo_documento=PRE` en la API v1. Tres resultados posibles: (a) aparece en tiempo real → el plan A funciona, sigue como estás; (b) aparece con retraso → el polling necesita tolerancia, pero funciona; (c) no aparece hasta facturar → activas el Plan B de abajo. **No diseñes a ciegas: este test cuesta una tarde.**

---

## Las 7 alternativas (ordenadas por velocidad de implementación)

### 1. Modo "solo total" (Total-Only) — *días, no semanas*
El QR de la mesa abre el flujo de pago sin ítems: el mesero (desde su celular) o el propio guest ingresa el total de la precuenta impresa. Split EQUAL o por monto custom, propina, pago Kushki — todo igual, solo desaparece el split por ítem. El cajero registra el cobro en su POS como "tarjeta" y factura como siempre.

- **Pros:** compatible con CUALQUIER restaurante de Ecuador desde el día uno; 80% del valor (pago en mesa, split, propina, velocidad, data); es el fallback que usa sunday ("pay amount").
- **Contras:** sin split por ítem (el centerpiece del landing); el total es digitado a mano (riesgo de error → mitigar mostrando el monto grande para confirmación del guest).
- **Qué tocar en el código:** el flujo guest ya soporta EQUAL/FULL sin depender de ítems POS; falta una pantalla del mesero "crear cuenta rápida: mesa + total". El `posTotal` se setea con el monto digitado — el resto del pipeline no cambia.

### 2. Modo Companion: el mesero arma la cuenta en MesitaQR — *1–2 semanas*
El server dashboard ya existe. Se restaura la creación manual de cuentas (estuvo en el repo — está en el historial de git): el mesero selecciona mesa y agrega ítems desde el menú cargado en MesitaQR (el módulo de menú ya existe). El guest ve la cuenta completa y paga con split por ítem. La factura la emite el cajero en su POS, como hoy.

- **Pros:** demo completa del producto (split por ítem, avatares, todo el centerpiece); cero dependencia de API; data rica de qué ítems se comparten.
- **Contras:** doble digitación (el mesero ya metió la comanda a su POS). Mitigación para piloto: restaurantes de almuerzo ejecutivo con menú corto (3–6 ítems), que es justo tu segmento del landing.
- **Qué tocar:** restaurar rutas de bills manuales + UI de creación en el dashboard del mesero. `posProvider = null` → modo companion (el campo ya existe).

### 3. Interceptor de impresora (print-listener) — *2–4 semanas, la apuesta media*
La precuenta **siempre se imprime** — ese es el loop de integración que pediste. Un dispositivo barato (Raspberry Pi ~$50) o una app Windows en la caja se mete entre el POS y la impresora térmica (proxy TCP al puerto 9100 o impresora virtual), captura el print job, parsea el [ESC/POS](https://github.com/receipt-print-hq/escpos-tools) (texto plano con ítems, cantidades y total), y crea el bill vía el endpoint `pos-companion` que **ya existe en tu repo**. La precuenta se imprime normal — el mesero no nota nada.

- **Pros:** cero fricción para el personal; ítems completos; funciona con cualquier POS local sin importar marca; es el truco clásico de los integradores pay-at-table.
- **Contras:** hardware por local; un parser por formato de ticket (regex por restaurante al inicio); mapeo ticket→mesa (la precuenta suele imprimir "MESA 7" — se parsea).
- **Qué tocar:** un `PrinterAdapter` que implemente tu interfaz `POSAdapter` — la arquitectura ya está diseñada para esto.

### 4. OCR de la precuenta — *1 semana, solo para piloto*
Variante sin hardware del #3: el mesero fotografía la precuenta impresa desde la app companion; un OCR (Claude API con visión sirve perfectamente) extrae ítems y total; el mesero confirma y la cuenta queda viva en la mesa.

- **Pros:** cero instalación; ítems completos; demo impresionante para vender.
- **Contras:** un paso manual del mesero por cuenta; no escala a hora pico; costo por llamada OCR.
- **Uso correcto:** herramienta de piloto y de demo comercial, no de producción.

### 5. Terminal móvil del mesero (SoftPOS / tap-to-phone) — *aliado, no reemplazo*
La app companion del mesero se vuelve también terminal de cobro presencial: selecciona mesa, total, y el guest que no quiere QR paga con **tap de su tarjeta en el celular del mesero** ([PayPhone TAP ya existe en Ecuador](https://payphone.app/productos/tap) — Android + NFC; evaluar si Kushki ofrece tap-to-phone para no fragmentar la liquidación). MesitaQR sigue orquestando mesa/split/propina; el tap es solo otra forma de cobro dentro del mismo bill.

- **Pros:** cubre al cliente sin smartphone/datos; el restaurante reemplaza el datáfono alquilado; sigues sin ser POS (no facturas).
- **Contras:** comisión del agregador (PayPhone TAP ~5%) si no es Kushki; certificación/SDK; Android only.
- **Cuándo:** después del piloto, como upsell "mesa híbrida: QR + tap".

### 6. Agente local de lectura (DB/archivo del POS) — *por-POS, para escalar*
Para POS locales no-Contífico (muchos usan Firebird/SQL Server/archivos): un servicio Windows liviano instalado en la caja lee las cuentas abiertas directamente de la DB o de exports (CSV cada 30s) y las empuja al endpoint pos-companion. Es tu `POSAdapter` corriendo on-premise en vez de contra una API cloud.

- **Pros:** datos completos y en tiempo real; sin tocar el flujo del mesero.
- **Contras:** ingeniería inversa por cada POS; acceso a la máquina del cliente; mantenimiento. Solo justificable cuando un POS específico se repita en varios clientes.

### 7. Flujo invertido: factura primero, pago QR después — *cuando la nube solo ve facturas*
Si las precuentas nunca llegan a la nube pero las **facturas sí** (que es exactamente tu escenario): el cajero factura al cierre de la cuenta (como muchos restaurantes ya operan), MesitaQR detecta la factura nueva vía API en segundos, y genera el cobro QR para esa mesa — el guest paga la factura ya emitida, con split incluido. El cobro se registra contra la factura.

- **Pros:** usa el único evento que SÍ sincroniza; cero digitación; ítems completos (la factura los trae); cuadre perfecto.
- **Contras:** invierte el orden (factura antes del pago — operativamente normal en Ecuador, pero el restaurante asume el riesgo de no-pago los minutos intermedios); pierde el "paga cuando quieras" pre-cierre.
- **Qué tocar:** el polling cambia de `tipo=PRE` a `tipo=FAC` sin cobros registrados — es casi el mismo adapter.
- **Detalle completo:** ver el Anexo A abajo — tras la confirmación oficial de Contífico (junio 2026), este es el camino de integración real.

---

## Recomendación

**Para el piloto (este mes):** #1 + #2 combinados — "modo companion" con dos velocidades: total rápido para hora pico, ítems completos para mesas que quieren split por ítem. Esto te da pagos reales, data y bugs **sin escribir una línea contra Contífico**, y de paso valida si los restaurantes realmente exigen la integración POS o les basta el companion (dato de oro para priorizar ingeniería).

**En paralelo (1 tarde):** el test del punto 0. Si la API ve las PRE → plan A vive y el companion queda como fallback/argumento de venta ("funciona con cualquier POS"). Si no las ve → #7 (factura primero) es tu integración Contífico real, y #3 (interceptor de impresora) es la apuesta para split por ítem pre-cierre a escala.

**Posicionamiento:** el companion mode no es un downgrade — véndelo como "MesitaQR funciona con tu POS de hoy, sin instalar nada". La integración profunda pasa a ser el upsell, no el requisito de entrada. Así el pipeline comercial no depende de la API de nadie.

---

# Anexo A — El flujo invertido (#7) en detalle

*Basado en la confirmación oficial del soporte de Siigo Contífico (chat del 3 de junio de 2026).*

## Lo que Contífico confirmó

1. **Las precuentas del POS de escritorio NO sincronizan con la nube/API.** Viven en el SQL local y solo suben "cuando se da clic en facturar". Los documentos PRE visibles por API son únicamente los creados desde nube/API.
2. **No existe método oficial** para que una app externa lea precuentas del POS local ni registre cobros sobre ellas. "Ordes" (la extensión que visualiza precuentas por IP) es solo para pedidos, sin API y sin cobros.
3. **Los clientes SÍ sincronizan automáticamente entre API ↔ POS ↔ nube**, de forma inmediata (con el parámetro de sincronización continua activo). 🔑 *Puerta abierta #1.*
4. **"API solo se podría manejar como un POS aparte"** — Contífico permite que un sistema externo cree sus propios documentos (PRE→FAC) y registre cobros vía API/nube, operando como punto de venta paralelo. 🔑 *Puerta abierta #2.*
5. Para pagos de agregadores externos (Kushki/PayPhone): "registrar la factura normalmente y el cobro realizarlo desde la nube".

**Implicación directa:** el plan A original (poll de PRE del POS desktop) está oficialmente muerto. El companion mode (#1/#2) es el camino del piloto, y el #7 es la integración Contífico real. Ambos comparten el mismo código.

## Cómo funciona el #7, paso a paso

El truco central: **desacoplar el pago del registro fiscal.** MesitaQR cobra cuando el guest quiera (vía Kushki, contra su propio bill); la factura sigue siendo 100% del POS; los puntos de contacto con Contífico son el *cliente* (antes de facturar) y el *cobro* (después de que la factura sincroniza).

```
MESA                          MESITAQR                       CONTÍFICO
────                          ────────                       ─────────
Guest escanea QR
Guest ve la cuenta            (bill companion: total
                               o ítems del mesero)
Guest quiere factura
con datos → ingresa     ──►   POST /persona (cliente) ──►   Cliente visible en el
RUC/cédula/email               vía API                       POS INMEDIATAMENTE ✓
Guest paga (split,      ──►   Kushki cobra. Bill
propina, todo)                 FULLY_PAID. Dashboard
                               muestra "MESA 7 PAGADO ✓"
                                                             Cajero ve PAGADO,
                                                             selecciona el cliente
                                                             ya sincronizado y
                                                             FACTURA en su POS
                              Polling detecta la FAC   ◄──  Factura sube a la
                              nueva (tipo=FAC sin            nube al facturar ✓
                              cobro completo)
                              Registra el/los cobros   ──►  Documento cobrado,
                              vía API/nube                   cuadre exacto ✓
```

## Las tres versiones, de menor a mayor integración

**7a — Cero integración de documentos (semana 1 del piloto).** MesitaQR cobra contra el bill companion; el dashboard del cajero muestra "PAGADO $52.30 ✓" en verde; el cajero factura en su POS marcando forma de pago "tarjeta", como hace hoy con el datáfono. Sin API de documentos. La conciliación es visual + el reporte de MesitaQR vs el cierre de caja. *Esto ya casi existe en el producto.*

**7b — + Cliente fiscal sincronizado (semana 2-3).** Cuando el guest pide factura con datos, MesitaQR crea/actualiza el cliente vía `POST /persona` ANTES de que el cajero facture. El cajero solo lo busca por cédula/RUC en su POS — ya está ahí (confirmado: sincronización inmediata). Esto elimina la digitación manual de datos fiscales, que es de los dolores más reales del flujo actual. El código de `findOrCreateCliente` del ContificoAdapter ya hace esto — solo cambia el momento en que se invoca.

**7c — + Cobro registrado contra la factura (mes 2).** El polling cambia de `tipo=PRE` a `tipo=FAC` recientes sin cobro completo. Cuando aparece la factura de la mesa, MesitaQR registra el/los cobros vía API hasta cuadrar el total exacto (toda la maquinaria de `posTotal`/remanente exacto construida en el upgrade sirve idéntica). Resultado: cuadre contable automático, la promesa central del pitch.

## Los dos problemas a resolver (y sus soluciones)

**Mapeo factura→mesa.** La factura sincronizada quizá no trae referencia de mesa. Soluciones en orden de preferencia: (1) matching automático por monto exacto + ventana de tiempo + estado PAGADO del bill companion (en un restaurante, dos facturas idénticas en el mismo minuto son raras; en colisión, pedir confirmación); (2) el cajero toca "vincular" en el dashboard (un tap); (3) si la FAC sincronizada trae algún campo de referencia/descripción del POS, usarlo. **Probar con datos reales qué campos trae la FAC.**

**Riesgo de factura emitida sin pago.** En 7a/7b el orden es pago→factura (el cajero factura cuando ya ve PAGADO), así que el riesgo desaparece — este es otro motivo para preferir ese orden operativo. Solo si el restaurante insiste en facturar antes del pago existe la ventana de no-pago, que es exactamente la misma que tiene hoy con el datáfono.

## Qué probar esta semana (con tu cuenta Contífico, ~1 día)

1. `POST /persona` por API → ¿aparece el cliente en el POS desktop al instante? (pedir a soporte activar "sincronización continua").
2. Facturar en el POS desktop → ¿en cuántos segundos aparece la FAC por API? ¿Qué campos trae (detalles, referencia, mesa, vendedor)?
3. Registrar un cobro vía API sobre esa FAC originada en POS → ¿lo acepta? ¿El POS lo refleja? (Si la API no lo permite, ¿la nube web sí? — el asesor dijo "desde la nube").
4. Facturar en POS seleccionando el cliente creado por API → ¿la factura electrónica sale con esos datos al SRI?

Si 1 y 4 pasan (casi seguro — confirmado por soporte), 7b es viable ya. Si 2 y 3 pasan, 7c también y tienes cuadre automático.

## Por qué este camino es estratégicamente mejor de lo que parece

- **El pitch no cambia:** "el guest paga en mesa con QR, con split y propina, y tu contabilidad cuadra sola". Solo cambia el orden interno de los eventos.
- **El cajero factura MENOS estresado**, no más: factura cuando la mesa ya pagó, sin gestionar datáfono ni esperar vueltos.
- **Funciona igual para Siigo, Practicis o cualquier POS** cuyo único evento cloud sea la factura — el `POSAdapter` de flujo invertido es más universal que el de precuentas.
- **MesitaQR sigue sin ser POS:** no emite facturas, no maneja inventario, no toca el SRI. Captura el pago y empuja datos donde el POS los necesita.

---

## Cambios mínimos al producto para soportar esto

1. Campo/modo por restaurante: `companion` (manual) vs `pos-integrated` (ya casi existe: `posProvider null/no-null`).
2. Restaurar creación manual de cuentas (historial de git) + pantalla "cuenta rápida" del mesero.
3. El bill manual setea `posTotal` con el total digitado → todo el pipeline de pagos exactos ya construido funciona idéntico.
4. Badge en el dashboard: cuentas "manuales" vs "del POS" para que la data del piloto distinga ambos flujos.
