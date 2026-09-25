"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { GLASS, FIELD, TEXT, Kpi, EmptyCard, PanelSkeleton } from "../coordinacion/ui";
import { IconClock, IconAlert, IconPlus, IconX, IconReload, IconExternal } from "../coordinacion/icons";
import { useTimeReport, useFestivos, useEquipo } from "./datos";
import {
  num, curQ, hoyISO, quincenasDeQ, quincenaDe, horasDe, horasProyecto, esFinde, esLaborable,
  repartir, capacidadMaxima, NIVELES2, NIVEL2_ANALISIS, SOPORTE_ID, MAX_DIA, etiquetaEvidencias,
} from "./model";
import { abrirResumenPdf } from "./resumenPdf";

/* Gestión del Time Report · Coordinación.
   RESUMEN: proyectos del Q con horas imputadas (según reparto, hasta hoy) y
     por imputar, horas INCURRIDAS (reales, se teclean a mano en Proyectos) y
     por incurrir, desglose por quincena y descarga del resumen en PDF con
     formato BBVA (sin incurridas).
   PROYECTOS Y REPARTO: alta/edición de proyectos, estados (Nivel 2) por
     quincena, personas por proyecto, horas incurridas, bloqueos y reparto.
   IMPUTACIÓN: todas las personas en una quincena; EDITABLE para corregir lo
     que alguien imputó de verdad y recalcular las quincenas siguientes.
   EVIDENCIAS: estado de la carpeta de Drive de la quincena (quién ha subido
     su evidencia y quién falta), ZIP con todas y enlace a la carpeta. */

const ACCENT = PALETTE.canary;

const qsSelector = (extra) => {
  const año = new Date().getFullYear();
  const set = new Set(extra || []);
  [año - 1, año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) set.add(`${a}Q${i}`); });
  return [...set].sort();
};

const BTN = {
  primario: "inline-flex items-center gap-1.5 rounded-lg bg-[#F5E33D] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
  ok: "inline-flex items-center gap-1.5 rounded-lg bg-[#88E783] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
  serene: "inline-flex items-center gap-1.5 rounded-lg bg-[#85C8FF] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
  ghost: "inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2 text-xs font-bold text-sand/85 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40",
};

