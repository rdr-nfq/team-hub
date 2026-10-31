"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLinks } from "@/lib/links";
import IconoBBVA from "../iconosBBVA";
import { useTimeReport, useFestivos, useEquipo, EVIDENCIAS_KEY, equipoValido } from "./datos";
import { EQUIPOS, EQUIPO, equiposDe } from "@/lib/equipos";
import { useAuth } from "../chrome/AuthGate";
import {
  num, curQ, hoyISO, quincenasDeQ, quincenaDe, horasDe, esLaborable, jornada,
  repartir, capacidadMaxima, NIVELES2, NIVEL2_ANALISIS, SOPORTE_ID, MAX_DIA, etiquetaEvidencias,
} from "./model";
import { abrirResumenPdf } from "./resumenPdf";

/* Time Report del equipo · Coordinación (sección Gestión, acento Purple).
   RESUMEN: cifras del trimestre (horas, imputadas a hoy, por imputar,
     incurridas reales y capacidad) y tabla por proyecto; PDF para el cliente.
   PROYECTOS Y REPARTO: lista desplegable, un proyecto por línea (nombre,
     códigos, estados por quincena, horas repartidas y a quién, incurridas);
     se abre uno a la vez para editarlo y se guarda con «Guardar cambios».
     El reparto se revisa antes de guardarlo (quién cambia, antes → después,
     a quién avisar) y se puede deshacer. Personas bloqueadas, plegadas.
   IMPUTACIÓN: todas las personas en una quincena, editable (flechas, Enter,
     pegar desde Excel), con avisos de jornada y fines de semana.
   EVIDENCIAS: quién falta por subir su PDF, ZIP con todas y carpeta de Drive.
   Un Time Report POR EQUIPO: el selector de arriba cambia de «mundo». */

const CLAVE_EQUIPO_TR = "rdr_tr_equipo";

