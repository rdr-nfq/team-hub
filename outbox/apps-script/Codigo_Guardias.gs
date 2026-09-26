/**
 * ============================================================================
 *  GUARDIAS RDR  ·  Apps Script (backend de /guardias y /guardias-gestion)
 * ============================================================================
 *
 *  Solicitud y resolución de guardias (Pases Calendados fuera de horario):
 *  cada miembro da de alta una guardia (día, hora de entrada/salida y una
 *  justificación) y coordinación la aprueba con un importe o la rechaza con
 *  un motivo. Los datos viven en un Google Sheet PROPIO de este script (se
 *  crea solo en el primer guardado; su ID queda en Propiedades del script) —
 *  mismo patrón que Codigo_TimeReport.gs.
 *
 *  Al dar de alta se avisa por email a TODOS los coordinadores (equipo.json,
 *  campo "coordinador": true) con un link directo a /guardias-gestion?id=…
 *  que deja esa solicitud en primer plano. Al resolverla (aprobar/rechazar)
 *  se avisa por email a quien la solicitó.
 *
 *  DESPLIEGUE (proyecto Apps Script INDEPENDIENTE):
 *   1. script.google.com -> Nuevo proyecto -> pegar este fichero.
 *   2. Ejecutar una vez `autorizar` (Drive/Sheets + Gmail + UrlFetch).
 *   3. Implementar -> Aplicación web (Ejecutar como YO, Cualquier persona) ->
 *      "Nueva versión" en cada cambio. Pegar la URL /exec en links.json ->
 *      "guardiasBackend".
 *
 *  API (GET query o POST text/plain JSON):
 *   ?action=misGuardias&email=persona@nfq.es -> { guardias:[...] } (últimas 20)
 *   ?action=todas                            -> { guardias:[...] } (todas, coordinación)
 *   POST { action:'crear', persona, email, fecha, horaEntrada, horaSalida, descripcion, prueba }
 *        -> { guardia, aviso:{ok, error?} }  — Estado nace 'pendiente'; avisa a
 *        coordinación. Si el correo falla, la guardia queda guardada igual y
 *        `aviso.error` dice por qué (la web lo enseña).
 *        `prueba:true` (botón de /guardias-gestion, solo coordinadores) la marca
 *        como guardia de PRUEBA: mismo circuito de avisos, pero etiquetado
 *        "[PRUEBA]" en los correos para no confundirla con una solicitud real.
 *   POST { action:'resolver', id, estado:'aprobada'|'rechazada', importe, motivo, resueltoPor }
 *        -> { guardia, aviso:{ok, error?} }  — avisa por email a quien la solicitó.
 *   POST { action:'marcarMyNfq', id, valor:true|false }
 *        -> { guardia }  — solo en aprobadas: segundo check de que el importe
 *        ya está dado de alta en myNfq (de cara al pago). Sin email.
 *   POST { action:'borrar', id }
 *        -> { id, borrada:true }  — quita la fila entera del Sheet (para
 *        todos, no un ocultado local). Vale para pruebas y para reales dadas
 *        de alta por error; sin marcha atrás. Solo coordinación llega aquí
 *        (botón de /guardias-gestion).
 * ============================================================================
 */

var G_CONFIG = {
  TZ: 'Europe/Madrid',
  WEB_URL_MIEMBRO: 'https://rdr-nfq.github.io/team-hub/guardias/',
  WEB_URL_GESTION: 'https://rdr-nfq.github.io/team-hub/guardias-gestion/',
  REMITE: 'Guardias RDR',
  EQUIPO_JSON_URL: 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json',
  IMPORTES_RAPIDOS: [30, 70, 120, 240]
};

/* Envío de correo: NUNCA noReply:true. Mismo diagnóstico que Comidas
   (Comidas_Recordatorios.gs, probarEntrega()): noreply@ llega a bbva.com
   (por eso los avisos de pases funcionan) pero Workspace RETIENE en
   silencio — sin rebote, sin error — el correo desde una dirección
   "noreply@<dominio>" inventada hacia buzones del propio dominio, y
   nter.es también lo filtra. Los correos de Guardias van SIEMPRE desde la
   cuenta que ejecuta el script (el remitente real, sin decorar): a
   coordinación en el PARA y al solicitante directo. Si un envío falla, la
   web lo muestra (campo `aviso` de la respuesta) en vez de callarlo, y
   probarCorreo() lo comprueba desde el editor. */

