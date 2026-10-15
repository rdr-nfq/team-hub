/* ===========================================================================
   Comidas RDR · Recordatorios por email (Apps Script)

   Avisa a quien AÚN NO ha votado, con el enlace a la web. Un correo
   INDIVIDUAL a cada pendiente, desde el grupo de Google (Correo.gs).

   Cuándo, y solo si ese jueves es de oficina ('N' en la pestaña "Semana"):
     · Lun 12 y 17 · Mar 12 y 17
     · Mié 12 → aviso final: la reserva se hace en 30 min; quien no vote se
                asume "No estoy" o "Taper / Glovo".

   Funciones de uso:
     crearTriggers()             una vez, para programar los avisos
     enviarRecordatorioPrueba()  envía al responsable del hub el correo que saldría hoy
     diagnosticarComidas()       qué haría el próximo disparo, sin enviar nada
     probarRemitente()           (Correo.gs) remitente en uso + prueba con emojis
     revisarRebotes()            avisos de no entrega recientes

   Envío, remitente y emojis del asunto: ver Correo.gs.
   =========================================================================== */

const WEB_URL   = 'https://rdr-nfq.github.io/team-hub/comidas/'; // enlace del botón del correo
const REMITE    = 'Comidas RDR';

// Las respuestas a los recordatorios van al responsable del hub
// (_hubResponsable(), en _comun/Hub.gs).

// El JSON del equipo se lee SIEMPRE desde la URL "raw" de GitHub: devuelve text/plain
// sin redirecciones ni páginas HTML de error. NO usar la URL de GitHub Pages: puede
// redirigir (307) o, en red corporativa, ser bloqueada por el proxy y devolver HTML,
// lo que rompe el JSON.parse ("Unexpected token '<', <!doctype...").
// OJO: equipo.json se movió a beyond-the-grid/public/ con la migración de la
// web; la ruta antigua (equipo/equipo.json) devuelve 404 y dejaba team=[]
// -> el script no enviaba NINGÚN recordatorio, en silencio.
const EQUIPO_JSON_URL = 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json'; // ← ajusta usuario/repo/rama si cambian

// ── Disparadores (ejecutar una vez) ───────────────────────────────────────
function crearTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'enviarRecordatorio') ScriptApp.deleteTrigger(t);
  });
  const W = ScriptApp.WeekDay;
  [[W.MONDAY, 12], [W.MONDAY, 17], [W.TUESDAY, 12], [W.TUESDAY, 17], [W.WEDNESDAY, 12]]
    .forEach(p => ScriptApp.newTrigger('enviarRecordatorio').timeBased().onWeekDay(p[0]).atHour(p[1]).create());
  Logger.log('Disparadores creados: Lun 12 y 17 · Mar 12 y 17 · Mié 12.');
}

// ── Handler de los disparadores ───────────────────────────────────────────
function enviarRecordatorio() {
  const ss = getSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const isoDow = +Utilities.formatDate(new Date(), tz, 'u'); // 1=Lun … 7=Dom
  if (isoDow > 3) return;                 // solo Lun-Mié
  const esFinal = isoDow === 3;           // miércoles = aviso final

  const fecha = proximoJueves_(tz, isoDow);
  if (!esOficina_(ss, fecha)) { Logger.log(fecha + ': jueves sin oficina, no se avisa.'); return; }

  const pendientes = noVotantes_(ss, fecha);
  const emails = pendientes.map(p => p.email).filter(Boolean);
  if (!emails.length) { Logger.log(fecha + ': no queda nadie por votar.'); return; }

  const asunto = asunto_(fecha, esFinal);
  const lider = lider_(ss, fecha);
  // Uno por persona, saludándola por su nombre.
  const r = { enviados: [], fallidos: [] };
  pendientes.filter(p => p.email).forEach(p => {
    const x = enviarMail_(p.email, asunto, cuerpo_(pendientes, fecha, esFinal, lider, p.nombre));
    r.enviados = r.enviados.concat(x.enviados); r.fallidos = r.fallidos.concat(x.fallidos);
  });
  Logger.log(fecha + ': ' + r.enviados.length + ' de ' + emails.length + ' pendientes avisados → ' + r.enviados.join(', ')
    + (r.fallidos.length ? ' · FALLAN: ' + r.fallidos.join(' | ') : ''));
}

/** Asunto del recordatorio (los emojis llegan bien: ver Correo.gs). */
function asunto_(fecha, esFinal) {
  return esFinal
    ? '⏰🍽️ Última llamada · la reserva del jueves ' + fecha + ' se hace en 30 min'
    : '🍽️ ¿Dónde comemos el jueves ' + fecha + '? 🗳️ Vota ahora';
}

/** Fecha (dd/MM/yyyy) del jueves de esta semana. */
function proximoJueves_(tz, isoDow) {
  const j = new Date();
  j.setDate(j.getDate() + (4 - isoDow));
  return Utilities.formatDate(j, tz, 'dd/MM/yyyy');
}

