"use client";

// Módulo 05 · Ecosistema de integración (slides 29–31 del deck legacy):
// sistemas conectados (IN/OUT/bidireccional) y el flujo real Murex → Calypso.

import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { Reveal, Slide, SlideModulo, BlockHeader, Glass } from "./ui";

const C = PALETTE.aqua;

const DIR = {
  in: { label: "→ IN", color: PALETTE.lime, legend: "Entrada (IN)" },
  out: { label: "← OUT", color: PALETTE.serene, legend: "Salida (OUT)" },
  bio: { label: "↔ IN / OUT", color: PALETTE.canary, legend: "Bidireccional" },
};

const SISTEMAS = [
  { n: "Bloomberg", dir: "in", d: "Instrumentos, ratings. Feed diario SFTP (DLML). Principal fuente de datos de mercado." },
  { n: "Refinitiv / LSEG", dir: "in", d: "Ratings y datos de referencia alternativos. SFTP periódico." },
  { n: "Calypso", dir: "bio", d: "Principal back-office. Se les envían instrucciones de liquidación y confirmación." },
  { n: "Murex 3", dir: "bio", d: "Maestro de cestas, pero sobre todo, el principal Front-office." },
  { n: "STAR", dir: "out", d: "Otro front-office que también consume contrapartidas." },
  { n: "MENTOR", dir: "out", d: "Plataforma de gestión de riesgo. Lo principal que reciben es contratos." },
  { n: "ALGORITHMICS", dir: "out", d: "Motor de cálculo de riesgo de mercado, IRC, etc. Reciben contrapartidas." },
  { n: "DUCO", dir: "out", d: "Plataforma de reconciliación. Recibe datos de referencia para comparación con sistemas externos." },
  { n: "SOLAR", dir: "out", d: "Plataforma analytics y datalake corporativo. Requiere LEI + Murex ID + Branch 0182/1145." },
  { n: "ALERT MIRROR", dir: "bio", d: "Comunicación para descarga de información de fondos, gestoras e instrucciones de liquidación por el circuito de CTM." },
  { n: "DEAL MANAGER", dir: "out", d: <>Trade Matching para renta variable y bonos. RDR almacena el <em>DTCCID</em> de la contraparte en la SCIS para facilitar el routing.</> },
  { n: "Salesforce", dir: "out", d: "CRM y gestión comercial. Recibe datos de contrapartidas vía DATIO con latencia D+2." },
];

// Flujo Murex → ESB → RDR → ESB → Calypso (slide 31), como pasos numerados.
const FLUJO = [
  {
    t: "MUREX", accent: PALETTE.serene,
    sub: "Se contrata una operación",
    d: <>Datos fijos de la operación: <strong className="text-sand">Contrapartida · Divisa · Índice · Portfolio · Producto</strong>.</>,
  },
  {
    t: "ESB", accent: PALETTE.serene,
    sub: "Enrutado hacia Calypso",
    d: "Desde Murex sale la operación y la manda al ESB, cuyo destino final es Calypso.",
  },
  {
    t: "RDR", accent: PALETTE.aqua, core: true,
    sub: "Peticiones diccionario — P/R",
    d: <>El ESB pregunta por cada ID de Murex de las distintas entidades de RDR, para obtener su ID canónico. Además, RDR publica a Calypso vía ESB: <strong className="text-sand">Contrapartida · SDIs · SCIs · Legal Agreements</strong>.</>,
  },
  {
    t: "ESB", accent: PALETTE.serene,
    sub: "Peticiones diccionario — P/R",
    d: "El ESB pregunta por cada canónico obtenido la traducción del ID de Calypso correspondiente.",
  },
  {
    t: "CALYPSO", accent: PALETTE.lime,
    sub: "Destino final",
    d: <>Llega toda la info de la operación con los IDs de Calypso. A partir de ahí: <strong className="text-sand">liquida vía SSI (SDI) · confirma vía SCIS · aplica el Legal Agreement</strong>.</>,
  },
];

function FlujoMurexCalypso() {
  const mapAccent = useAccentMap(); // títulos de paso legibles en claro; tintes/superficies con hex original
  return (
    <ol
      className="grid gap-2.5 lg:grid-cols-5"
      aria-label="Flujo de una operación: Murex, ESB, RDR, ESB y Calypso"
    >
      {FLUJO.map((p, i) => (
        <li key={i} className="relative flex flex-col">
          <div
            className={`flex h-full flex-col rounded-2xl border p-4 backdrop-blur-sm ${p.core ? "" : "border-white/10 bg-white/[0.045]"}`}
            style={p.core ? { borderColor: rgba(p.accent, 0.6), background: rgba(p.accent, 0.08), boxShadow: `0 0 26px -8px ${rgba(p.accent, 0.5)}` } : undefined}
          >
            <p className="flex items-center gap-2">
              {/* Chip: superficie de acento sólida (hex original) → texto Electric literal (regla BBVA texto-sobre-acentos; text-midnight en claro sería Sand, invisible). */}
              <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold text-[#001391]" style={{ background: p.accent }}>
                {i + 1}
              </span>
              <span className="font-display text-base font-bold tracking-wide" style={{ color: mapAccent(p.accent) }}>{p.t}</span>
            </p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sand/55">{p.sub}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-sand/70">{p.d}</p>
          </div>
          {/* flecha entre pasos (horizontal en desktop, vertical en móvil) */}
          {i < FLUJO.length - 1 && (
            <span aria-hidden className="mx-auto py-1 text-lg font-bold text-serene/60 lg:absolute lg:-right-3 lg:top-1/2 lg:-translate-y-1/2 lg:py-0">
              <span className="lg:hidden">↓</span>
              <span className="hidden lg:inline">→</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function SeccionEcosistema() {
  const mapAccent = useAccentMap(); // leyenda/dirección como TEXTO legible en claro; puntos-swatch con hex original
  return (
    <>
      <SlideModulo id="ecosistema"
        n="05"
        color={C}
        title="Ecosistema de integración"
        desc="Más de 20 sistemas conectados: proveedores de datos externos, sistemas de trading y plataformas de distribución."
      />

      {/* ── Sistemas conectados (slide 30) ──────────────────────── */}
      <Slide id="ecosistema-1">
        <BlockHeader color={C} kicker="Integraciones" title="Sistemas conectados" />

        <Reveal className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5">
          {Object.values(DIR).map((d) => (
            <span key={d.legend} className="flex items-center gap-2 text-xs" style={{ color: mapAccent(d.color) }}>
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.legend}
            </span>
          ))}
        </Reveal>

        <Reveal className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SISTEMAS.map((s) => {
            const dir = DIR[s.dir];
            return (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm" style={{ borderTop: `3px solid ${dir.color}` }}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-base font-bold text-sand">{s.n}</p>
                  <p className="shrink-0 text-[11px] font-bold uppercase tracking-wide" style={{ color: mapAccent(dir.color) }}>{dir.label}</p>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-sand/65">{s.d}</p>
              </div>
            );
          })}
        </Reveal>

      </Slide>

      {/* ── Flujo Murex → Calypso (slide 31) ────────────────────── */}
      <Slide id="ecosistema-2">
        <BlockHeader color={C} kicker="Ejemplo real · Servicio Petición/Respuesta" title="Caída de operación: Murex → ESB → RDR → ESB → Calypso" />
        <Reveal className="mt-8">
          <Glass accent={C} className="p-4 sm:p-6">
            <FlujoMurexCalypso />
          </Glass>
        </Reveal>
      </Slide>
    </>
  );
}
