/* Importación de las presentaciones de Seguimiento hechas a mano (histórico
   de Drive: "28/09/2026 Seguimiento_RDR_GLOBAL_2026.pptx").

   El backend (Codigo_Seguimiento.gs, acción leerPptx) descomprime el .pptx y
   devuelve, por diapositiva y en orden: { oculta, textos:[…], tablas:[[[celda]]] }.
   Aquí se reconoce el formato de siempre:

     "Planificación Q2. Lucía Garrido"      -> responsable interno de lo que sigue
     "<Proyecto>. SDATOOL-51125 (2025-51)"  + tabla Descripción | Fecha Límite |
                                              Comentarios | Asignación | Avance | Estado
     "Incidencias"                          + tabla Descripción | Comentarios
     "Tareas abiertas/pendientes"           + tabla Descripción | Comentarios | Estado
     "Traspasos"                            + tabla Responsable Interno | Responsable NFQ | Proyecto | Comentarios
     "Gracias." y lo que va detrás, o diapositivas ocultas -> anexo

   Y las AUTOGENERADAS por la web ("Seguimiento RDR - 13/10/26 - Autogenerado.pptx",
   plantillaPptx.js): no tienen tablas, cada dato es un cuadro de texto en su
   columna. El backend devuelve además los cuadros con su posición (cajas) y se
   leen por columnas (docDesdeAutogenerada). Las subidas desde que se guardan
   sus datos llegan ya como { doc } y se copian tal cual.

   Es código puro (sin React): se prueba en Node. */

import { parseISO, toISO, FASES, ESTADOS, TIPOS_TRASPASO } from "./modelo.js";

const MES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11 };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const DIA = 86400000;

/** "31 Jul" / "07 Sep" / "17/10" / "Q3" -> "2026-07-31" / "Q3" ("" si no se entiende).
    El año es el de la reunión, salvo que la fecha quede a más de ~5 meses
    por delante (año anterior) o ~10 meses por detrás (año siguiente). */
export function fechaImportada(txt, refISO) {
  const t = String(txt || "").trim();
  if (/^Q[1-4](\s*\d{4})?$/i.test(t)) return t.toUpperCase();
  const ref = parseISO(refISO) || new Date();
  let d = null;
  let m = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3})[a-záéíóú]*\.?(?:\s+(?:de\s+)?(\d{4}))?$/i.exec(t);
  if (m && MES[norm(m[2]).slice(0, 3)] !== undefined) d = { dia: +m[1], mes: MES[norm(m[2]).slice(0, 3)], anio: m[3] ? +m[3] : null };
  m = !d && /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (m) d = { dia: +m[1], mes: +m[2] - 1, anio: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null };
  if (!d || d.mes < 0 || d.mes > 11 || d.dia < 1 || d.dia > 31) return "";
  let anio = d.anio || ref.getFullYear();
  if (!d.anio) {
    const f = new Date(anio, d.mes, d.dia);
    // Más pasado que futuro: en estas presentaciones abundan las tareas ya cerradas.
    if (f - ref > 150 * DIA) anio--;
    else if (ref - f > 300 * DIA) anio++;
  }
  return toISO(new Date(anio, d.mes, d.dia));
}

/** Fase de una fila por su descripción ("Pruebas Unitarias(Bloque 2)" -> pruebas). */
export function faseDe(desc) {
  const t = norm(desc);
  if (/post/.test(t)) return "post";
  if (/implant|go ?live|paso a prod|subida a prod/.test(t)) return "implantacion";
  if (/prueba|simulacro|uat\b|test de/.test(t)) return "pruebas";
  if (/desarroll|codific|construcc/.test(t)) return "desarrollo";
  if (/analisis|diseno|alcance/.test(t)) return "analisis";
  if (/testing/.test(t)) return "testing";
  if (/soporte/.test(t)) return "soporte";
  return "soporte";
}
const SOLO_FASE = new Set(["analisis", "desarrollo", "desarrollos", "pruebas", "implantacion", "testing", "soporte", "post-implantacion", "postimplantacion"]);

