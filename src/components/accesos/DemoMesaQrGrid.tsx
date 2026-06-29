import { ArrowUpRight } from "lucide-react";
import { DEMO_TABLE_DEFINITIONS } from "@/lib/demo-table-catalog/definitions";
import { buildDemoPayUrl, generateBrandedQRDataUrl } from "@/lib/qr-utils";

async function loadMesaQrs() {
  return Promise.all(
    DEMO_TABLE_DEFINITIONS.map(async (def) => {
      const payUrl = buildDemoPayUrl(def.token);
      const qrDataUrl = await generateBrandedQRDataUrl(payUrl, {
        width: 480,
        margin: 2,
        errorCorrectionLevel: "H",
      });
      return {
        tableName: def.table.name,
        payUrl,
        qrDataUrl,
        scenario: def.scenarioDescription,
      };
    }),
  );
}

export async function DemoMesaQrGrid() {
  const mesas = await loadMesaQrs();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {mesas.map((mesa) => (
        <a
          key={mesa.payUrl}
          href={mesa.payUrl}
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col overflow-hidden rounded-2xl border border-[#E7DDD2] bg-[#FFFDF9] shadow-sm transition active:scale-[0.98] hover:border-[#14794B]/30 hover:shadow-md"
        >
          <div className="relative bg-[#14794B] px-3 pb-2.5 pt-3 text-center">
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E86A33]" aria-hidden="true" />
            <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-100/80">
              La Doña Pepa
            </p>
            <p className="mt-0.5 text-sm font-bold tracking-wide text-white">Mesa {mesa.tableName}</p>
          </div>

          <div className="flex flex-1 flex-col items-center px-3 py-3">
            <div className="rounded-xl border border-[#E7DDD2] bg-white p-2 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mesa.qrDataUrl}
                alt={`Código QR para pagar en Mesa ${mesa.tableName}`}
                width={160}
                height={160}
                className="h-auto w-full max-w-[140px] sm:max-w-[160px]"
              />
            </div>

            <p className="mt-2.5 text-center text-[11px] font-semibold text-[#1B1714]">Escanea para pagar</p>
            <p className="mt-1 line-clamp-2 text-center text-[10px] leading-4 text-black/45">{mesa.scenario}</p>
            <p className="mt-2 break-all text-center font-mono text-[8px] leading-3 text-[#E86A33]">
              {mesa.payUrl.replace(/^https?:\/\//, "")}
            </p>
          </div>

          <div className="flex items-center justify-center gap-1 border-t border-[#E7DDD2] bg-white/60 px-3 py-2 text-[10px] font-semibold text-[#14794B] transition group-hover:bg-[#14794B]/5">
            Abrir mesa
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </div>
        </a>
      ))}
    </div>
  );
}
