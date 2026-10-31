"use client";

import { PALETTE } from "@/lib/palette";

/**
 * Skeleton de /formacion con la MISMA estructura que ProgresoTorre, para cubrir
 * la espera mientras carga la información de la cuenta (progreso.json + backend)
 * sin pantalla en blanco ni salto de "nivel 0" al estado real (sin CLS).
 */
export default function ProgresoSkeleton() {
  return (
    <main className="relative" aria-busy="true">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <span className="rdr-blob left-1/2 top-1/4 h-72 w-72 -translate-x-1/2" style={{ background: PALETTE.royal }} />
        <span className="rdr-blob bottom-[-8%] right-[-4%] h-72 w-72" style={{ background: PALETTE.purple, animationDelay: "-6s" }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-32 pt-cabecera sm:px-6">
        {/* Hero */}
        <div className="mb-14 rounded-3xl bg-midnight/35 px-4 py-7 text-center backdrop-blur-sm">
          <div className="mx-auto h-3 w-28 rounded-full rdr-skel" />
          <div className="mx-auto mt-4 h-9 w-64 rounded-lg rdr-skel" />
          <div className="mx-auto mt-3 h-3 w-72 max-w-full rounded-full rdr-skel" />
          <div className="mx-auto mt-7 h-2 w-64 max-w-full rounded-full rdr-skel" />
          <p className="mt-6 font-sans text-xs font-bold uppercase tracking-[0.3em] text-serene/80" role="status" aria-live="polite">
            Cargando tu progreso…
          </p>
        </div>

        {/* Niveles */}
        <div className="space-y-10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-12 w-12 shrink-0 rounded-2xl rdr-skel" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-4 w-40 max-w-[60%] rounded rdr-skel" />
                <div className="h-[68px] w-full rounded-2xl rdr-skel" />
                {i === 1 && <div className="h-[68px] w-full rounded-2xl rdr-skel" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
