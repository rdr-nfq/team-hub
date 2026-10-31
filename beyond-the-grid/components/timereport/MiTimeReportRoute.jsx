"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import IconoBBVA from "../iconosBBVA";
import { useTimeReport, useEquipo, EVIDENCIAS_KEY } from "./datos";
import { EQUIPO, equiposDe, equipoTRDe } from "@/lib/equipos";
import { mismoEmail } from "@/lib/email";
import {
  num, curQ, hoyISO, quincenasDeQ, quincenaDe, horasDe,
  filasTR, tsvTR, esFinde, SOPORTE_ID, NIVEL2_ANALISIS, etiquetaEvidencias,
} from "./model";

/* Mi Time Report · vista de MIEMBRO (todo el equipo), en forma de «recibo»:
   arriba el resumen de la quincena (horas por proyecto) junto a las acciones,
   y debajo la tabla día a día entera.
   - Imputación según el reparto de coordinación, con selector de trimestre y
     quincena (las que aún no tienen reparto lo dicen en su botón).
   - Copias al portapapeles: la imputación en el orden EXACTO de columnas del
     TR de BBVA (en la 2ª quincena, el mes entero) y el enlace del TR.
   - "Subir evidencias" abre la carpeta de Drive de ESA quincena (el backend la
     crea si no existe y renombra los ficheros al nombre canónico).
   Cada equipo tiene su propio Time Report: quien está en dos elige cuál ver
   (por defecto, el del enlace ?equipo=… del recordatorio, o su equipo
   principal: "equipoTR" en Gestión de equipo). */

