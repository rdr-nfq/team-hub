// Monitor de pases · piezas comunes de la interfaz (API, utilidades, iconos).
import { html } from "./vendor/preact-htm.mjs";

export const CLAVE = document.querySelector('meta[name="clave"]')?.content || "";
export const PALETA = ["#85C8FF", "#9694FF", "#FFB56B", "#88E783", "#8BE1E9", "#FFE761"];

export async function apiReal(ruta, cuerpo) {
  const r = await fetch("/api/" + ruta, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { "X-Monitor-Clave": CLAVE, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(() => ({ error: "La app no ha contestado bien (¿se ha cerrado la ventana del monitor?)." }));
  if (!r.ok) {
    const e = new Error(d.error || "Error " + r.status);
    e.pista = d.pista;
    throw e;
  }
  return d;
}
export const api = window.MP_API || apiReal;

/* ── Utilidades ── */
export const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
export const fCorta = (iso) => (iso ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "");
export const fLarga = (iso) => (iso ? new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
export function hace(iso) {
  if (!iso) return "";
  const s = (Date.parse(iso) - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return "ahora mismo";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 21) return rtf.format(Math.round(s / 86400), "day");
  return "el " + fCorta(iso);
}
export const corto = (repo) => String(repo || "").split("/").pop();
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export const uniq = (xs) => [...new Set(xs)];
export const clonar = (x) => JSON.parse(JSON.stringify(x));
let COLORES = {};
export const colorDe = (f) => (f ? COLORES[f] || PALETA[0] : "var(--line-2)");
/** Un color por proyecto, estable: por orden alfabético del código. */
export function ponerColores(features) {
  COLORES = Object.fromEntries([...features].filter(Boolean).sort().map((f, i) => [f, PALETA[i % PALETA.length]]));
}
export function proximoSabado() {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
export const leerLS = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const ponerLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

export const RUTAS = {
  actualizar: "M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7",
  buscar: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4.2-4.2",
  externo: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  cerrar: "M6 6l12 12M18 6 6 18",
  ok: "M5 12.5l4.5 4.5L19 7.5",
  mal: "M7 7l10 10M17 7 7 17",
  curso: "M12 7v5l3 2",
  sol: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  luna: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  subir: "M12 16V4M7 9l5-5 5 5M5 20h14",
  guardar: "M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6",
  carpeta: "M3 6h6l2 2h10v11H3z",
  copiar: "M9 9h11v11H9zM5 15H4V4h11v1",
  arriba: "M12 19V5M6 11l6-6 6 6",
  abajo: "M12 5v14M6 13l6 6 6-6",
  mas: "M12 5v14M5 12h14",
  papelera: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  atras: "M19 12H5M11 18l-6-6 6-6",
  fichero: "M6 3h8l4 4v14H6zM14 3v4h4",
  columnas: "M4 5h16v14H4zM12 5v14",
  lineas: "M4 7h16M4 12h16M4 17h16",
  plegado: "M9 6l6 6-6 6",
  desplegado: "M6 9l6 6 6-6",
  commit: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 12h6M15 12h6",
};
export const Icono = ({ n, cls = "" }) => html`<svg class="icono ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${RUTAS[n]} /></svg>`;
export const Marca = () => html`<svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#001391"/><circle cx="10" cy="10" r="3.5" fill="#85C8FF"/><circle cx="10" cy="22" r="3.5" fill="#85C8FF"/><circle cx="22" cy="16" r="3.5" fill="#88E783"/><path d="M10 13.5v5M12.8 11.8 19 14.6" stroke="#F7F8F8" stroke-width="2" fill="none"/></svg>`;

export const FUENTE = { resumen: "del resumen de la Action", "anotación": "de una anotación de la Action", log: "del log de la Action", pasos: "del nombre de un paso", manual: "puesto a mano" };
export const ESTADO_PR = { abierta: "abierta", mergeada: "mergeada", cerrada: "cerrada" };

export function EstadoRun({ run, corto: c }) {
  const ok = run.conclusion === "success";
  const curso = run.estado !== "completed";
  const cls = curso ? "ico-curso" : ok ? "ico-ok" : "ico-mal";
  const txt = curso ? "en curso" : ok ? "correcta" : run.conclusion === "cancelled" ? "cancelada" : "fallida";
  return html`<span class="estado-ci" title=${`${run.nombre} · ${txt} · ${fLarga(run.fecha)}`}>
    <span class=${cls}><${Icono} n=${curso ? "curso" : ok ? "ok" : "mal"} /></span>
    ${c ? html`<span class="sr">Última ejecución ${txt}</span>` : html`<span>${run.nombre} · ${txt}</span>`}
  </span>`;
}

export function ChipDP({ d }) {
  const titulo = d.fuente === "manual" ? "DP puesto a mano" : `DP ${FUENTE[d.fuente] || ""}${d.fecha ? " · " + fLarga(d.fecha) : ""}`;
  return html`<span class="dp ${d.fuente === "manual" ? "dp-manual" : ""}" title=${titulo}>${d.cod}</span>`;
}

export function Rama({ nombre }) {
  const m = /^([^/]+\/)(.*)$/.exec(nombre || "");
  return m ? html`<span class="pre">${m[1]}</span>${m[2]}` : nombre;
}

