/* ╔══════════════════════════════════════════════════════════════════╗
   ║  Avisos_Pases.gs · Alertas programadas de Pases Calendados · RDR Hub    ║
   ║  · Envío desde noreply@<dominio> (noReply, sin alias).            ║
   ║  · Calendario actualizado (sistema nuevo).                        ║
   ║  · Correos profesionales, con estado general + tablas resumen.    ║
   ╚══════════════════════════════════════════════════════════════════╝ */

const AVISOS_CONFIG = {
  HOJA_REGISTRO: "Avisos_Enviados",
  VENTANA_TOLERANCIA_MIN: 35,
  TRIGGER_NOMBRE: "revisarAvisosProgramados",
  REMITE: "Pases RDR",
};

/* ───────── Trigger ───────── */
function instalarTriggerAvisos() {
  desinstalarTriggerAvisos();
  ScriptApp.newTrigger(AVISOS_CONFIG.TRIGGER_NOMBRE).timeBased().everyHours(1).create();
  Logger.log("Trigger horario de avisos instalado.");
  return "OK";
}
function desinstalarTriggerAvisos() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === AVISOS_CONFIG.TRIGGER_NOMBRE) { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log(n + " trigger(s) de avisos eliminado(s).");
  return n;
}

/* ───────── Entry point del trigger horario ───────── */
function revisarAvisosProgramados() {
  const ahora = new Date();
  const pases = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONSTANTES.HOJA_PASES).getDataRange().getValues();
  const enviados = cargarAvisosEnviados();

  const VENTANA_PRE_DIAS = 16, VENTANA_POST_DIAS = 7, MS_DIA = 86400000;
  const ahoraMs = ahora.getTime();

  const activos = [];
  for (let i = 1; i < pases.length; i++) {
    const r = pases[i];
    if (!r[0]) continue;
    const fechaPase = (r[0] instanceof Date) ? r[0] : new Date(r[0]);
    if (isNaN(fechaPase.getTime())) continue;
    const fase = String(r[2] || "").trim().toUpperCase();
    if (fase === "COMPLETADO") continue;
    const diffDias = (ahoraMs - fechaPase.getTime()) / MS_DIA;
    if (diffDias < -VENTANA_PRE_DIAS || diffDias > VENTANA_POST_DIAS) continue;
    activos.push({ fila: i + 1, fechaPase, subida: String(r[1] || "").trim().toUpperCase(), faseActual: fase });
  }
  if (!activos.length) return 0;

  let total = 0;
  activos.forEach(pase => {
    const fechaPaseStr = formatearFechaSegura(pase.fechaPase);
    const avisos = construirCalendarioAvisos(pase.fechaPase, pase.subida, pase.faseActual);
    avisos.forEach(av => {
      const clave = fechaPaseStr + "::" + av.codigo;
      if (enviados[clave]) return;
      if (!estaEnVentana(ahora, av.cuando)) return;
      try {
        if (ejecutarAviso(av, pase.fila, fechaPaseStr, pase.fechaPase)) {
          registrarEnviado(fechaPaseStr, av.codigo);
          enviados[clave] = true;
          total++;
        }
      } catch (e) { Logger.log("Error aviso " + av.codigo + ": " + e.message); }
    });
  });
  return total;
}

/* ───────── Calendario de avisos (sistema NUEVO) ─────────
   Pase = sábado (implantación). Días antes contados desde el sábado:
     12 (Lun, 2 semanas antes) ........ correo de inicio
     10 (Mié, semana anterior) ........ último día OKs + pruebas Workstation
      8 (Vie, semana anterior) ........ creación de paquetes · tech-kytl · historias · CRQ
      5 (Lun, semana del pase) ........ cierre del pase (CRQ + componentes + orden + inst. técnica)
      2 (Jue, semana del pase) ........ checks de pre-implantación
      1 (Vie, semana del pase) ........ comprobar la pre-instalación
      0 (Sáb) .......................... IMPLANTACIÓN
     +2 (Lun siguiente) ............... mergeos
   ────────────────────────────────────────────────────── */
