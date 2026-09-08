"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useSnapshot } from "./datos";
import {
  num, eur, h, pct, curQ, pickTarifa, rentObjetivoTotal,
  horasTeoricasQ, ausenciasQ, dedicacionMedia,
  qsDisponibles, bloqueParaQ, colEjecucion, normQ,
} from "./model";
import { GLASS, FIELD, TEXT, Kpi, EmptyCard, PanelSkeleton, Bar, CargandoExcel } from "./ui";
import { IconGauge, IconPlus, IconX, IconReload, IconAlert } from "./icons";

/* Simulador de rentabilidad · Coordinación.
   Lee el estado ACTUAL del Excel (snapshot del backend) y a partir de ahí todo
   es simulación 100 % en cliente: personas, proyectos, bolsas/adelantos y
   tarifa. NUNCA escribe en el Excel.

   MODELO (idéntico al del Excel, para que los números casen):
     horasQ persona = horas IMPUTADAS reales del Q, escaladas por la dedicación
       simulada (las "horas teóricas" están vacías en el Excel para casi
       todos); las ausencias añadidas sobre las del Excel restan horas.
     costes  = Σ horasQ × coste/h de NFQ + NTER (los gastos de la hoja 6 NO
       cuentan en la rentabilidad del Excel)
     ingresos = (horas proyectos + horas consumidas de bolsas/adelantos,
       incl. hoja "Bolsa BBVA Cerrada") × tarifa
     rentabilidad = (ingresos − costes) / ingresos, vs objetivo ponderado
       NFQ/NTER del Excel. */

let uidSeq = 0;
const uid = () => ++uidSeq;

const HORAS_TEO_DEFECTO = 480; // persona nueva sin histórico: ~3 meses × 160 h


/* Rentabilidad que muestra el PROPIO Excel en las filas resumen del bloque
   (backend >= ago-2026: bloque.resumen con etiqueta + celdas y fórmulas).
   Es la referencia contra la que debe cuadrar la partida del simulador. */
function rentSegunExcel(bloque) {
  for (const r of bloque?.resumen || []) {
    if (!/rentabilidad/i.test(r.label) || /objetivo/i.test(r.label)) continue;
    for (const k of Object.keys(r.celdas || {})) {
      const v = num(r.celdas[k].v);
      if (v) return Math.abs(v) > 1 ? v / 100 : v; // 20,47 ó 0,2047
    }
  }
  return null;
}

