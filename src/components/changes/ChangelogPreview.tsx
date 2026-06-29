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
      className="mb-16 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0d1f17] via-[#171714] to-[#1a2420] text-white shadow-2xl ring-1 ring-emerald-400/20"
    >
      <div className="relative px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
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
              className="max-w-xl text-[2.35rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-[3.25rem]"
            >
              Mesita mejora
              <br />
              <span className="text-emerald-300">todos los días.</span>
            </h2>

            <p className="mt-5 max-w-lg text-sm leading-6 text-white/50 sm:text-base">
              Commits de GitHub agrupados por día en Ecuador, con contexto de{" "}
              <span className="text-white/70">TODAY.md</span> para explicar qué cambió, por qué y qué mejora.
            </p>

            <div className="mt-7 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3.5 sm:px-4 sm:py-4">
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{changeCount || "—"}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-white/40 sm:text-xs">cambios</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-3.5 sm:px-4 sm:py-4">
                <p className="text-2xl font-semibold tracking-tight sm:text-3xl">{days.length || "—"}</p>
                <p className="mt-0.5 text-[10px] leading-tight text-white/40 sm:text-xs">días</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-3.5 sm:px-4 sm:py-4">
                <p className="text-2xl font-semibold tracking-tight text-emerald-300 sm:text-3xl">
                  {latest?.entries.length ?? "—"}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-emerald-200/50 sm:text-xs">hoy</p>
              </div>
            </div>

            <Link
              href="/cambios"
              className="group mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-400 px-6 py-4 text-base font-semibold text-[#0d1f17] shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-300 sm:w-auto sm:min-w-[260px]"
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
                  {recentEntries.map((entry) => (
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
