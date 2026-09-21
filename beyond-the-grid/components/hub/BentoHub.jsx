"use client";

import { useEffect, useRef } from "react";
import { Link } from "next-view-transitions";
import { useReducedMotion } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";
import { useLowPower } from "@/hooks/useLowPower";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import {
  IconBook, IconLink, IconUtensils, IconCalendar, IconRefresh, IconClock,
  IconRocket, IconCode, IconFolder, IconShield, IconArrow, IconExternal,
  IconCopy, IconGrad, IconOrbit,
} from "../icons";

// Estructura por TIPO. Cada sección = una columna. Acciones:
// page (html), route (ruta Next), open (externo links.json), copy (portapapeles).
// Tarjetas multi-acción: varias pills (Time Report NFQ+BBVA, Repositorio GitHub+Drive).
const SECTIONS = [
  {
    id: "form", n: "01", title: "Formación", color: PALETTE.serene,
    items: [
      { kind: "feature", label: "HUB Formativo", desc: "Ruta por niveles 00–06", icon: IconGrad, action: "route", target: "/formacion" },
      { label: "¿Qué es RDR?", desc: "Presentación de introducción", icon: IconBook, action: "route", target: "/que-es-rdr" },
      { label: "Portal BBVA CIB", desc: "Portal corporativo del equipo", icon: IconLink, action: "copy", target: "portalBBVACIB" },
    ],
  },
  {
    id: "equipo", n: "02", title: "Equipo", color: PALETTE.mandarin,
    items: [
      { label: "Comidas", desc: "Restaurante de los jueves", icon: IconUtensils, action: "route", target: "/comidas" },
      { label: "Vacaciones", desc: "Calendario y política", icon: IconCalendar, action: "route", target: "/vacaciones" },
      { label: "Retrospectiva", desc: "Retros y mejoras", icon: IconRefresh, action: "route", target: "/retro" },
      { label: "Time Report", desc: "Tu imputación de la quincena", icon: IconClock, action: "route", target: "/timereport" },
      { label: "Guardias", desc: "Solicita y consulta tus guardias", icon: IconShield, action: "route", target: "/guardias" },
    ],
  },
  {
    id: "proy", n: "03", title: "Proyectos", color: PALETTE.lime,
    items: [
      { label: "Pases Calendados", desc: "Releases por entorno", icon: IconRocket, action: "route", target: "/pases" },
      { label: "Recursos", desc: "Biblioteca de referencia RDR", icon: IconBook, action: "route", target: "/recursos" },
      { label: "Planificación", desc: "Hoja de planificación", icon: IconCalendar, action: "open", target: "planificacionNFQ" },
      { label: "Repositorio", desc: "Código y documentación", icon: IconFolder, actions: [
        { label: "GitHub", action: "copy", target: "githubBBVA", icon: IconCode },
        { label: "Drive", action: "copy", target: "driveBBVA", icon: IconFolder },
      ] },
    ],
  },
];

const COORD_SECTION = {
  id: "coord", n: "04", title: "Coordinación", color: PALETTE.purple,
  items: [
    { label: "Simulador", desc: "Rentabilidad por Q", icon: IconShield, action: "route", target: "/simulador" },
    { label: "Capacidad", desc: "Personas y proyectos", icon: IconShield, action: "route", target: "/capacidad" },
    { label: "Ofertas", desc: "Generador de ofertas", icon: IconRocket, action: "route", target: "/ofertas" },
    { label: "Time Report", desc: "Proyectos y reparto de horas", icon: IconClock, action: "route", target: "/timereport-gestion" },
    { label: "Guardias", desc: "Solicitudes del equipo", icon: IconShield, action: "route", target: "/guardias-gestion" },
    { label: "Gestión de equipo", desc: "Miembros, roles y tracks", icon: IconShield, action: "route", target: "/equipo-gestion" },
  ],
};

const HintIcon = (action) => (action === "copy" ? IconCopy : action === "open" ? IconExternal : IconArrow);