function seedSim(data, q) {
  // Bloque del Q (o el último disponible para simular Qs futuros).
  const bloque = bloqueParaQ(data, q);
  const personas = (bloque?.personas || []).map((p) => {
    const costeHora = num(p.costeHora);
    // Horas base EXACTAS del Excel: su columna "Coste Q" ÷ coste/h, de modo
    // que Σ costes de partida = Σ columna "Coste Q" (lo que suma el Excel).
    // Sin "Coste Q" informado, la persona parte de 0 h (el Excel tampoco la
    // cuenta): nada de estimarle horas e inventar un coste que no existe.
    // Y si la fila queda FUERA del rango que suma la fila de total del Excel
    // (alguien añadido debajo sin ampliar la fórmula), parte también de 0:
    // el Excel no la está sumando y el simulador tiene que cuadrar con él.
    // Se avisa en pantalla con el nombre y el importe para poder corregirlo.
    const enSuma = p.enSumaExcel !== false;
    const horasBase = enSuma && num(p.costeQ) > 0 && costeHora > 0 ? num(p.costeQ) / costeHora : 0;
    return {
      id: uid(),
      nombre: p.nombre,
      equipo: p.equipo || "NFQ",
      costeHora,
      fueraSuma: !enSuma && num(p.costeQ) > 0,
      costeQExcel: num(p.costeQ),
      dedBase: dedicacionMedia(p) || 1, //   dedicación del Excel (la simulada escala sobre ella)
      ded: Math.round((dedicacionMedia(p) || 1) * 100),
      impQ: horasBase,
      ausBase: Math.round(ausenciasQ(p)), // ausencias ya reflejadas en el Excel
      aus: Math.round(ausenciasQ(p)),
      teoQ: Math.round(horasTeoricasQ(p)) || HORAS_TEO_DEFECTO,
      nueva: false,
    };
  });
  const qc = colEjecucion(data, q);
  const proyectos = (data.ejecucion?.records || [])
    .filter((r) => num(r.data?.[qc]) > 0)
    .map((r) => ({ id: uid(), nombre: String(r.data.Proyecto || r.data.proyecto || "Proyecto"), horas: num(r.data[qc]) }));
  // Bolsas y adelantos ABIERTOS. El Excel cuenta como horas ejecutadas del Q
  // los CONSUMOS del Q (columna Q del consumo), así que cada entrada parte de
  // sus consumos de este Q (editables para simular).
  const consumosDelQ = (b) =>
    (b.consumos || []).reduce((a, c) => a + (normQ(c.fecha) === q ? num(c.horas) : 0), 0);
  const bolsas = [
    ...(data.bolsa || []).map((b) => ({ tipo: "Bolsa", ...b })),
    ...(data.adelantos || []).map((b) => ({ tipo: "Adelanto", ...b })),
  ]
    .map((b) => {
      const horas = Math.round(consumosDelQ(b));
      // El "restante" del Excel YA descuenta los consumos de este Q: el tope
      // simulable del Q es restante + lo ya consumido en él.
      return {
        id: uid(), tipo: b.tipo, nombre: String(b.proyecto || b.responsable || "—"),
        disponible: num(b.restante) + horas, horas,
      };
    })
    .filter((b) => b.disponible > 0);
  // Consumos del Q según la fórmula del Excel (incluye la hoja 'Bolsa BBVA
  // Cerrada', que no está en la lista de arriba): la diferencia entra como
  // partida fija "bolsas cerradas".
  const horasSembradas = bolsas.reduce((a, b) => a + b.horas, 0);
  const horasBolsaExcel = num(data.bolsaHorasQ?.[q]);
  const bolsaCerrada = Math.max(0, Math.round(horasBolsaExcel - horasSembradas));
  const tarifa = num(pickTarifa(data, q));
  // Punto de partida según el Excel (antes de tocar nada): para comparar a
  // simple vista con la rentabilidad que muestra el propio Excel. Los GASTOS
  // (hoja 6) NO cuentan: la rentabilidad del Excel solo usa costes NFQ+NTER.
  const costesBase = personas.reduce((a, p) => a + p.impQ * p.costeHora, 0);
  const ingresosBase =
    (proyectos.reduce((a, p) => a + p.horas, 0) + horasSembradas + bolsaCerrada) * tarifa;
  const fueraDeSuma = personas
    .filter((p) => p.fueraSuma)
    .map((p) => ({ nombre: p.nombre, coste: p.costeQExcel }));
  const base = {
    ingresos: ingresosBase,
    costes: costesBase,
    fueraDeSuma,
    rent: ingresosBase > 0 ? (ingresosBase - costesBase) / ingresosBase : 0,
    rentExcel: rentSegunExcel(bloque), // la que muestra el propio Excel (o null)
    aproximado: normQ(bloque?.q || "") !== q, // Q futuro sin bloque propio
  };
  return { personas, proyectos, bolsas, bolsaCerrada, tarifa, base };
}

/* Horas del Q de una persona en la simulación:
   - existentes: horas base del Excel × (dedicación simulada / dedicación del
     Excel), menos las ausencias AÑADIDAS sobre las que ya recoge el Excel
     (una persona sin coste en el Excel parte de 0 h y 0 €, como en el Excel);
   - nuevas (añadidas a mano): teóricas × dedicación − ausencias. */
const horasQDe = (p) => {
  if (p.nueva) return Math.max(0, (p.teoQ * p.ded) / 100 - p.aus);
  const factor = p.dedBase ? p.ded / 100 / p.dedBase : 1;
  return Math.max(0, p.impQ * factor - Math.max(0, p.aus - p.ausBase));
};

