"use client";

import { useState } from "react";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import { festivoStyle, alertColor, FESTIVO_LABEL } from "./constants";
import { IconUsers, IconFilterOff, IconChevron } from "./icons";

const ACCENT = PALETTE.mandarin;

/** Tarjeta de persona: dot de color + nombre + badges Eq/Cons/Pend. */
function EmpCard({ emp, seleccionado, hayFiltros, onToggle, esYo }) {
  const dimmed = hayFiltros && !seleccionado;
  return (
    <button
      type="button"
      onClick={() => onToggle(emp.nombre)}
      aria-pressed={seleccionado}
      className={`group/emp flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
        seleccionado
          ? "border-mandarin/70 bg-mandarin/10"
          : "border-transparent hover:border-white/20 hover:bg-white/[0.06]"
      } ${dimmed ? "opacity-40 grayscale" : ""}`}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/15"
        style={{ backgroundColor: emp.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13px] font-bold ${
            emp.activo ? "text-sand" : "font-normal text-sand/45 line-through"
          }`}
        >
          {emp.nombre}
          {esYo && <span className="ml-1.5 rounded-full bg-lime/15 px-1.5 py-px align-middle text-[9.5px] font-bold uppercase tracking-wide text-lime">Tú</span>}
        </span>
        <span className="mt-1 flex flex-wrap gap-1 text-[10px] text-sand/60">
          {emp.equipo ? (
            <span className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-px tabular-nums">
              Eq. <b className="text-sand/85">{emp.equipo}</b>
            </span>
          ) : null}
          {/* Saldos solo si el backend los manda (el antiguo sí; el nuevo, nunca en la vista de equipo). */}
          {emp.consumidas != null && (
            <span className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-px tabular-nums">
              Cons: <b className="text-sand/85">{emp.consumidas}</b>
            </span>
          )}
          {emp.pendientes != null && (
            <span className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-px tabular-nums">
              Pend: <b className="text-sand/85">{emp.pendientes}</b>
            </span>
          )}
          {emp.grupo ? (
            <span className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-px">{emp.grupo}</span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function Leyenda({ paletaEquipos, equiposEnUso, extra }) {
  const { theme } = useTheme();
  return (
    <div className="border-t border-white/10 px-4 py-4 text-xs text-sand/70">
      {equiposEnUso.length > 0 && (
        <div className="mb-3 border-b border-white/10 pb-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sand/50">Equipos</p>
          {equiposEnUso.map((num) => (
            <div key={num} className="mb-1.5 flex items-center gap-2.5 last:mb-0">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: paletaEquipos[num] }} aria-hidden />
              Equipo {num}
            </div>
          ))}
        </div>
      )}
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-sand/50">Leyenda</p>
      {["ES", "MX", "AMBOS"].map((k) => (
        <div key={k} className="mb-1.5 flex items-center gap-2.5">
          <span className="h-3.5 w-3.5 shrink-0 rounded border" style={festivoStyle(k, theme)} aria-hidden />
          {FESTIVO_LABEL[k]}
        </div>
      ))}
      <div className="flex items-center gap-2.5">
        <span className="h-3.5 w-3.5 shrink-0 rounded border-2" style={{ borderColor: alertColor(theme) }} aria-hidden />
        Alerta: &lt;10 disponibles
      </div>
      {extra}
    </div>
  );
}

/**
 * Panel de equipo: lista de personas (filtro multi-selección, como el legacy)
 * + leyenda de festivos/equipos. En móvil es plegable para no empujar el
 * calendario fuera de la vista; en desktop va siempre abierto y sticky.
 */
export default function EquipoPanel({ empleados, paletaEquipos, filtros, onToggle, onClear, ausentesHoy = 0, yo = null, leyendaExtra = null }) {
  const [abierto, setAbierto] = useState(false);
  const mapAccent = useAccentMap();
  const hayFiltros = filtros.size > 0;

  const equiposEnUso = Array.from(
    new Set(empleados.map((e) => e.equipo).filter((eq) => eq && paletaEquipos && paletaEquipos[eq]))
  ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return (
    <section
      aria-label="Equipo y filtros"
      className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md"
      style={{ boxShadow: `inset 0 2px 0 ${rgba(ACCENT, 0.6)}` }}
    >
      {/* Cabecera: en móvil actúa de disclosure; en desktop es solo título. */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="equipo-panel-body"
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene lg:pointer-events-none"
      >
        {/* Texto/icono con acento temado (legible en claro); tintes de fondo/borde con el hex original. */}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border" style={{ borderColor: rgba(ACCENT, 0.35), background: rgba(ACCENT, 0.12), color: mapAccent(ACCENT) }}>
          <IconUsers size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-bold leading-tight text-sand">Equipo</span>
          <span className="block text-[11px] text-sand/60">
            {filtros.size === 1
              ? "Modo persona: el calendario marca sus días"
              : hayFiltros
                ? `${filtros.size} seleccionadas — toca para filtrar`
                : "Toca un nombre para filtrar"}
          </span>
        </span>
        {/* Contador de ausentes de HOY (fecha real del cliente). */}
        <span
          className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ borderColor: rgba(ACCENT, 0.35), background: rgba(ACCENT, 0.12), color: mapAccent(ACCENT) }}
          aria-label={`${ausentesHoy} ${ausentesHoy === 1 ? "ausente" : "ausentes"} hoy`}
        >
          {ausentesHoy} hoy
        </span>
        <IconChevron size={18} className={`shrink-0 text-sand/50 transition-transform lg:hidden ${abierto ? "rotate-180" : ""}`} />
      </button>

      <div id="equipo-panel-body" className={`${abierto ? "block" : "hidden"} lg:block`}>
        {hayFiltros && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] transition hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              style={{ borderColor: rgba(ACCENT, 0.4), background: rgba(ACCENT, 0.12), color: mapAccent(ACCENT) }}
            >
              <IconFilterOff size={13} /> Quitar filtros
            </button>
          </div>
        )}

        <div className="max-h-[50vh] space-y-1 overflow-y-auto px-2 pb-2 lg:max-h-[46vh]" role="list" aria-label="Miembros del equipo">
          {empleados.map((emp) => (
            <div role="listitem" key={emp.nombre}>
              <EmpCard emp={emp} seleccionado={filtros.has(emp.nombre)} hayFiltros={hayFiltros} onToggle={onToggle} esYo={!!yo && emp.nombre === yo} />
            </div>
          ))}
        </div>

        <Leyenda paletaEquipos={paletaEquipos || {}} equiposEnUso={equiposEnUso} extra={leyendaExtra} />
      </div>
    </section>
  );
}
