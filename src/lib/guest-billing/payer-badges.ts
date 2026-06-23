/**
 * Playful post-pay badges for shared-table checkout.
 * One badge per guest — conversational quip, not a leaderboard widget.
 */

export interface PaymentForBadges {
  guestId: string;
  guestName: string;
  amount: number;
  tip: number;
  mode: "item" | "equal" | "todo";
  createdAt: string;
  itemCount?: number;
}

export interface PayerBadge {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

export interface GuestBadgeAward {
  guestId: string;
  guestName: string;
  badges: PayerBadge[];
}

const BADGE = {
  fastest: {
    id: "fastest",
    emoji: "🏃",
    title: "El más rápido",
    subtitle: "Fuiste el primero en pagar. Sin miedo al éxito.",
  },
  slowest: {
    id: "slowest",
    emoji: "🐢",
    title: "El más lento",
    subtitle: "Llegaste tarde… pero con estilo. La mesa te esperó.",
  },
  mrMoney: {
    id: "mr-money",
    emoji: "💸",
    title: "Mr. Money",
    subtitle: "El monto más alto de la mesa. Respeto.",
  },
  saver: {
    id: "saver",
    emoji: "🪙",
    title: "El ahorrador",
    subtitle: "Pagaste menos que todos. Eficiencia pura.",
  },
  generous: {
    id: "generous",
    emoji: "💚",
    title: "Generoso/a",
    subtitle: "La propina más generosa. El mesero te ama.",
  },
  todoKing: {
    id: "todo-king",
    emoji: "👑",
    title: "Rey de la mesa",
    subtitle: "Pagaste TODO de un jalón. Leyenda.",
  },
  splitter: {
    id: "splitter",
    emoji: "🤝",
    title: "Team iguales",
    subtitle: "Partes iguales, cero drama. Paz en la mesa.",
  },
  picky: {
    id: "picky",
    emoji: "🍽️",
    title: "Pickypicker",
    subtitle: "Plato por plato. Sabes lo que quieres.",
  },
  snailMail: {
    id: "snail-mail",
    emoji: "📮",
    title: "Correo marino",
    subtitle: "Tu pago llegó cuando ya casi no quedaba mesa.",
  },
  soloCloser: {
    id: "solo-closer",
    emoji: "🎯",
    title: "Cerraste la cuenta",
    subtitle: "Pagaste tú solo toda la mesa. Nadie más se animó.",
  },
  soloSnacc: {
    id: "solo-snacc",
    emoji: "🥟",
    title: "Modo antojo",
    subtitle: "Fuiste plato por plato. Cero prisa, cero drama.",
  },
  soloTipper: {
    id: "solo-tipper",
    emoji: "✨",
    title: "Buena vibra",
    subtitle: "Dejaste propina con ganas. El mesero sonríe.",
  },
  soloEqual: {
    id: "solo-equal",
    emoji: "⚖️",
    title: "Partes iguales, solo tú",
    subtitle: "Dividiste la cuenta… contigo mismo. Matemáticas impecables.",
  },
} as const satisfies Record<string, PayerBadge>;

/** Highest-priority badge id wins when multiple apply. */
const BADGE_PRIORITY = [
  "slowest",
  "fastest",
  "todo-king",
  "solo-closer",
  "mr-money",
  "generous",
  "solo-tipper",
  "picky",
  "solo-snacc",
  "splitter",
  "solo-equal",
  "saver",
  "snail-mail",
] as const;

const SOLO_BADGE_PRIORITY = [
  "todo-king",
  "solo-closer",
  "generous",
  "solo-tipper",
  "picky",
  "solo-snacc",
  "solo-equal",
  "mr-money",
] as const;

function byTime(a: PaymentForBadges, b: PaymentForBadges): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function pushBadge(map: Map<string, PayerBadge[]>, guestId: string, badge: PayerBadge) {
  const list = map.get(guestId) ?? [];
  if (list.some((b) => b.id === badge.id)) return;
  map.set(guestId, [...list, badge]);
}

function pickPrimaryBadge(
  candidates: readonly PayerBadge[],
  soloTable: boolean,
): PayerBadge[] {
  if (!candidates.length) return [];
  const order = soloTable ? SOLO_BADGE_PRIORITY : BADGE_PRIORITY;
  for (const id of order) {
    const hit = candidates.find((b) => b.id === id);
    if (hit) return [hit];
  }
  return [candidates[0]!];
}

function assignSoloBadges(
  sorted: readonly PaymentForBadges[],
  byGuest: Map<string, PayerBadge[]>,
) {
  const guestId = sorted[0]?.guestId;
  if (!guestId) return;

  const totalPaid = sorted.reduce((s, p) => s + p.amount, 0);
  const totalTip = sorted.reduce((s, p) => s + p.tip, 0);
  const last = sorted[sorted.length - 1]!;
  const modes = new Set(sorted.map((p) => p.mode));

  if (modes.has("todo") || last.mode === "todo") {
    pushBadge(byGuest, guestId, BADGE.todoKing);
  }
  if (sorted.length >= 2) {
    pushBadge(byGuest, guestId, BADGE.soloCloser);
  }
  if (totalTip > 0.5) {
    pushBadge(byGuest, guestId, BADGE.soloTipper);
  }
  if (last.mode === "item" || modes.has("item")) {
    pushBadge(byGuest, guestId, BADGE.soloSnacc);
    pushBadge(byGuest, guestId, BADGE.picky);
  }
  if (last.mode === "equal" || modes.has("equal")) {
    pushBadge(byGuest, guestId, BADGE.soloEqual);
  }
  if (totalPaid > 0.01) {
    pushBadge(byGuest, guestId, BADGE.mrMoney);
  }
}

/** Assign one fun badge per guest. `final` = table closed — unlocks "el más lento". */
export function assignPayerBadges(
  payments: readonly PaymentForBadges[],
  opts?: { final?: boolean },
): GuestBadgeAward[] {
  if (!payments.length) return [];

  const sorted = [...payments].sort(byTime);
  const byGuest = new Map<string, PayerBadge[]>();
  const nameByGuest = new Map(sorted.map((p) => [p.guestId, p.guestName]));
  const uniqueGuests = new Set(sorted.map((p) => p.guestId));
  const soloTable = uniqueGuests.size === 1;

  if (soloTable) {
    assignSoloBadges(sorted, byGuest);
  } else {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    pushBadge(byGuest, first.guestId, BADGE.fastest);

    if (opts?.final && sorted.length >= 2 && last.guestId !== first.guestId) {
      pushBadge(byGuest, last.guestId, BADGE.slowest);
      const t0 = new Date(first.createdAt).getTime();
      const delta = new Date(last.createdAt).getTime() - t0;
      if (delta >= 5 * 60 * 1000) {
        pushBadge(byGuest, last.guestId, BADGE.snailMail);
      }
    }

    if (sorted.length >= 2) {
      const maxAmt = Math.max(...sorted.map((p) => p.amount));
      const minAmt = Math.min(...sorted.map((p) => p.amount));
      for (const p of sorted) {
        if (p.amount >= maxAmt - 0.001) pushBadge(byGuest, p.guestId, BADGE.mrMoney);
        if (p.amount <= minAmt + 0.001 && maxAmt - minAmt > 0.5) {
          pushBadge(byGuest, p.guestId, BADGE.saver);
        }
      }
    }

    const withTip = sorted.filter((p) => p.tip > 0.001);
    if (withTip.length) {
      const maxTip = Math.max(...withTip.map((p) => p.tip));
      for (const p of withTip) {
        if (p.tip >= maxTip - 0.001) pushBadge(byGuest, p.guestId, BADGE.generous);
      }
    }

    for (const p of sorted) {
      if (p.mode === "todo") pushBadge(byGuest, p.guestId, BADGE.todoKing);
      if (p.mode === "equal") pushBadge(byGuest, p.guestId, BADGE.splitter);
      if (p.mode === "item") pushBadge(byGuest, p.guestId, BADGE.picky);
    }
  }

  return [...uniqueGuests].map((guestId) => ({
    guestId,
    guestName: nameByGuest.get(guestId) ?? "Persona",
    badges: pickPrimaryBadge(byGuest.get(guestId) ?? [], soloTable),
  })).filter((row) => row.badges.length > 0);
}

export function badgesForGuest(
  awards: readonly GuestBadgeAward[],
  guestId: string,
): PayerBadge[] {
  return awards.find((a) => a.guestId === guestId)?.badges ?? [];
}
