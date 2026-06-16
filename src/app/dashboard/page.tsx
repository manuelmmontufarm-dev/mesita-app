"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardIndex() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.user?.role === "OWNER") router.replace("/dashboard/owner");
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FFFDF9] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#E86A33] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#6B7280]">Cargando...</p>
      </div>
    </div>
  );
}
