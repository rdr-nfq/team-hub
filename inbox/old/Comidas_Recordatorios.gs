/* ===========================================================================
   Comidas RDR · Recordatorios por email (Apps Script)
   Avisa a quien AÚN NO ha votado, con el enlace a la web.
   Horario (solo si ese jueves es de oficina, 'N' en la pestaña "Semana"):
     · Lun 12 y 17 · Mar 12 y 17
     · Mié 12 → aviso final: la reserva se hace en 30 min; quien no vote se
                asume "No estoy" o "Taper / Glovo".

   UN SOLO CORREO para todos los pendientes, con ellos en COPIA OCULTA y la
   cuenta que envía en el PARA. Es el patrón que mejor entrega: 20 correos de
   golpe (o uno con 20 direcciones en el PARA) tienen pinta de envío masivo y
   los filtran. Con BCC, además, nadie ve la lista de direcciones.
   Sale desde noreply@, salvo los dominios que lo filtran (ver más abajo).

   Puesta en marcha: ejecutar crearTriggers() una vez.
   Prueba:      enviarRecordatorioPrueba()  → envía a PRUEBA_TO.
   Diagnóstico: diagnosticarComidas()       → qué vería el próximo disparo.
   Entrega:     probarEntrega('x@nter.es')  → manda las TRES variantes de
                envío a esa dirección para ver cuál llega.
   =========================================================================== */

const WEB_URL   = 'https://rdr-nfq.github.io/team-hub/comidas/'; // enlace del botón del correo
const REMITE    = 'Comidas RDR';
const PRUEBA_TO = 'pablo.llorente@nfq.es';

/* ── Remitente ─────────────────────────────────────────────────────────────
   Se envía desde noreply@<dominio> (noReply:true), igual que los avisos de
   Pases Calendados, que salen a desarrollos.nfq.rdr.group@bbva.com y llegan
   sin problema: noreply@nfq.es SÍ sale del dominio.

   Lo comprobado con probarEntrega(): a nfq.es y a bbva.com llega; a nter.es
   NO llega el correo de noreply@ (lo filtra el servidor de destino), pero sí
   el que sale desde la cuenta. Por eso:

     MODO_REMITENTE = 'auto'    → noreply@ para todos MENOS los dominios de
                                  DOMINIOS_SIN_NOREPLY, que lo reciben desde
                                  la cuenta que ejecuta el script.
                      'noreply' → todo desde noreply@ (los de esos dominios no
                                  lo recibirán mientras su filtro no lo deje).
                      'cuenta'  → todo desde la cuenta.

   Para mandarlo TODO desde noreply@: que IT de nter.es permita
   noreply@nfq.es (o que quien lo reciba lo saque de spam y cree la regla).
   En cuanto esté, se quita 'nter.es' de la lista de abajo. */
const MODO_REMITENTE = 'auto';
const DOMINIOS_SIN_NOREPLY = ['nter.es'];

// Responder al correo escribe a esta dirección (con noreply@ no hay a quién).
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
//    UN correo por grupo de remitente: la cuenta que envía en el PARA y el
//    equipo en COPIA OCULTA (un solo destinatario visible entrega mejor que
//    20 direcciones en el PARA, y nadie ve la lista).
//    El texto plano es el HTML sin etiquetas, como en los avisos de pases: un
//    cuerpo de texto de verdad puntúa mejor en los filtros que una sola línea.

