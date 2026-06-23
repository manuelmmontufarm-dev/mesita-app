/**
 * Shared presentational primitives for the customer flow stages:
 * the `Ic` icon set, `LogoMark`, and `Avatar` / `AvatarStack`.
 *
 * Ported from `design_handoff_customer/customer/{ui,assets/icons}.jsx`.
 */

import { useEffect, useRef, useState } from "react";

import type { Claims, ItemId, MemberId, TableMember } from "@/lib/guest-billing/types";
import {
  avatarColor,
  AVATAR_HUE_YOU,
  memberPillLabel,
  NAME_PILL_MAX,
  resolveClaimantMember,
  unitsOf,
} from "@/lib/guest-billing/split-math";

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
  scale: ({ s = 48 }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="M3 7l2-3h2l-2 3zM19 7l-2-3h-2l2 3z" />
      <path d="M4 17h6l-1 4H5l-1-4zM14 17h6l-1 4h-4l-1-4z" />
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

/* ── name pills (cylinders) ─────────────────────────────────── */

export function NamePill({
  label,
  name,
  member,
  size = 30,
  maxChars = NAME_PILL_MAX,
}: {
  label?: string;
  name?: string;
  member?: { name?: string; initials?: string; hue?: number; isYou?: boolean } | null;
  size?: number;
  maxChars?: number;
}) {
  const m = member ?? {};
  const text = label ?? memberPillLabel(m, name, maxChars);
  const len = text.length;
  const scale =
    len > 9 ? 0.32 : len > 7 ? 0.34 : len > 5 ? 0.36 : len > 3 ? 0.38 : 0.4;
  const fontSize = Math.max(12, Math.round(size * scale));

  return (
    <div
      className={"av av-pill expanded" + (m.isYou ? " you" : "")}
      style={{
        ["--av-size" as string]: `${size}px`,
        height: size,
        fontSize,
        background: avatarColor(m.hue ?? (m.isYou ? AVATAR_HUE_YOU : 14)),
      }}
      title={text}
    >
      {text}
    </div>
  );
}

/** @deprecated Use NamePill — kept as alias for gradual migration. */
export function Avatar({
  member,
  size = 38,
  name,
  label,
}: {
  member: { name?: string; initials?: string; hue?: number; isYou?: boolean } | null;
  size?: number;
  name?: string;
  label?: string;
}) {
  return (
    <NamePill member={member} size={size} name={name} label={label} />
  );
}

export function AvatarStack({
  ids,
  roster,
  size = 30,
  max = 3,
  youId,
  youName,
}: {
  ids: readonly MemberId[];
  roster: readonly TableMember[];
  size?: number;
  max?: number;
  youId?: MemberId;
  youName?: string;
}) {
  const shown = ids.slice(0, max);
  const extra = ids.length - shown.length;
  return (
    <div className="av-stack">
      {shown.map((id) => {
        const member = resolveClaimantMember(id, roster, youId, youName);
        return (
          <NamePill
            key={id}
            member={member}
            name={youId === id ? youName : undefined}
            size={size}
          />
        );
      })}
      {extra > 0 && (
        <span className="av-more" style={{ width: size, height: size }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/** Small overlapping avatar dot (First Page roster / owner chips). */
export function AvatarDot({
  member,
  name,
  size = 18,
}: {
  member?: { initials?: string; hue?: number; isYou?: boolean } | null;
  name?: string;
  size?: number;
}) {
  const m = member ?? {};
  const label =
    m.initials ??
    (name ? name.slice(0, 2).toUpperCase() : "?");
  return (
    <span
      className={"avatar-dot" + (m.isYou ? " you" : "")}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.38)),
        background: avatarColor(m.hue ?? (m.isYou ? AVATAR_HUE_YOU : 14)),
      }}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

/** Gray capsule with mini avatars + claimant label on item rows. */
export function OwnerChip({
  ids,
  roster,
  youId,
  youName,
  emphasize = false,
}: {
  ids: readonly MemberId[];
  roster: readonly TableMember[];
  youId?: MemberId;
  youName?: string;
  emphasize?: boolean;
}) {
  if (ids.length === 0) return null;
  const emphasizeCls = emphasize ? " owner-chip-emphasize" : "";
  if (ids.length === 1 && ids[0] === youId) {
    const member = resolveClaimantMember(ids[0], roster, youId, youName);
    const label = memberPillLabel(member, youName, 10);
    return (
      <span className={"owner-chip owner-chip-you" + emphasizeCls}>
        <span className="owner-chip-avs">
          <AvatarDot member={member} name={youName} size={18} />
        </span>
        <span className="owner-chip-label">{label}</span>
      </span>
    );
  }

  const shown = ids.slice(0, 3);
  const extra = ids.length - shown.length;
  const label =
    ids.length > 1
      ? "compartido"
      : memberPillLabel(
          resolveClaimantMember(ids[0], roster, youId, youName),
          youId === ids[0] ? youName : undefined,
          8,
        );

  return (
    <span className={"owner-chip" + emphasizeCls}>
      <span className="owner-chip-avs">
        {shown.map((id) => {
          const member = resolveClaimantMember(id, roster, youId, youName);
          return (
            <AvatarDot
              key={id}
              member={member}
              name={youId === id ? youName : undefined}
              size={18}
            />
          );
        })}
        {extra > 0 && <span className="owner-chip-more">+{extra}</span>}
      </span>
      <span className="owner-chip-label">{label}</span>
    </span>
  );
}

/** Compact split bar on bill rows when a dish is shared between guests. */
export function SharedPortionStrip({
  itemId,
  itemQty,
  claimants,
  claims,
  roster,
  youId,
  youName,
}: {
  itemId: ItemId;
  itemQty: number;
  claimants: readonly MemberId[];
  claims: Claims;
  roster: readonly TableMember[];
  youId?: MemberId;
  youName?: string;
}) {
  if (claimants.length < 2) return null;
  const total = Math.max(itemQty, 0.001);

  return (
    <div className="item-share-strip" data-testid="item-share-strip">
      <div className="item-share-bar" aria-hidden="true">
        {claimants.map((id) => {
          const u = unitsOf(claims, itemId, id);
          const member = resolveClaimantMember(id, roster, youId, youName);
          return (
            <span
              key={id}
              className="item-share-seg"
              style={{ flexGrow: Math.max(u, 0.001) }}
              title={memberPillLabel(member, youId === id ? youName : undefined, 12)}
            >
              <AvatarDot
                member={member}
                name={youId === id ? youName : undefined}
                size={16}
              />
            </span>
          );
        })}
      </div>
      <span className="item-share-meta">
        Entre {claimants.length}
        {claimants.map((id) => {
          const pct = Math.round((unitsOf(claims, itemId, id) / total) * 100);
          const member = resolveClaimantMember(id, roster, youId, youName);
          const short = memberPillLabel(member, youId === id ? youName : undefined, 8);
          return ` · ${short} ${pct}%`;
        })}
      </span>
    </div>
  );
}

/** Overlapping circles for "En la mesa" roster (no names). */
export function TableRosterCompact({
  members,
  max = 4,
  size = 26,
}: {
  members: readonly TableMember[];
  max?: number;
  size?: number;
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  if (shown.length === 0) return null;

  return (
    <div className="table-roster-compact" aria-label={`${members.length} en la mesa`}>
      <span className="table-roster-label">En la mesa</span>
      <div className="table-roster-dots">
        {shown.map((m) => (
          <AvatarDot key={m.id} member={m} size={size} />
        ))}
        {extra > 0 && (
          <span
            className="table-roster-more"
            style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
          >
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── equal-split visual (shared segments + avatars) ─────────── */

export function EqualShareVisual({
  members,
  people,
  perPersonLabel,
  compact = false,
}: {
  members: readonly TableMember[];
  people: number;
  perPersonLabel: string;
  compact?: boolean;
}) {
  const slots = Math.max(1, people);
  const shownMembers = members.slice(0, slots);
  const extraPeople = Math.max(0, slots - shownMembers.length);
  const pillSize = compact ? 30 : 38;

  return (
    <div
      className={"equal-share-visual" + (compact ? " compact" : "")}
      aria-hidden="true"
    >
      <div className="equal-share-avatars">
        {shownMembers.map((m) => (
          <div key={m.id} className="equal-share-slot">
            <NamePill member={m} size={pillSize} />
          </div>
        ))}
        {extraPeople > 0 && (
          <div className="equal-share-slot">
            <span className="equal-share-more">+{extraPeople}</span>
          </div>
        )}
      </div>
      <div className="equal-share-bar" style={{ gridTemplateColumns: `repeat(${slots}, 1fr)` }}>
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className="equal-share-seg" />
        ))}
      </div>
      <div className="equal-share-amt">{perPersonLabel}</div>
      {!compact && (
        <p className="equal-share-copy">
          {slots} persona{slots !== 1 ? "s" : ""} · lo mismo para cada quien
        </p>
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
