"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { GLASS, FIELD, TEXT, Kpi, Chip, EmptyCard } from "./ui";
import { IconPlus, IconX, IconAlert, IconList } from "./icons";
import { IconFolder, IconCheck } from "../icons";
import { EJEMPLO } from "../seguimiento/ejemplo";
import {
  FASES, ESTADOS, ESTADO, TIPOS_TRASPASO, TIPOS_INCIDENCIA, ICONOS,
  cifras, nombreFichero, rutaDrive, fechaLarga, toISO, resumenProyecto, estadoTarea,
  trimestreDe, sumarTrimestres, etiquetaTrimestre, trimestreGantt,
  docVacio, combinarDocs, qTimeReport, resumenTimeReport,
} from "../seguimiento/modelo";
import { docDesdePptx } from "../seguimiento/importarPptx";
import { generarPresentacion } from "../seguimiento/plantillaPptx";

/* Seguimiento RDR · panel de COORDINACIÓN.
   UNA PESTAÑA POR COORDINADOR (equipo.json): cada uno edita sus proyectos
   (con sus tareas), incidencias y traspasos y genera SU presentación .pptx
   con la plantilla de components/seguimiento/. La pestaña «Resumen» junta
   las que se marquen en la presentación combinada (Seguimiento RDR Global).
   Todas terminan con el Time Report del trimestre (backend timereportBackend).

   Los datos viven en el Apps Script "seguimientoBackend"
   (apps-script/seguimiento/Codigo_Seguimiento.gs, un JSON por pestaña en
   Drive) y se guardan solos; con revisión por pestaña para no pisarse.
   «Guardar en Drive» deja la presentación en <raíz>/2026/9. Septiembre/: si ya
   existe la sobrescribe (mismo enlace) y si no, la crea. */

// Borrador de la versión anterior (todo en este navegador): se puede copiar a una pestaña.
const CLAVE = "rdr_seguimiento_borrador";
const ASSETS = "/team-hub/seguimiento/";
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const clonar = (x) => JSON.parse(JSON.stringify(x));

const leerBorrador = () => {
  try {
    const raw = localStorage.getItem(CLAVE);
    const d = raw ? JSON.parse(raw) : null;
    return d && Array.isArray(d.proyectos) ? d : null;
  } catch {
    return null;
  }
};

// Fecha límite: ISO, trimestre ("Q4", "Q1 2027") o vacía.
const RE_FECHA = /^(\d{4}-\d{2}-\d{2}|Q[1-4](\s*\d{4})?)$/i;

/* Trimestres del selector del Gantt: un año antes y después del de la
   reunión. "" = automático (sigue a la fecha de la reunión). */
const opcionesTrimestre = (d) => {
  const base = trimestreDe(d.fechaReunion);
  const qs = [];
  for (let i = -4; i <= 4; i++) qs.push(sumarTrimestres(base, i));
  if (d.trimestreGantt && !qs.includes(d.trimestreGantt)) qs.push(d.trimestreGantt);
  return [
    { value: "", label: `Automático (${etiquetaTrimestre(base)})` },
    ...qs.sort().map((q) => ({ value: q, label: etiquetaTrimestre(q) })),
  ];
};

const lineas = (txt) => String(txt || "").split("\n");
const sinVacias = (xs) => (xs || []).map((s) => String(s).trim()).filter(Boolean);

/* Lo que se edita puede tener líneas vacías a medio escribir: se limpian
   justo antes de generar. */
const limpiar = (d) => ({
  ...d,
  proyectos: d.proyectos.map((p) => ({
    ...p,
    tareas: (p.tareas || []).map((t) => ({ ...t, estado: estadoTarea(t.estado), comentarios: sinVacias(t.comentarios) })),
  })),
  incidencias: (d.incidencias || []).map((i) => ({ ...i, estado: estadoTarea(i.estado), detalle: sinVacias(i.detalle) })),
});

/** PNG de public/seguimiento -> "image/png;base64,..." (formato de pptxgenjs). */
const blobADataUrl = (blob) =>
  new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => ko(fr.error);
    fr.readAsDataURL(blob);
  });
const blobABase64 = async (blob) => (await blobADataUrl(blob)).replace(/^data:[^,]*,/, "");

async function cargarPng(nombre) {
  const r = await fetch(`${ASSETS}${nombre}`);
  if (!r.ok) throw new Error(`No se pudo cargar ${nombre} (${r.status})`);
  return (await blobADataUrl(await r.blob())).replace(/^data:/, "");
}

async function cargarAssets() {
  const [bbvaRgb, bbvaWhite, nfqBlack, nfqWhite, ...iconos] = await Promise.all([
    cargarPng("bbva-rgb.png"), cargarPng("bbva-white.png"),
    cargarPng("nfq-black.png"), cargarPng("nfq-white.png"),
    ...ICONOS.map((i) => cargarPng(`icon-${i}.png`)),
  ]);
  return { bbvaRgb, bbvaWhite, nfqBlack, nfqWhite, icons: Object.fromEntries(ICONOS.map((i, k) => [i, iconos[k]])) };
}

/** Respuesta del Apps Script -> data, o error legible (HTML = no desplegado/permisos). */
async function leerRespuesta(res) {
  const txt = await res.text();
  if (txt.trim().startsWith("<"))
    throw new Error("El backend respondió HTML en vez de JSON: revisa el despliegue (acceso «Cualquier persona», nueva versión) y ejecuta autorizar().");
  const j = JSON.parse(txt);
  if (!j.ok) throw new Error(j.error || "Error del backend");
  return j.data;
}

const fechaHora = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

