"use client";

// Módulo 03 · Entidades en detalle (slides 12–25 del deck legacy).
// Cada entidad principal explicada desde cero, con los diagramas del deck
// reconstruidos en HTML/CSS (árbol Global→Local→Operativo, ciclo de vida,
// cadena de liquidación, relación entre entidades y diccionario).

import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useTheme, useAccentMap } from "@/lib/theme";
import { Reveal, Slide, SlideModulo, BlockHeader, Glass, EdgeCard, KeyIdea, Pill, H3 } from "./ui";

const C = PALETTE.purple;
// Azul hielo del deck (no es token BBVA y no está en el LIGHT_EQ de lib/theme):
// como TEXTO en claro se sustituye por un azul acero con contraste AA sobre Sand.
const ICE = "#B9D4EE";
const ICE_LIGHT = "#3E6E96";
/** mapAccent extendido con el azul hielo local. Solo para acentos usados como TEXTO. */
function useTx() {
  const { theme } = useTheme();
  const mapAccent = useAccentMap();
  return (hex) => (theme === "light" && hex === ICE ? ICE_LIGHT : mapAccent(hex));
}
// Acentos por entidad (coherentes con las tarjetas del módulo 02).
const FINS = PALETTE.serene;
const ISSU = PALETTE.lime;
const LAGR = PALETTE.canary;
const SSIS = PALETTE.mandarin;
const SCIS = PALETTE.purple;

/* ─── Contrapartidas ──────────────────────────────────────────── */

const FINS_BOXES = [
  { label: "¿Qué es?", title: "La entidad con la que opera BBVA", hl: true, desc: "Un banco, un hedge fund, una empresa corporativa, un bróker, una cámara de compensación... Cualquier organización o persona con la que BBVA puede comprar, vender, prestar, derivar o liquidar." },
  { label: "¿Qué datos guarda RDR?", title: "Identidad, regulación y clasificación", hl: true, desc: "Nombre legal, LEI (código regulatorio global), BIC/SWIFT, CIF/NIF, clasificación EMIR/FATCA/DFA, estado (activo/inactivo), sectorización, ratings, datos de contacto, filiales..." },
  { label: "¿Cómo llega a RDR?", title: "Múltiples canales de alimentación", desc: "Alta manual en Workstation · Importación automática desde Bloomberg y Refinitiv · Alimentación desde Clientela (BDI) y Altamira · Feeds regulatorios (GLEIF para LEI) · Integración con sistemas de Riesgo" },
  { label: "¿Quién la usa?", title: "Fuente única para todo el grupo", desc: "Calypso y Murex para trading · STAR/MX3 para confirmaciones · CLAN/MENTOR para pagos · DUCO para reconciliación · Sistemas de riesgo (COMPASS) · Reportes regulatorios (EMIR, MIFID, SFTR)" },
];

const ROLES = [
  { code: "CUSTOMER", t: "Cliente de BBVA", d: "Opera con BBVA comprando/vendiendo productos financieros. Es el rol más común." },
  { code: "ISSUER", t: "Emisor", d: "Empresa que emite instrumentos financieros (bonos, acciones). Conecta Contrapartidas con Emisiones." },
  { code: "BROKER", t: "Bróker / Intermediario", d: "Intermediario en la compraventa de instrumentos. Actúa por cuenta ajena." },
  { code: "CUSTODIAN", t: "Custodio", d: "Guarda los valores (acciones, bonos) en nombre de BBVA o sus clientes. Clave en las instrucciones de liquidación." },
  { code: "CORRESPONDENT", t: "Banco Corresponsal", d: "Enruta pagos internacionales en monedas o países donde BBVA no tiene presencia directa." },
  { code: "CLEARING HOUSE", t: "Cámara de Compensación", d: "Garantiza la entrega de valores contra el pago (DVP). LCH, Eurex Clearing, BME Clearing..." },
  { code: "DEALER", t: "Distribuidor", d: "Opera por cuenta propia haciendo mercado (market-maker) en instrumentos financieros." },
  { code: "AGENT BANK", t: "Banco Agente", d: "Gestiona procesos de financiación sindicada, IPOs o eventos corporativos en nombre del emisor." },
];

