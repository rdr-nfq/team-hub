"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { GLASS, FIELD, TEXT, EmptyCard, PanelSkeleton } from "../coordinacion/ui";
import { IconClock, IconAlert, IconExternal } from "../coordinacion/icons";
import { useTimeReport, useEquipo } from "./datos";
import { mismoEmail } from "@/lib/email";
import {
  num, curQ, hoyISO, quincenasDeQ, quincenaDe, horasDe,
  filasTR, tsvTR, esFinde, SOPORTE_ID, NIVEL2_ANALISIS, etiquetaEvidencias, nombreFichero,
} from "./model";

/* Mi Time Report · vista de MIEMBRO (todo el equipo).
   Enseña tu imputación de la quincena (proyectos y horas por día, según el
   reparto de coordinación), con selector de quincena y de trimestre, y dos
   copias al portapapeles: el enlace del TR de BBVA y la imputación en el
   orden EXACTO de columnas del TR (para pegarla tal cual). Además, el botón
   "Subir evidencias" abre la carpeta de Drive de ESA quincena (el backend la
   crea si no existe y renombra los ficheros al nombre canónico). */

const ACCENT = PALETTE.mandarin;

const qsSelector = (extra) => {
  const año = new Date().getFullYear();
  const set = new Set(extra || []);
  [año - 1, año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) set.add(`${a}Q${i}`); });
  return [...set].sort();
};

