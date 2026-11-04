"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../chrome/AuthGate";
import { useEquipo } from "../timereport/datos";
import { mismoEmail } from "@/lib/email";
import IconoBBVA from "../iconosBBVA";
import { curQ } from "./model";
import { useGuardias, errorAviso } from "../guardias/datos";
import {
  qDeFecha, eur, hoyISO, minutos, cruzaMedianoche, fDur, fDia, fCorta, masUnDia,
  haceDias, qTxt, sinTildes, IMPORTES, IMPORTE_MAX,
} from "../guardias/model";

/* Guardias del equipo · vista de COORDINACIÓN (mismo lenguaje que Vacaciones
   del equipo). Año y trimestre filtran todo; lo pendiente de otros
   trimestres se avisa en una franja amarilla. Bandeja a la izquierda (Por
   resolver, Falta dar de alta en MyNFQ, En MyNFQ, Rechazadas, Pruebas) y
   panel de decisión a la derecha:
   · Elegir importe solo lo prepara; «Aprobar X € a Nombre» lo confirma.
   · Aprobar o rechazar espera 5 s antes de mandarse (y con ello el correo):
     cada una tiene su Deshacer. Si la persona se va, salen igualmente.
   · Dar de alta en MyNFQ es el último paso del ciclo (Pedida → Aprobada →
     En MyNFQ); se puede marcar de una en una o todas las del trimestre.
   · Atajos: J/K, 1–4, O, A, R, M, Z, Esc (desactivables).
   El enlace del correo trae ?id=<guardia> y la abre en su trimestre. */

const ESPERA = 5000;
const ETQ = { pend: "Pendiente", falta: "Falta MyNFQ", alta: "En MyNFQ", rech: "Rechazada" };
const tipoDe = (g) => (g.prueba ? "prueba" : g.estado === "pendiente" ? "pend" : g.estado === "rechazada" ? "rech" : g.aprobadaMyNfq ? "alta" : "falta");
const etqDe = (g) => (g.prueba ? (g.estado === "pendiente" ? "Prueba" : "Prueba resuelta") : ETQ[tipoDe(g)]);
const pila = (n) => String(n || "").split(" ")[0];
const porFecha = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
const leerAtajos = () => { try { return localStorage.getItem("guardias_atajos") !== "no"; } catch { return true; } };

function Kbd({ children }) { return <span className="vg-kbd" aria-hidden="true">{children}</span>; }
function Estado({ g }) { return <span className={`gu-est gu-est-${tipoDe(g)}`}>{etqDe(g)}</span>; }

function Ciclo({ g }) {
  const n = g.aprobadaMyNfq ? 3 : 2;
  const pasos = [["Pedida", g.creadoEn ? fCorta(g.creadoEn) : ""], ["Aprobada", g.resueltoEn ? `${fCorta(g.resueltoEn)} · ${eur.format(g.importe || 0)}` : ""], ["En MyNFQ", ""]];
  return (
    <ol className="gu-ciclo" aria-label="Ciclo de la guardia">
      {pasos.map(([t, s], i) => (
        <li key={t} className={i < n ? "gu-hecho" : ""}>
          {i > 0 && <span className={`gu-raya${i < n ? " gu-hecho" : ""}`} aria-hidden="true" />}
          <span className="gu-pt">{i < n && <IconoBBVA nombre="checkmark" size={13} />}</span>
          {t}{s && <small>{s}</small>}
          <span className="sr">{i < n ? " (hecho)" : " (pendiente)"}</span>
        </li>
      ))}
    </ol>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando las guardias del equipo">
      <div className="gu-resumen">{[0, 1, 2, 3].map((i) => <div key={i} className="gu-esq h-[78px]" />)}</div>
      <div className="gu-rejilla">
        <div className="gu-lista">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="gu-esq h-[58px]" />)}</div>
        <div className="gu-panel-w"><div className="gu-esq h-[360px]" /></div>
      </div>
    </div>
  );
}

