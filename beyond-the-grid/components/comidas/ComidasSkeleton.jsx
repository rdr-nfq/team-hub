"use client";

import { PALETTE } from "@/lib/palette";

/**
 * Skeleton de /comidas con la MISMA estructura que la vista real (hero, tabs,
 * dos paneles y rejilla de restaurantes) para cubrir la carga del backend sin
 * pantalla en blanco ni saltos de layout (mismo patrón que ProgresoSkeleton).
 */
export default function ComidasSkeleton() {
  return (
    <main className="relative" aria-busy="true">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <span className="rdr-blob left-[-8%] top-[8%] h-72 w-72" style={{ background: PALETTE.mandarin }} />
        <span className="rdr-blob right-[-6%] top-[30%] h-80 w-80" style={{ background: PALETTE.royal, animationDelay: "-5s" }} />
        <span className="rdr-blob bottom-[-10%] left-[24%] h-72 w-72" style={{ background: PALETTE.canary, animationDelay: "-9s" }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-24 pt-cabecera sm:px-6">
        {/* Hero */}
        <div className="mb-8">
          <div className="h-3 w-32 rounded-full rdr-skel" />
          <div className="mt-4 h-9 w-72 max-w-full rounded-lg rdr-skel" />
          <div className="mt-3 h-3 w-80 max-w-full rounded-full rdr-skel" />
        </div>
        {/* Tabs */}
        <div className="mb-6 h-11 w-64 max-w-full rounded-full rdr-skel" />
        {/* Paneles voto + resultados */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-[380px] rounded-2xl rdr-skel" />
          <div className="h-[380px] rounded-2xl rdr-skel" />
        </div>
        {/* Restaurantes */}
        <div className="mt-8 h-4 w-40 rounded rdr-skel" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-2xl rdr-skel" />
          ))}
        </div>
        <p className="mt-8 text-center font-sans text-xs font-bold uppercase tracking-[0.3em] text-mandarin/80" role="status" aria-live="polite">
          Cargando comidas…
        </p>
      </div>
    </main>
  );
}
