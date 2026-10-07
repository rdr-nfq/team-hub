"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useTheme } from "@/lib/theme";
import { GLASS, FIELD, TEXT, Kpi, Chip, EmptyCard } from "../coordinacion/ui";
import { IconAlert, IconPlus, IconX, IconReload } from "../coordinacion/icons";
import { normalizarColores, dateKey, motivoDe, formatRango } from "./constants";
import EquipoPanel from "./EquipoPanel";
import Calendario, { MARCA_COLOR } from "./Calendario";
import DaySheet from "./DaySheet";
import AhoraPanel from "./AhoraPanel";
import { VacacionesSkeleton, ErrorCard } from "./VacacionesRoute";
import { EstadoSolBadge } from "./SolicitudPanel";
import { useVacaciones, useV2Configurado, fechaCortaEs, festivosDeGrupo, laborables, CLAVE_V2, CLASE_SOL } from "./datos";

const rangoTxt = (a, b) => `${fechaCortaEs(a)}${b !== a ? ` → ${fechaCortaEs(b)}` : ""}`;

/** Días que una solicitud marca en el calendario: los nuevos (solicitud/cambio)
 *  o los que se liberarían (cancelación). */
function diasSolicitud(s, d) {
  if (s.clase === "CANCELACION") {
    return Object.keys(d.ausenciasPorDia).filter((iso) => iso >= s.desde && iso <= s.hasta &&
      (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona && a.motivo === s.tipo)).sort();
  }
  const grupo = (d.saldos || []).find((x) => x.nombre === s.persona)?.grupo || d.empleadosMap[s.persona]?.grupo;
  return laborables(s.desde, s.hasta, festivosDeGrupo(d.festivosTodos, grupo));
}

/* /vacaciones-gestion (COORDINACIÓN, backend v2):
   1 Resumen   · quién está fuera hoy y los próximos días + solicitudes pendientes
   2 Calendario· calendario con filtros; al elegir una solicitud se marcan sus
                 días y se aprueba o rechaza ahí mismo
   3 Personas  · días que le quedan a cada uno (de más a menos)
   4 Festivos  · grupos de festivos (Madrid, Jaén, México DC…) y sus días */

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "calendario", label: "Calendario" },
  { id: "personas", label: "Personas" },
  { id: "festivos", label: "Festivos" },
];

const BTN = "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";

function TipoChip({ tipo }) {
  const m = motivoDe(tipo);
  return <span className="rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: m.bg, color: m.text }} title={m.texto}>{tipo}</span>;
}

