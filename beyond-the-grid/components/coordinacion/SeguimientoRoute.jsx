"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { GLASS, FIELD, TEXT, Kpi, Chip, EmptyCard } from "./ui";
import { IconPlus, IconX, IconAlert, IconReload, IconList } from "./icons";
import { IconFolder, IconCheck } from "../icons";
import { EJEMPLO } from "../seguimiento/ejemplo";
import {
  FASES, ESTADOS, ESTADO, TIPOS_TRASPASO, ICONOS,
  cifras, nombreFichero, rutaDrive, fechaLarga, toISO, resumenProyecto,
} from "../seguimiento/modelo";
import { generarPresentacion } from "../seguimiento/plantillaPptx";

/* Seguimiento RDR · panel de COORDINACIÓN.
   Editor de los datos de la reunión (proyectos con sus tareas, incidencias y
   traspasos) y botón que descarga la presentación .pptx generada con la
   plantilla de components/seguimiento/. «Guardar en Drive» la sube al Apps
   Script "seguimientoBackend" (apps-script/seguimiento/Codigo_Seguimiento.gs),
   que la deja en <raíz>/2026/9. Septiembre/: si ya existe la de esa
   reunión la sobrescribe (mismo enlace) y si no, la crea. Los datos viven
   en este navegador (localStorage, autoguardado); para compartirlos o
   guardarlos entre reuniones: Exportar / Importar JSON. */

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

// Fecha límite: ISO, trimestre ("Q4", "Q1 2027") o vacía. DD/MM/AAAA se convierte a ISO.
const RE_FECHA = /^(\d{4}-\d{2}-\d{2}|Q[1-4](\s*\d{4})?)$/i;
const normalizarFecha = (v) => {
  const t = String(v || "").trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (m) {
    const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toISO(new Date(anio, Number(m[2]) - 1, Number(m[1])));
  }
  return /^q/i.test(t) ? t.toUpperCase() : t;
};

const lineas = (txt) => String(txt || "").split("\n");
const sinVacias = (xs) => (xs || []).map((s) => String(s).trim()).filter(Boolean);

/* Lo que se edita puede tener líneas vacías a medio escribir: se limpian
   justo antes de generar. */
