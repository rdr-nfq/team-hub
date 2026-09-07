/* ===========================================================================
   Comidas RDR · Recordatorios por email (Apps Script)
   Avisa a quien AÚN NO ha votado, con el enlace a la web.
   Horario (solo si ese jueves es de oficina, 'N' en la pestaña "Semana"):
     · Lun 12 y 17 · Mar 12 y 17
     · Mié 12 → aviso final: la reserva se hace en 30 min; quien no vote se
                asume "No estoy" o "Taper / Glovo".

   UN SOLO CORREO para todos los pendientes, no uno por persona.
   Sale desde noreply@ con los destinatarios en el PARA, igual que los avisos
   de Pases Calendados (ver MODO_ENVIO más abajo).

   Puesta en marcha: ejecutar crearTriggers() una vez.
   Prueba:      enviarRecordatorioPrueba()  → envía a PRUEBA_TO.
   Diagnóstico: diagnosticarComidas()       → qué vería el próximo disparo.
   Entrega:     probarEntrega('x@nfq.es')   → manda todas las variantes de
                envío a esa dirección para ver cuál llega.
   Remitente:   diagnosticarRemitente()      → qué remitentes puede usar.
   Rebotes:     revisarRebotes()             → avisos de no entrega recientes.
   =========================================================================== */

const WEB_URL   = 'https://rdr-nfq.github.io/team-hub/comidas/'; // enlace del botón del correo
const REMITE    = 'Comidas RDR';
const PRUEBA_TO = 'pablo.llorente@nfq.es';

/* ── Modo de envío ─────────────────────────────────────────────────────────
   La llamada de aquí es EXACTAMENTE la misma que la de los avisos de pases
   (Avisos_Pases.gs:214): GmailApp.sendEmail(dest, asunto, texto plano,
   { htmlBody, name, noReply:true }). Mismo código, mismo proyecto de Apps
   Script, misma cuenta. Lo único que cambia es a QUIÉN se envía:

     Pases   → desarrollos.nfq.rdr.group@bbva.com   (dominio de FUERA)   llega
     Comidas → compañeros de nfq.es / nter.es       (dominio PROPIO)  NO llega

   Y en la misma ejecución de probarEntrega, el correo enviado desde la cuenta
   sí llegó a ese mismo compañero. O sea: no es la cuenta, no es el código y no
   es el destinatario — es la combinación "remitente noreply@nfq.es + buzón del
   propio dominio". Es lo que hace Google Workspace con un remitente interno
   que NO existe en el directorio: a un destino externo (bbva.com) el mensaje
   sale firmado y se acepta; hacia buzones del propio dominio, la protección
   antisuplantación lo retiene. Quien envía se ve su propio correo siempre,
   por eso parecía que salía bien.

   Se arregla en la Consola de administración, no aquí (ver COMO_ARREGLAR_NOREPLY
   al final del fichero). Mientras tanto:

     MODO_ENVIO = 'noreply-para' → como los pases: noreply@ y todos en el PARA.
                  'noreply-bcc'  → noreply@ con el equipo en copia oculta.
                  'alias'        → desde ALIAS_REMITENTE (p. ej. comidas@nfq.es):
                                   un remitente "de buzón" que sí existe, así que
                                   no lo para la protección antisuplantación.
                                   Requiere que sea alias verificado de la cuenta.
                  'cuenta-bcc'   → desde la cuenta, en copia oculta. Es la única
                                   variante confirmada que llega hoy a todos. */
const MODO_ENVIO = 'noreply-para';

// Para MODO_ENVIO = 'alias': dirección que debe aparecer como remitente. Tiene
// que ser un alias verificado de la cuenta (Gmail → Ver todos los ajustes →
// Cuentas → Enviar como) o un grupo con permiso de envío. diagnosticarRemitente()
// lista los que hay disponibles.
const ALIAS_REMITENTE = 'comidas@nfq.es';

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
//    UN solo correo para todos los pendientes, con el patrón de MODO_ENVIO.
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

/** Envía UN correo al grupo, con el patrón que indique MODO_ENVIO. Si falla
 *  (una dirección que ya no existe puede tumbar el mensaje entero), reintenta
 *  uno a uno: así lo recibe todo el mundo menos quien tenga la dirección mala,
 *  que queda anotada en el registro. */