function AmbientBackground({ lite }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || lite) return;
    let raf = 0;
    const onMove = (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (ref.current) ref.current.style.transform = `translate3d(${(x * 28).toFixed(1)}px, ${(y * 28).toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, [reduce, lite]);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden transition-transform duration-300 ease-out">
      <span className="rdr-blob left-[-8%] top-[6%] h-80 w-80" style={{ background: PALETTE.royal }} />
      <span className="rdr-blob right-[4%] top-[-8%] h-72 w-72" style={{ background: PALETTE.serene, animationDelay: "-3s" }} />
      <span className="rdr-blob bottom-[-12%] right-[-4%] h-96 w-96" style={{ background: PALETTE.purple, animationDelay: "-7s" }} />
      <span className="rdr-blob bottom-[4%] left-[16%] h-72 w-72" style={{ background: PALETTE.lime, animationDelay: "-11s" }} />
    </div>
  );
}

// Pill de acción (para tarjetas multi-acción).
function ActionPill({ a, accent }) {
  const { getUrl, copyLink } = useLinks();
  const mapAccent = useAccentMap();
  const Glyph = a.icon || HintIcon(a.action);
  const cls = "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";
  // Texto/icono con acento temado (legible en claro); tintes de fondo/borde con el hex original.
  const style = { borderColor: rgba(accent, 0.3), background: rgba(accent, 0.1), color: mapAccent(accent) };
  const inner = (<><Glyph size={14} /> {a.label}</>);
  if (a.action === "page") return <a href={a.target} className={cls} style={style}>{inner}</a>;
  if (a.action === "open") {
    const url = getUrl(a.target);
    if (!url) return <span className={`${cls} cursor-not-allowed opacity-50`} style={style} title="No disponible">{inner}</span>;
    return <a href={url} target="_blank" rel="noopener noreferrer" className={cls} style={style}>{inner}</a>;
  }
  return <button type="button" onClick={() => copyLink(a.target)} className={cls} style={style}>{inner}</button>;
}

// rounded-2xl: mismo radio de tarjeta que FeatureCard, TypeColumn y las
// tarjetas de /formacion (CursoCard, Node) — una sola escala de esquinas en toda la app.
const CARD =
  "rdr-rise rdr-tilt group relative box-border flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border p-4 backdrop-blur-md lg:min-h-0 lg:flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";

function CardInner({ item, accent }) {
  const { icon: Icon } = item;
  const mapAccent = useAccentMap();
  const Hint = HintIcon(item.action);
  return (
    <>
      <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(140px circle at var(--mx,50%) var(--my,50%), ${rgba(accent, 0.22)}, transparent 70%)` }} />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: rgba(accent, 0.3), background: rgba(accent, 0.12), color: mapAccent(accent) }}>
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-sand">{item.label}</span>
        {item.desc && <span className="block truncate text-[13px] text-sand/70">{item.desc}</span>}
      </span>
      <Hint size={17} className="shrink-0 text-sand/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-sand/85" />
    </>
  );
}