// ── Piezas de formulario ────────────────────────────────────────────────────
function Campo({ etiqueta, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">{etiqueta}</span>
      {children}
    </label>
  );
}
const Txt = ({ value, onChange, className = "", ...p }) => (
  <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`${FIELD} w-full ${className}`} {...p} />
);
const Sel = ({ value, onChange, opciones, className = "" }) => (
  <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={`${FIELD} w-full ${className}`}>
    {opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
  </select>
);
const Area = ({ value, onChange, rows = 2, placeholder }) => (
  <textarea
    value={(value || []).join("\n")} onChange={(e) => onChange(lineas(e.target.value))}
    rows={rows} placeholder={placeholder}
    className={`${FIELD} block w-full resize-y text-[13px]`}
  />
);
function BotonQuitar({ onClick, titulo }) {
  return (
    <button
      type="button" onClick={onClick} title={titulo} aria-label={titulo}
      className="shrink-0 rounded-lg border border-white/10 p-1.5 text-sand/45 transition hover:border-mandarin/60 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
    >
      <IconX size={14} />
    </button>
  );
}
function BotonAnadir({ onClick, children }) {
  return (
    <button
      type="button" onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs font-bold text-sand/70 transition hover:border-serene/60 hover:text-serene focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
    >
      <IconPlus size={13} /> {children}
    </button>
  );
}

/* Fecha límite: selector de fecha; con el botón «Q» pasa a trimestre (Q4,
   Q1 2027…), que el Gantt pinta «en espera» hasta que se concrete el día. */
function FechaLimite({ value, onChange }) {
  const v = String(value || "").trim();
  const esQ = /^q/i.test(v);
  const [modoQ, setModoQ] = useState(esQ);
  useEffect(() => { if (v) setModoQ(esQ); }, [v, esQ]); // vacía: se queda en el modo elegido
  const anio = new Date().getFullYear();
  const trimestres = [1, 2, 3, 4].map((q) => `Q${q}`).concat([1, 2, 3, 4].map((q) => `Q${q} ${anio + 1}`));
  if (esQ && !trimestres.includes(v.toUpperCase())) trimestres.unshift(v.toUpperCase());
  const iso = RE_FECHA.test(v) && !esQ ? v : "";
  const cambiaModo = () => {
    setModoQ(!modoQ);
    onChange("");
  };
  return (
    <div className="flex gap-1">
      {modoQ ? (
        <select value={esQ ? v.toUpperCase() : ""} onChange={(e) => onChange(e.target.value)} className={`${FIELD} min-w-0 flex-1`}>
          <option value="">—</option>
          {trimestres.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      ) : (
        <input type="date" value={iso} onChange={(e) => onChange(e.target.value)} className={`${FIELD} min-w-0 flex-1`} />
      )}
      <button
        type="button" onClick={cambiaModo}
        title={modoQ ? "Poner un día" : "Poner un trimestre (sin día concreto)"}
        className={`${FIELD} shrink-0 px-2 text-[11px] font-bold ${modoQ ? "text-serene" : "text-sand/60"} hover:text-serene`}
      >
        {modoQ ? "Día" : "Q"}
      </button>
    </div>
  );
}

// ── Tarea ───────────────────────────────────────────────────────────────────
function TareaEditor({ t, set, quitar, subir }) {
  return (
    <div className="rounded-xl border border-white/10 bg-midnight/40 p-3">
      <div className="grid gap-2 sm:grid-cols-12">
        <Campo etiqueta="Fase" className="sm:col-span-2">
          <Sel value={t.fase} onChange={(v) => set({ fase: v })} opciones={FASES} />
        </Campo>
        <Campo etiqueta="Sufijo" className="sm:col-span-1">
          <Txt value={t.sufijo} onChange={(v) => set({ sufijo: v })} placeholder="B1" />
        </Campo>
        <Campo etiqueta="Nombre" className="sm:col-span-3">
          <Txt value={t.nombre} onChange={(v) => set({ nombre: v })} placeholder="(opcional)" />
        </Campo>
        <Campo etiqueta="Inicio (Gantt)" className="sm:col-span-2">
          <input type="date" value={t.inicio || ""} onChange={(e) => set({ inicio: e.target.value || undefined })} className={`${FIELD} w-full`} />
        </Campo>
        <Campo etiqueta="Fecha límite" className="sm:col-span-2">
          <FechaLimite value={t.fecha} onChange={(v) => set({ fecha: v })} />
        </Campo>
        <Campo etiqueta="Asignación" className="sm:col-span-2">
          <Txt value={t.asignacion} onChange={(v) => set({ asignacion: v })} />
        </Campo>
        <Campo etiqueta="Avance %" className="sm:col-span-2">
          <input
            type="number" min={0} max={100} step={5} value={t.avance ?? ""} placeholder="—"
            onChange={(e) => set({ avance: e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))) })}
            className={`${FIELD} w-full tabular-nums`}
          />
        </Campo>
        <Campo etiqueta="Estado" className="sm:col-span-2">
          <Sel value={estadoTarea(t.estado)} onChange={(v) => set({ estado: v })} opciones={ESTADOS} />
        </Campo>
        <Campo etiqueta="Comentarios (uno por línea)" className="sm:col-span-7">
          <Area value={t.comentarios} onChange={(v) => set({ comentarios: v })} />
        </Campo>
        <div className="flex items-end justify-end gap-1.5 sm:col-span-1">
          {subir && (
            <button
              type="button" onClick={subir} title="Subir tarea" aria-label="Subir tarea"
              className="rounded-lg border border-white/10 p-1.5 text-sand/45 transition hover:border-serene/60 hover:text-serene focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            >
              <span aria-hidden className="block h-[14px] w-[14px] text-center text-xs leading-[14px]">↑</span>
            </button>
          )}
          <BotonQuitar onClick={quitar} titulo="Quitar tarea" />
        </div>
      </div>
    </div>
  );
}

