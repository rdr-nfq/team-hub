/* ===========================================================================
   Correo.gs · envío de correos común a todos los proyectos

   El MISMO fichero va en cada proyecto que manda correos (vacaciones/,
   comidas/…); comprobar.mjs avisa si las copias dejan de ser idénticas.
   Cuando se junten todos los Apps Script en un único proyecto, quedará uno.

   Qué hace:
     · Un correo INDIVIDUAL por destinatario (nadie ve a los demás y una
       dirección mala no tumba el envío del resto).
     · Si falla, reintenta esa dirección una vez; las que siguen fallando se
       devuelven en `fallidos` y quedan en el registro.
     · Remitente: el grupo de Google de CORREO_REMITENTE, si está dado de alta
       como «Enviar como» en la cuenta que ejecuta el script. Si no lo está,
       sale desde la propia cuenta, como hasta ahora (nunca se pierde un aviso
       por culpa del remitente).
     · Asunto con emojis bien codificados: con el grupo se envía por la API de
       Gmail (servicio avanzado «Gmail») con el asunto en UTF-8. GmailApp los
       rompe ("������") y MailApp no admite otro remitente.

   Puesta en marcha (una vez por proyecto):
     1. Gmail de la cuenta que ejecuta el script → Ver todos los ajustes →
        Cuentas → «Enviar correo como» → Añadir otra dirección: la del grupo,
        marcando «Tratar como alias». El código de verificación llega al grupo.
     2. Editor de Apps Script → Servicios (+) → Gmail API → Añadir
        (identificador «Gmail»).
     3. Ejecutar probarRemitente(): dice qué remitente se usa y manda una
        prueba con emojis a quien lo ejecuta.

   Nunca noReply: noreply@ no existe y Workspace no lo entrega a buzones del
   propio dominio.
   =========================================================================== */

// Grupo desde el que salen los correos. Vacío = desde la cuenta del script.
// La propiedad del script CORREO_REMITENTE, si existe, tiene prioridad.
const CORREO_REMITENTE = '';

let _CORREO_ALIAS = null; // alias verificados de la cuenta (una consulta por ejecución)

/** Dirección del grupo, o '' si no hay (o no es un alias verificado). */
function _correoRemitente() {
  let dir = '';
  try { dir = PropertiesService.getScriptProperties().getProperty('CORREO_REMITENTE') || ''; } catch (e) {}
  dir = String(dir || CORREO_REMITENTE || '').trim().toLowerCase();
  if (!dir) return '';
  if (_CORREO_ALIAS === null) {
    try { _CORREO_ALIAS = GmailApp.getAliases().map(function (a) { return String(a).toLowerCase(); }); }
    catch (e) { Logger.log('Correo: no se pudieron leer los alias (' + e + ')'); _CORREO_ALIAS = []; }
  }
  if (_CORREO_ALIAS.indexOf(dir) < 0) {
    Logger.log('Correo: ' + dir + ' no es un alias «Enviar como» de esta cuenta; sale desde la cuenta.');
    return '';
  }
  return dir;
}

/**
 * Envía el mismo correo a cada destinatario por separado.
 *   destinos: dirección, lista separada por comas o array
 *   o: { nombre, replyTo }
 * Devuelve { enviados: [...], fallidos: ['dir (error)', ...], remitente }.
 */
function _correoEnviar(destinos, asunto, texto, html, o) {
  o = o || {};
  const lista = [];
  [].concat(destinos || []).join(',').split(',').forEach(function (d) {
    d = String(d).trim();
    if (d && lista.map(function (x) { return x.toLowerCase(); }).indexOf(d.toLowerCase()) < 0) lista.push(d);
  });
  const desde = _correoRemitente();
  const r = { enviados: [], fallidos: [], remitente: desde || 'cuenta' };
  lista.forEach(function (to) {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        _correoUno(to, asunto, texto, html, o, desde);
        r.enviados.push(to);
        return;
      } catch (e) {
        if (intento === 2) { r.fallidos.push(to + ' (' + e + ')'); return; }
        Utilities.sleep(1500);
      }
    }
  });
  if (r.fallidos.length) Logger.log('Correo «' + asunto + '»: NO enviado a ' + r.fallidos.join(' | '));
  return r;
}

