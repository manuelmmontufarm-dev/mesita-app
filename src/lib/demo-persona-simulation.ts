/**
 * Persona-driven demo simulations — "Grandpa" (slow, confused) vs "Child" (fast, chaotic).
 */
import {
  claimDemoItem,
  getDemoTableState,
  joinDemoTable,
  recordDemoPayment,
  releaseDemoItem,
  renameDemoGuest,
  resetDemoTableState,
} from "@/lib/demo-table-store";
import { deriveDemoTableProgress } from "@/lib/guest-billing/demo-table-progress";

export type PersonaKind = "grandpa" | "child";

export interface PersonaFriction {
  personaId: string;
  kind: PersonaKind;
  event: string;
  detail?: string;
}

export interface PersonaRunResult {
  personaId: string;
  kind: PersonaKind;
  frictions: PersonaFriction[];
  completedJoin: boolean;
  completedPay: boolean;
  tableClosed: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FAST = Boolean(process.env.VITEST);

function randBetween(min: number, max: number) {
  if (FAST) return 0;
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function tableProgress(token: string) {
  const state = await getDemoTableState(token);
  const paymentsSub = state.payments.reduce((s, p) => s + p.subtotal, 0);
  return deriveDemoTableProgress({
    items: state.items,
    paidItemIds: state.paidItemIds,
    paidGuestIds: [...new Set(state.payments.map((p) => p.guestId))],
    guestCount: state.guests.length,
    paymentsSubtotal: paymentsSub,
    config: state.restaurant,
  });
}

async function runGrandpa(token: string, index: number): Promise<PersonaRunResult> {
  const personaId = `grandpa-${index}`;
  const deviceId = `device-grandpa-${index}`;
  const frictions: PersonaFriction[] = [];
  let completedJoin = false;
  let completedPay = false;
  let tableClosed = false;
  let guestId = "";

  await sleep(randBetween(800, 2500));

  const join1 = await joinDemoTable(token, { deviceId });
  guestId = join1.guest.id;
  await sleep(120);
  const join2 = await joinDemoTable(token, { guestId, deviceId });
  completedJoin = Boolean(join1.guest.id && join2.guest.id === guestId);
  if (!completedJoin) {
    frictions.push({ personaId, kind: "grandpa", event: "join_failed", detail: "Could not enter table" });
    return { personaId, kind: "grandpa", frictions, completedJoin, completedPay, tableClosed };
  }

  await sleep(randBetween(600, 1800));
  await renameDemoGuest(token, guestId, "Abuelito José María de la Cruz");

  await sleep(randBetween(400, 900));
  await recordDemoPayment(token, {
    guestId,
    guestName: "Abuelito",
    mode: "equal",
    amount: 12.5,
    subtotal: 10,
    iva: 1.5,
    service: 1,
    tip: 0,
    itemIds: [],
    equalPeople: 8,
    method: "card",
  });
  frictions.push({
    personaId,
    kind: "grandpa",
    event: "paid_without_claim",
    detail: "Equal payment accepted before selecting any items",
  });

  await sleep(randBetween(500, 1200));
  await claimDemoItem(token, guestId, "locro");

  await sleep(randBetween(800, 2000));
  const state = await getDemoTableState(token);
  await recordDemoPayment(token, {
    guestId,
    guestName: "Abuelito",
    mode: "equal",
    amount: 5,
    subtotal: 4,
    iva: 0.6,
    service: 0.4,
    tip: 0.4,
    itemIds: [],
    equalPeople: 8,
    method: "card",
  });
  const guest = state.guests.find((g) => g.id === guestId);
  const after = await getDemoTableState(token);
  const updated = after.guests.find((g) => g.id === guestId);
  completedPay = updated?.status === "paid" || updated?.status === "reviewing";
  if (!completedPay && guest) {
    frictions.push({ personaId, kind: "grandpa", event: "pay_failed", detail: "Equal split pay did not register" });
  }

  const progress = await tableProgress(token);
  tableClosed = progress.tableClosed;

  return { personaId, kind: "grandpa", frictions, completedJoin, completedPay, tableClosed };
}

async function runChild(token: string, index: number): Promise<PersonaRunResult> {
  const personaId = `child-${index}`;
  const deviceId = `device-child-${index}`;
  const frictions: PersonaFriction[] = [];
  let completedJoin = false;
  let completedPay = false;
  let tableClosed = false;

  const join = await joinDemoTable(token, { deviceId });
  const guestId = join.guest.id;
  completedJoin = Boolean(guestId);
  if (!completedJoin) {
    frictions.push({ personaId, kind: "child", event: "join_failed" });
    return { personaId, kind: "child", frictions, completedJoin, completedPay, tableClosed };
  }

  const names = ["Pepe", "Juanito", "Ana", "Lulu", "Mateo"];
  for (let i = 0; i < 5; i++) {
    await renameDemoGuest(token, guestId, names[i % names.length]!);
    await sleep(randBetween(0, 15));
  }

  const items = ["locro", "seco", "encebollado"];
  for (const itemId of items) {
    await claimDemoItem(token, guestId, itemId);
    await sleep(randBetween(0, 10));
    await releaseDemoItem(token, guestId, itemId);
    await sleep(randBetween(0, 10));
    await claimDemoItem(token, guestId, itemId);
  }

  await recordDemoPayment(token, {
    guestId,
    guestName: "Pepe",
    mode: "item",
    amount: 2.5,
    subtotal: 2,
    iva: 0.3,
    service: 0.2,
    tip: 0,
    itemIds: ["locro"],
    itemUnits: { locro: 1 },
    method: "card",
  });

  const after = await getDemoTableState(token);
  const guest = after.guests.find((g) => g.id === guestId);
  completedPay = guest?.status === "paid" || guest?.status === "reviewing";

  const progress = await tableProgress(token);
  tableClosed = progress.tableClosed;

  if (tableClosed && after.payments.length < 3) {
    frictions.push({
      personaId,
      kind: "child",
      event: "table_closed_prematurely",
      detail: "Table closed after partial child payment",
    });
  }

  return { personaId, kind: "child", frictions, completedJoin, completedPay, tableClosed };
}

export async function runPersonaSwarm(
  token: string,
  grandpaCount = 20,
  childCount = 20,
): Promise<PersonaRunResult[]> {
  await resetDemoTableState(token);
  const results: PersonaRunResult[] = [];

  for (let i = 1; i <= grandpaCount; i++) {
    results.push(await runGrandpa(token, i));
  }

  await resetDemoTableState(token);

  for (let i = 1; i <= childCount; i++) {
    results.push(await runChild(token, i));
  }

  return results;
}

export function buildPersonaRecommendations(results: PersonaRunResult[]): string[] {
  const recs: string[] = [];
  const grandpaFrictions = results.filter((r) => r.kind === "grandpa").flatMap((r) => r.frictions);
  const childFrictions = results.filter((r) => r.kind === "child").flatMap((r) => r.frictions);

  const joinFails = results.filter((r) => !r.completedJoin).length;
  if (joinFails > 0) {
    recs.push(
      `${joinFails} personas failed to join — add retry toast on lobby "Entrar" and surface CAS conflict copy instead of generic 500.`,
    );
  }

  if (grandpaFrictions.some((f) => f.event === "paid_without_claim")) {
    recs.push(
      'Grandpas often pay before claiming items — block pay CTA until at least one item/share is selected, with plain Spanish: "Elige qué vas a pagar primero".',
    );
  }

  if (grandpaFrictions.some((f) => f.event === "pay_failed")) {
    recs.push(
      'Equal-split pay fails when party size is wrong — show live "Tu parte: $X de Y personas" and cap people at diners at table.',
    );
  }

  recs.push(
    'Grandpa double-taps Enter — debounce lobby button 600ms and show "Entrando…" spinner (idempotent join already OK server-side).',
  );

  recs.push(
    "Long names truncate badly — limit name field to 24 chars with ellipsis preview on roster chips.",
  );

  if (childFrictions.some((f) => f.event === "table_closed_prematurely")) {
    recs.push(
      'Rapid claim/release can close table early — keep partial-pay guardrails; show "Mesa aún abierta" banner until server confirms FULLY_PAID.',
    );
  }

  recs.push(
    "Children rename constantly — persist display name only after 1s debounce; animate chip updates gently to avoid layout jump.",
  );

  recs.push(
    "Child taps items faster than server — keep dish-level loading spinner until claim ACK (already shipped; verify on 3G throttle).",
  );

  recs.push(
    'Grandpa picks 8 people in equal mode alone — default people=2 and suggest "¿Cuántos van a dividir?" with stepper min 2 max guests joined.',
  );

  recs.push(
    "Both personas: success screen should not appear until `tableClosed` from server — never from client-only math.",
  );

  recs.push(
    "Lobby: larger touch target on green CTA (min 52px height) and haptic-free confirmation line for older users.",
  );

  return recs;
}
