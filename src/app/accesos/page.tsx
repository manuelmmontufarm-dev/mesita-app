import {
  ArrowUpRight,
  Code2,
  CreditCard,
  LayoutDashboard,
  MonitorSmartphone,
  QrCode,
  Settings,
  Store,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";

const mesitaBase = "https://mesitademo-two.vercel.app";
const posBase = "https://mesita-pos.vercel.app";

type AccessLink = {
  title: string;
  description: string;
  href: string;
  host: string;
  icon: LucideIcon;
  featured?: boolean;
};

type AccessGroup = {
  title: string;
  description: string;
  links: AccessLink[];
};

const groups: AccessGroup[] = [
  {
    title: "Abrir rápido",
    description: "Las tres pantallas principales del ecosistema Mesita.",
    links: [
      {
        title: "POS Mesita",
        description: "Punto de venta: mesas, órdenes y cobros.",
        href: `${posBase}/index.html`,
        host: "Vercel",
        icon: MonitorSmartphone,
        featured: true,
      },
      {
        title: "App del cliente",
        description: "Experiencia de pago con QR en modo demo.",
        href: `${mesitaBase}/pay/demo`,
        host: "Vercel",
        icon: CreditCard,
        featured: true,
      },
      {
        title: "Dashboard del dueño",
        description: "Resumen operativo y métricas del restaurante.",
        href: `${mesitaBase}/dashboard/owner/panel`,
        host: "Vercel",
        icon: LayoutDashboard,
        featured: true,
      },
    ],
  },
  {
    title: "Operación del restaurante",
    description: "Accesos directos a las secciones administrativas.",
    links: [
      {
        title: "Mesas",
        description: "Estado y configuración de mesas.",
        href: `${mesitaBase}/dashboard/owner/mesas`,
        host: "Vercel",
        icon: Store,
      },
      {
        title: "Menú",
        description: "Categorías, platos y precios.",
        href: `${mesitaBase}/dashboard/owner/menu`,
        host: "Vercel",
        icon: UtensilsCrossed,
      },
      {
        title: "Personal",
        description: "Equipo y accesos del restaurante.",
        href: `${mesitaBase}/dashboard/owner/personal`,
        host: "Vercel",
        icon: Users,
      },
      {
        title: "Configuración",
        description: "Integraciones y ajustes generales.",
        href: `${mesitaBase}/dashboard/owner/configuracion`,
        host: "Vercel",
        icon: Settings,
      },
      {
        title: "Restaurante",
        description: "Información del establecimiento.",
        href: `${mesitaBase}/dashboard/owner/restaurant`,
        host: "Vercel",
        icon: Store,
      },
      {
        title: "Reembolsos",
        description: "Consulta y gestión de devoluciones.",
        href: `${mesitaBase}/dashboard/owner/reembolsos`,
        host: "Vercel",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "Demo y herramientas",
    description: "Links útiles para pruebas, QR y desarrollo.",
    links: [
      {
        title: "QR de la demo",
        description: "Página para abrir o imprimir el QR.",
        href: `${mesitaBase}/pay/demo/qr`,
        host: "Vercel",
        icon: QrCode,
      },
      {
        title: "Mesa 1",
        description: "Acceso directo al flujo de una mesa demo.",
        href: `${mesitaBase}/pay/demo/mesa-1`,
        host: "Vercel",
        icon: CreditCard,
      },
      {
        title: "Proyecto en Vercel",
        description: "Deployments, logs y configuración del proyecto.",
        href: "https://vercel.com/manuel-montufar-s-projects/mesitademo",
        host: "Vercel",
        icon: LayoutDashboard,
      },
      {
        title: "Código en GitHub",
        description: "Repositorio principal de Mesita.",
        href: "https://github.com/manuelmmontufarm-dev/mesita-app",
        host: "GitHub",
        icon: Code2,
      },
    ],
  },
];

export default function AccesosPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f0] text-[#171714]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <header className="mb-12 border-b border-black/10 pb-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-black/60 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Central de accesos
          </div>
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="mb-2 text-sm font-medium text-black/50">Mesita</p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">
                Todo el restaurante,
                <br />
                sin buscar mil links.
              </h1>
            </div>
            <p className="max-w-sm text-sm leading-6 text-black/55 md:text-right">
              Enlaces canónicos de producción. Los accesos abren en una pestaña nueva para que esta página siempre quede disponible.
            </p>
          </div>
        </header>

        <div className="space-y-14">
          {groups.map((group) => (
            <section key={group.title}>
              <div className="mb-5 flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
                <h2 className="text-xl font-semibold tracking-tight">{group.title}</h2>
                <p className="text-sm text-black/50">{group.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className={`group relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                        link.featured
                          ? "border-[#171714] bg-[#171714] text-white shadow-md"
                          : "border-black/10 bg-white text-[#171714] shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span
                          className={`rounded-xl p-2.5 ${
                            link.featured ? "bg-white/10" : "bg-[#f0f0ea]"
                          }`}
                        >
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <ArrowUpRight className="h-5 w-5 opacity-45 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                      </div>

                      <div>
                        <span
                          className={`mb-2 inline-block text-[10px] font-bold uppercase tracking-[0.16em] ${
                            link.featured ? "text-white/45" : "text-black/40"
                          }`}
                        >
                          {link.host}
                        </span>
                        <h3 className="text-lg font-semibold tracking-tight">{link.title}</h3>
                        <p
                          className={`mt-1 text-sm leading-5 ${
                            link.featured ? "text-white/60" : "text-black/50"
                          }`}
                        >
                          {link.description}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-col justify-between gap-2 border-t border-black/10 pt-6 text-xs text-black/40 sm:flex-row">
          <span>Mesita · accesos de producción</span>
          <span>Dominio canónico: mesitademo-two.vercel.app</span>
        </footer>
      </div>
    </main>
  );
}
