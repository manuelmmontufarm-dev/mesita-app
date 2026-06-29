"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./DashboardSidebar";

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
          {children}
        </div>
      </main>
    </div>
  );
}
