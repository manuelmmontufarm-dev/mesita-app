import {
  CANONICAL_APP_URL,
  CANONICAL_DEMO_PAY_DEBUG_URL,
  CANONICAL_DEMO_PAY_URL,
  CANONICAL_VERCEL_PROJECT,
  LEGACY_DEMO_HOSTS,
  LEGACY_VERCEL_PROJECTS,
} from "./demo-url.constants.mjs";

export {
  CANONICAL_APP_URL,
  CANONICAL_DEMO_PAY_DEBUG_URL,
  CANONICAL_DEMO_PAY_URL,
  CANONICAL_VERCEL_PROJECT,
  LEGACY_DEMO_HOSTS,
  LEGACY_VERCEL_PROJECTS,
};

/** Resolved demo pay URL — env override only when explicitly set. */
export const DEMO_PAY_URL =
  process.env.NEXT_PUBLIC_DEMO_PAY_URL ?? CANONICAL_DEMO_PAY_URL;

/** Resolved app base URL — env override only when explicitly set. */
export const DEMO_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? CANONICAL_APP_URL;

if (
  process.env.NODE_ENV !== "test" &&
  process.env.NEXT_PUBLIC_DEMO_PAY_URL &&
  process.env.NEXT_PUBLIC_DEMO_PAY_URL !== CANONICAL_DEMO_PAY_URL
) {
  console.warn(
    `[demo-url] NEXT_PUBLIC_DEMO_PAY_URL overrides canonical (${CANONICAL_DEMO_PAY_URL}):`,
    process.env.NEXT_PUBLIC_DEMO_PAY_URL,
  );
}