// ── Envío ─────────────────────────────────────────────────────────────────
//    Correo.gs manda uno por destinatario, desde el grupo, con reintento.
//    El cuerpo lleva su versión en texto plano además del HTML: los mensajes
//    con un texto de verdad puntúan mejor en los filtros antispam.

/** Cuerpo en texto plano a partir del HTML. */
function quitarTags_(html) {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function enviarMail_(destinatarios, subject, htmlBody) {
  return _correoEnviar(destinatarios, subject, quitarTags_(htmlBody), htmlBody, { nombre: REMITE, replyTo: _hubResponsable() });
}

// ── Datos ─────────────────────────────────────────────────────────────────
//    Las comparaciones de fecha y nombre van NORMALIZADAS: Sheets puede mostrar
//    "2/10/2026" donde el script calcula "02/10/2026", y un nombre con un
//    espacio o una tilde de más no casaría con equipo.json. Con una
//    comparación exacta, a quien ya había votado se le seguía recordando.

/** Fecha de una celda ("2/10/2026", "02/10/26", "2026-10-02") → "dd/MM/yyyy". */
function fechaClave_(v) {
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + (m[3].length === 2 ? '20' + m[3] : m[3]);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1];
  return s;
}

/** Nombre comparable: sin tildes, espacios de más ni mayúsculas. */
function nombreClave_(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function mismoEmail_(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function esOficina_(ss, fecha) {
  return ss.getSheetByName('Semana').getDataRange().getDisplayValues()
    .some(r => fechaClave_(r[0]) === fecha && String(r[1]).trim().toUpperCase() === 'N');
}

function equipo_() {
  try {
    const resp = UrlFetchApp.fetch(EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
    const code = resp.getResponseCode();
    const body = resp.getContentText();
    if (code !== 200) throw new Error('HTTP ' + code + ' al leer equipo.json');
    if (body.trim().charAt(0) !== '{') throw new Error('respuesta no-JSON (¿URL redirige a HTML?): ' + body.slice(0, 60));
    // Se saltan quienes estén marcados como baja: una dirección que ya no
    // existe hace rebotar el correo (y puede tumbar el envío conjunto).
    return (JSON.parse(body).team || []).filter(p => p && p.email && p.activo !== false && p.baja !== true);
  } catch (e) { Logger.log('equipo.json: ' + e); return []; }
}

/** Nombres (normalizados) que ya han respondido para esa semana — cualquier
 *  respuesta cuenta: restaurante, «el que más se vote», Taper/Glovo o No estoy. */
function votantes_(ss, fecha) {
  const voto = {};
  ss.getSheetByName('Equipo').getDataRange().getDisplayValues()
    .forEach((r, i) => { if (i && fechaClave_(r[0]) === fecha && String(r[1]).trim()) voto[nombreClave_(r[1])] = String(r[1]).trim(); });
  return voto;
}

function noVotantes_(ss, fecha) {
  const voto = votantes_(ss, fecha);
  return equipo_().filter(p => !voto[nombreClave_(p.nombre)]).map(p => ({ nombre: p.nombre, email: p.email }));
}

function lider_(ss, fecha) {
  const c = {};
  ss.getSheetByName('Equipo').getDataRange().getDisplayValues().forEach((r, i) => {
    const e1 = String(r[2] || '').trim();
    if (i && fechaClave_(r[0]) === fecha && e1 && e1.toLowerCase() !== 'el que más se vote') c[e1] = (c[e1] || 0) + 1;
  });
  let top = null, max = 0;
  for (const k in c) if (c[k] > max) { max = c[k]; top = k; }
  return top ? { nombre: top, votos: max } : null;
}

/** "Ana, Luis y Marta" — para nombrar a los pendientes en el cuerpo. */
function listaNombres_(pendientes) {
  const n = pendientes.map(p => p.nombre);
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
}

// ── Plantilla de email ────────────────────────────────────────────────────
function cuerpo_(pendientes, fecha, esFinal, lider, nombre) {
  const faltan = pendientes.length && pendientes[0].nombre !== 'equipo'
    ? '<p style="margin:0 0 18px;font-size:13px;color:#5C5C5C;">⏳ Faltáis por votar: ' + listaNombres_(pendientes) + '.</p>'
    : '';
  const intro = esFinal
    ? '⏰ En la <strong>próxima media hora</strong> se hace la reserva para el jueves <strong>' + fecha + '</strong>. Quien no vote ahora, se da por hecho que <strong>no está</strong> o que come de <strong>Taper / Glovo</strong>.'
    : '📅 Todavía falta vuestro voto para el <strong>jueves ' + fecha + '</strong>. Entrad y elegid: 🍝 un restaurante, 🙌 «el que más se vote», 🥡 Taper / Glovo o 🏠 No estoy.';
  const lin = lider
    ? '<p style="margin:0 0 18px;font-size:13px;color:#5C5C5C;">🏆 Ahora va ganando <strong style="color:#001391;">' + lider.nombre + '</strong> (' + lider.votos + (lider.votos === 1 ? ' voto' : ' votos') + ').</p>'
    : '';
  const btn = esFinal ? '#FFB56B' : '#88E783';
  return '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#001391;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Comidas RDR · BBVA × NFQ</div>'
    +   '<div style="font-size:22px;font-weight:bold;margin-top:4px;">' + (esFinal ? '⏰ Última llamada' : '🍽️ ¿Dónde comemos el jueves?') + '</div></div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;">'
    +   '<p style="margin:0 0 14px;font-size:15px;">👋 Hola <strong>' + (nombre ? String(nombre).split(' ')[0] : 'equipo') + '</strong>,</p>'
    +   '<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">' + intro + '</p>' + faltan + lin
    +   '<a href="' + WEB_URL + '" style="display:inline-block;background:' + btn + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;">🗳️ Votar ahora →</a>'
    +   '<p style="margin:18px 0 0;font-size:12px;color:#8a8a8a;">Si el botón no va: <a href="' + WEB_URL + '" style="color:#001391;">' + WEB_URL + '</a></p></div></div>';
}

// ── Prueba: envía SOLO al responsable del hub el correo que saldría hoy ───
function enviarRecordatorioPrueba() {
  const ss = getSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const j = new Date();
  const isoDow = +Utilities.formatDate(j, tz, 'u');
  j.setDate(j.getDate() + ((4 - isoDow + 7) % 7 || 7)); // próximo jueves
  const fecha = Utilities.formatDate(j, tz, 'dd/MM/yyyy');
  const pendientes = noVotantes_(ss, fecha);
  enviarMail_(_hubResponsable(), '[PRUEBA] ' + asunto_(fecha, false),
    cuerpo_(pendientes.length ? pendientes : [{ nombre: 'equipo' }], fecha, false, lider_(ss, fecha)));
  Logger.log('Prueba enviada a ' + _hubResponsable() + ' (remitente: ' + (_correoRemitente() || 'la cuenta del script') + ').');
}

// ── Diagnóstico: qué haría el próximo disparo, sin enviar nada ────────────
function diagnosticarComidas() {
  const ss = getSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const isoDow = +Utilities.formatDate(new Date(), tz, 'u');
  const fecha = proximoJueves_(tz, isoDow);
  const team = equipo_();
  const pendientes = noVotantes_(ss, fecha);
  Logger.log('Hoy: día ISO ' + isoDow + ' (1=Lun) · jueves de esta semana: ' + fecha);
  Logger.log('¿Jueves de oficina ("N" en Semana)?: ' + esOficina_(ss, fecha));
  Logger.log('equipo.json: ' + team.length + ' personas · sin email: ' + team.filter(p => !p.email).map(p => p.nombre).join(', '));
  Logger.log('Pendientes de votar (' + pendientes.length + '): ' + pendientes.map(p => p.nombre + ' <' + p.email + '>').join(', '));
  // Votos de la semana: si alguno no casa con nadie de equipo.json, a esa
  // persona se le seguiría recordando aunque haya votado.
  const voto = votantes_(ss, fecha);
  const delEquipo = {};
  team.forEach(p => { delEquipo[nombreClave_(p.nombre)] = true; });
  const huerfanos = Object.keys(voto).filter(k => !delEquipo[k]).map(k => voto[k]);
  Logger.log('Ya han respondido (' + Object.keys(voto).length + '): ' + Object.keys(voto).map(k => voto[k]).join(', '));
  if (huerfanos.length) Logger.log('⚠ Votos con un nombre que no está en equipo.json (no cuentan como respondido): ' + huerfanos.join(', '));
  Logger.log('Remitente: ' + (_correoRemitente() || 'la cuenta del script') + ' · un correo por pendiente');
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/** Avisos de no entrega recientes en el buzón de quien envía. Un correo
 *  RECHAZADO aparece aquí con su motivo; si no hay nada y aun así no llegó,
 *  es que quedó retenido en cuarentena y hay que mirarlo en la Consola de
 *  administración (Informes → Búsqueda del registro de correo). */
function revisarRebotes() {
  const hilos = GmailApp.search('newer_than:2d (from:mailer-daemon OR from:postmaster OR subject:("Undelivered" OR "Delivery Status" OR "no se ha entregado" OR "Devolución"))', 0, 20);
  Logger.log('Avisos de no entrega en las últimas 48 h: ' + hilos.length);
  hilos.forEach(h => {
    const m = h.getMessages()[0];
    Logger.log('· ' + Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'dd/MM HH:mm')
      + ' · ' + h.getFirstMessageSubject() + '\n   ' + m.getPlainBody().slice(0, 300).replace(/\s+/g, ' '));
  });
}