var G_HOJA = ['Guardias', [
  'Id', 'CreadoEn', 'Persona', 'Email', 'Fecha', 'HoraEntrada', 'HoraSalida',
  'Descripcion', 'Estado', 'Importe', 'Motivo', 'ResueltoEn', 'ResueltoPor', 'Prueba', 'AprobadaMyNfq'
]];

/* Ejecutar UNA vez desde el editor para conceder los permisos (Sheets, Gmail,
   UrlFetch para leer equipo.json). Si tras un cambio aparece "No tienes
   permiso para llamar a…", volver a ejecutarla. */
function autorizar() {
  _ss().getName();
  GmailApp.getAliases();
  UrlFetchApp.fetch(G_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true });
  Logger.log('Permisos concedidos.');
}

function _ss() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DATA_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('RDR Guardias (datos)');
  props.setProperty('DATA_SPREADSHEET_ID', ss.getId());
  return ss;
}

function _hoja() {
  var ss = _ss();
  var sh = ss.getSheetByName(G_HOJA[0]);
  if (!sh) {
    sh = ss.insertSheet(G_HOJA[0]);
    sh.getRange(1, 1, 1, G_HOJA[1].length).setValues([G_HOJA[1]]);
    sh.getRange(1, 1, sh.getMaxRows(), 5).setNumberFormat('@'); // Id/CreadoEn/Persona/Email/Fecha como texto plano
    sh.getRange(1, 6, sh.getMaxRows(), 2).setNumberFormat('@'); // HoraEntrada/HoraSalida como texto (nunca hora-serie)
  } else if (sh.getLastColumn() < G_HOJA[1].length) {
    // Hoja creada con una versión anterior (menos columnas, p.ej. sin "Prueba"):
    // añade la cabecera que falte. Las filas antiguas simplemente no tienen esas celdas.
    sh.getRange(1, 1, 1, G_HOJA[1].length).setValues([G_HOJA[1]]);
  }
  return sh;
}

function doGet(e)  { return _serve(e); }
function doPost(e) { return _serve(e); }