export default function MiTimeReportRoute() {
  const { email } = useAuth();
  const { getUrl, copyLink, showToast } = useLinks();
  const equipo = useEquipo();
  const [q, setQ] = useState(curQ());
  const { snap, post } = useTimeReport(q);
  const [abriendo, setAbriendo] = useState(false);
  const qs = quincenasDeQ(q);
  const [quincena, setQuincena] = useState(() => Math.min(6, Math.max(1, quincenaDe(curQ(), hoyISO()) || 1)));

  const data = snap?.data;
  const yo = useMemo(() => {
    return (equipo || []).find((m) => mismoEmail(m.email, email)) || null;
  }, [equipo, email]);

  const misFilas = useMemo(
    () => (data?.reparto || []).filter((r) => r.persona === yo?.nombre && r.quincena === quincena),
    [data, yo, quincena]
  );
  const proyectosPorId = useMemo(
    () => Object.fromEntries((data?.proyectos || []).map((p) => [p.id, p])),
    [data]
  );
  const qn = qs.find((x) => x.n === quincena);
  const totalQuincena = misFilas.reduce((a, r) => a + horasDe(r.dias), 0);

  const copiarImputacion = async () => {
    const filas = filasTR({ q, quincena, filas: misFilas, proyectosPorId });
    if (!filas.length) return showToast("No hay imputación en esta quincena");
    try {
      await navigator.clipboard.writeText(tsvTR(filas));
      showToast(`Imputación copiada (${filas.length} fila${filas.length === 1 ? "" : "s"}): pégala en el TR de BBVA`);
    } catch {
      showToast("No se pudo copiar al portapapeles");
    }
  };

  /* Carpeta de evidencias de la quincena: se abre la pestaña YA (si no, el
     navegador la bloquea) y se le pone la URL cuando responde el backend. */
  const subirEvidencias = async () => {
    const w = window.open("", "_blank");
    setAbriendo(true);
    try {
      const d = await post("carpetaEvidencias", { q, quincena, raiz: getUrl("evidenciasDrive") });
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

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: ACCENT }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-mandarin/80">Equipo</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconClock size={34} className="text-mandarin" /> Mi Time Report
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Tu imputación de la quincena según el reparto de coordinación: proyectos, horas por día y copia
            directa en el orden de columnas del TR de BBVA.
          </p>
          {snap?.error && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> {snap.error}
            </p>
          )}
        </header>

        {/* Acciones: enlace TR + copiar imputación */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={() => copyLink("timeReportBBVA")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2 text-xs font-bold text-sand/85 transition hover:border-white/30 hover:bg-white/10"
          >
            <IconExternal size={13} /> Copiar enlace del TR de BBVA
          </button>
          <button
            type="button" onClick={copiarImputacion} disabled={!misFilas.length}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFB56B] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Copiar mi imputación (pegar en el TR)
          </button>
          <button
            type="button" onClick={subirEvidencias} disabled={!snap?.data || abriendo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#85C8FF] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconExternal size={13} /> {abriendo ? "Abriendo carpeta…" : "Subir evidencias (Drive)"}
          </button>
        </div>
        {evid && yo && (
          <p className="-mt-3 mb-5 text-[11px] text-sand/50">
            Carpeta de la quincena: <span className="font-bold text-sand/75">{evid.carpeta}</span> · tu fichero quedará como{" "}
            <span className="font-bold tabular-nums text-sand/75">{evid.carpeta}_{nombreFichero(yo.nombre)}.pdf</span> (se renombra solo al subirlo).
          </p>
        )}

        {/* Selectores de Q y quincena */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sand/60">
            Trimestre
            <select value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} !py-2 font-bold`}>
              {qsSelector(data?.qs).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <div role="tablist" aria-label="Quincena" className="inline-flex flex-wrap gap-1 rounded-full border border-white/12 bg-white/[0.055] p-1">
            {qs.map((x) => (
              <button
                key={x.n} role="tab" aria-selected={quincena === x.n} onClick={() => setQuincena(x.n)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                  quincena === x.n ? "bg-[#FFB56B] text-[#001391]" : "text-sand/70 hover:text-sand"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>

        {!snap || equipo == null ? (
          <PanelSkeleton />
        ) : !yo ? (
          <EmptyCard>Tu email ({email}) no está en equipo.json: pide a coordinación que te dé de alta.</EmptyCard>
        ) : misFilas.length === 0 ? (
          <EmptyCard>Sin imputación asignada en {qn?.label} de {q} (coordinación aún no ha repartido esta quincena).</EmptyCard>
        ) : (
          <div className={`${GLASS} overflow-x-auto p-3`}>
            <p className="mb-2 px-1 text-[12px] text-sand/70">
              <strong className="text-sand">{yo.nombre}</strong> · {qn?.label} ·{" "}
              <strong className={`tabular-nums ${TEXT.lime}`}>{totalQuincena} h</strong> en total
            </p>
            <table className="w-full min-w-[820px] border-collapse text-[12px]">
              <thead>
                <tr className="text-left text-[9.5px] uppercase tracking-wide text-sand/50">
                  <th className="p-1.5">Proyecto</th>
                  <th className="p-1.5 text-right">Total</th>
                  {qn.dias.map((d) => (
                    <th key={d} className={`p-1.5 text-center ${esFinde(d) ? "text-sand/25" : ""} ${d === hoyISO() ? "text-serene" : ""}`}>
                      {Number(d.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...misFilas]
                  .sort((a, b) => (a.proyectoId === SOPORTE_ID ? 1 : b.proyectoId === SOPORTE_ID ? -1 : 0))
                  .map((r, i) => {
                    const v = filaVista(r);
                    return (
                      <tr key={i} className="border-t border-white/[0.07]">
                        <td className="p-1.5">
                          <span className="block font-bold text-sand">{v.titulo}</span>
                          <span className="block text-[10px] text-sand/50">{v.sub}</span>
                        </td>
                        <td className="p-1.5 text-right font-bold tabular-nums text-sand/85">{horasDe(r.dias)}</td>
                        {qn.dias.map((d) => (
                          <td key={d} className={`p-1.5 text-center tabular-nums ${num(r.dias[d]) > 0 ? "font-bold text-sand" : "text-sand/20"}`}>
                            {num(r.dias[d]) > 0 ? num(r.dias[d]) : ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
