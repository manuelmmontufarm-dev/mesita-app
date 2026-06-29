import Link from "next/link";
import { ArrowRight, GitCommitHorizontal, Sparkles } from "lucide-react";
import { getDailyChanges, type ChangeCategory } from "@/lib/changelog";

const categoryDot: Record<ChangeCategory, string> = {
  Experiencia: "bg-orange-500",
  Integración: "bg-violet-500",
  Rendimiento: "bg-emerald-500",
  Datos: "bg-sky-500",
  Seguridad: "bg-rose-500",
  Producto: "bg-stone-500",
};

export async function ChangelogPreview() {
  const days = await getDailyChanges(16);
  const latest = days[0];

  return (
    <section className="mb-16 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
        <div className="flex flex-col justify-between bg-[#e7f6ee] p-6 sm:p-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Nuevo · Bitácora viva
            </div>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.035em]">Lo que mejoramos, explicado.</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-black/55">
              Cada commit de GitHub se convierte en una entrada diaria para entender qué cambió y cómo evoluciona Mesita.
            </p>
          </div>
          <Link href="/cambios" className="group mt-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-emerald-900">
            Abrir la bitácora completa
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>

        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-black/35">Última actividad</p>
              <h3 className="mt-1 capitalize text-lg font-semibold">{latest?.label ?? "GitHub se actualizará pronto"}</h3>
            </div>
            <GitCommitHorizontal className="h-5 w-5 text-black/25" aria-hidden="true" />
          </div>

          {latest ? (
            <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
              {latest.entries.slice(0, 4).map((entry) => (
                <a
                  key={entry.sha}
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-3 py-4"
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${categoryDot[entry.category]}`} />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold leading-5 transition group-hover:text-emerald-800">{entry.title}</span>
                    <span className="mt-1 block text-[11px] text-black/40">{entry.category} · {entry.sha}</span>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-[#fafaf7] p-8 text-center text-sm text-black/45">
              La actividad aparecerá aquí en la próxima actualización.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