/** Nodo del árbol Global → Local → Operativo. */
function OrgNode({ level, name, note, color, star }) {
  const tx = useTx(); // nombre en acento legible en claro; borde/fondo-tinte con hex original
  return (
    <div className="w-full rounded-xl border px-3 py-2 text-center backdrop-blur-sm" style={{ borderColor: rgba(color, 0.45), borderTopWidth: 3, borderTopColor: color, background: rgba(color, 0.08) }}>
      {level && <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sand/55">{level}</p>}
      <p className="text-[13px] font-bold" style={{ color: tx(color) }}>{star ? "★ " : ""}{name}</p>
      {note && <p className="text-[11px] leading-snug text-sand/60">{note}</p>}
    </div>
  );
}

function Connector() {
  return <span aria-hidden className="mx-auto block h-4 w-px bg-serene/40" />;
}

function ArbolContrapartida() {
  const tx = useTx();
  const locales = [
    { name: "Citibank España", ops: [{ name: "Casa Matriz (Matrix)", note: "1 por cada Global", star: true }, { name: "Renta Fija" }] },
    { name: "Citibank México", ops: [{ name: "Derivados" }, { name: "FX" }] },
    { name: "Citibank UK", ops: [{ name: "Equity" }] },
  ];
  return (
    <div role="img" aria-label="Árbol de una contrapartida en tres niveles: nivel Global (Citibank N.A.), niveles Locales (España, México, UK) y niveles Operativos (Casa Matriz, Renta Fija, Derivados, FX, Equity)">
      <div className="mx-auto max-w-xs">
        <OrgNode level="Global" name="Citibank N.A." note="Datos regulatorios (afecta a todo el grupo)" color={PALETTE.lime} />
      </div>
      <Connector />
      <div className="grid gap-3 sm:grid-cols-3">
        {locales.map((l) => (
          <div key={l.name} className="flex flex-col">
            <OrgNode level="Local" name={l.name} note="Datos fiscales (representación real de la empresa)" color={PALETTE.serene} />
            <Connector />
            <div className="flex flex-col gap-1.5">
              {l.ops.map((op) => (
                <div
                  key={op.name}
                  className="rounded-lg border px-3 py-1.5 text-center"
                  style={{ borderColor: rgba(PALETTE.canary, op.star ? 0.9 : 0.4), background: op.star ? rgba(PALETTE.canary, 0.1) : "transparent" }}
                >
                  {/* Sin sand hardcodeado (rgba 247,248,248): text-sand/85 se tema solo; la estrella, canary temado. */}
                  <p className={`text-[12px] font-semibold ${op.star ? "" : "text-sand/85"}`} style={op.star ? { color: tx(PALETTE.canary) } : undefined}>{op.star ? "★ " : ""}{op.name}</p>
                  {op.note && <p className="text-[11px] text-sand/55">{op.note}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs leading-relaxed text-sand/60">
        <strong className="text-canary">OPERATIVO</strong> — principales datos de la contrapartida · de cada Local cuelgan N
        operativas, y por cada Global hay 1 operativa especial «Casa Matriz».
      </p>
    </div>
  );
}

/* ─── Emisiones ───────────────────────────────────────────────── */

const ISSU_TIPOS = [
  { label: "Derivados", t: "Futuros y opciones", d: "Contratos cuyo valor depende de un activo subyacente.", tags: ["Futures · Options"] },
  { label: "Fondos", t: "Fondos de inversión y REITs", d: "Vehículos de inversión colectiva, partnerships, real estate.", tags: ["Fund · Limited Partnerships"] },
  { label: "Índices", t: "Equity, Spot y Ad-Hoc", d: "Índices de referencia y cestas personalizadas.", tags: ["Equity Index · Spot Index · Ad-Hoc"] },
  { label: "Renta Fija", t: "Bonos, letras y estructurados", dim: true, d: <>RDR almacena RF por necesidades operativas, pero el <strong className="text-sand">maestro de RF es Asset Control</strong>.</>, tags: ["Bond · T-Bill · Zero Coupon · CMBS"] },
  { label: "Otros", t: "Commodities, híbridos…", d: "Instrumentos especiales y categorías complementarias.", tags: ["Commodities · Hybrid · Misc"] },
];

const RV_MODELOS = [
  { t: "Acciones ordinarias", d: "Modelo EQUITY. Identificadas por ISIN y Ticker. Cotizadas en bolsa." },
  { t: "ADR / GDR", d: "Modelo ADRGDR. Recibo de depósito que representa acciones de otro país." },
  { t: "Derechos y warrants", d: "Modelo WARRANT. Derecho de suscripción con fecha de expiración limitada." },
  { t: "REITs", d: "Modelo REITS. Fondos cotizados de inversión inmobiliaria." },
];

/* ─── Acuerdos legales ────────────────────────────────────────── */

const LAGR_CICLO = [
  { t: "Firma", d: "BBVA y contraparte formalizan el contrato", color: PALETTE.lime },
  { t: "Alta en RDR", d: "Manual o vía integración (MarkitSERV, SWIFT)", color: PALETTE.lime },
  { t: "Activo", d: "Habilita operativa de trading desde esa fecha", color: PALETTE.serene },
  { t: "Reporting", d: "EMIR, SFTR usan los datos del acuerdo", color: PALETTE.serene },
  { t: "Terminación", d: "Inactivo (soft-delete, nunca se borra)", color: "rgba(133,200,255,0.45)" },
];

const LAGR_TIPOS = [
  { code: "ISDA", full: "International Swaps and Derivatives Association", color: PALETTE.lime, d: <>Derivados OTC: swaps de tipos de interés (IRS), credit default swaps (CDS), opciones OTC. Estándar mundial. <strong className="text-sand">18.243 contratos en BBVA RDR.</strong></> },
  { code: "CMOF", full: "Contrato Marco de Operaciones Financieras", color: PALETTE.canary, d: <>Equivalente español del ISDA. Derivados OTC bajo la legislación española (AEB). <strong className="text-sand">27.265 contratos — el más frecuente en BBVA.</strong></> },
  { code: "GMRA", full: "Global Master Repurchase Agreement", color: PALETTE.serene, d: "Contratos de recompra (repos): venta de valores con compromiso de recompra a precio y fecha acordados. Financiación a corto plazo." },
  { code: "GMSLA", full: "Global Master Securities Lending Agreement", color: PALETTE.serene, d: "Préstamo de valores: BBVA o su cliente presta acciones/bonos a cambio de colateral y una tarifa de préstamo." },
  { code: "CSA / Annexe", full: "Credit Support Annex (Anexo de colateral)", color: "#B9D4EE", d: "Complemento al ISDA/CMOF. Define qué activos se pueden usar como colateral, umbrales de exposición y frecuencia de ajuste (variation margin, initial margin)." },
  { code: "EMA & Otros", full: "European Master Agreement, NAFMII, FBF y otros", color: "#B9D4EE", d: <>Acuerdos regionales (FBF para Francia, NAFMII para China) y tipos propietarios. RDR gestiona <strong className="text-sand">76 tipos distintos</strong> en total.</> },
];

/* ─── SSIs ────────────────────────────────────────────────────── */

const SSI_CARDS = [
  { t: "Cuenta propia", color: SSIS, d: "BBVA liquida en su propia cuenta custodio. Los valores quedan depositados en una cuenta de BBVA en el custodio local." },
  { t: "Cuenta ajena (tercero)", color: SSIS, d: "Los valores se liquidan en la cuenta de un tercero (p. ej. el propio cliente de BBVA). Se especifica el beneficiario final." },
  { t: "¿Cuándo aplica una SSI?", color: PALETTE.lime, d: <><strong className="text-sand">Combinación única:</strong> Contraparte + Moneda + Mercado + Tipo de activo. Si existe una SSI específica para esa combinación, prevalece sobre la SSI general.</> },
  { t: "Vigencia temporal", color: PALETTE.canary, d: "Una SSI puede tener fecha de inicio y fin. Permite planificar cambios de custodio con antelación: «desde el 1 de junio usar la nueva cuenta en Euroclear»." },
];

const CADENA = [
  { t: "Beneficiario", color: PALETTE.lime, d: <>El receptor <strong className="text-sand">final</strong> de los valores o el dinero. Puede ser la misma contraparte o un tercero (p. ej. el cliente final). Tiene su cuenta y su BIC SWIFT.</> },
  { t: "Clearing Agent", color: PALETTE.serene, d: <>La <strong className="text-sand">cámara de compensación</strong> que garantiza que la entrega de valores y el pago se producen simultáneamente. LCH, Euroclear, DTCC, BME Clearing...</> },
  { t: "Banco Corresponsal", color: PALETTE.canary, d: <>Banco <strong className="text-sand">intermediario</strong> para el enrutamiento de pagos internacionales. Cuando BBVA necesita pagar en una moneda o país donde no tiene presencia directa.</> },
  { t: "Intermediario 1/2", color: "#B9D4EE", d: <>Bancos <strong className="text-sand">adicionales</strong> en la cadena cuando la ruta de pagos pasa por múltiples jurisdicciones. Opcional: solo cuando la ruta lo requiere.</> },
  { t: "Custodio Local", color: PALETTE.lime, d: <>El banco que <strong className="text-sand">custodia los valores</strong> en un mercado local. Conectado al depósito central (CSD) del país. Puede haber un custodio global y uno local.</> },
];

/* ─── SCIs ────────────────────────────────────────────────────── */

const SCI_DEFINE = [
  { t: "Tipo de instrucción", color: SCIS, d: <><strong className="text-sand">CONFIRMACIÓN</strong>: confirmación bilateral del trade con la contraparte (la más habitual).<br /><strong className="text-sand">NOTIFICACIÓN</strong>: aviso unilateral a un tercero (ej.: agente fiscal, depositario) para un tipo de trade concreto. A diferencia de CONFIRMACIÓN, lleva un campo <em>Notification Type</em> obligatorio.</> },
  { t: "Productos cubiertos", color: PALETTE.serene, d: <>¿Para qué tipos de operación aplica? Una SCI puede cubrir <code className="rounded bg-white/10 px-1 text-[12px]">ALL</code> (todos los productos) o productos específicos. Ej.: «Esta SCI cubre todos los derivados OTC con esta contraparte.»</> },
  { t: "Contacto destinatario", color: PALETTE.lime, d: <>La persona de la contraparte que recibe la confirmación. Los <strong className="text-sand">Contactos</strong> (<code className="rounded bg-white/10 px-1 text-[12px]">FT_T_CNTC</code>, ~198K registros) guardan nombre, email, fax, idioma y departamento. Cada medio (EMAIL / FAX) referencia su contacto activo.</> },
  { t: "Medio de envío", color: PALETTE.canary, d: <>Canal real de transporte: EMAIL (70,8%), FAX (14,1%), SWIFT MT (8,1%), FX ALL (3,1%)… Los <em>identificadores de participante</em> (DTCC ID, IceLink ID, Bloomberg BIC) son códigos en plataformas externas, distintos del canal.</> },
  { t: "Rol · Branch · Vigencia", color: "#B9D4EE", d: <>BBVA actúa como <strong className="text-sand">emisor</strong>, <strong className="text-sand">receptor</strong> o ambos. Cada SCI aplica a un branch BBVA concreto y tiene fechas de inicio/fin para planificar cambios.</> },
];

const CANALES_SCI = [
  { t: "EMAIL", color: PALETTE.lime },
  { t: "FAX", color: PALETTE.canary },
  { t: "SWIFT MT", color: PALETTE.serene },
  { t: "FX ALL", color: PALETTE.aqua },
  { t: "MISYS / BBG / otros", color: "#B9D4EE" },
];

/* ─── Relaciones y diccionario ────────────────────────────────── */

const DATA_RELATED = [
  { t: "Settlement Instructions", d: "Instrucciones de liquidación" },
  { t: "Confirmations", d: "Confirmaciones y notificaciones" },
  { t: "Legal Agreements", d: "Contratos firmados" },
  { t: "Contacts", d: "Personas de contacto" },
];

const ROLES_CLAVE = [
  { rol: "Emisor", d: <>Actuar como emisor en <strong className="text-sand">Emisiones</strong></> },
  { rol: "Beneficiario", d: <>Actuar como beneficiario en <strong className="text-sand">Liquidaciones</strong></> },
  { rol: "Bco. Corresponsal", d: <>Actuar como banco corresponsal en <strong className="text-sand">Liquidaciones</strong></> },
  { rol: "Bco. Custodio", d: <>Actuar como banco custodio en <strong className="text-sand">Liquidaciones</strong></> },
];

const DICCIONARIO = [
  { t: "Productos", d: "Tipología de productos financieros y sus mapeos entre sistemas" },
  { t: "Divisas", d: "Monedas y sus identificadores en cada aplicativo" },
  { t: "Pares FX", d: "Pares de divisas para operaciones de cambio" },
  { t: "Geografías", d: "Geographic Units: países, regiones y zonas operativas" },
  { t: "Calendarios", d: "Festivos y días hábiles por plaza/mercado" },
];

export default function SeccionDetalle() {
  const tx = useTx(); // acentos data-driven como TEXTO legibles en claro; tintes/bordes con hex original
  return (
    <>
      <SlideModulo id="detalle"
        n="03"
        color={C}
        title="Entidades en detalle"
        desc="Cada entidad principal explicada desde cero: qué es, qué datos guarda, cómo se relaciona con las demás y por qué existe."
      />

      {/* ══ Contrapartidas (slides 13–15) ═══════════════════════ */}
      <Slide id="detalle-1">
        <BlockHeader color={FINS} kicker="FINS · 692.000 entidades activas" title="Contrapartidas" />

        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2">
          {FINS_BOXES.map((b) => (
            <div
              key={b.label}
              className={`rounded-2xl border p-5 backdrop-blur-sm ${b.hl ? "" : "border-white/10 bg-white/[0.045]"}`}
              style={b.hl ? { borderColor: rgba(FINS, 0.55), background: rgba(FINS, 0.09) } : undefined}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-serene">{b.label}</p>
              <H3 className="mt-1">{b.title}</H3>
              <p className="mt-2 text-[13px] leading-relaxed text-sand/70">{b.desc}</p>
            </div>
          ))}
        </Reveal>

      </Slide>
      <Slide id="detalle-2">
        <BlockHeader color={FINS} kicker="Una misma entidad, organizada en tres niveles" title="Global → Local → Operativo" />
        <Reveal className="mt-8">
          <Glass accent={FINS} className="p-5 sm:p-7">
            <ArbolContrapartida />
          </Glass>
        </Reveal>

      </Slide>
      <Slide id="detalle-3">
        <BlockHeader color={FINS} kicker="Una entidad puede tener múltiples roles simultáneos" title="Roles: ¿qué hace la contraparte con BBVA?" />
        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.code} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-serene">{r.code}</p>
              <p className="mt-1 text-sm font-bold text-sand">{r.t}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-sand/65">{r.d}</p>
            </div>
          ))}
        </Reveal>

      </Slide>

      {/* ══ Emisiones (slides 16–17) ════════════════════════════ */}
      <Slide id="detalle-4">
        <BlockHeader color={ISSU} kicker="ISSU · 12 millones de instrumentos" title="Emisiones — los activos que gestiona BBVA" />

        <Reveal className="mt-8 grid gap-3 lg:grid-cols-3">
          {/* Renta variable: el maestro, tarjeta destacada a doble altura */}
          <div className="flex flex-col rounded-2xl border p-5 backdrop-blur-sm lg:row-span-2" style={{ borderColor: rgba(ISSU, 0.6), background: rgba(ISSU, 0.09) }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime">⭐ Maestro en el banco</p>
            <H3 className="mt-1">Renta Variable</H3>
            <p className="mt-2 text-[14px] leading-relaxed text-sand/80">
              RDR es el <strong className="text-sand">repositorio maestro de Renta Variable</strong> del banco. Acciones, ETFs,
              preferentes, convertibles, warrants, derechos, ADRs/GDRs…
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Common Stock", "Preferred Stock", "ETF", "Warrants", "Rights", "Receipts (ADR/GDR)"].map((t) => (
                <Pill key={t} color={ISSU} className="normal-case tracking-normal">{t}</Pill>
              ))}
            </div>
          </div>
          {ISSU_TIPOS.map((tp) => (
            <div key={tp.label} className={`rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm ${tp.dim ? "opacity-80" : ""}`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-lime">{tp.label}</p>
              <p className="mt-1 text-sm font-bold text-sand">{tp.t}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-sand/65">{tp.d}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tp.tags.map((t) => <Pill key={t} color={ISSU} className="normal-case tracking-normal">{t}</Pill>)}
              </div>
            </div>
          ))}
        </Reveal>

      </Slide>
      <Slide id="detalle-5">
        <BlockHeader color={ISSU} kicker="El nexo entre empresas e instrumentos" title="El Emisor y la Renta Variable en RDR">
          Cuando Telefónica emite bonos o pone acciones en bolsa, en RDR se modela como:
        </BlockHeader>

        <Reveal className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <EdgeCard accent={ISSU} title="Contrapartida con rol ISSUER">
              Telefónica S.A. existe como <strong className="text-sand">entidad en FINS</strong> con el rol «ISSUER» activo. Tiene su
              LEI, su CIF, sus datos regulatorios.
            </EdgeCard>
            <EdgeCard accent={ISSU} title="Vinculada a sus instrumentos">
              Cada bono u acción de Telefónica tiene el campo <strong className="text-sand">INSTR_ISSR_ID</strong> apuntando a la
              entidad. Si el emisor entra en default, todos sus instrumentos se marcan automáticamente.
            </EdgeCard>
            <EdgeCard accent={PALETTE.lime} title="Datos Bloomberg del emisor">
              Bloomberg alimenta datos del emisor (sector, país, outstanding, índices de pertenencia) directamente al nivel operativo de
              la contrapartida.
            </EdgeCard>
          </div>
          <div>
            <p className="text-[14px] leading-relaxed text-sand/80">
              Las acciones cotizadas son los instrumentos de mayor rotación en BBVA CIB. RDR gestiona:
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {RV_MODELOS.map((m) => (
                <div key={m.t} className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-sm">
                  <p className="text-[13px] font-bold text-lime">{m.t}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-sand/65">{m.d}</p>
                </div>
              ))}
            </div>
            <EdgeCard accent={ISSU} className="mt-3">
              <strong className="text-sand">Book-Entry (Anotación en cuenta):</strong> en España (Iberclear) y México (Indeval) las
              acciones no son físicas — son anotaciones electrónicas. RDR gestiona esto con los modelos{" "}
              <strong className="text-sand">BEISSU</strong> (14 modelos especializados).
            </EdgeCard>
          </div>
        </Reveal>

      </Slide>

      {/* ══ Acuerdos legales (slides 18–19) ═════════════════════ */}
      <Slide id="detalle-6">
        <BlockHeader color={LAGR} kicker="LAGR · 96.000 contratos firmados" title="Acuerdos Legales">
          Antes de que BBVA pueda operar derivados, repos o préstamos de valores con una contraparte, necesitan firmar un{" "}
          <strong className="text-sand">contrato marco</strong>. Este contrato define qué tipo de operaciones están permitidas y bajo qué
          condiciones.
        </BlockHeader>

        <Reveal className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-3">
            <EdgeCard accent={LAGR} title="🤝 Siempre dos partes">
              BBVA (rol INTERNAL) + la contraparte (rol EXTERNAL). No puede haber un acuerdo sin ambas.
            </EdgeCard>
            <EdgeCard accent={LAGR} title="📋 Productos cubiertos">
              El contrato especifica exactamente qué operaciones habilita: derivados OTC, repos, préstamo de valores, FX...
            </EdgeCard>
            <EdgeCard accent={LAGR} title="💼 Gestión de colateral (CSA)">
              Muchos acuerdos incluyen un anexo de colateral (Credit Support Annex) que define qué garantías se intercambian para cubrir
              exposición.
            </EdgeCard>
          </div>
          <Glass accent={LAGR}>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sand/60">Ciclo de vida</p>
            <ol className="mt-4 space-y-4">
              {LAGR_CICLO.map((s, i) => (
                <li key={s.t} className="relative flex gap-3 pl-1">
                  <span className="relative flex flex-col items-center">
                    <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    {i < LAGR_CICLO.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-white/15" />}
                  </span>
                  <p className="text-[13px] leading-relaxed text-sand/75">
                    <strong className="text-sand">{s.t}:</strong> {s.d}
                  </p>
                </li>
              ))}
            </ol>
          </Glass>
        </Reveal>

      </Slide>
      <Slide id="detalle-7">
        <BlockHeader color={LAGR} kicker="Cada tipo de operativa necesita su propio contrato" title="Tipos de Acuerdo Marco" />
        <Reveal className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAGR_TIPOS.map((t) => (
            <div key={t.code} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm" style={{ borderLeft: `3px solid ${t.color}` }}>
              <p className="font-display text-lg font-bold" style={{ color: tx(t.color) }}>{t.code}</p>
              <p className="mt-0.5 text-[11px] text-sand/55">{t.full}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-sand/75">{t.d}</p>
            </div>
          ))}
        </Reveal>

      </Slide>

      {/* ══ SSIs (slides 20–21) ═════════════════════════════════ */}
      <Slide id="detalle-8">
        <BlockHeader color={SSIS} kicker="SSIS · 857.000 instrucciones activas" title="SSIs — instrucciones de liquidación permanentes" />

        <Reveal className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 text-[14px] leading-relaxed text-sand/80">
            <p>
              Cuando BBVA cierra un trade con una contraparte, los valores o el dinero deben moverse físicamente. La pregunta es:{" "}
              <em>¿a qué cuenta y a través de qué banco?</em>
            </p>
            <p>
              La <strong className="text-sand">SSI (Standing Settlement Instruction)</strong> es la respuesta permanente a esa pregunta:{" "}
              <em>«Para pagar en USD a Citibank Madrid, envía el dinero al BIC CITIUS33, cuenta 1234567.»</em>
            </p>
            <p>
              Es <strong className="text-sand">permanente</strong> porque no hay que indicarla en cada operación. Se configura una vez y
              el sistema la aplica automáticamente cada vez que toca liquidar con esa contraparte en esa moneda y mercado.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {SSI_CARDS.map((c) => (
              <EdgeCard key={c.t} accent={c.color} title={c.t}>{c.d}</EdgeCard>
            ))}
          </div>
        </Reveal>

      </Slide>
      <Slide id="detalle-9">
        <BlockHeader color={SSIS} kicker="Los eslabones del camino del dinero o los valores" title="La cadena de participantes en la liquidación" />
        <Reveal className="mt-8">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            {CADENA.map((p, i) => (
              <div key={p.t} className="relative rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm" style={{ borderTop: `3px solid ${p.color}` }}>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: tx(p.color) }}>
                  <span className="mr-1.5 font-display tabular-nums text-sand/50">{i + 1}</span>{p.t}
                </p>
                <p className="mt-2 text-[12px] leading-relaxed text-sand/70">{p.d}</p>
              </div>
            ))}
          </div>
          <EdgeCard accent={SSIS} className="mt-4">
            💡 <strong className="text-sand">Cómo fluye el mensaje SWIFT:</strong> la SSI en RDR alimenta directamente los campos del
            mensaje MT (SWIFT): el Beneficiario va en el campo <em>:58: Beneficiary Institution</em>, el Corresponsal en{" "}
            <em>:57: Account with Institution</em>, el Clearing Agent en <em>:56: Intermediary</em> y el Custodio en{" "}
            <em>:53: Sender's Correspondent</em>.
          </EdgeCard>
        </Reveal>

      </Slide>

      {/* ══ SCIs (slides 22–23) ═════════════════════════════════ */}
      <Slide id="detalle-10">
        <BlockHeader color={SCIS} kicker="SCIS · 55.000 instrucciones activas" title="SCIs — instrucciones de confirmación de operaciones" />

        <Reveal className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="space-y-4 text-[14px] leading-relaxed text-sand/80">
              <p>
                Una vez que se acuerda un trade, la contraparte necesita recibir una <strong className="text-sand">confirmación</strong>:
                un documento que diga exactamente qué se ha acordado (precio, cantidad, fecha, contraparte...).
              </p>
              <p>
                La <strong className="text-sand">SCI (Standard Confirmation Instruction)</strong> define: ¿<em>cómo</em> enviamos esa
                confirmación? ¿<em>A quién</em>? ¿<em>Para qué productos</em>?
              </p>
            </div>
            <EdgeCard accent={SCIS} className="mt-4">
              <strong className="text-sand">Diferencia clave con las SSIs:</strong>
              <br />Las SSIs dicen cómo mover el dinero o los valores (liquidación).
              <br />Las SCIs dicen cómo comunicar que la operación se ha pactado (confirmación).
            </EdgeCard>
          </div>
          <div>
            <H3 className="mb-3">¿Qué define una SCI?</H3>
            <div className="flex flex-col gap-2.5">
              {SCI_DEFINE.map((c) => (
                <EdgeCard key={c.t} accent={c.color} title={c.t}>{c.d}</EdgeCard>
              ))}
            </div>
          </div>
        </Reveal>

      </Slide>
      <Slide id="detalle-11">
        <BlockHeader color={SCIS} kicker="SCIs — instrucciones de confirmación" title="Canales de confirmación" />
        <Reveal className="mt-8 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-sm" style={{ borderLeft: `4px solid ${PALETTE.lime}` }}>
              <p className="font-display text-lg font-bold text-lime">CONFIRMACIÓN</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-sand/80">
                Comunicación <strong className="text-sand">bilateral</strong> BBVA ↔ contraparte que confirma los términos del trade.{" "}
                <em>Notification Type</em> vacío.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-sm" style={{ borderLeft: `4px solid ${PALETTE.canary}` }}>
              <p className="font-display text-lg font-bold text-canary">NOTIFICACIÓN</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-sand/80">
                Aviso <strong className="text-sand">unilateral</strong> a un tercero (agente fiscal, depositario…). Requiere{" "}
                <em>Notification Type</em>.
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-serene">
              Contactos <span className="normal-case tracking-normal text-sand/55">· FT_T_CNTC (~198K)</span>
            </p>
            <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-sand/80">
              Persona de la contraparte que recibe la confirmación. Cada medio referencia un{" "}
              <strong className="text-sand">contacto activo</strong> con su email, fax, idioma y departamento.{" "}
              <span className="text-mandarin">Contacto inactivo → SCI bloqueada.</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime">Tipos de canal</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CANALES_SCI.map((c) => (
                /* Texto temado; borde-tinte con hex original; fondo glass con la utilidad temada (antes white 6% hardcodeado). */
                <span key={c.t} className="rounded-full border bg-white/[0.06] px-4 py-1.5 text-sm font-bold" style={{ color: tx(c.color), borderColor: rgba(c.color, 0.55) }}>
                  {c.t}
                </span>
              ))}
            </div>
          </div>
        </Reveal>

      </Slide>

      {/* ══ Relación entre entidades (slide 24) ═════════════════ */}
      <Slide id="detalle-12">
        <BlockHeader color={C} kicker="Visión de conjunto" title="Relación entre Entidades">
          RDR es una <strong className="text-sand">base de datos relacional</strong>: todas las entidades están conectadas entre sí con
          la <strong className="text-sand">Contrapartida</strong> como eje central.
        </BlockHeader>

        <Reveal className="mt-8 grid gap-3 lg:grid-cols-2">
          <Glass accent={C}>
            <H3>
              Data Related <span className="font-sans text-xs font-normal text-sand/55">(sección en Contrapartidas)</span>
            </H3>
            <p className="mt-1.5 text-[13px] text-sand/70">Desde una contrapartida, la sección <em>Data Related</em> da acceso a:</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {DATA_RELATED.map((d) => (
                <div key={d.t} className="rounded-xl border px-3 py-2.5 text-center" style={{ borderColor: rgba(PALETTE.serene, 0.4), background: rgba(PALETTE.serene, 0.1) }}>
                  <p className="text-[13px] font-bold text-serene">{d.t}</p>
                  <p className="text-[11px] text-sand/60">{d.d}</p>
                </div>
              ))}
            </div>
          </Glass>
          <Glass accent={C} style={{ background: rgba(C, 0.07) }}>
            <H3>⚡ Los Roles son LA CLAVE</H3>
            <p className="mt-1.5 text-[13px] text-sand/70">Los roles determinan <strong className="text-sand">cómo actúa</strong> una contrapartida en cada contexto:</p>
            <div className="mt-3 flex flex-col gap-2">
              {ROLES_CLAVE.map((r) => (
                <div key={r.rol} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-white/[0.07] px-3.5 py-2">
                  <span className="min-w-[9.5rem] text-[13px] font-bold text-sand">{r.rol}</span>
                  <span className="text-[12px] text-sand/70">{r.d}</span>
                </div>
              ))}
            </div>
          </Glass>
        </Reveal>

      </Slide>

      {/* ══ Entidades diccionario (slide 25) ════════════════════ */}
      <Slide id="detalle-13">
        <BlockHeader color={C} kicker="Datos auxiliares" title="Entidades Diccionario">
          Además de las entidades principales, RDR actúa como <strong className="text-sand">diccionario/traductor</strong> entre
          aplicativos: mantiene las traducciones de códigos entre sistemas.
        </BlockHeader>

        <Reveal className="mt-8">
          <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {DICCIONARIO.map((d) => (
              <div key={d.t} className="rounded-2xl border p-4 text-center backdrop-blur-sm" style={{ borderColor: rgba(C, 0.4), background: rgba(C, 0.09) }}>
                <p className="font-display text-base font-bold text-sand">{d.t}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-sand/65">{d.d}</p>
              </div>
            ))}
          </div>
          <KeyIdea color={C} className="mt-5">
            <p className="text-[15px] font-normal text-sand/85">
              Ejemplo: cuando Murex envía un código de producto <em>«FX_SWAP»</em>, RDR traduce al código equivalente en Calypso
              (<em>«FxSwap»</em>), Star (<em>«FXSW»</em>) y demás consumidores.{" "}
              <strong className="text-sand">Un solo punto de traducción</strong> entre todos los sistemas.
            </p>
          </KeyIdea>
        </Reveal>
      </Slide>
    </>
  );
}