function construirCalendarioAvisos(fechaPase, subida, faseActual) {
  if (faseActual === "COMPLETADO") return [];
  const lista = [];
  const haySubida = subida !== "NO" && faseActual !== "FASE_0_DESCANSO";

  const esFase1 = (faseActual === "FASE_1_ENCUESTA" || faseActual === "PENDIENTE");
  const enPreparacion = (esFase1 || faseActual === "FASE_2_3_PREPARACION");
  const enPreImplantacion = (enPreparacion || faseActual === "FASE_4_CERRADO");
  const enPostImplantacion = (faseActual === "FASE_7_POST");
  // Lunes después del pase SIN haber pasado a post-implantación todavía.
  const implantacionSinCerrar = (faseActual === "FASE_4_CERRADO" || faseActual === "FASE_6_IMPLANTACION");

  function avisoEn(diasAntes, hora, codigo, tono, generador) {
    const base = new Date(fechaPase.getTime());
    base.setDate(base.getDate() - diasAntes);
    const aj = ajustarASiguienteLaboral(base);
    aj.setHours(hora, 0, 0, 0);
    lista.push({ codigo, tono, cuando: aj, generador });
  }
  function avisoPost(diasDespues, hora, codigo, tono, generador) {
    const base = new Date(fechaPase.getTime());
    base.setDate(base.getDate() + diasDespues);
    const aj = ajustarASiguienteLaboral(base);
    aj.setHours(hora, 0, 0, 0);
    lista.push({ codigo, tono, cuando: aj, generador });
  }

  if (haySubida) {
    if (enPreparacion) {
      // Lunes (2 semanas antes) · inicio
      avisoEn(12, 9, "INICIO", "informativo", contenidoInicio);
      // Miércoles (semana anterior) · último día OKs + Workstation
      avisoEn(10, 9, "OKS_09",  "warning", contenidoOksWorkstation);
      avisoEn(10, 16, "OKS_16", "alerta",  contenidoOksWorkstation);
      // Viernes (semana anterior) · creación de paquetes / tech-kytl / historias / CRQ
      avisoEn(8, 9,  "PAQ_09",  "warning", contenidoPaquetes);
      avisoEn(8, 12, "PAQ_12",  "warning", contenidoTechKytl);
      avisoEn(8, 16, "PAQ_16",  "warning", contenidoHistoriasYCRQ);
      avisoEn(8, 18, "PAQ_18",  "alerta",  contenidoResumenViernes);
      // Lunes (semana del pase) · cierre del pase
      avisoEn(5, 9,  "CIERRE_09", "alerta",     contenidoCierre);
      avisoEn(5, 12, "CIERRE_12", "alerta",     contenidoCierre);
      avisoEn(5, 16, "CIERRE_16", "alerta",     contenidoInstTecnica);
      avisoEn(5, 18, "CIERRE_18", "alerta_max", contenidoCierreFinal);
    }
    if (enPreImplantacion) {
      avisoEn(2, 9,  "PRE_JUE",    "recordatorio", contenidoPreJueves);
      avisoEn(1, 9,  "PRE_VIE_09", "warning",      contenidoPreViernes);
      avisoEn(1, 14, "PRE_VIE_14", "alerta",       contenidoPreViernesAlerta);
      avisoEn(1, 15, "PRE_VIE_15", "alerta_max",   contenidoPreViernesFinal);
    }
    if (implantacionSinCerrar) {
      // Lunes tras el pase: aún no se ha finalizado la implantación en la web
      // ni comenzado la post-implantación → alerta para cerrarla.
      avisoPost(2, 9,  "CIERRE_IMPL_09", "alerta",     contenidoCerrarImplantacion);
      avisoPost(2, 16, "CIERRE_IMPL_16", "alerta_max", contenidoCerrarImplantacion);
    }
    if (enPostImplantacion) {
      avisoPost(2, 9,  "POST_09", "informativo",  contenidoPostMergeos);
      avisoPost(2, 12, "POST_12", "recordatorio", contenidoPostMergeosRec);
      avisoPost(2, 16, "POST_16", "warning",      contenidoPostMergeosRec);
      avisoPost(2, 18, "POST_18", "alerta_max",   contenidoPostMergeosFinal);
    }
  } else if (enPreparacion) {
    avisoEn(1, 10, "DESCANSO_VIE", "informativo", contenidoDescanso);
  }
  return lista;
}

function estaEnVentana(ahora, cuando) {
  return Math.abs((ahora.getTime() - cuando.getTime()) / 60000) <= AVISOS_CONFIG.VENTANA_TOLERANCIA_MIN;
}
function ajustarASiguienteLaboral(d) {
  const x = new Date(d.getTime());
  for (let i = 0; i < 10; i++) {
    const dia = x.getDay();
    if (dia !== 0 && dia !== 6) return x;
    x.setDate(x.getDate() + 1);
  }
  return x;
}

/* ───────── Registro idempotente ───────── */
function cargarAvisosEnviados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(AVISOS_CONFIG.HOJA_REGISTRO);
  if (!sheet) {
    sheet = ss.insertSheet(AVISOS_CONFIG.HOJA_REGISTRO);
    sheet.getRange(1, 1, 1, 3).setValues([["Fecha Pase", "Código Aviso", "Timestamp Envío"]]);
    sheet.hideSheet();
  }
  const data = sheet.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const fecha = data[i][0] instanceof Date ? formatearFechaSegura(data[i][0]) : String(data[i][0] || "");
    const codigo = String(data[i][1] || "");
    if (fecha && codigo) map[fecha + "::" + codigo] = true;
  }
  return map;
}
function registrarEnviado(fechaPaseStr, codigo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AVISOS_CONFIG.HOJA_REGISTRO);
  if (!sheet) return;
  const partes = fechaPaseStr.split("/");
  sheet.appendRow([new Date(partes[2], partes[1] - 1, partes[0]), codigo, new Date()]);
}