/* Fila de persona: todo editable en línea (coste, dedicación, ausencias). Las
   que el Excel deja fuera de su SUMA se marcan y parten de 0 h, para que la
   partida cuadre con él; se pueden simular igual subiéndoles la dedicación. */
function PersonaRow({ p, onUpd, onDel }) {
  const horasQ = horasQDe(p);
  const costeQ = horasQ * p.costeHora;
  return (
    <li className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
          style={p.equipo === "NFQ"
            ? { color: "#001391", backgroundColor: PALETTE.serene }
            : { color: "#001391", backgroundColor: PALETTE.canary }}
        >
          {p.equipo}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-sand">
          {p.nombre}
          {p.fueraSuma && (
            <span
              className={`ml-1.5 whitespace-nowrap text-[10px] font-bold ${TEXT.mandarin}`}
              title={`El Excel no la incluye en su fila de total (${eur.format(p.costeQExcel)}): amplía el rango de la SUMA`}
            >
              ⚠ fuera de la suma del Excel
            </span>
          )}
        </span>
        <span className="text-[11px] tabular-nums text-sand/55">{h(horasQ)} · <strong className="text-sand/80">{eur.format(costeQ)}</strong></span>
        <button
          type="button"
          onClick={onDel}
          aria-label={`Quitar a ${p.nombre} de la simulación`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sand/40 transition hover:bg-white/10 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
        >
          <IconX size={13} />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 items-end gap-x-3 gap-y-2 sm:grid-cols-[1fr_110px_110px]">
        <label className="col-span-2 block sm:col-span-1">
          <span className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-sand/50">
            Dedicación <span className="tabular-nums text-sand/80">{p.ded}%</span>
          </span>
          <input
            type="range" min="0" max="100" step="5" value={p.ded}
            aria-label={`Dedicación de ${p.nombre}`}
            onChange={(e) => onUpd({ ded: Number(e.target.value) })}
            className="w-full accent-[#88E783]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Coste €/h</span>
          <input
            type="number" min="0" step="0.1" value={p.costeHora}
            onChange={(e) => onUpd({ costeHora: num(e.target.value) })}
            className={`${FIELD} w-full !py-1 text-right tabular-nums`}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Ausencias h/Q</span>
          <input
            type="number" min="0" step="1" value={p.aus}
            onChange={(e) => onUpd({ aus: num(e.target.value) })}
            className={`${FIELD} w-full !py-1 text-right tabular-nums`}
          />
        </label>
      </div>
    </li>
  );
}

function ProyectoRow({ pr, tarifa, onUpd, onDel }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <span className="min-w-0 flex-1 break-words text-[13px] font-semibold text-sand">{pr.nombre}</span>
      <label className="flex items-center gap-1.5">
        <input
          type="number" min="0" step="10" value={pr.horas}
          aria-label={`Horas de ${pr.nombre}`}
          onChange={(e) => onUpd({ horas: num(e.target.value) })}
          className={`${FIELD} w-24 !py-1 text-right tabular-nums`}
        />
        <span className="text-[11px] text-sand/50">h</span>
      </label>
      <span className="w-24 shrink-0 text-right text-[12px] font-bold tabular-nums text-lime">{eur.format(pr.horas * tarifa)}</span>
      <button
        type="button"
        onClick={onDel}
        aria-label={`Quitar ${pr.nombre}`}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sand/40 transition hover:bg-white/10 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
      >
        <IconX size={13} />
      </button>
    </li>
  );
}

