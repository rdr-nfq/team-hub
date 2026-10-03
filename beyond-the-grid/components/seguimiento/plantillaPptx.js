/* Plantilla .pptx de "Seguimiento RDR" (pptxgenjs, 13,33" × 7,5").

   Reproduce el diseño de la presentación "Seguimiento RDR Global 2026" a
   partir de los datos del modelo (modelo.js). Siempre la misma estructura:

     Portada · Índice
     01 Planificación del equipo  -> Gantt derivado de las tareas
     02 Seguimiento de proyectos  -> 1 slide por proyecto (pagina si no cabe)
     03 Incidencias y traspasos   -> tarjetas de incidencias/tareas + tabla
     Cifras clave · Gracias · Anexo (proyectos con anexo: true, ocultos)

   Es código puro: no toca ni el DOM ni el sistema de ficheros. Recibe la
   clase PptxGenJS y los logos/iconos ya en base64 ("image/png;base64,…"),
   así funciona igual en el navegador (panel de coordinación) y en Node
   (scripts/seguimiento-ejemplos.mjs). */

import {
  COLOR as C, FASE, FASES_GANTT, EN_ESPERA, ESTADO, TIPO_TRASPASO, TIPOS_TRASPASO,
  fechaLarga, fechaTarea, etiquetaFase, colorFase, nombreCorto, resumenProyecto,
  gruposPorInterno, cifras, enumerar, numTexto, semanasGantt, tramosGantt, rangoGantt,
  etiquetaSemana, nombreMes, mesSemana, parseISO, addDays, completa,
} from "./modelo.js";

const HEAD = "Source Serif 4";
const BODY = "Lato";
const W = 13.333;
const MX = 0.55; // margen lateral
const CW = 12.23; // ancho de contenido
const XR = MX + CW; // borde derecho del contenido

const ICONO_TIPO = { incidencia: "warning", tarea: "tasks" };

