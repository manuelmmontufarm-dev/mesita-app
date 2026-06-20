# Persona UX Recommendations

Simulated **20 Grandpa** personas (slow, double-tap, pay-before-claim, wrong equal split)
and **20 Child** personas (fast rename, rapid claim/release, tiny payments).

## Summary

- Grandpas joined: 20/20
- Children joined: 20/20
- Total friction events: 20

## Recommendations

1. Grandpas often pay before claiming items — block pay CTA until at least one item/share is selected, with plain Spanish: "Elige qué vas a pagar primero".
2. Grandpa double-taps Enter — debounce lobby button 600ms and show "Entrando…" spinner (idempotent join already OK server-side).
3. Long names truncate badly — limit name field to 24 chars with ellipsis preview on roster chips.
4. Children rename constantly — persist display name only after 1s debounce; animate chip updates gently to avoid layout jump.
5. Child taps items faster than server — keep dish-level loading spinner until claim ACK (already shipped; verify on 3G throttle).
6. Grandpa picks 8 people in equal mode alone — default people=2 and suggest "¿Cuántos van a dividir?" with stepper min 2 max guests joined.
7. Both personas: success screen should not appear until `tableClosed` from server — never from client-only math.
8. Lobby: larger touch target on green CTA (min 52px height) and haptic-free confirmation line for older users.