const avanceDe = (t) => {
  const m = /(\d{1,3})\s*%/.exec(String(t || ""));
  return m ? Math.min(100, Number(m[1])) : null;
};
/** Celda -> líneas sin viñetas ("-Soporte UAT\n-Soporte DataX"). */
const lineasDe = (t) => String(t || "").split("\n").map((s) => s.replace(/^\s*[-–•·*]\s*/, "").trim()).filter(Boolean);

/** Estado a partir del avance y la fecha (en las antiguas era un círculo de color). */
function estadoDe(avance, fechaISO, refISO) {
  if (avance === null) return "en_plazo";
  if (avance >= 100) return "en_plazo";
  const f = parseISO(fechaISO);
  if (f && refISO && toISO(f) < refISO) return "en_riesgo";
  return avance === 0 ? "sin_iniciar" : "en_curso";
}

/** Columna de la cabecera que casa con re (-1 si no hay). */
const col = (cab, re) => cab.findIndex((c) => re.test(norm(c)));

/** "Decomisado MIDAS. Migración Operaciones. SDATOOL-51125 (2025-51)" -> partes. */
export function tituloProyecto(t) {
  const txt = String(t || "").replace(/\s+/g, " ").trim();
  const sdatool = (/SDATOOL-?\s*\d+/i.exec(txt) || [""])[0].replace(/\s/g, "").toUpperCase().replace(/^SDATOOL(\d)/, "SDATOOL-$1");
  const tr = /\((\d{4}-?\d*)\)/.exec(txt);
  const nombre = txt
    .replace(/SDATOOL-?\s*\d+/i, "")
    .replace(/\(\d{4}-?\d*\)/, "")
    .replace(/[\s.·-]+$/, "")
    .split(/\.\s+/).map((x) => x.trim()).filter(Boolean).join(" · ");
  return { nombre, sdatool, traspaso: tr ? tr[1].replace(/-$/, "") : "" };
}

let seq = 0;
const nid = (p) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

/** Elige la tabla de tareas con más filas rellenas (a veces queda una plantilla vacía detrás). */
function tablaTareas(tablas) {
  const cands = tablas.filter((t) => t.length && col(t[0], /descrip/) >= 0 && col(t[0], /fecha|avance/) >= 0);
  const rellenas = (t) => {
    const f = col(t[0], /fecha/), a = col(t[0], /avance/);
    return t.slice(1).filter((r) => (f >= 0 && r[f]) || (a >= 0 && /\d/.test(r[a] || ""))).length;
  };
  return cands.sort((x, y) => rellenas(y) - rellenas(x))[0] || null;
}

