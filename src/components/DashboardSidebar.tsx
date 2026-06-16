"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface DashboardSidebarProps {
  restaurantName?: string;
}

const navItems = [
  { label: "Restaurante", href: "/dashboard/owner/restaurant" },
  { label: "Mesas", href: "/dashboard/owner/mesas" },
  { label: "Menú", href: "/dashboard/owner/menu" },
  { label: "Personal", href: "/dashboard/owner/personal" },
  { label: "Reembolsos", href: "/dashboard/owner/reembolsos" },
  { label: "Cuenta", href: "/dashboard/owner/cuenta" },
];

export function DashboardSidebar({ restaurantName = "Mi Restaurante" }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 h-screen flex flex-col border-r"
      style={{ background: "#F0EDE8", borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: "#9CA3AF" }}>
          Mesa<span style={{ color: "#2fb37e" }}>QR</span>
        </p>
        <h1 className="text-sm font-medium leading-snug truncate" style={{ color: "#1F2933" }}>
          {restaurantName}
        </h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <ul>
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center px-5 h-10 text-sm font-medium transition-colors rounded-none"
                  style={
                    isActive
                      ? { color: "#2fb37e", background: "rgba(47,179,126,0.12)" }
                      : { color: "#6B7280" }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = "#1F2933";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = "#6B7280";
                  }}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
        <span className="pill pill-muted text-xs" style={{ color: "#6B7280", background: "rgba(0,0,0,0.06)" }}>
          Propietario
        </span>
      </div>
    </aside>
  );
}
