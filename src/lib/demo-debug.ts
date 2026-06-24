/**
 * Demo session debug — enable with `?debug=1` or `sessionStorage.setItem('mesita:demo:debug','1')`.
 * Logs sync, names, version guards. On window: `__mesitaDemoDebug.enable()`.
 */

import { guestLabel } from "@/lib/guest-billing/split-math";

export type DemoDebugEvent =
  | "sync:apply"
  | "sync:skip"
  | "sync:reset"
  | "sync:poll"
  | "sync:sse"
  | "join"
  | "rejoin"
  | "rename"
  | "pay"
  | "reset"
  | "name:normalize"
  | "lobby"
  | "error"
  // Phase 0 instrumentation (added for visual-QA regression tracing):
  | "dock:mini"
  | "dock:full"
  | "scroll:bill"
  | "scroll:confirm"
  | "scroll:payment"
  | "receipt:open"
  | "receipt:peek"
  | "receipt:close"
  | "stage:enter"
  | "stage:leave"
  | "claim:add"
  | "claim:release"
  | "claim:split";

export interface DemoDebugEntry {
  ts: number;
  event: DemoDebugEvent;
  message: string;
  data?: Record<string, unknown>;
}

const STORAGE_KEY = "mesita:demo:debug";
const MAX_LOG = 80;

const logBuffer: DemoDebugEntry[] = [];
const listeners = new Set<(entries: readonly DemoDebugEntry[]) => void>();

function notify() {
  for (const fn of listeners) fn(logBuffer);
}

export function isDemoDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "1") return true;
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoDebugEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  if (on) sessionStorage.setItem(STORAGE_KEY, "1");
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function subscribeDemoDebug(
  fn: (entries: readonly DemoDebugEntry[]) => void,
): () => void {
  listeners.add(fn);
  fn(logBuffer);
  return () => listeners.delete(fn);
}

export function getDemoDebugLog(): readonly DemoDebugEntry[] {
  return logBuffer;
}

/** Count join attempts in the current session — duplicates = symptom of races. */
export function getDemoJoinCount(): number {
  return logBuffer.filter((e) => e.event === "join" || e.event === "rejoin").length;
}

export function demoDebug(
  event: DemoDebugEvent,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (!isDemoDebugEnabled()) return;
  const entry: DemoDebugEntry = { ts: Date.now(), event, message, data };
  logBuffer.unshift(entry);
  if (logBuffer.length > MAX_LOG) logBuffer.length = MAX_LOG;
  notify();
  const prefix = `[demo:${event}]`;
  if (data && Object.keys(data).length) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/** Strip legacy "Invitado" — always show Persona N from label when needed. */
export function normalizeGuestDisplayName(
  name: string | null | undefined,
  label: string,
): string {
  const n = (name ?? "").trim();
  const l = label.trim();
  if (!n || n.toLowerCase() === "invitado") {
    return l || guestLabel(1);
  }
  return n;
}

declare global {
  interface Window {
    __mesitaDemoDebug?: {
      enable: () => void;
      disable: () => void;
      log: typeof getDemoDebugLog;
      isOn: typeof isDemoDebugEnabled;
    };
  }
}

if (typeof window !== "undefined") {
  window.__mesitaDemoDebug = {
    enable: () => setDemoDebugEnabled(true),
    disable: () => setDemoDebugEnabled(false),
    log: getDemoDebugLog,
    isOn: isDemoDebugEnabled,
  };
}