/* ───────── Ejecución / envío ───────── */
function ejecutarAviso(av, filaPase, fechaPaseStr, fechaPase) {
  const estado = recopilarEstadoPase(fechaPaseStr, filaPase);
  const contenido = av.generador(estado, fechaPase, fechaPaseStr);
  if (contenido.omitir) return true; // se marca enviado sin ruido

  const tono = contenido.tonoNuevo || av.tono;
  const fechaTxt = Utilities.formatDate(fechaPase, "Europe/Madrid", "EEEE dd/MM/yyyy");
  const html = wrap(contenido.asunto, tono, contenido.html, "Pase del " + fechaTxt);
  enviarAvisoMail_(html, fechaPaseStr);
  return true;
}

/* Envío de cada aviso (desde noreply, sin alias ni admin).
   HILO único por pase SIN reply/replyAll: todos los avisos de un pase se envían
   con sendEmail directo, con el MISMO asunto y mismos participantes (From noreply,
   To dest). Gmail los agrupa solos en una conversación por asunto + participantes,
   y el direccionamiento queda limpio (To = dest, sin Cc raros). El título concreto
   de cada aviso va en el cuerpo (lo pone wrap()). */
function enviarAvisoMail_(html, fechaPaseStr) {
  // getModoDebug() (Codigo_Pases.gs): conmutable desde la web por los admins.
  const dest = getModoDebug() ? CONSTANTES.BUZON_PRUEBAS_DEBUG : CONSTANTES.BUZON_DESARROLLOS;
  GmailApp.sendEmail(dest, asuntoHiloPase_(fechaPaseStr), quitarTagsHtml(html), {
    htmlBody: html, name: AVISOS_CONFIG.REMITE, noReply: true
  });
}

// Asunto FIJO por pase (idéntico en todos los avisos → Gmail los pone en el mismo hilo).
function asuntoHiloPase_(fechaPaseStr) {
  let s = "[RDR Hub] Pase Calendado - " + (fechaPaseStr || "");
  if (getModoDebug()) s = "[TEST] " + s;
  return s;
}

function recopilarEstadoPase(fechaPaseStr, filaPase) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pases = ss.getSheetByName(CONSTANTES.HOJA_PASES).getDataRange().getValues();
  const paseRow = pases[filaPase - 1] || [];

  const allProys = ss.getSheetByName(CONSTANTES.HOJA_PROYECTOS).getDataRange().getValues();
  const proyectos = [], nombresProy = [];
  for (let i = 1; i < allProys.length; i++) {
    if (formatearFechaSegura(allProys[i][0]) === fechaPaseStr) {
      proyectos.push({ nombre: allProys[i][1], feature: allProys[i][2], cliente: allProys[i][3], ok: !!allProys[i][4], correoAns: !!allProys[i][6] });
      nombresProy.push(allProys[i][1]);
    }
  }
  const allComps = ss.getSheetByName(CONSTANTES.HOJA_COMPONENTES).getDataRange().getValues();
  const componentes = [];
  for (let i = 1; i < allComps.length; i++) {
    const c = allComps[i];
    if (!c[0] || nombresProy.indexOf(c[0]) === -1) continue;
    componentes.push({ proyecto: c[0], nombre: c[1], tipo: c[2], subida: c[3], resp: c[4], codigo: c[5], us: c[6], techKytl: !!c[7], mergeado: !!c[8] });
  }
  return {
    fechaPase: fechaPaseStr, fase: String(paseRow[2] || "").trim(), crq: paseRow[3] || "",
    checks: { dpPro: paseRow[6], jiraOk: paseRow[7], remOk: paseRow[8], docPruebas: paseRow[9], traspaso: paseRow[10] },
    instTecnica: !!paseRow[12], proyectos, componentes
  };
}

/* ───────── Maquetación (estética tipo "Comidas") ───────── */
const BBVA_COLORS = {
  electric: "#001391", serene: "#85C8FF", sand: "#F7F8F8", grayLite: "#E2E6EA",
  gray: "#46536D", lime: "#1B8C13", canary: "#C79A00", mandarin: "#C05621", red: "#C62828",
};

