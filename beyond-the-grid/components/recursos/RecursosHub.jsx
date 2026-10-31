"use client";

import { Link } from "next-view-transitions";
import { useReducedMotion } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";
import { rgba, solido } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import { RECURSOS } from "@/lib/recursos";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";
import { IconBook, IconArrow } from "../icons";

/* Sub-hub de RECURSOS: biblioteca de referencia RDR. Catálogo en
   lib/recursos.js — añadir un recurso = añadir una entrada allí.
   Acento de la sección: aqua (#8BE1E9). */

const ACCENT = PALETTE.aqua;

function RecursoCard({ r, delay }) {
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const acc = useAccentMap();
  const color = r.color || ACCENT;

  const inner = (
    <>
      <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(180px circle at var(--mx,50%) var(--my,50%), ${rgba(color, 0.2)}, transparent 70%)` }} />
      <div className="relative flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border" style={{ borderColor: rgba(color, 0.35), background: rgba(color, 0.12), color: acc(color) }}>
          <IconBook size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-sand">{r.titulo}</h3>
            {r.etiqueta && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: acc(color), backgroundColor: rgba(color, 0.14) }}>
                {r.etiqueta}
              </span>
            )}
          </div>
          <p className="mt-1 text-pretty text-sm text-sand/70">{r.desc}</p>
          {r.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <span key={t} className="rounded-md border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-sand/70">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <IconArrow size={18} className="mt-1 shrink-0 text-sand/40 transition-all duration-200 group-hover:translate-x-1 group-hover:text-sand/85" />
      </div>
    </>
  );

  const cls =
    "rdr-rise rdr-tilt group relative block overflow-hidden rounded-2xl border bg-white/[0.055] p-5 backdrop-blur-md transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";
  const style = { animationDelay: `${delay}ms`, borderColor: rgba(color, 0.45), "--pc": rgba(color, 0.7) };

  if (r.tipo === "route")
    return <Link {...tilt} href={r.href} className={cls} style={style}>{inner}</Link>;
  return <a {...tilt} href={r.href} data-prerender className={cls} style={style}>{inner}</a>;
}

export default function RecursosHub() {
  const acc = useAccentMap();
  return (
    <main className="relative min-h-dvh w-full">
      <ArtBanner src={ART.recursos} />
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.aqua }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-8">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em]" style={{ color: acc(ACCENT) }}>
            Proyectos · Biblioteca
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">Recursos RDR</h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-sand/65">
            Referencia técnica y funcional del Repositorio de Datos de Referencia: herramientas, inventarios y
            documentación viva. La biblioteca crece — si echas algo en falta, propónlo al equipo.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs text-sand/70">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: solido(ACCENT) }} aria-hidden />
            {RECURSOS.length} {RECURSOS.length === 1 ? "recurso disponible" : "recursos disponibles"} · en crecimiento
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4">
          {RECURSOS.map((r, i) => (
            <RecursoCard key={r.slug} r={r} delay={i * 60} />
          ))}
        </div>
      </div>
    </main>
  );
}
