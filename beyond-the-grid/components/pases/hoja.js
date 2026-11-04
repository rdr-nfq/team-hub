/* Lógica pura de la hoja de preparación de /pases (sin React).
   Un paquete (DP) es el código de sus componentes; su posición en el pase es
   la del paso del orden (Orden_Ejecucion) que lo nombra. Tipo de subida y
   encargado del DP se deducen de sus componentes (el valor más repetido). */
import { isT } from "./backend";
import { extraerCodigosDeElemento, etiquetaPorSubida, esRemedy } from "./comandos";

// Acentos BBVA para distinguir proyectos y tipos de subida (texto Electric encima).
export const COLORES = ["#85C8FF", "#8BE1E9", "#9694FF", "#FFB56B", "#88E783", "#FFE761"];

export const sinTilde = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
export const normCod = (c) => {
  const t = String(c || "").trim().toUpperCase();
  return t === "-" ? "" : t;
};
export const corto = (nombre) => String(nombre || "").split(" · ")[0].slice(0, 26);

/** El valor más repetido (desempate: el primero en aparecer). */
export function moda(lista) {
  const n = new Map();
  lista.forEach((x) => x && n.set(x, (n.get(x) || 0) + 1));
  let mejor = "", max = 0;
  n.forEach((v, k) => { if (v > max) { max = v; mejor = k; } });
  return mejor;
}

export const esParada = (t) => /parada/i.test(t || "");
export const esArranque = (t) => /arranque/i.test(t || "");

/** Etiqueta del paso del orden para un DP (misma que usan Implantación y los comandos). */
export const etiquetaDp = (subida, cod) => etiquetaPorSubida(String(subida || "").toLowerCase(), cod);

/** Color estable por tipo de subida (según su posición en Parametrizaciones). */
export function colorSubida(tiposSubida, subida) {
  const i = (tiposSubida || []).indexOf(subida);
  return i < 0 ? "transparent" : COLORES[i % COLORES.length];
}

/** Prefijo del código según el tipo de subida (Parametrizaciones). */
export const schemaDe = (E, subida) => (E?.schemaPorSubida || {})[String(subida || "").trim()] || "";
/** ¿El código empieza por el prefijo de su tipo? El guion final es opcional
   («REQ-» y «REQ» valen igual: los Remedy van ya sin guion, REQ000123). */
export const cumpleSchema = (cod, sc) => {
  const c = String(cod || "").toUpperCase(), s = String(sc || "").toUpperCase().trim();
  return !s || c.startsWith(s) || c.startsWith(s.replace(/-+$/, ""));
};
/** El prefijo tal cual se escribe (sin el guion final si es un REQ). */
export const prefijoSchema = (sc) => (/^REQ-?$/i.test(String(sc || "").trim()) ? "REQ" : String(sc || "").toUpperCase());

/**
 * Modelo de la hoja.
 * orden: [{ elemento, som, uid }] (tempOrden) · dpMeta: { [cod]: { subida, enc } } para DP aún vacíos.
 */
export function modelo(E, orden, dpMeta = {}) {
  const proys = (E?.proyectos || []).map((p, i) => ({
    nombre: p.nombre, corto: corto(p.nombre), color: COLORES[i % COLORES.length],
    feature: p.feature || "", cliente: p.cliente || "", ok: isT(p.ok), idTraspaso: p.idTraspaso || "",
    n: (p.componentes || []).length,
  }));
  const colorProy = Object.fromEntries(proys.map((p) => [p.nombre, p.color]));
  const comps = [];
  (E?.proyectos || []).forEach((p) =>
    (p.componentes || []).forEach((c) => comps.push({ ...c, proyecto: p.nombre, cod: normCod(c.codigo), release: isT(c.release), probado: isT(c.probado) }))
  );
  const pasos = [];
  (orden || []).forEach((o, i) => {
    const cods = extraerCodigosDeElemento(o.elemento).map((x) => x.toUpperCase());
    if (!cods.length) pasos.push({ t: "sis", i, uid: o.uid, texto: o.elemento, som: o.som || "" });
    else cods.forEach((cod, k) => pasos.push({ t: "dp", i, k, uid: o.uid, cod, elemento: o.elemento, multi: cods.length > 1 }));
  });
  const enOrden = new Set(pasos.filter((p) => p.t === "dp").map((p) => p.cod));
  const fuera = [...new Set(comps.map((c) => c.cod).filter((c) => c && !enOrden.has(c)))];
  const conDatos = (p) => {
    const cs = comps.filter((c) => c.cod === p.cod);
    return {
      ...p, comps: cs,
      subida: moda(cs.map((c) => c.subida)) || dpMeta[p.cod]?.subida || "",
      enc: moda(cs.map((c) => c.resp)) || dpMeta[p.cod]?.enc || "",
    };
  };
  const pasosDatos = pasos.map((p) => (p.t === "dp" ? conDatos(p) : p));
  const fueraDatos = fuera.map((cod) => conDatos({ t: "dp", cod, fuera: true }));
  const dps = [...pasosDatos.filter((p) => p.t === "dp"), ...fueraDatos];
  const sinPaquete = comps.filter((c) => !c.cod);
  return { proys, colorProy, comps, pasos: pasosDatos, fuera: fueraDatos, dps, sinPaquete };
}

