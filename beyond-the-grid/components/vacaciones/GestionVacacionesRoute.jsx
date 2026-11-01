"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import { VacacionesSkeleton, ErrorCard } from "./VacacionesRoute";
import { useVacaciones, useV2Configurado, laborables, conEneroSiguiente, isoDe, deIso, CLAVE_V2 } from "./datos";
import CalendarioTrimestres from "./CalendarioTrimestres";
import CampanasAdmin from "./CampanasAdmin";
import { Personas, SedesFestivos, Anios } from "./GestionAjustes";
import { MCOR, LEYENDA, colorMotivo, textoMotivo, fCorta, fLarga, masDias, esFinde, qDe, nombresCortos, vuelve, mesesDeQ } from "./vistaUsuario";

/* /vacaciones-gestion (COORDINACIÓN, backend v2), con el lenguaje de /vacaciones:
   · Solicitudes: la cola de pendientes arriba; a la izquierda, fija, la
     solicitud que revisas (saldo, quién más falta, cuántos quedan disponibles
     si apruebas solo esta o también las que coinciden) con Aprobar/Rechazar
     (A/R, J/K para moverse, Z para deshacer); a la derecha, el calendario por
     trimestres con nombres, la solicitud resaltada, las pendientes con borde
     discontinuo y las que marques para ver cómo quedaría todo junto.
     Cada decisión espera 8 s antes de mandarse (y su correo): se puede
     deshacer una a una. Si cierras la página, sale igualmente.
   · Personas: saldos, sede y días del año, con «Deshacer».
   · Configuración: formularios especiales (con quién falta por responder),
     sedes y festivos, y años (crear el siguiente; rehacer, aparte). */

