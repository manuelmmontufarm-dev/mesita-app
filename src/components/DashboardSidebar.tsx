"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface DashboardSidebarProps {
  restaurantName?: string;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  live?: boolean;
}

const ICON = {
  panel: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  estadisticas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12V8.5M6.5 12V5.5M10 12V7M13.5 12V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  mesas: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 11v2M11 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  menu: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  personal: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6" cy="5.5" r="2.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 13c0-2.2 1.6-3.5 3.5-3.5S9.5 10.8 9.5 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11.5" cy="5" r="1.75" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 13c.3-1.4 1.2-2.2 2.5-2.2 1.1 0 1.9.6 2.3 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  reportes: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12V8.5M6.5 12V5.5M10 12V7M13.5 12V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  config: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1.5v1.8M8 12.7V14.5M1.5 8h1.8M12.7 8H14.5M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  cuenta: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5.5" r="2.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 13.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

const navItems: NavItem[] = [
  { label: "Panel", href: "/dashboard/owner/panel", icon: ICON.panel, live: true },
  { label: "Estadísticas", href: "/dashboard/owner/estadisticas", icon: ICON.estadisticas, live: true },
  { label: "Mesas", href: "/dashboard/owner/mesas", icon: ICON.mesas },
  { label: "Menú", href: "/dashboard/owner/menu", icon: ICON.menu },
  { label: "Personal", href: "/dashboard/owner/personal", icon: ICON.personal },
  { label: "Reportes", href: "/dashboard/owner/reembolsos", icon: ICON.reportes },
  { label: "Configuración", href: "/dashboard/owner/configuracion", icon: ICON.config },
  { label: "Cuenta", href: "/dashboard/owner/cuenta", icon: ICON.cuenta },
];

export function DashboardSidebar({ restaurantName = "La Doña Pepa" }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 240,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#F0EDE8",
        borderRight: "1px solid rgba(0,0,0,0.07)",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          margin: "0 0 10px",
          color: "#9CA3AF",
        }}>
          Mesa<span style={{ color: "#2fb37e" }}>QR</span>
        </p>
        <h1 style={{
          fontSize: 14,
          fontWeight: 600,
          color: "#1F2933",
          margin: "0 0 8px",
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {restaurantName}
        </h1>
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "3px 8px",
          borderRadius: 100,
          background: "rgba(47,179,126,0.14)",
          color: "#1f6b4c",
        }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#2fb37e",
            boxShadow: "0 0 0 2px rgba(47,179,126,0.25)",
            animation: "pulse 2s ease-in-out infinite",
          }} />
          Modo demo
        </span>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.45; }
          }
        `}</style>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "0 16px",
                    height: 40,
                    fontSize: 13.5,
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? "#2fb37e" : "#6B7280",
                    background: isActive ? "rgba(47,179,126,0.11)" : "transparent",
                    textDecoration: "none",
                    transition: "color .15s, background .15s",
                    borderLeft: isActive ? "2px solid #2fb37e" : "2px solid transparent",
                  }}
                >
                  <span style={{ display: "flex", flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.live && (
                    <span
                      title="En vivo"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#2fb37e",
                        flexShrink: 0,
                        boxShadow: "0 0 0 2px rgba(47,179,126,0.22)",
                      }}
                    />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div style={{
        padding: "14px 20px",
        borderTop: "1px solid rgba(0,0,0,0.07)",
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 10px",
          borderRadius: 100,
          background: "rgba(0,0,0,0.06)",
          color: "#6B7280",
        }}>
          Propietario
        </span>
      </div>
    </aside>
  );
}
