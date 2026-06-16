"use client";

import { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}
