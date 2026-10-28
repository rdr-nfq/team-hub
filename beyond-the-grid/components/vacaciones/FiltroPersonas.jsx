"use client";

import { useState } from "react";
import { useTheme } from "@/lib/theme";
import { festivoStyle, alertColor, FESTIVO_LABEL } from "./constants";
import { MIO_COLOR, MARCA_COLOR } from "./Calendario";
import { IconUsers, IconFilterOff, IconChevron } from "./icons";

/* Barra de filtro de /vacaciones, encima del calendario: personas como chips
   (tú primero), quién falta hoy y una leyenda en una línea. Sustituye al
   EquipoPanel lateral, que dejaba la columna izquierda demasiado cargada. */

function Chip({ emp, on, dim, esYo, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(emp.nombre)}
      aria-pressed={on}
      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
        on ? "border-mandarin bg-mandarin/15 text-sand" : "border-white/12 text-sand/80 hover:border-white/30 hover:text-sand"
      } ${dim ? "opacity-45" : ""} ${emp.activo ? "" : "line-through"}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: emp.color }} aria-hidden />
      {emp.nombre}
      {esYo && <span className="rounded-full px-1.5 text-[9.5px] uppercase tracking-wide text-[#001391]" style={{ background: MIO_COLOR }}>Tú</span>}
    </button>
  );
}

export function Leyenda({ conMios = true }) {
  const { theme } = useTheme();
  const muestra = "h-3.5 w-3.5 shrink-0 rounded";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-sand/70" aria-label="Leyenda">
      {conMios && (
        <>
          <span className="inline-flex items-center gap-1.5"><span className={muestra} style={{ background: MIO_COLOR }} aria-hidden />Tus días</span>
          <span className="inline-flex items-center gap-1.5"><span className={muestra} style={{ outline: `2px dashed ${MARCA_COLOR(theme)}`, outlineOffset: "-2px" }} aria-hidden />Pendiente de aprobar</span>
        </>
      )}
      {["ES", "MX", "AMBOS"].map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`${muestra} border`} style={festivoStyle(k, theme)} aria-hidden />{FESTIVO_LABEL[k]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className={`${muestra} border-2`} style={{ borderColor: alertColor(theme) }} aria-hidden />Alerta: &lt;10 disponibles
      </span>
    </div>
  );
}

export default function FiltroPersonas({ empleados, filtros, onToggle, onClear, ausentesHoy = 0, yo = null }) {
  // En móvil la lista de personas va plegada para no empujar el calendario.
  const [abierto, setAbierto] = useState(false);
  const hay = filtros.size > 0;
  const orden = yo ? [...empleados.filter((e) => e.nombre === yo), ...empleados.filter((e) => e.nombre !== yo)] : empleados;

  return (
    <section aria-label="Filtrar por persona" className="rounded-2xl border border-white/12 bg-white/[0.055] p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls="filtro-personas"
          className="inline-flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene lg:pointer-events-none"
        >
          <IconUsers size={16} className="text-mandarin" />
          <span className="font-display text-base font-bold text-sand">Equipo</span>
          <IconChevron size={16} className={`text-sand/50 transition-transform lg:hidden ${abierto ? "rotate-180" : ""}`} />
        </button>
        <span className="text-[12px] text-sand/60">
          {filtros.size === 1 ? "Modo persona: el calendario marca sus días" : hay ? `${filtros.size} personas seleccionadas` : "Toca un nombre para ver solo sus días"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {hay && (
            <button
              type="button" onClick={onClear}
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-sand/80 transition hover:border-white/40 hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            >
              <IconFilterOff size={13} /> Quitar filtros
            </button>
          )}
          <span className="rounded-full border border-mandarin/40 bg-mandarin/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-mandarin">
            {ausentesHoy} fuera hoy
          </span>
        </span>
      </div>

      <div id="filtro-personas" className={`${abierto ? "flex" : "hidden"} mt-3 max-h-[132px] flex-wrap gap-1.5 overflow-y-auto lg:flex`} role="group" aria-label="Personas">
        {orden.map((emp) => (
          <Chip key={emp.nombre} emp={emp} on={filtros.has(emp.nombre)} dim={hay && !filtros.has(emp.nombre)} esYo={!!yo && emp.nombre === yo} onToggle={onToggle} />
        ))}
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <Leyenda conMios={!!yo} />
      </div>
    </section>
  );
}