function wrap(titulo, tono, bloques, subtitulo) {
  const acc = { informativo: BBVA_COLORS.serene, recordatorio: "#E2B400", warning: "#E08A2B", alerta: "#E08A2B", alerta_max: BBVA_COLORS.red }[tono] || BBVA_COLORS.serene;
  const etiqueta = { informativo: "Información", recordatorio: "Recordatorio", warning: "Atención", alerta: "Alerta", alerta_max: "Urgente" }[tono] || "Aviso";
  return '' +
  '<div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#1a1a1a;">' +
    '<div style="background:' + BBVA_COLORS.electric + ';color:#fff;border-radius:14px 14px 0 0;padding:20px 26px;">' +
      '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:' + BBVA_COLORS.serene + ';">Pases Calendados · BBVA × NFQ</div>' +
      '<div style="font-size:21px;font-weight:bold;margin-top:5px;line-height:1.25;">' + titulo + '</div>' +
      (subtitulo ? '<div style="font-size:13px;color:#cdd9f5;margin-top:4px;text-transform:capitalize;">' + subtitulo + '</div>' : '') +
    '</div>' +
    '<div style="border:1px solid ' + BBVA_COLORS.grayLite + ';border-top:0;border-radius:0 0 14px 14px;padding:22px 26px;background:#fff;">' +
      '<span style="display:inline-block;font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:.06em;color:' + BBVA_COLORS.electric + ';background:' + acc + '22;border:1px solid ' + acc + ';padding:3px 11px;border-radius:999px;margin-bottom:14px;">' + etiqueta + '</span>' +
      bloques +
    '</div>' +
    '<p style="text-align:center;font-size:11px;color:#a0a0a0;margin:14px 0;">Aviso automático · Gestión de Pases RDR</p>' +
  '</div>';
}

function p(html) { return '<p style="margin:8px 0;font-size:15px;line-height:1.55;">' + html + '</p>'; }
function strong(s) { return '<strong style="color:' + BBVA_COLORS.electric + ';">' + s + '</strong>'; }
function sec(t) { return '<p style="margin:18px 0 6px;font-weight:bold;font-size:13px;color:' + BBVA_COLORS.electric + ';text-transform:uppercase;letter-spacing:.5px;">' + t + '</p>'; }
function ok_(b) { return b ? '<span style="color:' + BBVA_COLORS.lime + ';font-weight:bold;">✓</span>' : '<span style="color:' + BBVA_COLORS.red + ';font-weight:bold;">✗</span>'; }
function box(html, color) {
  color = color || "#E08A2B";
  return '<div style="background:' + color + '14;border-left:4px solid ' + color + ';padding:12px 16px;border-radius:0 6px 6px 0;margin:14px 0;font-size:14px;">' + html + '</div>';
}
function tabla(headers, rows) {
  if (!rows.length) return "";
  let h = '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:4px 0 6px;border:1px solid ' + BBVA_COLORS.grayLite + ';border-radius:6px;overflow:hidden;"><thead><tr>';
  h += headers.map(x => '<th style="text-align:left;padding:8px 11px;background:' + BBVA_COLORS.electric + ';color:#fff;font-weight:bold;">' + x + '</th>').join('');
  h += '</tr></thead><tbody>';
  rows.forEach((r, i) => {
    h += '<tr style="background:' + (i % 2 ? '#f7f8fa' : '#fff') + ';">' +
      r.map(c => '<td style="padding:7px 11px;border-bottom:1px solid ' + BBVA_COLORS.grayLite + ';color:' + BBVA_COLORS.gray + ';">' + c + '</td>').join('') + '</tr>';
  });
  return h + '</tbody></table>';
}
function lista(titulo, items, color) {
  if (!items || !items.length) return "";
  let h = tablaTitulo_(titulo, color);
  h += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:4px 0 6px;border:1px solid ' + BBVA_COLORS.grayLite + ';border-radius:6px;overflow:hidden;"><tbody>';
  items.forEach((it, i) => {
    h += '<tr style="background:' + (i % 2 ? '#f7f8fa' : '#fff') + ';"><td style="padding:7px 11px;border-bottom:1px solid ' + BBVA_COLORS.grayLite + ';color:' + BBVA_COLORS.gray + ';">' + it + '</td></tr>';
  });
  return h + '</tbody></table>';
}
function tablaTitulo_(t, color) { return '<p style="margin:14px 0 4px;font-weight:bold;font-size:13px;color:' + (color || BBVA_COLORS.mandarin) + ';">' + t + '</p>'; }

/* Detección de "check marcado" tolerante (true / "OK" / "VERDADERO" / "TRUE"). */
function isT_(v) { const x = String(v).toUpperCase(); return v === true || x === "TRUE" || x === "OK" || x === "VERDADERO" || x === "SÍ" || x === "SI"; }
/* Check de pre-implantación marcado como "No aplica" → no cuenta como pendiente. */
function esNA_(v) { const x = String(v).toUpperCase().trim(); return x === "NA" || x === "NO APLICA"; }
function sinCodigo_(c) { return !c.codigo || !String(c.codigo).trim() || String(c.codigo).trim() === "-"; }

