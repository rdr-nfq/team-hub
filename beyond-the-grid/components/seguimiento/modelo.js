/* Modelo de las Presentaciones de Seguimiento (puro, sin React ni pptxgenjs).

   Lo comparten la plantilla .pptx (plantillaPptx.js), el script de ejemplos
   (scripts/seguimiento-ejemplos.mjs) y, más adelante, el panel de
   coordinación. Todo lo que la presentación calcula sale de aquí.

   ESTRUCTURA DE DATOS (un documento por reunión):
   {
     fechaReunion: "2026-09-28",
     proyectos: [{
       id, nombre: "Decomisado MIDAS · Migración Operaciones",
       nombreCorto: "Migración MIDAS",        // opcional: fila del Gantt
       sdatool: "SDATOOL-51125", traspaso: "2025-51",
       interno: "Lucía Garrido",              // responsable interno BBVA
       responsable: "Marta",                  // persona del equipo NFQ
       anexo: false,                          // true -> diapositiva oculta al final
       tareas: [{
         id, fase: "pruebas", sufijo: "B1",   // sufijo opcional en la etiqueta
         nombre: "Soporte pruebas",
         inicio: "2026-07-01",                // opcional, solo para el Gantt
         fecha: "2026-07-31" | "Q3",          // fecha límite: ISO o trimestre
         comentarios: ["…", "…"],
         asignacion: "Marta", avance: 95 | null, estado: "en_plazo"
       }]
     }],
     incidencias: [{ id, tipo: "incidencia" | "tarea", estado, titulo,
                     detalle: ["…"], icono?: "warning" }],
     traspasos: [{ id, codigo: "2025-61", proyecto, interno, nfq,
                   pendiente: "Falta OK usuario", tipo: "ok_usuario" }]
   } */

// ── Paleta (subset de .claude-knowledge/tokens.css, sin '#') ────────────────
export const COLOR = {
  electric: "001391",
  serene: "85C8FF",
  white: "FFFFFF",
  sand: "F7F8F8",
  gray2: "E2E6EA",
  gray3: "CAD1D8",
  gray4: "ADB8C2",
  gray5: "46536D",
  midnight: "070E46",
  canary: "FFE761",
  lime: "88E783",
  aqua: "8BE1E9",
  purple: "9694FF",
  mandarin: "FFB56B",
  mute: "ADB3D9", // texto secundario sobre Electric/Midnight
  muteLight: "D9DDEC",
};

export const FASES = [
  { id: "analisis", label: "Análisis", color: COLOR.serene },
  { id: "desarrollo", label: "Desarrollo", color: COLOR.purple },
  { id: "pruebas", label: "Pruebas", color: COLOR.canary },
  { id: "implantacion", label: "Implantación", color: COLOR.mandarin },
  { id: "post", label: "Post-implantación", color: COLOR.aqua },
  { id: "soporte", label: "Soporte", color: COLOR.aqua },
  { id: "testing", label: "Testing", color: COLOR.serene },
];
export const FASE = Object.fromEntries(FASES.map((f) => [f.id, f]));
// Leyenda del Gantt (soporte/testing comparten color con otras fases).
export const FASES_GANTT = ["analisis", "desarrollo", "pruebas", "implantacion", "post"];
export const EN_ESPERA = { id: "espera", label: "En espera", color: COLOR.gray3 };

export const ESTADOS = [
  { id: "en_plazo", label: "En plazo", color: COLOR.lime },
  { id: "en_curso", label: "En curso", color: COLOR.serene },
  { id: "en_riesgo", label: "En riesgo", color: COLOR.mandarin },
  { id: "sin_iniciar", label: "Sin iniciar", color: COLOR.gray3 },
];
export const ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.id, e]));

export const TIPOS_TRASPASO = [
  { id: "ok_usuario", label: "falta el OK de usuario (pruebas)", nombre: "Canary", color: COLOR.canary },
  { id: "implantacion", label: "falta la implantación", nombre: "Mandarin", color: COLOR.mandarin },
  { id: "otro", label: "otros pendientes", nombre: "Serene", color: COLOR.serene },
];
export const TIPO_TRASPASO = Object.fromEntries(TIPOS_TRASPASO.map((t) => [t.id, t]));

export const ICONOS = ["warning", "tasks", "database", "transfer", "calendar", "clock"];

// ── Fechas ──────────────────────────────────────────────────────────────────
export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MES3 = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const n2 = (n) => String(n).padStart(2, "0");

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_Q = /^Q([1-4])(?:\s*(\d{4}))?$/i;