function enviarGrupo_(emails, subject, htmlBody) {
  if (!emails.length) return { enviados: 0, fallidos: [] };
  const yo = Session.getEffectiveUser().getEmail();
  const texto = quitarTags_(htmlBody);
  // 'noreply-para' y 'alias': destinatarios en el PARA, como los avisos de pases.
  // Los modos '-bcc' mandan a la propia cuenta y ponen al equipo en copia oculta.
  const enPara = MODO_ENVIO === 'noreply-para' || MODO_ENVIO === 'alias';
  const enviar = (destinos) => {
    const o = { htmlBody: htmlBody, name: REMITE };
    if (MODO_ENVIO === 'alias') { o.from = ALIAS_REMITENTE; o.replyTo = RESPONDER_A; }
    else if (MODO_ENVIO === 'cuenta-bcc') o.replyTo = RESPONDER_A;
    else o.noReply = true;
    if (enPara) return GmailApp.sendEmail(destinos.join(','), subject, texto, o);
    o.bcc = destinos.join(',');
    return GmailApp.sendEmail(yo, subject, texto, o);
  };
  try {
    enviar(emails);
    return { enviados: emails.length, fallidos: [] };
  } catch (e) {
    Logger.log('Envío conjunto fallido (' + e + '). Se reintenta dirección a dirección.');
    const fallidos = [];
    let ok = 0;
    emails.forEach(em => {
      try { enviar([em]); ok++; }
      catch (e2) { fallidos.push(em + ' (' + e2 + ')'); }
    });
    return { enviados: ok, fallidos: fallidos };
  }
}

