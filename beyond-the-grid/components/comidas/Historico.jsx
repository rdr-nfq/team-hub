"use client";

import { useMemo } from "react";
import { computeWeek, semanasPasadas } from "./logic";
import { IconPlato, IconTaper, IconCasa, IconEstrella } from "./icons";

const BADGE = "inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11px] font-bold tabular-nums text-sand/85";

/** Semanas pasadas con votos: qué se eligió cada jueves (más reciente primero). */
export default function Historico({ semanas, votos }) {
  const filas = useMemo(() => {
    return semanasPasadas(semanas)
      .filter((s) => votos.some((v) => v.semana === s.fecha))
      .map((s) => ({ fecha: s.fecha, c: computeWeek(votos, s.fecha) }));
  }, [semanas, votos]);

  if (!filas.length) {
    return <p className="py-6 text-center text-[13px] text-sand/55">Aún no hay semanas pasadas con votos.</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {filas.map(({ fecha, c }, i) => (
        <li
          key={fecha}
          className="rdr-rise flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/12 bg-white/[0.055] px-4 py-3.5 backdrop-blur-md transition hover:translate-x-0.5 hover:border-mandarin/40 hover:bg-white/[0.08]"
          style={{ animationDelay: `${i * 30}ms` }}
        >
          <span className="min-w-[6rem] font-display text-base font-bold tabular-nums text-sand">{fecha}</span>
          <span className="flex min-w-[11rem] flex-1 items-center gap-2 text-[13px] text-sand/85">
            <IconPlato size={14} className="shrink-0 text-mandarin" />
            {c.r1 ? (
              <span>
                <b className="text-serene">{c.r1.nombre}</b> ({c.r1.puntos} pts)
                {c.r2 && <span className="text-sand/70"> · 2ª: {c.r2.nombre} ({c.r2.puntos} pts)</span>}
              </span>
            ) : ("Sin restaurante")}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {c.flex > 0 && <span className={BADGE}><IconEstrella size={11} /> {c.flex} flexibles</span>}
            <span className={BADGE}><IconTaper size={11} /> {c.taper}</span>
            <span className={BADGE}><IconCasa size={11} /> {c.no}</span>
            <span className={BADGE}>{c.total} votos</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