const limpiar = (d) => ({
  ...d,
  proyectos: d.proyectos.map((p) => ({
    ...p,
    tareas: (p.tareas || []).map((t) => ({ ...t, comentarios: sinVacias(t.comentarios) })),
  })),
  incidencias: (d.incidencias || []).map((i) => ({ ...i, detalle: sinVacias(i.detalle) })),
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

// ── Tarea ───────────────────────────────────────────────────────────────────
function TareaEditor({ t, set, quitar, subir }) {
  const fechaOk = !t.fecha || RE_FECHA.test(String(t.fecha).trim());
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
          <Txt
            value={t.fecha} onChange={(v) => set({ fecha: v })}
            onBlur={(e) => set({ fecha: normalizarFecha(e.target.value) })}
            placeholder="31/07/2026 o Q4"
            className={fechaOk ? "" : "border-mandarin/70"}
          />
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
          <Sel value={t.estado} onChange={(v) => set({ estado: v })} opciones={ESTADOS} />
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
      {!fechaOk && <p className="mt-1.5 text-[11px] text-mandarin">Fecha no reconocida: usa 31/07/2026, 2026-07-31 o Q4.</p>}
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
            <span className="block truncate text-[11.5px] text-sand/50">{p.interno || "—"} · {resumenProyecto(p)}</span>
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

// ── Página ──────────────────────────────────────────────────────────────────
export default function SeguimientoRoute() {
  const [datos, setDatos] = useState(null);
  const [tab, setTab] = useState("proyectos");
  const [abiertos, setAbiertos] = useState({});
  const [gen, setGen] = useState({ fase: "idle" }); // idle | generando | subiendo | ok | drive | error
  const [drive, setDrive] = useState(null); // estado del fichero en Drive para la fecha actual
  const fileRef = useRef(null);
  const { getUrl } = useLinks();
  const { email } = useAuth();
  const backendUrl = getUrl("seguimientoBackend");
  const fecha = datos?.fechaReunion || "";

  // Borrador de este navegador o, la primera vez, el ejemplo del 28/09/2026.
  useEffect(() => { setDatos(leerBorrador() || clonar(EJEMPLO)); }, []);
  useEffect(() => {
    if (!datos) return;
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* sin almacenamiento: solo en memoria */ }
  }, [datos]);

  // ¿Existe ya la presentación de esta reunión en Drive? (se actualizará o se creará)
  useEffect(() => {
    if (!backendUrl || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setDrive(null); return; }
    let vivo = true;
    setDrive({ cargando: true });
    const t = setTimeout(async () => {
      try {
        const sep = backendUrl.includes("?") ? "&" : "?";
        const d = await leerRespuesta(await fetch(`${backendUrl}${sep}action=estado&fecha=${fecha}`));
        if (vivo) setDrive(d);
      } catch (e) {
        if (vivo) setDrive({ error: String(e?.message || e) });
      }
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [backendUrl, fecha]);

  const upd = (fn) => setDatos((d) => { const n = clonar(d); fn(n); return n; });
  const c = useMemo(() => (datos ? cifras(datos) : null), [datos]);

  if (!datos) return <main className="min-h-dvh" />;

  const crearPres = async () => {
    const [{ default: PptxGenJS }, assets] = await Promise.all([import("pptxgenjs"), cargarAssets()]);
    return generarPresentacion(PptxGenJS, limpiar(datos), assets);
  };

  const guardarDrive = async () => {
    setGen({ fase: "subiendo" });
    try {
      const pres = await crearPres();
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
        body: JSON.stringify({ action: "subir", fecha: datos.fechaReunion, email, base64 }),
      }));
      setGen({ fase: "drive", ...d });
      setDrive({ existe: true, nombre: d.nombre, ruta: d.ruta, url: d.url, carpetaUrl: d.carpetaUrl, modificado: d.modificado });
    } catch (e) {
      console.error(e);
      setGen({ fase: "error", error: String(e?.message || e) });
    }
  };

  const generar = async () => {
    setGen({ fase: "generando" });
    try {
      const pres = await crearPres();
      // "/" no vale en un nombre de fichero: el navegador lo cambiaría por "_".
      const fichero = nombreFichero(datos.fechaReunion).replaceAll("/", "-");
      await pres.writeFile({ fileName: fichero, compression: true });
      setGen({ fase: "ok", fichero });
    } catch (e) {
      console.error(e);
      setGen({ fase: "error", error: String(e?.message || e) });
    }
  };

  const exportar = () => {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seguimiento-${datos.fechaReunion || "borrador"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importar = async (file) => {
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || !Array.isArray(d.proyectos)) throw new Error("no tiene la lista de proyectos");
      setDatos({ incidencias: [], traspasos: [], ...d });
      setAbiertos({});
    } catch (e) {
      alert(`No se pudo importar el JSON: ${e.message || e}`);
    }
  };

  const ruta = rutaDrive(datos.fechaReunion);
  const ocupado = gen.fase === "generando" || gen.fase === "subiendo";
  const nProy = datos.proyectos.length;

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.purple }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.serene }} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-purple/80">Coordinación</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconList size={34} className="text-purple" /> Seguimiento
          </h1>
          <p className="mt-3 max-w-3xl text-pretty text-sm text-sand/65">
            Actualiza proyectos, tareas, incidencias y traspasos de la reunión y guarda la presentación .pptx (plantilla BBVA × NFQ) directamente en su carpeta de Drive.
            Los datos de la reunión se guardan solo en este navegador: usa <b>Exportar JSON</b> para conservarla o pasársela a otra persona.
          </p>
        </header>

        {/* ── Reunión y generación ── */}
        <section className={`${GLASS} mb-4 p-4`} aria-label="Reunión">
          <div className="flex flex-wrap items-end gap-3">
            <Campo etiqueta="Fecha de la reunión">
              <input
                type="date" value={datos.fechaReunion || ""}
                onChange={(e) => upd((d) => { d.fechaReunion = e.target.value; })}
                className={`${FIELD} block`}
              />
            </Campo>
            <p className="pb-2 text-sm text-sand/60">{fechaLarga(datos.fechaReunion)}</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button" onClick={guardarDrive}
                disabled={ocupado || !datos.fechaReunion || !backendUrl}
                title={backendUrl ? "Genera la presentación y la guarda en la carpeta de Drive de la reunión" : "Falta configurar seguimientoBackend en links.json"}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                style={{ background: PALETTE.serene }}
              >
                {gen.fase === "subiendo"
                  ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Guardando en Drive…</>
                  : <><IconFolder size={15} /> {drive?.existe ? "Actualizar en Drive" : "Guardar en Drive"}</>}
              </button>
              <button
                type="button" onClick={generar} disabled={ocupado || !datos.fechaReunion}
                className={`${FIELD} px-3 py-2.5 text-xs font-bold hover:border-white/30 disabled:opacity-40`}
              >
                {gen.fase === "generando" ? "Generando…" : "Descargar .pptx"}
              </button>
              <button type="button" onClick={exportar} className={`${FIELD} px-3 py-2.5 text-xs font-bold hover:border-white/30`}>Exportar JSON</button>
              <button type="button" onClick={() => fileRef.current?.click()} className={`${FIELD} px-3 py-2.5 text-xs font-bold hover:border-white/30`}>Importar JSON</button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ""; }} />
              <button
                type="button" title="Descarta el borrador y vuelve a los datos de ejemplo"
                onClick={() => { if (confirm("¿Descartar el borrador actual y volver al ejemplo del 28/09/2026?")) { setDatos(clonar(EJEMPLO)); setAbiertos({}); } }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2.5 text-xs font-bold text-sand/50 transition hover:text-mandarin"
              >
                <IconReload size={13} /> Restaurar ejemplo
              </button>
            </div>
          </div>
          {/* Dónde va a parar en Drive (antes de guardar) */}
          {!backendUrl ? (
            <p className="mt-3 text-[11.5px] text-sand/45">
              Guardar en Drive: falta configurar «seguimientoBackend» en links.json (desplegar apps-script/seguimiento/Codigo_Seguimiento.gs).
            </p>
          ) : drive?.cargando ? (
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
          {gen.fase === "ok" && (
            <p className={`mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold ${TEXT.lime}`}>
              <IconCheck size={14} /> Descargada «{gen.fichero}».
            </p>
          )}
          {gen.fase === "error" && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
              <IconAlert size={13} /> No se pudo completar: {gen.error}
            </p>
          )}
        </section>

        {c && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Kpi label="Proyectos" value={c.proyectos} />
            <Kpi label="Tareas" value={c.tareas} accent="aqua" />
            <Kpi label="Al 100 %" value={c.hechas} accent="lime" />
            <Kpi label="En riesgo" value={c.riesgo} accent="mandarin" />
            <Kpi label="Avance medio" value={`${c.avanceMedio} %`} accent="purple" />
            <Kpi label="Incid. / traspasos" value={`${c.incidencias + c.tareasAbiertas} / ${c.traspasos}`} accent="canary" />
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2" role="tablist">
          <Chip on={tab === "proyectos"} onClick={() => setTab("proyectos")}>Proyectos · {nProy}</Chip>
          <Chip on={tab === "incidencias"} onClick={() => setTab("incidencias")}>Incidencias · {(datos.incidencias || []).length}</Chip>
          <Chip on={tab === "traspasos"} onClick={() => setTab("traspasos")}>Traspasos · {(datos.traspasos || []).length}</Chip>
        </div>

        {tab === "proyectos" && (
          <div className="space-y-3">
            <div className="flex justify-end gap-3 text-[11px] font-bold text-sand/50">
              <button type="button" className="hover:text-serene" onClick={() => setAbiertos(Object.fromEntries(datos.proyectos.map((p) => [p.id, true])))}>Desplegar todos</button>
              <button type="button" className="hover:text-serene" onClick={() => setAbiertos({})}>Plegar todos</button>
            </div>
            {datos.proyectos.map((p, i) => (
              <ProyectoEditor
                key={p.id} p={p} idx={i} total={nProy} upd={upd}
                abierto={!!abiertos[p.id]}
                toggle={() => setAbiertos((a) => ({ ...a, [p.id]: !a[p.id] }))}
                mover={(dir) => upd((d) => { const ps = d.proyectos; [ps[i], ps[i + dir]] = [ps[i + dir], ps[i]]; })}
              />
            ))}
            {!nProy && <EmptyCard>No hay proyectos. Añade el primero.</EmptyCard>}
            <BotonAnadir
              onClick={() => {
                const id = uid("p");
                upd((d) => d.proyectos.push({ id, nombre: "", sdatool: "", traspaso: "", interno: "", responsable: "", anexo: false, tareas: [] }));
                setAbiertos((a) => ({ ...a, [id]: true }));
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
              return (
                <section key={it.id} className={`${GLASS} grid gap-2 p-3 sm:grid-cols-12`}>
                  <Campo etiqueta="Tipo" className="sm:col-span-2">
                    <Sel value={it.tipo} onChange={(v) => set({ tipo: v })} opciones={[{ id: "incidencia", label: "Incidencia" }, { id: "tarea", label: "Tarea" }]} />
                  </Campo>
                  <Campo etiqueta="Estado" className="sm:col-span-2">
                    <Sel value={it.estado} onChange={(v) => set({ estado: v })} opciones={ESTADOS} />
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
                  <Campo etiqueta="Detalle (uno por línea)" className="sm:col-span-12">
                    <Area value={it.detalle} onChange={(v) => set({ detalle: v })} rows={3} />
                  </Campo>
                </section>
              );
            })}
            {!(datos.incidencias || []).length && <EmptyCard>Sin incidencias ni tareas abiertas.</EmptyCard>}
            <BotonAnadir onClick={() => upd((d) => (d.incidencias ||= []).push({ id: uid("i"), tipo: "incidencia", estado: "en_curso", titulo: "", detalle: [] }))}>
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
                  <Campo etiqueta="Tipo (color)" className="sm:col-span-4">
                    <Sel value={tr.tipo} onChange={(v) => set({ tipo: v })}
                      opciones={TIPOS_TRASPASO.map((t) => ({ id: t.id, label: `${t.nombre} · ${t.label}` }))} />
                  </Campo>
                </section>
              );
            })}
            {!(datos.traspasos || []).length && <EmptyCard>Sin traspasos pendientes.</EmptyCard>}
            <BotonAnadir onClick={() => upd((d) => (d.traspasos ||= []).push({ id: uid("tr"), codigo: "", proyecto: "", interno: "", nfq: "", pendiente: "", tipo: "ok_usuario" }))}>
              Añadir traspaso
            </BotonAnadir>
          </div>
        )}

        <p className="mt-8 text-[11px] text-sand/35">
          Estados: {ESTADOS.map((e) => ESTADO[e.id].label).join(" · ")}. Fecha límite admite día (31/07/2026) o trimestre (Q4, Q1 2027).
        </p>
      </div>
    </main>
  );
}
