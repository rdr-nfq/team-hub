"use client";

// Módulo 00 · Contexto bancario (slides 2–4 del deck legacy):
// qué es un banco, dónde se sitúa CIB y la estructura Front/Middle/Back.

import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { Reveal, Slide, SlideModulo, BlockHeader, Glass, KeyIdea, DotList, H3 } from "./ui";

const C = PALETTE.serene;

const SEGMENTOS_BANCA = [
  { nombre: "Retail", destacado: false, desc: "Operaciones estandarizadas con particulares y pymes. Millones de cuentas. Ingresos vía intereses y comisiones." },
  { nombre: "CIB ★", destacado: true, desc: "Operaciones no estandarizadas con grandes clientes y mercados financieros. Ingresos vía comisiones de mercados y beneficios de cartera propia." },
  { nombre: "Banca Privada", destacado: false, desc: "Gestión de clientes de alto nivel de renta. Ingresos por intermediación, mantenimiento y asesoramiento patrimonial." },
  { nombre: "Custodio", destacado: false, desc: "Mantenimiento de activos por cuenta de terceros. Ingresos vía comisiones de custodia y administración." },
];

const OFICINAS = [
  {
    nombre: "Front Office", color: PALETTE.lime, rol: "Captación y generación de negocio",
    items: ["Analizar el mercado", "Atender órdenes de clientes", "Negociar precios con clientes y mercado", "Cerrar operaciones dentro de límites", "Gestionar posiciones existentes"],
    quien: "Traders · Ventas · Quants · Estructuradores",
  },
  {
    nombre: "Middle Office", color: PALETTE.canary, rol: "Control del negocio",
    items: ["Completar y validar operaciones capturadas", "Garantizar procesamiento y confirmación", "Asegurar flujo de información Front-to-Back", "Controlar niveles de riesgo", "Cumplimiento normativo"],
  },
  {
    nombre: "Back Office", color: PALETTE.serene, rol: "Soporte operativo",
    items: ["Administrar flujo de operaciones", "Gestionar y confirmar liquidaciones", "Contabilizar operaciones", "Generar reportes a organismos oficiales"],
  },
];

export default function SeccionContexto() {
  const mapAccent = useAccentMap(); // acentos como TEXTO legibles en claro; tintes/bordes con hex original
  return (
    <>
      <SlideModulo id="contexto"
        n="00"
        color={C}
        title="Contexto bancario"
        desc="Antes de hablar de RDR: qué hace un banco, dónde se sitúa la banca mayorista (CIB) y cómo se organiza la operativa de mercados."
      />

      {/* ── ¿Qué es un banco? (slide 2) ─────────────────────────── */}
      <Slide id="contexto-1">
        <BlockHeader color={C} kicker="Contexto" title="¿Qué es un Banco?">
          Un banco es una entidad financiera autorizada para <strong className="text-sand">recibir depósitos</strong> del público y{" "}
          <strong className="text-sand">conceder créditos</strong> por cuenta propia. Los intereses generados por los préstamos
          constituyen su principal fuente de ingresos.
        </BlockHeader>

        <Reveal className="mt-8 grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
          <Glass accent={C}>
            <H3>Actividades principales</H3>
            <DotList
              color={C}
              items={[
                <>Captar recursos de clientes a cambio de remuneración (depósitos garantizados por el FGD hasta 100.000&nbsp;€)</>,
                "Concesión de financiación y emisión de productos financieros",
                "Servicio de transferencias domésticas e internacionales",
                "Intermediación en mercados organizados de valores",
                "Gestión de carteras, patrimonios y riesgos",
              ]}
            />
          </Glass>
          <KeyIdea color={C}>
            <span className="font-sans text-[11px] font-bold uppercase tracking-[0.25em] text-serene">Fuentes de ingresos</span>
            <p className="mt-2 text-[15px] font-normal text-sand/85">
              Intereses y comisiones por operaciones de activo · Comisiones por servicios · Rendimientos de operativa en mercados
              (interbancario, divisas, derivados).
            </p>
          </KeyIdea>
        </Reveal>

      </Slide>

      {/* ── Banca Mayorista — CIB (slide 3) ─────────────────────── */}
      <Slide id="contexto-2">
        <BlockHeader color={C} kicker="¿Dónde nos encontramos?" title="Banca Mayorista — CIB" />

        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENTOS_BANCA.map((s) => (
            <div
              key={s.nombre}
              className={`rounded-2xl border p-4 backdrop-blur-sm ${
                s.destacado ? "border-serene/50" : "border-white/10 bg-white/[0.045]"
              }`}
              style={s.destacado ? { background: rgba(C, 0.14), boxShadow: `0 0 28px -8px ${rgba(C, 0.55)}` } : undefined}
            >
              <p className={`font-display text-lg font-bold ${s.destacado ? "text-serene" : "text-sand"}`}>{s.nombre}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-sand/70">{s.desc}</p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-6">
          <KeyIdea color={C}>
            <p className="text-[15px] font-normal text-sand/85">
              El área de <strong className="text-sand">Tesorería</strong> (mercados) se enmarca en CIB. Es un área especializada que
              satisface las necesidades de <strong className="text-sand">cobertura de riesgos</strong> e{" "}
              <strong className="text-sand">inversión de clientes corporativos</strong>. RDR es la plataforma de datos de referencia que
              da servicio a toda esta operativa.
            </p>
          </KeyIdea>
        </Reveal>

      </Slide>

      {/* ── Front · Middle · Back Office (slide 4) ──────────────── */}
      <Slide id="contexto-3">
        <BlockHeader color={C} kicker="Estructura organizativa BBVA CIB" title="Front · Middle · Back Office" />

        <Reveal className="mt-8 grid gap-3 md:grid-cols-3">
          {OFICINAS.map((o) => (
            <div key={o.nombre} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm" style={{ borderTop: `3px solid ${o.color}` }}>
              <p className="font-display text-lg font-bold" style={{ color: mapAccent(o.color) }}>{o.nombre}</p>
              <p className="mt-0.5 text-xs text-sand/60">{o.rol}</p>
              <DotList color={o.color} className="mt-3" items={o.items} />
              {o.quien && <p className="mt-3 text-xs text-sand/50">{o.quien}</p>}
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-4">
          {/* Superficie Electric sólida: texto Sand LITERAL (text-sand en claro sería tinta midnight, ilegible sobre azul). */}
          <div className="rounded-2xl border border-electric/60 bg-electric px-5 py-4 text-center backdrop-blur-sm">
            <p className="font-display text-base font-bold tracking-wide text-[#F7F8F8] sm:text-lg">RDR — Reference Data Repository</p>
            <p className="mt-0.5 text-[13px] text-[#F7F8F8]/75">Da servicio transversal a Front, Middle y Back Office</p>
          </div>
        </Reveal>
      </Slide>
    </>
  );
}
