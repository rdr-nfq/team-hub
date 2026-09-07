/* ===========================================================================
   Comidas RDR · Recordatorios por email (Apps Script)
   Avisa a quien AÚN NO ha votado, con el enlace a la web.
   Horario (solo si ese jueves es de oficina, 'N' en la pestaña "Semana"):
     · Lun 12 y 17 · Mar 12 y 17
     · Mié 12 → aviso final: la reserva se hace en 30 min; quien no vote se
                asume "No estoy" o "Taper / Glovo".

   UN SOLO CORREO para todos los pendientes, con ellos en COPIA OCULTA y la
   cuenta que envía en el PARA. Es el patrón que mejor entrega: 20 correos
   de golpe (o uno con 20 direcciones en el PARA) desde noreply@ tienen toda
   la pinta de envío masivo y los filtran, sobre todo en los dominios de
   fuera (nter.es, nfq.mx). Con BCC nadie ve la lista de direcciones.

   Puesta en marcha: ejecutar crearTriggers() una vez.
   Prueba:      enviarRecordatorioPrueba()  → envía a PRUEBA_TO.
   Diagnóstico: diagnosticarComidas()       → qué vería el próximo disparo.
   Entrega:     probarEntrega('x@nter.es')  → manda las DOS variantes de
                remitente a esa dirección para ver cuál llega.
   =========================================================================== */

const WEB_URL   = 'https://rdr-nfq.github.io/team-hub/comidas/'; // enlace del botón del correo
const REMITE    = 'Comidas RDR';
const PRUEBA_TO = 'pablo.llorente@nfq.es';

/* Remitente:
     false (por defecto) → la cuenta que ejecuta el script. Va firmada con el
       DKIM de nfq.es y es la que mejor entrega FUERA del dominio.
     true → noreply@<dominio> (noReply:true, igual que los avisos de pases).
       OJO: los avisos de pases llegan porque van a UN buzón interno; hacia
       nter.es o nfq.mx el correo de noreply@ lo suele parar la pasarela de
       salida, y entonces no llega a NADIE, ni siquiera a los de nfq.es,
       porque se rechaza el mensaje entero.
   Con probarEntrega('alguien@nter.es') se ve cuál de las dos llega. */
const USAR_NOREPLY = false;

// Responder al correo escribe a esta dirección (con noreply@ no habría a quién).
const RESPONDER_A = 'pablo.llorente@nfq.es';

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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const isoDow = +Utilities.formatDate(new Date(), tz, 'u'); // 1=Lun … 7=Dom
  if (isoDow > 3) return;                 // solo Lun-Mié
  const esFinal = isoDow === 3;           // miércoles = aviso final

  const fecha = proximoJueves_(tz, isoDow);
  if (!esOficina_(ss, fecha)) { Logger.log(fecha + ': jueves sin oficina, no se avisa.'); return; }

  const pendientes = noVotantes_(ss, fecha);
  const emails = pendientes.map(p => p.email).filter(Boolean);
  if (!emails.length) { Logger.log(fecha + ': no queda nadie por votar.'); return; }

  const asunto = esFinal
    ? '⏰ Última hora · la reserva del jueves se hace en 30 min'
    : '🍽️ ¿Dónde comemos el jueves ' + fecha + '? Vota ahora';
  // Un único envío con todos los pendientes en copia oculta.
  enviarMail_(emails, asunto, cuerpo_(pendientes, fecha, esFinal, lider_(ss, fecha)));
  Logger.log(fecha + ': 1 correo a ' + emails.length + ' pendientes → ' + emails.join(', '));
}

/** Fecha (dd/MM/yyyy) del jueves de esta semana. */
function proximoJueves_(tz, isoDow) {
  const j = new Date();
  j.setDate(j.getDate() + (4 - isoDow));
  return Utilities.formatDate(j, tz, 'dd/MM/yyyy');
}

