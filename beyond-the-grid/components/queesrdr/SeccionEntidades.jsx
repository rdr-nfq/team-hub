"use client";

// Módulo 02 · Entidades de dominio (slides 9–11 del deck legacy):
// las 5 entidades principales y las entidades de soporte.

import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { Reveal, Slide, SlideModulo, BlockHeader } from "./ui";

const C = PALETTE.lime;

// Mismo orden y acentos que las entity-cards del legacy.
export const ENTIDADES = [
  { code: "FINS", nombre: "Contrapartidas", color: PALETTE.serene, stat: "692K", statLabel: "registros activos", desc: "Financial Institutions. Entidades jurídicas, bancos, brokers y cualquier actor externo con el que opera BBVA." },
  { code: "ISSU", nombre: "Emisiones", color: PALETTE.lime, stat: "12M", statLabel: "instrumentos", desc: "Issues. Instrumentos financieros: bonos, acciones, fondos, derivados y cualquier activo negociable." },
  { code: "LAGR", nombre: "Acuerdos Legales", color: PALETTE.canary, stat: "96K", statLabel: "acuerdos", desc: "Legal Agreements. ISDA, CSA, GMRA, GMSLA y otros marcos contractuales bilaterales." },
  { code: "SSIS", nombre: "Instrucciones de Liquidación", color: PALETTE.mandarin, stat: "857K", statLabel: "instrucciones", desc: "Settlement Instructions. SSIs: cuentas y custodios a utilizar para liquidar operaciones." },
  { code: "SCIS", nombre: "Instrucciones de Confirmación", color: PALETTE.purple, stat: "55K", statLabel: "instrucciones", desc: "Confirmation Instructions. Canales y datos para notificación y confirmación de operaciones." },
];

const SOPORTE = [
  { code: "ENTR", nombre: "Enterprise", desc: "Entidades del grupo (España, México, BSI…)" },
  { code: "GUNT", nombre: "Geographic Units", desc: "Países, ciudades… ligadas al resto de entidades" },
  { code: "ACCT", nombre: "Cuentas", desc: "Cuentas de custodia y liquidación" },
  { code: "CNTC", nombre: "Contactos", desc: "Personas de contraparte para confirmaciones" },
  { code: "MRKT", nombre: "Mercados", desc: "Mercados en los que se opera" },
  { code: "RTNG", nombre: "Ratings", desc: "Calificaciones crediticias" },
];

export default function SeccionEntidades() {
  const mapAccent = useAccentMap(); // código y cifra de cada entidad legibles en claro; tintes con hex original
  return (
    <>
      <SlideModulo id="entidades"
        n="02"
        color={C}
        title="Entidades de dominio"
        desc="Los objetos de negocio que RDR gestiona: cinco entidades principales y un conjunto de entidades de soporte."
      />

      {/* ── Las 5 entidades principales (slide 10) ──────────────── */}
      <Slide id="entidades-1">
        <BlockHeader color={C} kicker="Las 5 entidades principales" title="Los objetos core de RDR" />

        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENTIDADES.map((e) => (
            <div
              key={e.code}
              className="flex flex-col rounded-2xl border p-5 backdrop-blur-sm"
              style={{ borderColor: rgba(e.color, 0.4), background: rgba(e.color, 0.08) }}
            >
              <p className="font-sans text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: mapAccent(e.color) }}>
                {e.code}
              </p>
              <h3 className="mt-1 font-display text-xl font-bold leading-tight text-sand">{e.nombre}</h3>
              <p className="mt-2 flex-1 text-[13px] leading-relaxed text-sand/70">{e.desc}</p>
              <p className="mt-4 font-display text-3xl font-bold leading-none" style={{ color: mapAccent(e.color) }}>
                {e.stat}
                <span className="ml-2 align-middle font-sans text-xs font-normal text-sand/60">{e.statLabel}</span>
              </p>
            </div>
          ))}
        </Reveal>

      </Slide>

      {/* ── Entidades de soporte (slide 11) ─────────────────────── */}
      <Slide id="entidades-2">
        <BlockHeader color={C} kicker="Entidades de soporte" title="El modelo completo">
          Junto a las 5 entidades principales, RDR mantiene varias entidades secundarias que enriquecen el modelo con información
          complementaria. Algunas de las más relevantes:
        </BlockHeader>

        <Reveal className="mt-8 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {SOPORTE.map((e) => (
            <div key={e.code} className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-sm">
              <p className="text-sm text-sand">
                <strong className="font-bold text-lime">{e.code}</strong> · {e.nombre}
              </p>
              <p className="mt-0.5 text-xs text-sand/60">{e.desc}</p>
            </div>
          ))}
        </Reveal>
      </Slide>
    </>
  );
}
