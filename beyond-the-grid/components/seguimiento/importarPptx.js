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

   Es código puro (sin React): se prueba en Node. */

import { parseISO, toISO } from "./modelo.js";

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
