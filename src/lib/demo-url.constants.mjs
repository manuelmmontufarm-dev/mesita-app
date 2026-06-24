/**
 * Single source of truth for the public demo URL.
 * Imported by Node scripts (.mjs) and TypeScript (qr-utils / demo-url.ts).
 *
 * QRs, PDF pack, .env.example, and CLAUDE.md all point here.
 * Override only via NEXT_PUBLIC_DEMO_PAY_URL / NEXT_PUBLIC_APP_URL when
 * explicitly testing another host — never for printed QRs.
 */

/** @type {const} */
export const CANONICAL_APP_URL = "https://mesitademo-two.vercel.app";

/** @type {const} */
export const CANONICAL_DEMO_PAY_URL = `${CANONICAL_APP_URL}/pay/demo`;

/** @type {const} */
export const CANONICAL_DEMO_PAY_DEBUG_URL = `${CANONICAL_DEMO_PAY_URL}?debug=1`;

/** Vercel project name that owns the canonical domain (mesitademo-two.vercel.app). */
export const CANONICAL_VERCEL_PROJECT = "mesitademo";

/**
 * Legacy / duplicate Vercel projects from re-importing the same GitHub repo.
 * Do not print QRs or share these — they triple-build on every push.
 */
export const LEGACY_VERCEL_PROJECTS = ["mesita-demo", "mesita_app_demo"];

/** Public hostnames that are NOT the canonical demo (for docs / linting). */
export const LEGACY_DEMO_HOSTS = [
  "mesita-demo.vercel.app",
  "mesitaappdemo.vercel.app",
  "mesitademo.vercel.app",
];