const ESPERA = 8000;
const UMBRAL = 10;
const TABS = [["solicitudes", "Solicitudes"], ["personas", "Personas"], ["configuracion", "Configuración"]];
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const rango = (a, b, anio) => {
  if (a === b) return fCorta(a, anio);
  const x = deIso(a), y = deIso(b);
  return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear() ? `${x.getDate()}–${y.getDate()} ${MCOR[x.getMonth()]}${x.getFullYear() !== anio ? ` ${x.getFullYear()}` : ""}` : `${fCorta(a, anio)} – ${fCorta(b, anio)}`;
};
const fCreada = (c) => { const s = String(c || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? fCorta(s) : ""; };

/* ── Panel de la solicitud que se revisa ── */
function Decision({ s, idx, total, ctx }) {
  const { d, corto, diasDe, otrasDe, activos, fuera, msg, setMsg, rechazoSinMotivo, forzar, setForzar, decidir, mover, errorSel } = ctx;
  if (!s) return null;
  const anio = d.year;
  const cancela = s.clase === "CANCELACION";
  const cambio = s.clase === "MODIFICACION";
  const dias = diasDe(s);
  const anioSol = Number(s.desde.slice(0, 4));
  const saldos = anioSol === d.year ? d.saldos : anioSol === d.anioSiguiente ? d.saldosSiguiente : null;
  const saldo = (saldos || []).find((x) => x.nombre === s.persona);
  const grupo = saldo?.grupo || d.empleadosMap?.[s.persona]?.grupo;
  const originales = cambio ? Object.keys(d.ausenciasPorDia).filter((iso) => iso >= s.origDesde && iso <= s.origHasta && (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona && a.motivo === s.tipoOrig)) : [];
  const propios = cancela ? [] : dias.filter((iso) => !originales.includes(iso) && (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona));
  const coinc = {};
  dias.forEach((iso) => (d.ausenciasPorDia[iso] || []).forEach((a) => { if (a.nombre !== s.persona) coinc[a.nombre] = (coinc[a.nombre] || 0) + 1; }));
  const otras = otrasDe(s);
  // Disponibles esos días: si apruebas solo esta, y si apruebas también las que coinciden.
  const delta = (iso) => (cancela ? -1 : originales.includes(iso) ? 0 : 1);
  const solo = dias.map((iso) => [iso, activos - fuera(iso) - delta(iso)]);
  const todas = dias.map((iso) => [iso, activos - fuera(iso) - delta(iso) - otras.filter((x) => diasDe(x).includes(iso)).length]);
  const peor = (l) => (l.length ? l.reduce((m, x) => (x[1] < m[1] ? x : m)) : null);
  const p1 = peor(solo), p2 = peor(todas);
  const num = (x) => (x[1] < UMBRAL ? <span className="v-neg">{x[1]}</span> : <b>{x[1]}</b>);
  const conflicto = propios.length > 0 || /SOLAPAMIENTO/.test(errorSel || "");
  return (
    <section className="v-mis" aria-labelledby="vg-dec-t">
      <div className="flex items-center justify-between gap-2">
        <span className="v-nota">Solicitud <b>{idx + 1} de {total}</b></span>
        <span className="flex gap-0.5">
          <button type="button" className="v-btn v-btn-t" aria-label="Solicitud anterior (K)" disabled={idx <= 0} onClick={() => mover(-1)}><IconoBBVA nombre="back" size={18} /></button>
          <button type="button" className="v-btn v-btn-t" aria-label="Solicitud siguiente (J)" disabled={idx >= total - 1} onClick={() => mover(1)}><IconoBBVA nombre="back" size={18} className="rotate-180" /></button>
        </span>
      </div>
      <div>
        <h2 id="vg-dec-t" tabIndex={-1} className="text-[21px] font-bold">{corto(s.persona)}</h2>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="v-tipo" style={{ background: colorMotivo(s.tipo) }}>{textoMotivo(s.tipo)}</span>
          {cancela && <span className="v-etq">Cancelación</span>}{cambio && <span className="v-etq">Cambio</span>}
          {s.campana && <span className="v-etq">{(d.campanas || []).find((c) => c.id === s.campana)?.nombre || "Formulario especial"}</span>}
          {fCreada(s.creada) && <span className="v-soft">pedida el {fCreada(s.creada)}</span>}
        </p>
      </div>
      <p className="m-0 text-[14px]">
        {cancela ? <>Quiere <b>cancelar</b> {rango(s.desde, s.hasta, anio)}: se le devuelven <b>{plural(dias.length, "día", "días")}</b>.</>
          : cambio ? <>Quiere <b>cambiar</b> {rango(s.origDesde, s.origHasta, anio)} por <b>{rango(s.desde, s.hasta, anio)}</b> · {plural(dias.length, "día laborable", "días laborables")}.</>
          : <>{rango(s.desde, s.hasta, anio)} · <b>{plural(dias.length, "día laborable", "días laborables")}</b>{grupo ? ` (festivos de ${grupo})` : ""}.</>}
      </p>
      {saldo && s.deltaVA !== 0 ? (
        <p className="vg-dato">Le quedan <b>{saldo.quedan}</b> días → tras esta, {saldo.quedan - (s.deltaVA || 0) < 0 ? <span className="v-neg">{saldo.quedan - (s.deltaVA || 0)}</span> : <b>{saldo.quedan - (s.deltaVA || 0)}</b>}
          {(saldo.pendientesVA || 0) !== (s.deltaVA || 0) && <> · con sus otras pendientes, {saldo.quedanTrasPendientes}</>}</p>
      ) : s.tipo !== "VA" ? <p className="vg-dato">{textoMotivo(s.tipo)}: no descuenta de sus vacaciones.</p> : null}
      {propios.length > 0 && <p className="v-aviso"><b>Ya tiene días apuntados</b> en ese rango: {propios.map((x) => fCorta(x, anio)).join(", ")}.</p>}
      {errorSel && <p className="v-aviso" role="alert">{errorSel.replace(/^SOLAPAMIENTO:\s*/, "")}</p>}
      {conflicto && (
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} className="h-4 w-4" />Aprobar igualmente (se sobrescriben)</label>
      )}
      <div className="flex flex-col gap-1 text-[13px]">
        <p className="vg-lbl">{cancela ? "Esos días faltan además" : "Esos días también faltan"}</p>
        <p className="m-0">{Object.keys(coinc).length
          ? Object.entries(coinc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, k]) => `${corto(n)} (${plural(k, "día", "días")})`).join(", ") + (Object.keys(coinc).length > 6 ? ` y ${Object.keys(coinc).length - 6} más` : "")
          : "Nadie más."}</p>
        <p className="m-0">Pendientes que coinciden: {otras.length ? otras.map((x, i) => (
          <span key={x.id}>{i > 0 && ", "}<button type="button" className="font-bold underline" onClick={() => ctx.elegir(x.id)}>{corto(x.persona)}</button></span>
        )) : "ninguna."}</p>
        {!cancela && p1 && (
          <p className="m-0">Disponibles (de {activos}): si apruebas solo esta, mínimo {num(p1)} el {fCorta(p1[0], anio)}
            {otras.length > 0 && p2 && <>; si apruebas también {otras.length === 1 ? "la que coincide" : `las ${otras.length} que coinciden`}, mínimo {num(p2)} el {fCorta(p2[0], anio)}</>}.</p>
        )}
      </div>
      {s.comentario && <p className="m-0 text-[13px]">«{s.comentario}»</p>}
      <label className="v-campo"><span>Mensaje para {corto(s.persona)} (va en el correo, opcional)</span>
        <textarea className="v-inp resize-y" rows={2} value={msg} placeholder="Por ejemplo: disfruta" onChange={(e) => setMsg(e.target.value)} />
      </label>
      {rechazoSinMotivo && <p className="v-aviso" role="alert">¿Rechazar sin explicar el motivo? Escríbelo arriba o pulsa <b>Rechazar</b> otra vez.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="v-btn v-btn-ok" data-accion="aprobar" disabled={propios.length > 0 && !forzar} onClick={() => decidir(true)}>
          <IconoBBVA nombre="checkmark" size={18} />Aprobar <span className="vg-kbd" aria-hidden>A</span>
        </button>
        <button type="button" className="v-btn v-btn-l" onClick={() => decidir(false)}>Rechazar <span className="vg-kbd" aria-hidden>R</span></button>
      </div>
      <p className="v-nota">Al decidir pasa sola a la siguiente. Cada decisión (y su correo) sale a los 8 s: hasta entonces puedes deshacerla. <span className="vg-kbd">J</span> <span className="vg-kbd">K</span> siguiente y anterior · <span className="vg-kbd">Z</span> deshacer.</p>
    </section>
  );
}

