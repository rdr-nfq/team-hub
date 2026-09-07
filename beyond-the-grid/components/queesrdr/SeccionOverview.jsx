"use client";

// Módulo 01 · ¿Qué es RDR? (slides 5–8 del deck legacy): definición, producto
// base GoldenSource, por qué existe y la jerarquía interna del Grupo BBVA.

import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { Reveal, Slide, SlideModulo, BlockHeader, Glass, KeyIdea, DotList, H3, Pill } from "./ui";

const C = PALETTE.canary;

const OBJETIVOS = [
  { t: "Consistencia", d: "Información unificada que asegura datos precisos y coherentes en todas las áreas del banco. Todos los sistemas trabajan con los mismos datos actualizados." },
  { t: "Control y Trazabilidad", d: "Cumplimiento normativo con trazabilidad completa. Cada cambio en los datos de referencia queda registrado y es auditable." },
  { t: "Eficiencia Operativa", d: "Uniformidad en procesos, visión completa de cada cliente y entidad. Reduce duplicidad y costes de gestión de datos." },
  { t: "Minimizar Riesgos", d: "Reducir riesgo operativo al centralizar los datos. Accesibilidad en tiempo real, mejores tiempos de respuesta y menores costes operativos." },
  { t: "Experiencia del Cliente", d: "Información unificada y accesible en todas las interacciones permite ofrecer una experiencia más personalizada y fluida." },
  { t: "Soporte Internacional", d: "Base de datos de referencia única que permite expandirse a nuevos mercados con un sistema de información robusto y consistente." },
];

const STACK = [
  { t: "JBoss EAP 7.1", d: "Domain mode, 3 JVMs" },
  { t: "Oracle 19c", d: "Schema KYTL_GC, 3 schemas" },
  { t: "Java 8", d: "JDK 1.8.0_152, Red Hat Linux" },
  { t: "4 entornos", d: "INT · DEV · PRE · PRO" },
];

const JERARQUIA = [
  { n: 1, t: "GRUPO BBVA", d: "Nivel ficticio que representa al grupo", peso: 1 },
  { n: 2, t: "ENTERPRISES", d: "Entidades del grupo: BBVA España, BBVA México, BSI…", peso: 0.82 },
  { n: 3, t: "BRANCHES", d: "Subunidades geográficas ficticias de cada enterprise", peso: 0.64 },
  { n: 4, t: "OFICINAS", d: "Oficinas que pertenecen a cada branch", peso: 0.46 },
  { n: 5, t: "PORTFOLIOS", d: "Carteras de operaciones financieras de cada oficina", peso: 0.28 },
];