/** { slides } del backend -> { proyectos, incidencias, traspasos } (formato del modelo). */
export function docDesdePptx(raw, refISO) {
  if (raw?.doc) return { proyectos: raw.doc.proyectos || [], incidencias: raw.doc.incidencias || [], traspasos: raw.doc.traspasos || [] };
  if (esAutogenerada(raw)) return docDesdeAutogenerada(raw, refISO);
  const out = { proyectos: [], incidencias: [], traspasos: [] };
  let interno = "";
  let anexo = false;
  for (const s of raw?.slides || []) {
    const textos = s.textos || [];
    const tablas = s.tablas || [];
    if (textos.some((t) => /^gracias\b/i.test(t.trim()))) { anexo = true; continue; }
    const plan = textos.map((t) => /^Planificaci[oó]n\b[^.]*\.\s*(.+)$/i.exec(t.trim())).find(Boolean);
    if (plan) { interno = plan[1].trim(); continue; }
    const titulo = (re) => textos.some((t) => re.test(norm(t)));

    const tt = tablaTareas(tablas);
    if (tt) {
      const cab = tt[0];
      const c = { d: col(cab, /descrip/), f: col(cab, /fecha/), co: col(cab, /coment/), as: col(cab, /asign/), av: col(cab, /avance/) };
      const tituloTxt = textos.find((t) => /SDATOOL|\(\d{4}-?\d*\)/i.test(t)) || textos.find((t) => t.length < 140 && !/^migraci[oó]n de ayer/i.test(t)) || "";
      const tareas = tt.slice(1).filter((r) => (r[c.d] || "").trim()).map((r) => {
        const desc = r[c.d].replace(/\s+/g, " ").trim();
        const bloque = /\(?\s*bloque\s*(\d+)\s*\)?/i.exec(desc);
        const base = desc.replace(/\(?\s*bloque\s*\d+\s*\)?/i, "").trim();
        const fecha = c.f >= 0 ? fechaImportada(r[c.f], refISO) : "";
        const avance = c.av >= 0 ? avanceDe(r[c.av]) : null;
        return {
          id: nid("t"),
          fase: faseDe(base),
          ...(bloque ? { sufijo: `B${bloque[1]}` } : {}),
          nombre: SOLO_FASE.has(norm(base)) ? "" : base,
          fecha,
          comentarios: c.co >= 0 ? lineasDe(r[c.co]) : [],
          asignacion: c.as >= 0 ? (r[c.as] || "").trim() : "",
          avance,
          estado: estadoDe(avance, fecha, refISO),
        };
      });
      const asig = {};
      tareas.forEach((t) => { if (t.asignacion) asig[t.asignacion] = (asig[t.asignacion] || 0) + 1; });
      const responsable = Object.entries(asig).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      out.proyectos.push({ id: nid("p"), ...tituloProyecto(tituloTxt), interno, responsable, anexo: anexo || !!s.oculta, tareas });
      continue;
    }

    const tabla = tablas.find((t) => t.length && col(t[0], /descrip|interno/) >= 0);
    if (!tabla) continue;
    const cab = tabla[0];
    if (titulo(/^traspaso/) && col(cab, /interno/) >= 0) {
      const c = { i: col(cab, /interno/), n: col(cab, /nfq/), p: col(cab, /proyecto/), co: col(cab, /coment|pendiente/) };
      for (const r of tabla.slice(1)) {
        const proy = (r[c.p] || "").replace(/\s+/g, " ").trim();
        if (!proy) continue;
        const cod = /(\d{4}-\d+)\s*$/.exec(proy);
        const pendiente = (r[c.co] || "").replace(/\s+/g, " ").trim();
        out.traspasos.push({
          id: nid("tr"),
          codigo: cod ? cod[1] : "",
          proyecto: (cod ? proy.slice(0, cod.index) : proy).trim(),
          interno: (r[c.i] || "").trim(),
          nfq: (r[c.n] || "").trim(),
          pendiente,
          tipo: /implant|golive|go live/i.test(pendiente) ? "implantacion" : /\bok\b/i.test(pendiente) ? "ok_usuario" : "otro",
        });
      }
    } else if (titulo(/^incidencia/) || titulo(/^tareas (abiertas|pendientes)/)) {
      const tipo = titulo(/^tareas/) ? "tarea" : "incidencia";
      const c = { d: col(cab, /descrip/), co: col(cab, /coment/) };
      for (const r of tabla.slice(1)) {
        const tit = (r[c.d] || "").replace(/\s+/g, " ").trim();
        if (!tit) continue;
        out.incidencias.push({ id: nid("i"), tipo, estado: "en_curso", titulo: tit, detalle: c.co >= 0 ? lineasDe(r[c.co]) : [] });
      }
    }
  }
  return out;
}

// ── Presentaciones autogeneradas (plantillaPptx.js) ─────────────────────────
/* Cada slide interior lleva su pie abajo a la izquierda ("02 · Seguimiento de
   proyectos — Lucía Garrido") y los datos en cuadros alineados con las
   cabeceras de columna (TAREA, FECHA LÍMITE…). Las píldoras (fase de la tarea,
   tipo de incidencia, código de traspaso) son un cuadro de color con el texto
   encima, en la misma posición: su color dice el tipo de traspaso. */
const PIE_Y = 6.9;
const cerca = (a, b, d = 0.03) => Math.abs(a - b) <= d;
const pieDe = (s) => ((s.cajas || []).find((c) => c.y > PIE_Y && c.texto && c.x < 8 && !/^p\.\s*\d/.test(c.texto)) || {}).texto || "";
export const esAutogenerada = (raw) =>
  (raw?.slides || []).some((s) => /^0[1-4] · /.test(pieDe(s)) && (s.cajas || []).length > 0);

