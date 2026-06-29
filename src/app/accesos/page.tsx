import {
  Activity,
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Code2,
  CreditCard,
  Database,
  LayoutDashboard,
  MonitorSmartphone,
  Newspaper,
  QrCode,
  ReceiptText,
  RefreshCw,
  ScanLine,
  Server,
  Settings,
  Store,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ChangelogPreview } from "@/components/changes/ChangelogPreview";
import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";

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
        title: "Bitácora de cambios",
        description: "Qué mejoró cada día, explicado desde GitHub.",
        href: `${mesitaBase}/cambios`,
        host: "Mesita",
        icon: Newspaper,
        featured: true,
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

const mesaQrGroup: AccessGroup = {
  title: "QR de las mesas demo",
  description: "Acceso directo al flujo de pago de cada mesa que ya funciona en producción.",
  links: DEMO_TABLE_DEFINITIONS.map((def) => ({
    title: `Mesa ${def.table.name}`,
    description: def.scenarioDescription,
    href: def.slug === "default" ? `${mesitaBase}/pay/demo` : `${mesitaBase}/pay/demo/${def.slug}`,
    host: "QR activo",
    icon: QrCode,
    featured: def.slug === "default",
  })),
};

const linkGroups: AccessGroup[] = [groups[0], mesaQrGroup, groups[1], groups[2]];

const systemNodes = [
  {
    eyebrow: "Operación",
    title: "POS Mesita",
    description: "El mesero administra mesas y órdenes. El POS conserva los documentos fiscales y cobros.",
    href: `${posBase}/index.html`,
    icon: MonitorSmartphone,
    cardClass: "border-violet-300/20 bg-violet-400/10",
    iconClass: "bg-violet-300/15 text-violet-200",
    badgeClass: "text-violet-200/60",
  },
  {
    eyebrow: "Orquestación",
    title: "Motor Mesita",
    description: "La API conecta la mesa, los comensales, el pago y el POS sin exponer credenciales al cliente.",
    href: `${mesitaBase}/dashboard/owner/configuracion`,
    icon: Server,
    cardClass: "border-emerald-300/25 bg-emerald-400/10",
    iconClass: "bg-emerald-300/15 text-emerald-200",
    badgeClass: "text-emerald-200/60",
  },
  {
    eyebrow: "Experiencia",
    title: "App QR del cliente",
    description: "Cada persona abre la cuenta, elige qué pagar, divide consumos, agrega propina y confirma.",
    href: `${mesitaBase}/pay/demo`,
    icon: ScanLine,
    cardClass: "border-orange-300/20 bg-orange-400/10",
    iconClass: "bg-orange-300/15 text-orange-200",
    badgeClass: "text-orange-200/60",
  },
] as const;

const paymentSteps = [
  {
    title: "El cliente paga",
    description: "Mesita valida el monto, los ítems seleccionados y el estado compartido de la mesa.",
    icon: CreditCard,
  },
  {
    title: "Se registra el evento",
    description: "La actividad y el avance de la cuenta quedan disponibles para los otros comensales.",
    icon: Activity,
  },
  {
    title: "El POS recibe el cobro",
    description: "La integración crea el documento y registra la referencia del pago Mesita.",
    icon: ReceiptText,
  },
  {
    title: "El dueño ve el resultado",
    description: "Dashboard, mesas y reportes reflejan el pago sin volver a digitarlo.",
    icon: CheckCircle2,
  },
];

const syncCadence = [
  {
    value: "Inmediato",
    title: "Mesa compartida",
    description: "Selecciones, personas y pagos se guardan al confirmar cada acción.",
  },
  {
    value: "Cada 5 s",
    title: "Actividad en vivo",
    description: "El dashboard busca nuevas entradas, aperturas de mesa y pagos.",
  },
  {
    value: "Cada 10 s",
    title: "Estado de mesas",
    description: "La vista de operación refresca ocupación, total y estado de cobro.",
  },
  {
    value: "Cada 12 s",
    title: "Documentos del POS",
    description: "Reportes y reembolsos consultan facturas y cobros sincronizados.",
  },
];

