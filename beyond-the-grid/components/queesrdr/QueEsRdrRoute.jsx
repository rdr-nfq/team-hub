"use client";

// Página "¿Qué es RDR?" — presentación de 35 diapositivas que se recorren de
// IZQUIERDA a DERECHA, igual que las presentaciones de /formacion: flechas,
// teclado (← →), rueda del ratón, deslizamiento táctil y puntos de navegación.
//
// El orden narrativo del deck original se conserva módulo a módulo:
//   Portada → 00 Contexto bancario → 01 ¿Qué es RDR? → 02 Entidades de dominio
//   → 03 Entidades en detalle → 04 Canales de comunicación →
//   05 Ecosistema de integración → RDR en cifras → cierre.
//
// Cada sección aporta sus diapositivas (<Slide>); el deck las descubre solo.

import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import { useLowPower } from "@/hooks/useLowPower";
import Deck, { useDeck } from "./Deck";
import { Slide } from "./ui";
import SeccionContexto from "./SeccionContexto";
import SeccionOverview from "./SeccionOverview";
import SeccionEntidades from "./SeccionEntidades";
import SeccionDetalle from "./SeccionDetalle";
import SeccionCanales from "./SeccionCanales";
import SeccionEcosistema from "./SeccionEcosistema";
import SeccionCierre from "./SeccionCierre";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";

// Índice de módulos de la portada: cada entrada salta a su diapositiva.
const MODULOS = [
  { n: "00", id: "contexto", t: "Contexto bancario", color: PALETTE.serene },
  { n: "01", id: "overview", t: "¿Qué es RDR?", color: PALETTE.canary },
  { n: "02", id: "entidades", t: "Entidades de dominio", color: PALETTE.lime },
  { n: "03", id: "detalle", t: "Entidades en detalle", color: PALETTE.purple },
  { n: "04", id: "canales", t: "Canales de comunicación", color: PALETTE.mandarin },
  { n: "05", id: "ecosistema", t: "Ecosistema de integración", color: PALETTE.aqua },
  { n: "★", id: "cifras", t: "RDR en cifras", color: PALETTE.serene },
];

function AmbientBackground({ lite }) {
  if (lite) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
      <span className="rdr-blob left-[-10%] top-[4%] h-80 w-80 opacity-40" style={{ background: PALETTE.royal }} />
      <span className="rdr-blob right-[-6%] top-[28%] h-72 w-72 opacity-30" style={{ background: PALETTE.serene, animationDelay: "-4s" }} />
      <span className="rdr-blob bottom-[-14%] left-[10%] h-96 w-96 opacity-30" style={{ background: PALETTE.purple, animationDelay: "-9s" }} />
    </div>
  );
}

/* Portada: titular, entradilla e índice de módulos (cada uno salta a su
   diapositiva separadora, como la agenda del deck original). */
function Portada() {
  const mapAccent = useAccentMap(); // número de módulo legible en claro; el borde-tinte conserva el hex original
  const { goToId } = useDeck();
  return (
    <Slide id="portada" wide>
      <div className="rdr-anim">
        <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-serene/80">
          Mayo 2026 · Datos de Referencia
        </p>
        <span aria-hidden className="mt-5 block h-px w-12 bg-serene/50" />
        <h1 className="mt-5 font-display text-5xl font-bold leading-[0.95] tracking-tight text-sand sm:text-7xl md:text-8xl">
          ¿Qué es
          <br />
          RDR?
        </h1>
        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-sand/75 sm:text-lg">
          El Repositorio de Datos de Referencia de BBVA: entidades, arquitectura, flujo de datos e integraciones.
        </p>
      </div>

      <nav className="rdr-anim mt-8 sm:mt-10" style={{ "--rdr-d": "120ms" }} aria-label="Módulos de la presentación">
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MODULOS.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => goToId(m.id)}
                className="group flex h-full w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-left backdrop-blur-sm transition hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene sm:gap-3 sm:px-4 sm:py-3"
                style={{ borderLeft: `3px solid ${m.color}` }}
              >
                <span className="font-display text-xs font-bold tabular-nums" style={{ color: mapAccent(m.color) }}>{m.n}</span>
                <span className="flex-1 text-[13px] font-semibold leading-snug text-sand/85 transition group-hover:text-sand sm:text-sm">{m.t}</span>
                <span aria-hidden className="text-sand/35 transition-transform group-hover:translate-x-0.5 group-hover:text-sand/70">→</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <p className="rdr-anim mt-8 hidden items-center gap-2 text-xs text-sand/45 sm:flex" style={{ "--rdr-d": "200ms" }}>
        <span aria-hidden className="rounded border border-white/15 px-1.5 py-0.5 font-bold">←</span>
        <span aria-hidden className="rounded border border-white/15 px-1.5 py-0.5 font-bold">→</span>
        Avanza con las flechas del teclado, deslizando o con los botones de abajo
      </p>
    </Slide>
  );
}

export default function QueEsRdrRoute() {
  const lite = useLowPower();

  return (
    <main className="relative h-dvh overflow-hidden">
      <ArtBanner src={ART.formacion} />
      <AmbientBackground lite={lite} />

      <Deck>
        <Portada />
        <SeccionContexto />
        <SeccionOverview />
        <SeccionEntidades />
        <SeccionDetalle />
        <SeccionCanales />
        <SeccionEcosistema />
        <SeccionCierre />
      </Deck>
    </main>
  );
}
