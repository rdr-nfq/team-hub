"use client";

// Módulo 04 · Canales de comunicación (slides 26–28 del deck legacy):
// comunicación online (RDR ↔ ESB ↔ sistemas) y canal batch.

import { PALETTE } from "@/lib/palette";
import { Reveal, Slide, SlideModulo, BlockHeader, Glass, EdgeCard, DotList } from "./ui";

const C = PALETTE.mandarin;

const SISTEMAS_ONLINE = ["Murex", "Calypso", "TRACK", "STAR", "DUCO", "…"];

const BATCH_CASOS = [
  { t: "Feeds de datos externos", color: PALETTE.serene, d: "Bloomberg SFTP, Refinitiv, ANNA MDX, STOXX/S&P — carga diaria de precios, emisiones, ratings" },
  { t: "Reconciliación", color: PALETTE.aqua, d: "BDI, Clientela, Sectorización ADA/Taxonomy — comparación con KYTL_GC y aplicación de delta" },
  { t: "Extracciones masivas", color: PALETTE.lime, d: "DataX objects (x_kytlcparties, x_kytlissuesresto…), MENTOR, SAIT diario — distribución a consumidores batch" },
  { t: "SWIFT & ficheros regulatorios", color: PALETTE.canary, d: "Publishing EAR genera ficheros SWIFT MT/MX, reportes MIFID/EMIR, maestros de liquidación — sin JMS" },
];

/** Diagrama ONLINE: RDR ↔ ESB ↔ Sistemas, reconstruido en HTML/CSS. */
function DiagramaOnline() {
  return (
    <div
      className="grid gap-4 md:grid-cols-[1fr_1.4fr_1fr]"
      role="img"
      aria-label="Diagrama de comunicación online: RDR publica y responde peticiones a través del ESB (bus de información) hacia sistemas como Murex, Calypso, TRACK, STAR o DUCO, que devuelven ACK/NACK y lanzan peticiones"
    >
      {/* RDR */}
      <div className="flex flex-col gap-3">
        {/* Superficie Electric sólida → texto Sand LITERAL (text-sand en claro es tinta midnight, ilegible sobre azul). */}
        <div className="rounded-xl bg-electric px-4 py-3 text-center font-display text-lg font-bold text-[#F7F8F8] shadow-[0_4px_20px_rgba(0,19,145,0.45)]">
          RDR
        </div>
        <EdgeCard accent={C} title="Publicación">Puntual o masiva hacia sistemas conectados</EdgeCard>
        <EdgeCard accent={C} title="Petición / Respuesta">Los aplicativos solicitan información de las distintas entidades</EdgeCard>
      </div>

      {/* ESB */}
      <div className="flex flex-col gap-3">
        {/* Superficie Serene sólida (hex literal, igual en ambos temas) → texto Electric literal (regla BBVA: texto sobre acentos). */}
        <div className="rounded-xl px-4 py-3 text-center font-display text-lg font-bold text-[#001391]" style={{ background: PALETTE.serene }}>
          ESB — Bus de información
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-[12px] font-bold sm:grid-cols-2">
          <span className="text-serene">← Publicación (RDR → Sistemas)</span>
          <span className="text-lime">→ ACK / NACK (Sistemas → RDR)</span>
          <span className="text-mandarin">→ Petición (Sistemas → RDR)</span>
          <span className="text-serene">← Respuesta (RDR → Sistemas)</span>
        </div>
        <p className="px-1 text-center text-[12px] leading-relaxed text-sand/60">
          Canal de comunicación síncrono/asíncrono que orquesta la publicación de datos de referencia y las consultas online entre RDR
          y los sistemas consumidores.
        </p>
      </div>

      {/* Sistemas */}
      <div className="flex flex-col gap-3">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.25em] text-sand/60">Sistemas</p>
        <div className="grid grid-cols-3 gap-1.5 md:grid-cols-2">
          {SISTEMAS_ONLINE.map((s) => (
            <div key={s} className="rounded-lg border border-white/12 bg-white/[0.06] px-2 py-2 text-center text-[12px] font-bold text-sand">
              {s}
            </div>
          ))}
        </div>
        <p className="px-1 text-center text-[12px] leading-relaxed text-sand/60">
          Reciben publicaciones y envían ACK/NACK.
          <br />Pueden solicitar info vía petición/respuesta.
        </p>
      </div>
    </div>
  );
}

export default function SeccionCanales() {
  return (
    <>
      <SlideModulo id="canales"
        n="04"
        color={C}
        title="Canales de comunicación"
        desc="Cómo se comunica RDR con el ecosistema: publicación online, petición/respuesta, y distribución batch masiva."
      />

      {/* ── Comunicación ONLINE (slide 27) ──────────────────────── */}
      <Slide id="canales-1">
        <BlockHeader color={C} kicker="Comunicación en tiempo real" title="Comunicación ONLINE" />
        <Reveal className="mt-8">
          <Glass accent={C} className="p-5 sm:p-7">
            <DiagramaOnline />
          </Glass>
        </Reveal>

      </Slide>

      {/* ── Canal BATCH (slide 28) ──────────────────────────────── */}
      <Slide id="canales-2">
        <BlockHeader color={C} kicker="Volumen masivo · Ficheros · Coordinado por Control-M" title="Canal BATCH" />
        <Reveal className="mt-8 grid gap-6 lg:grid-cols-2">
          <Glass accent={C}>
            <DotList
              color={C}
              className="mt-0"
              items={[
                <>Intercambio de datos en <strong className="text-sand">volumen</strong> — no viable por JMS online</>,
                <>Transporte: <strong className="text-sand">DataX</strong> (plataforma corporativa bidireccional), <strong className="text-sand">SCP/SFTP</strong> directo, <strong className="text-sand">Connect Direct</strong> (SAIT)</>,
                <>Coordinación: <strong className="text-sand">Control-M</strong> (planificador, UUAA KYTL, prefijo MEKYTL) o <strong className="text-sand">FileWatcher</strong> (detecta llegada de fichero → activa workflow GS)</>,
                <>Rutas: salida → <code className="rounded bg-white/10 px-1 text-[12px]">/unload/kytl/datsal/datax/</code> · entrada → <code className="rounded bg-white/10 px-1 text-[12px]">/unload/kytl/datent/datax/</code></>,
                "Procesamiento: transformaciones, splits, deltas, reconciliaciones con Java + PL/SQL",
              ]}
            />
          </Glass>
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-sand/60">Casos de uso batch</p>
            <div className="flex flex-col gap-2.5">
              {BATCH_CASOS.map((c) => (
                <EdgeCard key={c.t} accent={c.color} title={c.t}>{c.d}</EdgeCard>
              ))}
            </div>
          </div>
        </Reveal>
      </Slide>
    </>
  );
}
