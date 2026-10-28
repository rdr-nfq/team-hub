"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Link } from "next-view-transitions";
import { motion, useReducedMotion } from "framer-motion";
import { NIVELES, FORMACIONES, TRACKS, hrefDe, PROGRESO_EQUIPO } from "@/lib/formaciones";
import { estadoCurso, resumen } from "@/lib/progreso";
import { useTilt } from "@/hooks/useTilt";
import { rgba, n2 } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import { IconLock, IconCheck, IconArrow, IconPlay, IconGrad } from "../icons";

const EstructuraTower = dynamic(() => import("./EstructuraTower"), { ssr: false });

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const f = () => setD(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return d;
}

function CursoCard({ f, completadas, niveles, onMarcar }) {
  const st = estadoCurso(f, completadas, niveles);
  const tr = TRACKS[f.track];
  const color = tr.color;
  const done = st === "completada";
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const acc = useAccentMap(); // TRACKS como TEXTO -> tono AA por tema (el tinte de fondo mantiene el hex original)
  const { theme } = useTheme();
  const spotColor = done ? PALETTE.lime : color;

  // Toda la tarjeta es clicable (stretched-link) -> acceso rápido. Las acciones
  // secundarias (marcar/deshacer) van por encima (z-10). Tilt + spotlight + glow en hover.
  if (done || st === "disponible") {
    const base = done
      ? "border-lime/25 bg-lime/[0.07] hover:border-lime/55 hover:bg-lime/[0.13]"
      : "border-white/12 bg-white/[0.06] hover:border-serene/55 hover:bg-white/[0.11]";
    return (
      <div {...tilt} style={{ "--pc": rgba(spotColor, 0.85) }} className={`rdr-tilt group relative flex items-center gap-3 overflow-hidden rounded-2xl border p-3.5 backdrop-blur-md ${base}`}>
        <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(150px circle at var(--mx,50%) var(--my,50%), ${rgba(spotColor, 0.22)}, transparent 70%)` }} />
        {done ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-lime/20 text-lime"><IconCheck size={16} /></span>
        ) : (
          <span className="h-3 w-3 shrink-0 rounded-full ring-4 ring-transparent transition-all group-hover:ring-white/5" style={{ backgroundColor: color }} />
        )}
        <div className="min-w-0 flex-1">
          {/* enlace estirado: cubre toda la tarjeta */}
          <a href={hrefDe(f)} data-prerender aria-label={`${done ? "Repasar" : "Abrir"} ${f.titulo}`} className="block truncate text-sm font-semibold text-sand after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-serene">
            {f.titulo}
          </a>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-sand/70">
            <span className="inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide" style={{ color: acc(tr.color), backgroundColor: rgba(tr.color, 0.16) }}>{tr.nombre}</span>
            <span className="truncate tabular-nums">{done ? <span className="font-semibold uppercase tracking-wide text-lime/80">Completada · repasar</span> : f.duracion}</span>
          </span>
        </div>
        <span aria-hidden className={`relative hidden items-center gap-1 text-xs font-bold sm:flex ${done ? "text-lime" : "text-serene"} opacity-0 transition-opacity group-hover:opacity-100`}>
          {done ? "Repasar" : <><IconPlay size={12} /> Abrir</>}
        </span>
        <IconArrow size={16} aria-hidden className={`relative shrink-0 transition-transform duration-200 group-hover:translate-x-1 ${done ? "text-lime/70" : "text-sand/40 group-hover:text-serene"}`} />
        <button
          type="button"
          onClick={() => onMarcar(f.archivo, !done)}
          title={done ? "Marcar como no completada" : "Marcar como completada"}
          className={`relative z-10 grid h-9 shrink-0 place-items-center rounded-lg border text-[11px] transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${done ? "w-auto border-transparent px-2.5 text-sand/70 hover:bg-white/10 hover:text-sand" : "w-9 border-white/12 text-sand/70 hover:border-lime/50 hover:text-lime"}`}
        >
          {done ? "Deshacer" : <IconCheck size={14} />}
        </button>
      </div>
    );
  }

  return (
    <div aria-disabled="true" className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3.5 text-sand/40">
      <IconLock size={16} className="shrink-0" />
      <span className="flex-1 truncate text-sm">{f.titulo}</span>
      <span className="hidden shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide sm:inline-flex" style={{ color: rgba(acc(tr.color), theme === "light" ? 0.9 : 0.75), backgroundColor: rgba(tr.color, 0.1) }}>{tr.nombre}</span>
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider">{st === "proximamente" ? "Próximamente" : "Bloqueado"}</span>
    </div>
  );
}

function Node({ nv }) {
  const { theme } = useTheme();
  const e = nv.estado;
  // Halo del nodo "actual": serene brillante en oscuro, azul medio suave en claro.
  const glow = theme === "light" ? "shadow-[0_0_24px_-4px_rgba(0,19,145,.35)]" : "shadow-[0_0_24px_-4px_rgba(133,200,255,.7)]";
  const cls =
    e === "completado" ? "border-lime/60 bg-lime/20 text-lime"
      : e === "actual" ? `border-serene/70 bg-serene/15 text-serene ${glow}`
        : "border-white/15 bg-midnight/80 text-sand/45";
  return (
    <div className={`relative z-10 grid h-14 w-14 place-items-center rounded-2xl border-2 font-display text-sm font-bold backdrop-blur ${cls}`}>
      {e === "completado" ? <IconCheck size={22} /> : e === "bloqueado" || e === "proximamente" ? <IconLock size={18} /> : `N${n2(nv.n)}`}
      {e === "actual" && <span className="absolute -inset-1 -z-10 animate-ping rounded-2xl border border-serene/40" />}
    </div>
  );
}

function LevelSection({ lvl, nv, completadas, niveles, onMarcar, onActivate, reduce, isLast }) {
  const { theme } = useTheme();
  const items = FORMACIONES.filter((f) => f.nivel === lvl.n);
  const dim = nv.estado === "bloqueado";
  // Halo tras el texto para despegarlo de las partículas: Midnight en oscuro, Sand en claro.
  const textShadow =
    theme === "light"
      ? "0 1px 12px rgba(247,248,248,0.92), 0 0 3px rgba(247,248,248,0.7)"
      : "0 1px 12px rgba(7,14,70,0.92), 0 0 3px rgba(7,14,70,0.7)";
  return (
    <motion.section
      aria-labelledby={`niv-${lvl.n}`}
      data-level={lvl.n}
      initial={{ opacity: 0, y: reduce ? 0 : 44 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.25 }}
      onViewportEnter={() => onActivate(lvl.n)}
      onMouseEnter={() => onActivate(lvl.n)}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-3 pb-12"
    >
      {/* línea espina entre nodos */}
      {!isLast && <span aria-hidden className="absolute left-[1.75rem] top-14 -z-0 h-[calc(100%-2rem)] w-px -translate-x-1/2 bg-gradient-to-b from-white/25 to-white/5" />}

      <div className="row-span-2"><Node nv={nv} /></div>

      <div className={dim ? "opacity-60" : ""} style={{ textShadow }}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-display text-xs font-bold tabular-nums text-serene/70">N{n2(lvl.n)}</span>
          <h2 id={`niv-${lvl.n}`} className="font-display text-lg font-bold text-sand sm:text-xl">{lvl.titulo}</h2>
          {nv.estado === "completado" && <span className="rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lime">Completado</span>}
          {nv.estado === "actual" && <span className="rounded-full bg-serene/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-serene">Tu nivel</span>}
          {nv.tieneContenido && <span className="ml-auto tabular-nums text-xs text-sand/70">{nv.hechos}/{nv.total}</span>}
        </div>
        <p className="mt-0.5 text-sm text-sand/70">{lvl.subtitulo}</p>
      </div>

      <div className="col-start-2 space-y-2.5">
        {items.map((f) => (
          <CursoCard key={f.titulo} f={f} completadas={completadas} niveles={niveles} onMarcar={onMarcar} />
        ))}
      </div>
    </motion.section>
  );
}

export default function ProgresoTorre({ niveles, completadas, current, onMarcar }) {
  const desktop = useIsDesktop();
  const reduce = useReducedMotion();
  const r = resumen(completadas);
  const estados = NIVELES.map((l) => niveles[l.n].estado);

  // Nivel "activo" con el que interactúa la estructura 3D (scroll/hover).
  const [activeLevel, setActiveLevel] = useState(current);
  useEffect(() => setActiveLevel(current), [current]);

  // El hint de scroll se desvanece en cuanto el usuario empieza a desplazarse
  // (una sola dirección: no reaparece, para no parpadear al volver arriba).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => { if (window.scrollY > 24) setScrolled(true); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="relative">
      {/* Barra de progreso de scroll (CSS scroll-driven, sin JS) */}
      <div aria-hidden className="rdr-scrollbar" />
      {/* Fondo: estructura 3D interactiva (desktop) o espina CSS (móvil) */}
      {desktop ? (
        <EstructuraTower estados={estados} activeLevel={activeLevel} />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <span className="absolute left-1/2 top-0 h-full w-24 -translate-x-1/2 bg-gradient-to-b from-serene/15 via-purple/10 to-transparent blur-2xl" />
          <span className="rdr-blob left-[-10%] top-[20%] h-64 w-64" style={{ background: PALETTE.royal }} />
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-32 pt-28 sm:px-6">
        {/* Hero */}
        <header className="mb-14 rounded-3xl bg-midnight/35 px-4 py-6 text-center backdrop-blur-sm">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-serene/80">Ruta formativa</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">Formaciones RDR</h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-sand/65">Avanza por niveles: cada nivel que completas desbloquea el siguiente.</p>
          <div className="mx-auto mt-6 max-w-xs">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-serene/80">Tu progreso</span>
              <span className="tabular-nums text-sand/70">{r.hechos}/{r.total} · {r.pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-serene to-lime transition-[width] duration-700" style={{ width: `${r.pct}%` }} />
            </div>
          </div>
          {/* Progreso del equipo (arriba) */}
          <Link href={PROGRESO_EQUIPO} className="group mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-serene/30 bg-serene/10 px-4 py-2 text-xs font-bold text-serene backdrop-blur-md transition hover:border-serene/60 hover:bg-serene/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene">
            <IconGrad size={15} /> Progreso del equipo
            <IconArrow size={14} className="transition-transform group-hover:translate-x-1" />
          </Link>
          {!reduce && (
            <div className={`pointer-events-none mt-8 flex justify-center text-serene/60 transition-opacity duration-500 ${scrolled ? "opacity-0" : "opacity-100"}`} aria-hidden>
              <span className="animate-bounce"><IconArrow size={22} style={{ transform: "rotate(90deg)" }} /></span>
            </div>
          )}
        </header>

        {/* Niveles */}
        {NIVELES.map((lvl, i) => (
          <LevelSection
            key={lvl.n}
            lvl={lvl}
            nv={niveles[lvl.n]}
            completadas={completadas}
            niveles={niveles}
            onMarcar={onMarcar}
            onActivate={setActiveLevel}
            reduce={reduce}
            isLast={i === NIVELES.length - 1}
          />
        ))}

      </div>
    </main>
  );
}
