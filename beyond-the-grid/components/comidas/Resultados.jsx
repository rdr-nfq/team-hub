"use client";

import { useMemo } from "react";
import { computeWeek, capitaliza, fmtLargo } from "./logic";
import { IconTaper, IconCasa } from "./icons";

/* Tarjetas de acento sólido: texto SIEMPRE Electric Blue (regla dura nº9).
   Superficies con hex LITERAL (no utilidades temadas): estos tiles BBVA se ven
   idénticos en modo claro y oscuro. */
function CardOpcion({ tag, bg, r, flex }) {
  if (!r) {
    return (
      <div className="flex min-h-[118px] flex-col rounded-xl border border-dashed border-white/15 bg-white/[0.05] p-4 text-sand">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-70">{tag}</span>
        <span className="mt-2 font-display text-lg font-bold leading-tight opacity-60">Sin votos aún</span>
      </div>
    );
  }
  return (
    <div className={`flex min-h-[118px] flex-col rounded-xl p-4 text-[#001391] ${bg}`}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-70">{tag}</span>
      <span className="mb-auto mt-2 font-display text-lg font-bold leading-tight">{r.nombre}</span>
      {/* El número es la PUNTUACIÓN (1ª vale 2, 2ª vale 1): si se enseñara el
          número de votos a secas, el orden del ranking no se entendería. */}
      <span className="mt-2.5 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold leading-none tabular-nums">{r.puntos}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] opacity-70">{r.puntos === 1 ? "punto" : "puntos"}</span>
      </span>
      <span className="mt-1 text-[11px] opacity-70">
        {r.n1} de 1ª{r.n2 > 0 ? ` · ${r.n2} de 2ª` : ""}
      </span>
      {flex > 0 && <span className="mt-1.5 text-[11px] opacity-75">+ {flex} flexible{flex > 1 ? "s" : ""} se unirán</span>}
    </div>
  );
}

function CardSimple({ tag, bg, n, icon: Icon }) {
  return (
    <div className={`flex min-h-[118px] flex-col rounded-xl p-4 text-[#001391] ${bg}`}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] opacity-70">{tag}</span>
      <span className="mb-auto mt-2"><Icon size={24} /></span>
      <span className="mt-2.5 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold leading-none tabular-nums">{n}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] opacity-70">{n === 1 ? "persona" : "personas"}</span>
      </span>
    </div>
  );
}

/**
 * Panel "Resultados" de la semana seleccionada: las dos primeras del ranking
 * (que suma los votos de prioridad 1 y 2), taper y ausencias, más el detalle
 * de quién ha votado qué, quiénes van flexibles y quién falta por votar.
 */
export default function Resultados({ semana, votos, equipo }) {
  const c = useMemo(() => (semana ? computeWeek(votos, semana) : null), [votos, semana]);

  const faltan = useMemo(() => {
    if (!semana) return [];
    const votaron = new Set(votos.filter((x) => x.semana === semana).map((x) => x.companero));
    return equipo.filter((n) => !votaron.has(n));
  }, [votos, semana, equipo]);

  return (
    <section
      aria-labelledby="res-title"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md transition-colors hover:border-mandarin/40"
    >
      <h2 id="res-title" className="font-display text-xl font-bold text-sand">Resultados</h2>
      <p className="mb-5 mt-1 text-[13px] text-sand/70">
        {c ? (
          <>{capitaliza(fmtLargo(semana))} · <b className="text-mandarin">{c.total}</b> {c.total === 1 ? "voto" : "votos"}</>
        ) : ("—")}
      </p>

      {c && (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <CardOpcion tag="1ª opción · más votada" bg="bg-[#85C8FF]" r={c.r1} flex={c.flex} />
            <CardOpcion tag="2ª opción" bg="bg-[#8BE1E9]" r={c.r2} flex={0} />
            <CardSimple tag="Taper / Glovo" bg="bg-[#FFE761]" n={c.taper} icon={IconTaper} />
            <CardSimple tag="No estoy" bg="bg-[#F7F8F8] border border-[#001391]/15" n={c.no} icon={IconCasa} />
          </div>

          {/* Detalle: quién va a qué + quién falta */}
          <div className="mt-4 space-y-1 text-[11.5px] leading-relaxed text-sand/70">
            <p className="text-sand/45">Puntos: cada voto de 1ª prioridad vale 2 y cada uno de 2ª, 1.</p>
            {c.r1 && (
              <p>
                <b className="font-bold text-serene">{c.r1.nombre}:</b> {c.r1.quien.join(", ")}
                {c.flex > 0 && <span className="opacity-70"> (+{c.flex} flexibles)</span>}
              </p>
            )}
            {c.r2 && <p><b className="font-bold text-serene">{c.r2.nombre}:</b> {c.r2.quien.join(", ")}</p>}
            {c.whoFlex.length > 0 && (
              <p>
                <b className="font-bold text-serene">Flexibles ({c.whoFlex.length}):</b> {c.whoFlex.join(", ")}
                <span className="opacity-70"> — se unen a lo más votado</span>
              </p>
            )}
            {c.whoTaper.length > 0 && <p><b className="font-bold text-serene">Taper/Glovo:</b> {c.whoTaper.join(", ")}</p>}
            {c.whoNo.length > 0 && <p><b className="font-bold text-serene">No estoy:</b> {c.whoNo.join(", ")}</p>}
            {faltan.length > 0 && (
              <p>
                <b className="font-bold text-mandarin">Faltan por votar ({faltan.length}):</b>{" "}
                <span className="opacity-70">{faltan.join(", ")}</span>
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