/* Listas de pendientes reutilizables */
function pendientes_(s) {
  return {
    proysSinOk: s.proyectos.filter(p => !p.ok),
    sinCodigo: s.componentes.filter(sinCodigo_),
    sinHistoria: s.componentes.filter(c => !c.us || !String(c.us).trim()),
    sinTechKytl: s.componentes.filter(c => !c.techKytl),
    // Solo cuentan los componentes DP que forman parte de una unidad de mergeo
    // (Workstation, ObjetosGS, javas, estáticos, dependientes). DataX, API,
    // aperiódicos, directorios y cadenas NO se mergean (regla de la web).
    sinMergear: s.componentes.filter(c => {
      if (String(c.codigo || "").toUpperCase().indexOf("DP-KYTL") === -1 || c.mergeado) return false;
      const sub = String(c.subida || "").toLowerCase();
      const tipo = String(c.tipo || "").toLowerCase();
      if (tipo === "cadena" || tipo.indexOf("director") === 0) return false;
      if (sub === "nova" || sub === "datax" || sub.indexOf("aperiodic") === 0 || sub.indexOf("aperiódic") === 0) return false;
      return true;
    }),
    wsSinPaquete: s.componentes.filter(c => String(c.subida || "").toLowerCase().indexOf("workstation") !== -1 && sinCodigo_(c)),
    crqLleno: s.crq && String(s.crq).trim() !== "" && String(s.crq).trim() !== "CRQ…",
    checksFalta: (function () {
      // Los checks marcados como "No aplica" (NA) quedan FUERA del aviso.
      const f = [];
      if (!esNA_(s.checks.dpPro) && !isT_(s.checks.dpPro)) f.push("DPs pendientes de PRO");
      if (!esNA_(s.checks.jiraOk) && !isT_(s.checks.jiraOk)) f.push("JIRAs resueltos");
      if (!esNA_(s.checks.remOk) && !isT_(s.checks.remOk)) f.push("REMEDYs listos");
      if (!esNA_(s.checks.docPruebas) && !isT_(s.checks.docPruebas)) f.push("Documento de pruebas post-implantación");
      if (!esNA_(s.checks.traspaso) && !isT_(s.checks.traspaso)) f.push("Correo de traspaso al ANS");
      return f;
    })()
  };
}

/* Bloque "estado general" que se incluye en TODOS los correos */
function resumenGeneral(s) {
  const pe = pendientes_(s);
  const nOk = s.proyectos.filter(p => p.ok).length;
  let html = sec("Estado general del pase");
  html += p('Hay ' + strong(s.proyectos.length) + ' proyectos y ' + strong(s.componentes.length) + ' componentes. OK de negocio: ' + strong(nOk + ' / ' + s.proyectos.length) + '. CRQ: ' + (pe.crqLleno ? strong(s.crq) : '<span style="color:' + BBVA_COLORS.red + ';">sin informar</span>') + ' · Instalación técnica: ' + ok_(s.instTecnica) + '.');

  if (s.proyectos.length) {
    html += sec("Resumen de proyectos");
    html += tabla(['Proyecto', 'Feature', 'Cliente', 'OK'],
      s.proyectos.map(pr => [pr.nombre, pr.feature || '—', pr.cliente || '—', ok_(pr.ok)]));
  }

  // Componentes con algo pendiente (código / historia / tech-kytl)
  const compsPend = s.componentes.filter(c => sinCodigo_(c) || !c.us || !String(c.us).trim() || !c.techKytl);
  if (compsPend.length) {
    html += sec("Componentes con tareas pendientes");
    html += tabla(['Proyecto', 'Componente', 'Código', 'Historia', 'tech-kytl'],
      compsPend.map(c => [c.proyecto, c.nombre, sinCodigo_(c) ? ok_(false) : (c.codigo || '—'),
        (c.us && String(c.us).trim()) ? ok_(true) : ok_(false), ok_(c.techKytl)]));
  }

  // Qué va faltando (resumen rápido)
  const faltan = [];
  if (pe.proysSinOk.length) faltan.push(pe.proysSinOk.length + ' proyecto(s) sin OK de negocio');
  if (pe.sinCodigo.length) faltan.push(pe.sinCodigo.length + ' componente(s) sin código (JIRA/REMEDY/DP)');
  if (pe.sinHistoria.length) faltan.push(pe.sinHistoria.length + ' componente(s) sin historia de usuario');
  if (pe.sinTechKytl.length) faltan.push(pe.sinTechKytl.length + ' componente(s) sin tech-kytl informado');
  if (!pe.crqLleno) faltan.push('CRQ general sin informar');
  if (!s.instTecnica) faltan.push('Instalación técnica sin marcar');
  if (pe.checksFalta.length) faltan.push(pe.checksFalta.length + ' check(s) de pre-implantación');

  if (faltan.length) html += box('<strong>Lo que va faltando:</strong>' + '<ul style="margin:6px 0 0;padding-left:18px;">' + faltan.map(x => '<li>' + x + '</li>').join('') + '</ul>', "#E08A2B");
  else html += box('Todo al día: no hay elementos pendientes en este momento. Buen trabajo.', BBVA_COLORS.lime);
  return html;
}

