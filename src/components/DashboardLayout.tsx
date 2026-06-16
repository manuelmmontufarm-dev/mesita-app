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
    <div className="flex h-screen bg-background">
      <DashboardSidebar restaurantName={restaurantName} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