/* Previsualización de un reparto (se usa en Proyectos y en Imputación). */
function PreviewReparto({ preview, qs, nombreProy, onConfirm, onDiscard }) {
  if (!preview) return null;
  if (preview.error)
    return <p className="mt-3 rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{preview.error}</p>;
  const personas = [...new Set(preview.reparto.filter((r) => r.quincena >= preview.desde).map((r) => r.persona))].sort();
  return (
    <div className="mt-3 space-y-2 text-[12px]">
      <p className="text-sand/70">
        Reparto desde la quincena <strong className="text-sand">{qs[preview.desde - 1]?.label}</strong>.
        {preview.finDefecto === 6 && " Solo queda la última quincena: los proyectos sin fin propio se reparten en ella."}
      </p>
      {preview.pasadas && (
        <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-2.5 py-1.5 text-[11.5px] font-bold text-mandarin">
          ⚠ Incluye quincenas ya pasadas: al guardar se reescribe lo que ya estaba imputado en ellas (y lo que se copió al TR de BBVA habrá que corregirlo a mano).
        </p>
      )}
      {preview.sinHueco.length > 0 && (
        <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-2.5 py-1.5 text-[11.5px] font-bold text-mandarin">
          ⚠ No caben: {preview.sinHueco.map((s) => `${s.proyecto} (${s.horas} h${s.motivo ? " · " + s.motivo : ""})`).join(" · ")}
        </p>
      )}
      <ul className="space-y-1">
        {personas.map((per) => {
          const filas = preview.reparto.filter((r) => r.persona === per && r.quincena >= preview.desde);
          const proys = [...new Set(filas.filter((r) => r.proyectoId !== SOPORTE_ID).map((r) => nombreProy(r.proyectoId)))];
          const total = filas.reduce((a, r) => a + horasDe(r.dias), 0);
          return (
            <li key={per} className="rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5">
              <span className="font-bold text-sand">{per}</span>
              <span className="tabular-nums text-sand/60"> · {total} h</span>
              <span className="text-sand/55">{proys.length ? " · " + proys.join(", ") : " · solo Soporte"}</span>
            </li>
          );
        })}
      </ul>
      {preview.notificar.length > 0 && (
        <p className="rounded-lg border border-canary/40 bg-canary/10 px-2.5 py-1.5 text-[11.5px] font-bold text-canary">
          📣 Al guardar hay que NOTIFICAR el cambio de imputación a: {preview.notificar.join(", ")}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onConfirm} className={BTN.ok}>Confirmar y guardar</button>
        <button type="button" onClick={onDiscard} className={BTN.ghost}>Descartar</button>
      </div>
    </div>
  );
}

export default function GestionRoute() {
  const { showToast, getUrl } = useLinks();
  const [q, setQ] = useState(curQ());
  const { snap, reload, post } = useTimeReport(q);
  const festivos = useFestivos();
  const equipo = useEquipo();
  const [tab, setTabRaw] = useState("resumen"); // resumen | proyectos | imputacion | evidencias
  const [nuevo, setNuevo] = useState({ nombre: "", sdatool: "", feature: "", horas: "" });
  const [editando, setEditando] = useState(null); // { id, nombre, sdatool, feature, horas }
  const [preview, setPreview] = useState(null); // resultado de repartir() sin guardar
  const [estado, setEstado] = useState(""); // "" | guardando | ok | error:...
  const [verQuincenas, setVerQuincenas] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(null);
  // Pestañas Imputación y Evidencias: quincena que se está viendo (por defecto la actual).
  const [quincenaVista, setQuincenaVista] = useState(() => Math.min(6, Math.max(1, quincenaDe(curQ(), hoyISO()) || 1)));
  // Imputación editable: nº de quincena con cambios sin guardar (null = ninguna).
  const [dirtyQ, setDirtyQ] = useState(null);
  const editBackup = useRef(null);
  // Evidencias: estado de la carpeta de la quincena vista.
  const [evid, setEvid] = useState({ estado: "idle", data: null, error: "" });
  const [zip, setZip] = useState("");

  const setTab = (t) => { setPreview(null); setTabRaw(t); };

  const personas = useMemo(() => (equipo || []).map((m) => m.nombre), [equipo]);
  const qs = quincenasDeQ(q);
  const hoy = hoyISO();
  const hoyQ = quincenaDe(q, hoy); // 0 = Q futuro, 7 = Q ya terminado
  const qActualN = Math.min(6, Math.max(1, hoyQ || 1));

  /* Estado LOCAL (optimista): los cambios se pintan al instante y el guardado
     va en segundo plano — sin recargar el snapshot en cada edición. Solo se
     resincroniza al cambiar de Q o si un guardado falla. */
  const [proyectos, setProyectos] = useState(null);
  const [reparto, setReparto] = useState([]);
  const [bloqueadas, setBloqueadas] = useState(() => new Set());
  const seeded = useRef(null);
  useEffect(() => {
    if (!snap?.data) return;
    const key = q + "|" + (snap.data.generadoEn || "");
    if (seeded.current === key) return;
    seeded.current = key;
    setProyectos(snap.data.proyectos || []);
    setReparto(snap.data.reparto || []);
    setBloqueadas(new Set(snap.data.bloqueadas || []));
    setDirtyQ(null);
    editBackup.current = null;
  }, [snap, q]);

  const cargando = !snap || festivos == null || equipo == null || proyectos == null;

  /* Resumen por proyecto:
     - imputadas: horas del reparto con día <= hoy (lo que ya está en el TR);
       pendientes = horas − imputadas ("por imputar").
     - incurridas: horas REALES tecleadas por coordinación en Proyectos;
       porIncurrir = horas − incurridas.
     - desglose por quincena. */
  const resumen = useMemo(() => {
    return (proyectos || []).map((p) => {
      const filas = reparto.filter((r) => r.proyectoId === p.id);
      let imputadas = 0, plan = 0;
      const porQ = [0, 0, 0, 0, 0, 0];
      filas.forEach((r) => {
        Object.entries(r.dias || {}).forEach(([d, h]) => {
          plan += num(h);
          if (d <= hoy) imputadas += num(h);
        });
        if (r.quincena >= 1 && r.quincena <= 6) porQ[r.quincena - 1] += horasDe(r.dias);
      });
      const incurridas = Math.max(0, num(p.incurridas));
      return {
        ...p, imputadas, plan,
        pendientes: Math.max(0, num(p.horas) - imputadas),
        incurridas, porIncurrir: Math.max(0, num(p.horas) - incurridas),
        sinRepartir: num(p.horas) - plan, porQ,
      };
    });
  }, [proyectos, reparto, hoy]);

  const tot = useMemo(() => ({
    horas: resumen.reduce((a, p) => a + num(p.horas), 0),
    imputadas: resumen.reduce((a, p) => a + p.imputadas, 0),
    pendientes: resumen.reduce((a, p) => a + p.pendientes, 0),
    incurridas: resumen.reduce((a, p) => a + p.incurridas, 0),
    porIncurrir: resumen.reduce((a, p) => a + p.porIncurrir, 0),
  }), [resumen]);
  const capMax = useMemo(
    () => capacidadMaxima({ q, personas: personas.filter((p) => !bloqueadas.has(p)), festivos: festivos || {}, hoy }),
    [q, personas, bloqueadas, festivos, hoy]
  );

  /* Guardado en SEGUNDO PLANO: no recarga nada; si falla, resincroniza. */
  const pendientesRef = useRef(0);
  const salva = (fn) => {
    pendientesRef.current++;
    setEstado("guardando");
    Promise.resolve()
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
        seeded.current = null; // resincronizar con lo guardado de verdad
        reload();
      });
  };

  /* Cambia los proyectos en pantalla YA y guarda por detrás. */
  const aplicaProyectos = (next) => {
    setProyectos(next);
    salva(() => post("guardarProyectos", { q, proyectos: next }));
  };

  // Se puede pegar el código completo ("SDATOOL-49780" / "CIBRDR-1088"):
  // se queda el código y el prefijo lo pone la web, sin cortar nada.
  const limpiaSdatool = (v) => String(v).replace(/^\s*sdatool[\s-]*/i, "").trim();
  const limpiaFeature = (v) => String(v).replace(/^\s*cibrdr[\s-]*/i, "").trim();

  const altaProyecto = () => {
    const estados = {};
    for (let i = 1; i <= 6; i++) estados[i] = NIVEL2_ANALISIS;
    const p = {
      id: "p" + Date.now(),
      nombre: nuevo.nombre.trim(),
      sdatool: "SDATOOL-" + limpiaSdatool(nuevo.sdatool),
      feature: nuevo.feature.trim() ? "CIBRDR-" + limpiaFeature(nuevo.feature) : "",
      horas: Math.round(num(nuevo.horas)),
      estados,
      personas: [],
      incurridas: 0,
      inicio: 1,
      fin: 0, // 0 = automático (15 del último mes)
    };
    aplicaProyectos([...proyectos, p]);
    setNuevo({ nombre: "", sdatool: "", feature: "", horas: "" });
  };

  const guardaEdicion = () => {
    const e = editando;
    aplicaProyectos(
      proyectos.map((p) =>
        p.id === e.id
          ? {
              ...p,
              nombre: e.nombre.trim(),
              sdatool: "SDATOOL-" + limpiaSdatool(e.sdatool),
              feature: e.feature.trim() ? "CIBRDR-" + limpiaFeature(e.feature) : "",
              horas: Math.round(num(e.horas)),
            }
          : p
      )
    );
    setEditando(null);
  };

  const cambiaIncurridas = (id, valor) => {
    const v = Math.max(0, Math.round(num(valor)));
    const p = proyectos.find((x) => x.id === id);
    if (!p || v === num(p.incurridas)) return;
    aplicaProyectos(proyectos.map((x) => (x.id === id ? { ...x, incurridas: v } : x)));
  };

  const togglePersonaProy = (id, nombre) =>
    aplicaProyectos(
      proyectos.map((p) => {
        if (p.id !== id) return p;
        const set = new Set(p.personas || []);
        if (set.has(nombre)) set.delete(nombre);
        else set.add(nombre);
        return { ...p, personas: [...set] };
      })
    );

  const cambiaEstado = (id, quincena, valor) =>
    aplicaProyectos(proyectos.map((p) => (p.id === id ? { ...p, estados: { ...p.estados, [quincena]: valor } } : p)));

  // Ventana del proyecto: quincena de inicio (1..6) y de fin (1..6, 0 = automático).
  const cambiaVentana = (id, campo, valor) =>
    aplicaProyectos(proyectos.map((p) => (p.id === id ? { ...p, [campo]: Math.round(num(valor)) } : p)));

  const borraProyecto = (id) => {
    aplicaProyectos(proyectos.filter((p) => p.id !== id));
    setConfirmarBorrado(null);
  };

  const toggleBloqueo = (nombre) => {
    const next = new Set(bloqueadas);
    if (next.has(nombre)) next.delete(nombre);
    else next.add(nombre);
    setBloqueadas(next);
    salva(() => post("guardarBloqueadas", { q, personas: [...next] }));
  };

  // desdeMin: nunca antes de la quincena actual; desde: quincena exacta, aunque
  // ya haya pasado (lo elige coordinación en «Repartir horas»).
  const calcularReparto = ({ desdeMin, desde } = {}) => {
    const r = repartir({ q, proyectos, repartoActual: reparto, personas, bloqueadas: [...bloqueadas], festivos: festivos || {}, hoy, desdeMin, desde });
    setPreview(r);
  };
  const [desdeReparto, setDesdeReparto] = useState(""); // "" = desde la quincena actual

  const confirmarReparto = () => {
    const { desde } = preview;
    setReparto(preview.reparto);
    salva(() => post("guardarReparto", { q, desdeQuincena: desde, filas: preview.reparto.filter((r) => r.quincena >= desde) }));
    setPreview(null);
  };

  /* ── Imputación EDITABLE (corregir lo que alguien imputó de verdad) ──
     Los cambios se hacen en local sobre la quincena vista; "Guardar quincena"
     reescribe en el backend esa quincena (y reenvía las posteriores tal cual). */
  const mutaReparto = (fn) => {
    if (editBackup.current == null) editBackup.current = reparto;
    setReparto((prev) => fn(prev));
    setDirtyQ(quincenaVista);
  };
  const mismaFila = (r, persona, proyectoId) => r.quincena === quincenaVista && r.persona === persona && r.proyectoId === proyectoId;
  const editaCelda = (persona, proyectoId, dia, valor) =>
    mutaReparto((prev) => {
      const v = Math.max(0, Math.min(MAX_DIA, Math.round(num(valor))));
      const idx = prev.findIndex((r) => mismaFila(r, persona, proyectoId));
      const next = [...prev];
      if (idx < 0) {
        if (v > 0) next.push({ quincena: quincenaVista, persona, proyectoId, dias: { [dia]: v } });
        return next;
      }
      const dias = { ...next[idx].dias };
      if (v > 0) dias[dia] = v;
      else delete dias[dia];
      next[idx] = { ...next[idx], dias };
      return next;
    });
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
  };

  /* ── Evidencias: estado de la carpeta de la quincena vista ── */
  useEffect(() => {
    if (tab !== "evidencias" || !snap?.data) return;
    let vivo = true;
    setEvid({ estado: "cargando", data: null, error: "" });
    post("estadoEvidencias", { q, quincena: quincenaVista, raiz: getUrl("evidenciasDrive") })
      .then((d) => vivo && setEvid({ estado: "ok", data: d, error: "" }))
      .catch((e) => vivo && setEvid({ estado: "error", data: null, error: String(e.message || e) }));
    return () => { vivo = false; };
  }, [tab, q, quincenaVista, snap, post, getUrl]);
  const recargaEvidencias = () => {
    setEvid({ estado: "cargando", data: null, error: "" });
    post("estadoEvidencias", { q, quincena: quincenaVista, raiz: getUrl("evidenciasDrive") })
      .then((d) => setEvid({ estado: "ok", data: d, error: "" }))
      .catch((e) => setEvid({ estado: "error", data: null, error: String(e.message || e) }));
  };
  const descargarZip = () => {
    const w = window.open("", "_blank"); // abrir YA para que no lo bloquee el navegador
    setZip("generando");
    post("descargarEvidencias", { q, quincena: quincenaVista, raiz: getUrl("evidenciasDrive") })
      .then((d) => {
        if (w) w.location = d.url;
        setZip("");
        showToast(`ZIP con ${d.n} evidencia${d.n === 1 ? "" : "s"} generado`);
        recargaEvidencias();
      })
      .catch((e) => {
        if (w) w.close();
        setZip("");
        showToast("No se pudo generar el ZIP: " + String(e.message || e));
      });
  };

  const descargarPdf = () => {
    const ok = abrirResumenPdf({ q, resumen, qs, qActualN, hoy, personas: personas.length });
    showToast(ok ? "Resumen abierto: elige «Guardar como PDF» en el diálogo de imprimir" : "El navegador bloqueó la ventana del PDF");
  };

  const nombreProy = (id) => (id === SOPORTE_ID ? "Soporte usuarios" : proyectos.find((p) => p.id === id)?.nombre || id);

  /* Selector de quincena (Imputación y Evidencias). Función, no componente:
     así no se remonta en cada render. */
  const selectorQuincena = (bloqueado) => (
    <div role="tablist" aria-label="Quincena" className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-white/12 bg-white/[0.055] p-1">
      {qs.map((x) => (
        <button
          key={x.n} role="tab" aria-selected={quincenaVista === x.n} disabled={bloqueado && quincenaVista !== x.n}
          onClick={() => { setPreview(null); setQuincenaVista(x.n); }}
          title={bloqueado && quincenaVista !== x.n ? "Guarda o descarta los cambios de la quincena antes de cambiar" : undefined}
          className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            quincenaVista === x.n ? "bg-[#F5E33D] text-[#001391]" : "text-sand/70 hover:text-sand"
          }`}
        >
          {x.label}{x.n === qActualN ? " · hoy" : ""}
        </button>
      ))}
    </div>
  );

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: ACCENT }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-canary/80">Coordinación</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconClock size={34} className="text-canary" /> Time Report
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Proyectos del trimestre, reparto de horas por quincena, corrección de imputaciones y evidencias del equipo.
            Los miembros ven su imputación en la página Time Report del hub.
          </p>
          {snap?.error && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> {snap.error}
            </p>
          )}
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sand/60">
            Trimestre
            <select value={q} onChange={(e) => { setPreview(null); setProyectos(null); setQ(e.target.value); }} className={`${FIELD} !py-2 font-bold`}>
              {qsSelector(snap?.data?.qs).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full border border-white/12 bg-white/[0.055] p-1">
            {[["resumen", "Resumen"], ["proyectos", "Proyectos y reparto"], ["imputacion", "Imputación"], ["evidencias", "Evidencias"]].map(([id, label]) => (
              <button
                key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  tab === id ? "bg-[#F5E33D] text-[#001391]" : "text-sand/70 hover:text-sand"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {estado === "guardando" && <span className="text-[11px] font-bold text-canary">Guardando…</span>}
          {estado === "ok" && <span className="text-[11px] font-bold text-lime">Guardado ✓</span>}
          {estado.startsWith("error:") && <span className="text-[11px] font-bold text-mandarin">No se pudo guardar ({estado.slice(6)}) — recargando datos</span>}
        </div>

        {cargando ? (
          <PanelSkeleton />
        ) : tab === "resumen" ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Proyectos" value={proyectos.length} accent="serene" />
              <Kpi label="Horas de proyectos" value={tot.horas + " h"} accent="serene" />
              <Kpi label="Imputadas" value={tot.imputadas + " h"} accent="lime" />
              <Kpi label="Pendientes de imputar" value={tot.pendientes + " h"} accent={tot.pendientes > 0 ? "canary" : "lime"} />
              <Kpi label="Incurridas (reales)" value={tot.incurridas + " h"} accent="purple" />
              <Kpi label="Capacidad máx. restante" value={capMax + " h"} accent={capMax >= tot.pendientes ? "lime" : "mandarin"} />
            </div>
            <p className="mb-4 text-[11px] text-sand/45">
              <strong className="text-sand/65">Imputadas</strong>: horas del reparto ya pasadas a fecha de hoy (lo que debería estar en el TR).{" "}
              <strong className="text-sand/65">Incurridas</strong>: horas reales trabajadas, se anotan a mano en «Proyectos y reparto».{" "}
              Capacidad máxima informativa: 24 h × persona no bloqueada × día laborable desde hoy hasta el 15 del último mes
              (o hasta fin de trimestre, si ya solo queda la última quincena).
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setVerQuincenas((v) => !v)} className={BTN.ghost}>
                {verQuincenas ? "Ocultar quincenas" : "Ver por quincena"}
              </button>
              <button type="button" onClick={descargarPdf} disabled={resumen.length === 0} className={BTN.serene} title="Resumen en formato BBVA, sin horas incurridas">
                <IconExternal size={13} /> Descargar resumen (PDF)
              </button>
            </div>
            {resumen.length === 0 && <EmptyCard>No hay proyectos en {q}: añádelos en la pestaña &quot;Proyectos y reparto&quot;.</EmptyCard>}
            {resumen.length > 0 && (
              <div className={`${GLASS} overflow-x-auto p-2`}>
                <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-sand/50">
                      <th className="p-2">Proyecto</th>
                      <th className="p-2">SDATOOL</th>
                      <th className="p-2">Feature</th>
                      <th className="p-2 text-right">Horas</th>
                      <th className="p-2 text-right">Imputadas</th>
                      <th className="p-2 text-right">Por imputar</th>
                      <th className="p-2 text-right text-purple/80">Incurridas</th>
                      <th className="p-2 text-right text-purple/80">Por incurrir</th>
                      {verQuincenas && qs.map((x) => <th key={x.n} className="p-2 text-right">{x.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.map((p) => (
                      <tr key={p.id} className="border-t border-white/[0.07]">
                        <td className="p-2 font-bold text-sand">{p.nombre}{p.sinRepartir > 0 && <span className="ml-1.5 text-[10px] font-bold text-mandarin" title="Horas sin repartir aún">⚠ {p.sinRepartir} sin repartir</span>}</td>
                        <td className="p-2 text-sand/70">{p.sdatool}</td>
                        <td className="p-2 text-sand/70">{p.feature || "—"}</td>
                        <td className="p-2 text-right tabular-nums text-sand/85">{num(p.horas)}</td>
                        <td className="p-2 text-right tabular-nums text-sand/85">{p.imputadas}</td>
                        <td className={`p-2 text-right font-bold tabular-nums ${p.pendientes > 0 ? TEXT.canary : TEXT.lime}`}>{p.pendientes}</td>
                        <td className="p-2 text-right tabular-nums text-sand/85">{p.incurridas}</td>
                        <td className={`p-2 text-right font-bold tabular-nums ${p.porIncurrir > 0 ? TEXT.purple : TEXT.lime}`}>{p.porIncurrir}</td>
                        {verQuincenas && p.porQ.map((h, i) => (
                          <td key={i} className={`p-2 text-right tabular-nums ${i + 1 === qActualN ? "font-bold text-sand" : "text-sand/60"}`}>{h || ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : tab === "imputacion" ? (
          /* ── Imputación de TODAS las personas en una quincena (editable) ── */
          (() => {
            const qn = qs.find((x) => x.n === quincenaVista);
            const filasQ = reparto.filter((r) => r.quincena === quincenaVista);
            const grupos = personas.map((per) => ({
              per,
              filas: [...filasQ.filter((r) => r.persona === per)].sort((a, b) =>
                a.proyectoId === SOPORTE_ID ? 1 : b.proyectoId === SOPORTE_ID ? -1 : 0
              ),
            }));
            const editable = dirtyQ === quincenaVista || dirtyQ == null;
            const totalDia = (per, d) => filasQ.filter((r) => r.persona === per).reduce((a, r) => a + num(r.dias?.[d]), 0);
            const opcionesFila = (g) => {
              const ya = new Set(g.filas.map((r) => r.proyectoId));
              const ops = proyectos.filter((p) => !ya.has(p.id)).map((p) => [p.id, p.nombre]);
              if (!ya.has(SOPORTE_ID)) ops.push(["__soporte", "Soporte usuarios"]);
              return ops;
            };
            return (
              <>
                {selectorQuincena(dirtyQ != null)}
                <div className={`${GLASS} mb-4 p-4`}>
                  <p className="text-[12px] text-sand/70">
                    Teclea directamente en las celdas lo que cada persona <strong className="text-sand">ha imputado de verdad</strong> en{" "}
                    <strong className="text-sand">{qn?.label}</strong> (o añade el proyecto que falte). Guarda la quincena y, si hace falta,
                    recalcula las siguientes para repartir lo que se suponía que tenía que haber imputado.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={guardaQuincena} disabled={dirtyQ == null} className={BTN.ok}>
                      Guardar quincena {qn?.label}
                    </button>
                    <button type="button" onClick={descartaQuincena} disabled={dirtyQ == null} className={BTN.ghost}>
                      Descartar cambios
                    </button>
                    <button
                      type="button" onClick={() => calcularReparto({ desdeMin: quincenaVista + 1 })} disabled={dirtyQ != null || quincenaVista >= 6}
                      title={
                        dirtyQ != null ? "Guarda primero los cambios de la quincena"
                        : quincenaVista >= 6 ? "Es la última quincena del Q: no hay siguientes que recalcular"
                        : "Reparte lo pendiente a partir de la quincena siguiente (o la actual, si esta ya pasó), respetando esta tal cual"
                      }
                      className={BTN.primario}
                    >
                      <IconReload size={13} /> Recalcular las siguientes quincenas
                    </button>
                    {dirtyQ != null && <span className="text-[11px] font-bold text-canary">Cambios sin guardar en {qs[dirtyQ - 1]?.label}</span>}
                  </div>
                  <PreviewReparto preview={preview} qs={qs} nombreProy={nombreProy} onConfirm={confirmarReparto} onDiscard={() => setPreview(null)} />
                </div>
                <div className={`${GLASS} overflow-x-auto p-3`}>
                  <table className="w-full min-w-[1080px] border-collapse text-[12px]">
                    <thead>
                      <tr className="text-left text-[9.5px] uppercase tracking-wide text-sand/50">
                        <th className="p-1.5">Persona</th>
                        <th className="p-1.5">Proyecto</th>
                        <th className="p-1.5 text-right">Total</th>
                        {qn.dias.map((d) => (
                          <th key={d} className={`p-1 text-center ${!esLaborable(d, festivos || {}) ? "text-sand/25" : ""} ${d === hoy ? "text-serene" : ""}`} title={esFinde(d) ? "Fin de semana" : !esLaborable(d, festivos || {}) ? "Festivo" : ""}>
                            {Number(d.slice(8))}
                          </th>
                        ))}
                        <th className="p-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {grupos.map((g) => {
                        const totalPer = g.filas.reduce((a, r) => a + horasDe(r.dias), 0);
                        const filasRender = g.filas.length ? g.filas : [null];
                        return filasRender.map((r, i) => (
                          <tr key={g.per + (r ? r.proyectoId : "vacio") + i} className={i === 0 ? "border-t-2 border-white/[0.14]" : "border-t border-white/[0.05]"}>
                            <td className="p-1.5 align-top">
                              {i === 0 && (
                                <>
                                  <span className="block font-bold text-sand">{g.per}{bloqueadas.has(g.per) ? " 🔒" : ""}</span>
                                  <span className="block text-[10px] tabular-nums text-sand/50">{totalPer} h en la quincena</span>
                                  {editable && opcionesFila(g).length > 0 && (
                                    <select
                                      value="__" aria-label={`Añadir proyecto a ${g.per}`}
                                      onChange={(e) => { const v = e.target.value; if (v !== "__") anadeFila(g.per, v === "__soporte" ? SOPORTE_ID : v); }}
                                      className={`${FIELD} mt-1 block max-w-[150px] !py-0.5 text-[10.5px]`}
                                    >
                                      <option value="__">＋ añadir proyecto…</option>
                                      {opcionesFila(g).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  )}
                                </>
                              )}
                            </td>
                            {r ? (
                              <>
                                <td className="p-1.5 text-sand/80">{nombreProy(r.proyectoId)}</td>
                                <td className="p-1.5 text-right font-bold tabular-nums text-sand/85">{horasDe(r.dias)}</td>
                                {qn.dias.map((d) => {
                                  const h = num(r.dias?.[d]);
                                  const exceso = totalDia(g.per, d) > MAX_DIA;
                                  return (
                                    <td key={d} className="p-0.5 text-center">
                                      <input
                                        type="number" min="0" max={MAX_DIA} step="1" inputMode="numeric"
                                        value={h > 0 ? h : ""} disabled={!editable}
                                        aria-label={`${g.per} · ${nombreProy(r.proyectoId)} · día ${Number(d.slice(8))}`}
                                        onChange={(e) => editaCelda(g.per, r.proyectoId, d, e.target.value)}
                                        className={`w-9 rounded border bg-transparent py-1 text-center tabular-nums transition focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-serene [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                                          exceso ? "border-mandarin text-mandarin" : h > 0 ? "border-transparent font-bold text-sand" : `border-transparent ${esLaborable(d, festivos || {}) ? "text-sand/40" : "text-sand/15"}`
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="p-1 text-center">
                                  {editable && (
                                    <button type="button" onClick={() => quitaFila(g.per, r.proyectoId)} aria-label={`Quitar ${nombreProy(r.proyectoId)} de ${g.per}`}
                                      className="grid h-6 w-6 place-items-center rounded-md text-sand/35 transition hover:bg-white/10 hover:text-mandarin">
                                      <IconX size={11} />
                                    </button>
                                  )}
                                </td>
                              </>
                            ) : (
                              <td colSpan={qn.dias.length + 3} className="p-1.5 text-[11px] text-sand/35">Sin imputación en esta quincena.</td>
                            )}
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()
        ) : tab === "evidencias" ? (
          /* ── Evidencias de la quincena en Drive ── */
          (() => {
            const qn = qs.find((x) => x.n === quincenaVista);
            const et = etiquetaEvidencias(q, quincenaVista);
            const d = evid.data;
            const total = d ? d.entregados.length + d.pendientes.length : 0;
            const sinConfig = !getUrl("evidenciasDrive") || snap?.data?.evidenciasConfiguradas === false || /sin configurar/.test(evid.error);
            return (
              <>
                {selectorQuincena(false)}
                {sinConfig ? (
                  <EmptyCard>
                    Las evidencias aún no están configuradas: falta la clave <code className="text-sand">evidenciasDrive</code> en{" "}
                    <code className="text-sand">links.json</code> con la URL de la carpeta raíz de Drive (compartida con el equipo), o el
                    navegador tiene una copia antigua de links.json (recarga la página). El backend crea dentro las carpetas{" "}
                    <span className="text-sand">{et?.año}/{et?.carpeta}</span>.
                  </EmptyCard>
                ) : (
                  <div className="grid items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
                    <section className={`${GLASS} p-4`}>
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="font-display text-base font-bold text-sand">
                          {et?.carpeta} <span className="text-sm font-normal text-sand/50">· {qn?.label}</span>
                        </h2>
                        {d && (
                          <span className={`text-[12px] font-bold tabular-nums ${d.pendientes.length === 0 ? TEXT.lime : TEXT.canary}`}>
                            {d.entregados.length} de {total} entregadas
                          </span>
                        )}
                      </div>
                      {evid.estado === "cargando" && <p className="text-[12px] text-sand/60">Leyendo la carpeta de Drive…</p>}
                      {evid.estado === "error" && (
                        <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{evid.error}</p>
                      )}
                      {d && (
                        <>
                          <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${total ? Math.round((d.entregados.length / total) * 100) : 0}%` }} />
                          </div>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sand/45">Han subido su evidencia</p>
                          {d.entregados.length === 0 && <p className="mb-3 text-[12px] text-sand/40">Nadie todavía.</p>}
                          <ul className="mb-3 space-y-1">
                            {d.entregados.map((e) => (
                              <li key={e.fichero} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[12px]">
                                <span className="font-bold text-lime">✓ {e.persona}</span>
                                <a href={e.url} target="_blank" rel="noreferrer" className="truncate text-sand/60 underline-offset-2 hover:text-sand hover:underline" title={e.fichero}>
                                  {e.fichero}{e.renombrado ? " · renombrado" : ""}
                                </a>
                              </li>
                            ))}
                          </ul>
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sand/45">Faltan</p>
                          {d.pendientes.length === 0 ? (
                            <p className="text-[12px] font-bold text-lime">Todo el equipo ha entregado 🎉</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {d.pendientes.map((n) => (
                                <span key={n} className="rounded-full border border-canary/40 bg-canary/10 px-2.5 py-1 text-[11px] font-bold text-canary">{n}</span>
                              ))}
                            </div>
                          )}
                          {d.sinIdentificar.length > 0 && (
                            <div className="mt-3 rounded-lg border border-mandarin/40 bg-mandarin/10 px-3 py-2 text-[11.5px] text-mandarin">
                              <strong>Sin identificar</strong> (renómbralos con el nombre de la persona):{" "}
                              {d.sinIdentificar.map((f, i) => (
                                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{i ? " · " : ""}{f.fichero}</a>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </section>
                    <section className={`${GLASS} space-y-3 p-4 xl:sticky xl:top-24`}>
                      <h2 className="font-display text-base font-bold text-sand">Acciones</h2>
                      <p className="text-[11px] text-sand/50">
                        Los ficheros se renombran solos a <span className="tabular-nums text-sand/75">{et?.carpeta}_NombreApellido.pdf</span> al
                        consultar el estado. Descarga el ZIP y el PDF del resumen y arrástralos al correo del cliente.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {d?.carpeta?.url && (
                          <a href={d.carpeta.url} target="_blank" rel="noreferrer" className={BTN.ghost}>
                            <IconExternal size={13} /> Abrir carpeta en Drive
                          </a>
                        )}
                        <button type="button" onClick={recargaEvidencias} disabled={evid.estado === "cargando"} className={BTN.ghost}>
                          <IconReload size={13} /> Actualizar
                        </button>
                        <button type="button" onClick={descargarZip} disabled={!d || d.entregados.length + d.sinIdentificar.length === 0 || zip === "generando"} className={BTN.serene}>
                          {zip === "generando" ? "Generando ZIP…" : "Descargar todas (ZIP)"}
                        </button>
                        <button type="button" onClick={descargarPdf} disabled={resumen.length === 0} className={BTN.ghost}>
                          Resumen en PDF
                        </button>
                      </div>
                      {d?.zip && (
                        <p className="text-[11px] text-sand/55">
                          Último ZIP: <a href={d.zip.url} className="text-sand/80 underline underline-offset-2">{d.zip.nombre}</a>
                        </p>
                      )}
                    </section>
                  </div>
                )}
              </>
            );
          })()
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
            <section className="space-y-4">
              {/* Alta de proyecto */}
              <div className={`${GLASS} p-4`}>
                <h2 className="mb-3 font-display text-base font-bold text-sand">Añadir proyecto</h2>
                <div className="space-y-2.5">
                  <input type="text" placeholder="Nombre del proyecto" aria-label="Nombre del proyecto" value={nuevo.nombre}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className={`${FIELD} w-full`} />
                  <div className="flex flex-wrap gap-2">
                    <div className={`${FIELD} flex min-w-[180px] flex-1 items-center gap-0 !py-0`}>
                      <span className="shrink-0 py-2 text-sand/45">SDATOOL-</span>
                      <input type="text" placeholder="49780 (o pégalo completo)" aria-label="Código SDATOOL" value={nuevo.sdatool}
                        onChange={(e) => setNuevo({ ...nuevo, sdatool: limpiaSdatool(e.target.value) })}
                        className="w-full bg-transparent py-2 focus:outline-none" />
                    </div>
                    <div className={`${FIELD} flex min-w-[160px] flex-1 items-center gap-0 !py-0`}>
                      <span className="shrink-0 py-2 text-sand/45">CIBRDR-</span>
                      <input type="text" placeholder="1088" aria-label="Feature CIBRDR" value={nuevo.feature}
                        onChange={(e) => setNuevo({ ...nuevo, feature: limpiaFeature(e.target.value) })}
                        className="w-full bg-transparent py-2 focus:outline-none" />
                    </div>
                    <input type="number" min="1" step="1" placeholder="Horas" aria-label="Horas a imputar" value={nuevo.horas}
                      onChange={(e) => setNuevo({ ...nuevo, horas: e.target.value })} className={`${FIELD} w-28 text-right tabular-nums`} />
                  </div>
                </div>
                <button
                  type="button" disabled={!nuevo.nombre.trim() || !nuevo.sdatool.trim() || num(nuevo.horas) <= 0}
                  onClick={altaProyecto} className={`mt-3 ${BTN.primario}`}
                >
                  <IconPlus size={13} /> Añadir
                </button>
              </div>

              {/* Lista de proyectos con estados por quincena */}
              {proyectos.length === 0 && <EmptyCard>Sin proyectos en {q}.</EmptyCard>}
              {proyectos.map((p) => (
                <article key={p.id} className={`${GLASS} p-4`}>
                  {editando?.id === p.id ? (
                    /* ── Edición de los datos del proyecto ── */
                    <div className="mb-3 space-y-2.5">
                      <input type="text" value={editando.nombre} aria-label="Editar nombre"
                        onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} className={`${FIELD} w-full`} />
                      <div className="flex flex-wrap gap-2">
                        <div className={`${FIELD} flex min-w-[180px] flex-1 items-center gap-0 !py-0`}>
                          <span className="shrink-0 py-2 text-sand/45">SDATOOL-</span>
                          <input type="text" value={editando.sdatool} aria-label="Editar SDATOOL"
                            onChange={(e) => setEditando({ ...editando, sdatool: limpiaSdatool(e.target.value) })}
                            className="w-full bg-transparent py-2 focus:outline-none" />
                        </div>
                        <div className={`${FIELD} flex min-w-[160px] flex-1 items-center gap-0 !py-0`}>
                          <span className="shrink-0 py-2 text-sand/45">CIBRDR-</span>
                          <input type="text" value={editando.feature} aria-label="Editar Feature"
                            onChange={(e) => setEditando({ ...editando, feature: limpiaFeature(e.target.value) })}
                            className="w-full bg-transparent py-2 focus:outline-none" />
                        </div>
                        <input type="number" min="1" step="1" value={editando.horas} aria-label="Editar horas"
                          onChange={(e) => setEditando({ ...editando, horas: e.target.value })} className={`${FIELD} w-28 text-right tabular-nums`} />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={guardaEdicion} disabled={!editando.nombre.trim() || !editando.sdatool.trim() || num(editando.horas) <= 0}
                          className="rounded-lg bg-[#88E783] px-3 py-1.5 text-xs font-bold text-[#001391] transition hover:brightness-95 disabled:opacity-40">
                          Guardar cambios
                        </button>
                        <button type="button" onClick={() => setEditando(null)}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-sand/70 transition hover:bg-white/10">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="min-w-0 break-words font-display text-base font-bold text-sand">{p.nombre}</h3>
                      <span className="flex items-center gap-2 text-[11px] tabular-nums text-sand/55">
                        {p.sdatool} · {p.feature || "sin feature"} · {num(p.horas)} h
                        <button type="button"
                          onClick={() => setEditando({ id: p.id, nombre: p.nombre, sdatool: limpiaSdatool(p.sdatool), feature: limpiaFeature(p.feature), horas: num(p.horas) })}
                          aria-label={`Editar ${p.nombre}`}
                          className="rounded-md border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase text-sand/70 transition hover:border-white/30 hover:bg-white/10">
                          Editar
                        </button>
                        {confirmarBorrado === p.id ? (
                          <span className="flex items-center gap-1.5">
                            <span className="font-bold text-mandarin">¿Eliminar?</span>
                            <button type="button" onClick={() => borraProyecto(p.id)} className="rounded bg-mandarin px-1.5 py-0.5 font-bold text-[#001391]">Sí</button>
                            <button type="button" onClick={() => setConfirmarBorrado(null)} className="rounded border border-white/20 px-1.5 py-0.5 text-sand/70">No</button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => setConfirmarBorrado(p.id)} aria-label={`Eliminar ${p.nombre}`}
                            className="grid h-6 w-6 place-items-center rounded-md text-sand/40 transition hover:bg-white/10 hover:text-mandarin">
                            <IconX size={12} />
                          </button>
                        )}
                      </span>
                    </div>
                  )}

                  {/* Ventana del proyecto: el reparto solo le pone horas entre
                      estas dos quincenas. Fin automático = hasta el 15 del
                      último mes (o la última quincena, si es la única que queda). */}
                  {(() => {
                    const ini = num(p.inicio) || 1;
                    const fin = num(p.fin) || 0;
                    return (
                      <div className="mb-3 flex flex-wrap items-end gap-2">
                        <label className="block">
                          <span className="text-[9.5px] font-bold uppercase tracking-wide text-sand/45">Quincena de inicio</span>
                          <select value={ini} onChange={(e) => cambiaVentana(p.id, "inicio", e.target.value)}
                            aria-label={`Quincena de inicio de ${p.nombre}`} className={`${FIELD} block !py-1.5 text-[12px]`}>
                            {qs.map((x) => <option key={x.n} value={x.n}>{x.label}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[9.5px] font-bold uppercase tracking-wide text-sand/45">Quincena de fin</span>
                          <select value={fin} onChange={(e) => cambiaVentana(p.id, "fin", e.target.value)}
                            aria-label={`Quincena de fin de ${p.nombre}`} className={`${FIELD} block !py-1.5 text-[12px]`}>
                            <option value={0}>Automático (15 del último mes)</option>
                            {qs.map((x) => <option key={x.n} value={x.n}>{x.label}</option>)}
                          </select>
                        </label>
                        {fin > 0 && fin < ini && (
                          <span className="pb-1.5 text-[11px] font-bold text-mandarin">⚠ El fin es anterior al inicio: no se le repartirá nada.</span>
                        )}
                      </div>
                    );
                  })()}

                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-sand/45">Estado (Nivel 2) por quincena</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {qs.map((x) => (
                      <label key={x.n} className="block">
                        <span className="text-[9.5px] text-sand/45">{x.label}</span>
                        <select
                          value={(p.estados || {})[x.n] || NIVEL2_ANALISIS}
                          onChange={(e) => cambiaEstado(p.id, x.n, e.target.value)}
                          aria-label={`Estado de ${p.nombre} en ${x.label}`}
                          className={`${FIELD} block w-full !py-1.5 text-[12px]`}
                        >
                          {NIVELES2.map((n2) => <option key={n2} value={n2}>{n2 === NIVEL2_ANALISIS ? "Análisis y diseño" : n2}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>

                  {/* Personas del proyecto: si se selecciona alguna, el reparto
                      SOLO usa esas (menos las bloqueadas). Sin selección = todas. */}
                  <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-wide text-sand/45">
                    Repartir solo entre… <span className="font-normal normal-case text-sand/40">(sin selección = todo el equipo)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {personas.map((n) => {
                      const sel = (p.personas || []).includes(n);
                      return (
                        <button key={n} type="button" onClick={() => togglePersonaProy(p.id, n)} aria-pressed={sel}
                          className={`rounded-full border px-2 py-0.5 text-[10.5px] font-bold transition ${
                            sel ? "border-transparent bg-[#85C8FF] text-[#001391]" : "border-white/12 bg-white/[0.03] text-sand/55 hover:border-white/30"
                          }`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>

                  {/* Horas INCURRIDAS (reales): dato interno de coordinación,
                      independiente del reparto. Se guarda al salir de la casilla. */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-sand/45">
                    <label className="flex items-center gap-2">
                      <span className="font-bold uppercase tracking-wide text-purple/80">Incurridas (reales)</span>
                      <input
                        key={p.id + ":" + num(p.incurridas)} type="number" min="0" step="1" placeholder="0" inputMode="numeric"
                        defaultValue={num(p.incurridas) || ""} aria-label={`Horas incurridas de ${p.nombre}`}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                        onBlur={(e) => cambiaIncurridas(p.id, e.target.value)}
                        className={`${FIELD} w-24 !py-1 text-right tabular-nums`}
                      />
                      <span>de {num(p.horas)} h · por incurrir <strong className="tabular-nums text-sand/70">{Math.max(0, num(p.horas) - num(p.incurridas))} h</strong></span>
                    </label>
                    <span>· Repartidas {horasProyecto(reparto, p.id)} de {num(p.horas)} h</span>
                  </div>
                </article>
              ))}
            </section>

            <section className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              {/* Bloqueos */}
              <div className={`${GLASS} p-4`}>
                <h2 className="mb-1 font-display text-base font-bold text-sand">Personas bloqueadas</h2>
                <p className="mb-3 text-[11px] text-sand/50">
                  Una persona bloqueada conserva su imputación tal cual: el reparto no le añade ni le quita horas.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {personas.map((n) => {
                    const b = bloqueadas.has(n);
                    return (
                      <button
                        key={n} type="button" onClick={() => toggleBloqueo(n)} aria-pressed={b}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                          b ? "border-transparent bg-[#FF7D69] text-[#001391]" : "border-white/15 bg-white/[0.04] text-sand/70 hover:border-white/30"
                        }`}
                      >
                        {b ? "🔒 " : ""}{n}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reparto */}
              <div className={`${GLASS} p-4`}>
                <h2 className="mb-1 font-display text-base font-bold text-sand">Repartir horas</h2>
                <p className="mb-3 text-[11px] text-sand/50">
                  Reparte lo pendiente entre las personas no bloqueadas (mínimo de personas por proyecto), dentro de la
                  ventana de cada proyecto (por defecto, hasta el 15 del último mes), y rellena la jornada con Soporte a
                  Usuarios. La última quincena se deja a Soporte salvo que sea la única que queda o que un proyecto
                  termine en ella. Antes de guardar verás quién queda afectado; después, todo se puede corregir a mano
                  en «Imputación» y volver a recalcular.
                </p>
                <label className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-sand/60">
                  <span className="font-bold uppercase tracking-wide text-sand/50">Recalcular desde</span>
                  <select value={desdeReparto} onChange={(e) => { setPreview(null); setDesdeReparto(e.target.value); }}
                    className={`${FIELD} !py-1.5 text-[12px]`}>
                    <option value="">
                      {hoyQ > 6 ? "Automático (el trimestre ya terminó: elige una quincena)" : `La quincena actual (${qs[qActualN - 1]?.label})`}
                    </option>
                    {qs.map((x) => (
                      <option key={x.n} value={x.n}>{x.label}{x.n < hoyQ ? " · ya pasada" : x.n === hoyQ ? " · actual" : ""}</option>
                    ))}
                  </select>
                </label>
                {desdeReparto !== "" && Number(desdeReparto) < hoyQ && (
                  <p className="mb-3 rounded-lg border border-mandarin/40 bg-mandarin/10 px-2.5 py-1.5 text-[11px] font-bold text-mandarin">
                    Reescribirá quincenas ya pasadas (lo ya imputado en ellas se recalcula).
                  </p>
                )}
                <button type="button" onClick={() => calcularReparto(desdeReparto === "" ? {} : { desde: Number(desdeReparto) })} className={BTN.ok}>
                  <IconReload size={13} /> Calcular reparto
                </button>
                <PreviewReparto preview={preview} qs={qs} nombreProy={nombreProy} onConfirm={confirmarReparto} onDiscard={() => setPreview(null)} />
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