/* ───────── Generadores de contenido por hito ───────── */
function contenidoInicio(s, fechaPase) {
  const fechaTxt = Utilities.formatDate(fechaPase, "Europe/Madrid", "EEEE dd/MM/yyyy");
  let html = p('Buenos días, equipo.') +
    p('En <strong>dos semanas</strong> tenemos el pase calendado del ' + strong(fechaTxt) + '. Arranca la preparación.') +
    p('Esta es la semana para conseguir los <strong>OK de negocio</strong> de cada proyecto. A continuación, el estado de partida.');
  return { asunto: "Arranca la preparación del pase", html: html + resumenGeneral(s), tonoNuevo: "informativo" };
}

function contenidoOksWorkstation(s) {
  const pe = pendientes_(s);
  let html = p('<strong>Hoy es el último día</strong> para conseguir los OK de negocio y para subir el paquete de <strong>Workstation</strong>. Esta tarde se ejecutan las pruebas de SQA.');
  if (pe.proysSinOk.length) { html += tablaTitulo_("Proyectos sin OK (urgente)", BBVA_COLORS.red); html += tabla(['Proyecto', 'Cliente'], pe.proysSinOk.map(p => [p.nombre, p.cliente || '—'])); }
  if (pe.wsSinPaquete.length) { html += tablaTitulo_("Workstations sin paquete (código)", BBVA_COLORS.red); html += tabla(['Proyecto', 'Componente'], pe.wsSinPaquete.map(c => [c.proyecto, c.nombre])); }
  return { asunto: "Último día para OKs y Workstation", html: html + resumenGeneral(s) };
}

function contenidoPaquetes(s) {
  const pe = pendientes_(s);
  let html = p('Hoy es el día de <strong>creación de los paquetes</strong> del pase.');
  if (pe.proysSinOk.length) { html += tablaTitulo_("Proyectos bloqueados sin OK", BBVA_COLORS.red); html += tabla(['Proyecto'], pe.proysSinOk.map(p => [p.nombre])); }
  if (pe.sinCodigo.length) { html += tablaTitulo_("Componentes pendientes de crear (sin código)", BBVA_COLORS.red); html += tabla(['Proyecto', 'Componente'], pe.sinCodigo.map(c => [c.proyecto, c.nombre])); }
  return { asunto: "Creación de paquetes", html: html + resumenGeneral(s) };
}

function contenidoTechKytl(s) {
  const pe = pendientes_(s);
  let html = p('<strong>tech-kytl e historias de usuario.</strong> Todas las historias de usuario deben tener el <strong>tech-kytl</strong> informado.');
  if (pe.sinHistoria.length) { html += tablaTitulo_("Componentes sin historia de usuario", BBVA_COLORS.mandarin); html += tabla(['Proyecto', 'Componente'], pe.sinHistoria.map(c => [c.proyecto, c.nombre])); }
  if (pe.sinTechKytl.length) { html += tablaTitulo_("Componentes sin tech-kytl informado", BBVA_COLORS.mandarin); html += tabla(['Proyecto', 'Componente'], pe.sinTechKytl.map(c => [c.proyecto, c.nombre])); }
  return { asunto: "tech-kytl e historias de usuario", html: html + resumenGeneral(s) };
}

function contenidoHistoriasYCRQ(s) {
  const pe = pendientes_(s);
  let html = p('<strong>Estado de historias de usuario y CRQ.</strong>');
  if (!pe.crqLleno) html += box('No hay <strong>CRQ</strong> en cabecera. Hay que informarlo en cuanto el cliente pase los tickets a <em>Ready To Deploy</em>.', BBVA_COLORS.red);
  if (pe.sinHistoria.length) { html += tablaTitulo_("Componentes sin historia de usuario", BBVA_COLORS.mandarin); html += tabla(['Proyecto', 'Componente'], pe.sinHistoria.map(c => [c.proyecto, c.nombre])); }
  return { asunto: "Historias de usuario y CRQ", html: html + resumenGeneral(s) };
}