function _serve(e) {
  try {
    var p = {};
    if (e && e.parameter) for (var k in e.parameter) p[k] = e.parameter[k];
    if (e && e.postData && e.postData.contents) {
      var body = JSON.parse(e.postData.contents);
      for (var kb in body) p[kb] = body[kb];
    }
    var action = p.action || 'ping';
    var data;
    switch (action) {
      case 'ping': data = { ok: 1, importesRapidos: G_CONFIG.IMPORTES_RAPIDOS }; break;
      case 'misGuardias': data = { guardias: misGuardias(p.email) }; break;
      case 'todas': data = { guardias: todasLasGuardias() }; break;
      case 'crear': data = crearGuardia(p); break;
      case 'resolver': data = resolverGuardia(p); break;
      case 'marcarMyNfq': data = { guardia: marcarMyNfq(p) }; break;
      case 'borrar': data = borrarGuardia(p); break;
      default: throw new Error('Acción desconocida: ' + action);
    }
    return _json({ ok: true, action: action, data: data });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ────────────────────────── Lectura / escritura de filas ────────────────────────── */

function _textoDe(v) {
  if (v instanceof Date) return Utilities.formatDate(v, G_CONFIG.TZ, 'yyyy-MM-dd');
  return String(v == null ? '' : v);
}
function _horaTexto(v) {
  if (v instanceof Date) return Utilities.formatDate(v, G_CONFIG.TZ, 'HH:mm');
  return String(v == null ? '' : v);
}

function _filas() {
  var sh = _hoja();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, G_HOJA[1].length).getValues();
}

function _aObjeto(r, rowNumber) {
  return {
    row: rowNumber,
    id: String(r[0] || ''),
    creadoEn: r[1] instanceof Date ? r[1].toISOString() : String(r[1] || ''),
    persona: String(r[2] || ''),
    email: String(r[3] || ''),
    fecha: _textoDe(r[4]),
    horaEntrada: _horaTexto(r[5]),
    horaSalida: _horaTexto(r[6]),
    descripcion: String(r[7] || ''),
    estado: String(r[8] || 'pendiente'),
    importe: r[9] === '' || r[9] == null ? null : Number(r[9]),
    motivo: String(r[10] || ''),
    resueltoEn: r[11] instanceof Date ? r[11].toISOString() : String(r[11] || ''),
    resueltoPor: String(r[12] || ''),
    prueba: r[13] === true || String(r[13] || '').toUpperCase() === 'TRUE',
    aprobadaMyNfq: r[14] === true || String(r[14] || '').toUpperCase() === 'TRUE'
  };
}

// Las de PRUEBA nunca salen aquí: es la vista personal de cada miembro (incluido
// el coordinador que las genera), y no deben aparecer en ningún sitio ni quedar
// como si fueran una guardia real suya.
function misGuardias(email) {
  var x = String(email || '').trim().toLowerCase();
  if (!x) throw new Error('Falta el email.');
  var out = [];
  _filas().forEach(function (r, i) {
    if (String(r[3] || '').trim().toLowerCase() !== x) return;
    var o = _aObjeto(r, i + 2);
    if (o.prueba) return;
    out.push(o);
  });
  out.sort(function (a, b) { return b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0; });
  return out.slice(0, 20);
}

function todasLasGuardias() {
  var out = [];
  _filas().forEach(function (r, i) { out.push(_aObjeto(r, i + 2)); });
  out.sort(function (a, b) { return b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0; });
  return out;
}

function _porId(id) {
  var x = String(id || '').trim();
  if (!x) throw new Error('Falta el id.');
  var filas = _filas();
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0] || '') === x) return _aObjeto(filas[i], i + 2);
  }
  throw new Error('No existe esa guardia (' + x + ').');
}

/* ────────────────────────────────── Alta ────────────────────────────────── */

function crearGuardia(p) {
  var persona = String(p.persona || '').trim();
  var email = String(p.email || '').trim();
  var fecha = String(p.fecha || '').trim();
  var horaEntrada = String(p.horaEntrada || '').trim();
  var horaSalida = String(p.horaSalida || '').trim();
  var descripcion = String(p.descripcion || '').trim();
  // Guardia de PRUEBA: la activa un coordinador desde /guardias-gestion (única
  // página que ofrece el botón) para comprobar el circuito de avisos sin tocar
  // solicitudes reales. El backend no vuelve a comprobar el rol — como el
  // resto de la app, la puerta es la propia página (SoloCoordinacion).
  var prueba = p.prueba === true || p.prueba === 'true';
  if (!persona || !email) throw new Error('Falta identificar a quién solicita la guardia.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Falta el día del Pase Calendado.');
  if (!horaEntrada || !horaSalida) throw new Error('Faltan la hora de entrada y de salida.');
  if (!descripcion) throw new Error('Falta la justificación/descripción del Pase Calendado.');

  var id = Utilities.getUuid();
  var ahora = new Date();
  var sh = _hoja();
  sh.getRange(sh.getLastRow() + 1, 1, 1, G_HOJA[1].length).setValues([[
    id, ahora, persona, email, fecha, horaEntrada, horaSalida, descripcion,
    'pendiente', '', '', '', '', prueba, false
  ]]);

  var guardia = { id: id, creadoEn: ahora.toISOString(), persona: persona, email: email, fecha: fecha,
    horaEntrada: horaEntrada, horaSalida: horaSalida, descripcion: descripcion, estado: 'pendiente',
    importe: null, motivo: '', resueltoEn: '', resueltoPor: '', prueba: prueba, aprobadaMyNfq: false };

  return { guardia: guardia, aviso: _intentar('Aviso a coordinación', function () { _avisarCoordinacionNuevaGuardia(guardia); }) };
}