/* ── Detalle de un día ── */
function HojaDia({ s, ctx, onCerrar }) {
  const { d, corto, activos, pendDia, festPorGrupo, elegir } = ctx;
  const ref = useRef(null);
  useEffect(() => { const prev = document.activeElement; ref.current?.querySelector("button")?.focus(); return () => prev?.focus?.(); }, []);
  const lista = d.ausenciasPorDia[s] || [];
  const pend = pendDia(s);
  const disp = activos - lista.length - pend.length;
  const teclas = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onCerrar(); }
    if (e.key === "Tab") { const f = [...ref.current.querySelectorAll("button")]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus(); }
  };
  const t = fLarga(s, d.year);
  return (
    <div className="v-velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={ref} className="v-hoja" role="dialog" aria-modal="true" aria-labelledby="vg-hoja-t" onKeyDown={teclas}>
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <h2 id="vg-hoja-t" className="text-lg font-bold">{t[0].toUpperCase() + t.slice(1)}</h2>
            <p className="v-nota">{plural(lista.length, "persona fuera", "personas fuera")} · {plural(pend.length, "pendiente", "pendientes")} · {disp < UMBRAL ? <span className="v-neg">{plural(disp, "disponible", "disponibles")}</span> : plural(disp, "disponible", "disponibles")} si se aprueba todo</p>
          </div>
          <button type="button" className="v-btn v-btn-t" aria-label="Cerrar" onClick={onCerrar}><IconoBBVA nombre="close" size={18} /></button>
        </div>
        {pend.length > 0 && (<>
          <p className="vg-lbl mt-3">Pendientes</p>
          <ul className="flex flex-col gap-2">{pend.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-2 text-sm"><span>{corto(x.persona)}<br /><small className="v-soft">{rango(x.desde, x.hasta, d.year)}</small></span>
              <button type="button" className="v-btn v-btn-l !px-3 !py-1.5" onClick={() => { onCerrar(); elegir(x.id); }}>Revisar</button></li>
          ))}</ul>
        </>)}
        {lista.length > 0 && (<>
          <p className="vg-lbl mt-3">Fuera</p>
          <ul className="flex flex-col gap-2">{lista.map((a) => {
            const v = vuelve(a.nombre, s, d.ausenciasPorDia, festPorGrupo[d.empleadosMap?.[a.nombre]?.grupo]);
            return (<li key={a.nombre} className="flex items-center justify-between gap-2 text-sm"><span>{corto(a.nombre)}{v && <><br /><small className="v-soft">Vuelve el {fLarga(v, d.year)}</small></>}</span>
              <span className="v-tipo" style={{ background: colorMotivo(a.motivo) }}>{textoMotivo(a.motivo)}</span></li>);
          })}</ul>
        </>)}
      </div>
    </div>
  );
}