// ── Proyecto ────────────────────────────────────────────────────────────────
function ProyectoEditor({ p, idx, total, abierto, toggle, upd, mover }) {
  const set = (cambios) => upd((d) => Object.assign(d.proyectos[idx], cambios));
  const riesgo = (p.tareas || []).some((t) => t.estado === "en_riesgo");
  return (
    <section className={`${GLASS} overflow-hidden`}>
      <div className="flex items-center gap-2 p-3">
        <button
          type="button" onClick={toggle} aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
        >
          <span aria-hidden className={`inline-block text-sand/40 transition ${abierto ? "rotate-90" : ""}`}>▸</span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-bold text-sand">
              {p.nombre || "Proyecto sin nombre"}
              {p.anexo && <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 align-middle font-sans text-[10px] font-bold uppercase text-sand/50">Anexo</span>}
              {riesgo && <span className={`ml-2 align-middle font-sans text-[11px] font-bold ${TEXT.mandarin}`}>● en riesgo</span>}
            </span>
            <span className="block truncate text-[11.5px] text-sand/50">{[p.interno || "—", resumenProyecto(p)].filter(Boolean).join(" · ")}</span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" disabled={idx === 0} onClick={() => mover(-1)} title="Subir" aria-label="Subir proyecto"
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-sand/50 transition hover:text-serene disabled:opacity-25">↑</button>
          <button type="button" disabled={idx === total - 1} onClick={() => mover(1)} title="Bajar" aria-label="Bajar proyecto"
            className="rounded-lg border border-white/10 px-2 py-1 text-xs text-sand/50 transition hover:text-serene disabled:opacity-25">↓</button>
          <BotonQuitar
            titulo="Quitar proyecto"
            onClick={() => { if (confirm(`¿Quitar «${p.nombre || "proyecto"}» y sus tareas?`)) upd((d) => d.proyectos.splice(idx, 1)); }}
          />
        </div>
      </div>

      {abierto && (
        <div className="space-y-3 border-t border-white/10 p-3">
          <div className="grid gap-2 sm:grid-cols-12">
            <Campo etiqueta="Nombre (Iniciativa · Proyecto)" className="sm:col-span-6">
              <Txt value={p.nombre} onChange={(v) => set({ nombre: v })} />
            </Campo>
            <Campo etiqueta="Nombre corto (Gantt)" className="sm:col-span-3">
              <Txt value={p.nombreCorto} onChange={(v) => set({ nombreCorto: v || undefined })} placeholder="(opcional)" />
            </Campo>
            <Campo etiqueta="SDATOOL" className="sm:col-span-3">
              <Txt value={p.sdatool} onChange={(v) => set({ sdatool: v })} placeholder="SDATOOL-00000" />
            </Campo>
            <Campo etiqueta="Traspaso" className="sm:col-span-2">
              <Txt value={p.traspaso} onChange={(v) => set({ traspaso: v })} placeholder="2026-21" />
            </Campo>
            <Campo etiqueta="Responsable interno (BBVA)" className="sm:col-span-4">
              <Txt value={p.interno} onChange={(v) => set({ interno: v })} />
            </Campo>
            <Campo etiqueta="Responsable NFQ" className="sm:col-span-3">
              <Txt value={p.responsable} onChange={(v) => set({ responsable: v })} />
            </Campo>
            <label className="flex items-end gap-2 pb-2 text-[12.5px] text-sand/75 sm:col-span-3">
              <input type="checkbox" checked={!!p.anexo} onChange={(e) => set({ anexo: e.target.checked })} className="h-4 w-4 accent-[#85C8FF]" />
              Anexo (diapositiva oculta al final)
            </label>
          </div>

          <div className="space-y-2">
            {(p.tareas || []).map((t, k) => (
              <TareaEditor
                key={t.id} t={t}
                set={(c) => upd((d) => Object.assign(d.proyectos[idx].tareas[k], c))}
                quitar={() => upd((d) => d.proyectos[idx].tareas.splice(k, 1))}
                subir={k > 0 ? () => upd((d) => { const ts = d.proyectos[idx].tareas; [ts[k - 1], ts[k]] = [ts[k], ts[k - 1]]; }) : null}
              />
            ))}
            {!(p.tareas || []).length && <p className="text-xs text-sand/45">Sin tareas todavía.</p>}
          </div>
          <BotonAnadir
            onClick={() => upd((d) => {
              const ts = (d.proyectos[idx].tareas ||= []);
              const ult = ts[ts.length - 1];
              ts.push({ id: uid("t"), fase: ult?.fase || "analisis", nombre: "", fecha: "", comentarios: [], asignacion: p.responsable || "", avance: 0, estado: "sin_iniciar" });
            })}
          >
            Añadir tarea
          </BotonAnadir>
        </div>
      )}
    </section>
  );
}

// ── Datos compartidos: por semana, una pestaña por coordinador (backend) ────
/* Cada pestaña de cada semana (lunes) vive en el Apps Script (Drive) con un
   número de revisión. Los cambios se guardan solos a los 1,5 s; si otra
   persona ha guardado la misma pestaña entretanto, el backend responde
   CONFLICTO y no se pisa nada. Lo que aún no se ha guardado se copia en
   localStorage por si se cierra la página. Una pestaña sin datos esa semana
   muestra lo de su semana anterior ("previas") y se guarda al primer cambio. */
const AUTOGUARDADO_MS = 1500;
const clavePendiente = (id, semana) => `rdr_seguimiento_pendiente_${id}_${semana}`;

function useSeguimiento(backendUrl, email, semana) {
  const [estado, setEstado] = useState({ cargando: true, error: "" });
  const [coordinadores, setCoordinadores] = useState([]);
  const [tabs, setTabs] = useState({}); // id -> { doc, rev, actualizado, por, ver, verGuardada, guardando, error, conflicto }
  const [previas, setPrevias] = useState({}); // id -> { semana, doc } (sin datos esta semana)
  const [semanas, setSemanas] = useState([]); // [{ semana, ids }] con datos
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const peticion = useRef(0); // descarta respuestas de una semana que ya no se mira

  const llamar = useCallback(async (body) => {
    return leerRespuesta(await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ email, ...body }),
    }));
  }, [backendUrl, email]);

  // silencioso: refresco en segundo plano (Resumen) sin pantalla de carga.
  const cargar = useCallback(async (silencioso = false) => {
    if (!backendUrl || !email || !semana) return;
    const n = ++peticion.current;
    if (!silencioso) { setEstado({ cargando: true, error: "" }); setTabs({}); setPrevias({}); }
    try {
      const d = await llamar({ action: "datos", semana });
      if (n !== peticion.current) return;
      const t = {};
      for (const [id, p] of Object.entries(d.pestanas || {}))
        t[id] = { doc: p.doc, rev: p.rev || 0, actualizado: p.actualizado, por: p.por, ver: 0, verGuardada: 0 };
      // Cambios que no llegaron a guardarse (página cerrada a tiempo): se
      // recuperan solo si nadie ha guardado esa pestaña después.
      for (const id of [...(d.coordinadores || []).map((c) => c.id), "resumen"]) {
        try {
          const p = JSON.parse(localStorage.getItem(clavePendiente(id, semana)) || "null");
          if (p && p.doc && (p.rev || 0) === (t[id]?.rev || 0)) t[id] = { ...(t[id] || { rev: 0 }), doc: p.doc, ver: 1, verGuardada: 0 };
          else if (p) localStorage.removeItem(clavePendiente(id, semana));
        } catch { /* sin almacenamiento */ }
      }
      setCoordinadores(d.coordinadores || []);
      setTabs(t);
      setPrevias(d.previas || {});
      setSemanas(d.semanas || []);
      setEstado({ cargando: false, error: "" });
    } catch (e) {
      if (n === peticion.current && !silencioso) setEstado({ cargando: false, error: String(e?.message || e) });
    }
  }, [backendUrl, email, semana, llamar]);
  useEffect(() => { cargar(); }, [cargar]);
  const refrescar = useCallback(() => {
    // Solo si no hay nada a medio guardar: si no, se esperaría al autoguardado.
    const t = tabsRef.current;
    if (Object.values(t).some((x) => x.ver > x.verGuardada || x.guardando)) return;
    cargar(true);
  }, [cargar]);

  const editar = useCallback((id, fn, base) => {
    setTabs((all) => {
      const cur = all[id] || { doc: base ? base() : docVacio(), rev: 0, ver: 0, verGuardada: 0 };
      const doc = clonar(cur.doc);
      fn(doc);
      if (id !== "resumen") doc.fechaReunion = semana; // la fecha es la semana (su lunes)
      try { localStorage.setItem(clavePendiente(id, semana), JSON.stringify({ rev: cur.rev || 0, doc })); } catch { /* lleno */ }
      return { ...all, [id]: { ...cur, doc, ver: (cur.ver || 0) + 1, error: "" } };
    });
  }, [semana]);

  const guardar = useCallback(async (id, forzar = false) => {
    const t = tabsRef.current[id];
    if (!t) return;
    const ver = t.ver;
    setTabs((all) => ({ ...all, [id]: { ...all[id], guardando: true } }));
    try {
      const r = await llamar({ action: "guardar", id, semana, doc: t.doc, rev: t.rev || 0, forzar });
      setTabs((all) => {
        const cur = all[id];
        if (!cur) return all;
        if (cur.ver === ver) try { localStorage.removeItem(clavePendiente(id, semana)); } catch { /* */ }
        else try { localStorage.setItem(clavePendiente(id, semana), JSON.stringify({ rev: r.rev, doc: cur.doc })); } catch { /* */ }
        return { ...all, [id]: { ...cur, rev: r.rev, actualizado: r.actualizado, por: r.por, verGuardada: ver, guardando: false, error: "", conflicto: "" } };
      });
    } catch (e) {
      const m = String(e?.message || e);
      const conflicto = m.startsWith("CONFLICTO") ? m.replace(/^CONFLICTO:\s*/, "") : "";
      setTabs((all) => (all[id] ? { ...all, [id]: { ...all[id], guardando: false, conflicto, error: conflicto ? "" : m } } : all));
    }
  }, [llamar, semana]);

  // Autoguardado: lo que tenga cambios y no esté ya guardándose ni en conflicto o error.
  useEffect(() => {
    const pend = Object.entries(tabs).filter(([, t]) => t.ver > t.verGuardada && !t.guardando && !t.conflicto && !t.error);
    if (!pend.length) return;
    const h = setTimeout(() => pend.forEach(([id]) => guardar(id)), AUTOGUARDADO_MS);
    return () => clearTimeout(h);
  }, [tabs, guardar]);

  // Avisar antes de cerrar con cambios sin guardar.
  useEffect(() => {
    const sucio = Object.values(tabs).some((t) => t.ver > t.verGuardada);
    if (!sucio) return;
    const fn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [tabs]);

  // Algo a punto de guardarse (no cuenta lo que espera a que se resuelva un conflicto o error).
  const sucio = Object.values(tabs).some((t) => t.guardando || (t.ver > t.verGuardada && !t.conflicto && !t.error));
  return { estado, coordinadores, tabs, previas, semanas, sucio, cargar, refrescar, editar, guardar, llamar };
}

