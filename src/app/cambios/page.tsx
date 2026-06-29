import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  GitCommitHorizontal,
  Lightbulb,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  changelogRepositoryUrl,
  changelogRevalidateSeconds,
  formatLastUpdated,
  getDailyChanges,
  getLastUpdatedFromDays,
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
  const lastUpdatedIso = getLastUpdatedFromDays(days);
  const lastUpdatedLabel = lastUpdatedIso ? formatLastUpdated(lastUpdatedIso) : null;

  return (
    <main className="min-h-screen bg-[#f5f5f0] text-[#171714]">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <nav className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/accesos"
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-black/55 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            Central de accesos
          </Link>
          <a
            href={changelogRepositoryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/55 shadow-sm transition hover:text-black"
          >
            <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Ver commits
            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" />
          </a>
        </nav>

        <header className="mb-10 overflow-hidden rounded-[1.75rem] bg-[#171714] p-5 text-white shadow-xl sm:mb-12 sm:rounded-[2rem] sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-8">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-300/75 sm:mb-5 sm:text-xs">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Bitácora de producto
              </div>
              <h1 className="max-w-3xl text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Mesita mejora
                <br />
                todos los días.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/50 sm:mt-5 sm:text-base">
                Un diario automático de lo que cambió, por qué se hizo y cómo mejora la experiencia del restaurante.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:w-72">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 sm:p-4">
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{changeCount}</p>
                <p className="mt-1 text-[10px] text-white/40 sm:text-xs">cambios recientes</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3.5 sm:p-4">
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{days.length}</p>
                <p className="mt-1 text-[10px] text-white/40 sm:text-xs">días registrados</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5 text-[10px] text-white/40 sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-2 sm:text-[11px]">
            {lastUpdatedLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 font-medium text-emerald-200/80">
                <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                Última actualización: {lastUpdatedLabel}
              </span>
            )}
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">Fuente automática: commits de GitHub</span>
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">Contexto editorial: TODAY.md</span>
            <span className="rounded-full bg-white/[0.05] px-3 py-1.5">
              Se refresca cada {changelogRevalidateSeconds / 60} min · cada deployment
            </span>
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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
              {notes.slice(0, 4).map((note, index) => (
                <article
                  key={`${note.date}-${note.title}`}
                  className={`rounded-2xl border p-5 shadow-sm sm:rounded-3xl sm:p-6 ${
                    index === 0
                      ? "border-[#171714] bg-[#171714] text-white sm:col-span-2 lg:col-span-1 lg:row-span-2"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <div className="mb-5 flex items-center justify-between gap-3 sm:mb-8">
                    <span className={`text-[10px] font-bold uppercase tracking-[0.14em] sm:text-xs ${index === 0 ? "text-emerald-300/70" : "text-black/40"}`}>
                      {compactDate(note.date)}
                    </span>
                    <Lightbulb className={`h-5 w-5 shrink-0 ${index === 0 ? "text-white/25" : "text-black/20"}`} aria-hidden="true" />
                  </div>
                  <h3 className={`${index === 0 ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"} font-semibold leading-tight tracking-[-0.025em]`}>{note.title}</h3>

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
            <div className="space-y-6 sm:space-y-5">
              {days.map((day, dayIndex) => (
                <article key={day.date} className="grid gap-3 sm:gap-4 md:grid-cols-[minmax(0,160px)_1fr] lg:grid-cols-[180px_1fr]">
                  <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 md:border-0 md:bg-transparent md:px-0 md:py-0 md:pt-5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-black/40 sm:text-xs">
                      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {dayIndex === 0 ? "Último día" : compactDate(day.date)}
                    </div>
                    <h3 className="mt-1.5 capitalize text-sm font-semibold text-black/70 sm:mt-2">{day.label}</h3>
                    <p className="mt-0.5 text-xs text-black/35">{day.entries.length} cambio{day.entries.length === 1 ? "" : "s"}</p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm sm:rounded-3xl">
                    <div className="absolute bottom-0 left-[27px] top-0 hidden w-px bg-black/[0.07] sm:left-[35px] md:block" />
                    {day.entries.map((entry, index) => (
                      <a
                        key={entry.sha}
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`group relative flex items-start gap-3 p-4 transition hover:bg-[#fafaf7] sm:grid sm:grid-cols-[32px_1fr_auto] sm:gap-4 sm:p-5 ${
                          index > 0 ? "border-t border-black/[0.07]" : ""
                        }`}
                      >
                        <span className="relative z-10 mt-1 hidden h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white ring-4 ring-white sm:flex">
                          <CircleDot className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1 sm:col-start-2">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${categoryStyles[entry.category]}`}>
                              {entry.category}
                            </span>
                            <span className="font-mono text-[10px] text-black/30">{entry.sha}</span>
                          </div>
                          <h4 className="mt-2 text-[15px] font-semibold leading-snug tracking-tight sm:text-base">{entry.title}</h4>
                          {entry.description && (
                            <p className="mt-1.5 text-sm leading-5 text-black/50">{entry.description}</p>
                          )}
                        </div>
                        <ArrowUpRight className="mt-0.5 hidden h-4 w-4 shrink-0 text-black/20 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-black sm:mt-1 sm:block" aria-hidden="true" />
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
          {lastUpdatedLabel ? (
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              Última actualización: {lastUpdatedLabel}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" /> Basado en cambios reales del repositorio</span>
          )}
        </footer>
      </div>
    </main>
  );
}