/* Ejecuta un envío de correo sin que un fallo tumbe el guardado (la guardia
   ya está escrita): devuelve {ok} o {ok:false, error} para que la web avise. */
function _intentar(que, fn) {
  try {
    fn();
    return { ok: true };
  } catch (e) {
    var msg = String(e && e.message ? e.message : e);
    Logger.log(que + ': ' + msg);
    return { ok: false, error: msg };
  }
}

/* ────────────────────────────── Resolución ────────────────────────────── */

function resolverGuardia(p) {
  var id = String(p.id || '').trim();
  var estado = String(p.estado || '').trim().toLowerCase();
  var resueltoPor = String(p.resueltoPor || '').trim();
  if (estado !== 'aprobada' && estado !== 'rechazada') throw new Error('Estado inválido: ' + estado);
  if (!resueltoPor) throw new Error('Falta quién resuelve la guardia.');

  var actual = _porId(id);
  if (actual.estado !== 'pendiente') {
    throw new Error('Esta guardia ya estaba resuelta (' + actual.estado + ' por ' + (actual.resueltoPor || '—') + ').');
  }

  var importe = '', motivo = '';
  if (estado === 'aprobada') {
    importe = Number(p.importe);
    if (!importe || importe <= 0) throw new Error('Falta el importe a aprobar.');
  } else {
    motivo = String(p.motivo || '').trim();
    if (!motivo) throw new Error('Falta el motivo del rechazo.');
  }

  var ahora = new Date();
  var sh = _hoja();
  sh.getRange(actual.row, 9, 1, 5).setValues([[estado, importe, motivo, ahora, resueltoPor]]);

  var guardia = Object.assign({}, actual, {
    estado: estado, importe: importe === '' ? null : importe, motivo: motivo,
    resueltoEn: ahora.toISOString(), resueltoPor: resueltoPor
  });

  return { guardia: guardia, aviso: _intentar('Aviso al solicitante', function () { _avisarSolicitanteResolucion(guardia); }) };
}

/* Segundo check, solo visual/de seguimiento (sin email): que el importe ya
   está dado de alta en myNfq, de cara a cuándo le llega el dinero a quien
   hizo la guardia. Se puede marcar y desmarcar. */
function marcarMyNfq(p) {
  var id = String(p.id || '').trim();
  var valor = p.valor === true || p.valor === 'true';
  var actual = _porId(id);
  if (actual.estado !== 'aprobada') throw new Error('Solo se puede marcar en guardias aprobadas.');
  _hoja().getRange(actual.row, 15, 1, 1).setValues([[valor]]);
  return Object.assign({}, actual, { aprobadaMyNfq: valor });
}

/* Borra una guardia (fila entera del Sheet): sirve tanto para limpiar las
   de PRUEBA como para quitar una real dada de alta por error — pendiente,
   aprobada o rechazada. Sin marcha atrás; la confirmación va en la web. */
function borrarGuardia(p) {
  var id = String(p.id || '').trim();
  var actual = _porId(id);
  _hoja().deleteRow(actual.row);
  return { id: id, borrada: true };
}

/* ──────────────────────────── Equipo / coordinadores ──────────────────────────── */

function _equipo() {
  var resp = UrlFetchApp.fetch(G_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
  var body = resp.getContentText();
  if (body.trim().charAt(0) !== '{') throw new Error('equipo.json: respuesta no-JSON');
  return (JSON.parse(body).team || []).filter(function (m) { return m && m.nombre; });
}

function _emailsCoordinadores() {
  var vistos = {}, out = [];
  _equipo().forEach(function (m) {
    if (!m.coordinador || !m.email) return;
    var k = String(m.email).trim().toLowerCase();
    if (!k || vistos[k]) return;
    vistos[k] = 1;
    out.push(String(m.email).trim());
  });
  return out;
}

/* ─────────────────────────────────── Emails ─────────────────────────────────── */
/* Mismo lenguaje visual que el resto del hub (Electric Blue + Lato/Source Serif),
   patrón de envío de Codigo_TimeReport.gs (noreply, sin alias). */

function _fechaTxt(fecha) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return fecha;
  return m[3] + '/' + m[2] + '/' + m[1];
}