/** ¿Es el texto de una píldora? (hay un cuadro de color justo debajo) */
const esPildora = (c, cajas) => !!c.texto && cajas.some((r) => !r.texto && r.relleno && cerca(r.x, c.x) && cerca(r.y, c.y) && r.w <= c.w + 0.05);
const rellenoDe = (c, cajas) => (cajas.find((r) => !r.texto && r.relleno && cerca(r.x, c.x) && cerca(r.y, c.y)) || {}).relleno || "";

/** Cabeceras de una tabla: [{ k, x }] ordenadas, a partir de la que casa con `re`. */
function cabeceras(textos, re, claves) {
  const h = textos.find((c) => re.test(norm(c.texto)) && c.y < PIE_Y);
  if (!h) return null;
  const fila = textos.filter((c) => cerca(c.y, h.y, 0.02) && c.y < PIE_Y).sort((a, b) => a.x - b.x);
  return { y: h.y, cols: fila.map((c) => ({ k: (claves.find(([r]) => r.test(norm(c.texto))) || [null, "?"])[1], x: c.x })) };
}
const colDe = (cab, x) => {
  let k = null;
  for (const c of cab.cols) if (c.x <= x + 0.05) k = c.k;
  return k;
};
const sinGuion = (t) => (String(t || "").trim() === "—" ? "" : String(t || "").trim());
const FASE_POR_LABEL = Object.fromEntries(FASES.map((f) => [norm(f.label), f.id]));
const ESTADO_POR_LABEL = Object.fromEntries(ESTADOS.map((e) => [norm(e.label), e.id]));
const TRASPASO_POR_COLOR = Object.fromEntries(TIPOS_TRASPASO.map((t) => [String(t.color).toUpperCase(), t.id]));

function proyectoAuto(s, pie, refISO) {
  const cajas = s.cajas || [];
  const textos = cajas.filter((c) => c.texto);
  const cab = cabeceras(textos, /^tarea$/, [[/^tarea/, "tarea"], [/fecha/, "fecha"], [/coment/, "com"], [/asign/, "asig"], [/avance/, "av"], [/estado/, "est"]]);
  if (!cab) return null;
  const titulo = textos.find((c) => c.y >= 1.15 && c.y < 1.7 && c.w > 6);
  const sobre = textos.find((c) => c.y >= 0.85 && c.y < 1.15 && c.w > 4);
  const partes = String(sobre?.texto || "").split(" · ").map((x) => x.trim()).filter(Boolean);
  const anexo = !!s.oculta || /anexo/i.test(pie);
  const filas = textos
    .filter((c) => c.y > cab.y + 0.2 && c.y < PIE_Y && colDe(cab, c.x) === "tarea" && esPildora(c, cajas))
    .sort((a, b) => a.y - b.y);
  const tareas = filas.map((f, i) => {
    const hasta = i < filas.length - 1 ? filas[i + 1].y - 0.02 : PIE_Y;
    const celda = (k) => textos.filter((c) => c !== f && c.y >= f.y - 0.02 && c.y < hasta && colDe(cab, c.x) === k).map((c) => c.texto);
    const [base, ...resto] = f.texto.split(" · ").map((x) => x.trim());
    const sufijo = resto.join(" · ");
    const avance = avanceDe(celda("av")[0]);
    return {
      id: nid("t"),
      fase: FASE_POR_LABEL[norm(base)] || faseDe(base),
      ...(sufijo ? { sufijo } : {}),
      nombre: celda("tarea").join(" ").replace(/\s+/g, " ").trim(),
      fecha: fechaImportada(sinGuion(celda("fecha")[0]), refISO),
      comentarios: celda("com").flatMap((t) => lineasDe(t)),
      asignacion: sinGuion(celda("asig")[0]),
      avance,
      estado: ESTADO_POR_LABEL[norm(celda("est")[0])] || "sin_iniciar",
    };
  });
  const asig = {};
  tareas.forEach((t) => { if (t.asignacion) asig[t.asignacion] = (asig[t.asignacion] || 0) + 1; });
  return {
    nombre: String(titulo?.texto || "").replace(/\s*\(\d+\/\d+\)\s*$/, "").trim(),
    // "SDATOOL-51125 · 2025-51": el código de traspaso puede llevar « · » ("BAU · 2026").
    sdatool: /^SDATOOL/i.test(partes[0] || "") ? partes[0] : "",
    traspaso: (/^SDATOOL/i.test(partes[0] || "") ? partes.slice(1) : partes).join(" · "),
    interno: anexo ? "" : (pie.split(" — ")[1] || "").trim(),
    responsable: Object.entries(asig).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    anexo,
    tareas,
  };
}

