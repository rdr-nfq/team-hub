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
  rama: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  pr: "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 3a3 3 0 1 0 0 6M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 15V8a2 2 0 0 0-2-2h-4M14 3l-3 3 3 3",
  repo: "M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h11",
  paquete: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5",
  chispa: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  enviar: "M5 12h14M13 6l6 6-6 6",
  usuario: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  candado: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  historial: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  marcador: "M6 4h12v16l-6-4-6 4z",
  filtro: "M4 5h16l-6 8v5l-4 2v-7z",
  ir: "M5 12h14M13 6l6 6-6 6",
  carpetaAbierta: "M3 7h6l2 2h10l-2 10H3z",
};
export const Icono = ({ n, cls = "" }) => html`<svg class="icono ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${RUTAS[n]} /></svg>`;
// Botón de tema: el mismo icono que la web del hub (círculo de contraste que gira al cambiar).
export const BotonTema = ({ tema, cambiar }) => {
  const texto = tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  return html`<button type="button" class="btn-tema" onClick=${cambiar} title=${texto} aria-label=${texto}>
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" class=${tema === "dark" ? "girado" : ""}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" /></svg></button>`;
};
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

/* Navegación global: la pone App para que cualquier pieza (un chip de DP)
   pueda llevar a otra pantalla. */
let IR = () => {};
export const ponerIr = (f) => { IR = f; };
export const irA = (ruta) => IR(ruta);

export function ChipDP({ d, repo }) {
  const titulo = d.fuente === "manual" ? "DP puesto a mano" : `DP ${FUENTE[d.fuente] || ""}${d.fecha ? " · " + fLarga(d.fecha) : ""}`;
  const cls = `dp ${d.fuente === "manual" ? "dp-manual" : ""}`;
  if (!repo || d.fuente === "manual") return html`<span class=${cls} title=${titulo}>${d.cod}</span>`;
  return html`<button class="${cls} dp-btn" title=${titulo + " · ver sus componentes y cambios"}
    onClick=${(e) => { e.stopPropagation(); irA({ vista: "dp", repo, cod: d.cod }); }}>${d.cod}</button>`;
}

/* Markdown sencillo (PRs, comentarios, respuestas de Copilot) sin innerHTML:
   párrafos, títulos, listas, citas, bloques de código, tablas, `código`,
   **negrita**, *cursiva* y enlaces http(s). */
function enLinea(t) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:[^)\s]+\))/g;
  let i = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(t.slice(i, m.index));
    const x = m[0];
    if (x[0] === "`") out.push(html`<code>${x.slice(1, -1)}</code>`);
    else if (x.startsWith("**")) out.push(html`<b>${x.slice(2, -2)}</b>`);
    else if (x[0] === "*") out.push(html`<i>${x.slice(1, -1)}</i>`);
    else { const k = x.indexOf("]("); out.push(html`<a href=${x.slice(k + 2, -1)} target="_blank" rel="noopener noreferrer">${x.slice(1, k)}</a>`); }
    i = m.index + x.length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}
export function Markdown({ texto }) {
  const lineas = String(texto || "").replace(/\r/g, "").split("\n");
  const bloques = [];
  for (let i = 0; i < lineas.length;) {
    const l = lineas[i];
    if (/^```/.test(l)) {
      const cod = [];
      for (i++; i < lineas.length && !/^```/.test(lineas[i]); i++) cod.push(lineas[i]);
      i++;
      bloques.push(html`<pre class="md-pre"><code>${cod.join("\n")}</code></pre>`);
    } else if (/^#{1,6}\s/.test(l)) {
      const n = l.match(/^#+/)[0].length;
      bloques.push(html`<p class=${"md-h md-h" + Math.min(n, 3)}>${enLinea(l.replace(/^#+\s*/, ""))}</p>`); i++;
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      const ordenada = /^\s*\d/.test(l), items = [];
      while (i < lineas.length && /^\s*([-*+]|\d+[.)])\s+/.test(lineas[i])) items.push(lineas[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
      bloques.push(ordenada ? html`<ol>${items.map((x) => html`<li>${enLinea(x)}</li>`)}</ol>` : html`<ul>${items.map((x) => html`<li>${enLinea(x)}</li>`)}</ul>`);
    } else if (/^\|.*\|\s*$/.test(l)) {
      const filas = [];
      while (i < lineas.length && /^\|.*\|\s*$/.test(lineas[i])) filas.push(lineas[i++]);
      const celdas = filas.filter((f) => !/^\|[\s:|-]+\|\s*$/.test(f)).map((f) => f.trim().slice(1, -1).split("|").map((c) => c.trim()));
      bloques.push(html`<div class="md-tabla"><table>${celdas.map((c, k) => html`<tr>${c.map((x) => k === 0 ? html`<th>${enLinea(x)}</th>` : html`<td>${enLinea(x)}</td>`)}</tr>`)}</table></div>`);
    } else if (/^>\s?/.test(l)) {
      const cita = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) cita.push(lineas[i++].replace(/^>\s?/, ""));
      bloques.push(html`<blockquote>${enLinea(cita.join(" "))}</blockquote>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const par = [];
      while (i < lineas.length && lineas[i].trim() && !/^(```|#{1,6}\s|\s*([-*+]|\d+[.)])\s|\||>)/.test(lineas[i])) par.push(lineas[i++]);
      if (!par.length) par.push(lineas[i++]);
      bloques.push(html`<p>${enLinea(par.join(" "))}</p>`);
    }
  }
  return html`<div class="md">${bloques}</div>`;
}

export function Rama({ nombre }) {
  const m = /^([^/]+\/)(.*)$/.exec(nombre || "");
  return m ? html`<span class="pre">${m[1]}</span>${m[2]}` : nombre;
}

