/**
 * Playful post-pay badges for shared-table checkout.
 * Computed from server payment records (demo Redis / live session).
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
  flash: {
    id: "flash",
    emoji: "⚡",
    title: "Flash",
    subtitle: "Pagaste en menos de 2 min desde el primero.",
  },
  snailMail: {
    id: "snail-mail",
    emoji: "📮",
    title: "Correo marino",
    subtitle: "Tu pago llegó cuando ya casi no quedaba mesa.",
  },
} as const satisfies Record<string, PayerBadge>;

function byTime(a: PaymentForBadges, b: PaymentForBadges): number {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function pushBadge(map: Map<string, PayerBadge[]>, guestId: string, badge: PayerBadge) {
  const list = map.get(guestId) ?? [];
  if (list.some((b) => b.id === badge.id)) return;
  map.set(guestId, [...list, badge]);
}

/** Assign fun badges per guest. `final` = table closed — unlocks "el más lento". */
export function assignPayerBadges(
  payments: readonly PaymentForBadges[],
  opts?: { final?: boolean },
): GuestBadgeAward[] {
  if (!payments.length) return [];

  const sorted = [...payments].sort(byTime);
  const byGuest = new Map<string, PayerBadge[]>();
  const nameByGuest = new Map(sorted.map((p) => [p.guestId, p.guestName]));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  pushBadge(byGuest, first.guestId, BADGE.fastest);

  if (opts?.final && sorted.length >= 2 && last.guestId !== first.guestId) {
    pushBadge(byGuest, last.guestId, BADGE.slowest);
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
  } else if (sorted.length === 1) {
    pushBadge(byGuest, first.guestId, BADGE.mrMoney);
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

  if (sorted.length >= 2) {
    const t0 = new Date(first.createdAt).getTime();
    for (const p of sorted) {
      const delta = new Date(p.createdAt).getTime() - t0;
      if (delta <= 2 * 60 * 1000) pushBadge(byGuest, p.guestId, BADGE.flash);
      if (opts?.final && p.guestId === last.guestId && delta >= 5 * 60 * 1000) {
        pushBadge(byGuest, p.guestId, BADGE.snailMail);
      }
    }
  }

  return sorted
    .map((p) => p.guestId)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((guestId) => ({
      guestId,
      guestName: nameByGuest.get(guestId) ?? "Persona",
      badges: byGuest.get(guestId) ?? [],
    }))
    .filter((row) => row.badges.length > 0);
}

export function badgesForGuest(
  awards: readonly GuestBadgeAward[],
  guestId: string,
): PayerBadge[] {
  return awards.find((a) => a.guestId === guestId)?.badges ?? [];
}