export default function SeccionOverview() {
  const mapAccent = useAccentMap(); // canary como TEXTO legible en claro; tintes con hex original
  return (
    <>
      <SlideModulo id="overview"
        n="01"
        color={C}
        title="¿Qué es RDR?"
        desc="La definición, el producto sobre el que se construye, los objetivos que persigue y cómo modela la estructura del Grupo BBVA."
      />

      {/* ── Definición (slide 5) ────────────────────────────────── */}
      <Slide id="overview-1">
        <BlockHeader color={C} kicker="Definición" title="El Repositorio de Datos de Referencia">
          RDR es la plataforma corporativa de BBVA que centraliza, valida y distribuye los{" "}
          <strong className="text-sand">datos maestros de referencia</strong> usados en toda la operativa del banco: contrapartidas,
          instrumentos financieros, acuerdos legales e instrucciones de liquidación.
        </BlockHeader>

        <Reveal className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <Glass accent={C}>
            <DotList
              color={C}
              className="mt-0"
              items={[
                <>Fuente única de verdad (<em>single source of truth</em>) para datos maestros CIB</>,
                "Punto de distribución hacia más de 20 sistemas downstream",
                "Garantía de calidad, coherencia y trazabilidad del dato",
                "Operativo desde 2016 en producción continua",
              ]}
            />
          </Glass>
          <div className="flex flex-col gap-4">
            <KeyIdea color={C}>
              <p className="text-[15px] font-normal text-sand/85">
                RDR no almacena operaciones de negocio. Almacena los <em>datos sobre los actores y activos</em> que intervienen en esas
                operaciones.
              </p>
            </KeyIdea>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-4 text-center backdrop-blur-md">
                <p className="font-display text-3xl font-bold text-canary">+13M</p>
                <p className="mt-1 text-xs text-sand/70">registros activos</p>
              </div>
              <div className="rounded-2xl border border-white/12 bg-white/[0.055] p-4 text-center backdrop-blur-md">
                <p className="font-display text-3xl font-bold text-serene">20+</p>
                <p className="mt-1 text-xs text-sand/70">sistemas integrados</p>
              </div>
            </div>
          </div>
        </Reveal>

      </Slide>

      {/* ── GoldenSource EDM 8.7 (slide 6) ──────────────────────── */}
      <Slide id="overview-2">
        <BlockHeader color={C} kicker="El producto base" title="GoldenSource EDM 8.7">
          RDR se construye sobre <strong className="text-sand">GoldenSource Enterprise Data Management 8.7</strong>, producto de gestión
          de datos maestros orientado a banca de inversión. BBVA lo despliega en la versión <Pill color={C}>8.7.1.05</Pill> con el nombre
          interno <Pill color={C}>standardvddb</Pill>.
        </BlockHeader>

        <Reveal className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <Glass accent={C}>
            <DotList
              color={C}
              className="mt-0"
              items={[
                "Modelo de datos config-driven: entidades definidas en XML/SQL, no en código",
                "Motor de workflows para orquestación de procesos de ingesta y publicación",
                "Workstation: interfaz J2EE generada automáticamente desde los modelos",
                "Motor de reglas Java (JBRE) para lógica de negocio custom",
                "Pipeline de carga FTI (C++) optimizado para altos volúmenes",
              ]}
            />
          </Glass>
          <div>
            <H3 className="mb-3">Stack tecnológico</H3>
            <div className="grid gap-2.5">
              {STACK.map((s) => (
                <div key={s.t} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-sm">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: C }} />
                  <p className="text-sm text-sand/80">
                    <strong className="text-sand">{s.t}</strong> · {s.d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

      </Slide>

      {/* ── Alcance y objetivos (slide 7) ───────────────────────── */}
      <Slide id="overview-3">
        <BlockHeader color={C} kicker="Alcance y objetivos" title="¿Por qué existe RDR?" />

        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OBJETIVOS.map((o, i) => (
            <div key={o.t} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm" style={{ borderLeft: `3px solid ${rgba(C, 0.85)}` }}>
              <p className="text-sm font-bold text-sand">{o.t}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-sand/70">{o.d}</p>
            </div>
          ))}
        </Reveal>

      </Slide>

      {/* ── Jerarquía Grupo BBVA (slide 8) ──────────────────────── */}
      <Slide id="overview-4">
        <BlockHeader color={C} kicker="Estructura interna del Grupo BBVA" title="Jerarquía de 5 niveles" />

        <Reveal className="mt-8 grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center">
          {/* Diagrama en escalera: cada nivel, más estrecho e indentado */}
          <div className="flex flex-col gap-1.5" role="img" aria-label="Jerarquía de 5 niveles del Grupo BBVA: Grupo, Enterprises, Branches, Oficinas y Portfolios">
            {JERARQUIA.map((niv, i) => (
              <div key={niv.n} className="flex items-stretch" style={{ paddingLeft: `${i * 6}%` }}>
                <div
                  className="w-full rounded-xl border px-4 py-2.5 backdrop-blur-sm"
                  style={{
                    borderColor: rgba(C, 0.2 + niv.peso * 0.5),
                    background: rgba(C, 0.04 + niv.peso * 0.12),
                  }}
                >
                  <p className="text-sm font-bold text-sand">
                    <span className="mr-2 font-display tabular-nums" style={{ color: mapAccent(C) }}>{niv.n}</span>
                    {niv.t}
                  </p>
                  <p className="text-xs text-sand/65">{niv.d}</p>
                </div>
              </div>
            ))}
          </div>
          <KeyIdea color={C}>
            <p className="text-[15px] font-normal text-sand/85">
              Cada <strong className="text-sand">Enterprise, Branch y Oficina</strong> tiene su representación como{" "}
              <strong className="text-sand">contrapartida</strong> en RDR. Esta jerarquía permite a RDR modelar la estructura
              organizativa completa del grupo y asociar operaciones a la unidad correspondiente.
            </p>
          </KeyIdea>
        </Reveal>
      </Slide>
    </>
  );
}
