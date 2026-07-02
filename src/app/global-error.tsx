"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Root-level error boundary — catches errors that escape every nested
 * error.tsx, including failures in the root layout itself. Required for
 * React render errors to reach Sentry (App Router only reports errors caught
 * here, not ones swallowed by nested boundaries).
 * https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-render-errors-in-app-router
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
            Algo salió mal
          </h1>
          <p style={{ color: "#666" }}>
            Ocurrió un error inesperado. Intenta recargar la página.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", color: "#999" }}>
              Referencia: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
