"use client";

// Lógica de avance de formación. En sitio estático: la semilla compartida
// vive en progreso.json y el avance EN VIVO por usuario en localStorage
// (se actualiza al completar un curso y refresca el mapa al instante).

import { NIVELES, FORMACIONES, isDisponible } from "./formaciones";
import { mismoEmail } from "./email";

const LS_PREFIX = "rdr_prog_";
const REMOTE_PREFIX = "rdr_remote_"; // caché SWR del progreso real del backend
const EVT = "rdr-progreso";
export const PROGRESO_URL = "/team-hub/progreso.json";

const norm = (e) => String(e || "anon").trim().toLowerCase();
const lsKey = (email) => LS_PREFIX + norm(email);

export function getLocal(email) {
  try {
    return new Set(JSON.parse(localStorage.getItem(lsKey(email)) || "[]"));
  } catch {
    return new Set();
  }
}

/** Caché del último progreso remoto conocido (SWR): null si nunca se cargó. */
export function getRemotoCache(email) {
  try {
    const v = localStorage.getItem(REMOTE_PREFIX + norm(email));
    return v ? new Set(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

function saveLocal(email, set) {
  localStorage.setItem(lsKey(email), JSON.stringify([...set]));
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Marca/desmarca un curso como completado (localStorage) y avisa a la UI. */
export function marcar(email, archivo, done = true) {
  const s = getLocal(email);
  if (done) s.add(archivo);
  else s.delete(archivo);
  saveLocal(email, s);
  return s;
}

/** Conjunto de cursos completados = semilla (progreso.json) ∪ localStorage ∪ remoto (backend). */
export function completadasDe(email, seed, extra) {
  const base =
    (seed && seed.usuarios && seed.usuarios[norm(email)] && seed.usuarios[norm(email)].completados) ||
    (seed && seed.porDefecto && seed.porDefecto.completados) ||
    [];
  const s = getLocal(email);
  base.forEach((a) => s.add(a));
  if (extra) extra.forEach((a) => s.add(a));
  return s;
}

// ── Backend de formaciones (solo lectura: las completaciones reales entran por
//    certificados en Drive y el Apps Script las publica en GET {records:[...]}). ──
// NFD + quitar todo lo no alfanumérico (los diacríticos quedan fuera de a-z0-9).
const slug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

// Mapea un record del backend a un archivo de curso de nuestro catálogo.
function archivoDeRecord(rec) {
  const m = rec.courseMeta || {};
  const blob = slug(rec.courseId) + "|" + slug(m.nombre); // todo el texto identificable del record
  // 1) palabras clave distintivas (resuelve cursos que comparten nivel+track,
  //    p.ej. Confirmación vs Liquidación en N2 funcional).
  let f = FORMACIONES.find((x) => isDisponible(x) && (x.kw || []).some((k) => blob.includes(slug(k))));
  if (f) return f.archivo;
  // 2) courseId coincide con el archivo
  f = FORMACIONES.find((x) => x.archivo && (x.archivo === rec.courseId || slug(x.archivo) === slug(rec.courseId)));
  if (f) return f.archivo;
  // 3) por nombre exacto/contenido
  if (m.nombre) {
    const nm = slug(m.nombre);
    f = FORMACIONES.find((x) => { const t = slug(x.titulo); return t === nm || t.includes(nm) || nm.includes(t); });
    if (f) return f.archivo;
  }
  // 4) por (nivel, track) si es único y disponible
  if (m.nivel != null && m.track) {
    const cand = FORMACIONES.filter((x) => x.nivel === Number(m.nivel) && x.track === m.track && isDisponible(x));
    if (cand.length === 1) return cand[0].archivo;
  }
  return null;
}

/** Lee el progreso REAL del backend para este email. Set de archivos completados. */
export async function cargarRemoto(email) {
  if (!email) return new Set();
  try {
    const [L, eq] = await Promise.all([
      fetch("/team-hub/links/links.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/team-hub/equipo/equipo.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const url = L && L.formacionesBackend && L.formacionesBackend.url;
    if (!url) return new Set();
    const team = (eq && eq.team) || [];
    const me = team.find((p) => mismoEmail(p.email, email));
    if (!me) return new Set();
    const data = await fetch(url, { method: "GET" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const records = (data && data.records) || [];
    const out = new Set();
    records.filter((r) => r.userId === me.id).forEach((r) => { const a = archivoDeRecord(r); if (a) out.add(a); });
    // Guarda en caché (SWR): la próxima visita muestra esto al instante.
    try { localStorage.setItem(REMOTE_PREFIX + norm(email), JSON.stringify([...out])); } catch {}
    return out;
  } catch {
    return new Set();
  }
}

const dispNivel = (n) => FORMACIONES.filter((f) => f.nivel === n && isDisponible(f));

/**
 * Estado de cada nivel a partir de los cursos completados.
 * - completado: tiene cursos y todos hechos.
 * - actual: desbloqueado, con cursos pendientes (el objetivo de ahora).
 * - proximamente: desbloqueado pero sin contenido aún (niveles futuros).
 * - bloqueado: el nivel anterior no está completado.
 * Un nivel se desbloquea cuando el anterior está completado (todos parten de N00).
 */
export function estadoNiveles(completadas) {
  const res = {};
  let prevCompleto = true; // N00 siempre desbloqueado
  for (const lvl of NIVELES) {
    const disp = dispNivel(lvl.n);
    const tieneContenido = disp.length > 0;
    const completado = tieneContenido && disp.every((f) => completadas.has(f.archivo));
    const desbloqueado = prevCompleto;
    let estado;
    if (!desbloqueado) estado = "bloqueado";
    else if (!tieneContenido) estado = "proximamente";
    else if (completado) estado = "completado";
    else estado = "actual";
    res[lvl.n] = {
      ...lvl,
      estado,
      desbloqueado,
      completado,
      tieneContenido,
      hechos: disp.filter((f) => completadas.has(f.archivo)).length,
      total: disp.length,
    };
    prevCompleto = completado;
  }
  return res;
}

/** Estado de un curso concreto. */
export function estadoCurso(f, completadas, niveles) {
  if (completadas.has(f.archivo)) return "completada";
  if (!isDisponible(f)) return "proximamente";
  const nv = niveles[f.nivel];
  return nv && nv.desbloqueado ? "disponible" : "bloqueada";
}

/** Nivel "actual" (objetivo) del usuario: el primero desbloqueado sin completar. */
export function nivelActual(niveles) {
  const ids = Object.keys(niveles).map(Number).sort((a, b) => a - b);
  for (const n of ids) if (niveles[n].estado === "actual") return n;
  // todo lo disponible hecho -> el último con contenido
  const conContenido = ids.filter((n) => niveles[n].tieneContenido);
  return conContenido.length ? conContenido[conContenido.length - 1] : 0;
}

/** Resumen global para barra de progreso: sobre el TOTAL de formaciones
 *  (incluye las "próximamente"), no solo las disponibles. */
export function resumen(completadas) {
  const hechos = FORMACIONES.filter((f) => isDisponible(f) && completadas.has(f.archivo)).length;
  const total = FORMACIONES.length;
  return { hechos, total, pct: total ? Math.round((hechos / total) * 100) : 0 };
}

/** Suscripción a cambios de progreso (misma pestaña + entre pestañas). */
export function onProgreso(cb) {
  const h = () => cb();
  window.addEventListener(EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener("storage", h);
  };
}