/** Envía el recordatorio a todos los pendientes. */
function enviarMail_(destinatarios, subject, htmlBody) {
  const lista = [].concat(destinatarios).filter(Boolean);
  const r = enviarGrupo_(lista, subject, htmlBody);
  Logger.log('Enviado (' + MODO_ENVIO + '): ' + r.enviados + ' destinatarios'
    + (r.fallidos.length ? ' · DIRECCIONES QUE FALLAN: ' + r.fallidos.join(' | ') : ''));
  return r;
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
  Logger.log('Prueba enviada a ' + PRUEBA_TO + ' (modo ' + MODO_ENVIO + ').');
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
  const yo = Session.getEffectiveUser().getEmail();
  const remitente = MODO_ENVIO === 'cuenta-bcc' ? yo
    : MODO_ENVIO === 'alias' ? ALIAS_REMITENTE
    : 'noreply@' + (yo.split('@')[1] || '?');
  Logger.log('Modo de envío: ' + MODO_ENVIO + ' · remitente: ' + remitente
    + ' · destinatarios en ' + (MODO_ENVIO === 'noreply-bcc' || MODO_ENVIO === 'cuenta-bcc' ? 'copia oculta' : 'el PARA'));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* ── ¿Por qué no llega? ────────────────────────────────────────────────────
   Manda a UNA dirección las variantes de envío, cada una con su asunto y su
   resultado en el registro (si alguna lanza error, se ve aquí en vez de
   quedarse el resto sin enviar):
     [A] desde la cuenta, en copia oculta
     [B] desde noreply@, en copia oculta
     [C] desde noreply@, en el PARA — la MISMA llamada que Avisos_Pases.gs:214
     [D] desde ALIAS_REMITENTE, si es un alias verificado de la cuenta
   Pregunta cuáles han llegado, mirando también en spam. */
function probarEntrega(direccion) {
  const to = direccion || PRUEBA_TO;
  const yo = Session.getEffectiveUser().getEmail();
  const html = '<p style="font-family:Arial,sans-serif">Prueba de entrega de los recordatorios de Comidas RDR. '
    + 'Si recibes este correo, avisa indicando cuál de las variantes te ha llegado (mira también en spam).</p>';
  const texto = quitarTags_(html);
  const intento = (etiqueta, fn) => {
    try { fn(); Logger.log(etiqueta + ': enviado sin error'); }
    catch (e) { Logger.log(etiqueta + ': ERROR → ' + e); }
  };
  intento('[A] desde la cuenta, copia oculta', () =>
    GmailApp.sendEmail(yo, '[A] Prueba comidas · desde la cuenta', texto, { htmlBody: html, name: REMITE, bcc: to, replyTo: RESPONDER_A }));
  intento('[B] desde noreply, copia oculta', () =>
    GmailApp.sendEmail(yo, '[B] Prueba comidas · desde noreply', texto, { htmlBody: html, name: REMITE, bcc: to, noReply: true }));
  intento('[C] desde noreply, en el PARA (igual que Pases)', () =>
    GmailApp.sendEmail(to, '[C] Prueba comidas · noreply directo', texto, { htmlBody: html, name: REMITE, noReply: true }));
  if (GmailApp.getAliases().indexOf(ALIAS_REMITENTE) >= 0) {
    intento('[D] desde el alias ' + ALIAS_REMITENTE, () =>
      GmailApp.sendEmail(to, '[D] Prueba comidas · desde ' + ALIAS_REMITENTE, texto, { htmlBody: html, name: REMITE, from: ALIAS_REMITENTE, replyTo: RESPONDER_A }));
  } else {
    Logger.log('[D] omitida: ' + ALIAS_REMITENTE + ' no es alias de ' + yo + ' (ver diagnosticarRemitente).');
  }
  Logger.log('Pruebas mandadas a ' + to + '. Pregunta cuáles han llegado, incluida la carpeta de spam.');
}

/** Qué remitentes puede usar de verdad este script. */
function diagnosticarRemitente() {
  const yo = Session.getEffectiveUser().getEmail();
  const alias = GmailApp.getAliases();
  Logger.log('Cuenta que ejecuta el script: ' + yo);
  Logger.log('Con noReply:true el remitente sería: noreply@' + (yo.split('@')[1] || '?'));
  Logger.log('Alias verificados disponibles (' + alias.length + '): ' + (alias.join(', ') || 'ninguno'));
  Logger.log('¿' + ALIAS_REMITENTE + ' utilizable como remitente?: ' + (alias.indexOf(ALIAS_REMITENTE) >= 0));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/** ¿Rebotó algo? Busca avisos de no entrega recientes en el buzón de quien
 *  envía. Si Google RECHAZA los correos de noreply@ aparecen aquí con el
 *  motivo; si no hay nada, es que los está reteniendo en cuarentena y hay que
 *  mirarlo en la Consola de administración. */
function revisarRebotes() {
  const hilos = GmailApp.search('newer_than:2d (from:mailer-daemon OR from:postmaster OR subject:("Undelivered" OR "Delivery Status" OR "no se ha entregado" OR "Devolución"))', 0, 20);
  Logger.log('Avisos de no entrega en las últimas 48 h: ' + hilos.length);
  hilos.forEach(h => {
    const m = h.getMessages()[0];
    Logger.log('· ' + Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), 'dd/MM HH:mm')
      + ' · ' + h.getFirstMessageSubject() + '\n   ' + m.getPlainBody().slice(0, 300).replace(/\s+/g, ' '));
  });
}

/* ── COMO_ARREGLAR_NOREPLY ─────────────────────────────────────────────────
   Para que noreply@nfq.es entregue TAMBIÉN dentro del propio dominio, hay que
   tocar la Consola de administración de Google Workspace (admin.google.com).
   Cualquiera de estas tres vale; la primera es la más limpia:

   1. Crear el buzón. Directorio → Usuarios (o Grupos) → dar de alta
      noreply@nfq.es. Al existir en el directorio, deja de ser un remitente
      interno "inventado" y la protección antisuplantación no lo retiene.

   2. Permitirlo explícitamente. Aplicaciones → Google Workspace → Gmail →
      Seguridad → "Suplantación de identidad y autenticación": en la protección
      contra suplantación del propio dominio, añadir noreply@nfq.es como
      remitente permitido (o meterlo en una lista de direcciones permitidas
      en Gmail → Configuración de spam).

   3. Comprobar qué está pasando de verdad. Informes → Búsqueda del registro
      de correo: buscar los envíos de noreply@nfq.es. Ahí se ve, mensaje a
      mensaje, si se entregó, si está en cuarentena o si se rechazó y por qué.
      Esto es lo que conviene enseñarle a IT.

   Mientras no esté hecho, MODO_ENVIO = 'cuenta-bcc' es lo único que llega a
   todo el equipo, y 'alias' es la alternativa si se crea comidas@nfq.es. */