/** Estado de guardado de una pestaña (texto + acciones si hay conflicto/error). */
function EstadoGuardado({ t, guardar, recargar }) {
  if (!t) return <span className="text-[11.5px] text-sand/40">Sin guardar en esta semana: se guarda sola al primer cambio.</span>;
  if (t.conflicto)
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-mandarin/50 bg-mandarin/10 px-2.5 py-1.5 text-[11.5px] font-bold text-mandarin">
        <IconAlert size={12} /> {t.conflicto}
        <button type="button" onClick={recargar} className="underline hover:text-sand">Ver su versión (descarta tus cambios)</button>
        <button type="button" onClick={() => { if (confirm("¿Sobrescribir con tu versión? Se perderán los cambios de la otra persona.")) guardar(true); }} className="underline hover:text-sand">Guardar la mía</button>
      </span>
    );
  if (t.error)
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-[11.5px] font-bold text-canary">
        <IconAlert size={12} /> No se pudo guardar: {t.error}
        <button type="button" onClick={() => guardar(false)} className="underline hover:text-sand">Reintentar</button>
      </span>
    );
  if (t.guardando) return <span className="text-[11.5px] text-sand/50">Guardando…</span>;
  if (t.ver > t.verGuardada) return <span className="text-[11.5px] text-sand/50">Cambios sin guardar…</span>;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] ${TEXT.lime}`}>
      <IconCheck size={12} /> Guardado{t.actualizado ? ` ${fechaHora(t.actualizado)}` : ""}{t.por ? ` · ${t.por}` : ""}
    </span>
  );
}

// ── Generación de la presentación (pestaña o combinada) ─────────────────────
/** Resumen del Time Report del Q del Gantt; lanza error si no se puede leer. */
async function leerTimeReport(trUrl, datos) {
  if (!trUrl) throw new Error("falta timereportBackend en links.json");
  const q = qTimeReport(trimestreGantt(datos));
  const sep = trUrl.includes("?") ? "&" : "?";
  const res = await fetch(`${trUrl}${sep}action=snapshot&q=${encodeURIComponent(q)}`, { cache: "no-store" }).then((r) => r.json());
  if (!res || !res.ok) throw new Error((res && res.error) || "respuesta inesperada");
  return { q, filas: resumenTimeReport(res.data, q, datos.fechaReunion) };
}

/* Botones «Guardar en Drive» / «Descargar .pptx» y estado del fichero en Drive.
   quien: id del coordinador ("" = combinada); autor: su nombre.
   borrar (solo la combinada): [{ quien, fecha }] de las presentaciones
   independientes que incluye; al guardarla en Drive van a la papelera. */
function Presentacion({ datos, quien, autor, borrar, backendUrl, trUrl, email, children }) {
  const [gen, setGen] = useState({ fase: "idle" }); // idle | generando | subiendo | ok | drive | error
  const [drive, setDrive] = useState(null);
  const fecha = datos?.fechaReunion || "";

  // ¿Existe ya esta presentación en Drive? (se actualizará o se creará)
  useEffect(() => {
    if (!backendUrl || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setDrive(null); return; }
    let vivo = true;
    setDrive({ cargando: true });
    const t = setTimeout(async () => {
      try {
        const sep = backendUrl.includes("?") ? "&" : "?";
        const d = await leerRespuesta(await fetch(`${backendUrl}${sep}action=estado&fecha=${fecha}&quien=${encodeURIComponent(quien)}`));
        if (vivo) setDrive(d);
      } catch (e) {
        if (vivo) setDrive({ error: String(e?.message || e) });
      }
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [backendUrl, fecha, quien]);

  const crearPres = async () => {
    const limpio = limpiar(datos);
    const [{ default: PptxGenJS }, assets, tr] = await Promise.all([
      import("pptxgenjs"), cargarAssets(),
      leerTimeReport(trUrl, limpio).then((x) => ({ x }), (e) => ({ error: String(e?.message || e) })),
    ]);
    const pres = generarPresentacion(PptxGenJS, limpio, assets, { autor, timeReport: tr.x || null });
    return { pres, avisoTR: tr.error || "" };
  };

  const guardarDrive = async () => {
    setGen({ fase: "subiendo" });
    try {
      const { pres, avisoTR } = await crearPres();
      // write() de pptxgenjs 4 ignora compression cuando lleva outputType (y
      // sin outputType falla); exportPresentation es lo que usa writeFile en
      // el navegador: blob comprimido (~600 KB en vez de ~1,4 MB) -> base64.
      const blob = pres.exportPresentation
        ? await pres.exportPresentation({ compression: true })
        : await pres.write({ outputType: "blob" });
      const base64 = await blobABase64(blob);
      const d = await leerRespuesta(await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        // doc: sus datos, para poder copiarla tal cual más adelante («Copiar de…»).
        body: JSON.stringify({ action: "subir", fecha, email, base64, quien, doc: limpiar(datos), ...(borrar ? { borrar } : {}) }),
      }));
      setGen({ fase: "drive", avisoTR, ...d });
      setDrive({ existe: true, nombre: d.nombre, ruta: d.ruta, url: d.url, carpetaUrl: d.carpetaUrl, modificado: d.modificado });
    } catch (e) {
      console.error(e);
      setGen({ fase: "error", error: String(e?.message || e) });
    }
  };

  const descargar = async () => {
    setGen({ fase: "generando" });
    try {
      const { pres, avisoTR } = await crearPres();
      // "/" no vale en un nombre de fichero: el navegador lo cambiaría por "_".
      const fichero = nombreFichero(fecha, autor).replaceAll("/", "-");
      await pres.writeFile({ fileName: fichero, compression: true });
      setGen({ fase: "ok", fichero, avisoTR });
    } catch (e) {
      console.error(e);
      setGen({ fase: "error", error: String(e?.message || e) });
    }
  };

  const ruta = rutaDrive(fecha);
  const ocupado = gen.fase === "generando" || gen.fase === "subiendo";
  const vacio = !(datos?.proyectos || []).length;

  return (
    <section className={`${GLASS} mb-4 p-4`} aria-label="Presentación">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={guardarDrive}
            disabled={ocupado || !fecha || !backendUrl || vacio}
            title={vacio ? "No hay proyectos que presentar" : "Genera la presentación y la guarda en la carpeta de Drive de la reunión"}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            style={{ background: PALETTE.serene }}
          >
            {gen.fase === "subiendo"
              ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Guardando en Drive…</>
              : <><IconFolder size={15} /> {borrar ? "Combinar y guardar en Drive" : drive?.existe ? "Actualizar en Drive" : "Guardar en Drive"}</>}
          </button>
          <button
            type="button" onClick={descargar} disabled={ocupado || !fecha || vacio}
            className={`${FIELD} px-3 py-2.5 text-xs font-bold hover:border-white/30 disabled:opacity-40`}
          >
            {gen.fase === "generando" ? "Generando…" : "Descargar .pptx"}
          </button>
        </div>
      </div>

      {/* Dónde va a parar en Drive (antes de guardar) */}
      {!backendUrl ? null : drive?.cargando ? (
        <p className="mt-3 text-[11.5px] text-sand/45">Comprobando Drive…</p>
      ) : drive?.error ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-canary"><IconAlert size={12} /> Drive: {drive.error}</p>
      ) : drive?.existe ? (
        <p className="mt-3 text-[11.5px] text-sand/55">
          Ya existe en Drive <b className="text-sand/80">{drive.ruta.replace("/", " / ")} / {drive.nombre}</b>
          {drive.modificado && <> (modificada {fechaHora(drive.modificado)})</>}: al guardar se <b className="text-sand/80">actualiza</b> (mismo enlace; la versión anterior queda en el historial de Drive).{" "}
          <a href={drive.url} target="_blank" rel="noopener noreferrer" className="font-bold text-serene hover:underline">Abrir</a>
        </p>
      ) : drive ? (
        <p className="mt-3 text-[11.5px] text-sand/55">
          Se creará en Drive: <b className="text-sand/80">{ruta.join(" / ")} / {drive.nombre}</b>
          {!drive.carpetaUrl && " (la carpeta del mes también se crea)"}.
        </p>
      ) : null}

      {gen.fase === "drive" && (
        <p className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold ${TEXT.lime}`}>
          <IconCheck size={14} /> Presentación {gen.accion} en Drive: {gen.ruta.replace("/", " / ")} / {gen.nombre}.
          <a href={gen.url} target="_blank" rel="noopener noreferrer" className="text-serene hover:underline">Abrir presentación</a>
          <span className="text-sand/30">·</span>
          <a href={gen.carpetaUrl} target="_blank" rel="noopener noreferrer" className="text-serene hover:underline">Abrir carpeta</a>
        </p>
      )}
      {gen.fase === "drive" && borrar && (
        <p className="mt-1.5 text-xs text-sand/60">
          {gen.borradas?.length
            ? <>Presentaciones independientes enviadas a la papelera de Drive: {gen.borradas.join(" · ")}.</>
            : "No había presentaciones independientes que borrar."}
        </p>
      )}
      {borrar && gen.fase !== "drive" && (
        <p className="mt-2 text-[11.5px] text-sand/45">
          Al combinar se mandan a la papelera de Drive las presentaciones independientes de las pestañas incluidas. Si alguien cambia su pestaña después, puede volver a generar la suya; la siguiente combinación la vuelve a borrar.
        </p>
      )}
      {gen.fase === "ok" && (
        <p className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold ${TEXT.lime}`}>
          <IconCheck size={14} /> Descargada «{gen.fichero}».
        </p>
      )}
      {(gen.fase === "ok" || gen.fase === "drive") && gen.avisoTR && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-canary">
          <IconAlert size={13} /> Sin diapositiva del Time Report: no se pudo leer ({gen.avisoTR}).
        </p>
      )}
      {gen.fase === "error" && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
          <IconAlert size={13} /> No se pudo completar: {gen.error}
        </p>
      )}
    </section>
  );
}

/** Trimestre del Gantt y del Time Report (la fecha es la semana, arriba). */
function CamposReunion({ datos, set }) {
  return (
    <Campo etiqueta="Trimestre del Gantt y del Time Report">
      <select
        value={datos.trimestreGantt || ""}
        onChange={(e) => set({ trimestreGantt: e.target.value })}
        title="El Gantt muestra los 3 meses del trimestre y el mes siguiente; el Time Report, ese trimestre"
        className={`${FIELD} block`}
      >
        {opcionesTrimestre(datos).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Campo>
  );
}

// ── Copiar de otra semana / presentación de Drive ───────────────────────────
/* Trae proyectos, incidencias y traspasos de:
     - otra semana (la tuya o la pestaña de otro coordinador),
     - una presentación de Drive: las hechas a mano (desde 2024) y las
       autogeneradas por esta página (el backend lee el .pptx e importarPptx.js
       lo convierte; de las subidas con sus datos, se copian exactas),
     - el borrador que se usaba antes en este navegador o el ejemplo del 28/09.
   Se marcan solos los proyectos y traspasos cuyo responsable NFQ coincide con
   el nombre de la pestaña. Se añaden, o sustituyen lo que hay si se marca. */
function CopiarDe({ nombre, idActual, comun, onCopiar, onCerrar }) {
  const { semana, semanas, coordinadores, llamar } = comun;
  const nombreDe = (id) => coordinadores.find((c) => c.id === id)?.nombre || id;
  const conDatos = useMemo(
    () => semanas.filter((x) => x.semana !== semana || x.ids.some((i) => i !== idActual)).slice().reverse(),
    [semanas, semana, idActual],
  );
  const viejo = useMemo(() => leerBorrador(), []);
  const [origen, setOrigen] = useState(conDatos.length ? "semana" : "drive");
  const [selSemana, setSelSemana] = useState(conDatos[0]?.semana || "");
  const idsSemana = conDatos.find((x) => x.semana === selSemana)?.ids.filter((i) => selSemana !== semana || i !== idActual) || [];
  const [selId, setSelId] = useState("");
  useEffect(() => {
    setSelId(idsSemana.includes(idActual) ? idActual : idsSemana[0] || "");
  }, [selSemana]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hist, setHist] = useState(null); // { lista } | { error }
  const [anio, setAnio] = useState("");
  const [fichero, setFichero] = useState("");
  useEffect(() => {
    if (origen !== "drive" || hist) return;
    llamar({ action: "historico" }).then(
      (lista) => {
        setHist({ lista });
        const a = lista[0]?.anio;
        setAnio(a ? String(a) : "");
        setFichero(lista[0]?.id || "");
      },
      (e) => setHist({ error: String(e?.message || e) }),
    );
  }, [origen, hist, llamar]);
  const anios = [...new Set((hist?.lista || []).map((x) => String(x.anio)))];
  const ficheros = (hist?.lista || []).filter((x) => String(x.anio) === anio);

  // Documento de origen.
  const [carga, setCarga] = useState({ estado: "idle", doc: null, error: "" });
  useEffect(() => {
    let vivo = true;
    const fin = (doc) => vivo && setCarga({ estado: "ok", doc: doc || docVacio(), error: "" });
    const mal = (e) => vivo && setCarga({ estado: "error", doc: null, error: String(e?.message || e) });
    if (origen === "borrador") fin(viejo);
    else if (origen === "ejemplo") fin(EJEMPLO);
    else if (origen === "semana") {
      if (!selSemana || !selId) { setCarga({ estado: "idle", doc: null, error: "" }); return; }
      setCarga({ estado: "cargando", doc: null, error: "" });
      llamar({ action: "semana", id: selId, semana: selSemana }).then((r) => fin(r?.doc), mal);
    } else if (origen === "drive") {
      if (!fichero) { setCarga({ estado: "idle", doc: null, error: "" }); return; }
      const f = (hist?.lista || []).find((x) => x.id === fichero);
      setCarga({ estado: "cargando", doc: null, error: "" });
      llamar({ action: "leerPptx", id: fichero }).then((raw) => fin(docDesdePptx(raw, f?.fecha || semana)), mal);
    }
    return () => { vivo = false; };
  }, [origen, selSemana, selId, fichero]); // eslint-disable-line react-hooks/exhaustive-deps

  const pila = nombre.split(" ")[0].toLowerCase();
  const esMio = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\s,/]+/)
    .includes(pila.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const [sel, setSel] = useState({});
  const [sustituir, setSustituir] = useState(false);
  const d = carga.doc || docVacio();
  const todos = (v) => {
    const s = {};
    (d.proyectos || []).forEach((p) => { s[`p:${p.id}`] = v === "mios" ? esMio(p.responsable) : v; });
    (d.traspasos || []).forEach((t) => { s[`t:${t.id}`] = v === "mios" ? esMio(t.nfq) : v; });
    (d.incidencias || []).forEach((i) => { s[`i:${i.id}`] = v === "mios" ? false : v; });
    setSel(s);
  };
  // Otra semana de la MISMA pestaña: todo marcado. Si no, solo lo suyo.
  useEffect(() => { if (carga.doc) todos(origen === "semana" && selId === idActual ? true : "mios"); }, [carga.doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Object.values(sel).filter(Boolean).length;
  const Fila = ({ k, titulo, sub }) => (
    <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-sand/80 hover:bg-white/5">
      <input type="checkbox" checked={!!sel[k]} onChange={(e) => setSel((s) => ({ ...s, [k]: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#85C8FF]" />
      <span><b className="text-sand">{titulo || "—"}</b>{sub && <span className="block text-[11px] text-sand/50">{sub}</span>}</span>
    </label>
  );
  const Opc = ({ v, children, disabled }) => (
    <button type="button" disabled={disabled} onClick={() => setOrigen(v)}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition disabled:opacity-30 ${origen === v ? "border-serene/70 bg-serene/15 text-serene" : "border-white/15 text-sand/70 hover:text-sand"}`}>
      {children}
    </button>
  );

  return (
    <section className={`${GLASS} mb-4 p-4`} aria-label="Copiar de otra fuente">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Copiar de</span>
        <Opc v="semana" disabled={!conDatos.length}>Otra semana</Opc>
        <Opc v="drive">Presentación de Drive</Opc>
        {viejo && <Opc v="borrador">Borrador anterior de este navegador</Opc>}
        <Opc v="ejemplo">Ejemplo 28/09/2026</Opc>
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        {origen === "semana" && (
          <>
            <Campo etiqueta="Semana">
              <select value={selSemana} onChange={(e) => setSelSemana(e.target.value)} className={`${FIELD} block`}>
                {conDatos.map((x) => <option key={x.semana} value={x.semana}>Semana del lunes {fechaCortaEs(x.semana)}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Pestaña">
              <select value={selId} onChange={(e) => setSelId(e.target.value)} className={`${FIELD} block`}>
                {idsSemana.map((i) => <option key={i} value={i}>{nombreDe(i)}</option>)}
              </select>
            </Campo>
          </>
        )}
        {origen === "drive" && (
          hist?.error ? <p className="text-xs font-bold text-mandarin">No se pudo listar el histórico: {hist.error}</p>
            : !hist ? <p className="text-xs text-sand/50">Buscando presentaciones en Drive…</p>
              : !hist.lista.length ? <p className="text-xs text-sand/50">No hay presentaciones en la carpeta de Drive.</p>
                : (
                  <>
                    <Campo etiqueta="Año">
                      <select value={anio} onChange={(e) => { setAnio(e.target.value); setFichero(hist.lista.find((x) => String(x.anio) === e.target.value)?.id || ""); }} className={`${FIELD} block`}>
                        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </Campo>
                    <Campo etiqueta="Presentación">
                      <select value={fichero} onChange={(e) => setFichero(e.target.value)} className={`${FIELD} block max-w-[22rem]`}>
                        {ficheros.map((f) => <option key={f.id} value={f.id}>{f.nombre.includes(fechaCortaEs(f.fecha)) ? f.nombre : `${fechaCortaEs(f.fecha)} · ${f.nombre}`}</option>)}
                      </select>
                    </Campo>
                  </>
                )
        )}
        <label className="flex items-center gap-2 pb-2 text-[12px] text-sand/75">
          <input type="checkbox" checked={sustituir} onChange={(e) => setSustituir(e.target.checked)} className="h-4 w-4 accent-[#85C8FF]" />
          Sustituir lo que hay en la pestaña
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onCerrar} className={`${FIELD} px-3 py-2 text-xs font-bold`}>Cancelar</button>
          <button
            type="button" disabled={!n || carga.estado !== "ok"}
            onClick={() => {
              if (sustituir && !confirm(`¿Sustituir todo lo de la pestaña de ${nombre} por los ${n} elementos marcados?`)) return;
              onCopiar({
                proyectos: (d.proyectos || []).filter((p) => sel[`p:${p.id}`]),
                incidencias: (d.incidencias || []).filter((i) => sel[`i:${i.id}`]),
                traspasos: (d.traspasos || []).filter((t) => sel[`t:${t.id}`]),
                sustituir,
              });
            }}
            className="rounded-lg px-3 py-2 text-xs font-bold text-[#001391] disabled:opacity-40" style={{ background: PALETTE.serene }}
          >
            Copiar {n} {n === 1 ? "elemento" : "elementos"}
          </button>
        </div>
      </div>

      {carga.estado === "cargando" ? (
        <p className="py-6 text-center text-xs text-sand/50">{origen === "drive" ? "Leyendo la presentación (puede tardar unos segundos)…" : "Cargando…"}</p>
      ) : carga.estado === "error" ? (
        <p className="py-3 text-xs font-bold text-mandarin">No se pudo leer: {carga.error}</p>
      ) : carga.doc ? (
        <>
          <div className="mb-1 flex gap-3 px-2 text-[11px] font-bold text-sand/50">
            <button type="button" className="hover:text-serene" onClick={() => todos(true)}>Todo</button>
            <button type="button" className="hover:text-serene" onClick={() => todos(false)}>Nada</button>
            <button type="button" className="hover:text-serene" onClick={() => todos("mios")}>Los de {nombre.split(" ")[0]}</button>
          </div>
          <div className="grid max-h-96 gap-x-4 overflow-auto sm:grid-cols-3">
            <div><p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Proyectos · {(d.proyectos || []).length}</p>
              {(d.proyectos || []).map((p) => <Fila key={p.id} k={`p:${p.id}`} titulo={p.nombre} sub={[p.interno, p.responsable, `${(p.tareas || []).length} tareas`, p.anexo && "anexo"].filter(Boolean).join(" · ")} />)}</div>
            <div><p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Incidencias y tareas · {(d.incidencias || []).length}</p>
              {(d.incidencias || []).map((i) => <Fila key={i.id} k={`i:${i.id}`} titulo={i.titulo} sub={(TIPOS_INCIDENCIA.find((t) => t.id === i.tipo) || {}).label} />)}</div>
            <div><p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Traspasos · {(d.traspasos || []).length}</p>
              {(d.traspasos || []).map((t) => <Fila key={t.id} k={`t:${t.id}`} titulo={`${t.codigo || ""} ${t.proyecto || ""}`} sub={t.nfq} />)}</div>
          </div>
        </>
      ) : null}
    </section>
  );
}

