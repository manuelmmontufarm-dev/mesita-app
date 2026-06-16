'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface MultiGuest {
  guestUuid: string;
  displayName: string;
  guestIndex: number;
  joinedAt: number;
  lastSeen: number;
}

interface GuestPatch {
  displayName?: string;
}

interface UseMultiGuestStateReturn {
  guestUuid: string;
  displayName: string;
  guestIndex: number;
  allGuests: MultiGuest[];
  broadcastUpdate: (patch?: GuestPatch) => void;
}

const GUEST_ID_KEY = 'mesita:guest-uuid';
const STALE_AFTER_MS = 45_000;

function makeGuestUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function storageKey(token: string): string {
  return `mesita:guests:${token}`;
}

function sortGuests(guests: MultiGuest[]): MultiGuest[] {
  return [...guests].sort((a, b) => a.joinedAt - b.joinedAt || a.guestUuid.localeCompare(b.guestUuid));
}

function withIndexes(guests: MultiGuest[]): MultiGuest[] {
  return sortGuests(guests).map((guest, index) => ({
    ...guest,
    guestIndex: index + 1,
    displayName: guest.displayName || `P${index + 1}`,
  }));
}

function readGuests(token: string): MultiGuest[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(storageKey(token));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    return withIndexes(
      parsed
        .filter((guest): guest is MultiGuest => (
          guest &&
          typeof guest.guestUuid === 'string' &&
          typeof guest.joinedAt === 'number' &&
          typeof guest.lastSeen === 'number'
        ))
        .filter(guest => now - guest.lastSeen < STALE_AFTER_MS)
    );
  } catch {
    return [];
  }
}

function writeGuests(token: string, guests: MultiGuest[]): MultiGuest[] {
  const indexed = withIndexes(guests);
  window.localStorage.setItem(storageKey(token), JSON.stringify(indexed));
  return indexed;
}

export function useMultiGuestState(token: string): UseMultiGuestStateReturn {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [guestUuid] = useState(() => {
    if (typeof window === 'undefined') return makeGuestUuid();

    const existing = window.localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;

    const next = makeGuestUuid();
    window.localStorage.setItem(GUEST_ID_KEY, next);
    return next;
  });
  const [allGuests, setAllGuests] = useState<MultiGuest[]>([]);

  const currentGuest = useMemo(
    () => allGuests.find(guest => guest.guestUuid === guestUuid),
    [allGuests, guestUuid]
  );

  const broadcastUpdate = useCallback((patch: GuestPatch = {}) => {
    if (typeof window === 'undefined') return;

    const now = Date.now();
    const existingGuests = readGuests(token);
    const existingGuest = existingGuests.find(guest => guest.guestUuid === guestUuid);
    const nextGuest: MultiGuest = {
      guestUuid,
      displayName: patch.displayName ?? existingGuest?.displayName ?? '',
      guestIndex: existingGuest?.guestIndex ?? existingGuests.length + 1,
      joinedAt: existingGuest?.joinedAt ?? now,
      lastSeen: now,
    };
    const nextGuests = writeGuests(token, [
      ...existingGuests.filter(guest => guest.guestUuid !== guestUuid),
      nextGuest,
    ]);

    setAllGuests(nextGuests);
    channelRef.current?.postMessage({ type: 'mesita-guests-updated' });
  }, [guestUuid, token]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const refresh = () => setAllGuests(readGuests(token));
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(`mesita-guests:${token}`);
      channelRef.current.onmessage = refresh;
    }

    broadcastUpdate();
    const heartbeatId = window.setInterval(() => broadcastUpdate(), 10_000);
    const storageHandler = (event: StorageEvent) => {
      if (event.key === storageKey(token)) refresh();
    };
    window.addEventListener('storage', storageHandler);

    return () => {
      window.clearInterval(heartbeatId);
      window.removeEventListener('storage', storageHandler);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, [broadcastUpdate, token]);

  return {
    guestUuid,
    displayName: currentGuest?.displayName || `P${currentGuest?.guestIndex ?? 1}`,
    guestIndex: currentGuest?.guestIndex ?? 1,
    allGuests,
    broadcastUpdate,
  };
}
