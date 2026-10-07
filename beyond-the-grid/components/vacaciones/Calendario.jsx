"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import {
  MESES, DIAS_SEMANA, UMBRAL_ALERTA,
  festivoStyle, festivoNumColor, alertColor, FESTIVO_LABEL,
  dateKey, motivoDe, heatStyle, textOn,
} from "./constants";

const ACCENT = PALETTE.mandarin;
// Color de "mis días" y de la selección (exportados para las leyendas).
export const YO_COLOR = (theme) => (theme === "light" ? "#1B7A3E" : "#88E783");
export const MARCA_COLOR = (theme) => (theme === "light" ? "#5B4BD6" : "#9694FF");

/** ¿El dispositivo tiene puntero con hover? (tooltip) o es táctil (bottom sheet). */
function useCanHover() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(hover: hover) and (pointer: fine)");
    const f = () => setCan(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return can;
}

/** Tooltip flotante (sustituto React del tippy.js del legacy, solo desktop). */
function DayTooltip({ tip }) {
  const { theme } = useTheme();
  const mapAccent = useAccentMap();
  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 150), (typeof window !== "undefined" ? window.innerWidth : 1200) - 150);
  // Superficie sólida elevada por tema (mismo criterio que usePanel de /retro):
  // navy sobre Midnight, panel casi blanco con tinta Midnight sobre Sand.
  const panel = theme === "light"
    ? "bg-[#FDFDFE]/95 shadow-[0_18px_40px_-12px_rgba(7,14,70,0.3)]"
    : "bg-[#0c1656]/95 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]";
  return (
    <div
      role="tooltip"
      className={`pointer-events-none fixed z-50 w-[280px] -translate-x-1/2 -translate-y-full rounded-xl border border-serene/25 ${panel} p-3 backdrop-blur-md`}
      style={{ left, top: tip.y - 10 }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-serene">
        Ausencias ({tip.ausencias.length})
      </p>
      <hr className="my-2 border-white/15" />
      {tip.ausencias.map((a, i) => {
        const emp = tip.empleadosMap[a.nombre];
        const motivo = motivoDe(a.motivo);
        return (
          <div key={`${a.nombre}-${i}`} className="mb-2 flex items-center justify-between gap-3 last:mb-0">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: emp?.color || mapAccent(PALETTE.serene) }} />
              <span className={`truncate text-[13px] text-sand ${emp && !emp.activo ? "opacity-60 line-through" : ""}`}>
                {emp?.nombre || a.nombre}
              </span>
            </span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
              style={{ backgroundColor: motivo.bg, color: motivo.text }}
            >
              {motivo.texto}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Celda de día. Sin puntitos: el nº de ausentes va centrado sobre un fondo
 * de calor mandarin por tramos (1 / 2-3 / 4+). Festivos, hoy y fin de semana
 * conservan su tratamiento y el número convive (como chip sobre festivo/hoy).
 * En "modo persona" (exactamente 1 filtro) sus días se pintan sólidos con el
 * color de su equipo y el resto de días con gente se atenúan en gris.
 */
function DayCell({
  dia, mesNombre, dateStr, esHoy, esFinde, festivo, alerta,
  count, ausenciasClick, personaMode, personaNombre, personaAusente, personaColor,
  empleadosMap, canHover, onOpenDay, onTip, mio = false, marcado = false,
}) {
  const { theme } = useTheme();
  const light = theme === "light";
  const clicable = ausenciasClick.length > 0;

  let cls = "relative flex min-h-[52px] flex-col rounded-md border p-1 transition sm:min-h-[48px]";
  const style = {};
  const sombras = [];
  if (festivo && festivoStyle(festivo, theme)) {
    Object.assign(style, festivoStyle(festivo, theme));
  } else if (esHoy) {
    cls += " border-serene/80";
    style.background = light ? "rgba(0,19,145,0.08)" : "rgba(0,19,145,0.5)";
    sombras.push(`inset 0 0 0 1px ${light ? "rgba(21,95,168,0.6)" : "rgba(133,200,255,0.6)"}`);
  } else if (esFinde) {
    cls += " border-white/10 bg-white/[0.07]";
  } else {
    cls += " border-white/10 bg-white/[0.03]";
  }

  // Mapa de calor (solo fuera del modo persona). Sobre festivo/hoy no se pisa
  // el fondo: el nº va en chip con los colores del tramo.
  const heat = !personaMode && count > 0 ? heatStyle(count, theme) : null;
  const heatFills = heat && !festivo && !esHoy;
  if (heatFills) {
    style.background = heat.cell.background;
    style.borderColor = heat.cell.borderColor;
  }

  // Modo persona: día de la persona -> sólido con el color de su equipo.
  let personaTinta = null;
  if (personaMode && personaAusente) {
    personaTinta = textOn(personaColor);
    style.background = personaColor;
    style.backgroundImage = "none";
    style.borderColor = personaColor;
  }

  // Alerta de personal: anillo rojo interior (compatible con el foco global).
  if (alerta) sombras.push(`inset 0 0 0 2px ${alertColor(theme)}`);
  // Mis días: anillo lime (vista de equipo). Selección: contorno purple
  // discontinuo (la solicitud que coordinación está revisando).
  if (mio) sombras.push(`inset 0 0 0 2px ${YO_COLOR(theme)}`);
  if (marcado) {
    style.outline = `2px dashed ${MARCA_COLOR(theme)}`;
    style.outlineOffset = "1px";
  }
  if (sombras.length) style.boxShadow = sombras.join(", ");
  if (clicable) cls += " cursor-pointer hover:-translate-y-px hover:border-serene/60";

  // Color del nº de día pequeño según fondo.
  let numDia;
  if (personaTinta) numDia = personaTinta;
  else if (heatFills && heat.solid) numDia = heat.num.color;
  else if (!esHoy && festivo) numDia = festivoNumColor(festivo, theme);

  const inner = (
    <>
      {esHoy ? (
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-serene text-xs font-bold text-midnight">{dia}</span>
      ) : (
        <span className="shrink-0 pl-0.5 text-xs font-bold text-sand/60" style={numDia ? { color: numDia, opacity: personaTinta || heat?.solid ? 0.85 : undefined } : undefined}>
          {dia}
        </span>
      )}
      {mio && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full" style={{ background: YO_COLOR(theme) }} />}
      {/* Contenido central */}
      {personaMode ? (
        !personaAusente && count > 0 ? (
          <span aria-hidden className="flex flex-1 items-center justify-center pb-0.5 text-sm font-bold tabular-nums text-sand/35">
            {count}
          </span>
        ) : null
      ) : count > 0 ? (
        <span aria-hidden className="flex flex-1 items-center justify-center pb-0.5">
          {heatFills ? (
            <span className="text-[15px] font-bold leading-none tabular-nums" style={heat.num}>{count}</span>
          ) : (
            <span
              className="rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums"
              style={{ background: heat.cell.background, borderColor: heat.cell.borderColor, color: heat.num.color }}
            >
              {count}
            </span>
          )}
        </span>
      ) : null}
    </>
  );

  const partes = [];
  if (festivo) partes.push(FESTIVO_LABEL[festivo]);
  if (esHoy) partes.push("hoy");
  if (alerta) partes.push("alerta de personal");
  if (mio) partes.push("tienes ausencia");
  if (marcado) partes.push("en la solicitud seleccionada");
  const base = `${dia} de ${mesNombre.toLowerCase()}`;
  const ariaLabel =
    personaMode && personaAusente
      ? `${base}: ${personaNombre} ausente${partes.length ? " · " + partes.join(" · ") : ""}`
      : `${base}: ${count} ausente${count === 1 ? "" : "s"}${partes.length ? " · " + partes.join(" · ") : ""}`;

  // Con ausencias: la celda es un botón (tap/Enter abre el detalle; hover con
  // puntero fino muestra tooltip, como tippy en el legacy).
  if (clicable) {
    return (
      <button
        type="button"
        className={`${cls} text-left`}
        style={style}
        aria-label={ariaLabel}
        onClick={() => { onTip(null); onOpenDay(dateStr, ausenciasClick); }}
        onMouseEnter={canHover ? (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onTip({ x: r.left + r.width / 2, y: r.top, ausencias: ausenciasClick, empleadosMap });
        } : undefined}
        onMouseLeave={canHover ? () => onTip(null) : undefined}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls} style={style} aria-label={ariaLabel}>{inner}</div>;
}

function MonthCard({ mes, anio, hoyStr, festivos, ausenciasPorDia, filtros, personaNombre, personaColor, totalActivos, empleadosMap, canHover, onOpenDay, onTip, delay, yo, marca }) {
  const { theme } = useTheme();
  const mapAccent = useAccentMap();
  const primerDia = new Date(anio, mes, 1);
  const ultDia = new Date(anio, mes + 1, 0);
  let offset = primerDia.getDay() - 1;
  if (offset === -1) offset = 6;

  const personaMode = !!personaNombre;
  const celdas = [];
  let contieneHoy = false;

  for (let i = 0; i < offset; i++) celdas.push(<div key={`e${i}`} aria-hidden />);

  for (let dia = 1; dia <= ultDia.getDate(); dia++) {
    const fechaObj = new Date(anio, mes, dia);
    const dateStr = dateKey(fechaObj);
    const esHoy = dateStr === hoyStr;
    if (esHoy) contieneHoy = true;
    const esFinde = fechaObj.getDay() === 0 || fechaObj.getDay() === 6;
    const festivo = festivos[dateStr];

    const ausencias = Array.from(ausenciasPorDia[dateStr] || []);
    const ausenciasFiltradas = filtros.size > 0 ? ausencias.filter((a) => filtros.has(a.nombre)) : ausencias;
    const personaAusente = personaMode && ausenciasFiltradas.length > 0;

    // La alerta usa TODAS las ausencias (no las filtradas), como el legacy.
    const disponibles = totalActivos - ausencias.length;
    const alerta = disponibles < UMBRAL_ALERTA && !esFinde && !festivo;

    celdas.push(
      <DayCell
        key={dateStr}
        dia={dia}
        mesNombre={MESES[mes]}
        dateStr={dateStr}
        esHoy={esHoy}
        esFinde={esFinde}
        festivo={festivo}
        alerta={alerta}
        // Nº mostrado: en modo persona, el total del día (atenuado); con
        // multi-filtro, solo las personas filtradas; sin filtros, el total.
        count={personaMode ? ausencias.length : ausenciasFiltradas.length}
        // Detalle al click/hover: en modo persona interesa el día completo
        // (contexto de quién más falta); con multi-filtro, lo filtrado.
        ausenciasClick={personaMode ? ausencias : ausenciasFiltradas}
        personaMode={personaMode}
        personaNombre={personaNombre}
        personaAusente={personaAusente}
        personaColor={personaColor}
        empleadosMap={empleadosMap}
        canHover={canHover}
        onOpenDay={onOpenDay}
        onTip={onTip}
        mio={!!yo && ausencias.some((a) => a.nombre === yo)}
        marcado={!!marca && marca.has(dateStr)}
      />
    );
  }

  return (
    <section
      aria-label={`${MESES[mes]} ${anio}`}
      className={`rdr-rise rounded-2xl border p-4 backdrop-blur-md transition hover:-translate-y-1 ${
        theme === "light"
          ? "hover:shadow-[0_24px_48px_-20px_rgba(7,14,70,0.25)]"
          : "hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)]"
      } ${contieneHoy ? "bg-white/[0.07]" : "border-white/12 bg-white/[0.055]"}`}
      style={{
        animationDelay: `${delay}ms`,
        ...(contieneHoy ? { borderColor: rgba(ACCENT, 0.65), boxShadow: `0 0 24px -8px ${rgba(ACCENT, 0.35)}` } : null),
      }}
    >
      <h3 className="mb-3 flex items-baseline justify-between font-display text-lg font-bold text-sand">
        {MESES[mes]}
        {contieneHoy && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ background: rgba(ACCENT, 0.15), color: mapAccent(ACCENT) }}>
            Mes actual
          </span>
        )}
      </h3>
      <div className="mb-2 grid grid-cols-7 border-b border-white/10 pb-2 text-center text-[10px] font-bold tracking-[0.06em] text-sand/50">
        {DIAS_SEMANA.map((d) => (<span key={d}>{d}</span>))}
      </div>
      <div className="grid grid-cols-7 gap-1">{celdas}</div>
    </section>
  );
}

/**
 * Calendario anual (12 meses agrupados por TRIMESTRE). Los trimestres ya
 * pasados se pliegan en una barra clicable (con su nº de ausencias), de modo
 * que el mes actual queda a la vista de un vistazo; el resto igual que
 * siempre: semana empieza en lunes, festivos ES/MX/AMBOS, hoy resaltado,
 * alerta si quedan <10 disponibles, mapa de calor y "modo persona" con
 * exactamente 1 filtro.
 */
export default function Calendario({ datos, filtros, totalActivos, onOpenDay, yo = null, marca = null }) {
  const canHover = useCanHover();
  const mapAccent = useAccentMap();
  const [tip, setTip] = useState(null);
  const tipRef = useRef(null);
  tipRef.current = tip;
  // Trimestres pasados que el usuario ha desplegado a mano.
  const [abiertos, setAbiertos] = useState(() => new Set());

  // El tooltip es fijo (viewport): si el usuario hace scroll, se cierra.
  useEffect(() => {
    const onScroll = () => { if (tipRef.current) setTip(null); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const anio = datos.year || new Date().getFullYear();
  const hoyStr = dateKey(new Date());
  const hoy = new Date();
  // Solo se pliegan trimestres PASADOS del año en curso (si el calendario
  // publicado fuera de otro año, se muestra entero como siempre).
  const qActual = Math.floor(hoy.getMonth() / 3);
  const plegable = (q) => anio === hoy.getFullYear() && q < qActual;

  // Nº de ausencias registradas por trimestre (para la barra plegada).
  const ausenciasPorQ = useMemo(() => {
    const tot = [0, 0, 0, 0];
    Object.entries(datos.ausenciasPorDia || {}).forEach(([k, lista]) => {
      const m = Number(k.slice(5, 7));
      if (m >= 1 && m <= 12) tot[Math.floor((m - 1) / 3)] += (lista || []).length;
    });
    return tot;
  }, [datos.ausenciasPorDia]);

  // Modo persona: exactamente UNA persona filtrada en el EquipoPanel.
  const { personaNombre, personaColor } = useMemo(() => {
    if (filtros.size !== 1) return { personaNombre: null, personaColor: null };
    const nombre = Array.from(filtros)[0];
    const emp = (datos.empleadosMap || {})[nombre];
    return { personaNombre: nombre, personaColor: emp?.color || PALETTE.mandarin };
  }, [filtros, datos.empleadosMap]);

  const toggleQ = (q) =>
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });

  return (
    <div className="space-y-4" role="presentation">
      {[0, 1, 2, 3].map((q) => {
        const pliega = plegable(q);
        // Un trimestre pasado se abre solo si contiene la selección (marca).
        const conMarca = !!marca && Array.from(marca).some((k) => Math.floor((Number(k.slice(5, 7)) - 1) / 3) === q);
        const abierto = !pliega || abiertos.has(q) || conMarca;
        return (
          <div key={q}>
            {pliega && (
              <button
                type="button"
                onClick={() => toggleQ(q)}
                aria-expanded={abierto}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-left backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <span aria-hidden className={`text-[11px] text-sand/50 transition-transform ${abierto ? "rotate-90" : ""}`}>▶</span>
                <span className="text-[13px] font-bold text-sand">
                  Q{q + 1} · {MESES[q * 3]} — {MESES[q * 3 + 2]}
                </span>
                <span className="text-[11px] text-sand/45">trimestre pasado</span>
                <span className="ml-auto text-[11px] font-bold tabular-nums" style={{ color: mapAccent(ACCENT) }}>
                  {ausenciasPorQ[q]} ausencia{ausenciasPorQ[q] === 1 ? "" : "s"}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wide text-sand/55">
                  {abierto ? "Ocultar" : "Ver"}
                </span>
              </button>
            )}
            {abierto && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {[q * 3, q * 3 + 1, q * 3 + 2].map((mes, i) => (
                  <MonthCard
                    key={mes}
                    mes={mes}
                    anio={anio}
                    hoyStr={hoyStr}
                    festivos={datos.festivos || {}}
                    ausenciasPorDia={datos.ausenciasPorDia || {}}
                    filtros={filtros}
                    personaNombre={personaNombre}
                    personaColor={personaColor}
                    totalActivos={totalActivos}
                    empleadosMap={datos.empleadosMap || {}}
                    canHover={canHover}
                    onOpenDay={onOpenDay}
                    onTip={setTip}
                    delay={i * 30}
                    yo={yo}
                    marca={marca}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {canHover && <DayTooltip tip={tip} />}
    </div>
  );
}