/** Avisos (no impiden cerrar): componentes sin paquete, DP sin encargado, DP vacíos. */
export function avisos(m) {
  const visto = new Set(), repes = [];
  m.pasos.forEach((p) => { if (p.t !== "dp") return; if (visto.has(p.cod)) repes.push(p.cod); else visto.add(p.cod); });
  const sinEnc = m.dps.filter((d) => d.comps.length && !d.enc);
  const vacios = m.dps.filter((d) => !d.comps.length);
  return [
    m.sinPaquete.length && { id: "sinpaq", txt: plural(m.sinPaquete.length, "componente sin paquete", "componentes sin paquete"), lista: m.sinPaquete.map((c) => c.nombre || "(sin nombre)") },
    sinEnc.length && { id: "sinenc", txt: plural(sinEnc.length, "DP sin encargado", "DP sin encargado"), lista: sinEnc.map((d) => d.cod) },
    repes.length && { id: "repes", txt: plural(repes.length, "paso repetido en el orden", "pasos repetidos en el orden"), lista: repes },
    vacios.length && { id: "vacios", txt: plural(vacios.length, "DP vacío", "DP vacíos"), lista: vacios.map((d) => d.cod) },
  ].filter(Boolean);
}

/** Problemas de orden por DP (para marcarlos en su cabecera); mismas reglas que el validador. */
export function malColocados(m) {
  const iP = m.pasos.findIndex((p) => p.t === "sis" && esParada(p.texto));
  const iA = m.pasos.findIndex((p) => p.t === "sis" && esArranque(p.texto));
  const mal = new Map();
  if (iP < 0 || iA < 0 || iP > iA) return mal;
  m.pasos.forEach((p, i) => {
    if (p.t !== "dp" || !p.comps.length) return;
    if (esRemedy(p.cod)) { if (i >= iA) mal.set(p.cod, "Debe ir antes del arranque"); }
    else if (i <= iP) mal.set(p.cod, "Debe ir después de la parada");
  });
  return mal;
}

/* ── Pegar desde Excel: equivalencias de tipo ── */
// Palabras que suele traer el Excel → raíz del tipo del pase (se casa con E.tiposComp).
const SINON = [
  ["java", ["java", "jar", "javas"]],
  ["workstation", ["workstation", "ws"]],
  ["estatic", ["estatico", "estaticos", "static", "estatica"]],
  ["workflow", ["workflow", "wf", "workflows"]],
  ["query", ["query", "queries", "consulta", "sql"]],
  ["recurs", ["recurso", "recursos", "resource", "resources"]],
  ["procedim", ["procedimiento", "procedure", "stored procedure", "proc", "sp", "package body"]],
  ["funci", ["funcion", "function", "fn"]],
  ["extrac", ["extraccion", "extract", "extraction"]],
  ["evento", ["evento", "event"]],
  ["cadena", ["cadena", "chain", "job", "control-m", "controlm", "batch"]],
  ["directorio", ["directorio", "directory", "dir", "carpeta"]],
  ["dependientes", ["dependientes entorno", "dependiente entorno", "entorno", "env", "dependientes"]],
  ["tabla", ["tabla", "table", "tbl"]],
  ["vista", ["vista", "view", "vista materializada", "materialized view", "mview"]],
];
const tipoPorRaiz = (tipos, raiz) => tipos.find((t) => sinTilde(t).startsWith(raiz)) || "";