function _correoUno(to, asunto, texto, html, o, desde) {
  const nombre = o.nombre || '';
  if (!desde) {
    const m = { htmlBody: html, name: nombre };
    if (o.replyTo) m.replyTo = o.replyTo;
    return MailApp.sendEmail(to, asunto, texto, m);
  }
  if (typeof Gmail !== 'undefined') {
    const raw = Utilities.base64EncodeWebSafe(_correoMime(desde, to, asunto, texto, html, o), Utilities.Charset.UTF_8);
    return Gmail.Users.Messages.send({ raw: raw }, 'me');
  }
  // Sin el servicio avanzado: GmailApp sí admite `from`, pero rompe los
  // emojis de 4 bytes del asunto, así que se le quitan.
  const g = { htmlBody: html, name: nombre, from: desde };
  if (o.replyTo) g.replyTo = o.replyTo;
  return GmailApp.sendEmail(to, _correoSinEmojis(asunto), texto, g);
}

/** Mensaje MIME (texto + HTML) con cabeceras en UTF-8. */
function _correoMime(desde, to, asunto, texto, html, o) {
  const b = 'rdr_' + Utilities.getUuid().replace(/-/g, '');
  const cab = [
    'From: ' + (o.nombre ? _correoCabecera(o.nombre) + ' ' : '') + '<' + desde + '>',
    'To: ' + to,
    o.replyTo ? 'Reply-To: ' + o.replyTo : '',
    'Subject: ' + _correoCabecera(asunto),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + b + '"'
  ].filter(String);
  const parte = function (tipo, s) {
    return '--' + b + '\r\nContent-Type: ' + tipo + '; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'
      + Utilities.base64Encode(String(s || ''), Utilities.Charset.UTF_8).replace(/.{76}/g, '$&\r\n') + '\r\n';
  };
  return cab.join('\r\n') + '\r\n\r\n' + parte('text/plain', texto) + parte('text/html', html) + '--' + b + '--';
}

/** Texto de cabecera como «encoded-words» UTF-8 (≤ 45 bytes cada uno). */
function _correoCabecera(s) {
  const trozos = [];
  let act = '', bytes = 0;
  Array.from(String(s)).forEach(function (ch) {
    const c = ch.codePointAt(0);
    const n = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (bytes + n > 45) { trozos.push(act); act = ''; bytes = 0; }
    act += ch; bytes += n;
  });
  if (act) trozos.push(act);
  return trozos.map(function (t) { return '=?UTF-8?B?' + Utilities.base64Encode(t, Utilities.Charset.UTF_8) + '?='; }).join('\r\n ');
}

function _correoSinEmojis(s) {
  return String(s).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]️?/g, '').replace(/\s{2,}/g, ' ').trim();
}

/* EJECUTAR A MANO: qué remitente se usará y prueba con emojis a quien lo ejecuta. */
function probarRemitente() {
  const yo = Session.getActiveUser().getEmail();
  let alias = [];
  try { alias = GmailApp.getAliases(); } catch (e) { Logger.log('No se pudieron leer los alias: ' + e); }
  Logger.log('Alias «Enviar como» de la cuenta: ' + (alias.join(', ') || 'ninguno'));
  const desde = _correoRemitente();
  Logger.log('Remitente: ' + (desde || 'la propia cuenta (' + yo + ')')
    + (desde ? ' · vía ' + (typeof Gmail !== 'undefined' ? 'API de Gmail (asunto con emojis)' : 'GmailApp (asunto SIN emojis: añade el servicio Gmail API)') : ''));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
  if (!yo) { Logger.log('No se sabe quién ejecuta: no se manda la prueba.'); return; }
  const r = _correoEnviar(yo, '🧪 Prueba de remitente · 🍽️🌴✅', 'Prueba de envío desde ' + (desde || yo) + '.',
    '<p style="font-family:Arial,sans-serif">🧪 Prueba de envío desde <b>' + (desde || yo) + '</b>. Si el asunto lleva emojis bien, está todo listo.</p>',
    { nombre: 'Prueba RDR' });
  Logger.log(r.enviados.length ? 'Prueba enviada a ' + yo + '. Mira el remitente y el asunto.' : 'La prueba falló: ' + r.fallidos.join(' | '));
}
