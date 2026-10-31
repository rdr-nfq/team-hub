"use client";

import { useCallback, useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";
import { normalizarColores, dateKey } from "./constants";
import FiltroPersonas from "./FiltroPersonas";
import Calendario from "./Calendario";
import DaySheet from "./DaySheet";
import { AmbientBackground, VacacionesSkeleton, ErrorCard } from "./VacacionesRoute";
import { SolicitudForm, MisSolicitudes, MisDias, useMisBloques } from "./SolicitudPanel";
import CampanaForm from "./CampanaForm";
import { useVacaciones, festivosVistaGrupo, festivosDeGrupo, laborables, conEneroSiguiente } from "./datos";

const ACCENT = PALETTE.mandarin;

/* «Mis vacaciones»: una tarjeta con pestañas, una cosa a la vez (pedir días,
   el formulario especial abierto, lo aprobado y las solicitudes). Por
   defecto, el formulario especial si hay uno abierto. */
function MisVacaciones({ datos, post, onHecho }) {
  const campanas = (datos.campanas || []).filter((c) => c.activa);
  const bloques = useMisBloques(datos);
  const sols = datos.misSolicitudes || [];
  const pendientes = sols.filter((s) => s.estado === "PENDIENTE").length;
  const pestanas = [
    ...campanas.map((c) => ({ id: `c-${c.id}`, label: `${c.emoji ? `${c.emoji} ` : ""}${c.nombre}`, campana: c })),
    { id: "pedir", label: "Pedir días" },
    { id: "aprobados", label: "Aprobados", n: bloques.length },
    { id: "solicitudes", label: "Solicitudes", n: pendientes, aviso: pendientes > 0 },
  ];
  const [tab, setTab] = useState(pestanas[0].id);
  const actual = pestanas.find((p) => p.id === tab) || pestanas[0];

  if (!datos.yo) return <SolicitudForm datos={datos} post={post} onHecho={onHecho} />;

  return (
    <section aria-label="Mis vacaciones" className="rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md">
      <div className="px-4 pt-4">
        <h2 className="font-display text-lg font-bold text-sand">Mis vacaciones</h2>
        <div role="tablist" aria-label="Mis vacaciones" className="mt-3 flex flex-wrap gap-1.5">
          {pestanas.map((p) => {
            const on = p.id === actual.id;
            return (
              <button
                key={p.id} type="button" role="tab" aria-selected={on} onClick={() => setTab(p.id)}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
                  on ? "bg-[#FFB56B] text-[#001391]" : "border border-white/12 text-sand/75 hover:border-white/30 hover:text-sand"
                }`}
              >
                {p.label}
                {p.n > 0 && (
                  <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${on ? "bg-[#001391]/15" : p.aviso ? "bg-canary/20 text-canary" : "bg-white/10 text-sand/70"}`}>{p.n}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div role="tabpanel" aria-label={actual.label} className="mt-3 border-t border-white/10 p-4">
        {actual.campana ? (
          <CampanaForm campana={actual.campana} datos={datos} post={post} onHecho={onHecho} sinMarco />
        ) : actual.id === "pedir" ? (
          <SolicitudForm datos={datos} post={post} onHecho={onHecho} sinMarco />
        ) : actual.id === "aprobados" ? (
          <MisDias datos={datos} post={post} onHecho={onHecho} sinMarco />
        ) : (
          <MisSolicitudes solicitudes={sols} post={post} onHecho={onHecho} sinMarco />
        )}
      </div>
    </section>
  );
}

/* /vacaciones (vista de EQUIPO, backend v2): a la izquierda «Mis vacaciones»;
   a la derecha, el filtro por persona con la leyenda y el calendario de todo
   el equipo, con tus días en Lime y lo pendiente con borde discontinuo. Sin
   saldos: cuántos días le quedan a cada uno solo se ve en Coordinación. */
export default function MisVacacionesRoute() {
  const { theme } = useTheme();
  const mapAccent = useAccentMap();
  const [anio, setAnio] = useState(null);
  const { snap, reload, post } = useVacaciones(anio);
  const base = snap?.data;
  // Enero del año siguiente (si existe su pestaña): se carga aparte y se
  // suma al final del calendario, para gestionar Navidad sin cambiar de año.
  const anioSig = base?.anios?.includes(base.year + 1) ? base.year + 1 : null;
  const { snap: snapSig, reload: reloadSig } = useVacaciones(anioSig, { activo: !!anioSig });
  const d = useMemo(() => conEneroSiguiente(base, snapSig?.data), [base, snapSig]);
  const [filtros, setFiltros] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);
  const [hoy] = useState(() => new Date());

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

  // Días de mis solicitudes pendientes (contorno discontinuo en el calendario).
  const misPendientes = useMemo(() => {
    const set = new Set();
    const fxg = festivosDeGrupo(d?.festivosDetalle, d?.yo?.grupo);
    (d?.misSolicitudes || []).filter((s) => s.estado === "PENDIENTE" && s.clase !== "CANCELACION")
      .forEach((s) => laborables(s.desde, s.hasta, fxg).forEach((iso) => set.add(iso)));
    return set;
  }, [d]);

  const totalActivos = base ? base.empleados.filter((e) => e.activo).length : 0;
  const ausentesHoy = d && d.year === hoy.getFullYear() ? (d.ausenciasPorDia?.[dateKey(hoy)] || []).length : 0;
  const recargar = () => { reload(true); if (anioSig) reloadSig(true); };

  return (
    <main className="relative min-h-dvh w-full">
      <ArtBanner src={ART.equipo} />
      <AmbientBackground />
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-sand sm:text-4xl">Vacaciones</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-sand/65">
              Quién está fuera cada día. Tus días aprobados van en verde y los pendientes con borde discontinuo; pide los tuyos desde «Mis vacaciones».
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

        {snap?.actualizando && <p className="mb-3 text-xs text-sand/50" role="status">Actualizando…</p>}
        {snap?.avisoRecarga && <p className="mb-3 text-xs text-canary">No se pudo refrescar: {snap.avisoRecarga}</p>}
        {snap?.error ? (
          <ErrorCard mensaje={snap.error} onRetry={() => reload()} />
        ) : !d ? (
          <VacacionesSkeleton />
        ) : (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="lg:sticky lg:top-cabecera lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
              <MisVacaciones key={d.year} datos={d} post={post} onHecho={recargar} />
            </div>
            <div className="min-w-0 space-y-4">
              <FiltroPersonas
                empleados={datosVis.empleados}
                filtros={filtros}
                onToggle={toggleFiltro}
                onClear={() => setFiltros(new Set())}
                ausentesHoy={ausentesHoy}
                yo={d.yo?.nombre}
              />
              <Calendario
                datos={datosVis}
                filtros={filtros}
                totalActivos={totalActivos}
                onOpenDay={(dateStr, ausencias) => setSheet({ dateStr, ausencias })}
                yo={d.yo?.nombre}
                marca={misPendientes}
                marcaTexto="tienes una solicitud pendiente"
              />
            </div>
          </div>
        )}
        {datosVis && <DaySheet sheet={sheet} empleadosMap={datosVis.empleadosMap || {}} onClose={() => setSheet(null)} />}
      </div>
    </main>
  );
}