export function mapearTipo(raw, tipos, equiv = {}) {
  const k = sinTilde(raw).trim();
  if (!k) return { tipo: "", como: "vacío" };
  if (equiv[k] && tipos.includes(equiv[k])) return { tipo: equiv[k], como: "recordado" };
  const exacto = tipos.find((t) => sinTilde(t) === k);
  if (exacto) return { tipo: exacto, como: "igual" };
  for (const [raiz, ls] of SINON) if (ls.includes(k)) { const t = tipoPorRaiz(tipos, raiz); if (t) return { tipo: t, como: "parecido" }; }
  if (k.length >= 4 && k.length <= 28 && !/[_./]/.test(k))
    for (const [raiz, ls] of SINON) if (ls.some((s) => s.length >= 4 && (k.includes(s) || s.includes(k)))) { const t = tipoPorRaiz(tipos, raiz); if (t) return { tipo: t, como: "parecido" }; }
  return { tipo: "", como: "sin equivalencia" };
}

export function tipoPorNombre(nombre, tipos) {
  const u = String(nombre || "").toUpperCase();
  const r = (raiz) => tipoPorRaiz(tipos, raiz);
  if (/\.JAR$/.test(u) || /^RDRRULES\//.test(u)) return r("java");
  if (/^PRC_|^PKG_|^SP_/.test(u)) return r("procedim");
  if (/^FN_|^FNC_/.test(u)) return r("funci");
  if (/^JOB_|^CH_/.test(u)) return r("cadena");
  if (/\.SQL$/.test(u)) return r("query");
  if (/^V_|^VW_/.test(u)) return r("vista");
  return "";
}

/** Lee lo pegado del Excel: decide la columna del nombre primero y luego la del tipo. */
export function analizarPegado(txt, { tipos, equiv, existentes, cambiar = false }) {
  const lineas = String(txt || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\t|;/).map((x) => x.trim()));
  if (!lineas.length) return { filas: [], cabecera: false, colNom: 0, colTipo: -1 };
  const cab = lineas[0].map(sinTilde);
  const cabecera = lineas.length > 1 && cab.some((x) => /componente|nombre|objeto|tipo|type/.test(x));
  const datos = cabecera ? lineas.slice(1) : lineas;
  const ncol = Math.max(...datos.map((l) => l.length));
  const col = (i) => datos.map((l) => l[i] || "");
  const reconoce = (x) => mapearTipo(x, tipos, equiv).tipo;
  let colNom = cabecera ? cab.findIndex((x) => /componente|nombre|objeto/.test(x)) : -1;
  if (colNom < 0) {
    let mejor = -Infinity;
    for (let i = 0; i < ncol; i++) {
      const v = col(i);
      const pts = new Set(v.filter(Boolean)).size - v.filter(reconoce).length * 2;
      if (pts > mejor) { mejor = pts; colNom = i; }
    }
  }
  let colTipo = cabecera ? cab.findIndex((x, i) => i !== colNom && /tipo|type/.test(x)) : -1;
  if (colTipo < 0) {
    let mejor = 0;
    for (let i = 0; i < ncol; i++) {
      if (i === colNom) continue;
      const k = col(i).filter(reconoce).length;
      if (k > mejor) { mejor = k; colTipo = i; }
    }
    if (mejor < Math.ceil(datos.length / 3)) colTipo = -1;
  }
  if (cambiar && colTipo >= 0) [colNom, colTipo] = [colTipo, colNom];
  const vistos = new Set();
  const filas = datos.map((l) => {
    const nombre = l[colNom] || "";
    const raw = colTipo >= 0 ? l[colTipo] || "" : "";
    const m = colTipo >= 0 ? mapearTipo(raw, tipos, equiv) : { tipo: tipoPorNombre(nombre, tipos), como: "por el nombre" };
    const clave = sinTilde(nombre);
    const ya = existentes.find((c) => sinTilde(c.nombre) === clave);
    const rep = vistos.has(clave);
    vistos.add(clave);
    return { nombre, raw, ...m, ya, rep, on: !!nombre && !ya && !rep };
  }).filter((f) => f.nombre);
  return { filas, cabecera, colNom, colTipo };
}

export const leerEquiv = () => { try { return JSON.parse(localStorage.getItem("pases_equivalencias") || "{}"); } catch { return {}; } };
export const guardarEquiv = (e) => { try { localStorage.setItem("pases_equivalencias", JSON.stringify(e)); } catch {} };
