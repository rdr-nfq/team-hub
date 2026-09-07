"use client";

// Cierre (slides 32–33 del deck): RDR en cifras + coda con
// enlaces de continuación (sustituye a la contraportada de logos: el
// co-branding BBVA × NFQ ya lo aporta el chrome persistente).

import { Link } from "next-view-transitions";
import { PALETTE } from "@/lib/palette";
import { Reveal, Slide, BlockHeader, Stat } from "./ui";
import { IconArrowRight } from "./icons";

const KPIS = [
  { value: "13M+", label: "Registros activos", sub: "en 14 tipos de entidad", color: PALETTE.serene },
  { value: "20+", label: "Sistemas integrados", sub: "entrada + salida de datos", color: PALETTE.lime },
  { value: "4", label: "Entornos", sub: "INT · DEV · PRE · PRO", color: PALETTE.canary },
  { value: "10+", label: "Años en producción", sub: "operativo desde 2016", color: PALETTE.mandarin },
  { value: "1.364", label: "Specs de conocimiento", sub: "en el Knowledge Graph RDR", color: PALETTE.purple },
  { value: "4.699", label: "Conexiones de conocimiento", sub: "relaciones entre specs", color: PALETTE.aqua },
  { value: "3", label: "JVMs JBoss", sub: "Fileloading · Publishing · Workstation", color: PALETTE.serene },
  { value: "857K", label: "SSIs activas", sub: "instrucciones de liquidación", color: PALETTE.lime },
];

export default function SeccionCierre() {
  return (
    <>
      {/* ── RDR en cifras (slide 32) ────────────────────────────── */}
      <Slide id="cifras">
        <BlockHeader color={PALETTE.serene} kicker="Una plataforma en producción continua desde 2016" title="RDR en cifras" />

        <Reveal className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {KPIS.map((k) => (
            <Stat key={k.label} {...k} />
          ))}
        </Reveal>
      </Slide>

      {/* ── Coda / contraportada (slide 33) ─────────────────────── */}
      <Slide id="cierre">
      <Reveal className="pb-4 text-center">
        <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-serene/80">BBVA × NFQ</p>
        <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight text-sand sm:text-4xl">
          Esto es RDR.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-sand/65">
          El punto de partida. La ruta formativa por niveles desarrolla cada uno de estos módulos en profundidad.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/formacion"
            className="group inline-flex items-center gap-2 rounded-full border border-serene/40 bg-serene/15 px-5 py-2.5 text-sm font-bold text-serene backdrop-blur-md transition hover:border-serene/70 hover:bg-serene/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
          >
            Continuar en el HUB Formativo
            <IconArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-bold text-sand/80 backdrop-blur-md transition hover:border-white/30 hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
          >
            Volver al inicio
          </Link>
        </div>
      </Reveal>
      </Slide>
    </>
  );
}