export default function GestionVacacionesRoute() {
  const v2 = useV2Configurado();
  const [anio, setAnio] = useState(null);
  const { snap, reload, post, beacon } = useVacaciones(v2 ? anio : null);
  const base = snap?.data;
  const anioSig = base?.anios?.includes(base.year + 1) ? base.year + 1 : null;
  const { snap: snapSig, reload: reloadSig } = useVacaciones(anioSig, { activo: !!v2 && !!anioSig });
  const dMas = useMemo(() => conEneroSiguiente(base, snapSig?.data), [base, snapSig]);
  const [hoy] = useState(() => isoDe(new Date()));

  const [tab, setTab] = useState("solicitudes");
  const [selId, setSelId] = useState(null);
  const [vista, setVista] = useState("todas");
  const [marcadas, setMarcadas] = useState(() => new Set());
  const [msg, setMsg] = useState("");
  const [rechazoSinMotivo, setRechazoSinMotivo] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [errores, setErrores] = useState({}); // id -> mensaje del backend
  const [enviando, setEnviando] = useState([]); // [{ id, s, aprobar, motivo, forzar, fin }]
  const [, setTic] = useState(0);
  const timers = useRef({});
  const enviandoRef = useRef([]);
  enviandoRef.current = enviando;
  const [qs, setQs] = useState(() => new Set([Math.floor(new Date().getMonth() / 3) + 1]));
  const [filtro, setFiltro] = useState("");
  const [dia, setDia] = useState(null);
  const [irA, setIrA] = useState(null);
  const [aviso, setAviso] = useState(null); // { msg, fn }
  const tAviso = useRef(null);

  const recargar = useCallback(() => { reload(true); if (anioSig) reloadSig(true); }, [reload, reloadSig, anioSig]);
  const avisar = useCallback((m, fn) => {
    clearTimeout(tAviso.current);
    setAviso({ msg: m, fn });
    tAviso.current = setTimeout(() => setAviso(null), fn ? ESPERA : 4000);
  }, []);

  // ?id=… (enlace del correo de nueva solicitud) → abre esa solicitud.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) { setSelId(id); setTab("solicitudes"); }
  }, []);

  const d = useMemo(() => (dMas ? { ...dMas, cortos: nombresCortos((dMas.empleados || []).map((e) => e.nombre)) } : null), [dMas]);
  const corto = useCallback((n) => d?.cortos?.[n] || n, [d]);
  const festPorGrupo = useMemo(() => {
    const out = {};
    (d?.festivosTodos || d?.festivosDetalle || []).forEach((f) => { (out[f.grupo] = out[f.grupo] || {})[f.fecha] = f.nombre || "Festivo"; });
    return out;
  }, [d]);
  const fxg = useCallback((g) => Object.fromEntries(Object.keys(festPorGrupo[g] || {}).map((k) => [k, true])), [festPorGrupo]);
  const grupoDe = useCallback((p) => (d?.saldos || []).find((x) => x.nombre === p)?.grupo || d?.empleadosMap?.[p]?.grupo, [d]);
  const diasDe = useCallback((s) => {
    if (!d) return [];
    if (s.clase === "CANCELACION") return Object.keys(d.ausenciasPorDia).filter((iso) => iso >= s.desde && iso <= s.hasta && (d.ausenciasPorDia[iso] || []).some((a) => a.nombre === s.persona && a.motivo === s.tipo)).sort();
    return laborables(s.desde, s.hasta, fxg(grupoDe(s.persona)));
  }, [d, fxg, grupoDe]);

  const idsEnviando = useMemo(() => new Set(enviando.map((x) => x.id)), [enviando]);
  const pend = useMemo(() => (d?.pendientes || []).filter((s) => !idsEnviando.has(s.id)), [d, idsEnviando]);
  const diasPorId = useMemo(() => Object.fromEntries(pend.map((s) => [s.id, diasDe(s)])), [pend, diasDe]);
  const vistas = useMemo(() => {
    const out = [["todas", "Todas", () => true]];
    (d?.campanas || []).forEach((c) => { if (pend.some((s) => s.campana === c.id)) out.push([`c:${c.id}`, `${c.emoji ? `${c.emoji} ` : ""}${c.nombre}`, (s) => s.campana === c.id]); });
    if (pend.some((s) => s.clase !== "NUEVA")) out.push(["cambios", "Cambios y cancelaciones", (s) => s.clase !== "NUEVA"]);
    return out;
  }, [d, pend]);
  const filtroVista = (vistas.find((v) => v[0] === vista) || vistas[0])[2];
  const cola = useMemo(() => pend.filter(filtroVista).sort((a, b) => a.desde.localeCompare(b.desde)), [pend, filtroVista]);
  const sel = cola.find((s) => s.id === selId) || pend.find((s) => s.id === selId) || cola[0] || null;
  const idx = sel ? cola.findIndex((s) => s.id === sel.id) : -1;
  const activos = d ? d.empleados.filter((e) => e.activo).length : 0;
  const fuera = useCallback((iso) => (d?.ausenciasPorDia?.[iso] || []).length, [d]);
  const pendDia = useCallback((iso) => pend.filter((s) => s.clase !== "CANCELACION" && (diasPorId[s.id] || []).includes(iso)), [pend, diasPorId]);
  const otrasDe = useCallback((s) => { const ds = diasPorId[s.id] || diasDe(s); return pend.filter((x) => x.id !== s.id && x.clase !== "CANCELACION" && (diasPorId[x.id] || []).some((iso) => ds.includes(iso))); }, [pend, diasPorId, diasDe]);

  const elegir = useCallback((id) => {
    setSelId(id); setMsg(""); setRechazoSinMotivo(false); setForzar(false);
    const s = (d?.pendientes || []).find((x) => x.id === id);
    if (s && d) {
      setQs((prev) => new Set([...prev, qDe(s.desde, d.year)]));
      if (window.matchMedia("(min-width: 1101px)").matches) setIrA((diasPorId[id] || [])[0] || s.desde);
    }
  }, [d, diasPorId]);
  const mover = (paso) => { const j = idx + paso; if (cola[j]) elegir(cola[j].id); };
  useEffect(() => {
    if (!irA) return;
    const el = document.querySelector(`[data-dia="${irA}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setIrA(null);
  }, [irA, qs]);

  // ── Decisiones: esperan 8 s antes de mandarse ──
  const enviar = useCallback(async (item) => {
    delete timers.current[item.id];
    try {
      const r = await post("resolver", { id: item.id, decision: item.aprobar ? "aprobar" : "rechazar", motivo: item.motivo, forzar: item.forzar });
      setEnviando((l) => l.filter((x) => x.id !== item.id));
      if (r?.aviso) avisar(`${corto(item.s.persona)}: decisión guardada, pero el correo falló (${r.aviso}). Avísale tú.`);
      recargar();
    } catch (e) {
      const m = String(e.message || e);
      setEnviando((l) => l.filter((x) => x.id !== item.id));
      if (/ya está/i.test(m)) { avisar(`Otro coordinador ya había resuelto la de ${corto(item.s.persona)}: ${m.replace(/^La solicitud /, "")}`); recargar(); return; }
      setErrores((x) => ({ ...x, [item.id]: m }));
      setSelId(item.id);
      avisar(`No se pudo mandar la de ${corto(item.s.persona)}: revísala`);
    }
  }, [post, recargar, avisar, corto]);
  const deshacer = useCallback((id) => {
    clearTimeout(timers.current[id]); delete timers.current[id];
    setEnviando((l) => l.filter((x) => x.id !== id));
    setSelId(id); setMsg(""); setRechazoSinMotivo(false);
  }, []);
  const decidir = (aprobar) => {
    if (!sel) return;
    if (!aprobar && !msg.trim() && !rechazoSinMotivo) { setRechazoSinMotivo(true); return; }
    const item = { id: sel.id, s: sel, aprobar, motivo: msg.trim(), forzar, fin: Date.now() + ESPERA };
    timers.current[sel.id] = setTimeout(() => enviar(item), ESPERA);
    setEnviando((l) => [...l, item]);
    setErrores((x) => { const n = { ...x }; delete n[sel.id]; return n; });
    setMarcadas((m) => { const n = new Set(m); n.delete(sel.id); return n; });
    const sig = cola[idx + 1] || cola[idx - 1];
    if (sig) elegir(sig.id); else { setSelId(null); setMsg(""); setRechazoSinMotivo(false); setForzar(false); }
    requestAnimationFrame(() => document.querySelector('[data-accion="aprobar"]')?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    if (!enviando.length) return;
    const t = setInterval(() => setTic((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [enviando.length]);
  // Si la persona se va con decisiones esperando, salen igualmente.
  useEffect(() => {
    const salir = () => enviandoRef.current.forEach((x) => { clearTimeout(timers.current[x.id]); beacon("resolver", { id: x.id, decision: x.aprobar ? "aprobar" : "rechazar", motivo: x.motivo, forzar: x.forzar }); });
    window.addEventListener("pagehide", salir);
    return () => { window.removeEventListener("pagehide", salir); salir(); };
  }, [beacon]);

  // Atajos: A aprobar, R rechazar, J/K siguiente/anterior, Z deshacer la última.
  useEffect(() => {
    const f = (e) => {
      if (tab !== "solicitudes" || dia || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      const k = e.key.toLowerCase();
      if (k === "z" && enviandoRef.current.length) { e.preventDefault(); deshacer(enviandoRef.current[enviandoRef.current.length - 1].id); return; }
      if (!sel) return;
      if (k === "a") { e.preventDefault(); const b = document.querySelector('[data-accion="aprobar"]'); if (b && !b.disabled) decidir(true); }
      else if (k === "r") { e.preventDefault(); decidir(false); }
      else if (k === "j") { e.preventDefault(); mover(1); }
      else if (k === "k") { e.preventDefault(); mover(-1); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  // ── Calendario: la solicitud que revisas, las marcadas y las pendientes ──
  const selDias = useMemo(() => new Set(sel ? diasPorId[sel.id] || [] : []), [sel, diasPorId]);
  const marcadasL = useMemo(() => pend.filter((s) => marcadas.has(s.id) && (!sel || s.id !== sel.id)), [pend, marcadas, sel]);
  // Lo aprobado que aún se está enviando cuenta ya como fuera (con su nombre).
  const enviandoDias = useMemo(() => enviando.filter((x) => x.aprobar).map((x) => ({ s: x.s, dias: new Set(diasDe(x.s)) })), [enviando, diasDe]);
  const capa = useCallback((iso) => {
    const previos = []; const cls = []; let ocultar = null; let cuenta = 0;
    enviandoDias.forEach(({ s, dias }) => { if (dias.has(iso)) { const c = s.clase === "CANCELACION"; if (c) ocultar = new Set([...(ocultar || []), s.persona]); else previos.push({ nombre: s.persona, texto: corto(s.persona), cls: "v-sim" }); cuenta += c ? -1 : 1; } });
    if (selDias.has(iso)) {
      const c = sel.clase === "CANCELACION";
      previos.push({ nombre: sel.persona, texto: `${corto(sel.persona)}${c ? " · cancela" : ""}`, cls: "v-sel" });
      cls.push("v-revisa"); if (c) ocultar = new Set([...(ocultar || []), sel.persona]); cuenta += c ? -1 : 1;
    }
    marcadasL.forEach((s) => { if ((diasPorId[s.id] || []).includes(iso)) { previos.push({ nombre: s.persona, texto: corto(s.persona), cls: "v-sim" }); cuenta += s.clase === "CANCELACION" ? -1 : 1; } });
    const otros = pendDia(iso).filter((s) => (!sel || s.id !== sel.id) && !marcadas.has(s.id));
    otros.forEach((s) => previos.push({ nombre: s.persona, texto: corto(s.persona), cls: "v-pnd" }));
    const disp = activos - fuera(iso) - cuenta;
    if (disp < UMBRAL) cls.push("v-alerta");
    return { previos, cls, ocultar, aria: `${selDias.has(iso) ? " · la solicitud que revisas" : ""}${otros.length ? ` · ${plural(otros.length, "pendiente", "pendientes")}` : ""} · ${plural(disp, "disponible", "disponibles")}` };
  }, [selDias, sel, marcadasL, marcadas, diasPorId, pendDia, corto, activos, fuera, enviandoDias]);
  const resumenMarcadas = useMemo(() => {
    if (!marcadasL.length) return null;
    const todas = [...(sel ? [sel] : []), ...marcadasL];
    const ds = [...new Set(todas.flatMap((s) => diasPorId[s.id] || []))];
    const disp = ds.map((iso) => [iso, activos - fuera(iso) - todas.filter((s) => (diasPorId[s.id] || []).includes(iso)).reduce((n, s) => n + (s.clase === "CANCELACION" ? -1 : 1), 0)]);
    const p = disp.reduce((m, x) => (x[1] < m[1] ? x : m), disp[0]);
    return { todas, p };
  }, [marcadasL, sel, diasPorId, activos, fuera]);

  const grupoVista = filtro ? grupoDe(filtro) : d?.yo?.grupo || (d?.grupos || [])[0]?.grupo;
  const festVista = festPorGrupo[grupoVista] || {};
  const festOtros = useMemo(() => {
    const out = {}; const pais = Object.fromEntries((d?.grupos || []).map((g) => [g.grupo, g.pais]));
    Object.entries(festPorGrupo).forEach(([g, m]) => { if (g !== grupoVista) Object.entries(m).forEach(([iso, n]) => { if (!out[iso]) out[iso] = `${n} (${pais[g] || g})`; }); });
    return out;
  }, [festPorGrupo, grupoVista, d]);
  const personas = useMemo(() => (d?.empleados || []).filter((e) => e.activo).map((e) => e.nombre).sort((a, b) => corto(a).localeCompare(corto(b), "es")), [d, corto]);
  const proximo = useMemo(() => {
    if (!d) return null;
    const f = fxg(grupoVista); let s = hoy;
    for (let i = 0; i < 15; i++) { s = masDias(s, 1); if (!esFinde(s) && !f[s]) return s; }
    return null;
  }, [d, hoy, fxg, grupoVista]);

  if (v2 === false) {
    return (
      <main className="vacu vg mx-auto w-full max-w-3xl px-4 pb-10 pt-cabecera">
        <p className="vg-secc">El sistema nuevo de vacaciones aún no está desplegado: falta la clave <code>{CLAVE_V2}</code> en links.json.</p>
      </main>
    );
  }

  const ctx = { d, corto, diasDe, otrasDe, activos, fuera, msg, setMsg, rechazoSinMotivo, forzar, setForzar, decidir, mover, elegir, pendDia, festPorGrupo, errorSel: sel ? errores[sel.id] : "" };
  const restante = (x) => Math.max(0, Math.ceil((x.fin - Date.now()) / 1000));

  return (
    <main className="vacu vg mx-auto flex w-full max-w-[1376px] flex-col gap-4 px-4 pb-10 pt-cabecera sm:px-8">
      <a className="v-salto" href="#calendario">Saltar al calendario</a>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-ge grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="aeroplane" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Vacaciones del equipo</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {d?.anios?.length > 1 && (<>
            <span className="mr-1 text-[13px] font-bold">Año</span>
            {d.anios.map((a) => <button key={a} type="button" className="v-chip" aria-pressed={a === d.year} onClick={() => setAnio(a)}>{a}</button>)}
          </>)}
          <button type="button" className="v-btn v-btn-t" onClick={recargar} disabled={!!snap?.actualizando} aria-label="Actualizar los datos"><IconoBBVA nombre="arrows" size={18} className={snap?.actualizando ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {snap?.error ? <ErrorCard mensaje={snap.error} onRetry={() => reload()} />
        : !d ? <VacacionesSkeleton />
        : !d.esCoordinador ? <p className="vg-secc">Tu email no figura como coordinación en equipo.json.</p>
        : (<>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones"
              onKeyDown={(e) => { if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); const i = TABS.findIndex(([id]) => id === tab); const sig = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length][0]; setTab(sig); requestAnimationFrame(() => document.getElementById(`vg-tab-${sig}`)?.focus()); }}>
              {TABS.map(([id, t]) => (
                <button key={id} id={`vg-tab-${id}`} type="button" role="tab" className="v-chip" aria-selected={tab === id} aria-controls="vg-panel" tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
                  {t}{id === "solicitudes" && pend.length > 0 && <span className="v-n">{pend.length}<span className="sr-only"> pendientes</span></span>}
                </button>
              ))}
            </div>
            {proximo && <span className="v-soft ml-auto text-[13px]">Próximo día laborable ({fLarga(proximo, d.year)}): <b className="text-sand">{fuera(proximo)} fuera</b> de {activos}</span>}
          </div>
          {snap?.actualizando && <p className="v-nota" role="status">Actualizando…</p>}
          {snap?.avisoRecarga && <p className="v-aviso">No se pudo refrescar: {snap.avisoRecarga}</p>}

          <div id="vg-panel" role="tabpanel" aria-labelledby={`vg-tab-${tab}`}>
            {tab === "solicitudes" && (
              <div className="vg-sol">
                {pend.length > 0 && (
                  <section className="vg-cola" aria-labelledby="vg-cola-t">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 id="vg-cola-t" className="text-[16px] font-bold">Pendientes · {pend.length}</h2>
                      {vistas.length > 1 && (
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ver">
                          {vistas.map(([id, t, fn]) => <button key={id} type="button" className="v-chip" aria-pressed={vista === id} onClick={() => { setVista(id); const c = pend.filter(fn).sort((a, b) => a.desde.localeCompare(b.desde)); if (c[0] && !c.some((x) => x.id === sel?.id)) elegir(c[0].id); }}>{t}<span className="v-n">{pend.filter(fn).length}</span></button>)}
                        </div>
                      )}
                      {vista.startsWith("c:") && <button type="button" className="v-btn v-btn-t underline" onClick={() => setTab("configuracion")}>Ver quién falta por responder</button>}
                    </div>
                    <ul className="vg-tarjetas">
                      {cola.map((s) => (
                        <li key={s.id}>
                          <button type="button" className="vg-tarjeta" aria-current={s.id === sel?.id} onClick={() => elegir(s.id)}>
                            <span className="flex items-center justify-between gap-2"><b className="truncate text-[14px]">{corto(s.persona)}</b><span className="v-tipo" style={{ background: colorMotivo(s.tipo) }}>{textoMotivo(s.tipo)}</span></span>
                            <span className="truncate">{s.clase === "CANCELACION" ? <b>Cancela · </b> : s.clase === "MODIFICACION" ? <b>Cambio · </b> : null}{rango(s.desde, s.hasta, d.year)}{s.campana ? " · formulario" : ""}</span>
                          </button>
                          <label className="vg-marca" title="Ver en el calendario junto a la que revisas">
                            <input type="checkbox" checked={marcadas.has(s.id) || s.id === sel?.id} disabled={s.id === sel?.id}
                              aria-label={`Ver la de ${corto(s.persona)} en el calendario junto a la que revisas`}
                              onChange={() => setMarcadas((m) => { const n = new Set(m); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
                          </label>
                        </li>
                      ))}
                    </ul>
                    {resumenMarcadas ? (
                      <p className="v-cobertura flex flex-wrap items-center gap-2">
                        <span>En el calendario, como si aprobaras <b>{resumenMarcadas.todas.map((s) => corto(s.persona)).join(", ")}</b>: {resumenMarcadas.p && <>mínimo {resumenMarcadas.p[1] < UMBRAL ? <span className="v-neg">{resumenMarcadas.p[1]}</span> : <b>{resumenMarcadas.p[1]}</b>} disponibles de {activos} (el {fCorta(resumenMarcadas.p[0], d.year)})</>}.</span>
                        <button type="button" className="v-btn v-btn-t" onClick={() => setMarcadas(new Set())}>Quitar marcas</button>
                      </p>
                    ) : <p className="v-nota">Marca la casilla de varias para verlas juntas en el calendario y cuánta gente quedaría.</p>}
                  </section>
                )}
                <div className="vg-lado">
                  {sel ? <Decision s={sel} idx={idx < 0 ? 0 : idx} total={Math.max(cola.length, 1)} ctx={ctx} />
                    : (
                      <section className="v-mis" aria-labelledby="vg-dec-t">
                        <h2 id="vg-dec-t" className="text-[19px] font-bold">No queda nada pendiente</h2>
                        <p className="m-0 text-[13px]">Cuando alguien pida días te llega un correo y aparece aquí.</p>
                        {(d.recientes || []).length > 0 && (<>
                          <p className="vg-lbl">Últimas resueltas</p>
                          <ul className="v-lista">{d.recientes.slice(0, 6).map((r) => (
                            <li key={r.id}><span className="v-fila"><b>{corto(r.persona)} · {rango(r.desde, r.hasta, d.year)}</b><span className={`v-estado v-estado-${r.estado}`}>{r.estado === "APROBADA" ? "Aprobada" : r.estado === "RECHAZADA" ? "Rechazada" : r.estado.toLowerCase()}</span></span></li>
                          ))}</ul>
                        </>)}
                      </section>
                    )}
                  {enviando.length > 0 && (
                    <section className="flex flex-col gap-1.5" aria-label="Decisiones que se están enviando">
                      <p className="vg-lbl">Se envían en unos segundos</p>
                      <ul className="vg-enviando">{enviando.map((x) => (
                        <li key={x.id}><span><b>{x.aprobar ? "Aprobada" : "Rechazada"}</b> · {corto(x.s.persona)} · {rango(x.s.desde, x.s.hasta, d.year)} <span className="v-soft">· {restante(x)} s</span></span>
                          <button type="button" className="v-btn v-btn-l !px-3 !py-1.5" onClick={() => deshacer(x.id)}>Deshacer</button></li>
                      ))}</ul>
                    </section>
                  )}
                </div>
                <CalendarioTrimestres
                  anio={d.year} hoy={hoy} qs={qs}
                  onToggleQ={(q) => setQs((prev) => { const n = new Set(prev); if (n.has(q)) n.delete(q); else n.add(q); return n; })}
                  aus={d.ausenciasPorDia || {}} personas={personas} filtro={filtro} setFiltro={setFiltro}
                  yo={null} cortos={d.cortos} festVista={festVista} festOtros={festOtros} grupoVista={grupoVista}
                  onDia={setDia} sinEnero={!d.anioSiguiente} capa={capa}
                  infoQ={(q) => { const n = pend.filter((s) => qDe(s.desde, d.year) === q || mesesDeQ(q, d.year).some(([y, m]) => deIso(s.desde).getFullYear() === y && deIso(s.desde).getMonth() === m)).length; return n ? plural(n, "pendiente", "pendientes") : "Sin pendientes"; }}
                  leyenda={(
                    <div className="v-leyenda">
                      {LEYENDA.map((k) => <span key={k}><i className="v-sw" style={{ background: colorMotivo(k) }} />{textoMotivo(k)}</span>)}
                      <span><i className="v-sw" style={{ border: "1.5px dashed var(--v-ink)" }} />Pendiente</span>
                      <span><i className="v-sw" style={{ background: "#9694FF", boxShadow: "inset 0 0 0 2px #001391" }} />La que revisas</span>
                      <span><i className="v-sw" style={{ background: "#9694FF" }} />Marcadas o recién aprobadas</span>
                      <span><i className="v-sw" style={{ background: "#FFE761" }} />Menos de {UMBRAL} disponibles</span>
                      {grupoVista && <span><i className="v-sw" style={{ background: "var(--v-rayas)" }} />Festivo de {grupoVista}</span>}
                    </div>
                  )}
                />
              </div>
            )}
            {tab === "personas" && <Personas d={d} post={post} onCambio={recargar} avisar={avisar} />}
            {tab === "configuracion" && (
              <div className="vg-config">
                <CampanasAdmin d={d} post={post} onCambio={recargar} onAviso={avisar} onRevisar={(id) => { setTab("solicitudes"); setVista(`c:${id}`); const c = pend.filter((s) => s.campana === id).sort((a, b) => a.desde.localeCompare(b.desde)); if (c[0]) elegir(c[0].id); }} />
                <SedesFestivos d={d} post={post} onCambio={recargar} avisar={avisar} />
                <Anios d={d} post={post} avisar={avisar} onHecho={(a, m) => { avisar(m); setAnio(d.year); reload(true); }} />
              </div>
            )}
          </div>
          {dia && <HojaDia s={dia} ctx={ctx} onCerrar={() => setDia(null)} />}
        </>)}

      {aviso && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[110] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-full bg-sand px-5 py-2.5 text-sm font-bold text-midnight shadow-xl">
          {aviso.msg}
          {aviso.fn && <button type="button" onClick={() => { const f = aviso.fn; setAviso(null); clearTimeout(tAviso.current); f(); }} className="shrink-0 rounded-full border-[1.5px] border-midnight px-3 py-0.5 hover:bg-midnight/10">Deshacer</button>}
        </div>
      )}
    </main>
  );
}
