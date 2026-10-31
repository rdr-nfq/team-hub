"use client";

import { Link } from "next-view-transitions";
import { useReducedMotion } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import { EQUIPO } from "@/lib/equipos";
import { useAuth } from "../chrome/AuthGate";
import { IconArrow, IconLock } from "../icons";

/* Capa intermedia «elige equipo» (HUB Formativo, Welcome Packs…): una
   tarjeta por equipo. Lo que aún no existe sale bloqueado con «En progreso».
   opciones: [{ equipo, label, desc, href? }]  (sin href = en progreso)
   color: el de la SECCIÓN del hub a la que pertenece (Formación = Serene). */

function Tarjeta({ op, delay, mio, color }) {
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const mapAccent = useAccentMap();
  const eq = EQUIPO[op.equipo];
  const Icon = op.icon;
  const bloqueado = !op.href;
  const cls = "rdr-rise rdr-tilt group relative flex min-h-[220px] flex-col justify-between gap-4 overflow-hidden rounded-2xl border p-6 backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";
  const style = { animationDelay: `${delay}ms`, borderColor: rgba(color, bloqueado ? 0.25 : 0.55), "--pc": rgba(color, 0.75) };
  const contenido = (
    <>
      <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(220px circle at var(--mx,50%) var(--my,50%), ${rgba(color, 0.22)}, transparent 70%)` }} />
      <div className="relative flex items-start justify-between gap-3">
        <span className="grid h-12 w-12 place-items-center rounded-xl border" style={{ borderColor: rgba(color, 0.35), background: rgba(color, 0.14), color: mapAccent(color) }}>
          {bloqueado ? <IconLock size={22} /> : Icon ? <Icon size={24} /> : null}
        </span>
        <span className="flex flex-col items-end gap-1.5">
          {bloqueado && (
            <span className="rounded-full border border-white/20 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sand/70">En progreso</span>
          )}
          {mio && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: rgba(color, 0.18), color: mapAccent(color) }}>Tu equipo</span>}
        </span>
      </div>
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: mapAccent(color) }}>{eq?.nombre}</p>
        <p className="mt-1 font-display text-2xl font-bold text-sand">{op.label}</p>
        <p className="mt-1.5 text-sm text-sand/65">{op.desc}</p>
      </div>
      <span className="relative flex items-center gap-1.5 text-sm font-bold" style={{ color: bloqueado ? undefined : mapAccent(color) }}>
        {bloqueado ? <span className="text-sand/45">Disponible próximamente</span> : <>Entrar <IconArrow size={16} className="transition-transform group-hover:translate-x-1" /></>}
      </span>
    </>
  );
  if (bloqueado)
    return (
      <div aria-disabled="true" title="En progreso: todavía no está disponible" className={`${cls} cursor-not-allowed bg-white/[0.03] opacity-70`} style={style}>
        {contenido}
      </div>
    );
  return (
    <Link {...tilt} href={op.href} aria-label={`${op.label} — ${eq?.nombre}`} className={`${cls} bg-white/[0.055] hover:bg-white/[0.08]`} style={style}>
      {contenido}
    </Link>
  );
}

export default function SelectorEquipo({ kicker, titulo, intro, opciones, color = PALETTE.serene }) {
  const { equipos } = useAuth();
  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: color }} />
        <span className="rdr-blob right-[2%] top-[20%] h-72 w-72" style={{ background: PALETTE.serene, animationDelay: "-4s" }} />
        <span className="rdr-blob bottom-[-10%] left-[30%] h-96 w-96" style={{ background: PALETTE.royal, animationDelay: "-8s" }} />
      </div>
      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-8">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-serene/80">{kicker}</p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">{titulo}</h1>
          {intro && <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">{intro}</p>}
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {opciones.map((op, i) => <Tarjeta key={op.equipo} op={op} delay={i * 70} color={color} mio={(equipos || []).includes(op.equipo)} />)}
        </div>
      </div>
    </main>
  );
}