// ── Envío ─────────────────────────────────────────────────────────────────
//    UN correo: la cuenta que envía en el PARA y el equipo en COPIA OCULTA.
//    Así el mensaje tiene un único destinatario visible (mucho mejor recibido
//    por los filtros que 20 direcciones en el PARA) y nadie ve la lista.
function enviarMail_(destinatarios, subject, htmlBody) {
  const lista = [].concat(destinatarios).filter(Boolean);
  const yo = Session.getEffectiveUser().getEmail();
  const opciones = {
    htmlBody: htmlBody,
    name: REMITE,
    bcc: lista.join(','),
    replyTo: RESPONDER_A,
  };
  if (USAR_NOREPLY) { opciones.noReply = true; delete opciones.replyTo; }
  GmailApp.sendEmail(yo, subject, 'Vota dónde comer el jueves: ' + WEB_URL, opciones);
}

// ── Datos ─────────────────────────────────────────────────────────────────
function esOficina_(ss, fecha) {
  return ss.getSheetByName('Semana').getDataRange().getDisplayValues()
    .some(r => r[0] === fecha && String(r[1]).trim().toUpperCase() === 'N');
}

function equipo_() {
  try {
    const resp = UrlFetchApp.fetch(EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
    const code = resp.getResponseCode();
    const body = resp.getContentText();
    if (code !== 200) throw new Error('HTTP ' + code + ' al leer equipo.json');
    if (body.trim().charAt(0) !== '{') throw new Error('respuesta no-JSON (¿URL redirige a HTML?): ' + body.slice(0, 60));
    return JSON.parse(body).team || [];
  } catch (e) { Logger.log('equipo.json: ' + e); return []; }
}

function noVotantes_(ss, fecha) {
  const voto = {};
  ss.getSheetByName('Equipo').getDataRange().getDisplayValues()
    .forEach((r, i) => { if (i && r[0] === fecha && r[1]) voto[r[1]] = true; });
  return equipo_().filter(p => !voto[p.nombre]).map(p => ({ nombre: p.nombre, email: p.email }));
}

function lider_(ss, fecha) {
  const c = {};
  ss.getSheetByName('Equipo').getDataRange().getDisplayValues().forEach((r, i) => {
    const e1 = String(r[2] || '').trim();
    if (i && r[0] === fecha && e1 && e1.toLowerCase() !== 'el que más se vote') c[e1] = (c[e1] || 0) + 1;
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
function cuerpo_(pendientes, fecha, esFinal, lider) {
  const faltan = pendientes.length && pendientes[0].nombre !== 'equipo'
    ? '<p style="margin:0 0 18px;font-size:13px;color:#5C5C5C;">Faltáis por votar: ' + listaNombres_(pendientes) + '.</p>'
    : '';
  const intro = esFinal
    ? 'En la <strong>próxima media hora</strong> se hace la reserva para el jueves <strong>' + fecha + '</strong>. Quien no vote ahora, se da por hecho que <strong>no está</strong> o que come de <strong>Taper / Glovo</strong>.'
    : 'Todavía falta vuestro voto para el <strong>jueves ' + fecha + '</strong>. Entrad y elegid: un restaurante, «el que más se vote», Taper / Glovo o No estoy.';
  const lin = lider
    ? '<p style="margin:0 0 18px;font-size:13px;color:#5C5C5C;">Ahora va ganando <strong style="color:#001391;">' + lider.nombre + '</strong> (' + lider.votos + (lider.votos === 1 ? ' voto' : ' votos') + ').</p>'
    : '';
  const btn = esFinal ? '#FFB56B' : '#88E783';
  return '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a;">'
    + '<div style="background:#001391;color:#fff;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Comidas RDR · BBVA × NFQ</div>'
    +   '<div style="font-size:22px;font-weight:bold;margin-top:4px;">' + (esFinal ? '⏰ Última llamada' : '🍽️ ¿Dónde comemos el jueves?') + '</div></div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;">'
    +   '<p style="margin:0 0 14px;font-size:15px;">Hola <strong>equipo</strong>,</p>'
    +   '<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">' + intro + '</p>' + faltan + lin
    +   '<a href="' + WEB_URL + '" style="display:inline-block;background:' + btn + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;">Votar ahora →</a>'
    +   '<p style="margin:18px 0 0;font-size:12px;color:#8a8a8a;">Si el botón no va: <a href="' + WEB_URL + '" style="color:#001391;">' + WEB_URL + '</a></p></div></div>';
}

// ── Prueba: envía SOLO a PRUEBA_TO el correo que saldría hoy ──────────────
function enviarRecordatorioPrueba() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const j = new Date();
  const isoDow = +Utilities.formatDate(j, tz, 'u');
  j.setDate(j.getDate() + ((4 - isoDow + 7) % 7 || 7)); // próximo jueves
  const fecha = Utilities.formatDate(j, tz, 'dd/MM/yyyy');
  const pendientes = noVotantes_(ss, fecha);
  enviarMail_(PRUEBA_TO, '[PRUEBA] 🍽️ ¿Dónde comemos el jueves ' + fecha + '?',
    cuerpo_(pendientes.length ? pendientes : [{ nombre: 'equipo' }], fecha, false, lider_(ss, fecha)));
  Logger.log('Prueba enviada a ' + PRUEBA_TO + ' (remitente: ' + (USAR_NOREPLY ? 'noreply@' : Session.getEffectiveUser().getEmail()) + ').');
}

// ── Diagnóstico: qué haría el próximo disparo, sin enviar nada ────────────
function diagnosticarComidas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const isoDow = +Utilities.formatDate(new Date(), tz, 'u');
  const fecha = proximoJueves_(tz, isoDow);
  const team = equipo_();
  const pendientes = noVotantes_(ss, fecha);
  Logger.log('Hoy: día ISO ' + isoDow + ' (1=Lun) · jueves de esta semana: ' + fecha);
  Logger.log('¿Jueves de oficina ("N" en Semana)?: ' + esOficina_(ss, fecha));
  Logger.log('equipo.json: ' + team.length + ' personas · sin email: ' + team.filter(p => !p.email).map(p => p.nombre).join(', '));
  Logger.log('Pendientes de votar (' + pendientes.length + '): ' + pendientes.map(p => p.nombre + ' <' + p.email + '>').join(', '));
  Logger.log('Se enviaría 1 correo (equipo en copia oculta) · remitente: '
    + (USAR_NOREPLY ? 'noreply@ (noReply:true)' : Session.getEffectiveUser().getEmail()));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* ── ¿Por qué no llega? ────────────────────────────────────────────────────
   Manda a UNA dirección (mejor de fuera: @nter.es o @nfq.mx) las dos variantes
   de remitente, con asuntos distintos. Lo que llegue -y lo que no- dice dónde
   está el bloqueo:
     · llegan las dos            → el problema era el envío masivo, ya resuelto
     · solo llega "[A] cuenta"   → poner USAR_NOREPLY = false (es el valor actual)
     · no llega ninguna          → lo para la pasarela de salida o el filtro del
       destinatario: mirar Consola de administración → Informes → Búsqueda del
       registro de correo, y la carpeta de spam de quien lo recibe. */
function probarEntrega(direccion) {
  const to = direccion || PRUEBA_TO;
  const yo = Session.getEffectiveUser().getEmail();
  const html = '<p style="font-family:Arial,sans-serif">Prueba de entrega de los recordatorios de Comidas RDR. '
    + 'Si recibes este correo, avisa indicando cuál de los dos te ha llegado.</p>';
  GmailApp.sendEmail(yo, '[A] Prueba comidas · desde la cuenta', 'Prueba A', { htmlBody: html, name: REMITE, bcc: to, replyTo: RESPONDER_A });
  GmailApp.sendEmail(yo, '[B] Prueba comidas · desde noreply', 'Prueba B', { htmlBody: html, name: REMITE, bcc: to, noReply: true });
  Logger.log('Enviadas 2 pruebas a ' + to + ' (en copia oculta, PARA=' + yo + '). Pregunta cuál ha llegado.');
}