const qsSelector = (extra) => {
  const año = new Date().getFullYear();
  const set = new Set(extra || []);
  [año - 1, año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) set.add(`${a}Q${i}`); });
  return [...set].sort();
};
const DIA_SEMANA = ["D", "L", "M", "X", "J", "V", "S"];
const diaSemana = (iso) => { const [a, m, d] = iso.split("-").map(Number); return DIA_SEMANA[new Date(a, m - 1, d).getDay()]; };
const LETRA = { [NIVEL2_ANALISIS]: "A", Codificación: "C", Pruebas: "P" };
const NOMBRE_EST = { [NIVEL2_ANALISIS]: "Análisis y diseño", Codificación: "Codificación", Pruebas: "Pruebas" };
const corto = (n) => { const t = String(n).split(" ").filter(Boolean); return t.length >= 3 ? `${t[0]} ${t[1]}` : t[0] || n; };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";
const CHIP = `rounded-full border-[1.5px] px-3 py-[7px] text-[13px] font-bold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`;
const CHIP_OFF = "border-sand/30 bg-midnight text-sand hover:border-sand";
const BTN = `inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border-[1.5px] px-4 py-2.5 text-sm font-bold transition hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 ${FOCO}`;
const BTN_PRIM = `${BTN} hub-placa hub-ge border-transparent`;
const BTN_ATEN = `${BTN} hub-placa hub-eq border-transparent`;
const BTN_SEC = `${BTN} border-white/55 bg-white/[0.06] text-sand`;
const BTN_TXT = `inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-bold text-sand transition hover:bg-purple/10 ${FOCO}`;
const CAJA = "rounded-xl border border-white/15 bg-white/[0.06]";
const INP = "w-full min-w-0 rounded-lg border-[1.5px] border-white/55 bg-midnight px-2.5 py-2 text-sm text-sand placeholder:text-sand/50 focus:border-sand focus:outline-none";
const ROT = "text-xs font-bold text-sand/75";
const PC = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-[5px] text-xs font-bold transition-colors ${FOCO}`;

function Aviso({ children, className = "" }) {
  return (
    <p className={`trg-aten flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-sand ${className}`}>
      <IconoBBVA nombre="alarm" size={16} className="mt-px shrink-0" /><span>{children}</span>
    </p>
  );
}
function Desplegable({ className = "", children, ...p }) {
  return (
    <span className={`relative flex ${className}`}>
      <select {...p} className={`${INP} cursor-pointer appearance-none pr-8`}>{children}</select>
      <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
    </span>
  );
}
function Estado({ letra, hoy, nombre, quincena }) {
  return (
    <span title={quincena ? `${quincena}${hoy ? " (actual)" : ""}: ${nombre}` : nombre}
      className={`trg-est trg-est-${letra} ${hoy ? "trg-hoy" : ""} inline-grid h-5 w-5 place-items-center rounded-[5px] text-[10px] font-bold`}>{letra}</span>
  );
}

export default function GestionRoute() {
  const { showToast, getUrl } = useLinks();
  const { equipos: misEquipos } = useAuth();
  const [q, setQ] = useState(curQ());
  const [eqTR, setEqTRRaw] = useState(() => {
    try { const g = localStorage.getItem(CLAVE_EQUIPO_TR); if (g) return equipoValido(g); } catch {}
    return equipoValido((misEquipos || [])[0]);
  });
  const { snap, reload, post } = useTimeReport(q, eqTR);
  const festivos = useFestivos();
  const equipo = useEquipo();
  const [tab, setTab] = useState("resumen"); // resumen | proyectos | imputacion | evidencias
  const [estado, setEstado] = useState(""); // "" | guardando | ok | error:...
  const [verQuincenas, setVerQuincenas] = useState(false);
  const [quincenaVista, setQuincenaVista] = useState(() => Math.min(6, Math.max(1, quincenaDe(curQ(), hoyISO()) || 1)));
  const [dirtyQ, setDirtyQ] = useState(null);
  const editBackup = useRef(null);
  const [evid, setEvid] = useState({ estado: "idle", data: null, error: "" });
  const [zip, setZip] = useState("");
  // Proyectos y reparto
  const [abierto, setAbierto] = useState(null); // id | "nuevo" | null
  const [borrador, setBorrador] = useState(null);
  const borradorOrig = useRef("");
  const [guardia, setGuardia] = useState(null); // { accion } pendiente tras guardar/descartar
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [verBloq, setVerBloq] = useState(false);
  const [preview, setPreview] = useState(null);
  const [aceptoPasadas, setAceptoPasadas] = useState(false);
  const [desdeReparto, setDesdeReparto] = useState("");
  const [deshacer, setDeshacer] = useState(null); // { msg, fn }
  const focoTras = useRef(null);

  const personas = useMemo(
    () => (equipo || []).filter((m) => m.activo !== false && m.baja !== true && equiposDe(m).includes(eqTR)).map((m) => m.nombre),
    [equipo, eqTR]
  );
  const raizEvidencias = getUrl(EVIDENCIAS_KEY[eqTR]);
  const nombreEq = EQUIPO[eqTR]?.nombre || "RDR";
  const qs = quincenasDeQ(q);
  const hoy = hoyISO();
  const hoyQ = quincenaDe(q, hoy); // 0 = Q futuro, 7 = Q ya terminado
  const qActualN = Math.min(6, Math.max(1, hoyQ || 1));
  const prefijoFeature = eqTR === "rdr" ? "CIBRDR-" : "";

  /* Estado LOCAL (optimista): los cambios se pintan al instante y el guardado
     va en segundo plano; solo se resincroniza al cambiar de Q/equipo o si un
     guardado falla. */
  const [proyectos, setProyectos] = useState(null);
  const [reparto, setReparto] = useState([]);
  const [bloqueadas, setBloqueadas] = useState(() => new Set());
  const seeded = useRef(null);
  useEffect(() => {
    if (!snap?.data) return;
    const key = q + "|" + eqTR + "|" + (snap.data.generadoEn || "");
    if (seeded.current === key) return;
    seeded.current = key;
    setProyectos(snap.data.proyectos || []);
    setReparto(snap.data.reparto || []);
    setBloqueadas(new Set(snap.data.bloqueadas || []));
    setDirtyQ(null);
    editBackup.current = null;
  }, [snap, q, eqTR]);

  const cerrarEditor = useCallback(() => {
    setAbierto(null); setBorrador(null); borradorOrig.current = ""; setGuardia(null); setConfirmarBorrado(false);
  }, []);
  const sucio = borrador != null && JSON.stringify(borrador) !== borradorOrig.current;
  /* Cambios sin guardar en el proyecto abierto: se pregunta antes de perderlos. */
  const conGuardia = (accion) => {
    if (sucio) { setGuardia({ accion }); focoTras.current = "trg-seguir"; return; }
    accion();
  };

  const cambiaEquipoTR = (id) => {
    if (id === eqTR) return;
    conGuardia(() => {
      try { localStorage.setItem(CLAVE_EQUIPO_TR, id); } catch {}
      cerrarEditor(); setPreview(null); setProyectos(null); setReparto([]); setBloqueadas(new Set());
      setEvid({ estado: "idle", data: null, error: "" }); setVerBloq(false);
      seeded.current = null;
      setEqTRRaw(id);
    });
  };
  const cambiaTab = (t) => conGuardia(() => { cerrarEditor(); setTab(t); });

  const cargando = !snap || festivos == null || equipo == null || proyectos == null;

  /* Resumen por proyecto: imputadas = reparto con día <= hoy; incurridas =
     horas reales tecleadas; sinRepartir = horas − plan; desglose por quincena;
     a quién se ha repartido (horas por persona en el trimestre). */
  const resumen = useMemo(() => (proyectos || []).map((p) => {
    const filas = reparto.filter((r) => r.proyectoId === p.id);
    let imputadas = 0, plan = 0;
    const porQ = [0, 0, 0, 0, 0, 0];
    const porPer = {};
    filas.forEach((r) => {
      Object.entries(r.dias || {}).forEach(([d, h]) => { plan += num(h); if (d <= hoy) imputadas += num(h); });
      const h = horasDe(r.dias);
      if (r.quincena >= 1 && r.quincena <= 6) porQ[r.quincena - 1] += h;
      porPer[r.persona] = (porPer[r.persona] || 0) + h;
    });
    const incurridas = Math.max(0, num(p.incurridas));
    const asignadas = Object.entries(porPer).filter(([, h]) => h > 0).map(([per, h]) => ({ per, h })).sort((a, b) => b.h - a.h);
    return {
      ...p, imputadas, plan, porQ, asignadas,
      pendientes: Math.max(0, num(p.horas) - imputadas),
      incurridas, porIncurrir: Math.max(0, num(p.horas) - incurridas),
      sinRepartir: Math.max(0, num(p.horas) - plan),
    };
  }), [proyectos, reparto, hoy]);

  const tot = useMemo(() => ({
    horas: resumen.reduce((a, p) => a + num(p.horas), 0),
    imputadas: resumen.reduce((a, p) => a + p.imputadas, 0),
    pendientes: resumen.reduce((a, p) => a + p.pendientes, 0),
    incurridas: resumen.reduce((a, p) => a + p.incurridas, 0),
    porIncurrir: resumen.reduce((a, p) => a + p.porIncurrir, 0),
    sinRepartir: resumen.reduce((a, p) => a + p.sinRepartir, 0),
  }), [resumen]);
  const capMax = useMemo(
    () => capacidadMaxima({ q, personas: personas.filter((p) => !bloqueadas.has(p)), festivos: festivos || {}, hoy }),
    [q, personas, bloqueadas, festivos, hoy]
  );

  /* Guardado en SEGUNDO PLANO y EN COLA (si iban a la vez, el backend podía
     leer la hoja sin el anterior y duplicar proyectos o el reparto). */
  const pendientesRef = useRef(0);
  const colaRef = useRef(Promise.resolve());
  const salva = (fn) => {
    pendientesRef.current++;
    setEstado("guardando");
    colaRef.current = colaRef.current
      .catch(() => {})
      .then(fn)
      .then(() => {
        if (--pendientesRef.current === 0) {
          setEstado("ok");
          setTimeout(() => setEstado((e) => (e === "ok" ? "" : e)), 1800);
        }
      })
      .catch((e) => {
        pendientesRef.current = Math.max(0, pendientesRef.current - 1);
        setEstado("error:" + String(e.message || e));
        seeded.current = null;
        reload();
      });
  };
  const aplicaProyectos = (next) => {
    setProyectos(next);
    salva(() => post("guardarProyectos", { q, proyectos: next }));
  };

  /* Aviso con «Deshacer» (10 s) para el reparto y los borrados. */
  const tDeshacer = useRef(null);
  const ofrecerDeshacer = (msg, fn) => {
    clearTimeout(tDeshacer.current);
    setDeshacer({ msg, fn });
    tDeshacer.current = setTimeout(() => setDeshacer(null), 10000);
  };
  useEffect(() => () => clearTimeout(tDeshacer.current), []);

  // Se puede pegar el código completo ("SDATOOL-49780" / "CIBRDR-1088").
  const limpiaSdatool = (v) => String(v || "").replace(/^\s*sdatool[\s-]*/i, "").trim();
  const limpiaFeature = (v) => (prefijoFeature ? String(v || "").replace(/^\s*cibrdr[\s-]*/i, "").trim() : String(v || "").trim());

  /* ── Editor de proyecto (uno abierto a la vez) ── */
  const abrirProyecto = (id) => {
    if (abierto === id) { conGuardia(() => { cerrarEditor(); focoTras.current = `proy-${id}`; }); return; }
    conGuardia(() => {
      cerrarEditor();
      let b;
      if (id === "nuevo") {
        const estados = {};
        for (let i = 1; i <= 6; i++) estados[i] = NIVEL2_ANALISIS;
        b = { nombre: "", sdatool: "", feature: "", horas: "", incurridas: 0, inicio: 1, fin: 0, estados, personas: [] };
      } else {
        const p = proyectos.find((x) => x.id === id);
        b = {
          nombre: p.nombre, sdatool: limpiaSdatool(p.sdatool), feature: limpiaFeature(p.feature),
          horas: num(p.horas), incurridas: num(p.incurridas), inicio: num(p.inicio) || 1, fin: num(p.fin) || 0,
          estados: { ...(p.estados || {}) }, personas: [...(p.personas || [])],
        };
      }
      borradorOrig.current = JSON.stringify(b);
      setBorrador(b); setAbierto(id);
      focoTras.current = "trg-nombre";
    });
  };
  const valido = borrador && borrador.nombre.trim() && String(borrador.sdatool).trim() && num(borrador.horas) > 0;
  const guardaProyecto = () => {
    const b = borrador;
    const datos = {
      nombre: b.nombre.trim(),
      sdatool: "SDATOOL-" + limpiaSdatool(b.sdatool),
      feature: String(b.feature).trim() ? prefijoFeature + limpiaFeature(b.feature) : "",
      horas: Math.round(num(b.horas)),
      incurridas: Math.max(0, Math.round(num(b.incurridas))),
      inicio: Math.round(num(b.inicio)) || 1,
      fin: Math.round(num(b.fin)),
      estados: b.estados,
      personas: b.personas.filter((n) => !bloqueadas.has(n)),
    };
    let id = abierto;
    if (abierto === "nuevo") {
      id = "p" + Date.now();
      aplicaProyectos([...proyectos, { id, ...datos }]);
      showToast(`«${datos.nombre}» añadido: calcula el reparto para darle horas`);
    } else {
      aplicaProyectos(proyectos.map((p) => (p.id === abierto ? { ...p, ...datos } : p)));
    }
    cerrarEditor();
    focoTras.current = `proy-${id}`;
  };
  const borraProyecto = () => {
    const antes = proyectos;
    const p = proyectos.find((x) => x.id === abierto);
    aplicaProyectos(proyectos.filter((x) => x.id !== abierto));
    cerrarEditor();
    focoTras.current = "trg-nuevo";
    ofrecerDeshacer(`«${p?.nombre}» eliminado`, () => { aplicaProyectos(antes); showToast(`«${p?.nombre}» recuperado`); });
  };
  const resolverGuardia = (guardar) => {
    const accion = guardia?.accion;
    if (guardar) guardaProyecto(); else cerrarEditor();
    if (accion) accion();
  };

  // Escape cierra el proyecto abierto (o el aviso de cambios sin guardar).
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.target.closest?.("select")) return;
      if (guardia) { setGuardia(null); focoTras.current = "trg-nombre"; return; }
      const id = abierto;
      conGuardia(() => { cerrarEditor(); focoTras.current = id === "nuevo" ? "trg-nuevo" : `proy-${id}`; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // Foco tras pintar (abrir, cerrar, guardar…): nunca se pierde en <body>.
  useEffect(() => {
    const id = focoTras.current;
    if (!id) return;
    focoTras.current = null;
    const el = document.getElementById(id);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest" }); }
  });

  const toggleBloqueo = (nombre) => {
    const next = new Set(bloqueadas);
    if (next.has(nombre)) next.delete(nombre); else next.add(nombre);
    setBloqueadas(next);
    setPreview(null);
    if (borrador) setBorrador({ ...borrador, personas: borrador.personas.filter((n) => !next.has(n)) });
    salva(() => post("guardarBloqueadas", { q, personas: [...next] }));
  };

  /* ── Reparto: se calcula, se revisa (antes → después) y se guarda ── */
  const calcularReparto = ({ desdeMin, desde } = {}) => {
    const r = repartir({ q, proyectos, repartoActual: reparto, personas, bloqueadas: [...bloqueadas], festivos: festivos || {}, hoy, desdeMin, desde });
    setPreview(r);
    setAceptoPasadas(false);
    focoTras.current = "trg-revision";
  };
  const revision = useMemo(() => {
    if (!preview || preview.error) return null;
    const desde = preview.desde;
    const qsR = qs.map((x) => x.n).filter((n) => n >= desde);
    const horasPQ = (lista, per, n) => lista.filter((r) => r.persona === per && r.quincena === n && r.proyectoId !== SOPORTE_ID).reduce((a, r) => a + horasDe(r.dias), 0);
    const quien = [...new Set([...reparto, ...preview.reparto].filter((r) => r.quincena >= desde).map((r) => r.persona))];
    const filas = quien.map((per) => {
      const celdas = {};
      qsR.forEach((n) => { celdas[n] = { antes: horasPQ(reparto, per, n), despues: horasPQ(preview.reparto, per, n) }; });
      return { per, celdas };
    }).filter((f) => qsR.some((n) => f.celdas[n].antes !== f.celdas[n].despues))
      .sort((a, b) => personas.indexOf(a.per) - personas.indexOf(b.per));
    const cambia = (f, n) => f.celdas[n].antes !== f.celdas[n].despues;
    const pasadas = qsR.filter((n) => hoyQ > 0 && n < hoyQ);
    return {
      qsR, filas, pasadas,
      quincenasCambian: qsR.filter((n) => filas.some((f) => cambia(f, n))).length,
      cambiosPasados: filas.reduce((a, f) => a + pasadas.filter((n) => cambia(f, n)).length, 0),
    };
  }, [preview, reparto, qs, personas, hoyQ]);

  const confirmarReparto = () => {
    const { desde } = preview;
    const antes = reparto;
    const n = revision?.filas.length || 0;
    setReparto(preview.reparto);
    salva(() => post("guardarReparto", { q, desdeQuincena: desde, filas: preview.reparto.filter((r) => r.quincena >= desde) }));
    setPreview(null);
    focoTras.current = "trg-calcular";
    ofrecerDeshacer(`Reparto guardado: cambia la imputación de ${plural(n, "persona", "personas")}`, () => {
      setReparto(antes);
      salva(() => post("guardarReparto", { q, desdeQuincena: desde, filas: antes.filter((r) => r.quincena >= desde) }));
      showToast("Reparto deshecho: vuelve el anterior");
    });
  };

  /* ── Imputación EDITABLE ── */
  const mutaReparto = (fn) => {
    if (editBackup.current == null) editBackup.current = reparto;
    setReparto((prev) => fn(prev));
    setDirtyQ(quincenaVista);
  };
  const mismaFila = (r, persona, proyectoId) => r.quincena === quincenaVista && r.persona === persona && r.proyectoId === proyectoId;
  const ponCelda = (prev, persona, proyectoId, dia, valor) => {
    const bruto = Math.round(num(String(valor).replace(",", ".")));
    const v = Math.max(0, Math.min(MAX_DIA, bruto));
    const idx = prev.findIndex((r) => mismaFila(r, persona, proyectoId));
    if (idx < 0) return v > 0 ? [...prev, { quincena: quincenaVista, persona, proyectoId, dias: { [dia]: v } }] : prev;
    const next = [...prev];
    const dias = { ...next[idx].dias };
    if (v > 0) dias[dia] = v; else delete dias[dia];
    next[idx] = { ...next[idx], dias };
    return next;
  };
  const editaCelda = (persona, proyectoId, dia, valor) => {
    if (Math.round(num(valor)) > MAX_DIA) showToast(`Máximo ${MAX_DIA} h por casilla: se ha dejado en ${MAX_DIA}`);
    mutaReparto((prev) => ponCelda(prev, persona, proyectoId, dia, valor));
  };
  const anadeFila = (persona, proyectoId) =>
    mutaReparto((prev) => (prev.some((r) => mismaFila(r, persona, proyectoId)) ? prev : [...prev, { quincena: quincenaVista, persona, proyectoId, dias: {} }]));
  const quitaFila = (persona, proyectoId) => mutaReparto((prev) => prev.filter((r) => !mismaFila(r, persona, proyectoId)));
  const descartaQuincena = () => {
    if (editBackup.current) setReparto(editBackup.current);
    editBackup.current = null;
    setDirtyQ(null);
  };
  const guardaQuincena = () => {
    const n = dirtyQ;
    const limpio = reparto.filter((r) => r.quincena !== n || horasDe(r.dias) > 0);
    setReparto(limpio);
    salva(() => post("guardarReparto", { q, desdeQuincena: n, filas: limpio.filter((r) => r.quincena >= n) }));
    editBackup.current = null;
    setDirtyQ(null);
    showToast(`Quincena ${qs[n - 1]?.label} guardada`);
  };
  const irACelda = (r, c) => {
    const el = document.querySelector(`.trg-celda[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); el.select(); }
  };
  const teclaCelda = (e) => {
    const el = e.target.closest?.(".trg-celda");
    if (!el) return;
    const mov = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Enter: [e.shiftKey ? -1 : 1, 0] }[e.key];
    if (!mov) return;
    e.preventDefault();
    irACelda(Number(el.dataset.r) + mov[0], Number(el.dataset.c) + mov[1]);
  };
  // Pegar un bloque copiado de Excel: rellena hacia la derecha y hacia abajo.
  const pegaCeldas = (e) => {
    const el = e.target.closest?.(".trg-celda");
    if (!el) return;
    const txt = e.clipboardData?.getData("text") || "";
    if (!/[\t\n]/.test(txt.trim())) return;
    e.preventDefault();
    const r0 = Number(el.dataset.r), c0 = Number(el.dataset.c);
    const filas = txt.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const cambios = [];
    let pasa = false;
    filas.forEach((fila, i) => fila.forEach((v, j) => {
      const t = document.querySelector(`.trg-celda[data-r="${r0 + i}"][data-c="${c0 + j}"]`);
      if (!t) return;
      if (Math.round(num(v.trim().replace(",", "."))) > MAX_DIA) pasa = true;
      cambios.push([t.dataset.per, t.dataset.proy, t.dataset.dia, v.trim()]);
    }));
    if (!cambios.length) return;
    mutaReparto((prev) => cambios.reduce((acc, [per, proy, dia, v]) => ponCelda(acc, per, proy, dia, v), prev));
    showToast(`Pegadas ${cambios.length} casillas${pasa ? ` (las de más de ${MAX_DIA} h se dejan en ${MAX_DIA})` : ""}`);
  };

  /* ── Evidencias: estado de la carpeta de la quincena vista ── */
  useEffect(() => {
    if (tab !== "evidencias" || !snap?.data) return;
    let vivo = true;
    setEvid({ estado: "cargando", data: null, error: "" });
    post("estadoEvidencias", { q, quincena: quincenaVista, raiz: raizEvidencias })
      .then((d) => vivo && setEvid({ estado: "ok", data: d, error: "" }))
      .catch((e) => vivo && setEvid({ estado: "error", data: null, error: String(e.message || e) }));
    return () => { vivo = false; };
  }, [tab, q, quincenaVista, snap, post, raizEvidencias]);
  const recargaEvidencias = () => {
    setEvid({ estado: "cargando", data: null, error: "" });
    post("estadoEvidencias", { q, quincena: quincenaVista, raiz: raizEvidencias })
      .then((d) => setEvid({ estado: "ok", data: d, error: "" }))
      .catch((e) => setEvid({ estado: "error", data: null, error: String(e.message || e) }));
  };
  const descargarZip = () => {
    const w = window.open("", "_blank"); // abrir YA para que no lo bloquee el navegador
    setZip("generando");
    post("descargarEvidencias", { q, quincena: quincenaVista, raiz: raizEvidencias })
      .then((d) => {
        if (w) w.location = d.url;
        setZip("");
        showToast(`ZIP con ${plural(d.n, "evidencia", "evidencias")} generado`);
        recargaEvidencias();
      })
      .catch((e) => {
        if (w) w.close();
        setZip("");
        showToast("No se pudo generar el ZIP: " + String(e.message || e));
      });
  };
  const copiarFaltan = async (nombres) => {
    try { await navigator.clipboard.writeText(nombres.join(", ")); showToast("Nombres copiados: pégalos en el recordatorio"); }
    catch { showToast("No se pudo copiar al portapapeles"); }
  };

  const descargarPdf = () => {
    const ok = abrirResumenPdf({ q, resumen, qs, qActualN, hoy, personas: personas.length, equipo: EQUIPO[eqTR] });
    showToast(ok ? "Resumen abierto: elige «Guardar como PDF» en el diálogo de imprimir" : "El navegador bloqueó la ventana del PDF");
  };

  const nombreProy = (id) => (id === SOPORTE_ID ? "Soporte usuarios" : proyectos?.find((p) => p.id === id)?.nombre || id);

  const chipsQuincena = (bloqueado) => (
    <div role="group" aria-label="Quincena" className="flex flex-wrap gap-1.5">
      {qs.map((x) => (
        <button
          key={x.n} type="button" aria-pressed={quincenaVista === x.n} disabled={bloqueado && quincenaVista !== x.n}
          onClick={() => setQuincenaVista(x.n)}
          title={bloqueado && quincenaVista !== x.n ? "Guarda o descarta los cambios de la quincena antes de cambiar" : undefined}
          className={`${CHIP} ${quincenaVista === x.n ? "hub-etiqueta hub-ge border-transparent" : CHIP_OFF}`}
        >
          {x.label}{x.n === qActualN && hoyQ >= 1 && hoyQ <= 6 ? " · hoy" : ""}
        </button>
      ))}
    </div>
  );

  /* ──────────────── Secciones ──────────────── */

  const seccionResumen = () => {
    if (!resumen.length) return <Vacio titulo={`No hay proyectos en ${q}`}>Añádelos en «Proyectos y reparto».</Vacio>;
    const kpis = [
      ["Horas de proyectos", `${tot.horas} h`, `${plural(resumen.length, "proyecto", "proyectos")} en ${q}`],
      ["Imputadas a hoy", `${tot.imputadas} h`, "lo que ya debería estar en el TR"],
      ["Por imputar", `${tot.pendientes} h`, "hasta fin de trimestre"],
      ["Incurridas (reales)", `${tot.incurridas} h`, "se anotan en cada proyecto"],
      ["Capacidad máx. restante", `${capMax} h`, capMax >= tot.pendientes ? "cubre lo pendiente" : "no cubre lo pendiente", capMax < tot.pendientes],
    ];
    return (
      <>
        <section aria-label="Cifras del trimestre" className="tr-resumen hub-ge grid grid-cols-2 gap-x-7 gap-y-4 rounded-xl px-5 py-5 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map(([l, v, sub, mal]) => (
            <div key={l}>
              <p className="text-[13px] text-sand/75">{l}</p>
              <p className="text-[26px] font-bold leading-tight tabular-nums text-sand">{v}</p>
              <p className={`text-xs ${mal ? "hub-etiqueta hub-eq inline-block rounded-full px-2 font-bold" : "text-sand/75"}`}>{sub}</p>
            </div>
          ))}
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={descargarPdf} className={BTN_SEC}><IconoBBVA nombre="document" size={18} />Descargar resumen (PDF)</button>
          <button type="button" onClick={() => setVerQuincenas((v) => !v)} aria-pressed={verQuincenas} className={BTN_SEC}>
            {verQuincenas ? "Ocultar quincenas" : "Ver por quincena"}
          </button>
          <span className="text-[13px] text-sand/75">El PDF va en formato BBVA y sin horas incurridas.</span>
        </div>
        <div className={`${CAJA} overflow-x-auto px-3.5 py-1`}>
          <table className="w-full min-w-[760px] border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-right text-xs font-bold text-sand/75">
                <th className="px-1.5 py-2.5 text-left">Proyecto</th>
                <th className="px-1.5 py-2.5">Horas</th><th className="px-1.5 py-2.5">Imputadas</th><th className="px-1.5 py-2.5">Por imputar</th>
                <th className="px-1.5 py-2.5">Incurridas</th><th className="px-1.5 py-2.5">Por incurrir</th>
                {verQuincenas && qs.map((x) => <th key={x.n} className="px-1.5 py-2.5">{x.label}{x.n === qActualN ? " · hoy" : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {resumen.map((p) => (
                <tr key={p.id} className="border-t border-white/15 text-right text-sand">
                  <td className="px-1.5 py-2.5 text-left">
                    <b className="block">{p.nombre}</b>
                    <span className="block text-xs text-sand/75">
                      {p.sdatool}{p.feature ? ` · ${p.feature}` : ""}
                      {p.sinRepartir > 0 && <> · <span className="hub-etiqueta hub-eq rounded-full px-1.5 font-bold">{p.sinRepartir} h sin repartir</span></>}
                    </span>
                  </td>
                  <td className="px-1.5 py-2.5">{num(p.horas)}</td>
                  <td className="px-1.5 py-2.5">{p.imputadas}</td>
                  <td className="px-1.5 py-2.5 font-bold">{p.pendientes}</td>
                  <td className="px-1.5 py-2.5">{p.incurridas}</td>
                  <td className="px-1.5 py-2.5 font-bold">{p.porIncurrir}</td>
                  {verQuincenas && p.porQ.map((h, i) => <td key={i} className={`px-1.5 py-2.5 ${i + 1 === qActualN ? "font-bold" : "text-sand/75"}`}>{h || ""}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[1.5px] border-white/40 text-right font-bold text-sand">
                <td className="px-1.5 py-2.5 text-left">Total</td>
                <td className="px-1.5 py-2.5">{tot.horas}</td><td className="px-1.5 py-2.5">{tot.imputadas}</td><td className="px-1.5 py-2.5">{tot.pendientes}</td>
                <td className="px-1.5 py-2.5">{tot.incurridas}</td><td className="px-1.5 py-2.5">{tot.porIncurrir}</td>
                {verQuincenas && <td colSpan={6} />}
              </tr>
            </tfoot>
          </table>
        </div>
      </>
    );
  };

  const editor = (p) => {
    const b = borrador;
    const nuevo = abierto === "nuevo";
    const ponB = (campo, v) => setBorrador({ ...b, [campo]: v });
    const finAntes = num(b.fin) > 0 && num(b.fin) < num(b.inicio);
    const elegidas = b.personas.filter((n) => !bloqueadas.has(n));
    const hayBloq = personas.some((n) => bloqueadas.has(n));
    return (
      <div className="grid gap-x-6 gap-y-5 border-t border-white/15 p-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-sand">Datos del proyecto</h3>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="col-span-2 grid gap-1"><span className={ROT}>Nombre *</span>
              <input id="trg-nombre" className={INP} value={b.nombre} placeholder="Nombre del proyecto" onChange={(e) => ponB("nombre", e.target.value)} />
            </label>
            <label className="grid gap-1"><span className={ROT}>SDATOOL *</span>
              <span className="flex items-center rounded-lg border-[1.5px] border-white/55 bg-midnight pl-2.5 focus-within:border-sand">
                <span className="text-sm text-sand/70">SDATOOL-</span>
                <input className="w-full min-w-0 bg-transparent py-2 pr-2.5 text-sm text-sand placeholder:text-sand/50 focus:outline-none" value={b.sdatool} placeholder="49780"
                  aria-label="Código SDATOOL" onChange={(e) => ponB("sdatool", limpiaSdatool(e.target.value))} />
              </span>
            </label>
            <label className="grid gap-1"><span className={ROT}>Feature</span>
              <span className="flex items-center rounded-lg border-[1.5px] border-white/55 bg-midnight pl-2.5 focus-within:border-sand">
                {prefijoFeature && <span className="text-sm text-sand/70">{prefijoFeature}</span>}
                <input className="w-full min-w-0 bg-transparent py-2 pr-2.5 text-sm text-sand placeholder:text-sand/50 focus:outline-none" value={b.feature}
                  placeholder={prefijoFeature ? "1088" : "Código completo"} aria-label="Feature" onChange={(e) => ponB("feature", limpiaFeature(e.target.value))} />
              </span>
            </label>
            <label className="grid gap-1"><span className={ROT}>Horas a imputar *</span>
              <input type="number" min="1" step="1" inputMode="numeric" className={`${INP} text-right tabular-nums`} value={b.horas} onChange={(e) => ponB("horas", e.target.value)} />
            </label>
            <label className="grid gap-1"><span className={ROT}>Incurridas (reales)</span>
              <input type="number" min="0" step="1" inputMode="numeric" className={`${INP} text-right tabular-nums`} value={b.incurridas} onChange={(e) => ponB("incurridas", e.target.value)} />
            </label>
            <label className="grid gap-1"><span className={ROT}>Quincena de inicio</span>
              <Desplegable value={b.inicio} onChange={(e) => ponB("inicio", Number(e.target.value))}>
                {qs.map((x) => <option key={x.n} value={x.n}>{x.label}</option>)}
              </Desplegable>
            </label>
            <label className="grid gap-1"><span className={ROT}>Quincena de fin</span>
              <Desplegable value={b.fin} onChange={(e) => ponB("fin", Number(e.target.value))}>
                <option value={0}>Automático</option>
                {qs.map((x) => <option key={x.n} value={x.n}>{x.label}</option>)}
              </Desplegable>
            </label>
            {finAntes && <Aviso className="col-span-2">El fin es anterior al inicio: no se le repartirá nada.</Aviso>}
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-sand">Estado por quincena <span className="text-xs font-normal text-sand/75">· Nivel 2</span></h3>
          <div className="grid grid-cols-2 gap-2.5">
            {qs.map((x) => {
              const v = (b.estados || {})[x.n] || NIVEL2_ANALISIS;
              return (
                <label key={x.n} className="grid gap-1">
                  <span className={ROT}>{x.label}{x.n === qActualN && hoyQ >= 1 && hoyQ <= 6 ? " · actual" : ""}</span>
                  <span className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2">
                    <Estado letra={LETRA[v] || "A"} nombre={NOMBRE_EST[v] || v} quincena={x.label} />
                    <Desplegable value={v} onChange={(e) => setBorrador({ ...b, estados: { ...b.estados, [x.n]: e.target.value } })}>
                      {NIVELES2.map((n2) => <option key={n2} value={n2}>{NOMBRE_EST[n2] || n2}</option>)}
                    </Desplegable>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        {!nuevo && (
          <div className="md:col-span-2">
            <h3 className="mb-2 text-sm font-bold text-sand">Repartido a <span className="text-xs font-normal text-sand/75">· según el último reparto, en todo el trimestre</span></h3>
            {p.asignadas.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {p.asignadas.map((x) => (
                  <li key={x.per} className="hub-sel hub-ge rounded-lg border border-white/15 px-2.5 py-1 text-[13px] text-sand">{x.per} <b className="tabular-nums">{x.h} h</b></li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-sand/75">Aún no se le ha repartido nada: pulsa «Calcular reparto».</p>}
          </div>
        )}
        <div className="md:col-span-2">
          <h3 className="mb-2 text-sm font-bold text-sand">
            Repartir entre{" "}
            <span className="text-xs font-normal text-sand/75">
              · {elegidas.length >= 2 ? `${elegidas.length} elegidas, a partes iguales` : elegidas.length === 1 ? "1 elegida" : "sin elegir: el reparto usa el mínimo de personas del equipo"}
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {personas.map((n) => bloqueadas.has(n) ? (
              <span key={n} aria-describedby="trg-nota-bloq" className={`${PC} hub-etiqueta hub-eq cursor-not-allowed border-transparent`}>
                <IconoBBVA nombre="block" size={13} />{n}
              </span>
            ) : (
              <button
                key={n} type="button" aria-pressed={elegidas.includes(n)}
                onClick={() => setBorrador({ ...b, personas: elegidas.includes(n) ? elegidas.filter((x) => x !== n) : personas.filter((x) => x === n || elegidas.includes(x)) })}
                className={`${PC} ${elegidas.includes(n) ? "hub-sel hub-ge border-sand text-sand" : "border-white/55 text-sand hover:border-sand"}`}
              >
                {elegidas.includes(n) && <IconoBBVA nombre="checkmark" size={13} />}{n}
              </button>
            ))}
          </div>
          {hayBloq && <p id="trg-nota-bloq" className="mt-1.5 text-[13px] text-sand/75">Las personas bloqueadas (en naranja) no reciben horas nuevas: desbloquéalas en «Personas bloqueadas» si deben entrar.</p>}
        </div>
        {guardia ? (
          <div role="alert" className="trg-aten flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2.5 md:col-span-2">
            <p className="mr-auto text-sm font-bold text-sand">Tienes cambios sin guardar en «{b.nombre || "Nuevo proyecto"}».</p>
            <button type="button" onClick={() => resolverGuardia(true)} disabled={!valido} className={BTN_PRIM}>Guardar cambios</button>
            <button type="button" onClick={() => resolverGuardia(false)} className={BTN_SEC}>Descartar cambios</button>
            <button type="button" id="trg-seguir" onClick={() => { setGuardia(null); focoTras.current = "trg-nombre"; }} className={BTN_TXT}>Seguir editando</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            <button type="button" onClick={guardaProyecto} disabled={!valido} aria-describedby={valido ? undefined : "trg-oblig"} className={BTN_PRIM}>
              {nuevo ? "Añadir proyecto" : "Guardar cambios"}
            </button>
            <button type="button" onClick={() => { const id = abierto; cerrarEditor(); focoTras.current = id === "nuevo" ? "trg-nuevo" : `proy-${id}`; }} className={BTN_SEC}>Cancelar</button>
            {!valido && <span id="trg-oblig" className="text-[13px] text-sand/75">Faltan campos obligatorios (*): nombre, SDATOOL y horas.</span>}
            {!nuevo && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {confirmarBorrado ? (
                  <>
                    <b className="text-sm text-sand">¿Eliminar «{p.nombre}» y su reparto?</b>
                    <button type="button" onClick={borraProyecto} className={`${BTN} border-sand text-sand`}><IconoBBVA nombre="delete" size={18} />Sí, eliminar</button>
                    <button type="button" id="trg-borrar-no" onClick={() => setConfirmarBorrado(false)} className={BTN_SEC}>No</button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setConfirmarBorrado(true); focoTras.current = "trg-borrar-no"; }} className={BTN_TXT}>
                    <IconoBBVA nombre="delete" size={18} />Eliminar proyecto
                  </button>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const COLS = "grid-cols-[minmax(0,1fr)_20px] md:grid-cols-[minmax(150px,1fr)_112px_84px_200px_52px_20px] min-[1400px]:grid-cols-[minmax(150px,1fr)_112px_84px_134px_220px_52px_20px]";
  const lineaProyecto = (p) => {
    const ab = abierto === p.id;
    const pct = num(p.horas) ? Math.min(100, Math.round((p.plan / num(p.horas)) * 100)) : 0;
    return (
      <button type="button" id={`proy-${p.id}`} aria-expanded={ab} onClick={() => abrirProyecto(p.id)}
        className={`grid w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sand transition-colors hover:bg-purple/10 ${COLS} ${FOCO}`}>
        <span className="min-w-0">
          <span className="line-clamp-2 break-words text-[15px] font-bold">{p.nombre}</span>
          {p.sinRepartir > 0 && <span className="hub-etiqueta hub-eq mt-1 inline-block rounded-full px-[7px] text-[11px] font-bold leading-[17px] md:hidden">faltan {p.sinRepartir} h</span>}
        </span>
        <span className="hidden truncate text-[13px] tabular-nums md:block">{p.sdatool}</span>
        <span className={`hidden truncate text-[13px] tabular-nums md:block ${p.feature ? "" : "text-sand/75"}`}>{p.feature || "sin feature"}</span>
        <span className="hidden gap-[3px] min-[1400px]:flex" aria-label="Estados por quincena">
          {qs.map((x) => { const v = (p.estados || {})[x.n] || NIVEL2_ANALISIS; return <Estado key={x.n} letra={LETRA[v] || "A"} nombre={NOMBRE_EST[v] || v} quincena={x.label} hoy={x.n === qActualN && hoyQ >= 1 && hoyQ <= 6} />; })}
        </span>
        <span className="hidden gap-1 md:grid">
          <span className="flex items-center justify-between gap-1.5 text-xs tabular-nums">
            <b className="text-[13px]">{p.plan} de {num(p.horas)} h</b>
            {p.sinRepartir > 0 && <span className="hub-etiqueta hub-eq rounded-full px-[7px] text-[11px] font-bold leading-[17px]">faltan {p.sinRepartir} h</span>}
          </span>
          <span className="tr-barra hub-ge block h-1.5 overflow-hidden rounded-full"><i className="block h-full rounded-full" style={{ width: `${pct}%` }} /></span>
          <span className={`truncate text-xs ${p.asignadas.length ? "" : "text-sand/75"}`} title={p.asignadas.map((x) => `${x.per}: ${x.h} h`).join("\n")}>
            {p.asignadas.length ? p.asignadas.map((x) => corto(x.per)).join(", ") : "aún sin repartir"}
          </span>
        </span>
        <span className="hidden text-sm font-bold tabular-nums md:block">{p.incurridas} h</span>
        <IconoBBVA nombre="fold" size={20} className={`transition-transform ${ab ? "" : "rotate-180"}`} />
      </button>
    );
  };

  const seccionProyectos = () => {
    const nuevo = abierto === "nuevo";
    const rv = revision;
    return (
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="trg-h-proy" className="flex min-w-0 flex-col gap-2">
          {preview?.error && <Aviso>{preview.error}</Aviso>}
          {rv && (
            <section aria-labelledby="trg-revision" className="tr-resumen hub-ge mb-1 flex flex-col gap-3 rounded-xl px-4 py-4">
              <h2 id="trg-revision" tabIndex={-1} className="text-[17px] font-bold text-sand focus:outline-none">Revisa el reparto antes de guardarlo</h2>
              <p className="text-sm text-sand">
                {rv.filas.length
                  ? <>Cambia las horas de proyecto de <b>{plural(rv.filas.length, "persona", "personas")}</b> en <b>{plural(rv.quincenasCambian, "quincena", "quincenas")}</b> (desde {qs[preview.desde - 1]?.label}){rv.cambiosPasados ? <> · <b>{plural(rv.cambiosPasados, "cambio", "cambios")} en quincenas ya imputadas</b></> : null}. Lo que no es de proyecto se rellena con Soporte.</>
                  : <>El reparto no cambia las horas de proyecto de nadie desde {qs[preview.desde - 1]?.label}.</>}
                {preview.finDefecto === 6 && " Solo queda la última quincena: los proyectos sin fin propio se reparten en ella."}
              </p>
              {preview.pasadas && <Aviso>Reescribe quincenas ya imputadas{rv.pasadas.length ? ` (${rv.pasadas.map((n) => qs[n - 1]?.label).join(", ")})` : ""}: lo que esas personas copiaron al TR de BBVA habrá que corregirlo a mano.</Aviso>}
              {preview.sinHueco.length > 0 && <Aviso>No caben: {preview.sinHueco.map((s) => `${s.proyecto} (${s.horas} h${s.motivo ? " · " + s.motivo : ""})`).join(" · ")}</Aviso>}
              {rv.filas.length > 0 && (
                <div className="trg-solido max-h-80 overflow-auto rounded-[10px] border border-white/15">
                  <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums text-sand">
                    <thead>
                      <tr className="text-xs font-bold text-sand/75">
                        <th className="trg-solido sticky top-0 px-2 py-2 text-left">Persona</th>
                        {rv.qsR.map((n) => (
                          <th key={n} className={`sticky top-0 px-2 py-2 ${n <= qActualN && hoyQ >= 1 ? "trg-aten border-0" : "trg-solido"}`}>
                            {qs[n - 1]?.label}
                            {hoyQ >= 1 && n < hoyQ && <span className="block text-[11px] font-normal">ya imputada</span>}
                            {n === hoyQ && <span className="block text-[11px] font-normal">en curso</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rv.filas.map((f) => (
                        <tr key={f.per} className="border-t border-white/15">
                          <td className="px-2 py-1.5 text-left font-bold">{f.per}</td>
                          {rv.qsR.map((n) => {
                            const c = f.celdas[n];
                            return (
                              <td key={n} className={`whitespace-nowrap px-2 py-1.5 text-center ${c.antes === c.despues ? "text-sand/60" : ""}`}>
                                {c.antes === c.despues ? `${c.antes} h` : <>{c.antes} → <b>{c.despues} h</b></>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.notificar.length > 0 && (
                <p className="text-[13px] text-sand">
                  <b>Al guardar, avisa del cambio a {plural(preview.notificar.length, "persona", "personas")}</b> (cambia una quincena ya imputada o en curso): {preview.notificar.join(", ")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {preview.pasadas && (
                  <label className="mr-1 inline-flex cursor-pointer items-center gap-2 text-[13px] font-bold text-sand">
                    <input type="checkbox" checked={aceptoPasadas} onChange={(e) => setAceptoPasadas(e.target.checked)} className="h-[18px] w-[18px] accent-[#001391]" />
                    Entiendo que se reescriben quincenas ya imputadas
                  </label>
                )}
                <button type="button" onClick={confirmarReparto} disabled={preview.pasadas && !aceptoPasadas} className={preview.pasadas ? BTN_ATEN : BTN_PRIM}>
                  {preview.pasadas ? `Reescribir desde ${qs[preview.desde - 1]?.label} y guardar` : "Guardar el reparto"}
                </button>
                <button type="button" onClick={() => { setPreview(null); focoTras.current = "trg-calcular"; }} className={BTN_SEC}>Descartar</button>
              </div>
            </section>
          )}
          <h2 id="trg-h-proy" className="sr-only">Proyectos de {q}</h2>
          <div className="mb-1 flex flex-wrap items-center justify-end gap-3 min-[1400px]:justify-between">
            <span className="hidden flex-wrap items-center gap-3.5 text-[13px] text-sand/75 min-[1400px]:flex">
              Estado (Nivel 2):
              {[["A", "Análisis"], ["C", "Codificación"], ["P", "Pruebas"]].map(([l, t]) => (
                <span key={l} className="inline-flex items-center gap-1.5"><Estado letra={l} nombre={t} />{t}</span>
              ))}
            </span>
            <button type="button" id="trg-nuevo" onClick={() => abrirProyecto("nuevo")} disabled={nuevo} className={BTN_PRIM}>
              <IconoBBVA nombre="add" size={18} />Añadir proyecto
            </button>
          </div>
          {nuevo && (
            <article className="tr-resumen hub-ge rounded-xl">
              <p className="px-4 py-3 text-[15px] font-bold text-sand">Nuevo proyecto</p>
              {editor(null)}
            </article>
          )}
          {resumen.length > 0 && (
            <div aria-hidden className={`hidden gap-3 px-[17px] text-xs font-bold text-sand/75 md:grid ${COLS}`}>
              <span>Proyecto</span><span className="col-span-2">Códigos</span><span className="hidden min-[1400px]:block">Estados</span>
              <span>Repartidas y a quién</span><span>Incurridas</span><span />
            </div>
          )}
          {resumen.map((p) => (
            <article key={p.id} className={`rounded-xl border ${abierto === p.id ? "tr-resumen hub-ge" : "border-white/15 bg-white/[0.06]"}`}>
              {lineaProyecto(p)}
              {abierto === p.id && editor(p)}
            </article>
          ))}
          {!resumen.length && !nuevo && (
            <Vacio titulo={`Aún no hay proyectos en ${q}`}>Añade el primero: nombre, SDATOOL, horas, estados por quincena y entre quién repartirlo.</Vacio>
          )}
        </section>

        <aside className="flex flex-col gap-3.5 xl:sticky xl:top-cabecera">
          <div className={`${CAJA} flex flex-col gap-2.5 p-4`}>
            <h2 className="text-base font-bold text-sand">Repartir horas</h2>
            <p className="text-[13px] leading-snug text-sand/75">
              {tot.sinRepartir > 0 ? <b className="text-sand">Faltan {tot.sinRepartir} h por repartir. </b> : "Todo está repartido. "}
              Reparte lo pendiente entre las personas no bloqueadas (a partes iguales entre las elegidas de cada proyecto; si no hay, el mínimo de personas),
              dentro de la ventana de cada proyecto, y rellena la jornada con Soporte. Antes de guardar verás a quién afecta.
            </p>
            <label className="grid gap-1"><span className={ROT}>Recalcular desde</span>
              <Desplegable value={desdeReparto} onChange={(e) => { setPreview(null); setDesdeReparto(e.target.value); }}>
                <option value="">{hoyQ > 6 ? "Automático (el trimestre ya terminó: elige una quincena)" : `La quincena actual (${qs[qActualN - 1]?.label})`}</option>
                {qs.map((x) => <option key={x.n} value={x.n}>{x.label}{x.n < hoyQ ? " · ya imputada" : x.n === hoyQ ? " · actual" : ""}</option>)}
              </Desplegable>
            </label>
            {desdeReparto !== "" && Number(desdeReparto) < hoyQ && <Aviso>Reescribirá quincenas ya imputadas.</Aviso>}
            {preview && !preview.error ? (
              <p className="text-[13px] text-sand/75"><b className="text-sand">Reparto calculado:</b> revísalo en la columna de la izquierda y guárdalo o descártalo.</p>
            ) : (
              <div>
                <button type="button" id="trg-calcular" disabled={!resumen.length}
                  onClick={() => conGuardia(() => { cerrarEditor(); calcularReparto(desdeReparto === "" ? {} : { desde: Number(desdeReparto) }); })}
                  className={BTN_PRIM}>
                  <IconoBBVA nombre="arrows" size={18} />Calcular reparto
                </button>
              </div>
            )}
          </div>
          <div className={`${CAJA} flex flex-col gap-2.5 p-4`}>
            <h2 className="text-base font-bold text-sand">Personas bloqueadas</h2>
            <p className="text-[13px] leading-snug text-sand/75">Conservan su imputación tal cual: el reparto no les añade ni les quita horas.</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {[...bloqueadas].filter((n) => personas.includes(n)).map((n) => (
                <span key={n} className={`${PC} hub-etiqueta hub-eq border-transparent`}><IconoBBVA nombre="block" size={13} />{n}</span>
              ))}
              {![...bloqueadas].some((n) => personas.includes(n)) && <span className="text-[13px] text-sand/75">Nadie bloqueado.</span>}
              <button type="button" onClick={() => setVerBloq((v) => !v)} aria-expanded={verBloq} className={BTN_TXT}>{verBloq ? "Listo" : "Cambiar"}</button>
            </div>
            {verBloq && (
              <div role="group" aria-label="Bloquear o desbloquear personas" className="flex flex-wrap gap-1.5">
                {personas.map((n) => (
                  <button key={n} type="button" aria-pressed={bloqueadas.has(n)} onClick={() => toggleBloqueo(n)}
                    className={`${PC} ${bloqueadas.has(n) ? "hub-etiqueta hub-eq border-transparent" : "border-white/55 text-sand hover:border-sand"}`}>
                    {bloqueadas.has(n) && <IconoBBVA nombre="block" size={13} />}{n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    );
  };

  const seccionImputacion = () => {
    const qn = qs.find((x) => x.n === quincenaVista);
    const filasQ = reparto.filter((r) => r.quincena === quincenaVista);
    const base = dirtyQ === quincenaVista && editBackup.current ? editBackup.current.filter((r) => r.quincena === quincenaVista) : null;
    const editable = dirtyQ === quincenaVista || dirtyQ == null;
    const lab = (d) => esLaborable(d, festivos || {});
    const totalDia = (per, d) => filasQ.filter((r) => r.persona === per).reduce((a, r) => a + num(r.dias?.[d]), 0);
    const valBase = (per, pid, d) => { const f = base?.find((r) => r.persona === per && r.proyectoId === pid); return f ? num(f.dias?.[d]) : 0; };
    let fila = 0, editadas = 0, cortos = 0, conFinde = 0;
    const perEd = new Set();
    const grupos = personas.map((per) => {
      const filas = filasQ.filter((r) => r.persona === per).sort((a, b) => (a.proyectoId === SOPORTE_ID ? 1 : b.proyectoId === SOPORTE_ID ? -1 : 0));
      const malDias = filas.length ? qn.dias.filter((d) => lab(d) && totalDia(per, d) < jornada(d)).length : 0;
      const finde = qn.dias.some((d) => !lab(d) && totalDia(per, d) > 0);
      cortos += malDias; if (finde) conFinde++;
      return { per, filas, malDias, finde };
    });
    const opcionesFila = (g) => {
      const ya = new Set(g.filas.map((r) => r.proyectoId));
      const ops = proyectos.filter((p) => !ya.has(p.id)).map((p) => [p.id, p.nombre]);
      if (!ya.has(SOPORTE_ID)) ops.push(["__soporte", "Soporte usuarios"]);
      return ops;
    };
    const cuerpo = grupos.map((g) => {
      const totalPer = g.filas.reduce((a, r) => a + horasDe(r.dias), 0);
      const ops = editable ? opcionesFila(g) : [];
      const celdaPersona = (
        <td rowSpan={Math.max(1, g.filas.length)} className="trg-solido sticky left-0 z-[1] w-[170px] min-w-[170px] px-2.5 py-2 text-left align-top">
          <b className="block text-[13px] text-sand">{g.per}{bloqueadas.has(g.per) && <IconoBBVA nombre="block" size={13} className="ml-1 inline align-[-1px]" />}</b>
          <span className="block text-xs tabular-nums text-sand/75">{totalPer} h en la quincena</span>
          {g.malDias > 0 && <span className="hub-etiqueta hub-eq mt-1 inline-block rounded-full px-1.5 text-[11px] font-bold">{g.malDias} {g.malDias === 1 ? "día bajo" : "días bajo"} la jornada</span>}
          {g.finde && <span className="hub-etiqueta hub-eq mt-1 inline-block rounded-full px-1.5 text-[11px] font-bold">horas en día no laborable</span>}
          {ops.length > 0 && (
            <span className="relative mt-1 flex">
              <select value="__" aria-label={`Añadir proyecto a ${g.per}`}
                onChange={(e) => { const v = e.target.value; if (v !== "__") anadeFila(g.per, v === "__soporte" ? SOPORTE_ID : v); }}
                className={`max-w-[150px] cursor-pointer appearance-none bg-transparent py-1 pr-4 text-xs font-bold text-sand underline underline-offset-[3px] ${FOCO}`}>
                <option value="__">+ añadir proyecto</option>
                {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </span>
          )}
        </td>
      );
      if (!g.filas.length) {
        return (
          <tr key={g.per} className="border-t-[1.5px] border-white/40">
            {celdaPersona}
            <td colSpan={qn.dias.length + 3} className="trg-solido sticky left-[170px] px-2 py-2 text-left text-xs text-sand/75">Sin imputación en esta quincena.</td>
          </tr>
        );
      }
      return g.filas.map((r, i) => {
        const fi = fila++;
        return (
          <tr key={g.per + r.proyectoId} className={i === 0 ? "border-t-[1.5px] border-white/40" : "border-t border-dashed border-white/15"}>
            {i === 0 && celdaPersona}
            <td className="trg-solido sticky left-[170px] z-[1] w-[190px] min-w-[190px] px-2 py-1.5 text-left text-sand shadow-[inset_-1px_0_0_rgb(var(--c-white)/0.15)]">{nombreProy(r.proyectoId)}</td>
            <td className="px-2 py-1.5 text-right font-bold tabular-nums text-sand">{horasDe(r.dias)}</td>
            {qn.dias.map((d, c) => {
              const h = num(r.dias?.[d]);
              const td = totalDia(g.per, d);
              const laborable = lab(d);
              const ed = base && valBase(g.per, r.proyectoId, d) !== h;
              if (ed) { editadas++; perEd.add(g.per); }
              const mal = td > MAX_DIA || (!laborable && h > 0);
              const corta = laborable && td < jornada(d);
              const aviso = !laborable && h > 0 ? " · día no laborable" : corta ? ` · el día suma ${td} h (jornada ${jornada(d)} h)` : "";
              return (
                <td key={d} className={`px-0.5 py-0.5 text-center ${laborable ? "" : "bg-[rgb(var(--c-white)/0.07)]"}`}>
                  <input
                    inputMode="numeric" value={h > 0 ? h : ""} disabled={!editable}
                    data-r={fi} data-c={c} data-per={g.per} data-proy={r.proyectoId} data-dia={d}
                    aria-label={`${g.per} · ${nombreProy(r.proyectoId)} · ${diaSemana(d)} ${Number(d.slice(8))}${aviso}`}
                    onChange={(e) => editaCelda(g.per, r.proyectoId, d, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className={`trg-celda ${h ? "" : "cero"} ${ed ? "editada" : ""} ${mal ? "mal" : corta ? "corta" : ""} disabled:cursor-not-allowed`}
                  />
                </td>
              );
            })}
            <td className="px-1 text-center">
              {editable && (
                <button type="button" onClick={() => quitaFila(g.per, r.proyectoId)} aria-label={`Quitar ${nombreProy(r.proyectoId)} de ${g.per}`}
                  className={`grid h-[26px] w-[26px] place-items-center rounded-md text-sand/70 transition hover:bg-purple/10 hover:text-sand ${FOCO}`}>
                  <IconoBBVA nombre="close" size={14} />
                </button>
              )}
            </td>
          </tr>
        );
      });
    });
    const avisos = [
      cortos ? `${plural(cortos, "día laborable bajo", "días laborables bajo")} la jornada` : "",
      conFinde ? `${plural(conFinde, "persona", "personas")} con horas en días no laborables` : "",
    ].filter(Boolean).join(" · ");
    return (
      <>
        {chipsQuincena(dirtyQ != null)}
        {dirtyQ != null ? (
          <div role="status" className="tr-resumen hub-ge flex flex-wrap items-center gap-2.5 rounded-xl px-4 py-3">
            <p className="mr-auto text-sm font-bold text-sand">
              Cambios sin guardar en {qs[dirtyQ - 1]?.label}: {plural(editadas, "casilla cambiada", "casillas cambiadas")}{perEd.size ? ` en ${plural(perEd.size, "persona", "personas")}` : ""}
              {avisos && <><br /><span className="hub-etiqueta hub-eq rounded-full px-1.5 text-xs">{avisos}</span></>}
            </p>
            <button type="button" onClick={guardaQuincena} className={BTN_PRIM}>Guardar quincena</button>
            <button type="button" onClick={descartaQuincena} className={BTN_SEC}>Descartar</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="mr-auto text-[13px] text-sand/75">
              Corrige en las casillas lo que cada persona <b className="text-sand">ha imputado de verdad</b> en {qn?.label}; luego guarda y, si hace falta, recalcula las siguientes.
              {avisos && <> <span className="hub-etiqueta hub-eq rounded-full px-1.5 font-bold">{avisos}</span></>}
            </p>
            <button type="button" disabled={quincenaVista >= 6}
              onClick={() => { setTab("proyectos"); calcularReparto({ desdeMin: quincenaVista + 1 }); }}
              title={quincenaVista >= 6 ? "Es la última quincena del Q: no hay siguientes que recalcular" : "Reparte lo pendiente a partir de la quincena siguiente, respetando esta tal cual"}
              className={BTN_SEC}>
              <IconoBBVA nombre="arrows" size={18} />Recalcular las siguientes quincenas
            </button>
          </div>
        )}
        <p className="text-xs text-sand/75">
          Muévete con las flechas y Enter. Puedes pegar un bloque copiado de Excel en cualquier casilla. Máximo {MAX_DIA} h por casilla; cada día laborable
          debe llegar a la jornada ({qn && qn.mes >= 6 && qn.mes <= 7 ? "6 h en julio y agosto" : "9 h de lunes a jueves y 6 h los viernes"}).
        </p>
        <div className="trg-solido max-h-[calc(100vh-150px)] min-h-[320px] overflow-auto rounded-xl border border-white/15" onKeyDown={teclaCelda} onPaste={pegaCeldas}>
          <table className="w-full min-w-[1100px] border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr className="text-xs font-bold text-sand/75">
                <th className="trg-solido sticky left-0 top-0 z-[3] px-2.5 py-2 text-left shadow-[inset_0_-1px_0_rgb(var(--c-white)/0.15)]">Persona</th>
                <th className="trg-solido sticky left-[170px] top-0 z-[3] px-2 py-2 text-left shadow-[inset_-1px_-1px_0_rgb(var(--c-white)/0.15)]">Proyecto</th>
                <th className="trg-solido sticky top-0 z-[2] px-2 py-2 text-right shadow-[inset_0_-1px_0_rgb(var(--c-white)/0.15)]">Total</th>
                {qn.dias.map((d) => (
                  <th key={d} title={!lab(d) ? "No laborable" : `Jornada ${jornada(d)} h`}
                    className={`trg-solido sticky top-0 z-[2] px-0.5 py-2 text-center ${lab(d) ? "" : "text-sand/50"} ${d === hoy ? "text-sand shadow-[inset_0_-3px_0_rgb(var(--c-sand))]" : "shadow-[inset_0_-1px_0_rgb(var(--c-white)/0.15)]"}`}>
                    <span className="block font-normal">{diaSemana(d)}</span>{Number(d.slice(8))}
                  </th>
                ))}
                <th className="trg-solido sticky top-0 z-[2] shadow-[inset_0_-1px_0_rgb(var(--c-white)/0.15)]" />
              </tr>
            </thead>
            <tbody>{cuerpo}</tbody>
          </table>
        </div>
      </>
    );
  };

  const seccionEvidencias = () => {
    const qn = qs.find((x) => x.n === quincenaVista);
    const et = etiquetaEvidencias(q, quincenaVista);
    const d = evid.data;
    const total = d ? d.entregados.length + d.pendientes.length : 0;
    const sinConfig = !raizEvidencias || snap?.data?.evidenciasConfiguradas === false || /sin configurar/.test(evid.error);
    return (
      <>
        {chipsQuincena(false)}
        {sinConfig ? (
          <Vacio titulo={`Las evidencias de ${nombreEq} aún no están configuradas`}>
            Falta la clave <code>{EVIDENCIAS_KEY[eqTR]}</code> en <code>links.json</code> con la URL de la carpeta raíz de Drive (compartida con el equipo), o el
            navegador tiene una copia antigua de links.json (recarga la página). El backend crea dentro las carpetas {et?.ruta}.
          </Vacio>
        ) : (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-labelledby="trg-evi" className={`${CAJA} flex flex-col gap-3 p-[18px]`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="trg-evi" className="text-xl font-bold text-sand">Evidencias de {qn?.label}</h2>
                {d && <b className="text-sand tabular-nums">{d.entregados.length} de {total} entregadas</b>}
              </div>
              {d && <span className="tr-barra hub-ge block h-2 overflow-hidden rounded-full"><i className="block h-full rounded-full" style={{ width: `${total ? Math.round((d.entregados.length / total) * 100) : 0}%` }} /></span>}
              <p className="text-[13px] text-sand/75">Carpeta de Drive: {et?.carpeta}</p>
              {evid.estado === "cargando" && <p className="text-[13px] text-sand/75">Leyendo la carpeta de Drive…</p>}
              {evid.estado === "error" && <Aviso>{evid.error}</Aviso>}
              {d && (
                <>
                  {d.pendientes.length > 0 ? (
                    <div className="trg-aten rounded-[10px] px-3 py-2.5 text-[13px] text-sand">
                      <p className="mb-1.5"><b>Faltan {d.pendientes.length}:</b> {d.pendientes.join(", ")}</p>
                      <button type="button" onClick={() => copiarFaltan(d.pendientes)} className={BTN_SEC}><IconoBBVA nombre="copy" size={18} />Copiar sus nombres</button>
                    </div>
                  ) : <p className="font-bold text-sand">Todo el equipo ha entregado.</p>}
                  {d.sinIdentificar.length > 0 && (
                    <div className="trg-aten rounded-[10px] px-3 py-2.5 text-[13px] text-sand">
                      <b>Sin identificar</b> (renómbralos con el nombre de la persona):{" "}
                      {d.sinIdentificar.map((f, i) => (
                        <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">{i ? " · " : ""}{f.fichero}</a>
                      ))}
                    </div>
                  )}
                  {d.entregados.length > 0 && (
                    <>
                      <p className="mt-1 text-xs font-bold text-sand/75">Han subido su evidencia ({d.entregados.length})</p>
                      <ul className="grid gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                        {d.entregados.map((e) => (
                          <li key={e.fichero} className="flex items-center gap-2 rounded-lg border border-white/15 px-2.5 py-1.5 text-[13px] text-sand">
                            <IconoBBVA nombre="checkmark" size={16} />
                            <b className="flex-1 truncate">{e.persona}</b>
                            <a href={e.url} target="_blank" rel="noreferrer" title={e.fichero} className="text-xs text-sand/75 underline underline-offset-2 hover:text-sand">
                              ver PDF{e.renombrado ? " · renombrado" : ""}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>
            <aside className={`${CAJA} flex flex-col gap-2.5 p-[18px] xl:sticky xl:top-cabecera`}>
              <h2 className="text-base font-bold text-sand">Para el correo al cliente</h2>
              <p className="text-[13px] leading-snug text-sand/75">
                Los ficheros se renombran solos a <b className="text-sand">{et?.fichero("Nombre Apellido")}</b> al consultar el estado.
              </p>
              <button type="button" onClick={descargarZip} disabled={!d || d.entregados.length + d.sinIdentificar.length === 0 || zip === "generando"} className={BTN_PRIM}>
                <IconoBBVA nombre="zip" size={18} />{zip === "generando" ? "Generando ZIP…" : "Descargar todas (ZIP)"}
              </button>
              <button type="button" onClick={descargarPdf} disabled={!resumen.length} className={BTN_SEC}><IconoBBVA nombre="document" size={18} />Resumen en PDF</button>
              {d?.carpeta?.url && (
                <a href={d.carpeta.url} target="_blank" rel="noreferrer" className={BTN_SEC}><IconoBBVA nombre="folder" size={18} />Abrir carpeta en Drive</a>
              )}
              <button type="button" onClick={recargaEvidencias} disabled={evid.estado === "cargando"} className={BTN_TXT}><IconoBBVA nombre="arrows" size={18} />Actualizar</button>
              {d?.zip && <p className="text-xs text-sand/75">Último ZIP: <a href={d.zip.url} className="text-sand underline underline-offset-2">{d.zip.nombre}</a></p>}
            </aside>
          </div>
        )}
      </>
    );
  };

  return (
    <main className="mx-auto flex w-full max-w-[1376px] flex-col gap-[18px] px-4 pb-10 pt-cabecera sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-ge grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="wikimetrics" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Time Report del equipo</h1>
        </div>
        <div role="group" aria-label="Equipo del Time Report" className="flex flex-wrap gap-1.5">
          {EQUIPOS.map((e) => (
            <button
              key={e.id} type="button" aria-pressed={eqTR === e.id} disabled={dirtyQ != null && eqTR !== e.id}
              title={dirtyQ != null && eqTR !== e.id ? "Guarda o descarta los cambios de la quincena antes de cambiar de equipo" : e.largo}
              onClick={() => cambiaEquipoTR(e.id)}
              className={`${CHIP} ${eqTR === e.id ? "hub-sel hub-ge border-sand text-sand" : CHIP_OFF}`}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="trg-q" className="text-[13px] font-bold text-sand">Trimestre</label>
        <span className="relative inline-flex">
          <select id="trg-q" value={q} onChange={(e) => conGuardia(() => { cerrarEditor(); setPreview(null); setProyectos(null); setQ(e.target.value); })}
            disabled={dirtyQ != null} className={`${CHIP} ${CHIP_OFF} cursor-pointer appearance-none pr-8`}>
            {qsSelector(snap?.data?.qs).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180 text-sand" />
        </span>
        <div role="group" aria-label="Sección" className="flex flex-wrap gap-1.5 sm:ml-1.5">
          {[["resumen", "Resumen"], ["proyectos", "Proyectos y reparto"], ["imputacion", "Imputación"], ["evidencias", "Evidencias"]].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tab === id} onClick={() => cambiaTab(id)}
              className={`${CHIP} ${tab === id ? "hub-etiqueta hub-ge border-transparent" : CHIP_OFF}`}>
              {label}
            </button>
          ))}
        </div>
        <span role="status" aria-live="polite" className="ml-auto inline-flex min-h-5 items-center gap-1.5 text-[13px] font-bold text-sand/75">
          {estado === "guardando" && "Guardando…"}
          {estado === "ok" && <><IconoBBVA nombre="checkmark" size={16} />Guardado</>}
          {estado.startsWith("error:") && <span className="hub-etiqueta hub-eq rounded-full px-2">No se pudo guardar ({estado.slice(6)}): recargando datos</span>}
        </span>
      </div>
      {snap?.error && <Aviso className="self-start">{snap.error}</Aviso>}

      {cargando ? (
        <div aria-busy="true" aria-label="Cargando el Time Report" className="flex flex-col gap-3">
          <div className="h-24 animate-pulse rounded-xl bg-white/10" />
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
        </div>
      ) : tab === "resumen" ? seccionResumen()
        : tab === "imputacion" ? seccionImputacion()
        : tab === "evidencias" ? seccionEvidencias()
        : seccionProyectos()}

      {deshacer && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-full bg-sand px-5 py-2.5 text-sm font-bold text-midnight shadow-xl">
          {deshacer.msg}
          <button type="button" onClick={() => { const f = deshacer.fn; setDeshacer(null); clearTimeout(tDeshacer.current); f(); }}
            className="rounded-full border-[1.5px] border-midnight px-3 py-0.5 hover:bg-midnight/10">
            Deshacer
          </button>
        </div>
      )}
    </main>
  );
}

function Vacio({ titulo, children }) {
  return (
    <div className="rounded-xl border-[1.5px] border-dashed border-white/40 px-6 py-8 text-center">
      <b className="mb-1 block text-base text-sand">{titulo}</b>
      <span className="text-sm text-sand/75">{children}</span>
    </div>
  );
}