function contenidoResumenViernes(s) {
  const pe = pendientes_(s);
  let html = p('<strong>Resumen de cierre del viernes.</strong> Repaso de los paquetes y la documentación de cara a la semana del pase.');
  if (!pe.crqLleno) html += box('Sigue faltando el <strong>CRQ general</strong> en cabecera.', BBVA_COLORS.red);
  return { asunto: "Resumen de cierre del viernes", html: html + resumenGeneral(s), tonoNuevo: pe.crqLleno && !pe.proysSinOk.length && !pe.sinCodigo.length ? "informativo" : "alerta" };
}

function contenidoCierre(s) {
  const pe = pendientes_(s);
  let html = p('<strong>Hoy es el último día para cerrar el pase:</strong> CRQ, todos los componentes con su código, el orden de ejecución y la instalación técnica.');
  if (pe.sinCodigo.length) { html += tablaTitulo_("Componentes sin código", BBVA_COLORS.red); html += tabla(['Proyecto', 'Componente'], pe.sinCodigo.map(c => [c.proyecto, c.nombre])); }
  if (!pe.crqLleno) html += box('Falta el <strong>CRQ</strong> en cabecera.', BBVA_COLORS.red);
  if (!s.instTecnica) html += box('Falta marcar la <strong>Instalación técnica</strong> en la cabecera.', BBVA_COLORS.mandarin);
  return { asunto: "Último día para cerrar el pase", html: html + resumenGeneral(s) };
}

function contenidoInstTecnica(s) {
  const pe = pendientes_(s);
  let html = p('Recordatorio de la tarde sobre el cierre del pase.');
  if (!s.instTecnica) html += box('Falta marcar la <strong>Instalación técnica</strong> en la cabecera. Necesario para cerrar el pase.', BBVA_COLORS.mandarin);
  if (!pe.crqLleno) html += box('CRQ general sin informar.', BBVA_COLORS.red);
  return { asunto: "Instalación técnica y CRQ", html: html + resumenGeneral(s) };
}

function contenidoCierreFinal(s) {
  const pe = pendientes_(s);
  let html = p('<strong>Último aviso del día.</strong> Cierre de preparación de cara al resto de la semana.');
  if (pe.crqLleno && !pe.proysSinOk.length && !pe.sinCodigo.length && s.instTecnica) {
    html = p('<strong>Preparación cerrada.</strong> CRQ informado, todos los componentes con código, OKs completos e instalación técnica marcada. Buen trabajo, equipo.');
    return { asunto: "Preparación del pase cerrada", html: html + resumenGeneral(s), tonoNuevo: "informativo" };
  }
  return { asunto: "Último aviso · cierre del pase", html: html + resumenGeneral(s) };
}

function contenidoPreJueves(s) {
  const pe = pendientes_(s);
  if (!pe.checksFalta.length) return { omitir: true };
  let html = p('Checks de <strong>pre-implantación</strong> pendientes de confirmar en la web.') + lista("Confirmaciones que faltan", pe.checksFalta, BBVA_COLORS.canary);
  return { asunto: "Checks de pre-implantación", html: html + resumenGeneral(s), tonoNuevo: "recordatorio" };
}
function contenidoPreViernes(s) {
  const pe = pendientes_(s);
  if (!pe.checksFalta.length) return { omitir: true };
  let html = p('<strong>Último día</strong> para cumplir los requisitos previos a la implantación del sábado.') + lista("Checks pendientes", pe.checksFalta, BBVA_COLORS.mandarin);
  return { asunto: "Último día de pre-implantación", html: html + resumenGeneral(s), tonoNuevo: "warning" };
}
function contenidoPreViernesAlerta(s) {
  const pe = pendientes_(s);
  if (!pe.checksFalta.length) return { omitir: true };
  let html = p('<strong>Repaso crítico de la tarde</strong> para la implantación de mañana.') + lista("Elementos bloqueantes sin marcar", pe.checksFalta, BBVA_COLORS.red);
  return { asunto: "Repaso crítico para la implantación", html: html + resumenGeneral(s), tonoNuevo: "alerta" };
}
function contenidoPreViernesFinal(s) {
  const pe = pendientes_(s);
  if (!pe.checksFalta.length) return { omitir: true };
  let html = p('<strong>Último aviso antes de la implantación.</strong> Mañana hay subida y no está todo cerrado.') + lista("Checks en rojo", pe.checksFalta, BBVA_COLORS.red);
  return { asunto: "Último aviso antes de la implantación", html: html + resumenGeneral(s), tonoNuevo: "alerta_max" };
}

