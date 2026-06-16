"use client";

import { ReactNode } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardLayout restaurantName="Mi Restaurante">
      {children}
    </DashboardLayout>
  );
}