export function generarPresentacion(PptxGenJS, datos, assets) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.theme = { headFontFace: HEAD, bodyFontFace: BODY };
  pres.author = "NFQ Advisory Services";
  pres.company = "NFQ Advisory Services";
  const fecha = datos.fechaReunion;
  const anio = (parseISO(fecha) || new Date()).getFullYear();
  pres.title = `Seguimiento RDR · ${fechaLarga(fecha)}`;

  const k = cifras(datos);
  const visibles = (datos.proyectos || []).filter((p) => !p.anexo);
  const anexos = (datos.proyectos || []).filter((p) => p.anexo);
  const titulo = `Seguimiento RDR Global ${anio}`;

  // ── Primitivas ────────────────────────────────────────────────────────────
  const S = pres.shapes;
  const txt = (slide, text, o) =>
    slide.addText(text, {
      x: o.x, y: o.y, w: o.w, h: o.h,
      fontFace: o.head ? HEAD : BODY,
      fontSize: o.size || 9,
      bold: !!o.bold,
      color: o.color || C.electric,
      align: o.align || "left",
      valign: o.valign || "top",
      margin: 0,
      isTextBox: true,
      ...(o.lineSpacingMultiple ? { lineSpacingMultiple: o.lineSpacingMultiple } : {}),
      ...(o.paraSpaceAfter ? { paraSpaceAfter: o.paraSpaceAfter } : {}),
      ...(o.charSpacing ? { charSpacing: o.charSpacing } : {}),
    });
  const rect = (slide, x, y, w, h, color, r = 0, extra = {}) =>
    slide.addShape(r ? S.ROUNDED_RECTANGLE : S.RECTANGLE, {
      x, y, w, h,
      fill: { color },
      line: { type: "none" },
      ...(r ? { rectRadius: r } : {}),
      ...extra,
    });
  const linea = (slide, x, y, w, h, color, dash) =>
    slide.addShape(S.LINE, { x, y, w, h, line: { color, width: dash ? 1.25 : 0.75, ...(dash ? { dashType: "dash" } : {}) } });
  const punto = (slide, x, y, d, color) =>
    slide.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color }, line: { type: "none" } });
  const tarjeta = (slide, x, y, w, h) =>
    rect(slide, x, y, w, h, C.white, 0.12, {
      shadow: { type: "outer", color: C.electric, opacity: 0.12, blur: 8, offset: 2, angle: 90 },
    });
  const img = (slide, data, x, y, w, h) => slide.addImage({ data, x, y, w, h });

  /** Etiqueta tipo "píldora" (texto Electric sobre acento). Devuelve el ancho. */
  const pildora = (slide, text, x, y, color, { size = 6.8, h = 0.24, w } = {}) => {
    const ancho = w || 0.3 + String(text).length * (size / 6.8) * 0.062;
    rect(slide, x, y, ancho, h, color, h / 2);
    txt(slide, text, { x, y, w: ancho, h, size, bold: true, align: "center", valign: "middle" });
    return ancho;
  };

  /** Cabecera y pie comunes de las slides interiores. */
  const marco = (slide, { oscuro, kicker, pie, page, total }) => {
    const mute = oscuro ? C.mute : C.gray5;
    if (kicker) txt(slide, kicker.toUpperCase(), { x: MX, y: 0.3, w: 9.4, h: 0.32, size: 9, bold: true, color: mute, valign: "middle" });
    img(slide, oscuro ? assets.bbvaWhite : assets.bbvaRgb, 11.73, 0.33, 1.05, 0.32);
    txt(slide, pie, { x: MX, y: 7.06, w: 7.6, h: 0.26, size: 8, color: mute, valign: "middle" });
    img(slide, oscuro ? assets.nfqWhite : assets.nfqBlack, 11.4, 7.11, 0.36, 0.17);
    txt(slide, `p. ${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
      x: 11.86, y: 7.06, w: 0.92, h: 0.26, size: 8, color: mute, align: "right", valign: "middle",
    });
  };

  /** Título de slide de contenido (kicker opcional encima, resumen debajo). */
  const cabecera = (slide, { sobre, titulo: t, sub, conSobre = true }) => {
    const y0 = conSobre ? 1.0 : 0.77;
    if (sobre) txt(slide, sobre, { x: MX, y: y0, w: 8, h: 0.26, size: 9.5, bold: true, color: C.gray5, valign: "middle" });
    const size = t.length > 60 ? 21 : t.length > 48 ? 23 : 26;
    txt(slide, t, { x: MX, y: y0 + 0.31, w: 12.2, h: 0.49, size, bold: true, head: true, valign: "middle" });
    if (sub) txt(slide, sub, { x: MX, y: y0 + 0.82, w: 12.2, h: 0.2, size: 10.5, color: C.gray5, valign: "middle" });
  };

  // Las slides se planifican primero y se pintan después: así cada pie sabe
  // su "p. NN / TOTAL".
  const plan = [];
  const add = (fn, opts = {}) => plan.push({ fn, ...opts });

  // ── Portada ───────────────────────────────────────────────────────────────
  add((s) => {
    s.background = { color: C.electric };
    img(s, assets.bbvaWhite, 11.08, 0.42, 1.7, 0.51);
    txt(s, `SEGUIMIENTO · ${fechaLarga(fecha).toUpperCase()}`, { x: MX, y: 1.95, w: 9.5, h: 0.3, size: 10.5, bold: true, color: C.mute, valign: "middle" });
    txt(s, [
      { text: "Seguimiento", options: { breakLine: true } },
      { text: `RDR Global ${anio}` },
    ], { x: MX, y: 2.3, w: 11, h: 1.53, size: 46, bold: true, head: true, color: C.sand, valign: "middle", lineSpacingMultiple: 0.95 });
    txt(s, "Planificación del equipo, estado de los proyectos, incidencias y traspasos pendientes.", {
      x: MX, y: 4.0, w: 9, h: 0.26, size: 11.5, color: C.muteLight, valign: "middle",
    });
    let x = MX;
    const chips = [
      ["calendar", "PLANIFICACIÓN", C.serene],
      ["tasks", `${k.proyectos} PROYECTOS`, C.lime],
      ["transfer", `${k.traspasos} ${k.traspasos === 1 ? "TRASPASO" : "TRASPASOS"}`, C.canary],
    ];
    for (const [ico, label, color] of chips) {
      const w = 0.62 + label.length * 0.066;
      rect(s, x, 5.56, w, 0.34, color, 0.17);
      img(s, assets.icons[ico], x + 0.13, 5.635, 0.19, 0.19);
      txt(s, label, { x: x + 0.38, y: 5.56, w: w - 0.45, h: 0.34, size: 8.5, bold: true, valign: "middle" });
      x += w + 0.21;
    }
    txt(s, `Nfq Advisory Services, ${anio}`, { x: MX, y: 6.96, w: 6.5, h: 0.32, size: 8.5, color: C.mute, valign: "middle" });
    txt(s, "HECHO POR", { x: 10.91, y: 6.96, w: 1.0, h: 0.33, size: 8, bold: true, color: C.mute, align: "right", valign: "middle" });
    img(s, assets.nfqWhite, 12.02, 6.96, 0.7, 0.33);
    s.addNotes(`Seguimiento del equipo RDR a ${fechaLarga(fecha)}: ${k.proyectos} proyectos, ${k.tareas} tareas, ${k.incidencias + k.tareasAbiertas} incidencias o tareas abiertas y ${k.traspasos} traspasos pendientes.`);
  });

  // ── Índice ────────────────────────────────────────────────────────────────
  const BLOQUES = [
    { n: "01", t: "Planificación del equipo", color: C.serene,
      d: "Fases de cada proyecto por semana y responsable interno." },
    { n: "02", t: "Seguimiento de proyectos", color: C.lime,
      d: `Detalle de ${k.proyectos} proyectos: tareas, fechas límite, avance y estado.` },
    { n: "03", t: "Incidencias y traspasos", color: C.canary,
      d: "Incidencias, tareas abiertas y traspasos pendientes de cerrar." },
  ];
  add((s, page, total) => {
    s.background = { color: C.midnight };
    marco(s, { oscuro: true, kicker: "Seguimiento RDR   Índice", pie: titulo, page, total });
    txt(s, "Índice", { x: MX, y: 1.3, w: 12.2, h: 0.62, size: 30, bold: true, head: true, color: C.sand, valign: "middle" });
    BLOQUES.forEach((b, i) => {
      const x = MX + i * 4.17;
      rect(s, x, 2.3, 3.89, 3.85, b.color, 0.12);
      txt(s, `BLOQUE ${b.n}`, { x: x + 0.24, y: 2.56, w: 3.41, h: 0.26, size: 8.5, bold: true, valign: "middle" });
      txt(s, b.t, { x: x + 0.24, y: 2.9, w: 3.41, h: 0.95, size: 15.5, bold: true, head: true });
      txt(s, b.d, { x: x + 0.24, y: 3.92, w: 3.41, h: 1.95, size: 10.5 });
    });
    s.addNotes("Tres bloques: planificación del equipo, seguimiento de proyectos e incidencias y traspasos.");
  });

  // ── Separadores ───────────────────────────────────────────────────────────
  const separador = ({ bg, kicker, lineas, sub, pie, nota }) =>
    add((s, page, total) => {
      const oscuro = bg !== C.serene;
      s.background = { color: bg };
      img(s, oscuro ? assets.bbvaWhite : assets.bbvaRgb, MX, 0.34, 1.35, 0.41);
      txt(s, kicker, { x: MX, y: 2.9, w: 10, h: 0.3, size: 10.5, bold: true, color: oscuro ? C.mute : C.electric, valign: "middle" });
      txt(s, lineas.map((l, i) => ({ text: l, options: i < lineas.length - 1 ? { breakLine: true } : {} })), {
        x: MX, y: 3.27, w: 11.5, h: 1.44, size: 44, bold: true, head: true, color: oscuro ? C.sand : C.electric, valign: "middle", lineSpacingMultiple: 0.95,
      });
      txt(s, sub, { x: MX, y: 4.89, w: 8.6, h: 0.5, size: 12.5, color: oscuro ? C.muteLight : C.electric });
      txt(s, pie, { x: MX, y: 7.06, w: 7.6, h: 0.26, size: 8, color: oscuro ? C.mute : C.gray5, valign: "middle" });
      img(s, oscuro ? assets.nfqWhite : assets.nfqBlack, 11.4, 7.11, 0.36, 0.17);
      txt(s, `p. ${String(page).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, {
        x: 11.86, y: 7.06, w: 0.92, h: 0.26, size: 8, color: oscuro ? C.mute : C.gray5, align: "right", valign: "middle",
      });
      if (nota) s.addNotes(nota);
    });

  // ── 01 · Planificación (Gantt) ────────────────────────────────────────────
  const semanas = semanasGantt(fecha);
  separador({
    bg: C.serene,
    kicker: "BLOQUE 01 · PLANIFICACIÓN",
    lineas: ["Planificación", "del equipo"],
    sub: `Fases de cada proyecto por semana, ${rangoGantt(semanas).toLowerCase()}, agrupadas por responsable interno.`,
    pie: "01 · Planificación del equipo",
    nota: "Bloque 1: planificación del equipo por responsable interno.",
  });

  const GX = 3.25; // inicio de la línea temporal
  const GW = 9.28; // ancho de la línea temporal (16 semanas)
  const colW = GW / semanas.length;
  const t0 = semanas[0];
  const tFin = addDays(semanas[semanas.length - 1], 7);
  const dias = (d) => (d - t0) / 86400000;
  const xDe = (d) => GX + (Math.max(0, Math.min(dias(d), dias(tFin))) / 7) * colW;

  // Filas del Gantt: se comprime el interlineado hasta un mínimo antes de
  // paginar por grupos (solo si hay muchísimos proyectos).
  const G_Y0 = 2.98; // primera fila
  const G_MAX = 6.55; // última fila posible
  const gruposGantt = gruposPorInterno(visibles);
  const altoGantt = (gs, pitch, grupo) => gs.reduce((h, g) => h + grupo + g.proyectos.length * pitch, 0);
  const escala = Math.min(1, Math.max(0.8, (G_MAX - G_Y0) / Math.max(0.01, altoGantt(gruposGantt, 0.27, 0.2))));
  const PITCH = 0.27 * escala;
  const GRUPO = 0.2 * escala;
  const paginasGantt = [];
  {
    let actual = [];
    let alto = 0;
    for (const g of gruposGantt) {
      const h = GRUPO + g.proyectos.length * PITCH;
      if (actual.length && alto + h > G_MAX - G_Y0) {
        paginasGantt.push(actual);
        actual = [];
        alto = 0;
      }
      actual.push(g);
      alto += h;
    }
    if (actual.length || !paginasGantt.length) paginasGantt.push(actual);
  }

  paginasGantt.forEach((grupos, pi) =>
    add((s, page, total) => {
      s.background = { color: C.sand };
      marco(s, { kicker: "01 · Planificación del equipo   Por responsable", pie: "01 · Planificación del equipo — Por responsable", page, total });
      cabecera(s, {
        sobre: rangoGantt(semanas),
        titulo: `Planificación por responsable${paginasGantt.length > 1 ? ` (${pi + 1}/${paginasGantt.length})` : ""}`,
      });
      // Leyenda (alineada a la derecha).
      const leyenda = [...FASES_GANTT.map((id) => FASE[id]), EN_ESPERA];
      let lx = XR;
      for (const f of [...leyenda].reverse()) {
        const tw = 0.1 + f.label.length * 0.062;
        lx -= tw;
        txt(s, f.label.toUpperCase(), { x: lx, y: 1.85, w: tw, h: 0.19, size: 7.5, bold: true, color: C.gray5, valign: "middle" });
        lx -= 0.2;
        rect(s, lx, 1.88, 0.13, 0.13, f.color, 0.03);
        lx -= 0.16;
      }
      // Alto de la tarjeta según filas.
      const filas = grupos.reduce((n, g) => n + g.proyectos.length, 0);
      const altoFilas = grupos.length * GRUPO + filas * PITCH;
      const yFin = Math.max(G_Y0 + altoFilas + 0.05, 4.2);
      tarjeta(s, MX, 2.27, CW, yFin - 2.27 + 0.12);
      // Semana actual (fondo) y meses.
      const hoy = parseISO(fecha);
      const iAct = semanas.findIndex((d, i) => hoy >= d && hoy < addDays(d, 7));
      if (iAct >= 0) rect(s, GX + iAct * colW, 2.65, colW, yFin - 2.65, C.gray2);
      let m0 = 0;
      for (let i = 1; i <= semanas.length; i++) {
        if (i === semanas.length || mesSemana(semanas[i]) !== mesSemana(semanas[m0])) {
          const x = GX + m0 * colW;
          const w = (i - m0) * colW;
          txt(s, nombreMes(semanas[m0]), { x, y: 2.41, w, h: 0.24, size: 8, bold: true, align: "center", valign: "middle" });
          linea(s, x + 0.05, 2.65, w - 0.1, 0, C.electric);
          if (m0 > 0) linea(s, x, 2.69, 0, yFin - 2.69, C.gray3);
          m0 = i;
        }
      }
      semanas.forEach((d, i) =>
        txt(s, etiquetaSemana(d), { x: GX + i * colW, y: 2.65, w: colW, h: 0.24, size: 7, color: C.gray5, align: "center", valign: "middle" }),
      );
      // Filas.
      let y = G_Y0;
      grupos.forEach((g, gi) => {
        if (gi > 0) linea(s, 0.72, y - 0.06, 11.9, 0, C.gray2);
        txt(s, g.interno.toUpperCase(), { x: 0.79, y, w: 2.4, h: 0.17, size: 7, bold: true, color: C.gray5, valign: "middle" });
        y += GRUPO - 0.03;
        for (const p of g.proyectos) {
          txt(s, nombreCorto(p), { x: 0.79, y, w: 2.4, h: PITCH - 0.05, size: 9, bold: true, valign: "middle" });
          const by = y + (PITCH - 0.05 - 0.16) / 2;
          rect(s, GX, by, GW, 0.16, C.sand, 0.06);
          for (const tr of tramosGantt(p, anio)) {
            const x1 = tr.desde ? xDe(tr.desde) : GX;
            const x2 = xDe(tr.hasta);
            if (x2 - x1 < 0.04) continue;
            rect(s, x1 + 0.01, by, x2 - x1 - 0.02, 0.16, tr.color, 0.06);
          }
          y += PITCH;
        }
        y += 0.03;
      });
      // Marca de hoy.
      if (iAct >= 0) {
        const xh = xDe(hoy);
        linea(s, xh, 2.89, 0, yFin - 2.89, C.electric, true);
        rect(s, xh - 0.48, yFin + 0.03, 0.96, 0.18, C.electric, 0.09);
        txt(s, "SEMANA ACTUAL", { x: xh - 0.48, y: yFin + 0.03, w: 0.96, h: 0.18, size: 6.5, bold: true, color: C.white, align: "center", valign: "middle" });
      }
      s.addNotes(`Planificación por responsable (${rangoGantt(semanas).toLowerCase()}), derivada de las fechas límite de cada tarea. Las tareas sin iniciar con fecha por trimestre aparecen en espera.`);
    }),
  );

  // ── 02 · Seguimiento de proyectos ─────────────────────────────────────────
  separador({
    bg: C.electric,
    kicker: "BLOQUE 02 · DETALLE POR RESPONSABLE",
    lineas: ["Seguimiento", "de proyectos"],
    sub: `${k.proyectos} ${k.proyectos === 1 ? "proyecto" : "proyectos"} y ${k.tareas} tareas con fecha límite, avance y estado. ${k.hechas} ${k.hechas === 1 ? "tarea está" : "tareas están"} al 100 % y ${k.riesgo} en riesgo.`,
    pie: "02 · Seguimiento de proyectos",
    nota: `Bloque 2: ${k.proyectos} proyectos y ${k.tareas} tareas; ${k.hechas} al 100 % y ${k.riesgo} en riesgo.`,
  });

  const COLS = [
    ["TAREA", 0.79, 2.19], ["FECHA LÍMITE", 3.17, 0.93], ["COMENTARIOS", 4.3, 4.12],
    ["ASIGNACIÓN", 8.61, 1.03], ["AVANCE", 9.84, 1.29], ["ESTADO", 11.32, 1.22],
  ];
  const T_Y = 2.19; // arriba de la tabla
  const T_MAX = 6.9; // abajo máximo de la tabla
  const lineasDe = (s, porLinea) => Math.max(1, Math.ceil(String(s || "").length / porLinea));
  // Alto del contenido de una fila (sin el aire entre filas, FILA_PAD).
  const FILA_PAD = 0.1; // si así no cabe en una slide se prueba con menos aire
  const PADS = [FILA_PAD, 0.06, 0.03];
  const altoContenido = (t) => {
    const coms = (t.comentarios || []).filter(Boolean);
    const lc = coms.reduce((n, c) => n + lineasDe(c, coms.length > 1 ? 84 : 90), 0);
    const izq = t.nombre ? 0.29 + 0.16 * lineasDe(t.nombre, 34) : 0.24;
    return Math.max(izq, coms.length ? 0.04 + lc * 0.155 : 0);
  };
  const ALTO_FILAS = T_MAX - (T_Y + 0.46);

  const slideProyecto = (p, { anexo }) => {
    const tareas = p.tareas || [];
    // Una sola slide si cabe (apretando el aire entre filas); si no, se
    // reparten las tareas en varias páginas con el aire normal.
    const total = (pad) => tareas.reduce((n, t) => n + altoContenido(t) + pad, 0) - pad;
    const pad = PADS.find((x) => total(x) <= ALTO_FILAS) ?? FILA_PAD;
    const altoFila = (t) => altoContenido(t) + pad;
    const paginas = [];
    let actual = [];
    let alto = 0;
    for (const t of tareas) {
      const h = altoFila(t);
      if (actual.length && alto + h - pad > ALTO_FILAS) {
        paginas.push(actual);
        actual = [];
        alto = 0;
      }
      actual.push(t);
      alto += h;
    }
    paginas.push(actual);

    paginas.forEach((filas, pi) =>
      add(
        (s, page, total) => {
          s.background = { color: C.sand };
          marco(s, {
            kicker: anexo ? "Seguimiento RDR   Anexo" : `02 · Seguimiento de proyectos   ${p.interno}`,
            pie: anexo ? "Seguimiento RDR · Anexo" : `02 · Seguimiento de proyectos — ${p.interno}`,
            page, total,
          });
          cabecera(s, {
            sobre: [p.sdatool, p.traspaso].filter(Boolean).join(" · "),
            titulo: p.nombre + (paginas.length > 1 ? ` (${pi + 1}/${paginas.length})` : ""),
            sub: resumenProyecto(p),
          });
          const altoTabla = 0.46 + filas.reduce((n, t) => n + altoFila(t), 0) - pad + 0.14;
          tarjeta(s, MX, T_Y, CW, altoTabla);
          rect(s, MX, T_Y, CW, 0.36, C.gray2, 0.12);
          rect(s, MX, T_Y + 0.18, CW, 0.18, C.gray2);
          for (const [label, x, w] of COLS)
            txt(s, label, { x, y: T_Y, w, h: 0.36, size: 7.5, bold: true, valign: "middle" });
          let y = T_Y + 0.46;
          filas.forEach((t, i) => {
            const h = altoFila(t);
            const fase = FASE[t.fase];
            pildora(s, etiquetaFase(t), 0.79, y, fase ? fase.color : C.gray3);
            if (t.nombre) txt(s, t.nombre, { x: 0.79, y: y + 0.29, w: 2.19, h: Math.max(0.17, h - pad - 0.29), size: 9, bold: true });
            txt(s, fechaTarea(t.fecha), { x: 3.17, y, w: 0.93, h: 0.24, size: 9, bold: true, valign: "middle" });
            const coms = (t.comentarios || []).filter(Boolean);
            if (coms.length === 1) {
              txt(s, coms[0], { x: 4.3, y: y + 0.03, w: 4.12, h: h - pad - 0.03, size: 8.5 });
            } else if (coms.length > 1) {
              txt(s, coms.map((c, j) => ({
                text: c,
                options: { bullet: { indent: 10 }, ...(j < coms.length - 1 ? { breakLine: true } : {}) },
              })), { x: 4.3, y: y + 0.03, w: 4.12, h: h - pad - 0.03, size: 8.5, paraSpaceAfter: 1 });
            }
            txt(s, t.asignacion || "—", { x: 8.61, y, w: 1.03, h: 0.24, size: 9, valign: "middle" });
            const conPct = t.avance !== null && t.avance !== undefined && t.avance !== "";
            if (conPct) {
              const pct = Math.max(0, Math.min(100, Number(t.avance)));
              txt(s, `${pct} %`, { x: 9.84, y, w: 0.46, h: 0.24, size: 9, bold: true, valign: "middle" });
              rect(s, 10.32, y + 0.085, 0.84, 0.07, C.gray2, 0.035);
              if (pct > 0) rect(s, 10.32, y + 0.085, Math.max(0.07, 0.84 * pct / 100), 0.07, C.electric, 0.035);
            } else {
              txt(s, "—", { x: 9.84, y, w: 0.46, h: 0.24, size: 9, color: C.gray4, valign: "middle" });
            }
            const est = ESTADO[t.estado] || ESTADO.sin_iniciar;
            punto(s, 11.32, y + 0.06, 0.12, est.color);
            txt(s, est.label, { x: 11.5, y, w: 1.04, h: 0.24, size: 8.5, valign: "middle" });
            if (i < filas.length - 1) linea(s, 0.72, y + h - pad / 2, 11.9, 0, C.gray2);
            y += h;
          });
          const pendientes = tareas.filter((t) => !completa(t));
          s.addNotes(
            `${p.nombre} (${[p.sdatool, p.traspaso].filter(Boolean).join(" · ")}). ${resumenProyecto(p)}.` +
              (pendientes.length
                ? ` Pendiente: ${pendientes.map((t) => `${t.nombre || etiquetaFase(t).toLowerCase()} (${fechaTarea(t.fecha)}, ${t.avance ?? "—"} %, ${(ESTADO[t.estado] || ESTADO.sin_iniciar).label.toLowerCase()})`).join("; ")}.`
                : ""),
          );
        },
        { hidden: anexo },
      ),
    );
  };
  for (const g of gruposPorInterno(visibles)) for (const p of g.proyectos) slideProyecto(p, { anexo: false });

  // ── 03 · Incidencias y traspasos ──────────────────────────────────────────
  const incidencias = datos.incidencias || [];
  const traspasos = datos.traspasos || [];
  separador({
    bg: C.serene,
    kicker: "BLOQUE 03 · COORDINACIÓN",
    lineas: ["Incidencias", "y traspasos"],
    sub: "Incidencias abiertas, tareas pendientes y traspasos entre responsables pendientes de cerrar.",
    pie: "03 · Incidencias y traspasos",
    nota: "Bloque 3: incidencias, tareas abiertas y traspasos.",
  });

  const subIncidencias = () => {
    if (!incidencias.length) return "Sin incidencias ni tareas abiertas.";
    const inc = incidencias.filter((i) => i.tipo === "incidencia");
    const tar = incidencias.filter((i) => i.tipo !== "incidencia");
    const partes = [];
    if (inc.length)
      partes.push(`${cap(numTexto(inc.length))} ${inc.length === 1 ? "incidencia" : "incidencias"} en ${enumerar([...new Set(inc.map((i) => i.titulo))])}`);
    if (tar.length)
      partes.push(`${partes.length ? numTexto(tar.length) : cap(numTexto(tar.length))} ${tar.length === 1 ? "tarea abierta o pendiente" : "tareas abiertas o pendientes"}`);
    return partes.join(" y ") + ".";
  };
  const etiquetaInc = (i) => {
    if (i.tipo === "incidencia") return ["INCIDENCIA", C.mandarin];
    const e = ESTADO[i.estado] || ESTADO.en_plazo;
    return [`TAREA · ${e.label.toUpperCase()}`, e.color];
  };
  const POR_PAG_INC = 6;
  const pagsInc = [];
  for (let i = 0; i < Math.max(1, incidencias.length); i += POR_PAG_INC) pagsInc.push(incidencias.slice(i, i + POR_PAG_INC));
  pagsInc.forEach((items, pi) =>
    add((s, page, total) => {
      s.background = { color: C.sand };
      marco(s, { kicker: "03 · Incidencias y traspasos   Incidencias y tareas", pie: "03 · Incidencias y traspasos — Incidencias y tareas", page, total });
      cabecera(s, {
        conSobre: false,
        titulo: `Incidencias y tareas abiertas${pagsInc.length > 1 ? ` (${pi + 1}/${pagsInc.length})` : ""}`,
        sub: subIncidencias(),
      });
      if (!items.length) {
        tarjeta(s, MX, 1.97, CW, 1.2);
        img(s, assets.icons.tasks, 0.79, 2.36, 0.42, 0.42);
        txt(s, "Sin incidencias ni tareas abiertas a fecha de la reunión.", { x: 1.4, y: 2.36, w: 10, h: 0.42, size: 13.5, bold: true, head: true, valign: "middle" });
        return;
      }
      const compacto = items.length > 3;
      const h = compacto ? 2.18 : 3.61;
      items.forEach((it, i) => {
        const x = MX + (i % 3) * 4.17;
        const y = 1.97 + Math.floor(i / 3) * (h + 0.24);
        tarjeta(s, x, y, 3.89, h);
        const [label, color] = etiquetaInc(it);
        pildora(s, label, x + 0.24, y + 0.22, color, { size: 7, h: 0.26 });
        const icono = assets.icons[it.icono] || assets.icons[ICONO_TIPO[it.tipo]] || assets.icons.warning;
        const det = (it.detalle || []).filter(Boolean);
        if (compacto) {
          img(s, icono, x + 3.89 - 0.6, y + 0.18, 0.36, 0.36);
          txt(s, it.titulo || "", { x: x + 0.24, y: y + 0.62, w: 3.41, h: 0.3, size: 13.5, bold: true, head: true, valign: "middle" });
        } else {
          img(s, icono, x + 0.24, y + 0.61, 0.42, 0.42);
          txt(s, it.titulo || "", { x: x + 0.24, y: y + 1.13, w: 3.41, h: 0.3, size: 13.5, bold: true, head: true, valign: "middle" });
        }
        const yd = y + (compacto ? 1.0 : 1.5);
        const hd = y + h - 0.15 - yd;
        if (det.length === 1) txt(s, det[0], { x: x + 0.24, y: yd, w: 3.41, h: hd, size: 9.5 });
        else if (det.length > 1)
          txt(s, det.map((d, j) => ({ text: d, options: { bullet: { indent: 10 }, ...(j < det.length - 1 ? { breakLine: true } : {}) } })), {
            x: x + 0.24, y: yd, w: 3.41, h: hd, size: 9.5, paraSpaceAfter: 4,
          });
      });
      s.addNotes(items.map((i) => `${etiquetaInc(i)[0].toLowerCase()}: ${i.titulo}${(i.detalle || []).length ? ` — ${i.detalle.join("; ")}` : ""}`).join(". ") + ".");
    }),
  );

  // Traspasos.
  const TR_COLS = [["CÓDIGO", 0.79, 1.04], ["PROYECTO", 2.14, 3.12], ["RESPONSABLE INTERNO", 5.56, 1.95], ["RESPONSABLE NFQ", 7.82, 1.95], ["PENDIENTE", 10.07, 2.47]];
  const POR_PAG_TR = 7;
  const TR_PITCH = 0.56;
  const subTraspasos = () => {
    if (!traspasos.length) return "No hay traspasos pendientes de cerrar.";
    const n = traspasos.length;
    const porTipo = TIPOS_TRASPASO.map((t) => [t, traspasos.filter((x) => (x.tipo || "otro") === t.id).length]).filter(([, c]) => c);
    const cuantos = (c) => (c === 1 ? "uno" : numTexto(c, false));
    const frases = porTipo.map(([t, c]) =>
      t.id === "ok_usuario" ? `${cuantos(c)} ${c === 1 ? "espera" : "esperan"} el OK de usuario`
        : t.id === "implantacion" ? `${cuantos(c)} la implantación`
          : `${cuantos(c)} con otros pendientes`,
    );
    return `${cap(numTexto(n, false))} ${n === 1 ? "proyecto traspasado" : "proyectos traspasados"}; ${enumerar(frases)}.`;
  };
  const pagsTr = [];
  for (let i = 0; i < Math.max(1, traspasos.length); i += POR_PAG_TR) pagsTr.push(traspasos.slice(i, i + POR_PAG_TR));
  pagsTr.forEach((items, pi) =>
    add((s, page, total) => {
      s.background = { color: C.sand };
      marco(s, { kicker: "03 · Incidencias y traspasos   Traspasos", pie: "03 · Incidencias y traspasos — Traspasos", page, total });
      cabecera(s, {
        conSobre: false,
        titulo: `Traspasos pendientes de cerrar${pagsTr.length > 1 ? ` (${pi + 1}/${pagsTr.length})` : ""}`,
        sub: subTraspasos(),
      });
      const filas = Math.max(1, items.length);
      tarjeta(s, MX, 1.97, CW, 0.4 + 0.1 + filas * TR_PITCH);
      rect(s, MX, 1.97, CW, 0.4, C.gray2, 0.12);
      rect(s, MX, 2.17, CW, 0.2, C.gray2);
      for (const [label, x, w] of TR_COLS) txt(s, label, { x, y: 1.97, w, h: 0.4, size: 8.5, bold: true, valign: "middle" });
      if (!items.length) {
        txt(s, "Sin traspasos pendientes.", { x: 0.79, y: 2.53, w: 6, h: 0.31, size: 9.5, color: C.gray5 });
      }
      items.forEach((tr, i) => {
        const y = 2.53 + i * TR_PITCH;
        const tipo = TIPO_TRASPASO[tr.tipo] || TIPO_TRASPASO.otro;
        pildora(s, tr.codigo || "—", 0.79, y, tipo.color, { size: 7.5, h: 0.27, w: 0.76 });
        txt(s, tr.proyecto || "", { x: 2.14, y: y + 0.05, w: 3.12, h: 0.4, size: 9.5, bold: true });
        txt(s, tr.interno || "", { x: 5.56, y: y + 0.05, w: 1.95, h: 0.4, size: 9.5 });
        txt(s, tr.nfq || "", { x: 7.82, y: y + 0.05, w: 1.95, h: 0.4, size: 9.5 });
        txt(s, tr.pendiente || "", { x: 10.07, y: y + 0.05, w: 2.47, h: 0.4, size: 9.5 });
        if (i < items.length - 1) linea(s, 0.72, y + TR_PITCH - 0.1, 11.9, 0, C.gray2);
      });
      const usados = TIPOS_TRASPASO.filter((t) => traspasos.some((x) => (x.tipo || "otro") === t.id));
      if (usados.length)
        txt(s, `Color del código: ${usados.map((t) => `${t.nombre}, ${t.label}`).join("; ")}.`, {
          x: MX, y: 1.97 + 0.5 + filas * TR_PITCH + 0.2, w: 12.2, h: 0.3, size: 9.5, color: C.gray5, valign: "middle",
        });
      s.addNotes(items.length
        ? `Traspasos: ${items.map((t) => `${t.proyecto} ${t.codigo} (${t.interno} → ${t.nfq}, ${String(t.pendiente || "").toLowerCase()})`).join("; ")}.`
        : "Sin traspasos pendientes.");
    }),
  );

  // ── Cifras clave ──────────────────────────────────────────────────────────
  add((s, page, total) => {
    s.background = { color: C.electric };
    marco(s, { oscuro: true, kicker: "Seguimiento RDR   Cifras clave", pie: "Resumen · Cifras clave", page, total });
    txt(s, "Cifras clave", { x: MX, y: 1.08, w: 12.2, h: 0.49, size: 26, bold: true, head: true, color: C.sand, valign: "middle" });
    const lista = (xs, max = 3) => (xs.length > max ? `${xs.slice(0, max).join(", ")}…` : enumerar(xs));
    const datosCifras = [
      [k.proyectos, `${k.proyectos === 1 ? "proyecto" : "proyectos"} en seguimiento con ${numTexto(k.internos, false)} ${k.internos === 1 ? "responsable interno" : "responsables internos"}`],
      [k.tareas, "tareas con fecha límite y avance"],
      [k.hechas, "tareas completadas al 100 %"],
      [k.riesgo, k.riesgo ? `${k.riesgo === 1 ? "tarea" : "tareas"} en riesgo: ${lista(k.riesgoProyectos)}` : "tareas en riesgo"],
      [k.implantaciones, k.implantaciones ? `${k.implantaciones === 1 ? "implantación" : "implantaciones"} en los próximos 30 días: ${lista(k.implantacionesProyectos)}` : "implantaciones en los próximos 30 días"],
      [k.incidencias, `${k.incidencias === 1 ? "incidencia abierta" : "incidencias abiertas"}`],
      [k.tareasAbiertas, `${k.tareasAbiertas === 1 ? "tarea abierta o pendiente" : "tareas abiertas o pendientes"} de coordinación`],
      [k.traspasos, `${k.traspasos === 1 ? "traspaso pendiente" : "traspasos pendientes"} de OK de usuario o de implantación`],
      [`${k.avanceMedio} %`, "avance medio de las tareas en seguimiento"],
      [k.vencidas, k.vencidas ? `${k.vencidas === 1 ? "tarea" : "tareas"} con la fecha límite superada sin cerrar: ${lista(k.vencidasProyectos)}` : "tareas con la fecha límite superada sin cerrar"],
    ];
    datosCifras.forEach(([n, d], i) => {
      const bw = (CW - 4 * 0.24) / 5;
      const x = MX + (i % 5) * (bw + 0.24);
      const y = 1.97 + Math.floor(i / 5) * 2.3;
      rect(s, x, y, bw, 2.0, C.electric, 0.1, { line: { color: C.serene, width: 0.75, transparency: 40 } });
      txt(s, String(n), { x: x + 0.2, y: y + 0.24, w: 1.9, h: 0.42, size: 20, bold: true, head: true, color: C.serene, valign: "middle" });
      txt(s, d, { x: x + 0.2, y: y + 0.8, w: bw - 0.4, h: 1.1, size: 9, color: C.sand });
    });
    s.addNotes(`Resumen: ${k.proyectos} proyectos, ${k.tareas} tareas, ${k.hechas} al 100 %, ${k.riesgo} en riesgo; ${k.incidencias} incidencias; ${k.traspasos} traspasos.`);
  });

  // ── Gracias ───────────────────────────────────────────────────────────────
  add((s) => {
    s.background = { color: C.electric };
    img(s, assets.bbvaWhite, (W - 2.4) / 2, 2.72, 2.4, 0.72);
    txt(s, "GRACIAS", { x: 0, y: 3.95, w: W, h: 0.3, size: 11.5, bold: true, color: C.sand, align: "center", valign: "middle" });
    txt(s, `${titulo} · ${fechaLarga(fecha)}`, { x: 0, y: 4.27, w: W, h: 0.3, size: 9.5, color: C.mute, align: "center", valign: "middle" });
    txt(s, "HECHO POR", { x: 5.05, y: 6.22, w: 1.5, h: 0.33, size: 8, bold: true, color: C.mute, align: "right", valign: "middle" });
    img(s, assets.nfqWhite, 6.68, 6.22, 0.7, 0.33);
    s.addNotes("Cierre.");
  });

  // ── Anexo (diapositivas ocultas) ──────────────────────────────────────────
  for (const p of anexos) slideProyecto(p, { anexo: true });

  // ── Pintado ───────────────────────────────────────────────────────────────
  const total = plan.length;
  plan.forEach((item, i) => {
    const slide = pres.addSlide();
    if (item.hidden) slide.hidden = true;
    item.fn(slide, i + 1, total);
  });
  return pres;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
