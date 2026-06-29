import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Code2,
  GitCommitHorizontal,
  Lightbulb,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  changelogRepositoryUrl,
  getDailyChanges,
  getTodayEntries,
  type ChangeCategory,
} from "@/lib/changelog";

const categoryStyles: Record<ChangeCategory, string> = {
  Experiencia: "bg-orange-100 text-orange-800",
  Integración: "bg-violet-100 text-violet-800",
  Rendimiento: "bg-emerald-100 text-emerald-800",
  Datos: "bg-sky-100 text-sky-800",
  Seguridad: "bg-rose-100 text-rose-800",
  Producto: "bg-stone-200 text-stone-700",
};

function compactDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export default async function CambiosPage() {
  const [days, notes] = await Promise.all([getDailyChanges(60), getTodayEntries(10)]);
  const changeCount = days.reduce((total, day) => total + day.entries.length, 0);

  return (
    <main className="min-h-screen bg-[#f5f5f0] text-[#171714]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <nav className="mb-10 flex items-center justify-between">
          <Link href="/accesos" className="inline-flex items-center gap-2 text-sm font-medium text-black/55 transition hover:text-black">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Central de accesos
          </Link>
          <a
            href={changelogRepositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/55 shadow-sm transition hover:text-black"
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            Ver commits
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </a>
        </nav>

        <header className="mb-12 overflow-hidden rounded-[2rem] bg-[#171714] p-6 text-white shadow-xl sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-emerald-300/75">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Bitácora de producto
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-6xl">
                Mesita mejora
                <br />
                todos los días.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/50 sm:text-base">
                Un diario automático de lo que cambió, por qué se hizo y cómo mejora la experiencia del restaurante.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:w-72">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-3xl font-semibold tracking-tight">{changeCount}</p>
                <p className="mt-1 text-xs text-white/40">cambios recientes</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                <p className="text-3xl font-semibold tracking-tight">{days.length}</p>
                <p className="mt-1 text-xs text-white/40">días registrados</p>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-5 text-[11px] text-white/40">
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">Fuente automática: commits de GitHub</span>
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">Contexto editorial: TODAY.md</span>
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">Actualización: cada deployment</span>
          </div>
        </header>

        {notes.length > 0 && (
          <section className="mb-14">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-black/40">Historias destacadas</p>
                <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Qué cambió y por qué</h2>
              </div>
              <span className="hidden text-xs text-black/40 sm:block">Curado desde TODAY.md</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {notes.slice(0, 4).map((note, index) => (
                <article
                  key={`${note.date}-${note.title}`}
                  className={`rounded-3xl border p-6 shadow-sm ${
                    index === 0
                      ? "border-[#171714] bg-[#171714] text-white lg:row-span-2"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <div className="mb-8 flex items-center justify-between gap-3">
                    <span className={`text-xs font-bold uppercase tracking-[0.14em] ${index === 0 ? "text-emerald-300/70" : "text-black/40"}`}>
                      {compactDate(note.date)}
                    </span>
                    <Lightbulb className={`h-5 w-5 ${index === 0 ? "text-white/25" : "text-black/20"}`} aria-hidden="true" />
                  </div>
                  <h3 className={`${index === 0 ? "text-3xl" : "text-xl"} font-semibold leading-tight tracking-[-0.025em]`}>{note.title}</h3>

                  <div className="mt-6 space-y-4">
                    {note.why && (
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${index === 0 ? "text-white/35" : "text-black/35"}`}>Por qué</p>
                        <p className={`mt-1.5 text-sm leading-6 ${index === 0 ? "text-white/58" : "text-black/55"}`}>{note.why}</p>
                      </div>
                    )}
                    {note.effect && (
                      <div>
                        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${index === 0 ? "text-white/35" : "text-black/35"}`}>Qué mejora</p>
                        <p className={`mt-1.5 text-sm leading-6 ${index === 0 ? "text-white/58" : "text-black/55"}`}>{note.effect}</p>
                      </div>
                    )}
                    {!note.why && !note.effect && note.what && (
                      <p className={`text-sm leading-6 ${index === 0 ? "text-white/58" : "text-black/55"}`}>{note.what}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="mb-7 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-black/40">Actividad automática</p>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Cambios por día</h2>
            </div>
            <p className="max-w-sm text-sm leading-5 text-black/45 sm:text-right">Cada commit nuevo aparece agrupado por fecha de Ecuador.</p>
          </div>

          {days.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/15 bg-white/50 p-10 text-center">
              <GitCommitHorizontal className="mx-auto h-8 w-8 text-black/20" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium">No se pudo consultar GitHub en este momento.</p>
              <p className="mt-1 text-xs text-black/45">La bitácora volverá a intentarlo automáticamente.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {days.map((day, dayIndex) => (
                <article key={day.date} className="grid gap-4 md:grid-cols-[180px_1fr]">
                  <div className="md:pt-5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-black/40">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      {dayIndex === 0 ? "Último día" : compactDate(day.date)}
                    </div>
                    <h3 className="mt-2 capitalize text-sm font-semibold text-black/70">{day.label}</h3>
                    <p className="mt-1 text-xs text-black/35">{day.entries.length} cambio{day.entries.length === 1 ? "" : "s"}</p>
                  </div>

                  <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
                    <div className="absolute bottom-0 left-[35px] top-0 w-px bg-black/[0.07]" />
                    {day.entries.map((entry, index) => (
                      <a
                        key={entry.sha}
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`group relative grid grid-cols-[32px_1fr_auto] gap-4 p-5 transition hover:bg-[#fafaf7] ${
                          index > 0 ? "border-t border-black/[0.07]" : ""
                        }`}
                      >
                        <span className="relative z-10 mt-1 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-4 ring-white">
                          <CircleDot className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${categoryStyles[entry.category]}`}>
                              {entry.category}
                            </span>
                            <span className="font-mono text-[10px] text-black/30">{entry.sha}</span>
                          </div>
                          <h4 className="mt-2 text-base font-semibold tracking-tight">{entry.title}</h4>
                          {entry.description && <p className="mt-1.5 max-w-3xl text-sm leading-5 text-black/50">{entry.description}</p>}
                        </div>
                        <ArrowUpRight className="mt-1 h-4 w-4 text-black/20 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-black" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="mt-16 flex flex-col justify-between gap-3 border-t border-black/10 pt-6 text-xs text-black/40 sm:flex-row">
          <span className="inline-flex items-center gap-2"><Wrench className="h-3.5 w-3.5" /> Mesita · bitácora viva</span>
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Basado en cambios reales del repositorio</span>
        </footer>
      </div>
    </main>
  );
}