const qsSelector = (extra) => {
  const año = new Date().getFullYear();
  const set = new Set(extra || []);
  [año - 1, año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) set.add(`${a}Q${i}`); });
  return [...set].sort();
};
const DIA_SEMANA = ["D", "L", "M", "X", "J", "V", "S"];
const diaSemana = (iso) => { const [a, m, d] = iso.split("-").map(Number); return DIA_SEMANA[new Date(a, m - 1, d).getDay()]; };

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";
const CHIP = `rounded-full border-[1.5px] px-3 py-[7px] text-[13px] font-bold leading-none transition-colors ${FOCO}`;
const CHIP_OFF = "border-sand/30 bg-midnight text-sand hover:border-sand";
const BOTON = `flex w-full items-center gap-2.5 rounded-[10px] border-[1.5px] px-4 py-[11px] text-left text-sm font-bold transition hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;

export default function MiTimeReportRoute() {
  const { email } = useAuth();
  const { getUrl, copyLink, showToast } = useLinks();
  const equipo = useEquipo();
  const [q, setQ] = useState(curQ());
  const yo = useMemo(() => {
    return (equipo || []).find((m) => mismoEmail(m.email, email)) || null;
  }, [equipo, email]);
  const misEquipos = useMemo(() => (yo ? equiposDe(yo) : ["rdr"]), [yo]);
  const [eqPedido] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("equipo") || ""; } catch { return ""; }
  });
  const [eqElegido, setEqElegido] = useState("");
  const principal = yo ? equipoTRDe(yo) : "rdr";
  const eqTR = [eqElegido, eqPedido].find((x) => x && misEquipos.includes(x)) || principal;
  const { snap, post, reload } = useTimeReport(q, eqTR);
  const [abriendo, setAbriendo] = useState(false);
  const qs = quincenasDeQ(q);
  const [quincena, setQuincena] = useState(() => Math.min(6, Math.max(1, quincenaDe(curQ(), hoyISO()) || 1)));

  // Confirmación en el propio botón tras copiar ("imp" | "link"), 2 s.
  const [copiado, setCopiado] = useState("");
  const reloj = useRef(0);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const confirmar = (tipo) => {
    setCopiado(tipo);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setCopiado(""), 2200);
  };

  const data = snap?.data;
  const hoy = hoyISO();

  const misFilas = useMemo(
    () => (data?.reparto || []).filter((r) => r.persona === yo?.nombre && r.quincena === quincena),
    [data, yo, quincena]
  );
  // Quincenas con reparto para mí (el snapshot trae el trimestre entero).
  const conReparto = useMemo(
    () => new Set((data?.reparto || []).filter((r) => r.persona === yo?.nombre && horasDe(r.dias) > 0).map((r) => r.quincena)),
    [data, yo]
  );
  const proyectosPorId = useMemo(
    () => Object.fromEntries((data?.proyectos || []).map((p) => [p.id, p])),
    [data]
  );
  const qn = qs.find((x) => x.n === quincena);
  const segundaQuincena = quincena % 2 === 0;
  const filasOrden = useMemo(
    () => [...misFilas].sort((a, b) => (a.proyectoId === SOPORTE_ID ? 1 : b.proyectoId === SOPORTE_ID ? -1 : 0)),
    [misFilas]
  );
  const totalQuincena = misFilas.reduce((a, r) => a + horasDe(r.dias), 0);
  const laborables = qn ? qn.dias.filter((d) => !esFinde(d)).length : 0;

  const copiarImputacion = async () => {
    if (!misFilas.length) return showToast("No hay imputación en esta quincena");
    const todas = (data?.reparto || []).filter((r) => r.persona === yo?.nombre);
    const filas = filasTR({ q, quincena, filas: todas, proyectosPorId });
    try {
      await navigator.clipboard.writeText(tsvTR(filas));
      const n = `${filas.length} fila${filas.length === 1 ? "" : "s"}`;
      showToast(segundaQuincena
        ? `Mes completo copiado (${n}, días 1-${qn.dias.length + 15}): pégalo en la MISMA celda que la 1ª quincena`
        : `Imputación copiada (${n}): pégala en el TR de BBVA`);
      confirmar("imp");
    } catch {
      showToast("No se pudo copiar al portapapeles");
    }
  };
  const copiarEnlace = async () => { if (await copyLink("timeReportBBVA")) confirmar("link"); };

  /* Carpeta de evidencias de la quincena: se abre la pestaña YA (si no, el
     navegador la bloquea) y se le pone la URL cuando responde el backend. */
  const subirEvidencias = async () => {
    const w = window.open("", "_blank");
    setAbriendo(true);
    try {
      const d = await post("carpetaEvidencias", { q, quincena, raiz: getUrl(EVIDENCIAS_KEY[eqTR]) });
      if (w) w.location = d.url;
      else window.open(d.url, "_blank");
      showToast(`Carpeta ${d.nombre} abierta: sube tu evidencia (se renombra sola)`);
    } catch (e) {
      if (w) w.close();
      showToast("No se pudo abrir la carpeta: " + String(e.message || e));
    } finally {
      setAbriendo(false);
    }
  };
  const evid = etiquetaEvidencias(q, quincena);

  const filaVista = (r) => {
    if (r.proyectoId === SOPORTE_ID)
      return { titulo: "Soporte usuarios", sub: "Sin código · Análisis y diseño" };
    const p = proyectosPorId[r.proyectoId] || {};
    const n2 = (p.estados || {})[quincena] || NIVEL2_ANALISIS;
    return {
      titulo: p.nombre || r.proyectoId,
      sub: `${p.sdatool || ""} · ${p.feature || "sin feature"} · ${n2 === NIVEL2_ANALISIS ? "Análisis y diseño" : n2}`,
    };
  };
  const maxProyecto = Math.max(1, ...misFilas.map((r) => horasDe(r.dias)));
  const totalDia = (d) => misFilas.reduce((a, r) => a + num(r.dias[d]), 0);
  const celda = (d) => `${esFinde(d) ? "bg-sand/[0.06] text-sand/60" : ""} ${d === hoy ? "bg-serene/[0.12]" : ""}`;

  let cuerpo;
  if (!snap || equipo == null) {
    cuerpo = (
      <div aria-hidden className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"><span className="rdr-skel h-48 rounded-xl" /><span className="rdr-skel h-48 rounded-xl" /></div>
        <span className="rdr-skel block h-56 rounded-xl" />
      </div>
    );
  } else if (snap.error && !data) {
    cuerpo = (
      <div role="alert" className="tr-resumen hub-eq flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4 text-sand">
        <span><b>No se pudo cargar tu Time Report.</b> El servidor de Google no respondió ({snap.error}).</span>
        <button type="button" onClick={reload} className={`${CHIP} ${CHIP_OFF}`}>Reintentar</button>
      </div>
    );
  } else if (!yo) {
    cuerpo = <p className="rounded-xl border-[1.5px] border-dashed border-sand/30 p-8 text-center text-sand/80">Tu email ({email}) no está en el equipo: pide a coordinación que te dé de alta.</p>;
  } else if (!misFilas.length) {
    cuerpo = (
      <div className="rounded-xl border-[1.5px] border-dashed border-sand/30 p-8 text-center text-sand/80">
        <b className="mb-1 block text-base text-sand">{qn?.label}: coordinación aún no ha repartido esta quincena</b>
        Cuando lo haga, verás aquí tus proyectos y horas, listos para copiar al TR de BBVA.
      </div>
    );
  } else {
    const denso = filasOrden.length > 4;
    cuerpo = (
      <>
        <section aria-label="Resumen de la quincena" className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="tr-resumen hub-eq flex flex-col gap-3.5 rounded-xl px-[22px] py-5 text-sand">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-bold">
                {yo.nombre} · {qn?.label} · {filasOrden.length} proyecto{filasOrden.length === 1 ? "" : "s"}
              </h2>
              <p className="text-[15px]"><strong className="font-display text-[26px]">{totalQuincena} h</strong> en {laborables} días laborables</p>
            </div>
            <ul className={denso ? "grid gap-x-7 gap-y-3 md:grid-cols-2" : "flex flex-col gap-3.5"}>
              {filasOrden.map((r, i) => {
                const v = filaVista(r);
                const h = horasDe(r.dias);
                return (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <b className={`block ${denso ? "text-sm" : "text-[15px]"}`}>{v.titulo}</b>
                      <small className={`mt-0.5 block text-sand/80 ${denso ? "text-xs" : "text-[13px]"}`}>{v.sub}</small>
                    </div>
                    <span className="font-bold tabular-nums">{h} h</span>
                    <div aria-hidden className={`tr-barra col-span-2 overflow-hidden rounded-full ${denso ? "h-1.5" : "h-2"}`}>
                      <i className="block h-full rounded-full" style={{ width: `${Math.round((h / maxProyecto) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={copiarImputacion} className={`${BOTON} hub-placa hub-eq border-transparent`}>
              <IconoBBVA nombre={copiado === "imp" ? "checkmark" : "copy"} size={18} />
              {copiado === "imp" ? "Imputación copiada: pégala en el TR" : segundaQuincena ? "Copiar mi imputación del mes" : "Copiar mi imputación"}
            </button>
            <p className="mx-0.5 mb-1 text-[13px] leading-snug text-serene">
              {segundaQuincena
                ? <>2ª quincena: se copia el <b className="text-sand">mes entero</b> (días 1-{qn.dias.length + 15}) para pegarlo en la misma celda que la 1ª sin borrar nada.</>
                : "Se copia en el orden de columnas del TR de BBVA, para pegarlo tal cual."}
            </p>
            <button type="button" onClick={copiarEnlace} className={`${BOTON} border-sand/30 bg-midnight text-sand`}>
              <IconoBBVA nombre={copiado === "link" ? "checkmark" : "copy"} size={18} />
              {copiado === "link" ? "Enlace copiado" : "Copiar enlace del TR de BBVA"}
            </button>
            <button type="button" onClick={subirEvidencias} disabled={!data || abriendo} className={`${BOTON} hub-placa hub-fo border-transparent`}>
              <IconoBBVA nombre="cloud" size={18} />
              {abriendo ? "Abriendo carpeta…" : "Subir evidencias (Drive)"}
            </button>
            {evid && eqTR !== principal ? (
              <p className="mx-0.5 text-[13px] leading-snug text-serene">
                Tu evidencia va en la carpeta de tu equipo principal, <b className="text-sand">{EQUIPO[principal]?.nombre}</b>: cámbialo arriba para subirla.
              </p>
            ) : evid ? (
              <p className="mx-0.5 text-[13px] leading-snug text-serene">
                Carpeta <b className="text-sand">{evid.ruta}</b>; tu fichero quedará como{" "}
                <b className="tabular-nums text-sand">{evid.fichero(yo.nombre)}</b> (se renombra solo al subirlo).
              </p>
            ) : null}
          </div>
        </section>

        <section aria-label="Horas por día" className="overflow-x-auto rounded-xl border border-sand/15 bg-white/[0.03] px-3.5 pb-1 pt-2">
          <table className="w-full min-w-[860px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-xs text-serene">
                <th scope="col" className="w-[280px] px-1 py-2 text-left font-bold">Proyecto</th>
                <th scope="col" className="w-14 px-1 py-2 text-right font-bold">Total</th>
                {qn.dias.map((d) => (
                  <th key={d} scope="col" className={`px-1 py-2 text-center font-bold ${celda(d)} ${d === hoy ? "text-sand shadow-[inset_0_-3px_0_currentColor]" : ""}`}>
                    <span className="block font-normal">{diaSemana(d)}</span>{Number(d.slice(8))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasOrden.map((r, i) => {
                const v = filaVista(r);
                return (
                  <tr key={i} className="border-t border-sand/10">
                    <td className="px-1 py-2.5">
                      <span className="block font-bold text-sand">{v.titulo}</span>
                      <span className="block text-xs text-serene">{v.sub}</span>
                    </td>
                    <td className="px-1 py-2.5 text-right font-bold text-sand">{horasDe(r.dias)}</td>
                    {qn.dias.map((d) => (
                      <td key={d} className={`px-1 py-2.5 text-center ${celda(d)} ${num(r.dias[d]) > 0 ? "font-bold text-sand" : ""}`}>
                        {num(r.dias[d]) > 0 ? num(r.dias[d]) : ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-[1.5px] border-sand/25 font-bold text-sand">
                <td className="px-1 py-2.5">Total del día</td>
                <td className="px-1 py-2.5 text-right">{totalQuincena}</td>
                {qn.dias.map((d) => <td key={d} className={`px-1 py-2.5 text-center ${celda(d)}`}>{totalDia(d) || ""}</td>)}
              </tr>
            </tfoot>
          </table>
        </section>
      </>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-5 px-4 pb-10 pt-cabecera sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-eq grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="clock" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Mi Time Report</h1>
        </div>
        {/* Quien está en varios equipos: un Time Report por equipo */}
        {misEquipos.length > 1 && (
          <div role="tablist" aria-label="Equipo del Time Report" className="flex flex-wrap gap-1.5">
            {misEquipos.map((id) => (
              <button
                key={id} type="button" role="tab" aria-selected={eqTR === id} onClick={() => setEqElegido(id)}
                className={`${CHIP} ${eqTR === id ? "hub-etiqueta hub-pr border-transparent" : CHIP_OFF}`}
              >
                {EQUIPO[id]?.nombre || id}
              </button>
            ))}
          </div>
        )}
      </header>

      {snap?.error && data && (
        <p role="status" className="inline-flex items-center gap-2 self-start rounded-lg border border-sand/30 px-3 py-1.5 text-xs font-bold text-sand">{snap.error}</p>
      )}

      {/* Trimestre y quincena (las que aún no tienen reparto lo dicen) */}
      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="tr-trimestre" className="text-[13px] font-bold text-sand">Trimestre</label>
        <span className="relative inline-flex">
          <select
            id="tr-trimestre" value={q} onChange={(e) => setQ(e.target.value)}
            className={`${CHIP} ${CHIP_OFF} cursor-pointer appearance-none pr-8`}
          >
            {qsSelector(data?.qs).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180 text-sand" />
        </span>
        <div role="tablist" aria-label="Quincena" className="flex flex-wrap gap-1.5">
          {qs.map((x) => {
            const sinReparto = data && yo && !conReparto.has(x.n);
            return (
              <button
                key={x.n} type="button" role="tab" aria-selected={quincena === x.n} onClick={() => setQuincena(x.n)}
                className={`${CHIP} ${quincena === x.n ? "hub-etiqueta hub-eq border-transparent" : CHIP_OFF}`}
              >
                {x.label}{sinReparto && <span className="font-normal opacity-75"> · sin repartir</span>}
              </button>
            );
          })}
        </div>
      </div>

      {cuerpo}
    </main>
  );
}
