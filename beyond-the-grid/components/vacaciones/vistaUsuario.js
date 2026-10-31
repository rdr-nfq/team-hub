// Utilidades de la vista de usuario de Vacaciones (MisVacacionesRoute):
// colores de motivo, nombres cortos únicos, trimestres y cobertura.
import { deIso, isoDe } from "./datos";

export const MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MCOR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DSEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/* Motivo → relleno (acento BBVA, siempre con texto Electric). Tus días van en
   Lime; por eso Vacaciones es Mandarin (el color de la sección Equipo). */
export const COLOR_YO = "#88E783";
const COLORES = { VA: "#FFB56B", VP: "#8BE1E9", FO: "#85C8FF", ES: "#9694FF", BA: "#FFE761" };
export const colorMotivo = (m) => COLORES[m] || "#CAD1D8";
const TEXTOS = { VA: "Vacaciones", VP: "Vacaciones proyecto", FO: "Formación", ES: "Permiso especial", BA: "Baja", RE: "Revisión", FT: "Festivo trabajado", VE: "Votación" };
export const textoMotivo = (m) => TEXTOS[m] || m;
export const LEYENDA = ["VA", "FO", "ES", "BA", "VP"];

export const masDias = (s, n) => { const f = deIso(s); f.setDate(f.getDate() + n); return isoDe(f); };
export const esFinde = (s) => { const w = deIso(s).getDay(); return w === 0 || w === 6; };

/** "4 nov" (con el año si no es `anio`). */
export const fCorta = (s, anio) => { const f = deIso(s); return `${f.getDate()} ${MCOR[f.getMonth()]}${anio && f.getFullYear() !== anio ? ` ${f.getFullYear()}` : ""}`; };
/** "miércoles 4 de noviembre" (con el año si no es `anio`). */
export const fLarga = (s, anio) => { const f = deIso(s); return `${DSEM[f.getDay()]} ${f.getDate()} de ${MES[f.getMonth()].toLowerCase()}${anio && f.getFullYear() !== anio ? ` de ${f.getFullYear()}` : ""}`; };

const sinTilde = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const coincide = (nombre, q) => sinTilde(nombre).includes(sinTilde(q.trim()));

/* Nombres de pila compuestos habituales: «Juan Carlos», «José Luis»… */
const COMPUESTOS = new Set(["jose", "juan", "luis", "maria", "ana", "david", "miguel", "francisco", "jesus", "pedro"]);
/** {pila, apellido} de un nombre. El Excel usa «Apellidos, Nombre» (lo de
   detrás de la coma es el nombre de pila); equipo.json, «Nombre Apellidos». */
function partes(n) {
  const limpio = n.replace(/\s+/g, " ").trim();
  const coma = limpio.indexOf(",");
  if (coma > 0) {
    const pila = limpio.slice(coma + 1).trim();
    const apellido = limpio.slice(0, coma).trim().split(" ")[0] || "";
    if (pila) return { pila, apellido };
  }
  const t = limpio.split(" ");
  const nPila = t.length >= 3 && COMPUESTOS.has(sinTilde(t[0])) ? 2 : 1;
  return { pila: t.slice(0, nPila).join(" "), apellido: t[nPila] || "" };
}
/** Nombre corto ÚNICO por persona: el nombre de pila; si coincide con el de
   otra (sin tildes), con la inicial del primer apellido; si aún coincide,
   el nombre completo. */
export function nombresCortos(nombres) {
  const p = Object.fromEntries(nombres.map((n) => [n, partes(n)]));
  const pila = (n) => p[n].pila;
  const conInicial = (n) => (p[n].apellido ? `${p[n].pila} ${p[n].apellido[0].toUpperCase()}.` : n);
  const contar = (f) => { const c = {}; nombres.forEach((n) => { const k = sinTilde(f(n)); c[k] = (c[k] || 0) + 1; }); return c; };
  const c1 = contar(pila), c2 = contar(conInicial);
  return Object.fromEntries(nombres.map((n) => [n, c1[sinTilde(pila(n))] < 2 ? pila(n) : c2[sinTilde(conInicial(n))] < 2 ? conInicial(n) : n]));
}

/** Meses [año, mes0] de un trimestre; el 4º añade enero del año siguiente. */
export const mesesDeQ = (q, anio) => (q === 4
  ? [[anio, 9], [anio, 10], [anio, 11], [anio + 1, 0]]
  : [[anio, (q - 1) * 3], [anio, (q - 1) * 3 + 1], [anio, (q - 1) * 3 + 2]]);
export const qDe = (s, anio) => { const f = deIso(s); return f.getFullYear() > anio ? 4 : Math.floor(f.getMonth() / 3) + 1; };
export const diasDeMes = (y, m) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => isoDe(new Date(y, m, i + 1)));

/** Semana (lunes) con más personas distintas fuera dentro del trimestre. */
export function semanaPico(q, anio, aus) {
  let mejor = null;
  mesesDeQ(q, anio).forEach(([y, m]) => diasDeMes(y, m).forEach((s) => {
    if (deIso(s).getDay() !== 1) return;
    const gente = new Set();
    for (let i = 0; i < 5; i++) (aus[masDias(s, i)] || []).forEach((a) => gente.add(a.nombre));
    if (!mejor || gente.size > mejor[1]) mejor = [s, gente.size];
  }));
  return mejor;
}

/** Primer laborable (para esa persona) en el que ya no está fuera desde `s`. */
export function vuelve(nombre, s, aus, festivosGrupo) {
  let d = s;
  for (let i = 0; i < 60; i++) {
    d = masDias(d, 1);
    if (esFinde(d) || festivosGrupo?.[d] || (aus[d] || []).some((a) => a.nombre === nombre)) continue;
    return d;
  }
  return null;
}