export default function SimuladorRoute() {
  const { snap, cargando } = useSnapshot();
  const data = snap?.data;

  // Todos los Qs con actividad, incluidos FUTUROS (iniciativas/ejecución).
  const qs = useMemo(() => qsDisponibles(data), [data]);
  const [q, setQ] = useState(null);
  useEffect(() => {
    if (!qs.length || q) return;
    setQ(qs.includes(curQ()) ? curQ() : qs[qs.length - 1]);
  }, [qs, q]);

  const [sim, setSim] = useState(null);
  const seededQ = useRef(null);
  const touched = useRef(false); // el usuario ya ha tocado la simulación de este Q
  const reset = useCallback(() => {
    if (!data || !q) return;
    touched.current = false;
    setSim(seedSim(data, q));
  }, [data, q]);
  useEffect(() => {
    if (!data || !q) return;
    // Re-siembra al cambiar de Q y cuando el snapshot FRESCO sustituye al de
    // la caché de sesión — pero sin pisar una simulación ya empezada.
    const key = q + (snap?.cached ? "|cache" : "|fresh");
    if (seededQ.current === key) return;
    if (touched.current && String(seededQ.current || "").split("|")[0] === q) {
      seededQ.current = key;
      return;
    }
    seededQ.current = key;
    setSim(seedSim(data, q));
  }, [data, q, snap]);

  // Formularios de alta
  const [nuevaPersona, setNuevaPersona] = useState({ nombre: "", equipo: "NFQ", coste: 30 });
  const [nuevoProyecto, setNuevoProyecto] = useState({ nombre: "", horas: 100 });

  const upd = (patch) => {
    touched.current = true;
    setSim((s) => ({ ...s, ...patch }));
  };
  const updPersona = (id, patch) => upd({ personas: sim.personas.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const updProyecto = (id, patch) => upd({ proyectos: sim.proyectos.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  /* ---------- resultados ---------- */
  const r = useMemo(() => {
    if (!sim || !data) return null;
    const bloque = (data.economico?.bloques || []).find((b) => b.q === q) || {};
    let costeNFQ = 0, costeNTER = 0, horasEquipo = 0;
    sim.personas.forEach((p) => {
      const hq = horasQDe(p);
      horasEquipo += hq;
      const c = hq * p.costeHora;
      if (p.equipo === "NFQ") costeNFQ += c; else costeNTER += c;
    });
    const costes = costeNFQ + costeNTER; // sin gastos: como la rentabilidad del Excel
    const horasProyectos = sim.proyectos.reduce((a, p) => a + num(p.horas), 0);
    const horasBolsa = sim.bolsas.reduce((a, b) => a + num(b.horas), 0) + num(sim.bolsaCerrada);
    const horasFacturables = horasProyectos + horasBolsa;
    const ingresos = horasFacturables * sim.tarifa;
    const margen = ingresos - costes;
    const rent = ingresos > 0 ? margen / ingresos : 0;
    const objetivo = rentObjetivoTotal(costeNFQ, costeNTER, num(bloque.rentObjetivoNFQ) || 0.25, num(bloque.rentObjetivoNTER) || 0.2);
    return { costeNFQ, costeNTER, costes, horasEquipo, horasProyectos, horasBolsa, horasFacturables, ingresos, margen, rent, objetivo };
  }, [sim, data, q]);

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.lime }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-lime/80">Coordinación</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              <IconGauge size={34} className="text-lime" /> Simulador de rentabilidad
            </h1>
          </div>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Juega con personas, dedicaciones, costes, proyectos y horas para ver la rentabilidad de cada Q.{" "}
            <strong className="text-lime">Solo simulación: el Excel no se toca.</strong>
          </p>
          {snap?.demo && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> Modo demo ({snap.error}) — datos de ejemplo.
            </p>
          )}
          {snap && !snap.demo && snap.error && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> No se pudo actualizar desde el Excel ({snap.error}) — mostrando la última copia cargada.
            </p>
          )}
          {snap && !snap.demo && data?.libro && (
            <p className="mt-2 text-[11px] text-sand/45">
              Datos de{" "}
              <a href={data.libro.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-sand/75">
                {data.libro.nombre}
              </a>
              {data.generadoEn
                ? ` · snapshot de las ${new Date(data.generadoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          )}
        </header>

        {(cargando || !snap) && <CargandoExcel actualizando={!!r} />}
        {!snap || !sim || !r ? (
          <PanelSkeleton />
        ) : (
          <>
            {/* Selector de Q + reset */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sand/60">
                Trimestre
                <select
                  value={q || ""}
                  onChange={(e) => { touched.current = false; setQ(e.target.value); }}
                  className={`${FIELD} !py-2 font-bold`}
                >
                  {qs.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={reset}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.055] px-4 py-2 text-xs font-bold uppercase tracking-wider text-sand/80 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <IconReload size={13} /> Restablecer al Excel
              </button>
            </div>

            {/* Punto de partida del Excel (para contrastar con su rentabilidad) */}
            <p className="mb-4 text-[11.5px] text-sand/55">
              Partida leída del Excel{sim.base.aproximado ? " (Q sin bloque propio: equipo del último Q)" : ""}:{" "}
              ingresos <strong className="tabular-nums text-sand/80">{eur.format(sim.base.ingresos)}</strong> · costes{" "}
              <strong className="tabular-nums text-sand/80">{eur.format(sim.base.costes)}</strong> · rentabilidad{" "}
              <strong className={`tabular-nums ${TEXT.lime}`}>{(sim.base.rent * 100).toFixed(2)}%</strong>
              {sim.base.fueraDeSuma?.length > 0 && (
                <>
                  {" · "}
                  <span className={TEXT.mandarin}>
                    ⚠ la fila de total del Excel no llega a{" "}
                    {sim.base.fueraDeSuma.map((f) => `${f.nombre} (${eur.format(f.coste)})`).join(", ")}
                    : amplía el rango de la SUMA para incluirla
                  </span>
                </>
              )}
              {sim.base.rentExcel != null && (
                <>
                  {" · el Excel muestra "}
                  <strong className={`tabular-nums ${Math.abs(sim.base.rentExcel - sim.base.rent) > 0.005 ? TEXT.mandarin : TEXT.lime}`}>
                    {(sim.base.rentExcel * 100).toFixed(2)}%
                  </strong>
                  {Math.abs(sim.base.rentExcel - sim.base.rent) > 0.005 && " (no cuadra — revisar modelo)"}
                </>
              )}
            </p>

            {/* KPIs */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Ingresos del Q" value={eur.format(r.ingresos)} accent="serene" />
              <Kpi label="Costes del Q" value={eur.format(r.costes)} accent="canary" />
              <Kpi label="Margen" value={eur.format(r.margen)} accent={r.margen >= 0 ? "lime" : "mandarin"} />
              <Kpi
                label={`Rentabilidad (objetivo ${pct(r.objetivo)})`}
                value={pct(r.rent)}
                accent={r.rent >= r.objetivo ? "lime" : "mandarin"}
              />
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
              {/* ── Personas ── */}
              <section className={`${GLASS} p-4`} aria-label="Personas de la simulación">
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold text-sand">Personas</h2>
                  <span className="text-[11px] tabular-nums text-sand/55">
                    {sim.personas.length} personas · {h(r.horasEquipo)} disponibles
                  </span>
                </div>
                {sim.personas.length === 0 && <EmptyCard>Sin personas: añade abajo.</EmptyCard>}
                <ul className="space-y-2">
                  {sim.personas.map((p) => (
                    <PersonaRow
                      key={p.id}
                      p={p}
                      onUpd={(patch) => updPersona(p.id, patch)}
                      onDel={() => upd({ personas: sim.personas.filter((x) => x.id !== p.id) })}
                    />
                  ))}
                </ul>
                {/* Alta de persona */}
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/[0.08] pt-3">
                  <label className="min-w-[160px] flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Nueva persona</span>
                    <input
                      type="text" placeholder="Apellidos, Nombre" value={nuevaPersona.nombre}
                      onChange={(e) => setNuevaPersona({ ...nuevaPersona, nombre: e.target.value })}
                      className={`${FIELD} w-full`}
                    />
                  </label>
                  <label>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Equipo</span>
                    <select
                      value={nuevaPersona.equipo}
                      onChange={(e) => setNuevaPersona({ ...nuevaPersona, equipo: e.target.value })}
                      className={`${FIELD} block`}
                    >
                      <option value="NFQ">NFQ</option>
                      <option value="NTER">NTER</option>
                    </select>
                  </label>
                  <label>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">€/h</span>
                    <input
                      type="number" min="0" step="0.5" value={nuevaPersona.coste}
                      onChange={(e) => setNuevaPersona({ ...nuevaPersona, coste: num(e.target.value) })}
                      className={`${FIELD} w-20 text-right tabular-nums`}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={!nuevaPersona.nombre.trim()}
                    onClick={() => {
                      upd({
                        personas: [...sim.personas, {
                          id: uid(), nombre: nuevaPersona.nombre.trim(), equipo: nuevaPersona.equipo,
                          costeHora: nuevaPersona.coste, ded: 100, dedBase: 1, aus: 0, ausBase: 0,
                          impQ: 0, teoQ: HORAS_TEO_DEFECTO, nueva: true,
                        }],
                      });
                      setNuevaPersona({ nombre: "", equipo: "NFQ", coste: 30 });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#88E783] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    <IconPlus size={13} /> Añadir
                  </button>
                </div>
              </section>

              <div className="space-y-4">
                {/* ── Proyectos / ingresos ── */}
                <section className={`${GLASS} p-4`} aria-label="Proyectos de la simulación">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-display text-lg font-bold text-sand">Proyectos · horas a ejecutar</h2>
                    <label className="flex items-center gap-1.5 text-[11px] text-sand/55">
                      Tarifa
                      <input
                        type="number" min="0" step="0.01" value={sim.tarifa}
                        onChange={(e) => upd({ tarifa: num(e.target.value) })}
                        className={`${FIELD} w-20 !py-1 text-right tabular-nums`}
                      />
                      €/h
                    </label>
                  </div>
                  {sim.proyectos.length === 0 && <EmptyCard>Sin proyectos en este Q: añade abajo.</EmptyCard>}
                  <ul className="space-y-1.5">
                    {sim.proyectos.map((pr) => (
                      <ProyectoRow
                        key={pr.id}
                        pr={pr}
                        tarifa={sim.tarifa}
                        onUpd={(patch) => updProyecto(pr.id, patch)}
                        onDel={() => upd({ proyectos: sim.proyectos.filter((x) => x.id !== pr.id) })}
                      />
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-white/[0.08] pt-3">
                    <label className="min-w-[160px] flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Nuevo proyecto</span>
                      <input
                        type="text" placeholder="Nombre…" value={nuevoProyecto.nombre}
                        onChange={(e) => setNuevoProyecto({ ...nuevoProyecto, nombre: e.target.value })}
                        className={`${FIELD} w-full`}
                      />
                    </label>
                    <label>
                      <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Horas</span>
                      <input
                        type="number" min="0" step="10" value={nuevoProyecto.horas}
                        onChange={(e) => setNuevoProyecto({ ...nuevoProyecto, horas: num(e.target.value) })}
                        className={`${FIELD} w-24 text-right tabular-nums`}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!nuevoProyecto.nombre.trim()}
                      onClick={() => {
                        upd({ proyectos: [...sim.proyectos, { id: uid(), nombre: nuevoProyecto.nombre.trim(), horas: nuevoProyecto.horas }] });
                        setNuevoProyecto({ nombre: "", horas: 100 });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#88E783] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                    >
                      <IconPlus size={13} /> Añadir
                    </button>
                  </div>
                </section>

                {/* ── Bolsas y adelantos ── */}
                {(sim.bolsas.length > 0 || sim.bolsaCerrada > 0) && (
                  <section className={`${GLASS} p-4`} aria-label="Bolsas y adelantos">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-display text-lg font-bold text-sand">Bolsas y adelantos</h2>
                      <span className="text-[11px] tabular-nums text-sand/55">
                        {h(sim.bolsas.reduce((a, b) => a + Math.max(0, b.disponible - num(b.horas)), 0))} restantes en total
                      </span>
                    </div>
                    <p className="mb-3 text-[11px] text-sand/50">
                      Horas ya vendidas pendientes de ejecutar. Pon cuántas consumirías este Q: cuentan como ingreso a tarifa.
                    </p>
                    <ul className="space-y-1.5">
                      {sim.bolsas.map((b) => (
                        <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                          <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                            style={b.tipo === "Bolsa"
                              ? { color: "#001391", backgroundColor: PALETTE.serene }
                              : { color: "#001391", backgroundColor: PALETTE.mandarin }}
                          >
                            {b.tipo}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-[12.5px] font-semibold text-sand">{b.nombre}</span>
                          <span className="text-[10.5px] tabular-nums text-sand/45">quedan {h(Math.max(0, b.disponible - num(b.horas)))}</span>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="number" min="0" step="10" value={b.horas}
                              aria-label={`Horas a consumir de ${b.nombre}`}
                              onChange={(e) =>
                                upd({ bolsas: sim.bolsas.map((x) => (x.id === b.id ? { ...x, horas: num(e.target.value) } : x)) })
                              }
                              className={`${FIELD} w-24 !py-1 text-right tabular-nums ${num(b.horas) > b.disponible ? "!border-mandarin/70" : ""}`}
                            />
                            <span className="text-[11px] text-sand/50">h</span>
                          </label>
                          {num(b.horas) > b.disponible && (
                            <span className="w-full text-right text-[10px] font-bold text-mandarin">supera lo restante</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {sim.bolsaCerrada > 0 && (
                      <p className="mt-2 text-[11px] text-sand/50">
                        + <strong className="tabular-nums text-sand/75">{h(sim.bolsaCerrada)}</strong>{" "}
                        consumidas este Q en bolsas ya cerradas (hoja &quot;Bolsa BBVA Cerrada&quot;) — cuentan como ingreso.
                      </p>
                    )}
                  </section>
                )}

                {/* ── Resultado ── */}
                <section className={`${GLASS} p-4`} aria-label="Resultado de la simulación">
                  <h2 className="mb-3 font-display text-lg font-bold text-sand">Resultado {q}</h2>
                  <div className="space-y-3">
                    <Bar
                      label="Rentabilidad vs objetivo"
                      v={r.objetivo > 0 ? Math.max(0, r.rent) / (r.objetivo * 2) : 0}
                      col={r.rent >= r.objetivo ? "lime" : "mandarin"}
                      fmt={`${pct(r.rent)} / ${pct(r.objetivo)}`}
                    />
                    <Bar
                      label="Horas equipo vs horas a ejecutar"
                      v={r.horasEquipo > 0 ? r.horasFacturables / r.horasEquipo : 0}
                      col={r.horasFacturables <= r.horasEquipo ? "serene" : "mandarin"}
                      fmt={`${h(r.horasFacturables)} / ${h(r.horasEquipo)}`}
                    />
                    {r.horasBolsa > 0 && (
                      <Bar
                        label="De bolsas y adelantos"
                        v={r.horasFacturables > 0 ? r.horasBolsa / r.horasFacturables : 0}
                        col="serene"
                        fmt={h(r.horasBolsa)}
                      />
                    )}
                    <Bar
                      label="Coste NFQ"
                      v={r.costes > 0 ? r.costeNFQ / r.costes : 0}
                      col="serene"
                      fmt={eur.format(r.costeNFQ)}
                    />
                    <Bar
                      label="Coste NTER"
                      v={r.costes > 0 ? r.costeNTER / r.costes : 0}
                      col="canary"
                      fmt={eur.format(r.costeNTER)}
                    />
                  </div>
                  <p className={`mt-4 rounded-lg border-l-4 px-3 py-2 text-[12.5px] ${
                    r.rent >= r.objetivo
                      ? "border-lime/70 bg-lime/[0.08] text-sand/85"
                      : "border-mandarin/70 bg-mandarin/[0.08] text-sand/85"
                  }`}>
                    {r.rent >= r.objetivo
                      ? `Por encima del objetivo: ${pct(r.rent)} de rentabilidad (${eur.format(r.margen)} de margen).`
                      : `Por debajo del objetivo (${pct(r.objetivo)}): faltan ${eur.format(Math.max(0, r.ingresos * r.objetivo - r.margen))} de margen.`}
                    {r.horasFacturables > r.horasEquipo &&
                      ` ⚠️ Ojo: hay ${h(r.horasFacturables - r.horasEquipo)} más de trabajo que de capacidad.`}
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