function Card({ item, accent, delay }) {
  const { getUrl, copyLink } = useLinks();
  const mapAccent = useAccentMap();
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const style = { animationDelay: `${delay}ms`, borderColor: rgba(accent, 0.5), "--pc": rgba(accent, 0.75) };
  const cls = `${CARD} bg-white/[0.055] hover:bg-white/[0.1]`;
  const aria = item.label;

  // Multi-acción: título + pills (no es un único enlace).
  if (item.actions) {
    const { icon: Icon } = item;
    return (
      <div {...tilt} className="rdr-rise rdr-tilt group relative box-border flex w-full flex-col justify-center gap-3 overflow-hidden rounded-2xl border bg-white/[0.055] p-4 backdrop-blur-md lg:min-h-0 lg:flex-1" style={style}>
        <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(160px circle at var(--mx,50%) var(--my,50%), ${rgba(accent, 0.2)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border" style={{ borderColor: rgba(accent, 0.3), background: rgba(accent, 0.12), color: mapAccent(accent) }}>
            <Icon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-sand">{item.label}</span>
            {item.desc && <span className="block truncate text-[13px] text-sand/70">{item.desc}</span>}
          </span>
        </div>
        <div className="relative flex gap-2">
          {item.actions.map((a) => <ActionPill key={a.label} a={a} accent={accent} />)}
        </div>
      </div>
    );
  }

  if (item.action === "route")
    return <Link {...tilt} href={item.target} aria-label={aria} className={cls} style={style}><CardInner item={item} accent={accent} /></Link>;
  if (item.action === "page")
    return <a {...tilt} href={item.target} data-prerender aria-label={aria} className={cls} style={style}><CardInner item={item} accent={accent} /></a>;
  if (item.action === "open") {
    const url = getUrl(item.target);
    if (!url) return <div {...tilt} aria-disabled="true" title="Enlace no disponible aún" className={`${cls} cursor-not-allowed opacity-50`} style={style}><CardInner item={item} accent={accent} /></div>;
    return <a {...tilt} href={url} target="_blank" rel="noopener noreferrer" aria-label={aria} className={cls} style={style}><CardInner item={item} accent={accent} /></a>;
  }
  return <button {...tilt} type="button" onClick={() => copyLink(item.target)} aria-label={aria} className={`${cls} text-left`} style={style}><CardInner item={item} accent={accent} /></button>;
}

function FeatureCard({ item, accent, delay }) {
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  return (
    <Link
      {...tilt}
      href={item.target}
      aria-label={`${item.label} — ${item.desc}`}
      className="rdr-rise rdr-tilt group relative box-border flex w-full flex-col justify-center gap-2 overflow-hidden rounded-2xl border bg-gradient-to-br from-white/[0.1] to-white/[0.03] p-5 backdrop-blur-md lg:min-h-0 lg:flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight"
      style={{ animationDelay: `${delay}ms`, borderColor: rgba(accent, 0.5), "--pc": rgba(accent, 0.75) }}
    >
      <span aria-hidden className="rdr-spot" style={{ background: "radial-gradient(200px circle at var(--mx,50%) var(--my,50%), rgba(133,200,255,.22), transparent 70%)" }} />
      <span aria-hidden className="pointer-events-none absolute -right-5 -top-5 text-serene/15 transition-transform duration-500 group-hover:rotate-12"><IconOrbit size={140} /></span>
      <span className="grid h-12 w-12 place-items-center rounded-xl border border-serene/40 text-serene" style={{ background: "linear-gradient(145deg, rgba(133,200,255,.25), rgba(133,200,255,.06))" }}><IconGrad size={26} /></span>
      <div className="relative mt-1">
        <span className="block font-display text-xl font-bold text-sand">{item.label}</span>
        <span className="block text-sm text-sand/70">{item.desc}</span>
      </div>
      <span className="relative mt-1 flex items-center gap-1.5 text-sm font-bold text-serene">Explorar la ruta <IconArrow size={16} className="transition-transform group-hover:translate-x-1" /></span>
    </Link>
  );
}

function TypeColumn({ sec, delay }) {
  const mapAccent = useAccentMap();
  return (
    <section aria-labelledby={`col-${sec.id}`} className="flex min-h-0 flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-sm" style={{ boxShadow: `inset 0 2px 0 ${rgba(sec.color, 0.7)}` }}>
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sec.color }} />
        <span className="font-display text-xs font-bold tabular-nums" style={{ color: mapAccent(sec.color) }}>{sec.n}</span>
        <h2 id={`col-${sec.id}`} className="font-display text-sm font-bold uppercase tracking-[0.15em] text-sand">{sec.title}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-3 lg:min-h-0">
        {sec.items.map((item, i) =>
          item.kind === "feature"
            ? <FeatureCard key={item.label} item={item} accent={sec.color} delay={delay + i * 35} />
            : <Card key={item.label} item={item} accent={sec.color} delay={delay + i * 35} />
        )}
      </div>
    </section>
  );
}

export default function BentoHub() {
  const { isCoordinador } = useAuth();
  const lite = useLowPower();
  const sections = isCoordinador ? [...SECTIONS, COORD_SECTION] : SECTIONS;
  const gridCols = sections.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3";

  return (
    <main className="relative min-h-dvh w-full lg:h-dvh lg:overflow-hidden">
      <AmbientBackground lite={lite} />
      <div className="mx-auto flex w-full max-w-7xl flex-col px-5 pb-8 pt-24 sm:px-6 lg:h-full lg:pb-8">
        {/* Columnas por tipo (el título va en el header) */}
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${gridCols} lg:min-h-0 lg:flex-1`}>
          {sections.map((sec, i) => <TypeColumn key={sec.id} sec={sec} delay={i * 60} />)}
        </div>
      </div>
    </main>
  );
}