function incidenciasAuto(s) {
  const cajas = s.cajas || [];
  const textos = cajas.filter((c) => c.texto && c.y < PIE_Y && c.y > 1.9);
  const etiquetas = textos.filter((c) => /^(INCIDENCIA|TAREA BLOQUEADA|TAREA( · .+)?)$/.test(c.texto) && esPildora(c, cajas));
  return etiquetas.map((e) => {
    const siguiente = etiquetas.filter((o) => o !== e && cerca(o.x, e.x, 0.3) && o.y > e.y).sort((a, b) => a.y - b.y)[0];
    const dentro = textos
      .filter((c) => c !== e && c.x >= e.x - 0.05 && c.x < e.x + 3.6 && c.y > e.y + 0.1 && c.y < (siguiente ? siguiente.y - 0.1 : PIE_Y))
      .sort((a, b) => a.y - b.y);
    const tipo = e.texto === "INCIDENCIA" ? "incidencia" : e.texto === "TAREA BLOQUEADA" ? "bloqueada" : "tarea";
    const estado = tipo === "tarea" ? ESTADO_POR_LABEL[norm(e.texto.split(" · ")[1])] || "en_curso" : "en_curso";
    return {
      id: nid("i"), tipo, estado,
      titulo: (dentro[0]?.texto || "").replace(/\s+/g, " ").trim(),
      detalle: dentro.slice(1).flatMap((c) => lineasDe(c.texto)),
    };
  }).filter((i) => i.titulo);
}

function traspasosAuto(s) {
  const cajas = s.cajas || [];
  const textos = cajas.filter((c) => c.texto);
  const cab = cabeceras(textos, /^codigo$/, [[/^codigo/, "cod"], [/^proyecto/, "proy"], [/interno/, "int"], [/nfq/, "nfq"], [/pendiente/, "pend"]]);
  if (!cab) return [];
  const filas = textos
    .filter((c) => c.y > cab.y + 0.2 && c.y < PIE_Y && colDe(cab, c.x) === "cod" && esPildora(c, cajas))
    .sort((a, b) => a.y - b.y);
  return filas.map((f) => {
    const celda = (k) => sinGuion((textos.find((c) => c !== f && c.y >= f.y - 0.02 && c.y < f.y + 0.3 && colDe(cab, c.x) === k) || {}).texto).replace(/\s+/g, " ");
    return {
      id: nid("tr"),
      codigo: sinGuion(f.texto),
      proyecto: celda("proy"),
      interno: celda("int"),
      nfq: celda("nfq"),
      pendiente: celda("pend"),
      tipo: TRASPASO_POR_COLOR[rellenoDe(f, cajas)] || "otro",
    };
  }).filter((t) => t.proyecto || t.codigo);
}

/** Presentación autogenerada -> { proyectos, incidencias, traspasos }. */
export function docDesdeAutogenerada(raw, refISO) {
  const out = { proyectos: [], incidencias: [], traspasos: [] };
  let previo = null;
  for (const s of raw?.slides || []) {
    const pie = pieDe(s);
    if (/^02 · /.test(pie) || /^Seguimiento RDR · Anexo/.test(pie)) {
      const p = proyectoAuto(s, pie, refISO);
      if (!p) continue;
      // Un proyecto con muchas tareas ocupa varias slides seguidas ("Nombre (1/2)").
      if (previo && previo.nombre === p.nombre && previo.sdatool === p.sdatool && previo.anexo === p.anexo) {
        previo.tareas.push(...p.tareas);
        continue;
      }
      previo = { id: nid("p"), ...p };
      out.proyectos.push(previo);
      continue;
    }
    previo = null;
    if (/Incidencias y tareas/.test(pie)) out.incidencias.push(...incidenciasAuto(s));
    else if (/— Traspasos/.test(pie)) out.traspasos.push(...traspasosAuto(s));
  }
  return out;
}
