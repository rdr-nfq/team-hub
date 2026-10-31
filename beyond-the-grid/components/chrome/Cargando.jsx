"use client";

import { useEffect, useState } from "react";

/* Aviso de carga común a toda la web, para las esperas del backend (Apps
   Script): rueda + «Cargando …». Si tarda, explica por qué (el servidor de
   Google arranca en frío la primera vez) y, si tarda demasiado, qué hacer.
   Va encima del skeleton de cada página; con movimiento reducido la rueda se
   queda quieta pero el texto sigue diciendo lo que pasa. */
export default function Cargando({ que = "los datos", className = "" }) {
  const [fase, setFase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setFase(1), 4000);
    const t2 = setTimeout(() => setFase(2), 25000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div role="status" aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 font-sans text-sm text-sand ${className}`}>
      <span aria-hidden className="mt-0.5 h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-sand/25 border-t-sand" />
      <span>
        <b>Cargando {que}…</b>
        {fase === 1 && <span className="text-sand/75"> Los datos vienen de Google y la primera carga del día puede tardar unos segundos.</span>}
        {fase === 2 && <span className="text-sand/75"> Está tardando más de lo normal. Si no termina, recarga la página.</span>}
      </span>
    </div>
  );
}