export default function GuardiasRoute() {
  const { email } = useAuth();
  const equipo = useEquipo();
  const yo = useMemo(() => (equipo || []).find((m) => mismoEmail(m.email, email)) || null, [equipo, email]);
  const resueltoPor = yo?.nombre || email || "coordinación";
  const hoy = hoyISO();
  const anioHoy = hoy.slice(0, 4);

  const { snap, reload, post, beacon } = useGuardias("todas");
  const [lista, setLista] = useState(null);
  useEffect(() => { if (snap?.data?.guardias) setLista(snap.data.guardias); }, [snap]);
  const patch = useCallback((g) => g && setLista((l) => (l || []).map((x) => (x.id === g.id ? { ...x, ...g } : x))), []);

  const [q, setQ] = useState(curQ());
  const [filtro, setFiltro] = useState(null);
  const [persona, setPersona] = useState("");
  const [selId, setSelId] = useState(undefined); // undefined = automática; null = ninguna
  const [prep, setPrep] = useState({}); // id -> importe preparado
  const [otro, setOtro] = useState(null); // { valor, error } mientras se escribe otro importe
  const [rechazo, setRechazo] = useState(null); // { motivo } con el formulario abierto
  const [borrar, setBorrar] = useState(false);
  const [ocupados, setOcupados] = useState(() => new Set());
  const [avisos, setAvisos] = useState({}); // id -> texto que se queda en su panel
  const [correoId, setCorreoId] = useState(null);
  const [envios, setEnvios] = useState([]); // resoluciones esperando su Deshacer
  const [mensajes, setMensajes] = useState([]); // avisos de abajo
  const [anuncio, setAnuncio] = useState("");
  const [atajos, setAtajos] = useState(true);
  const [, setTic] = useState(0);
  const timers = useRef({});
  const enviosRef = useRef([]); enviosRef.current = envios;
  const kRef = useRef(0);
  const focoRef = useRef(null);
  const selRef = useRef(null);

  useEffect(() => { setAtajos(leerAtajos()); }, []);
  const anunciar = useCallback((t) => { setAnuncio(""); setTimeout(() => setAnuncio(t), 30); }, []);
  const enfocar = (selector) => { focoRef.current = selector; };
  useEffect(() => {
    if (!focoRef.current) return;
    const s = focoRef.current; focoRef.current = null;
    // Varios selectores separados por coma = por orden de preferencia.
    requestAnimationFrame(() => { const el = s.split(",").map((x) => document.querySelector(x.trim())).find(Boolean); el?.focus({ preventScroll: !s.startsWith("#gu-it-") }); });
  });
  const mensaje = useCallback((texto, { error = false, deshacer = null, dura } = {}) => {
    const k = ++kRef.current;
    setMensajes((l) => [...l.slice(-3), { k, texto, error, deshacer }]);
    setTimeout(() => setMensajes((l) => l.filter((m) => m.k !== k)), dura || (deshacer ? 6000 : error ? 9000 : 3500));
    anunciar(texto);
  }, [anunciar]);
  const ocupar = (id, si) => setOcupados((s) => { const n = new Set(s); if (si) n.add(id); else n.delete(id); return n; });

  // ── Lo que se ve: la lista con las resoluciones que aún esperan su Deshacer ──
  const vista = useMemo(() => {
    const porId = Object.fromEntries(envios.map((e) => [e.id, e]));
    return (lista || []).map((g) => {
      const e = porId[g.id];
      if (!e) return g;
      return { ...g, estado: e.tipo === "aprobar" ? "aprobada" : "rechazada", importe: e.tipo === "aprobar" ? e.importe : null, motivo: e.motivo || "", resueltoPor, resueltoEn: new Date().toISOString(), aprobadaMyNfq: false, _enviando: true };
    });
  }, [lista, envios, resueltoPor]);
  const coincide = useCallback((g) => { const f = sinTildes(persona.trim()); return !f || sinTildes(g.persona).includes(f); }, [persona]);
  const esFalta = (g) => !g.prueba && g.estado === "aprobada" && !g.aprobadaMyNfq;
  const cuenta = useCallback((pref) => {
    const r = vista.filter((g) => !g.prueba && (pref.length === 4 ? g.fecha.startsWith(pref) : qDeFecha(g.fecha) === pref));
    return { pend: r.filter((g) => g.estado === "pendiente").length, falta: r.filter(esFalta).length };
  }, [vista]);
  const textoCuenta = (c) => [c.pend && `${c.pend} por resolver`, c.falta && `${c.falta} sin dar de alta en MyNFQ`].filter(Boolean).join(", ");

  const grupos = useMemo(() => {
    const real = vista.filter((g) => !g.prueba && qDeFecha(g.fecha) === q && coincide(g));
    const desc = (a, b) => porFecha(b, a);
    if (filtro === "aprq") return [{ id: "aprq", t: `Aprobadas en ${qTxt(q)}`, nota: "con y sin MyNFQ", l: real.filter((g) => g.estado === "aprobada").sort(desc) }];
    const L = [
      { id: "pend", t: "Por resolver", nota: "la más antigua primero", l: real.filter((g) => g.estado === "pendiente").sort(porFecha) },
      { id: "falta", t: "Falta dar de alta en MyNFQ", nota: "", l: real.filter(esFalta).sort(porFecha) },
      { id: "alta", t: "En MyNFQ", nota: "", l: real.filter((g) => g.estado === "aprobada" && g.aprobadaMyNfq).sort(desc) },
      { id: "rech", t: "Rechazadas", nota: "", l: real.filter((g) => g.estado === "rechazada").sort(desc) },
    ];
    const pruebas = vista.filter((g) => g.prueba).sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1));
    if (pruebas.length) L.push({ id: "prueba", t: "Pruebas", nota: "solo coordinación", l: pruebas });
    return filtro ? L.filter((x) => x.id === filtro) : L;
  }, [vista, q, coincide, filtro]);
  const visibles = useMemo(() => grupos.flatMap((x) => x.l), [grupos]);
  const sel = useMemo(() => {
    if (selId === null) return null;
    const s = selId && visibles.find((g) => g.id === selId);
    if (s) return s;
    return filtro ? visibles[0] || null : visibles.find((g) => g.estado === "pendiente" && !g.prueba) || null;
  }, [selId, visibles, filtro]);
  selRef.current = sel?.id || null;
  const grupoDe = (id) => grupos.find((x) => x.l.some((g) => g.id === id));
  const siguienteDe = (id) => { const gr = grupoDe(id); if (!gr) return null; const i = gr.l.findIndex((g) => g.id === id); return (gr.l[i + 1] || gr.l[i - 1])?.id || null; };

  const limpiarPanel = () => { setOtro(null); setRechazo(null); setBorrar(false); };
  const resumenDe = (g) => { const gr = grupoDe(g.id); const i = gr ? gr.l.findIndex((x) => x.id === g.id) : 0; return `${g.persona}, ${fDia(g.fecha, anioHoy)}, ${fDur(minutos(g))}, ${etqDe(g)}, ${i + 1} de ${gr ? gr.l.length : 1}`; };
  const elegir = (id, foco) => { setSelId(id); limpiarPanel(); enfocar(foco || "#gu-tit"); const g = visibles.find((x) => x.id === id); if (g) anunciar(resumenDe(g)); };
  const verPanel = () => requestAnimationFrame(() => { if (window.matchMedia("(max-width: 1000px)").matches) document.querySelector(".gu-panel-w")?.scrollIntoView({ block: "start" }); });
  const mover = (paso) => {
    const i = visibles.findIndex((g) => g.id === sel?.id); const j = i + paso;
    if (j < 0 || j >= visibles.length) { anunciar(paso > 0 ? "Es la última de la lista" : "Es la primera de la lista"); return; }
    const enLista = document.activeElement?.closest?.(".gu-lista");
    elegir(visibles[j].id, enLista ? `#gu-it-${visibles[j].id}` : "#gu-tit");
    requestAnimationFrame(() => document.getElementById(`gu-it-${visibles[j].id}`)?.scrollIntoView({ block: "nearest" }));
  };
  const cambiarQ = (nq) => { setQ(nq); setFiltro(null); setSelId(undefined); limpiarPanel(); anunciar(qTxt(nq)); };

  // ?id=… (enlace del correo) → abre esa guardia en su trimestre.
  const deep = useRef(false);
  useEffect(() => {
    if (deep.current || !lista) return;
    deep.current = true;
    let id = null; try { id = new URLSearchParams(window.location.search).get("id"); } catch {}
    const g = id && lista.find((x) => x.id === id);
    if (!g) return;
    setQ(qDeFecha(g.fecha)); setSelId(id); setCorreoId(id); enfocar("#gu-tit"); verPanel();
  }, [lista]);

  // ── Resoluciones: esperan 5 s (con Deshacer) y luego se mandan ──
  const enviar = useCallback(async (item) => {
    delete timers.current[item.k];
    setEnvios((l) => l.map((e) => (e.k === item.k ? { ...e, mandando: true } : e)));
    ocupar(item.id, true);
    const body = { id: item.id, resueltoPor, ...(item.tipo === "aprobar" ? { estado: "aprobada", importe: item.importe } : { estado: "rechazada", motivo: item.motivo }) };
    try {
      const d = await post("resolver", body);
      patch(d?.guardia);
      const err = errorAviso(d);
      if (err) {
        setAvisos((a) => ({ ...a, [item.id]: `El correo a ${pila(item.persona)} no salió (${err}). La guardia está ${item.tipo === "aprobar" ? "aprobada" : "rechazada"}; avísale tú.` }));
        mensaje(`${item.tipo === "aprobar" ? "Aprobada" : "Rechazada"}, pero el correo a ${pila(item.persona)} no salió: avísale tú`, { error: true });
      } else mensaje(`Correo enviado a ${pila(item.persona)}`);
    } catch (e) {
      const m = String(e.message || e);
      if (/ya estaba resuelta/i.test(m)) {
        setAvisos((a) => ({ ...a, [item.id]: `Otro coordinador la resolvió mientras la mirabas: ${m.replace(/^Esta guardia /, "")} Desde aquí no se ha enviado nada.` }));
        mensaje(`La de ${pila(item.persona)} ya la había resuelto otro coordinador`, { error: true });
        reload(true);
      } else {
        setAvisos((a) => ({ ...a, [item.id]: `No se pudo guardar (${m}). Comprueba si se guardó igualmente antes de repetirla.` }));
        mensaje(`No se pudo guardar la de ${pila(item.persona)}: revísala`, { error: true });
        reload(true);
      }
    } finally {
      setEnvios((l) => l.filter((x) => x.k !== item.k));
      ocupar(item.id, false);
    }
  }, [post, patch, resueltoPor, mensaje, reload]);
  const resolver = (tipo) => {
    if (!sel || sel.estado !== "pendiente" || ocupados.has(sel.id)) return;
    const importe = prep[sel.id];
    const motivo = (rechazo?.motivo || "").trim();
    if (tipo === "aprobar" ? !importe : !motivo) return;
    const item = { k: ++kRef.current, id: sel.id, tipo, importe, motivo, persona: sel.persona, q: qDeFecha(sel.fecha), fin: Date.now() + ESPERA };
    timers.current[item.k] = setTimeout(() => enviar(item), ESPERA);
    setEnvios((l) => [...l, item]);
    setAvisos((a) => { const n = { ...a }; delete n[sel.id]; return n; });
    const sig = siguienteDe(sel.id);
    setSelId(sig); limpiarPanel(); enfocar(sig ? ".gu-imp, #gu-tit" : "#gu-tit"); verPanel();
    anunciar(`${tipo === "aprobar" ? `Aprobada ${eur.format(importe)} a` : "Rechazada la guardia de"} ${sel.persona}. Tienes 5 segundos para deshacer.`);
  };
  const deshacer = useCallback((k) => {
    const e = k ? enviosRef.current.find((x) => x.k === k) : [...enviosRef.current].reverse().find((x) => !x.mandando);
    if (!e || e.mandando) return;
    clearTimeout(timers.current[e.k]); delete timers.current[e.k];
    setEnvios((l) => l.filter((x) => x.k !== e.k));
    setQ(e.q); setFiltro(null); setSelId(e.id); setOtro(null); setBorrar(false);
    if (e.tipo === "aprobar") { setPrep((p) => ({ ...p, [e.id]: e.importe })); setRechazo(null); enfocar('[data-accion="aprobar"]'); }
    else { setRechazo({ motivo: e.motivo }); enfocar("#gu-motivo"); }
    verPanel();
    mensaje(`${e.tipo === "aprobar" ? "Aprobación deshecha" : "Rechazo deshecho"}; no se ha enviado ningún correo`);
  }, [mensaje]);
  useEffect(() => {
    if (!envios.length) return;
    const t = setInterval(() => setTic((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [envios.length]);
  // Si la persona se va con resoluciones esperando, salen igualmente.
  useEffect(() => {
    const salir = () => enviosRef.current.filter((e) => !e.mandando).forEach((e) => {
      clearTimeout(timers.current[e.k]); delete timers.current[e.k];
      beacon("resolver", { id: e.id, resueltoPor, ...(e.tipo === "aprobar" ? { estado: "aprobada", importe: e.importe } : { estado: "rechazada", motivo: e.motivo }) });
    });
    window.addEventListener("pagehide", salir);
    return () => { window.removeEventListener("pagehide", salir); salir(); };
  }, [beacon, resueltoPor]);

  // ── MyNFQ, borrar y prueba: se mandan al momento ──
  const myNfq = async (g, valor, avanzar = true) => {
    if (!g || g.prueba || g.estado !== "aprobada" || g._enviando || ocupados.has(g.id)) return;
    ocupar(g.id, true);
    try {
      const d = await post("marcarMyNfq", { id: g.id, valor });
      patch(d?.guardia || { id: g.id, aprobadaMyNfq: valor });
      if (avanzar && valor && selRef.current === g.id) { const sig = siguienteDe(g.id); setSelId(sig); enfocar(sig ? '[data-accion="mynfq"], #gu-tit' : "#gu-tit"); }
      mensaje(valor ? `${pila(g.persona)} · ${eur.format(g.importe || 0)} dada de alta en MyNFQ` : "Alta en MyNFQ deshecha", valor ? { deshacer: () => { setQ(qDeFecha(g.fecha)); setSelId(g.id); myNfq({ ...g, aprobadaMyNfq: true }, false, false); } } : {});
    } catch (e) {
      mensaje(`No se pudo marcar la de ${pila(g.persona)}: ${String(e.message || e)}`, { error: true });
    } finally { ocupar(g.id, false); }
  };
  const myNfqTodas = async () => {
    const l = (grupos.find((x) => x.id === "falta") || { l: [] }).l.filter((g) => !g._enviando);
    if (!l.length) return;
    const hechas = [];
    for (let i = 0; i < l.length; i++) {
      anunciar(`Dando de alta ${i + 1} de ${l.length}`);
      ocupar(l[i].id, true);
      try { const d = await post("marcarMyNfq", { id: l[i].id, valor: true }); patch(d?.guardia || { id: l[i].id, aprobadaMyNfq: true }); hechas.push(l[i]); }
      catch (e) { mensaje(`No se pudo marcar la de ${pila(l[i].persona)}: ${String(e.message || e)}`, { error: true }); }
      finally { ocupar(l[i].id, false); }
    }
    setSelId(undefined); enfocar("#gu-tit");
    if (hechas.length) mensaje(`${hechas.length} ${hechas.length === 1 ? "guardia dada" : "guardias dadas"} de alta en MyNFQ`, { deshacer: async () => {
      for (const g of hechas) { try { const d = await post("marcarMyNfq", { id: g.id, valor: false }); patch(d?.guardia || { id: g.id, aprobadaMyNfq: false }); } catch {} }
      setFiltro("falta"); setSelId(undefined); mensaje("Vuelven a «Falta dar de alta»");
    } });
  };
  const hacerBorrar = async () => {
    const g = sel; if (!g) return;
    ocupar(g.id, true);
    try {
      await post("borrar", { id: g.id });
      const sig = siguienteDe(g.id);
      setLista((l) => (l || []).filter((x) => x.id !== g.id));
      setBorrar(false); setSelId(sig); enfocar("#gu-tit");
      mensaje(`Borrada la guardia de ${pila(g.persona)} del ${fCorta(g.fecha)}`);
    } catch (e) {
      mensaje(`No se pudo borrar: ${String(e.message || e)}`, { error: true });
    } finally { ocupar(g.id, false); }
  };
  const [creandoPrueba, setCreandoPrueba] = useState(false);
  const crearPrueba = async () => {
    document.getElementById("gu-mas-cab")?.removeAttribute("open");
    setCreandoPrueba(true);
    try {
      const ahora = new Date(); const fin = new Date(ahora.getTime() + 60 * 60 * 1000);
      const hhmm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      const d = await post("crear", {
        persona: resueltoPor, email: yo?.email || email, fecha: hoyISO(), horaEntrada: hhmm(ahora), horaSalida: hhmm(fin),
        descripcion: `Guardia de prueba generada por ${resueltoPor} desde Guardias del equipo para comprobar los avisos.`, prueba: true,
      });
      if (d?.guardia) { setLista((l) => [d.guardia, ...(l || [])]); setFiltro(null); setSelId(d.guardia.id); enfocar("#gu-tit"); verPanel(); }
      const err = errorAviso(d);
      mensaje(err ? `Prueba creada, pero el correo a coordinación no salió (${err})` : "Guardia de prueba creada: te llega el aviso como a coordinación", { error: !!err });
    } catch (e) {
      mensaje(`No se pudo crear la prueba: ${String(e.message || e)}`, { error: true });
    } finally { setCreandoPrueba(false); }
  };

  const preparar = (v) => {
    if (!sel || sel.estado !== "pendiente" || rechazo || ocupados.has(sel.id)) return;
    setPrep((p) => ({ ...p, [sel.id]: v })); setOtro(null);
    enfocar('[data-accion="aprobar"]');
    anunciar(`${eur.format(v)} preparados para ${sel.persona}. Pulsa Aprobar para confirmar.`);
  };
  const usarOtro = () => {
    const raw = String(otro?.valor || "").trim().replace(/[\s€.]/g, "");
    const v = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!(v >= 1 && v <= IMPORTE_MAX)) { setOtro((o) => ({ ...o, error: raw ? `Escribe un importe entero entre 1 y ${IMPORTE_MAX === 1000 ? "1.000" : IMPORTE_MAX} €.` : "Escribe el importe." })); enfocar("#gu-otro"); return; }
    preparar(v);
  };
  const abrirOtro = () => { if (!sel || sel.estado !== "pendiente" || ocupados.has(sel.id)) return; const p = prep[sel.id]; setOtro({ valor: p && !IMPORTES.includes(p) ? String(p) : "", error: "" }); enfocar("#gu-otro"); };
  const abrirRechazo = () => { if (!sel || sel.estado !== "pendiente" || ocupados.has(sel.id)) return; setRechazo({ motivo: "" }); setOtro(null); enfocar("#gu-motivo"); };
  const cambiarAtajos = () => { const v = !atajos; setAtajos(v); try { localStorage.setItem("guardias_atajos", v ? "si" : "no"); } catch {} anunciar(v ? "Atajos de teclado activados" : "Atajos de teclado desactivados"); };

  // Atajos de teclado
  useEffect(() => {
    const f = (e) => {
      if (e.key === "Escape") {
        const abierto = document.querySelector(".gu details[open]");
        if (abierto) { abierto.removeAttribute("open"); abierto.querySelector("summary")?.focus(); return; }
        if (borrar) { setBorrar(false); enfocar("#gu-tit"); setTic((x) => x + 1); return; }
        if (rechazo) { setRechazo(null); enfocar('[data-accion="rechazar"]'); return; }
        if (otro) { setOtro(null); enfocar('[data-accion="otro"]'); return; }
        return;
      }
      if (e.target.id === "gu-otro" && e.key === "Enter") { e.preventDefault(); usarOtro(); return; }
      if (e.target.id === "gu-motivo" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); resolver("rechazar"); return; }
      const menu = e.target.closest?.(".gu-menu");
      if (menu && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); const bs = [...menu.querySelectorAll("button")]; const i = bs.indexOf(e.target); bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus(); return; }
      if (!atajos || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (borrar || document.querySelector(".gu details[open]")) return; // con un diálogo o menú abierto no hay atajos
      const k = e.key.toLowerCase();
      const enLista = e.target.closest?.(".gu-lista");
      if (k === "j" || (e.key === "ArrowDown" && enLista)) { e.preventDefault(); mover(1); return; }
      if (k === "k" || (e.key === "ArrowUp" && enLista)) { e.preventDefault(); mover(-1); return; }
      if (k === "z") { e.preventDefault(); deshacer(); return; }
      if (rechazo || !sel) return;
      if (["1", "2", "3", "4"].includes(k)) { e.preventDefault(); preparar(IMPORTES[Number(k) - 1]); return; }
      if (k === "o" && sel.estado === "pendiente") { e.preventDefault(); abrirOtro(); return; }
      if (k === "a") { e.preventDefault(); resolver("aprobar"); return; }
      if (k === "r" && sel.estado === "pendiente") { e.preventDefault(); abrirRechazo(); return; }
      if (k === "m" && tipoDe(sel) === "falta") { e.preventDefault(); myNfq(sel, true); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  // Menús: se cierran al pulsar fuera y llevan el foco a su primera opción al abrirse.
  useEffect(() => {
    const fuera = (e) => document.querySelectorAll(".gu details[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); });
    const abre = (e) => { if (e.target.matches?.(".gu-mas") && e.target.open) e.target.querySelector(".gu-menu button")?.focus(); };
    document.addEventListener("click", fuera); document.addEventListener("toggle", abre, true);
    return () => { document.removeEventListener("click", fuera); document.removeEventListener("toggle", abre, true); };
  }, []);

  // ── Pintado ──
  const anios = useMemo(() => [...new Set([...(lista || []).map((g) => String(g.fecha || "").slice(0, 4)).filter((a) => /^\d{4}$/.test(a)), anioHoy])].sort(), [lista, anioHoy]);
  const anio = q.slice(0, 4);
  const elegirAnio = (a) => {
    const n = [4, 3, 2, 1].map((x) => `${a}Q${x}`).find((x) => { const c = cuenta(x); return c.pend || c.falta; }) || (a === anioHoy ? curQ() : `${a}Q4`);
    cambiarQ(n);
  };
  const otrosQ = useMemo(() => {
    const qs = [...new Set(vista.filter((g) => !g.prueba && (g.estado === "pendiente" || esFalta(g))).map((g) => qDeFecha(g.fecha)))].filter((x) => x && x !== q);
    return qs.sort().reverse();
  }, [vista, q]);
  const enQ = vista.filter((g) => !g.prueba && qDeFecha(g.fecha) === q && coincide(g));
  const kPend = enQ.filter((g) => g.estado === "pendiente").sort(porFecha);
  const kFalta = enQ.filter(esFalta);
  const kApr = enQ.filter((g) => g.estado === "aprobada");
  const kRech = enQ.filter((g) => g.estado === "rechazada");
  const restante = (e) => Math.max(1, Math.ceil((e.fin - Date.now()) / 1000));
  const ultimoDeshacible = [...envios].reverse().find((e) => !e.mandando);

  const kpi = ({ id, t, v, s, aviso }) => (
    <button key={id} type="button" className={`gu-kpi${aviso ? " gu-aviso" : ""}`} aria-pressed={filtro === id} onClick={() => { setFiltro(filtro === id ? null : id); setSelId(undefined); limpiarPanel(); }}>
      <span className="gu-t">{t}</span><b>{v}</b><span className="gu-s">{s}</span>
    </button>
  );
  const mas = (id) => (
    <details className="gu-mas" id={id}>
      <summary className="v-btn v-btn-t" aria-label="Más acciones de esta guardia"><IconoBBVA nombre="configuration" size={16} />Más</summary>
      <div className="gu-menu">
        <button type="button" onClick={() => { document.getElementById(id)?.removeAttribute("open"); setBorrar(true); enfocar('[data-accion="borrar-no"]'); }}>
          <IconoBBVA nombre="delete" size={16} /><span>Borrar la guardia…<small>Quita la fila de la hoja; no avisa a nadie</small></span>
        </button>
      </div>
    </details>
  );

  const panel = () => {
    if (!sel) {
      const n = kFalta.length;
      return (
        <section className="gu-panel" aria-labelledby="gu-tit">
          <h2 id="gu-tit" tabIndex={-1}>Nada por resolver en {qTxt(q)}</h2>
          <p className="v-nota">Cuando alguien pida una guardia te llega un correo y aparece arriba de la bandeja.</p>
          {n > 0 && <button type="button" className="v-btn v-btn-p self-start" onClick={() => { setFiltro("falta"); setSelId(undefined); enfocar('[data-accion="mynfq"]'); }}><IconoBBVA nombre="checkmark" size={18} />Dar de alta en MyNFQ ({n})</button>}
        </section>
      );
    }
    const g = sel;
    const gr = grupoDe(g.id); const iGr = gr ? gr.l.findIndex((x) => x.id === g.id) : 0;
    const iv = visibles.findIndex((x) => x.id === g.id);
    const ocup = ocupados.has(g.id) || !!g._enviando;
    const pend = g.estado === "pendiente";
    const nombre = pila(g.persona);
    const p = prep[g.id];
    const otroSel = p && !IMPORTES.includes(p);
    const suyas = vista.filter((x) => !x.prueba && x.id !== g.id && x.persona === g.persona && qDeFecha(x.fecha) === qDeFecha(g.fecha));
    const m = minutos(g);
    const parecidas = vista.filter((x) => !x.prueba && x.estado === "aprobada" && x.id !== g.id && Math.abs(minutos(x) - m) <= 30).sort((a, b) => porFecha(b, a)).slice(0, 2);
    return (
      <section className="gu-panel" aria-labelledby="gu-tit">
        <div className="gu-top">
          <span className="inline-flex items-center gap-1.5">
            <button type="button" className="v-btn v-btn-t" aria-label="Guardia anterior" disabled={iv <= 0} onClick={() => mover(-1)}><IconoBBVA nombre="back" size={16} /></button>
            <button type="button" className="v-btn v-btn-t" aria-label="Guardia siguiente" disabled={iv >= visibles.length - 1} onClick={() => mover(1)}><span className="inline-flex rotate-180"><IconoBBVA nombre="back" size={16} /></span></button>
            {gr?.t} <b>{iGr + 1} de {gr ? gr.l.length : 1}</b>
          </span>
          <span className="inline-flex items-center gap-2">
            {pend && !g.prueba ? <span>pedida {haceDias(g.creadoEn || g.fecha, hoy)}{correoId === g.id && <> · <b>llegó por correo</b></>}</span> : <Estado g={g} />}
            {mas("gu-mas-g")}
          </span>
        </div>
        {avisos[g.id] && <p className="gu-alerta" role="alert">{avisos[g.id]}</p>}
        {g.prueba && <p className="gu-prueba"><b>Guardia de prueba.</b> El aviso y la resolución solo llegan a coordinación; no cuenta en el resumen.</p>}
        <div>
          <h2 id="gu-tit" tabIndex={-1}>{g.persona}</h2>
          <p className="gu-cuando">
            <span>{fDia(g.fecha, anioHoy)} · {g.horaEntrada} – {g.horaSalida}</span>
            <span className="gu-dur">{fDur(m)}</span>
            {cruzaMedianoche(g) && <span>termina el {fDia(masUnDia(g.fecha), anioHoy)}</span>}
          </p>
        </div>
        <p className="gu-desc">{g.descripcion || "Sin descripción."}</p>

        {pend && !g.prueba && (
          <p className="gu-contexto">
            <span>Sus guardias en {qTxt(qDeFecha(g.fecha))}: {suyas.length ? suyas.map((x, i) => <span key={x.id}>{i ? ", " : ""}{fCorta(x.fecha)} {x.estado === "pendiente" ? "(pendiente)" : x.estado === "rechazada" ? "(rechazada)" : <>(<b>{eur.format(x.importe || 0)}</b>)</>}</span>) : <b>ninguna más</b>}</span>
            <span>Pagadas por duración parecida: {parecidas.length ? parecidas.map((x, i) => <span key={x.id}>{i ? " · " : ""}<b>{eur.format(x.importe || 0)}</b> ({pila(x.persona)}, {fDur(minutos(x))})</span>) : "sin referencias"}</span>
          </p>
        )}

        {pend && !rechazo && (
          <div>
            <p className="vg-lbl mb-1.5" id="gu-imp-t">Importe</p>
            <div className="gu-imps" role="group" aria-labelledby="gu-imp-t">
              {IMPORTES.map((v, i) => (
                <button key={v} type="button" className="gu-imp" aria-pressed={p === v} disabled={ocup} aria-label={`${v} euros para ${g.persona}`} onClick={() => preparar(v)}>{v} € <Kbd>{i + 1}</Kbd></button>
              ))}
              {otro ? (
                <span className="gu-otro">
                  <label className="sr" htmlFor="gu-otro">Otro importe en euros, entero entre 1 y {IMPORTE_MAX}</label>
                  <input id="gu-otro" autoFocus className="v-inp" type="text" inputMode="numeric" autoComplete="off" placeholder="0" value={otro.valor}
                    aria-invalid={!!otro.error} aria-describedby={otro.error ? "gu-otro-err" : undefined}
                    onFocus={(e) => e.target.select()} onChange={(e) => setOtro({ valor: e.target.value, error: "" })} />
                  <span aria-hidden="true">€</span>
                  <button type="button" className="v-btn v-btn-l" onClick={usarOtro}>Usar</button>
                  <button type="button" className="v-btn v-btn-t" onClick={() => { setOtro(null); enfocar('[data-accion="otro"]'); }}>Cancelar</button>
                  {otro.error && <span className="gu-error" id="gu-otro-err">{otro.error}</span>}
                </span>
              ) : (
                <button type="button" className="gu-imp" data-accion="otro" aria-pressed={!!otroSel} disabled={ocup} style={{ fontWeight: otroSel ? 700 : 400 }} onClick={abrirOtro}>{otroSel ? eur.format(p) : "Otro…"} <Kbd>O</Kbd></button>
              )}
            </div>
          </div>
        )}

        {pend && (rechazo ? (
          <div className="gu-rechazo">
            <label className="v-campo"><span>Motivo del rechazo · va en el correo a {nombre}</span>
              <textarea id="gu-motivo" autoFocus className="v-inp" placeholder="p. ej. el pase se canceló y no hubo intervención" value={rechazo.motivo} readOnly={ocup} onChange={(e) => setRechazo({ motivo: e.target.value })} />
            </label>
            <div className="gu-imps">
              <button type="button" className="v-btn v-btn-p" disabled={!rechazo.motivo.trim() || ocup} onClick={() => resolver("rechazar")}>Rechazar la guardia de {nombre}</button>
              <button type="button" className="v-btn v-btn-t" onClick={() => { setRechazo(null); enfocar('[data-accion="rechazar"]'); }}>Cancelar <Kbd>Esc</Kbd></button>
              {!rechazo.motivo.trim() && <span className="v-nota">Escribe el motivo para poder enviarlo.</span>}
              <span className="gu-pista">Ctrl + Enter envía.</span>
            </div>
          </div>
        ) : (
          <div className="gu-decide">
            {p && <p className="gu-ancho text-[14px]">Vas a aprobar <b>{eur.format(p)}</b> a <b>{g.persona}</b> por la guardia del {fDia(g.fecha, anioHoy)} ({fDur(m)}). Le llega un correo.</p>}
            <button type="button" className="v-btn v-btn-p" data-accion="aprobar" disabled={!p || ocup} onClick={() => resolver("aprobar")}>
              <IconoBBVA nombre="checkmark" size={18} />{ocup ? "Guardando…" : p ? `Aprobar ${eur.format(p)} a ${nombre}` : "Aprobar"} <Kbd>A</Kbd>
            </button>
            <button type="button" className="v-btn v-btn-l" data-accion="rechazar" disabled={ocup} onClick={abrirRechazo}>Rechazar <Kbd>R</Kbd></button>
            {!p && !ocup && <span className="v-nota">Elige un importe para aprobar.</span>}
            <p className="gu-pista">Al aprobar pasa sola a la siguiente; tienes 5 s para deshacer antes de que salga el correo.</p>
          </div>
        ))}

        {!pend && g.prueba && (
          <>
            <p className="vg-dato">{g.estado === "rechazada" ? "Rechazada" : <>Aprobada con <b>{eur.format(g.importe || 0)}</b></>}. Es una prueba: no cuenta en ningún sitio. Bórrala cuando acabes.</p>
            <button type="button" className="v-btn v-btn-l self-start" onClick={() => { setBorrar(true); enfocar('[data-accion="borrar-no"]'); }}><IconoBBVA nombre="delete" size={16} />Borrar la prueba</button>
          </>
        )}
        {!pend && !g.prueba && g.estado === "rechazada" && (
          <p className="vg-dato">Rechazada por <b>{g.resueltoPor || "—"}</b>{g.resueltoEn && <> el {fCorta(g.resueltoEn)}</>}: «{g.motivo}»</p>
        )}
        {!pend && !g.prueba && g.estado === "aprobada" && (
          <>
            <p className="vg-dato">Aprobada con <b>{eur.format(g.importe || 0)}</b> por <b>{g.resueltoPor || "—"}</b>{g.resueltoEn && <> el {fCorta(g.resueltoEn)}</>}.{g._enviando && " El correo aún no ha salido."}</p>
            <Ciclo g={g} />
            <div className="gu-decide">
              {g.aprobadaMyNfq ? (
                <button type="button" className="v-btn v-btn-t" data-accion="mynfq-no" disabled={ocup} onClick={() => myNfq(g, false, false)}>Deshacer el alta en MyNFQ</button>
              ) : (<>
                <button type="button" className="v-btn v-btn-p" data-accion="mynfq" disabled={ocup} onClick={() => myNfq(g, true)}><IconoBBVA nombre="checkmark" size={18} />{ocupados.has(g.id) ? "Guardando…" : "Dada de alta en MyNFQ"} <Kbd>M</Kbd></button>
                <p className="gu-pista">{g._enviando ? "Podrás marcarla cuando salga el correo de aprobación." : "Márcala cuando la hayas registrado en MyNFQ; pasa sola a la siguiente."}</p>
              </>)}
            </div>
          </>
        )}

        {borrar && (
          <div className="gu-peligro" role="alertdialog" aria-labelledby="gu-b-t" aria-describedby="gu-b-d">
            <p id="gu-b-t" className="font-bold">¿Borrar la guardia de {g.persona} del {fDia(g.fecha, anioHoy)}?</p>
            <p id="gu-b-d" className="v-nota">{pend ? "Aún no está resuelta; no se avisará a nadie." : "Ya se resolvió y se avisó por correo; borrarla no avisa a nadie."} No se puede deshacer.</p>
            <div className="gu-imps">
              <button type="button" className="v-btn v-btn-p" disabled={ocupados.has(g.id)} onClick={hacerBorrar}><IconoBBVA nombre="delete" size={16} />{ocupados.has(g.id) ? "Borrando…" : "Borrar la guardia"}</button>
              <button type="button" className="v-btn v-btn-t" data-accion="borrar-no" onClick={() => { setBorrar(false); enfocar("#gu-tit"); }}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    );
  };

  const nadie = persona.trim() && !visibles.length;
  return (
    <main className={`vacu vg gu mx-auto flex w-full max-w-[1376px] flex-col gap-4 px-4 pb-10 pt-cabecera sm:px-8${atajos ? "" : " gu-kbd-off"}`}>
      <a className="v-salto" href="#gu-tit">Saltar a la guardia seleccionada</a>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-ge grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="clientok" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Guardias del equipo</h1>
        </div>
        <div className="gu-periodo" role="group" aria-label="Año y trimestre">
          <span className="gu-anio">
            <label className="sr" htmlFor="gu-anio">Año</label>
            <select id="gu-anio" className="v-inp" value={anio} onChange={(e) => elegirAnio(e.target.value)}>
              {anios.map((a) => { const t = textoCuenta(cuenta(a)); return <option key={a} value={a}>{a}{t ? " · con pendientes" : ""}</option>; })}
            </select>
            <IconoBBVA nombre="fold" size={14} />
          </span>
          <span className="gu-sep" aria-hidden="true" />
          {[1, 2, 3, 4].map((n) => {
            const qq = `${anio}Q${n}`; const c = cuenta(qq); const t = textoCuenta(c);
            return (
              <button key={qq} type="button" className="v-chip" aria-pressed={qq === q} aria-label={`Q${n}${t ? `: ${t}` : ""}`} title={t || undefined} onClick={() => cambiarQ(qq)}>
                Q{n}{c.pend ? <span className="gu-n gu-n-pend" aria-hidden="true">{c.pend}</span> : c.falta ? <span className="gu-n gu-n-falta" aria-hidden="true">{c.falta}</span> : null}
              </button>
            );
          })}
          <details className="gu-mas" id="gu-mas-cab">
            <summary className="v-chip" aria-label="Más acciones de Guardias"><IconoBBVA nombre="configuration" size={16} />Más<span className="inline-flex rotate-180"><IconoBBVA nombre="fold" size={12} /></span></summary>
            <div className="gu-menu">
              <button type="button" disabled={creandoPrueba || !lista} onClick={crearPrueba}>
                <IconoBBVA nombre="add" size={16} /><span>{creandoPrueba ? "Creando la prueba…" : "Enviar una guardia de prueba"}<small>Solo llega a coordinación; sirve para probar el correo</small></span>
              </button>
              <button type="button" onClick={() => { document.getElementById("gu-mas-cab")?.removeAttribute("open"); reload(true); anunciar("Actualizando"); }}>
                <IconoBBVA nombre="arrows" size={16} /><span>Actualizar los datos<small>Por si otro coordinador ha resuelto alguna</small></span>
              </button>
            </div>
          </details>
        </div>
      </div>

      {snap?.error && !lista ? (
        <div className="vg-secc">
          <p className="gu-alerta" role="alert">No se pudieron leer las guardias: {snap.error}</p>
          <button type="button" className="v-btn v-btn-l self-start" onClick={() => reload()}>Reintentar</button>
        </div>
      ) : !lista ? <Esqueleto /> : (<>
        {otrosQ.length > 0 && (
          <div className="gu-otrosq" role="note">
            <b>Ojo, quedan cosas en otros trimestres:</b>
            {otrosQ.map((x) => <button key={x} type="button" onClick={() => cambiarQ(x)}>{qTxt(x)}{x < q ? " (anterior)" : ""}: {textoCuenta(cuenta(x))}</button>)}
          </div>
        )}
        <div className="gu-resumen" role="group" aria-label={`Resumen de ${qTxt(q)}`}>
          {kpi({ id: "pend", t: `Por resolver en ${qTxt(q)}`, v: kPend.length, s: kPend.length ? `la más antigua, ${haceDias(kPend[0].creadoEn || kPend[0].fecha, hoy)}` : "nada pendiente", aviso: kPend.length > 0 })}
          {kpi({ id: "falta", t: `Falta MyNFQ en ${qTxt(q)}`, v: kFalta.length, s: kFalta.length ? kFalta.slice(0, 2).map((g) => `${pila(g.persona)} ${eur.format(g.importe || 0)}`).join(" · ") + (kFalta.length > 2 ? ` · +${kFalta.length - 2}` : "") : "todo dado de alta" })}
          {kpi({ id: "aprq", t: `Aprobado en ${qTxt(q)}`, v: kApr.length ? eur.format(kApr.reduce((n, g) => n + (Number(g.importe) || 0), 0)) : "—", s: kApr.length ? `${kApr.length} ${kApr.length === 1 ? "guardia" : "guardias"} · ${fDur(kApr.reduce((n, g) => n + minutos(g), 0))}` : "ninguna aprobada" })}
          {kpi({ id: "rech", t: `Rechazadas en ${qTxt(q)}`, v: kRech.length || "—", s: kRech.length ? kRech.map((g) => pila(g.persona)).join(", ") : "ninguna" })}
        </div>
        {persona.trim() && <p className="v-nota -mt-2 text-[12px]">Resumen y bandeja filtrados por «{persona.trim()}».</p>}

        <div className="gu-rejilla">
          <section className="gu-lista" aria-label={`Bandeja de guardias de ${qTxt(q)}`}>
            <label className="gu-buscar"><span className="sr">Filtrar por persona</span><IconoBBVA nombre="filter" size={16} />
              <input className="v-inp v-con-icono" placeholder="Persona…" value={persona} autoComplete="off" onChange={(e) => { setPersona(e.target.value); setSelId(undefined); }} />
            </label>
            {filtro && <p className="v-nota">Solo «{grupos[0]?.t}». <button type="button" className="v-btn v-btn-t" onClick={() => { setFiltro(null); setSelId(undefined); }}>Ver todo</button></p>}
            {nadie ? <p className="gu-vacio-l">Nadie coincide con «{persona.trim()}» en {qTxt(q)}.</p> : grupos.map((x) => (
              <div key={x.id} className="flex flex-col gap-1.5">
                <div className="gu-grupo">
                  <h3>{x.t} · {x.l.length}</h3>
                  {x.id === "falta" && x.l.length > 1 ? <button type="button" className="v-btn v-btn-l" onClick={myNfqTodas}>Todas dadas de alta ({x.l.length})</button> : x.nota ? <small>{x.nota}</small> : null}
                </div>
                {x.l.length ? x.l.map((g) => (
                  <button key={g.id} id={`gu-it-${g.id}`} type="button" className={`gu-it${ocupados.has(g.id) || g._enviando ? " gu-ocupada" : ""}`} aria-current={g.id === sel?.id}
                    onClick={() => { elegir(g.id, `#gu-it-${g.id}`); verPanel(); }}>
                    <span className="v-fila"><b>{g.persona}</b><Estado g={g} /></span>
                    <span>{fDia(g.fecha, anioHoy)} · {fDur(minutos(g))}{g.estado === "aprobada" && g.importe != null && <> · <b>{eur.format(g.importe)}</b></>}{(ocupados.has(g.id) || g._enviando) && <> · <b>{g._enviando ? "enviando…" : "guardando…"}</b></>}</span>
                  </button>
                )) : (
                  <p className="gu-vacio-l">{x.id === "pend" ? `Nada por resolver en ${qTxt(q)}.` : x.id === "falta" ? "Todas las aprobadas están dadas de alta." : x.id === "rech" ? "Ninguna rechazada." : "Ninguna."}</p>
                )}
              </div>
            ))}
          </section>
          <div className="gu-panel-w">
            {panel()}
            <p className="gu-atajos">
              {atajos ? (<>
                <span><Kbd>J</Kbd><Kbd>K</Kbd> siguiente / anterior</span><span><Kbd>1</Kbd>–<Kbd>4</Kbd> importe</span><span><Kbd>A</Kbd> aprobar</span>
                <span><Kbd>R</Kbd> rechazar</span><span><Kbd>M</Kbd> dada de alta</span><span><Kbd>Z</Kbd> deshacer</span>
              </>) : <span>Atajos de teclado desactivados.</span>}
              <button type="button" className="v-btn v-btn-t" aria-pressed={atajos} onClick={cambiarAtajos}>{atajos ? "Desactivar atajos" : "Activar atajos"}</button>
            </p>
          </div>
        </div>
      </>)}

      <div className="gu-envios">
        {envios.map((e) => (
          <div key={e.k} className="gu-envio">
            <span>{e.tipo === "aprobar" ? <>Aprobada <b>{eur.format(e.importe)}</b> a {pila(e.persona)}</> : <>Rechazada la guardia de {pila(e.persona)}</>}
              {e.mandando ? <span className="gu-cuenta"> · enviando…</span> : <span className="gu-cuenta" aria-hidden="true"> · el correo sale en {restante(e)} s</span>}</span>
            {!e.mandando && <button type="button" onClick={() => deshacer(e.k)}>Deshacer{e === ultimoDeshacible && <> <Kbd>Z</Kbd></>}</button>}
          </div>
        ))}
        {mensajes.map((m) => (
          <div key={m.k} className={`gu-envio${m.error ? " gu-envio-error" : ""}`}>
            <span>{m.texto}</span>
            {m.deshacer && <button type="button" onClick={() => { setMensajes((l) => l.filter((x) => x.k !== m.k)); m.deshacer(); }}>Deshacer</button>}
          </div>
        ))}
      </div>
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{anuncio}</div>
    </main>
  );
}
