"use client";

import { useCallback, useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";
import { normalizarColores, dateKey } from "./constants";
import EquipoPanel from "./EquipoPanel";
import Calendario, { YO_COLOR } from "./Calendario";
import DaySheet from "./DaySheet";
import { AmbientBackground, VacacionesSkeleton, ErrorCard } from "./VacacionesRoute";
import { SolicitudForm, MisSolicitudes, MisDias } from "./SolicitudPanel";
import { useVacaciones, festivosVistaGrupo } from "./datos";

const ACCENT = PALETTE.mandarin;

/* /vacaciones (vista de EQUIPO, backend v2): directamente al calendario de
   todo el equipo, con filtros por persona y tus días marcados en otro color;
   a la izquierda, el formulario para pedir días y tus solicitudes. Sin saldos:
   cuántos días le quedan a cada uno solo se ve en Coordinación. */
export default function MisVacacionesRoute() {
  const { theme } = useTheme();
  const mapAccent = useAccentMap();
  const [anio, setAnio] = useState(null);
  const { snap, reload, post } = useVacaciones(anio);
  const [filtros, setFiltros] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);
  const [hoy] = useState(() => new Date());
  const d = snap?.data;

  const toggleFiltro = useCallback((nombre) => {
    setFiltros((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
      return next;
    });
  }, []);

  // Con UNA persona filtrada, los festivos que se pintan son los de su grupo.
  const datosVis = useMemo(() => {
    if (!d) return null;
    let festivos = d.festivos;
    if (filtros.size === 1) {
      const emp = d.empleadosMap[Array.from(filtros)[0]];
      if (emp?.grupo) festivos = festivosVistaGrupo(d.festivosDetalle, d.grupos, emp.grupo);
    }
    return normalizarColores({ ...d, festivos }, theme);
  }, [d, filtros, theme]);

  const totalActivos = d ? d.empleados.filter((e) => e.activo).length : 0;
  const ausentesHoy = d && d.year === hoy.getFullYear() ? (d.ausenciasPorDia?.[dateKey(hoy)] || []).length : 0;
  const recargar = () => reload(true);

  return (
    <main className="relative min-h-dvh w-full">
      <ArtBanner src={ART.equipo} />
      <AmbientBackground />
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-bold uppercase tracking-[0.4em]" style={{ color: mapAccent(ACCENT) }}>Equipo · RDR</p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-sand sm:text-4xl">Vacaciones del equipo</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-sand/65">
              Quién está fuera cada día. Toca un nombre para filtrar; tus días van marcados en verde. Pide los tuyos desde «Pedir días».
            </p>
          </div>
          {d?.anios?.length > 1 && (
            <div className="inline-flex gap-1 rounded-full border border-white/12 bg-white/[0.055] p-1" role="tablist" aria-label="Año">
              {d.anios.map((a) => (
                <button key={a} type="button" role="tab" aria-selected={a === d.year} onClick={() => setAnio(a)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${a === d.year ? "bg-[#FFB56B] text-[#001391]" : "text-sand/70 hover:text-sand"}`}>
                  {a}
                </button>
              ))}
            </div>
          )}
        </header>

        {snap?.error ? (
          <ErrorCard mensaje={snap.error} onRetry={() => reload()} />
        ) : !d ? (
          <VacacionesSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <SolicitudForm datos={d} post={post} onHecho={recargar} />
              <MisDias datos={d} post={post} onHecho={recargar} />
              <MisSolicitudes solicitudes={d.misSolicitudes} post={post} onHecho={recargar} />
              <EquipoPanel
                empleados={datosVis.empleados}
                paletaEquipos={{}}
                filtros={filtros}
                onToggle={toggleFiltro}
                onClear={() => setFiltros(new Set())}
                ausentesHoy={ausentesHoy}
                yo={d.yo?.nombre}
                leyendaExtra={
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <span className="h-3.5 w-3.5 shrink-0 rounded border-2" style={{ borderColor: YO_COLOR(theme) }} aria-hidden />
                    Tus días
                  </div>
                }
              />
            </div>
            <Calendario
              datos={datosVis}
              filtros={filtros}
              totalActivos={totalActivos}
              onOpenDay={(dateStr, ausencias) => setSheet({ dateStr, ausencias })}
              yo={d.yo?.nombre}
            />
          </div>
        )}
        {datosVis && <DaySheet sheet={sheet} empleadosMap={datosVis.empleadosMap || {}} onClose={() => setSheet(null)} />}
      </div>
    </main>
  );
}
