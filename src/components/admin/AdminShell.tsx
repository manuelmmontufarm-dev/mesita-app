"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { label: "Resumen", href: "/admin", icon: LayoutDashboard },
  { label: "Restaurantes", href: "/admin#restaurantes", icon: Building2 },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") return children;

  return (
    <div className="min-h-screen bg-[var(--paper)] lg:flex">
      <aside className="border-b border-black/[0.07] bg-[#F0EDE8] lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:flex-shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:border-b lg:border-black/[0.07] lg:px-5 lg:py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9CA3AF]">
              Mesita<span className="text-[var(--emerald)]">QR</span>
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink-800)]">
              <ShieldCheck className="h-4 w-4 text-[var(--emerald)]" />
              Control de plataforma
            </div>
          </div>
          <span className="pill pill-success lg:mt-3">Super admin</span>
        </div>

        <nav className="overflow-x-auto px-2 py-2 lg:flex-1 lg:overflow-y-auto lg:px-0">
          <ul className="flex min-w-max gap-1 lg:block lg:min-w-0 lg:space-y-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active =
                item.label === "Restaurantes"
                  ? pathname.startsWith("/admin/restaurants")
                  : pathname === "/admin";
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex h-10 items-center gap-2.5 rounded-xl px-4 text-[13.5px] font-medium transition-colors lg:rounded-none lg:border-l-2 ${
                      active
                        ? "border-[var(--emerald)] bg-emerald-500/10 text-[#1f7a55]"
                        : "border-transparent text-[#6B7280] hover:bg-black/[0.04] hover:text-[var(--ink-800)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden border-t border-black/[0.07] p-4 lg:block">
          <Link
            href="/admin/login"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-[#6B7280] hover:bg-black/[0.04] hover:text-[var(--ink-800)]"
          >
            <LogOut className="h-4 w-4" />
            Cambiar sesión
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
