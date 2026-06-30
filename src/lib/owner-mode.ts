/**
 * Modo solo-lectura del panel del dueño.
 *
 * Cuando está activo, el dashboard del dueño SOLO muestra y reporta:
 * el menú, las mesas, la configuración fiscal/POS, el personal, los
 * reembolsos y las acciones del companion quedan deshabilitados tanto en
 * la UI (botones ocultos / formularios disabled) como en la API (403).
 *
 * Se controla con dos flags (defensa en profundidad):
 *   - OWNER_READONLY=1            → guard del lado servidor (rutas API)
 *   - NEXT_PUBLIC_OWNER_READONLY=1 → UI (oculta/disable controles)
 *
 * Por defecto el demo va en solo-lectura salvo que se ponga explícitamente "0".
 */

/** Server-side: ¿deben las rutas de mutación del dueño responder 403? */
export function isOwnerReadOnly(): boolean {
  const v = process.env.OWNER_READONLY ?? process.env.NEXT_PUBLIC_OWNER_READONLY ?? "1";
  return v !== "0" && v !== "false";
}

/** Client-side: ¿debe la UI ocultar/disable los controles de mutación? */
export function isOwnerReadOnlyClient(): boolean {
  const v = process.env.NEXT_PUBLIC_OWNER_READONLY ?? "1";
  return v !== "0" && v !== "false";
}

/** Respuesta estándar 403 para rutas de mutación bloqueadas en modo solo-lectura. */
export function ownerReadOnlyResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "El panel del dueño está en modo solo-lectura: solo muestra y reporta.",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}
