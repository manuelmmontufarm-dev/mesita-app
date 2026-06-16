import { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Wordmark */}
        <div className="text-center">
          <span
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--ink-900)" }}
          >
            Mesa<span style={{ color: "var(--coral)" }}>QR</span>
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}