/** "2026-09-28" -> Date local (sin desfases de zona horaria). */
export const parseISO = (s) => {
  const m = RE_ISO.exec(String(s || "").trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export const toISO = (d) => `${d.getFullYear()}-${n2(d.getMonth() + 1)}-${n2(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lunes = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** 28 de septiembre de 2026 */
export const fechaLarga = (iso) => {
  const d = parseISO(iso);
  return d ? `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : "";
};

/** DD/MM/YY — el formato del nombre del fichero. */
export const fechaCorta = (iso) => {
  const d = parseISO(iso);
  return d ? `${n2(d.getDate())}/${n2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}` : "";
};

/** Fecha límite de una tarea tal y como se pinta: "31 Jul", "Q3" o "—". */
export const fechaTarea = (fecha) => {
  const d = parseISO(fecha);
  if (d) return `${d.getDate()} ${MES3[d.getMonth()]}`;
  const t = String(fecha || "").trim();
  return t ? t.toUpperCase() : "—";
};

/** Fecha límite -> Date (el trimestre cuenta como su último día). */
export const fechaLimiteDate = (fecha, anioRef) => {
  const d = parseISO(fecha);
  if (d) return d;
  const q = RE_Q.exec(String(fecha || "").trim());
  if (!q) return null;
  const anio = Number(q[2] || anioRef);
  const mes = Number(q[1]) * 3; // fin de trimestre
  return new Date(anio, mes, 0);
};
const esTrimestre = (fecha) => RE_Q.test(String(fecha || "").trim());

// ── Drive: carpeta y nombre del fichero ─────────────────────────────────────
/** ["2026", "9. Septiembre"] */
export const rutaDrive = (iso) => {
  const d = parseISO(iso);
  return d ? [String(d.getFullYear()), `${d.getMonth() + 1}. ${cap(MESES[d.getMonth()])}`] : [];
};
/** "Seguimiento RDR - 28/09/26 - Autogenerado.pptx" */
export const nombreFichero = (iso) => `Seguimiento RDR - ${fechaCorta(iso)} - Autogenerado.pptx`;

// ── Derivados ───────────────────────────────────────────────────────────────
export const etiquetaFase = (t) => {
  const f = FASE[t.fase];
  const base = (f ? f.label : t.fase || "Tarea").toUpperCase();
  return t.sufijo ? `${base} · ${String(t.sufijo).toUpperCase()}` : base;
};
export const colorFase = (id) => (FASE[id] ? FASE[id].color : COLOR.gray3);
export const nombreCorto = (p) => {
  if (p.nombreCorto) return p.nombreCorto;
  const partes = String(p.nombre || "").split(" · ");
  return partes[partes.length - 1];
};
const conAvance = (t) => t.avance !== null && t.avance !== undefined && t.avance !== "";
export const completa = (t) => conAvance(t) && Number(t.avance) >= 100;

/** Lista "a, b y c". */
export const enumerar = (xs) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;

const NUM = ["cero", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
export const numTexto = (n, femenino = true) => {
  if (n > 10) return String(n);
  if (n === 1) return femenino ? "una" : "un";
  return NUM[n];
};

/** Proyectos visibles agrupados por responsable interno, en orden de aparición. */
export const gruposPorInterno = (proyectos) => {
  const grupos = [];
  for (const p of proyectos) {
    let g = grupos.find((x) => x.interno === p.interno);
    if (!g) grupos.push((g = { interno: p.interno, proyectos: [] }));
    g.proyectos.push(p);
  }
  return grupos;
};

/** Resumen de un proyecto: "6 tareas · 4 al 100 % · 1 en riesgo · Asignación: Marta". */
export const resumenProyecto = (p) => {
  const ts = p.tareas || [];
  const hechas = ts.filter(completa).length;
  const riesgo = ts.filter((t) => t.estado === "en_riesgo").length;
  const asignados = [...new Set([p.responsable, ...ts.map((t) => t.asignacion)].filter(Boolean))];
  const partes = [`${ts.length} ${ts.length === 1 ? "tarea" : "tareas"}`, `${hechas} al 100 %`];
  if (riesgo) partes.push(`${riesgo} en riesgo`);
  if (asignados.length) partes.push(`Asignación: ${enumerar(asignados)}`);
  return partes.join(" · ");
};

/** Cifras globales de la reunión (portada, separadores y "Cifras clave"). */
export const cifras = (datos) => {
  const hoy = parseISO(datos.fechaReunion) || new Date();
  const anio = hoy.getFullYear();
  const proyectos = (datos.proyectos || []).filter((p) => !p.anexo);
  const tareas = proyectos.flatMap((p) => (p.tareas || []).map((t) => ({ ...t, proyecto: p })));
  const conPct = tareas.filter(conAvance);
  const riesgo = tareas.filter((t) => t.estado === "en_riesgo");
  const limite30 = addDays(hoy, 30);
  const implantaciones = tareas.filter((t) => {
    if (t.fase !== "implantacion" || completa(t)) return false;
    const d = fechaLimiteDate(t.fecha, anio);
    return d && !esTrimestre(t.fecha) && d >= addDays(hoy, -7) && d <= limite30;
  });
  const vencidas = tareas.filter((t) => {
    const d = fechaLimiteDate(t.fecha, anio);
    return d && d < hoy && conAvance(t) && !completa(t);
  });
  const incidencias = datos.incidencias || [];
  const nombresDe = (ts) => [...new Set(ts.map((t) => nombreCorto(t.proyecto)))];
  return {
    proyectos: proyectos.length,
    internos: new Set(proyectos.map((p) => p.interno)).size,
    tareas: tareas.length,
    hechas: tareas.filter(completa).length,
    riesgo: riesgo.length,
    riesgoProyectos: nombresDe(riesgo),
    implantaciones: implantaciones.length,
    implantacionesProyectos: nombresDe(implantaciones),
    vencidas: vencidas.length,
    vencidasProyectos: nombresDe(vencidas),
    avanceMedio: conPct.length
      ? Math.round(conPct.reduce((s, t) => s + Number(t.avance), 0) / conPct.length)
      : 0,
    incidencias: incidencias.filter((i) => i.tipo === "incidencia").length,
    tareasAbiertas: incidencias.filter((i) => i.tipo !== "incidencia").length,
    traspasos: (datos.traspasos || []).length,
  };
};

// ── Gantt de planificación ──────────────────────────────────────────────────
export const SEMANAS_ATRAS = 13;
export const SEMANAS_ADELANTE = 2;

/** Semanas (lunes) visibles: 13 antes de la semana de la reunión y 2 después. */
export const semanasGantt = (iso) => {
  const base = lunes(parseISO(iso) || new Date());
  const out = [];
  for (let i = -SEMANAS_ATRAS; i <= SEMANAS_ADELANTE; i++) out.push(addDays(base, i * 7));
  return out;
};

/** Tramos de un proyecto en el Gantt, en días [desde, hasta) con su color.
    - Las tareas se ordenan por fecha límite (pueden venir en cualquier orden).
    - Cada tarea va de su `inicio` (o el fin de la anterior) a su fecha límite.
    - Una tarea sin iniciar con fecha por trimestre se pinta como EN ESPERA.
    - Tras la última tarea con fecha no se pinta nada. */
export const tramosGantt = (p, anioRef) => {
  const conFecha = (p.tareas || [])
    .map((t) => ({ t, fin: fechaLimiteDate(t.fecha, anioRef) }))
    .filter((x) => x.fin)
    .sort((a, b) => a.fin - b.fin);
  const tramos = [];
  let cursor = null;
  for (const { t, fin } of conFecha) {
    const hasta = addDays(fin, 1);
    const ini = parseISO(t.inicio) || cursor;
    const espera = esTrimestre(t.fecha) && t.estado === "sin_iniciar";
    tramos.push({
      desde: ini && ini < hasta ? ini : cursor, // null = desde el principio de la ventana
      hasta,
      fase: espera ? "espera" : t.fase,
      color: espera ? EN_ESPERA.color : colorFase(t.fase),
    });
    if (!cursor || hasta > cursor) cursor = hasta;
  }
  return tramos;
};

// Cada semana cuenta para el mes de su jueves (como las semanas ISO).
const mesDeSemana = (lunesSemana) => addDays(lunesSemana, 3);

/** Mes del rango del Gantt: "JULIO – OCTUBRE 2026". */
export const rangoGantt = (semanas) => {
  const a = mesDeSemana(semanas[0]);
  const b = mesDeSemana(semanas[semanas.length - 1]);
  const ma = MESES[a.getMonth()].toUpperCase();
  const mb = MESES[b.getMonth()].toUpperCase();
  return a.getFullYear() === b.getFullYear()
    ? `${ma} – ${mb} ${b.getFullYear()}`
    : `${ma} ${a.getFullYear()} – ${mb} ${b.getFullYear()}`;
};

export const etiquetaSemana = (d) => `${d.getDate()}/${n2(d.getMonth() + 1)}`;
export const mesSemana = (d) => mesDeSemana(d).getMonth();
export const nombreMes = (d) => MESES[mesDeSemana(d).getMonth()].toUpperCase();
export { addDays };