function SolicitudItem({ s, activa, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-2.5 text-left text-[12.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${activa ? "border-purple/70 bg-purple/15" : "border-white/10 bg-midnight/30 hover:border-white/25"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <TipoChip tipo={s.tipo} />
        <span className="font-bold text-sand">{s.persona}</span>
        <span className="ml-auto text-sand/50">{s.dias} d</span>
      </div>
      {CLASE_SOL[s.clase]?.corto && <p className="mt-0.5 text-[11px] font-bold text-canary">{CLASE_SOL[s.clase].corto}</p>}
      <p className="mt-0.5 text-sand/65">
        {s.clase === "MODIFICACION" && <span className="text-sand/45 line-through">{formatRango(s.origDesde, s.origHasta)}</span>}
        {s.clase === "MODIFICACION" && " → "}
        {s.clase === "CANCELACION" ? "liberar " : ""}{formatRango(s.desde, s.hasta)}
      </p>
      {s.comentario && <p className="mt-0.5 truncate text-sand/45">💬 {s.comentario}</p>}
    </button>
  );
}

/* Detalle de la solicitud seleccionada: saldo, coincidencias y decisión. */
function DetalleSolicitud({ s, d, post, onResuelta }) {
  const [motivo, setMotivo] = useState("");
  const [forzar, setForzar] = useState(false);
  const [estado, setEstado] = useState({ fase: "idle" });
  useEffect(() => { setMotivo(""); setForzar(false); setEstado({ fase: "idle" }); }, [s.id]);

  const saldo = (d.saldos || []).find((x) => x.nombre === s.persona);
  const grupo = saldo?.grupo || d.empleadosMap[s.persona]?.grupo;
  const cancela = s.clase === "CANCELACION";
  const dias = diasSolicitud(s, d);
  // En un cambio, sus días originales no cuentan como "ya registrados".
  const originales = s.clase === "MODIFICACION"
    ? Object.keys(d.ausenciasPorDia).filter((iso) => iso >= s.origDesde && iso <= s.origHasta && (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona && a.motivo === s.tipoOrig))
    : [];
  // Quién más falta esos días (aprobado).
  const coinciden = {};
  dias.forEach((iso) => (d.ausenciasPorDia[iso] || []).forEach((a) => {
    if (a.nombre !== s.persona) (coinciden[a.nombre] = coinciden[a.nombre] || []).push(iso);
  }));
  const propios = cancela ? [] : dias.filter((iso) => !originales.includes(iso) && (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona));
  const otrosPend = (d.pendientes || []).filter((x) => x.id !== s.id && x.persona !== s.persona && !(x.hasta < s.desde || x.desde > s.hasta));

  const decidir = async (decision) => {
    if (decision === "rechazar" && !motivo.trim() && !confirm("¿Rechazar sin indicar motivo?")) return;
    setEstado({ fase: "enviando", decision });
    try {
      const r = await post("resolver", { id: s.id, decision, motivo: motivo.trim(), forzar });
      setEstado({ fase: "ok", r });
      onResuelta(r);
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  return (
    <section className={`${GLASS} space-y-3 p-4`} style={{ borderColor: "rgba(150,148,255,0.55)" }} aria-label="Solicitud seleccionada">
      <div className="flex flex-wrap items-center gap-2">
        <TipoChip tipo={s.tipo} />
        <h3 className="font-display text-lg font-bold text-sand">{s.persona}</h3>
        <EstadoSolBadge estado={s.estado} />
      </div>
      {s.clase !== "NUEVA" && <p className="text-[12px] font-bold uppercase tracking-wide text-canary">{CLASE_SOL[s.clase].corto}</p>}
      {cancela ? (
        <p className="text-[13px] text-sand/75">
          Quiere <b className="text-sand">cancelar</b> {rangoTxt(s.desde, s.hasta)}: se liberan <b className="text-sand">{dias.length}</b> días de {motivoDe(s.tipo).texto.toLowerCase()}.
        </p>
      ) : s.clase === "MODIFICACION" ? (
        <div className="text-[13px] text-sand/75">
          <p>Antes: <TipoChip tipo={s.tipoOrig} /> {rangoTxt(s.origDesde, s.origHasta)} · {originales.length || s.diasOrig} días</p>
          <p className="mt-0.5">Ahora: <TipoChip tipo={s.tipo} /> {rangoTxt(s.desde, s.hasta)} · <b className="text-sand">{dias.length}</b> días laborables{grupo ? ` (festivos de ${grupo})` : ""}</p>
        </div>
      ) : (
        <p className="text-[13px] text-sand/75">
          {rangoTxt(s.desde, s.hasta)} · <b className="text-sand">{dias.length}</b> días laborables{grupo ? ` (festivos de ${grupo})` : ""}
        </p>
      )}
      {s.comentario && <p className="text-[13px] text-sand/70">💬 {s.comentario}</p>}
      {saldo && s.deltaVA !== 0 && (() => {
        const otras = (saldo.pendientesVA || 0) - (s.deltaVA || 0); // efecto del resto de pendientes
        const tras = saldo.quedan - (s.deltaVA || 0);
        return (
          <p className="text-[13px] text-sand/75">
            Le quedan <b className="text-sand">{saldo.quedan}</b> días → tras esta: <b className={tras < 0 ? "text-mandarin" : TEXT.lime}>{tras}</b>
            {otras !== 0 && <> · con sus otras pendientes: <b className={tras - otras < 0 ? "text-mandarin" : "text-sand"}>{tras - otras}</b></>}
          </p>
        );
      })()}
      {propios.length > 0 && (
        <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
          Ya tiene días registrados: {propios.map(fechaCortaEs).join(", ")}
        </p>
      )}
      <div className="text-[12.5px] text-sand/70">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">{cancela ? "Esos días faltan además" : "Esos días también faltan"}</p>
        {Object.keys(coinciden).length ? (
          <ul className="space-y-0.5">
            {Object.entries(coinciden).map(([n, ds]) => <li key={n}><b className="text-sand">{n}</b> · {ds.length} {ds.length === 1 ? "día" : "días"}</li>)}
          </ul>
        ) : <p className="text-sand/50">Nadie más.</p>}
        {otrosPend.length > 0 && <p className="mt-1 text-canary">Otras solicitudes pendientes que coinciden: {otrosPend.map((x) => x.persona).join(", ")}</p>}
      </div>
      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Motivo / comentario (va en el correo)</span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={`${FIELD} block w-full resize-y`} />
      </label>
      {(propios.length > 0 || /SOLAPAMIENTO/.test(estado.error || "")) && (
        <label className="flex items-center gap-2 text-[12px] text-sand/75">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="h-4 w-4 accent-[#FFB56B]" />
          Aprobar igualmente (sobrescribe los días ya registrados)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={estado.fase === "enviando"} onClick={() => decidir("aprobar")} className={`${BTN} text-[#001391]`} style={{ background: PALETTE.lime }}>
          {estado.fase === "enviando" && estado.decision === "aprobar" ? "Aprobando…" : "✓ Aprobar"}
        </button>
        <button type="button" disabled={estado.fase === "enviando"} onClick={() => decidir("rechazar")} className={`${BTN} border border-white/20 bg-white/10 text-sand hover:bg-white/15`}>
          {estado.fase === "enviando" && estado.decision === "rechazar" ? "Rechazando…" : "Rechazar"}
        </button>
      </div>
      {estado.fase === "error" && <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{estado.error}</p>}
    </section>
  );
}

/* ── Pestaña Personas ── */
function Personas({ d, post, onCambio }) {
  const [guardando, setGuardando] = useState("");
  const [error, setError] = useState("");
  const filas = [...(d.saldos || [])].sort((a, b) => (a.activo !== b.activo ? (a.activo ? -1 : 1) : b.quedan - a.quedan || a.nombre.localeCompare(b.nombre)));
  const cambiarGrupo = async (persona, grupo) => {
    setGuardando(persona); setError("");
    try { await post("asignarGrupo", { anio: d.year, persona, grupo }); onCambio(); } catch (e) { setError(String(e.message || e)); }
    setGuardando("");
  };
  const siguiente = Math.max(...(d.anios || [d.year])) + 1;
  const crearAnio = async () => {
    if (!confirm(`¿Crear el año ${siguiente}? Se crean Vacas_${siguiente} (personas activas con su grupo y sus días del año; lo que les quede pasa a «Días año anterior»), Festivos_${siguiente} con los mismos grupos (sin festivos: añádelos en la pestaña Festivos) y Solicitudes_${siguiente}.`)) return;
    setError("");
    try { await post("crearAnio", { anio: siguiente }); onCambio(); } catch (e) { setError(String(e.message || e)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-sand/60">Solo descuenta VA. «Quedarían» descuenta además lo pendiente de aprobar. Los días se editan en el Excel (pestaña Vacas_{d.year}).</p>
        <button type="button" onClick={crearAnio} className={`${BTN} border border-white/15 bg-white/[0.055] text-sand/85 hover:border-white/30`}><IconPlus size={13} /> Crear Vacas_{siguiente}</button>
      </div>
      {error && <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{error}</p>}
      <div className={`${GLASS} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-wide text-sand/50">
              <th className="px-3 py-2.5">Persona</th><th className="px-2 py-2.5">Grupo festivos</th>
              <th className="px-2 py-2.5 text-right">Año ant.</th><th className="px-2 py-2.5 text-right">Del año</th><th className="px-2 py-2.5 text-right">Total</th>
              <th className="px-2 py-2.5 text-right">VA</th><th className="px-2 py-2.5 text-right">Quedan</th><th className="px-2 py-2.5 text-right">Pend.</th><th className="px-3 py-2.5 text-right">Quedarían</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.nombre} className={`border-b border-white/[0.06] ${p.activo ? "" : "opacity-45"}`}>
                <td className="px-3 py-2 font-bold text-sand">{p.nombre}{!p.email && <span className="ml-1.5 text-[10px] font-bold text-canary" title="Sin email en el Excel: no podrá pedir días desde la web">sin email</span>}</td>
                <td className="px-2 py-1.5">
                  <select value={p.grupo} disabled={guardando === p.nombre} onChange={(e) => cambiarGrupo(p.nombre, e.target.value)} className={`${FIELD} !py-1 text-xs`}>
                    <option value="">—</option>
                    {d.grupos.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
                  </select>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-sand/75">{p.anteriores}</td>
                <td className="px-2 py-2 text-right tabular-nums text-sand/75">{p.dias}</td>
                <td className="px-2 py-2 text-right tabular-nums text-sand/75">{p.total}</td>
                <td className="px-2 py-2 text-right tabular-nums text-sand/75">{p.va}</td>
                <td className={`px-2 py-2 text-right font-bold tabular-nums ${p.quedan < 0 ? "text-mandarin" : "text-sand"}`}>{p.quedan}</td>
                <td className="px-2 py-2 text-right tabular-nums text-canary">{p.pendientesVA || ""}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${p.quedanTrasPendientes < 0 ? "text-mandarin" : "text-sand/75"}`}>{p.pendientesVA ? p.quedanTrasPendientes : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Pestaña Festivos ── */
function Festivos({ d, post, onCambio }) {
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState({ grupo: "", pais: "ES" });
  const [renombrar, setRenombrar] = useState({});
  const [nf, setNf] = useState({ fecha: "", nombre: "", grupos: [] });
  const [filtroGrupo, setFiltroGrupo] = useState("");

  const hacer = async (action, body, ok) => {
    setOcupado(true); setError("");
    try { const r = await post(action, body); ok?.(r); onCambio(); } catch (e) { setError(String(e.message || e)); }
    setOcupado(false);
  };

  const anio = String(d.year);
  const porFecha = {};
  (d.festivosTodos || []).filter((f) => f.fecha.slice(0, 4) === anio && (!filtroGrupo || f.grupo === filtroGrupo)).forEach((f) => {
    (porFecha[f.fecha] = porFecha[f.fecha] || { fecha: f.fecha, nombre: f.nombre, grupos: [] }).grupos.push(f.grupo);
  });
  const lista = Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const usos = {};
  (d.saldos || []).forEach((p) => { if (p.grupo) usos[p.grupo] = (usos[p.grupo] || 0) + 1; });
  const nFest = {};
  (d.festivosTodos || []).forEach((f) => { if (f.fecha.slice(0, 4) === anio) nFest[f.grupo] = (nFest[f.grupo] || 0) + 1; });

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className={`${GLASS} space-y-3 p-4`} aria-label="Grupos de festivos">
        <h3 className="font-display text-base font-bold text-sand">Grupos de festivos</h3>
        <p className="text-[12px] text-sand/55">Cada persona tiene un grupo (pestaña Personas). Un festivo nacional se añade a todos los grupos de España a la vez.</p>
        <ul className="space-y-2">
          {d.grupos.map((g) => (
            <li key={g.grupo} className="rounded-xl border border-white/10 bg-midnight/30 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={renombrar[g.grupo] ?? g.grupo}
                  onChange={(e) => setRenombrar({ ...renombrar, [g.grupo]: e.target.value })}
                  className={`${FIELD} min-w-0 flex-1 !py-1 text-[13px] font-bold`}
                />
                <select value={g.pais} disabled={ocupado} onChange={(e) => hacer("guardarGrupo", { anio: d.year, grupo: g.grupo, pais: e.target.value })} className={`${FIELD} !py-1 text-xs`}>
                  <option value="ES">ES</option><option value="MX">MX</option>
                </select>
                <button type="button" title="Borrar grupo" disabled={ocupado} onClick={() => confirm(`¿Borrar el grupo ${g.grupo} y sus festivos?`) && hacer("borrarGrupo", { anio: d.year, grupo: g.grupo })} className="rounded-lg border border-white/10 p-1.5 text-sand/45 hover:border-mandarin/60 hover:text-mandarin"><IconX size={13} /></button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-sand/50">
                {usos[g.grupo] || 0} personas · {nFest[g.grupo] || 0} festivos en {anio}
                {(renombrar[g.grupo] ?? g.grupo).trim() !== g.grupo && (
                  <button type="button" disabled={ocupado} onClick={() => hacer("guardarGrupo", { anio: d.year, grupo: renombrar[g.grupo].trim(), pais: g.pais, anterior: g.grupo }, () => setRenombrar({}))} className="ml-auto font-bold text-serene hover:underline">Renombrar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2 border-t border-white/10 pt-3">
          <label className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Nuevo grupo</span>
            <input value={nuevoGrupo.grupo} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, grupo: e.target.value })} placeholder="Sevilla" className={`${FIELD} w-full`} />
          </label>
          <select value={nuevoGrupo.pais} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, pais: e.target.value })} className={FIELD}><option value="ES">ES</option><option value="MX">MX</option></select>
          <button type="button" disabled={ocupado || !nuevoGrupo.grupo.trim()} onClick={() => hacer("guardarGrupo", { anio: d.year, grupo: nuevoGrupo.grupo.trim(), pais: nuevoGrupo.pais }, () => setNuevoGrupo({ grupo: "", pais: "ES" }))} className={`${BTN} text-[#001391]`} style={{ background: PALETTE.serene }}><IconPlus size={13} /></button>
        </div>
      </section>

      <section className="space-y-3" aria-label="Festivos">
        <div className={`${GLASS} space-y-3 p-4`}>
          <h3 className="font-display text-base font-bold text-sand">Añadir festivo</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label><span className="block text-[10px] font-bold uppercase tracking-wide text-sand/50">Fecha</span>
              <input type="date" value={nf.fecha} onChange={(e) => setNf({ ...nf, fecha: e.target.value })} className={FIELD} /></label>
            <label className="min-w-[180px] flex-1"><span className="block text-[10px] font-bold uppercase tracking-wide text-sand/50">Nombre</span>
              <input value={nf.nombre} onChange={(e) => setNf({ ...nf, nombre: e.target.value })} placeholder="San Isidro" className={`${FIELD} w-full`} /></label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.grupos.map((g) => {
              const on = nf.grupos.includes(g.grupo);
              return (
                <Chip key={g.grupo} on={on} accent="lime" className="!px-3 !py-1.5 normal-case" onClick={() => setNf({ ...nf, grupos: on ? nf.grupos.filter((x) => x !== g.grupo) : [...nf.grupos, g.grupo] })}>
                  {g.grupo}
                </Chip>
              );
            })}
            <button type="button" onClick={() => setNf({ ...nf, grupos: d.grupos.filter((g) => g.pais === "ES").map((g) => g.grupo) })} className="px-2 text-[11px] font-bold text-sand/55 hover:text-serene">Todos los de España</button>
          </div>
          <button type="button" disabled={ocupado || !nf.fecha || !nf.grupos.length} onClick={() => hacer("guardarFestivo", { fecha: nf.fecha, nombre: nf.nombre.trim() || "Festivo", grupos: nf.grupos }, (r) => { setNf({ fecha: "", nombre: "", grupos: nf.grupos }); if (r.ocupados?.length) setError(`Festivo guardado. Ojo: ese día ya tenían otro código y no se ha pisado: ${r.ocupados.join(", ")}`); })} className={`${BTN} text-[#001391]`} style={{ background: PALETTE.lime }}>
            <IconPlus size={13} /> Añadir festivo
          </button>
          <p className="text-[11.5px] text-sand/50">Se marca como FE en el Excel a quien sea de esos grupos (si el día está libre).</p>
        </div>

        {error && <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{error}</p>}

        <div className={`${GLASS} p-4`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-sand">Festivos {anio}</h3>
            <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className={`${FIELD} ml-auto !py-1 text-xs`}>
              <option value="">Todos los grupos</option>
              {d.grupos.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
            </select>
          </div>
          {!lista.length ? <EmptyCard>No hay festivos en {anio}.</EmptyCard> : (
            <ul className="divide-y divide-white/[0.06]">
              {lista.map((f) => (
                <li key={f.fecha} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <span className="w-24 shrink-0 font-bold tabular-nums text-sand">{fechaCortaEs(f.fecha)}</span>
                  <span className="min-w-0 flex-1 text-sand/75">{f.nombre}</span>
                  {f.grupos.map((g) => (
                    <span key={g} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold text-sand/80">
                      {g}
                      <button type="button" title={`Quitar de ${g}`} disabled={ocupado} onClick={() => hacer("borrarFestivo", { fecha: f.fecha, grupo: g })} className="text-sand/45 hover:text-mandarin"><IconX size={11} /></button>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Ruta ── */
export default function GestionVacacionesRoute() {
  const v2 = useV2Configurado();
  const { theme } = useTheme();
  const [anio, setAnio] = useState(null);
  const { snap, reload, post } = useVacaciones(v2 ? anio : null);
  const [tab, setTab] = useState("resumen");
  const [selId, setSelId] = useState(null);
  const [filtros, setFiltros] = useState(() => new Set());
  const [sheet, setSheet] = useState(null);
  const [aviso, setAviso] = useState("");
  const [hoy] = useState(() => new Date());
  const d = snap?.data;

  // ?id=… (enlace del correo de nueva solicitud) -> abre esa solicitud.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) { setSelId(id); setTab("calendario"); }
  }, []);

  const sel = useMemo(() => (d?.pendientes || []).find((s) => s.id === selId) || null, [d, selId]);
  const marca = useMemo(() => (sel && d ? new Set(diasSolicitud(sel, d)) : null), [sel, d]);

  const datosVis = useMemo(() => (d ? normalizarColores(d, theme) : null), [d, theme]);
  const toggleFiltro = useCallback((nombre) => setFiltros((prev) => { const n = new Set(prev); if (n.has(nombre)) n.delete(nombre); else n.add(nombre); return n; }), []);
  const recargar = () => reload(true);
  const abrir = (id) => { setSelId(id); setTab("calendario"); };

  if (v2 === false) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-28">
        <EmptyCard>
          El sistema nuevo de vacaciones aún no está desplegado: falta la clave <code className="text-sand">{CLAVE_V2}</code> en links.json
          (desplegar apps-script/vacaciones/). Hasta entonces las solicitudes se gestionan en el panel antiguo.
        </EmptyCard>
      </main>
    );
  }

  const pendientes = d?.pendientes || [];
  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.purple }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.mandarin }} />
      </div>
      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-purple/80">Coordinación</p>
            <h1 className="mt-2 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">Vacaciones</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {d?.anios?.length > 1 && d.anios.map((a) => (
              <Chip key={a} on={a === d.year} onClick={() => setAnio(a)}>{a}</Chip>
            ))}
            {snap?.actualizando && <span className="text-xs text-sand/50" role="status">Actualizando…</span>}
            <button type="button" onClick={() => reload(true)} disabled={!!snap?.actualizando} title="Recargar" className="rounded-full border border-white/15 p-2 text-sand/60 hover:text-sand disabled:opacity-50"><IconReload size={15} className={snap?.actualizando ? "animate-spin" : ""} /></button>
          </div>
        </header>

        {snap?.error ? (
          <ErrorCard mensaje={snap.error} onRetry={() => reload()} />
        ) : !d ? (
          <VacacionesSkeleton />
        ) : !d.esCoordinador ? (
          <EmptyCard>Tu email no figura como coordinación en equipo.json.</EmptyCard>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2" role="tablist">
              {TABS.map((t) => (
                <Chip key={t.id} on={tab === t.id} onClick={() => setTab(t.id)}>
                  {t.label}{t.id === "calendario" && pendientes.length ? ` · ${pendientes.length} pend.` : ""}
                </Chip>
              ))}
            </div>
            {aviso && (
              <p className="mb-4 flex items-center gap-2 rounded-lg border border-lime/40 bg-lime/10 px-3 py-2 text-xs font-bold text-lime">
                {aviso}<button type="button" onClick={() => setAviso("")} className="ml-auto text-sand/50"><IconX size={12} /></button>
              </p>
            )}
            {snap.avisoRecarga && <p className="mb-4 text-xs text-canary"><IconAlert size={12} className="mr-1 inline" />No se pudo refrescar: {snap.avisoRecarga}</p>}

            {tab === "resumen" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi label="Fuera hoy" value={(d.ausenciasPorDia[dateKey(hoy)] || []).length} accent="mandarin" />
                  <Kpi label="Pendientes" value={pendientes.length} accent="canary" />
                  <Kpi label="Personas" value={d.empleados.filter((e) => e.activo).length} />
                  <Kpi label="Grupos de festivos" value={d.grupos.length} accent="purple" />
                </div>
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <AhoraPanel datos={datosVis} hoy={hoy} />
                  <section className={`${GLASS} space-y-2 p-4`} aria-label="Solicitudes pendientes">
                    <h2 className="font-display text-base font-bold text-sand">Solicitudes pendientes</h2>
                    {!pendientes.length ? <p className="text-[13px] text-sand/55">No hay nada pendiente. 🎉</p> : pendientes.map((s) => (
                      <SolicitudItem key={s.id} s={s} activa={false} onClick={() => abrir(s.id)} />
                    ))}
                    {d.recientes?.length > 0 && (
                      <details className="pt-2">
                        <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-sand/50">Últimas resueltas</summary>
                        <ul className="mt-2 space-y-1 text-[12px] text-sand/65">
                          {d.recientes.slice(0, 12).map((s) => (
                            <li key={s.id} className="flex items-center gap-1.5"><TipoChip tipo={s.tipo} /> {CLASE_SOL[s.clase]?.corto ? `${CLASE_SOL[s.clase].corto} · ` : ""}{s.persona} · {formatRango(s.desde, s.hasta)} <span className="ml-auto"><EstadoSolBadge estado={s.estado} /></span></li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                </div>
              </div>
            )}

            {tab === "calendario" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <section className={`${GLASS} space-y-2 p-4`} aria-label="Solicitudes pendientes">
                    <h2 className="font-display text-base font-bold text-sand">Pendientes ({pendientes.length})</h2>
                    {!pendientes.length ? <p className="text-[13px] text-sand/55">No hay nada pendiente.</p> : pendientes.map((s) => (
                      <SolicitudItem key={s.id} s={s} activa={s.id === selId} onClick={() => setSelId(s.id === selId ? null : s.id)} />
                    ))}
                    {selId && !sel && <p className="text-[12px] text-canary">Esa solicitud ya no está pendiente.</p>}
                  </section>
                  {sel && (
                    <DetalleSolicitud s={sel} d={d} post={post} onResuelta={(r) => {
                      const hecho = [r.dias ? `${r.dias} días escritos` : "", r.liberados ? `${r.liberados} días liberados` : "", r.evento ? "evento creado" : ""].filter(Boolean).join(", ");
                      const c = CLASE_SOL[r.clase] || CLASE_SOL.NUEVA;
                      setAviso(r.estado === "APROBADA"
                        ? `✓ ${c.label} aprobad${c.a}${hecho ? ` (${hecho})` : ""}${r.aviso ? ` · el correo falló: ${r.aviso}` : ""}`
                        : `${c.label} rechazad${c.a}${r.aviso ? ` · el correo falló: ${r.aviso}` : ""}`);
                      setSelId(null); recargar();
                    }} />
                  )}
                  <EquipoPanel
                    empleados={datosVis.empleados}
                    paletaEquipos={{}}
                    filtros={filtros}
                    onToggle={toggleFiltro}
                    onClear={() => setFiltros(new Set())}
                    ausentesHoy={(d.ausenciasPorDia[dateKey(hoy)] || []).length}
                    leyendaExtra={
                      <div className="mt-1.5 flex items-center gap-2.5">
                        <span className="h-3.5 w-3.5 shrink-0 rounded border-2 border-dashed" style={{ borderColor: MARCA_COLOR(theme) }} aria-hidden />
                        Solicitud seleccionada
                      </div>
                    }
                  />
                </div>
                <Calendario datos={datosVis} filtros={filtros} totalActivos={d.empleados.filter((e) => e.activo).length} onOpenDay={(dateStr, ausencias) => setSheet({ dateStr, ausencias })} marca={marca} />
              </div>
            )}

            {tab === "personas" && <Personas d={d} post={post} onCambio={recargar} />}
            {tab === "festivos" && <Festivos d={d} post={post} onCambio={recargar} />}

            <DaySheet sheet={sheet} empleadosMap={datosVis.empleadosMap || {}} onClose={() => setSheet(null)} />
          </>
        )}
      </div>
    </main>
  );
}