// ── Editor de una pestaña ───────────────────────────────────────────────────
function EditorPestana({ id, nombre, esMia, t, previa, upd, guardar, recargar, comun }) {
  const datos = t?.doc || (previa ? { ...previa.doc, fechaReunion: comun.semana } : docVacio(comun.semana));
  const [tab, setTab] = useState("proyectos");
  const [abiertos, setAbiertos] = useState({});
  const [copiando, setCopiando] = useState(false);
  const fileRef = useRef(null);
  const c = useMemo(() => cifras(datos), [datos]);
  const nProy = datos.proyectos.length;

  const exportar = () => {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seguimiento-${nombre.replace(/\s+/g, "_")}-${datos.fechaReunion || "borrador"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importar = async (file) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.proyectos)) throw new Error("no tiene la lista de proyectos");
      if (!confirm(`¿Sustituir todo el contenido de la pestaña de ${nombre} por el del JSON?`)) return;
      upd((x) => { Object.keys(x).forEach((k) => delete x[k]); Object.assign(x, { incidencias: [], traspasos: [], ...d }); });
      setAbiertos({});
    } catch (e) {
      alert(`No se pudo importar el JSON: ${e.message || e}`);
    }
  };
  const copiar = ({ proyectos, incidencias, traspasos, sustituir }) => {
    const nuevo = (pre) => (x) => ({ ...clonar(x), id: uid(pre) });
    upd((d) => {
      if (sustituir) { d.proyectos = []; d.incidencias = []; d.traspasos = []; }
      d.proyectos.push(...proyectos.map(nuevo("p")));
      (d.incidencias ||= []).push(...incidencias.map(nuevo("i")));
      (d.traspasos ||= []).push(...traspasos.map(nuevo("tr")));
    });
    setCopiando(false);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display text-2xl font-bold text-sand">{nombre}</h2>
        {!esMia && <span className="rounded-full border border-canary/40 px-2.5 py-0.5 text-[11px] font-bold text-canary">Estás editando la pestaña de otra persona</span>}
        <EstadoGuardado t={t} guardar={(f) => guardar(id, f)} recargar={recargar} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCopiando((v) => !v)} className={`${FIELD} px-3 py-2 text-xs font-bold hover:border-white/30`}>Copiar de…</button>
          <button type="button" onClick={exportar} className={`${FIELD} px-3 py-2 text-xs font-bold hover:border-white/30`}>Exportar JSON</button>
          <button type="button" onClick={() => fileRef.current?.click()} className={`${FIELD} px-3 py-2 text-xs font-bold hover:border-white/30`}>Importar JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </div>

      {!t && previa && (
        <p className="mb-3 rounded-lg border border-serene/30 bg-serene/10 px-3 py-2 text-[12px] text-sand/80">
          Esta semana aún no tiene datos guardados: se muestra lo de <b>la semana del lunes {fechaCortaEs(previa.semana)}</b>. Al primer cambio se guarda como esta semana (la anterior no se toca).
        </p>
      )}
      {copiando && <CopiarDe nombre={nombre} idActual={id} comun={comun} onCopiar={copiar} onCerrar={() => setCopiando(false)} />}

      <Presentacion datos={datos} quien={id} autor={nombre} {...comun.backend}>
        <CamposReunion datos={datos} set={(cambios) => upd((d) => Object.assign(d, cambios))} />
      </Presentacion>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Proyectos" value={c.proyectos} />
        <Kpi label="Tareas" value={c.tareas} accent="aqua" />
        <Kpi label="Al 100 %" value={c.hechas} accent="lime" />
        <Kpi label="En riesgo" value={c.riesgo} accent="mandarin" />
        <Kpi label="Bloqueadas" value={c.bloqueadas} accent="purple" />
        <Kpi label="Incid. / traspasos" value={`${c.incidencias + c.tareasAbiertas} / ${c.traspasos}`} accent="canary" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        <Chip on={tab === "proyectos"} onClick={() => setTab("proyectos")}>Proyectos · {nProy}</Chip>
        <Chip on={tab === "incidencias"} onClick={() => setTab("incidencias")}>Incidencias · {(datos.incidencias || []).length}</Chip>
        <Chip on={tab === "traspasos"} onClick={() => setTab("traspasos")}>Traspasos · {(datos.traspasos || []).length}</Chip>
      </div>

      {tab === "proyectos" && (
        <div className="space-y-3">
          {nProy > 0 && (
            <div className="flex justify-end gap-3 text-[11px] font-bold text-sand/50">
              <button type="button" className="hover:text-serene" onClick={() => setAbiertos(Object.fromEntries(datos.proyectos.map((p) => [p.id, true])))}>Desplegar todos</button>
              <button type="button" className="hover:text-serene" onClick={() => setAbiertos({})}>Plegar todos</button>
            </div>
          )}
          {datos.proyectos.map((p, i) => (
            <ProyectoEditor
              key={p.id} p={p} idx={i} total={nProy} upd={upd}
              abierto={!!abiertos[p.id]}
              toggle={() => setAbiertos((a) => ({ ...a, [p.id]: !a[p.id] }))}
              mover={(dir) => upd((d) => { const ps = d.proyectos; [ps[i], ps[i + dir]] = [ps[i + dir], ps[i]]; })}
            />
          ))}
          {!nProy && <EmptyCard>No hay proyectos en esta pestaña. Añade el primero o usa «Copiar de…» para traerlos de otra pestaña o del borrador anterior.</EmptyCard>}
          <BotonAnadir
            onClick={() => {
              const pid = uid("p");
              upd((d) => d.proyectos.push({ id: pid, nombre: "", sdatool: "", traspaso: "", interno: "", responsable: nombre.split(" ")[0], anexo: false, tareas: [] }));
              setAbiertos((a) => ({ ...a, [pid]: true }));
            }}
          >
            Añadir proyecto
          </BotonAnadir>
        </div>
      )}

      {tab === "incidencias" && (
        <div className="space-y-3">
          {(datos.incidencias || []).map((it, k) => {
            const set = (cambios) => upd((d) => Object.assign(d.incidencias[k], cambios));
            const conEstado = it.tipo === "tarea";
            return (
              <section key={it.id} className={`${GLASS} grid gap-2 p-3 sm:grid-cols-12`}>
                <Campo etiqueta="Tipo" className="sm:col-span-2">
                  <Sel value={it.tipo} onChange={(v) => set({ tipo: v })} opciones={TIPOS_INCIDENCIA} />
                </Campo>
                <Campo etiqueta="Estado" className="sm:col-span-2">
                  {conEstado
                    ? <Sel value={estadoTarea(it.estado)} onChange={(v) => set({ estado: v })} opciones={ESTADOS} />
                    : <p className="px-2 py-1.5 text-sm text-sand/40">{it.tipo === "bloqueada" ? "Bloqueada" : "—"}</p>}
                </Campo>
                <Campo etiqueta="Título" className="sm:col-span-5">
                  <Txt value={it.titulo} onChange={(v) => set({ titulo: v })} />
                </Campo>
                <Campo etiqueta="Icono" className="sm:col-span-2">
                  <Sel value={it.icono || ""} onChange={(v) => set({ icono: v || undefined })}
                    opciones={[{ id: "", label: "Automático" }, ...ICONOS.map((i) => ({ id: i, label: i }))]} />
                </Campo>
                <div className="flex items-end justify-end sm:col-span-1">
                  <BotonQuitar titulo="Quitar" onClick={() => upd((d) => d.incidencias.splice(k, 1))} />
                </div>
                <Campo etiqueta={it.tipo === "bloqueada" ? "Detalle: qué la bloquea y qué hace falta (uno por línea)" : "Detalle (uno por línea)"} className="sm:col-span-12">
                  <Area value={it.detalle} onChange={(v) => set({ detalle: v })} rows={3} />
                </Campo>
              </section>
            );
          })}
          {!(datos.incidencias || []).length && <EmptyCard>Sin incidencias ni tareas abiertas o bloqueadas.</EmptyCard>}
          <BotonAnadir onClick={() => upd((d) => (d.incidencias ||= []).push({ id: uid("i"), tipo: "incidencia", estado: "en_plazo", titulo: "", detalle: [] }))}>
            Añadir incidencia / tarea
          </BotonAnadir>
        </div>
      )}

      {tab === "traspasos" && (
        <div className="space-y-3">
          {(datos.traspasos || []).map((tr, k) => {
            const set = (cambios) => upd((d) => Object.assign(d.traspasos[k], cambios));
            return (
              <section key={tr.id} className={`${GLASS} grid gap-2 p-3 sm:grid-cols-12`}>
                <Campo etiqueta="Código" className="sm:col-span-2">
                  <Txt value={tr.codigo} onChange={(v) => set({ codigo: v })} placeholder="2026-21" />
                </Campo>
                <Campo etiqueta="Proyecto" className="sm:col-span-4">
                  <Txt value={tr.proyecto} onChange={(v) => set({ proyecto: v })} />
                </Campo>
                <Campo etiqueta="Interno" className="sm:col-span-3">
                  <Txt value={tr.interno} onChange={(v) => set({ interno: v })} />
                </Campo>
                <Campo etiqueta="NFQ" className="sm:col-span-2">
                  <Txt value={tr.nfq} onChange={(v) => set({ nfq: v })} />
                </Campo>
                <div className="flex items-end justify-end sm:col-span-1">
                  <BotonQuitar titulo="Quitar" onClick={() => upd((d) => d.traspasos.splice(k, 1))} />
                </div>
                <Campo etiqueta="Pendiente" className="sm:col-span-8">
                  <Txt value={tr.pendiente} onChange={(v) => set({ pendiente: v })} placeholder="Falta OK usuario" />
                </Campo>
                <Campo etiqueta="Qué falta" className="sm:col-span-4">
                  <Sel value={tr.tipo} onChange={(v) => set({ tipo: v })}
                    opciones={TIPOS_TRASPASO.map((x) => ({ id: x.id, label: x.label.charAt(0).toUpperCase() + x.label.slice(1) }))} />
                </Campo>
              </section>
            );
          })}
          {!(datos.traspasos || []).length && <EmptyCard>Sin traspasos pendientes.</EmptyCard>}
          <BotonAnadir onClick={() => upd((d) => (d.traspasos ||= []).push({ id: uid("tr"), codigo: "", proyecto: "", interno: "", nfq: nombre.split(" ")[0], pendiente: "", tipo: "ok_usuario" }))}>
            Añadir traspaso
          </BotonAnadir>
        </div>
      )}
    </>
  );
}