function _boton(href, label, bg) {
  return '<a href="' + href + '" style="display:inline-block;background:' + bg + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;margin:0 8px 8px 0;">' + label + '</a>';
}
function _envoltorio(titulo, subtitulo, cuerpoHtml) {
  return '<div style="font-family:Lato,Arial,sans-serif;max-width:560px;margin:0 auto;color:#070E46;">'
    + '<div style="background:#001391;color:#F7F8F8;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Guardias RDR · BBVA × NFQ</div>'
    +   '<div style="font-family:Georgia,\'Source Serif 4\',serif;font-size:22px;font-weight:bold;margin-top:4px;">' + titulo + '</div>'
    +   (subtitulo ? '<div style="font-size:13px;color:#cdd9f5;margin-top:4px;">' + subtitulo + '</div>' : '')
    + '</div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;background:#FFFFFF;">'
    +   cuerpoHtml
    + '</div></div>';
}
function _filaDatos(pares) {
  var html = '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:10px 0 16px;">';
  pares.forEach(function (kv) {
    html += '<tr><td style="padding:4px 10px 4px 0;color:#46536D;white-space:nowrap;">' + kv[0] + '</td>'
      + '<td style="padding:4px 0;font-weight:bold;">' + kv[1] + '</td></tr>';
  });
  return html + '</table>';
}

function _avisarCoordinacionNuevaGuardia(g) {
  var dest = _emailsCoordinadores();
  if (!dest.length) throw new Error('no hay coordinadores con email en equipo.json');
  var link = G_CONFIG.WEB_URL_GESTION + '?id=' + encodeURIComponent(g.id);
  var aviso = g.prueba
    ? '<p style="margin:0 0 14px;font-size:13px;color:#46536D;">🧪 <strong>Guardia de PRUEBA</strong> — solo para comprobar el circuito de avisos entre coordinadores. No es una solicitud real.</p>'
    : '';
  var cuerpo = aviso + '<p style="margin:0 0 14px;font-size:15px;">Nueva solicitud de guardia pendiente de resolución.</p>'
    + _filaDatos([
        ['Solicita', g.persona],
        ['Día del Pase Calendado', _fechaTxt(g.fecha)],
        ['Horario', g.horaEntrada + ' – ' + g.horaSalida],
        ['Descripción', g.descripcion]
      ])
    + _boton(link, 'Ver solicitud →', '#88E783')
    + '<p style="margin:14px 0 0;font-size:12px;color:#46536D;">Si el botón no va: <a href="' + link + '" style="color:#001391;">' + link + '</a></p>';
  var html = _envoltorio((g.prueba ? '🧪 [PRUEBA] ' : '') + '📋 Nueva solicitud de guardia', g.persona + ' · ' + _fechaTxt(g.fecha), cuerpo);
  var asunto = (g.prueba ? '🧪 [PRUEBA] ' : '') + '[RDR Hub] Nueva solicitud de guardia — ' + g.persona + ' — ' + _fechaTxt(g.fecha);
  var texto = (g.prueba ? '[PRUEBA] ' : '') + 'Nueva solicitud de guardia de ' + g.persona + ' para el ' + _fechaTxt(g.fecha) + ' (' + g.horaEntrada + '-' + g.horaSalida + ').\n' + g.descripcion + '\nResuélvela en: ' + link;
  // Desde la cuenta que ejecuta el script, coordinación en el PARA (ver
  // comentario de G_CONFIG). NO usar Session.getEffectiveUser() para mandarlo
  // "a uno mismo con copia oculta": pide el permiso userinfo.email, y si no está
  // autorizado Apps Script aborta la ejecución con su página HTML de
  // "Authorization is required" — la web veía "<!DOCTYPE…" y no salía ningún
  // correo. Responder va directo a quien solicitó.
  var opciones = { htmlBody: html, name: G_CONFIG.REMITE };
  if (g.email) opciones.replyTo = g.email;
  GmailApp.sendEmail(dest.join(','), asunto, texto, opciones);
}