function contenidoPostMergeos(s) {
  const pe = pendientes_(s);
  let html = p('La implantación del fin de semana se completó correctamente.');
  if (pe.sinMergear.length) {
    html += tablaTitulo_("Mergeos pendientes de realizar", BBVA_COLORS.serene);
    html += tabla(['Proyecto', 'Componente', 'Código'], pe.sinMergear.map(c => [c.proyecto, c.nombre, c.codigo]));
    return { asunto: "Implantación correcta · mergeos pendientes", html: html + resumenGeneral(s), tonoNuevo: "informativo" };
  }
  return { omitir: true };
}
function contenidoPostMergeosRec(s) {
  const pe = pendientes_(s);
  if (!pe.sinMergear.length) return { omitir: true };
  let html = p('Recordatorio de cierre del lunes: quedan mergeos por consolidar.');
  html += tabla(['Proyecto', 'Componente', 'Código'], pe.sinMergear.map(c => [c.proyecto, c.nombre, c.codigo]));
  return { asunto: "Recordatorio · mergeos pendientes", html: html + resumenGeneral(s), tonoNuevo: "recordatorio" };
}
function contenidoPostMergeosFinal(s) {
  const pe = pendientes_(s);
  if (!pe.sinMergear.length) return { omitir: true };
  let html = p('<strong>Último aviso.</strong> Faltan mergeos por consolidar hoy en el código fuente.');
  html += tabla(['Proyecto', 'Componente', 'Código'], pe.sinMergear.map(c => [c.proyecto, c.nombre, c.codigo]));
  return { asunto: "Último aviso · mergeos pendientes", html: html + resumenGeneral(s), tonoNuevo: "alerta_max" };
}

/* Lunes tras el pase con la implantación aún sin cerrar en la web. */
function contenidoCerrarImplantacion(s) {
  let html = p('La implantación del fin de semana sigue <strong>sin cerrarse</strong> en la web.') +
    p('Hay que <strong>finalizar el pase</strong> (marcar los pasos implantados y completar la implantación) y <strong>comenzar la post-implantación</strong> para gestionar los mergeos.');
  const sinImplantar = s.fase === "FASE_4_CERRADO"
    ? box('El pase ni siquiera ha entrado en implantación: revisad si el sábado se ejecutó y actualizad la web.', BBVA_COLORS.red)
    : "";
  return { asunto: "Finalizar el pase y comenzar la post-implantación", html: html + sinImplantar + resumenGeneral(s) };
}

function contenidoDescanso(s, fechaPase) {
  const fechaTxt = Utilities.formatDate(fechaPase, "Europe/Madrid", "EEEE dd/MM");
  let html = p('Esta semana ' + strong('no nos toca subir nada') + ' en el pase del ' + fechaTxt + '.') +
    p('Si surge una urgencia, podéis reactivar el pase desde la web.');
  return { asunto: "Semana sin pase", html, tonoNuevo: "informativo" };
}

/* ───────── DEBUG: probar todos los correos de golpe ───────── */
function probarTodosLosCorreos() {
  const filaPase = 2;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fechaPase = ss.getSheetByName(CONSTANTES.HOJA_PASES).getRange(filaPase, 1).getValue();
  const fechaPaseStr = formatearFechaSegura(fechaPase);
  const estado = recopilarEstadoPase(fechaPaseStr, filaPase);

  const gens = [
    ["1 · Inicio", contenidoInicio], ["2 · OKs + Workstation", contenidoOksWorkstation],
    ["3 · Paquetes", contenidoPaquetes], ["4 · tech-kytl", contenidoTechKytl],
    ["5 · Historias y CRQ", contenidoHistoriasYCRQ], ["6 · Resumen viernes", contenidoResumenViernes],
    ["7 · Cierre", contenidoCierre], ["8 · Inst. técnica", contenidoInstTecnica],
    ["9 · Cierre final", contenidoCierreFinal], ["10 · Pre jueves", contenidoPreJueves],
    ["11 · Pre viernes", contenidoPreViernes], ["12 · Pre viernes alerta", contenidoPreViernesAlerta],
    ["13 · Pre viernes final", contenidoPreViernesFinal], ["14 · Post mergeos", contenidoPostMergeos],
    ["15 · Post recordatorio", contenidoPostMergeosRec], ["16 · Post final", contenidoPostMergeosFinal],
    ["17 · Descanso", contenidoDescanso]
  ];
  gens.forEach(g => {
    try {
      const c = g[1](estado, fechaPase, fechaPaseStr);
      if (c.omitir) { Logger.log("⏩ Saltado (todo OK): " + g[0]); return; }
      const tono = c.tonoNuevo || "informativo";
      const fechaTxt = Utilities.formatDate(fechaPase, "Europe/Madrid", "EEEE dd/MM/yyyy");
      enviarAvisoMail_(wrap(c.asunto, tono, c.html, "Pase del " + fechaTxt), fechaPaseStr);
      Logger.log("✅ Enviado: " + g[0]);
      Utilities.sleep(1500);
    } catch (e) { Logger.log("❌ Error en " + g[0] + ": " + e.message); }
  });
  Logger.log("Prueba completada. Revisa la bandeja.");
}