// ── Resumen: presentación combinada ─────────────────────────────────────────
function ResumenPestana({ coordinadores, tabs, previas, upd, comun, irA, refrescar }) {
  // Lo que han guardado los demás desde que se abrió la página: al entrar y
  // cada minuto (la combinada y lo que se borra salen de aquí).
  useEffect(() => {
    refrescar();
    const h = setInterval(refrescar, 60000);
    return () => clearInterval(h);
  }, [refrescar]);
  const conf = tabs.resumen?.doc || {};
  const excluidos = new Set(conf.excluidos || []);
  // Quien no ha tocado su pestaña esta semana entra con lo de su semana anterior.
  const filas = coordinadores.map((c) => {
    const previa = !tabs[c.id] && previas[c.id] ? previas[c.id] : null;
    const d = tabs[c.id]?.doc || previa?.doc;
    const k = d ? cifras(d) : null;
    return { c, d, k, t: tabs[c.id], previa, incluido: !!(d && d.proyectos.length) && !excluidos.has(c.id) };
  });
  const incluidos = filas.filter((f) => f.incluido);
  const conf2 = { fechaReunion: comun.semana, trimestreGantt: conf.trimestreGantt || "" };
  const combinada = useMemo(
    () => combinarDocs(incluidos.map((f) => ({ id: f.c.id, doc: f.d })), conf2),
    [tabs, conf2.fechaReunion, conf2.trimestreGantt, conf.excluidos], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const kc = cifras(combinada);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-display text-2xl font-bold text-sand">Resumen · presentación combinada</h2>
        <EstadoGuardado t={tabs.resumen} guardar={(f) => comun.guardar("resumen", f)} recargar={comun.recargar} />
        <button type="button" onClick={refrescar} className={`${FIELD} ml-auto px-3 py-2 text-xs font-bold hover:border-white/30`}>Actualizar</button>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-sand/60">
        Junta las pestañas marcadas en una sola presentación («Seguimiento RDR Global»): Gantt de todos, un bloque por proyecto, incidencias, traspasos y el Time Report del trimestre.
        Cada coordinador sigue pudiendo generar la suya desde su pestaña.
      </p>

      <Presentacion
        datos={combinada} quien="" autor="" {...comun.backend}
        borrar={incluidos.map((f) => ({ quien: f.c.id, fecha: comun.semana }))}
      >
        <CamposReunion datos={conf2} set={(cambios) => upd((d) => Object.assign(d, conf2, cambios))} />
      </Presentacion>

      <div className={`${GLASS} mb-5 overflow-x-auto`}>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[10px] uppercase tracking-wide text-sand/50">
            <tr>
              <th className="px-3 py-2.5">Incluir</th><th className="px-3 py-2.5">Coordinador</th>
              <th className="px-3 py-2.5 text-right">Proyectos</th><th className="px-3 py-2.5 text-right">En riesgo</th>
              <th className="px-3 py-2.5 text-right">Incid. / bloq.</th><th className="px-3 py-2.5 text-right">Traspasos</th>
              <th className="px-3 py-2.5">Datos</th><th className="px-3 py-2.5">Última edición</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ c, d, k, t, previa, incluido }) => (
              <tr key={c.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <input
                    type="checkbox" checked={incluido} disabled={!d || !d.proyectos.length}
                    onChange={(e) => upd((x) => {
                      const s = new Set(x.excluidos || []);
                      if (e.target.checked) s.delete(c.id); else s.add(c.id);
                      x.excluidos = [...s];
                    })}
                    className="h-4 w-4 accent-[#85C8FF]" aria-label={`Incluir a ${c.nombre}`}
                  />
                </td>
                <td className="px-3 py-2"><button type="button" onClick={() => irA(c.id)} className="font-bold text-sand hover:text-serene">{c.nombre}</button></td>
                {k ? (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums">{k.proyectos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.riesgo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.incidencias + k.tareasAbiertas} / {k.bloqueadas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.traspasos}</td>
                    <td className="px-3 py-2 text-sand/70">{previa ? <span title="Sin cambios esta semana: entra lo de su semana anterior">de la semana del {fechaCortaEs(previa.semana)}</span> : "esta semana"}</td>
                    <td className="px-3 py-2 text-sand/60">{t?.actualizado ? `${fechaHora(t.actualizado)}${t.por ? ` · ${t.por}` : ""}` : "—"}</td>
                  </>
                ) : (
                  <td colSpan={6} className="px-3 py-2 text-sand/40">No usa Seguimiento todavía</td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/15 font-bold">
              <td className="px-3 py-2.5" /><td className="px-3 py-2.5 text-sand">Combinada ({incluidos.length})</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{kc.proyectos}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{kc.riesgo}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{kc.incidencias + kc.tareasAbiertas} / {kc.bloqueadas}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{kc.traspasos}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
const fechaCortaEs = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** Lunes de la semana de una fecha ISO (hoy si no hay). */
const lunesDe = (iso) => {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISO(d);
};
const masSemanas = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + 7 * n); return toISO(d); };

/* Semana de la reunión (las reuniones son cada 2 semanas): flechas de semana
   en semana, salto a una fecha y lista de las semanas que ya tienen datos. */
function SelectorSemana({ semana, setSemana, semanas, bloqueado }) {
  const hoy = lunesDe();
  const lista = [...new Set([...semanas.map((x) => x.semana), hoy, semana])].sort().reverse();
  const btn = `${FIELD} px-2.5 py-2 text-xs font-bold hover:border-white/30 disabled:opacity-40`;
  return (
    <section className={`${GLASS} mb-4 flex flex-wrap items-end gap-3 p-4`} aria-label="Semana">
      <Campo etiqueta="Semana de la reunión (lunes)">
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={bloqueado} onClick={() => setSemana(masSemanas(semana, -1))} aria-label="Semana anterior">◀</button>
          <select value={semana} disabled={bloqueado} onChange={(e) => setSemana(e.target.value)} className={`${FIELD} block`}>
            {lista.map((s) => {
              const n = semanas.find((x) => x.semana === s)?.ids.length || 0;
              return <option key={s} value={s}>Semana del lunes {fechaCortaEs(s)}{s === hoy ? " (esta)" : ""}{n ? ` · ${n} con datos` : ""}</option>;
            })}
          </select>
          <button type="button" className={btn} disabled={bloqueado} onClick={() => setSemana(masSemanas(semana, 1))} aria-label="Semana siguiente">▶</button>
          <input type="date" disabled={bloqueado} value="" title="Ir a la semana de una fecha" aria-label="Ir a la semana de una fecha"
            onChange={(e) => e.target.value && setSemana(lunesDe(e.target.value))} className={`${FIELD} block w-[2.6rem] cursor-pointer text-transparent`} />
        </div>
      </Campo>
      <p className="pb-2 text-sm text-sand/60">Semana del {fechaLarga(semana)}</p>
      {bloqueado && <p className="pb-2 text-[11.5px] text-sand/45">Guardando cambios… (espera para cambiar de semana)</p>}
    </section>
  );
}

export default function SeguimientoRoute() {
  const { getUrl } = useLinks();
  const { email } = useAuth();
  const backendUrl = getUrl("seguimientoBackend");
  const trUrl = getUrl("timereportBackend");
  const [semana, setSemana] = useState(() => lunesDe());
  const { estado, coordinadores, tabs, previas, semanas, sucio, cargar, refrescar, editar, guardar, llamar } = useSeguimiento(backendUrl, email, semana);
  const [activa, setActiva] = useState(null);

  const yo = useMemo(
    () => coordinadores.find((c) => String(c.email || "").toLowerCase() === String(email || "").toLowerCase()) || null,
    [coordinadores, email],
  );
  useEffect(() => {
    if (activa || !coordinadores.length) return;
    setActiva(yo ? yo.id : "resumen");
  }, [activa, coordinadores, yo]);

  const comun = {
    semana, semanas, coordinadores, llamar,
    backend: { backendUrl, trUrl, email },
    guardar,
    recargar: () => { if (confirm("¿Recargar los datos guardados? Se descartan los cambios sin guardar de esta página.")) { try { Object.keys(localStorage).filter((k) => k.startsWith("rdr_seguimiento_pendiente_")).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } cargar(); } },
  };

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.purple }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.serene }} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-6">
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconList size={34} className="text-purple" /> Seguimiento RDR
          </h1>
          <p className="mt-3 max-w-3xl text-pretty text-sm text-sand/65">
            Por semana de reunión, cada coordinador tiene su pestaña con sus proyectos, incidencias y traspasos, y genera su presentación .pptx (plantilla BBVA × NFQ) en la carpeta de Drive.
            Una semana nueva arranca con lo de la anterior; con «Copiar de…» se puede traer cualquier semana o una presentación de Drive (hecha a mano o autogenerada).
            En <b>Resumen</b> se combinan las de todos. Todo se guarda solo y lo ve el resto de coordinación.
          </p>
        </header>

        {!backendUrl ? (
          <EmptyCard>Falta configurar «seguimientoBackend» en links.json (desplegar apps-script/seguimiento/Codigo_Seguimiento.gs).</EmptyCard>
        ) : estado.cargando && !coordinadores.length ? (
          <div className={`${GLASS} h-40 animate-pulse`} aria-label="Cargando" />
        ) : estado.error ? (
          <section className={`${GLASS} p-5`}>
            <p className="flex items-center gap-2 text-sm font-bold text-mandarin"><IconAlert size={15} /> No se pudieron leer los datos de Seguimiento: {estado.error}</p>
            <button type="button" onClick={() => cargar()} className={`${FIELD} mt-3 px-3 py-2 text-xs font-bold`}>Reintentar</button>
          </section>
        ) : (
          <>
            <SelectorSemana semana={semana} setSemana={setSemana} semanas={semanas} bloqueado={sucio} />
            <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Pestañas">
              {coordinadores.map((c) => {
                const t = tabs[c.id];
                const n = (t?.doc || previas[c.id]?.doc)?.proyectos?.length || 0;
                return (
                  <Chip key={c.id} on={activa === c.id} onClick={() => setActiva(c.id)}>
                    {c.nombre}{yo?.id === c.id ? " (tú)" : ""} · {n}{t && t.ver > t.verGuardada ? " •" : ""}
                  </Chip>
                );
              })}
              <Chip on={activa === "resumen"} accent="lime" onClick={() => setActiva("resumen")}>Resumen</Chip>
            </div>

            {activa === "resumen" ? (
              <ResumenPestana
                coordinadores={coordinadores} tabs={tabs} previas={previas} comun={comun} irA={setActiva} refrescar={refrescar}
                upd={(fn) => editar("resumen", fn, () => ({}))}
              />
            ) : activa ? (
              <EditorPestana
                key={`${activa}_${semana}`} id={activa}
                nombre={coordinadores.find((c) => c.id === activa)?.nombre || ""}
                esMia={yo?.id === activa}
                t={tabs[activa]} previa={previas[activa]}
                upd={(fn) => editar(activa, fn, () => (previas[activa] ? { ...clonar(previas[activa].doc), fechaReunion: semana } : docVacio(semana)))}
                guardar={guardar} recargar={comun.recargar} comun={comun}
              />
            ) : null}
          </>
        )}

        <p className="mt-8 text-[11px] text-sand/35">
          Estados: {ESTADOS.map((e) => ESTADO[e.id].label).join(" · ")}. Fecha límite: un día del calendario o, con el botón «Q», un trimestre (Q4, Q1 2027).
        </p>
      </div>
    </main>
  );
}