/** Cuerpo en texto plano a partir del HTML (mismo criterio que Avisos_Pases). */
function quitarTags_(html) {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const dominio_ = (email) => String(email || '').split('@')[1] || '';

/** ¿Este destinatario recibe bien el correo de noreply@? */
function aceptaNoreply_(email) {
  if (MODO_REMITENTE === 'noreply') return true;
  if (MODO_REMITENTE === 'cuenta') return false;
  return DOMINIOS_SIN_NOREPLY.indexOf(dominio_(email).toLowerCase()) < 0;
}

/** Envía a un grupo en copia oculta. Si el envío conjunto falla (una dirección
 *  que ya no existe puede tumbar el mensaje entero), reintenta uno a uno: así
 *  lo recibe todo el mundo menos quien tenga la dirección mala, que queda
 *  anotada en el registro. */
function enviarGrupo_(emails, subject, htmlBody, conNoreply) {
  if (!emails.length) return { enviados: 0, fallidos: [] };
  const yo = Session.getEffectiveUser().getEmail();
  const texto = quitarTags_(htmlBody);
  const opciones = (bcc) => {
    const o = { htmlBody: htmlBody, name: REMITE, bcc: bcc };
    if (conNoreply) o.noReply = true;
    else o.replyTo = RESPONDER_A;
    return o;
  };
  try {
    GmailApp.sendEmail(yo, subject, texto, opciones(emails.join(',')));
    return { enviados: emails.length, fallidos: [] };
  } catch (e) {
    Logger.log('Envío conjunto fallido (' + e + '). Se reintenta dirección a dirección.');
    const fallidos = [];
    let ok = 0;
    emails.forEach(em => {
      try { GmailApp.sendEmail(yo, subject, texto, opciones(em)); ok++; }
      catch (e2) { fallidos.push(em + ' (' + e2 + ')'); }
    });
    return { enviados: ok, fallidos: fallidos };
  }
}

/** Reparte los destinatarios según quién acepta noreply@ y envía cada grupo. */
function enviarMail_(destinatarios, subject, htmlBody) {
  const lista = [].concat(destinatarios).filter(Boolean);
  const conNoreply = lista.filter(aceptaNoreply_);
  const desdeCuenta = lista.filter(e => !aceptaNoreply_(e));
  const r1 = enviarGrupo_(conNoreply, subject, htmlBody, true);
  const r2 = enviarGrupo_(desdeCuenta, subject, htmlBody, false);
  const fallidos = r1.fallidos.concat(r2.fallidos);
  Logger.log('Enviado · desde noreply@: ' + r1.enviados + ' · desde la cuenta: ' + r2.enviados
    + (fallidos.length ? ' · DIRECCIONES QUE FALLAN: ' + fallidos.join(' | ') : ''));
  return { noreply: r1.enviados, cuenta: r2.enviados, fallidos: fallidos };
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
    // Se saltan quienes estén marcados como baja: una dirección que ya no
    // existe hace rebotar el correo (y puede tumbar el envío conjunto).
    return (JSON.parse(body).team || []).filter(p => p && p.email && p.activo !== false && p.baja !== true);
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
  Logger.log('Prueba enviada a ' + PRUEBA_TO + ' (remitente: ' + (aceptaNoreply_(PRUEBA_TO) ? 'noreply@' : Session.getEffectiveUser().getEmail()) + ').');
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
  const emails = pendientes.map(p => p.email).filter(Boolean);
  Logger.log('Modo de remitente: ' + MODO_REMITENTE + ' · dominios sin noreply: ' + DOMINIOS_SIN_NOREPLY.join(', '));
  Logger.log('Desde noreply@ (' + emails.filter(aceptaNoreply_).length + '): ' + emails.filter(aceptaNoreply_).join(', '));
  Logger.log('Desde ' + Session.getEffectiveUser().getEmail() + ' (' + emails.filter(e => !aceptaNoreply_(e)).length + '): '
    + emails.filter(e => !aceptaNoreply_(e)).join(', '));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* ── ¿Por qué no llega? ────────────────────────────────────────────────────
   Manda a UNA dirección (mejor de fuera) las tres variantes, con asuntos
   distintos, para ver exactamente qué filtra su servidor:
     [A] desde la cuenta, en copia oculta
     [B] desde noreply@, en copia oculta
     [C] desde noreply@, en el PARA y con texto plano completo — EXACTAMENTE
         como los avisos de Pases Calendados, que sí llegan a bbva.com
   Que llegue [A] y no [B] ni [C] significa que ese destino filtra a
   noreply@nfq.es: hay que sacarlo de spam y permitirlo en su servidor, o
   dejar su dominio en DOMINIOS_SIN_NOREPLY. Mirar SIEMPRE la carpeta de spam
   antes de dar un correo por no entregado. */
function probarEntrega(direccion) {
  const to = direccion || PRUEBA_TO;
  const yo = Session.getEffectiveUser().getEmail();
  const html = '<p style="font-family:Arial,sans-serif">Prueba de entrega de los recordatorios de Comidas RDR. '
    + 'Si recibes este correo, avisa indicando cuál de los tres te ha llegado (mira también en spam).</p>';
  const texto = quitarTags_(html);
  GmailApp.sendEmail(yo, '[A] Prueba comidas · desde la cuenta', texto, { htmlBody: html, name: REMITE, bcc: to, replyTo: RESPONDER_A });
  GmailApp.sendEmail(yo, '[B] Prueba comidas · desde noreply', texto, { htmlBody: html, name: REMITE, bcc: to, noReply: true });
  GmailApp.sendEmail(to, '[C] Prueba comidas · noreply directo (como Pases)', texto, { htmlBody: html, name: REMITE, noReply: true });
  Logger.log('Enviadas 3 pruebas a ' + to + '. Pregunta cuáles han llegado (incluida la carpeta de spam).');
}