export default function AccesosPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f0] text-[#171714]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-16">
        <header className="mb-8 border-b border-black/10 pb-8 sm:mb-12 sm:pb-10">
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-black/60 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Central de accesos
            </div>
            <a
              href="/cambios"
              className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
              Bitácora de cambios
            </a>
          </div>
          <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-end md:gap-6">
            <div>
              <p className="mb-2 text-sm font-medium text-black/50">Mesita</p>
              <h1 className="max-w-3xl text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
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

        <div className="mb-14 space-y-14">
          {linkGroups.map((group) => (
            <section key={group.title}>
              <div className="mb-5 flex flex-col justify-between gap-1 sm:flex-row sm:items-end">
                <h2 className="text-xl font-semibold tracking-tight">{group.title}</h2>
                <p className="text-sm text-black/50">{group.description}</p>
              </div>

              <div
                className={`grid gap-3 ${
                  group.title === "QR de las mesas demo"
                    ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
                    : "sm:grid-cols-2 lg:grid-cols-3"
                }`}
              >
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

        <ChangelogPreview />

        <section className="mb-12 overflow-hidden rounded-[1.75rem] bg-[#171714] px-4 py-6 text-white shadow-xl sm:mb-16 sm:rounded-[2rem] sm:px-8 sm:py-10">
          <div className="mb-8 flex flex-col justify-between gap-4 border-b border-white/10 pb-7 sm:flex-row sm:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300/70">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Un solo ecosistema
              </div>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Así se conecta todo
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-white/50 sm:text-right">
              Ninguna pantalla trabaja aislada. Mesita mueve la información entre operación, cliente y administración.
            </p>
          </div>

          <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1.08fr_auto_1fr]">
            {systemNodes.map((node, index) => {
              const Icon = node.icon;
              return (
                <div key={node.title} className="contents">
                  <a
                    href={node.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`group flex min-h-0 flex-col justify-between rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:bg-white/[0.08] sm:min-h-56 sm:p-5 ${node.cardClass}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`rounded-xl p-2.5 ${node.iconClass}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                    </div>
                    <div>
                      <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.16em] ${node.badgeClass}`}>
                        {node.eyebrow}
                      </p>
                      <h3 className="text-xl font-semibold tracking-tight">{node.title}</h3>
                      <p className="mt-2 text-sm leading-5 text-white/50">{node.description}</p>
                    </div>
                  </a>

                  {index < systemNodes.length - 1 && (
                    <div className="flex items-center justify-center py-1 text-center lg:px-1 lg:py-0">
                      <div>
                        <span className="hidden text-xl text-emerald-300/70 lg:block">↔</span>
                        <ArrowDown className="mx-auto h-5 w-5 text-emerald-300/70 lg:hidden" aria-hidden="true" />
                        <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.12em] text-white/30">
                          {index === 0 ? "API segura" : "estado vivo"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mx-auto flex w-fit flex-col items-center py-4">
            <div className="h-7 w-px bg-gradient-to-b from-emerald-300/70 to-emerald-300/10" />
            <ArrowDown className="h-4 w-4 text-emerald-300/70" aria-hidden="true" />
          </div>

          <a
            href={`${mesitaBase}/dashboard/owner/panel`}
            target="_blank"
            rel="noreferrer"
            className="group mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border border-sky-300/20 bg-sky-400/10 p-5 transition hover:-translate-y-0.5 hover:bg-sky-400/15 sm:flex-row sm:items-center"
          >
            <span className="w-fit rounded-xl bg-sky-300/15 p-3 text-sky-200">
              <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/60">Lectura central</p>
              <h3 className="mt-1 text-lg font-semibold">Dashboard del dueño</h3>
              <p className="mt-1 text-sm leading-5 text-white/50">
                Reúne mesas, actividad, facturas, pagos, propinas y reportes provenientes de Mesita y del POS.
              </p>
            </div>
            <ArrowUpRight className="h-5 w-5 text-white/25 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
          </a>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-lg bg-white/10 p-2 text-white/70">
                <Database className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">Quién es responsable de cada dato</p>
                <p className="text-xs text-white/40">Una fuente clara evita duplicados y descuadres.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-200/65">POS</p>
                <p className="mt-2 text-sm leading-5 text-white/55">Órdenes, documentos fiscales y cobros registrados.</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-200/65">App QR</p>
                <p className="mt-2 text-sm leading-5 text-white/55">Personas, selección de consumos, división y propina.</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-200/65">Dashboard</p>
                <p className="mt-2 text-sm leading-5 text-white/55">Visualiza y opera; combina el estado en vivo con documentos del POS.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <div className="mb-6 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-black/40">Ejemplo real</p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Qué ocurre cuando alguien paga</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-black/50 sm:text-right">Un pago recorre todo el sistema sin repetir trabajo en caja.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {paymentSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="mb-8 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#171714] text-xs font-semibold text-white">{index + 1}</span>
                    <Icon className="h-5 w-5 text-black/30" aria-hidden="true" />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 text-sm leading-5 text-black/50">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-16 rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-start gap-3">
            <span className="rounded-xl bg-[#f0f0ea] p-2.5 text-black/60">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Cómo se mantiene actualizado</h2>
              <p className="mt-1 text-sm text-black/50">Cada vista refresca según la velocidad que necesita.</p>
            </div>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
            {syncCadence.map((item) => (
              <div key={item.title} className="bg-[#fafaf7] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">{item.value}</p>
                <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-black/50">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-col justify-between gap-2 border-t border-black/10 pt-6 text-xs text-black/40 sm:flex-row">
          <span>Mesita · accesos de producción</span>
          <span>Dominio canónico: mesitademo-two.vercel.app</span>
        </footer>
      </div>
    </main>
  );
}
