import {
  ArrowDown,
  ArrowUpRight,
  Code2,
  CreditCard,
  LayoutDashboard,
  MonitorSmartphone,
  Newspaper,
  QrCode,
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
import { DemoMesaQrGrid } from "@/components/accesos/DemoMesaQrGrid";

const mesitaBase = "https://mesitademo-two.vercel.app";
const posBase = "https://mesita-pos.vercel.app";

type CompactLink = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const quickLinks: CompactLink[] = [
  { title: "POS Mesita", href: `${posBase}/index.html`, icon: MonitorSmartphone },
  { title: "App cliente", href: `${mesitaBase}/pay/demo`, icon: CreditCard },
  { title: "Dashboard", href: `${mesitaBase}/dashboard/owner/panel`, icon: LayoutDashboard },
  { title: "Mesas", href: `${mesitaBase}/dashboard/owner/mesas`, icon: Store },
  { title: "Menú", href: `${mesitaBase}/dashboard/owner/menu`, icon: UtensilsCrossed },
  { title: "Personal", href: `${mesitaBase}/dashboard/owner/personal`, icon: Users },
  { title: "Configuración", href: `${mesitaBase}/dashboard/owner/configuracion`, icon: Settings },
  { title: "QR demo", href: `${mesitaBase}/pay/demo/qr`, icon: QrCode },
  { title: "GitHub", href: "https://github.com/manuelmmontufarm-dev/mesita-app", icon: Code2 },
];

const systemNodes = [
  {
    eyebrow: "Operación",
    title: "POS Mesita",
    description: "Mesas, órdenes y cobros.",
    href: `${posBase}/index.html`,
    icon: MonitorSmartphone,
    cardClass: "border-violet-300/30 bg-violet-400/10 hover:border-violet-300/50 hover:bg-violet-400/15",
    iconClass: "bg-violet-300/15 text-violet-200",
    badgeClass: "text-violet-200/60",
  },
  {
    eyebrow: "Orquestación",
    title: "Motor Mesita",
    description: "API entre mesa, cliente y POS.",
    href: `${mesitaBase}/dashboard/owner/configuracion`,
    icon: Server,
    cardClass: "border-emerald-300/30 bg-emerald-400/10 hover:border-emerald-300/50 hover:bg-emerald-400/15",
    iconClass: "bg-emerald-300/15 text-emerald-200",
    badgeClass: "text-emerald-200/60",
  },
  {
    eyebrow: "Experiencia",
    title: "App QR del cliente",
    description: "Pago, división y propina por persona.",
    href: `${mesitaBase}/pay/demo`,
    icon: ScanLine,
    cardClass: "border-orange-300/30 bg-orange-400/10 hover:border-orange-300/50 hover:bg-orange-400/15",
    iconClass: "bg-orange-300/15 text-orange-200",
    badgeClass: "text-orange-200/60",
  },
] as const;

function CompactLinkGrid({ links }: { links: CompactLink[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="group flex items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm font-medium shadow-sm transition active:scale-[0.98] hover:border-black/15 hover:shadow-md"
          >
            <Icon className="h-4 w-4 shrink-0 text-black/40 group-hover:text-black/70" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{link.title}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-black/25 group-hover:text-black/60" aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}

export default function AccesosPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f0] text-[#171714]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/55 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Central de accesos
            </div>
            <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Mesita · demo en vivo</h1>
          </div>
          <p className="max-w-xs text-xs leading-5 text-black/45 sm:text-right">
            Toca cualquier tarjeta para abrir. Esta página queda aquí.
          </p>
        </header>

        {/* 1 — Ecosistema */}
        <section className="mb-6 overflow-hidden rounded-[1.5rem] bg-[#171714] px-4 py-5 text-white shadow-xl sm:mb-8 sm:rounded-[1.75rem] sm:px-6 sm:py-7">
          <div className="mb-5 flex flex-col justify-between gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Un solo ecosistema
              </div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Así se conecta todo</h2>
              <p className="mt-1.5 text-xs text-emerald-300/80 sm:text-sm">↓ Toca una tarjeta para abrirla</p>
            </div>
            <p className="max-w-xs text-xs leading-5 text-white/45 sm:text-right">
              Operación, cliente y administración comparten el mismo estado.
            </p>
          </div>

          <div className="grid items-stretch gap-2.5 lg:grid-cols-[1fr_auto_1.08fr_auto_1fr]">
            {systemNodes.map((node, index) => {
              const Icon = node.icon;
              return (
                <div key={node.title} className="contents">
                  <a
                    href={node.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`group flex cursor-pointer flex-col justify-between rounded-xl border-2 p-4 shadow-sm transition duration-150 active:scale-[0.98] sm:p-4 ${node.cardClass}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`rounded-lg p-2 ${node.iconClass}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/70 transition group-hover:bg-white/20 group-hover:text-white">
                        Abrir
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </div>
                    <div className="mt-4">
                      <p className={`mb-1 text-[9px] font-bold uppercase tracking-[0.14em] ${node.badgeClass}`}>
                        {node.eyebrow}
                      </p>
                      <h3 className="text-base font-semibold tracking-tight sm:text-lg">{node.title}</h3>
                      <p className="mt-1 text-xs leading-4 text-white/50 sm:text-sm sm:leading-5">{node.description}</p>
                    </div>
                  </a>

                  {index < systemNodes.length - 1 && (
                    <div className="flex items-center justify-center py-0.5 text-center lg:px-1 lg:py-0">
                      <div>
                        <span className="hidden text-lg text-emerald-300/70 lg:block">↔</span>
                        <ArrowDown className="mx-auto h-4 w-4 text-emerald-300/70 lg:hidden" aria-hidden="true" />
                        <span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.1em] text-white/30">
                          {index === 0 ? "API" : "vivo"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mx-auto flex w-fit flex-col items-center py-2">
            <div className="h-4 w-px bg-gradient-to-b from-emerald-300/70 to-emerald-300/10" />
            <ArrowDown className="h-3.5 w-3.5 text-emerald-300/70" aria-hidden="true" />
          </div>

          <a
            href={`${mesitaBase}/dashboard/owner/panel`}
            target="_blank"
            rel="noreferrer"
            className="group mx-auto flex max-w-2xl cursor-pointer items-center gap-3 rounded-xl border-2 border-sky-300/30 bg-sky-400/10 p-4 transition active:scale-[0.98] hover:border-sky-300/50 hover:bg-sky-400/15"
          >
            <span className="rounded-lg bg-sky-300/15 p-2.5 text-sky-200">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-sky-200/60">Lectura central</p>
              <h3 className="text-base font-semibold">Dashboard del dueño</h3>
              <p className="mt-0.5 text-xs text-white/45">Mesas, pagos, facturas y reportes en un solo lugar.</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase text-white/70 transition group-hover:bg-white/20">
              Abrir
              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </span>
          </a>
        </section>

        {/* 2 — Bitácora */}
        <ChangelogPreview />

        {/* 3 — Resto compacto */}
        <section className="mt-6 rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Más accesos</h2>
            <span className="text-[10px] text-black/40">abren en pestaña nueva</span>
          </div>
          <CompactLinkGrid links={quickLinks} />
        </section>

        <section className="mt-3 rounded-2xl border border-black/10 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">QR de mesas demo</h2>
              <p className="mt-0.5 text-[10px] text-black/45">
                Mismos códigos del PDF · escanea con la cámara del celular
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${mesitaBase}/pay/demo/qr`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-[#fafaf7] px-2.5 py-1 text-[10px] font-semibold text-black/55 hover:border-black/20"
              >
                <QrCode className="h-3 w-3" aria-hidden="true" />
                Poster Mesa 12
              </a>
              <a
                href="/cambios"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900"
              >
                <Newspaper className="h-3 w-3" aria-hidden="true" />
                Bitácora
              </a>
            </div>
          </div>
          <DemoMesaQrGrid />
        </section>

        <footer className="mt-8 flex justify-between gap-2 border-t border-black/10 pt-4 text-[10px] text-black/35">
          <span>Mesita · accesos</span>
          <span>mesitademo-two.vercel.app</span>
        </footer>
      </div>
    </main>
  );
}
