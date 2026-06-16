/**
 * Shared presentational primitives for the customer flow stages:
 * the `Ic` icon set, `LogoMark`, and `Avatar` / `AvatarStack`.
 *
 * Ported from `design_handoff_customer/customer/{ui,assets/icons}.jsx`.
 */

import { useEffect, useRef, useState } from "react";

import type { MemberId, TableMember } from "@/lib/guest-billing/types";
import { avatarColor } from "@/lib/guest-billing/split-math";

/* ── icons ─────────────────────────────────────────────────── */

export type IconProps = { s?: number; w?: number };

export const Ic = {
  split: ({ s = 19 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3v6a3 3 0 003 3h6a3 3 0 013 3v6M18 3v6M6 21v-6" />
      <path d="M15 6l3-3 3 3M3 18l3 3 3-3M15 18l3 3 3-3" />
    </svg>
  ),
  users: ({ s = 19 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
      <path d="M16 6.2A3 3 0 0118 12M21 19c0-2.2-1.3-3.8-3-4.5" />
    </svg>
  ),
  receipt: ({ s = 19 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  check: ({ s = 16, w = 2 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12.5l5 5 11-11" />
    </svg>
  ),
  bell: ({ s = 14 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  ),
  plus: ({ s = 18 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: ({ s = 18 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
    </svg>
  ),
  lock: ({ s = 18 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  ),
  shield: ({ s = 13 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  chevron: ({ s = 22 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
  card: ({ s = 22 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 9.5h19M6 15h4" />
    </svg>
  ),
  camera: ({ s = 22 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8.5A2 2 0 016 6.5h1.2l1-1.6A1.5 1.5 0 019.5 4.2h5a1.5 1.5 0 011.3.7l1 1.6H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  ),
  arrow: ({ s = 18 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  star: ({ s = 22 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </svg>
  ),
  instagram: ({ s = 22 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
};

/* ── logo ──────────────────────────────────────────────────── */

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.2"
        y="1.2"
        width="29.6"
        height="29.6"
        rx="9"
        fill="rgba(27,23,20,.04)"
        stroke="rgba(27,23,20,.1)"
        strokeWidth="1.2"
      />
      <rect x="6" y="6" width="9" height="9" rx="3" fill="var(--accent)" />
      <rect x="17" y="6" width="9" height="9" rx="3" fill="#1b1714" />
      <rect x="6" y="17" width="9" height="9" rx="3" fill="#1b1714" />
      <rect x="17" y="17" width="9" height="9" rx="3" fill="var(--accent)" />
    </svg>
  );
}

/* ── avatars ───────────────────────────────────────────────── */

export function Avatar({
  member,
  size = 38,
}: {
  member: { initials?: string; hue?: number; isYou?: boolean } | null;
  size?: number;
}) {
  const m = member ?? {};
  return (
    <div
      className={"av" + (m.isYou ? " you" : "")}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: avatarColor(m.hue ?? 14),
      }}
    >
      {m.initials || "?"}
    </div>
  );
}

export function AvatarStack({
  ids,
  roster,
  size = 26,
  max = 3,
}: {
  ids: readonly MemberId[];
  roster: readonly TableMember[];
  size?: number;
  max?: number;
}) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <div className="av-stack">
      {shown.map((id) => (
        <Avatar
          key={id}
          member={roster.find((m) => m.id === id) ?? null}
          size={size}
        />
      ))}
      {extra > 0 && (
        <span className="av-more" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/* ── animated total bump on change ─────────────────────────── */

export function useBumpOnChange(value: number): boolean {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setBump(true);
    const id = setTimeout(() => setBump(false), 440);
    return () => clearTimeout(id);
  }, [value]);
  return bump;
}
