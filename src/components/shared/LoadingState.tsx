"use client";

interface LoadingStateProps {
  /** Visible label under the spinner. Defaults to "Cargando…". */
  label?: string;
  /** Full-viewport centering (guest pages) vs. in-flow block (dashboard panels). */
  fullScreen?: boolean;
}

/**
 * Shared page-level loading state — centered spinner + label.
 */
export function LoadingState({ label = "Cargando…", fullScreen = false }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${
        fullScreen ? "min-h-screen bg-background" : "py-16"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-7 h-7 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--ink-700)", borderTopColor: "transparent" }}
        />
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}

/**
 * Shared skeleton card — label + value placeholder, matches dashboard KPI cards.
 */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: "15px 16px",
        borderRadius: 18,
        background: "var(--surface)",
        border: "1px solid rgba(27,25,22,.08)",
      }}
    >
      <div style={{ width: 80, height: 11, borderRadius: 6, background: "rgba(27,25,22,.07)", marginBottom: 12 }} />
      <div style={{ width: 64, height: 25, borderRadius: 6, background: "rgba(27,25,22,.07)" }} />
    </div>
  );
}
