import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  GitCommitHorizontal,
  Lightbulb,
  Newspaper,
  Sparkles,
} from "lucide-react";
import {
  changelogRevalidateSeconds,
  formatLastUpdated,
  getDailyChanges,
  getLastUpdatedFromDays,
  getTodayEntries,
  type ChangeCategory,
} from "@/lib/changelog";

const categoryDot: Record<ChangeCategory, string> = {
  Experiencia: "bg-orange-400",
  Integración: "bg-violet-400",
  Rendimiento: "bg-emerald-400",
  Datos: "bg-sky-400",
  Seguridad: "bg-rose-400",
  Producto: "bg-stone-400",
};

const categoryBadge: Record<ChangeCategory, string> = {
  Experiencia: "bg-orange-400/15 text-orange-200",
  Integración: "bg-violet-400/15 text-violet-200",
  Rendimiento: "bg-emerald-400/15 text-emerald-200",
  Datos: "bg-sky-400/15 text-sky-200",
  Seguridad: "bg-rose-400/15 text-rose-200",
  Producto: "bg-white/10 text-white/70",
};

export async function ChangelogPreview() {
  const [days, notes] = await Promise.all([getDailyChanges(16), getTodayEntries(1)]);
  const latest = days[0];
  const changeCount = days.reduce((total, day) => total + day.entries.length, 0);
  const featuredNote = notes[0];
  const recentEntries = latest?.entries.slice(0, 5) ?? [];
  const lastUpdatedIso = getLastUpdatedFromDays(days);
  const lastUpdatedLabel = lastUpdatedIso ? formatLastUpdated(lastUpdatedIso) : null;

  return (
    <section
      aria-labelledby="changelog-hero-title"
      className="mb-6 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#0d1f17] via-[#171714] to-[#1a2420] text-white shadow-2xl ring-1 ring-emerald-400/20 sm:mb-8 sm:rounded-[1.75rem]"
    >
      <div className="relative px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-10">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Bitácora viva
              </span>
              {lastUpdatedLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold text-white/55">
                  <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Última actualización: {lastUpdatedLabel}
                </span>
              )}
              <span className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[10px] font-semibold text-white/45">
                Se refresca cada {changelogRevalidateSeconds / 60} min
              </span>
            </div>

            <h2
              id="changelog-hero-title"
              className="max-w-xl text-[1.85rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]"
            >
              Mesita mejora
              <br />
              <span className="text-emerald-300">todos los días.</span>
            </h2>

            <p className="mt-5 max-w-lg text-sm leading-6 text-white/50 sm:text-base">
              Commits de GitHub agrupados por día en Ecuador, con contexto de{" "}
              <span className="text-white/70">TODAY.md</span> para explicar qué cambió, por qué y qué mejora.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-sm">
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2.5 sm:px-3 sm:py-3">
                <p className="text-xl font-semibold tracking-tight sm:text-2xl">{changeCount || "—"}</p>
                <p className="mt-0.5 text-[9px] text-white/40 sm:text-[10px]">cambios</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-2.5 sm:px-3 sm:py-3">
                <p className="text-xl font-semibold tracking-tight sm:text-2xl">{days.length || "—"}</p>
                <p className="mt-0.5 text-[9px] text-white/40 sm:text-[10px]">días</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-2.5 sm:px-3 sm:py-3">
                <p className="text-xl font-semibold tracking-tight text-emerald-300 sm:text-2xl">
                  {latest?.entries.length ?? "—"}
                </p>
                <p className="mt-0.5 text-[9px] text-emerald-200/50 sm:text-[10px]">hoy</p>
              </div>
            </div>

            <Link
              href="/cambios"
              className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-3.5 text-sm font-semibold text-[#0d1f17] shadow-lg shadow-emerald-900/30 transition active:scale-[0.98] hover:bg-emerald-300 sm:w-auto sm:min-w-[220px]"
            >
              <Newspaper className="h-5 w-5" aria-hidden="true" />
              Abrir bitácora completa
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>

          <div className="flex flex-col gap-4">
            {featuredNote && (
              <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300/70">
                    <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                    Destacado · TODAY.md
                  </span>
                  <Sparkles className="h-4 w-4 text-white/20" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">
                  {featuredNote.title}
                </h3>
                {(featuredNote.why || featuredNote.effect || featuredNote.what) && (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/50">
                    {featuredNote.why ?? featuredNote.effect ?? featuredNote.what}
                  </p>
                )}
              </article>
            )}

            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                    Última actividad
                  </p>
                  <p className="mt-0.5 truncate capitalize text-sm font-semibold sm:text-base">
                    {latest?.label ?? "Próxima actualización"}
                  </p>
                </div>
                <GitCommitHorizontal className="h-5 w-5 shrink-0 text-white/25" aria-hidden="true" />
              </div>

              {recentEntries.length > 0 ? (
                <ul className="divide-y divide-white/[0.07]">
                  {recentEntries.slice(0, 4).map((entry) => (
                    <li key={entry.sha}>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start gap-3 px-4 py-3.5 transition hover:bg-white/[0.04] sm:gap-4 sm:px-5 sm:py-4"
                      >
                        <span
                          className={`mt-2 h-2 w-2 shrink-0 rounded-full ${categoryDot[entry.category]}`}
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${categoryBadge[entry.category]}`}
                            >
                              {entry.category}
                            </span>
                            <span className="font-mono text-[10px] text-white/25">{entry.sha}</span>
                          </span>
                          <span className="mt-1.5 block text-sm font-medium leading-5 text-white/85 transition group-hover:text-emerald-200 sm:text-[15px]">
                            {entry.title}
                          </span>
                        </span>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-white/20 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white/70" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-5 py-10 text-center text-sm text-white/40">
                  La actividad de GitHub aparecerá aquí en la próxima actualización.
                </div>
              )}

              <div className="border-t border-white/10 px-4 py-3 sm:px-5">
                <Link
                  href="/cambios"
                  className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
                >
                  Ver todos los cambios por día
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