function _avisarSolicitanteResolucion(g) {
  if (!g.email) return;
  var aprobada = g.estado === 'aprobada';
  var link = G_CONFIG.WEB_URL_MIEMBRO;
  var cuerpo;
  if (aprobada) {
    cuerpo = '<p style="margin:0 0 14px;font-size:15px;">Tu guardia ha sido <strong style="color:#1B8C13;">aprobada</strong>.</p>'
      + _filaDatos([
          ['Día del Pase Calendado', _fechaTxt(g.fecha)],
          ['Horario', g.horaEntrada + ' – ' + g.horaSalida],
          ['Importe', Number(g.importe).toLocaleString('es-ES') + ' €'],
          ['Resuelta por', g.resueltoPor]
        ]);
  } else {
    cuerpo = '<p style="margin:0 0 14px;font-size:15px;">Tu guardia ha sido <strong style="color:#C62828;">rechazada</strong>.</p>'
      + _filaDatos([
          ['Día del Pase Calendado', _fechaTxt(g.fecha)],
          ['Horario', g.horaEntrada + ' – ' + g.horaSalida],
          ['Motivo', g.motivo],
          ['Resuelta por', g.resueltoPor]
        ]);
  }
  if (g.prueba) {
    cuerpo = '<p style="margin:0 0 14px;font-size:13px;color:#46536D;">🧪 <strong>Guardia de PRUEBA</strong> — resultado del circuito de avisos entre coordinadores, no de una solicitud real.</p>' + cuerpo;
  }
  cuerpo += _boton(link, 'Ver mis guardias →', aprobada ? '#88E783' : '#FFB56B');
  var html = _envoltorio((g.prueba ? '🧪 [PRUEBA] ' : '') + (aprobada ? '✅ Guardia aprobada' : '❌ Guardia rechazada'), _fechaTxt(g.fecha), cuerpo);
  var asunto = (g.prueba ? '🧪 [PRUEBA] ' : '') + (aprobada ? '✅ Guardia aprobada — ' : '❌ Guardia rechazada — ') + _fechaTxt(g.fecha);
  var texto = (g.prueba ? '[PRUEBA] ' : '') + 'Tu guardia del ' + _fechaTxt(g.fecha) + ' ha sido ' + g.estado + '.'
    + (aprobada ? ' Importe: ' + g.importe + ' €.' : ' Motivo: ' + g.motivo + '.') + '\n' + link;
  // Un solo destinatario: directo, desde la cuenta que ejecuta el script (sin
  // noReply — ver comentario de G_CONFIG).
  GmailApp.sendEmail(g.email, asunto, texto, { htmlBody: html, name: G_CONFIG.REMITE });
}

/* ─────────────────────────────────── Pruebas ─────────────────────────────────── */

function _test_ping() { Logger.log(JSON.stringify(_serve({ parameter: { action: 'ping' } }).getContent())); }

/* Ejecutar desde el editor si no llegan los avisos: manda un correo de prueba
   a todos los coordinadores con el mismo método que los avisos reales, y deja
   en el registro a quién se ha enviado o el error exacto. */
function probarCorreo() {
  var dest = _emailsCoordinadores();
  Logger.log('Coordinadores (equipo.json): ' + (dest.join(', ') || 'NINGUNO'));
  if (!dest.length) return;
  var html = _envoltorio('🧪 Prueba de correo de Guardias', '', '<p style="font-size:15px;">Si te llega este correo, los avisos de Guardias funcionan. Mira también en spam.</p>');
  GmailApp.sendEmail(dest.join(','), '🧪 [PRUEBA] Guardias RDR · comprobación de correo', 'Si te llega este correo, los avisos de Guardias funcionan.', { htmlBody: html, name: G_CONFIG.REMITE });
  Logger.log('Enviado sin error a ' + dest.length + ' coordinadores. Si alguno no lo recibe, revisa su spam.');
}
