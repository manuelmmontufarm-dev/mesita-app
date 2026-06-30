"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./DashboardSidebar";
import { LiveActivityBar } from "./LiveActivityBar";
import { isOwnerReadOnlyClient } from "@/lib/owner-mode";

interface DashboardLayoutProps {
  children: ReactNode;
  restaurantName?: string;
}

export function DashboardLayout({
  children,
  restaurantName = "MesaQR"
}: DashboardLayoutProps) {
  const pathname = usePathname();

  if (pathname.endsWith("/companion")) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen" style={{ background: "var(--paper)" }}>
      <DashboardSidebar restaurantName={restaurantName} />

      <main className="flex-1 overflow-y-auto" style={{ background: "var(--paper)" }}>
        <div className="max-w-6xl mx-auto p-8">
          {isOwnerReadOnlyClient() && (
            <div
              role="note"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                marginBottom: 16,
                borderRadius: 12,
                background: "rgba(232,106,51,.10)",
                border: "1px solid rgba(232,106,51,.25)",
                color: "#c45a1a",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span aria-hidden="true">🔒</span>
              Panel en modo solo-lectura — solo muestra y reporta. La edición de menú,
              mesas y configuración está deshabilitada.
            </div>
          )}
          <LiveActivityBar />
          {children}
        </div>
      </main>
    </div>
  );
}
