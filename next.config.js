import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Deploy demo: el panel del dueño siempre refleja el POS en vivo.
    NEXT_PUBLIC_DEMO_PANEL: process.env.NEXT_PUBLIC_DEMO_PANEL ?? "1",
  },
  experimental: {
    // Tree-shake Radix packages — avoids importing entire namespaces when only
    // a few sub-components are used, reducing bundle size on the guest screen.
    optimizePackageImports: [
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "lucide-react",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

// Wraps the config to enable source-map upload and auto-instrumentation.
// SENTRY_AUTH_TOKEN is only needed at build time for source-map upload — set
// it in Vercel (build-time secret), never commit it. Without it, builds still
// succeed; source maps are just not uploaded (Sentry stack traces stay
// minified until the token is configured).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  // Route Sentry's tunnel through our own domain to avoid ad-blockers
  // dropping client-side events. Adds one rewrite; safe no-op if unused.
  tunnelRoute: "/monitoring",
  webpack: {
    removeDebugLogging: true,
    automaticVercelMonitors: true,
  },
});
