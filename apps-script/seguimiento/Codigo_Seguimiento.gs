/**
 * ============================================================================
 *  SEGUIMIENTO RDR  ·  Apps Script (backend de la página /seguimiento)
 * ============================================================================
 *
 *  Guarda en Drive la presentación de seguimiento que genera la web:
 *
 *    Presentación seguimiento BBVA/            (CARPETA_RAIZ_ID)
 *      2026/
 *        9. Septiembre/
 *          Seguimiento RDR - 28/09/26 - Autogenerado.pptx
 *
 *  - Las carpetas de año y mes se crean si no existen ("10. Octubre"…).
 *  - Si el fichero de esa reunión YA existe, se sobrescribe su contenido
 *    (mismo fichero, mismo enlace; Drive conserva la versión anterior en
 *    "Gestionar versiones"). Si no existe, se crea.
 *  - El nombre lo pone SIEMPRE el servidor a partir de la fecha: los .pptx
 *    hechos a mano ("28/09/2026 Seguimiento_RDR_GLOBAL_2026.pptx") nunca se
 *    tocan.
 *  - Solo pueden subir coordinadores (equipo.json, "coordinador": true).
 *
 *  DESPLIEGUE (proyecto Apps Script INDEPENDIENTE):
 *   1. script.google.com -> Nuevo proyecto -> pegar este fichero entero.
 *   2. Ejecutar una vez `autorizar` (Drive + UrlFetch) y aceptar permisos.
 *      La cuenta que despliega debe poder editar la carpeta raíz.
 *   3. Implementar -> Nueva implementación -> Aplicación web:
 *        - Ejecutar como: YO.   - Quién tiene acceso: Cualquier persona.
 *      En cada cambio: Gestionar implementaciones -> editar -> "Nueva versión".
 *   4. Pegar la URL /exec en links.json -> "seguimientoBackend".
 *
 *  API (GET query o POST text/plain JSON) — respuesta { ok, data | error }:
 *    ping                              -> { carpeta }
 *    estado  { fecha:'2026-09-28' }    -> { existe, nombre, ruta, url?, modificado?, carpetaUrl? }
 *    subir   { fecha, email, base64 }  -> { accion:'creada'|'actualizada', nombre, ruta, url, carpetaUrl, modificado }
 * ============================================================================
 */

var S_CONFIG = {
  CARPETA_RAIZ_ID: '15ZGCSuSX4O3IBF-DjdqFVx1CZ2JKGGbZ',
  EQUIPO_JSON_URL: 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json',
  MIME_PPTX: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  MAX_BYTES: 40 * 1024 * 1024
};

var MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* EJECUTAR UNA VEZ A MANO tras pegar código nuevo: pide todos los permisos
   (Drive, API de Drive vía UrlFetch y lectura de equipo.json). */
function autorizar() {
  DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID).getName();
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  UrlFetchApp.fetch(S_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true });
  Logger.log('Permisos concedidos: todo listo.');
}

function doGet(e) { return _serve((e && e.parameter) || {}); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
  var q = (e && e.parameter) || {};
  for (var k in q) if (p[k] === undefined) p[k] = q[k];
  return _serve(p);
}

function _serve(p) {
  try {
    var data;
    switch (p.action) {
      case 'ping': data = { carpeta: DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID).getName() }; break;
      case 'estado': data = estado(p.fecha); break;
      case 'subir':
        _exigirCoordinador(p.email);
        data = subir(p.fecha, p.base64);
        break;
      default: throw new Error('Acción desconocida: ' + p.action);
    }
    return _json({ ok: true, data: data });
  } catch (err) {
    console.error(err);
    return _json({ ok: false, error: String((err && err.message) || err) });
  }
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Fecha, nombre y ruta ────────────────────────────────────────────────────
function _fecha(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) throw new Error('Fecha de reunión no válida: "' + iso + '" (se espera AAAA-MM-DD).');
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}
function _n2(n) { return (n < 10 ? '0' : '') + n; }

/** Mismo formato que nombreFichero() de components/seguimiento/modelo.js. */
function _nombre(f) {
  return 'Seguimiento RDR - ' + _n2(f.dia) + '/' + _n2(f.mes) + '/' + String(f.anio).slice(2) + ' - Autogenerado.pptx';
}
function _ruta(f) { return [String(f.anio), f.mes + '. ' + MESES_ES[f.mes - 1]]; }

/** Carpeta de año/mes bajo la raíz. crear=false -> null si falta alguna. */
function _carpetaMes(f, crear) {
  var raiz = DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID);
  var ruta = _ruta(f);
  var anio = _hija(raiz, function (n) { return n === ruta[0]; });
  if (!anio) { if (!crear) return null; anio = raiz.createFolder(ruta[0]); }
  // Tolerante con "9. Septiembre", "09. Septiembre" o "9.Septiembre".
  var re = new RegExp('^0?' + f.mes + '\\s*\\.');
  var mes = _hija(anio, function (n) { return re.test(n); });
  if (!mes) { if (!crear) return null; mes = anio.createFolder(ruta[1]); }
  return mes;
}
function _hija(padre, ok) {
  var it = padre.getFolders();
  while (it.hasNext()) {
    var c = it.next();
    if (ok(String(c.getName()).trim())) return c;
  }
  return null;
}

/** El .pptx autogenerado de esa reunión (el modificado más reciente si hay varios). */
function _fichero(carpeta, nombre) {
  var it = carpeta.getFilesByName(nombre), mejor = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (!mejor || f.getLastUpdated() > mejor.getLastUpdated()) mejor = f;
  }
  return mejor;
}

// ── Acciones ────────────────────────────────────────────────────────────────
function estado(fechaIso) {
  var f = _fecha(fechaIso);
  var out = { existe: false, nombre: _nombre(f), ruta: _ruta(f).join('/') };
  var carpeta = _carpetaMes(f, false);
  if (!carpeta) return out;
  out.carpetaUrl = carpeta.getUrl();
  var fich = _fichero(carpeta, out.nombre);
  if (fich) {
    out.existe = true;
    out.url = fich.getUrl();
    out.modificado = fich.getLastUpdated().toISOString();
  }
  return out;
}

function subir(fechaIso, base64) {
  var f = _fecha(fechaIso);
  var b64 = String(base64 || '').replace(/^data:[^,]*,/, '');
  if (!b64) throw new Error('No llega la presentación.');
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > S_CONFIG.MAX_BYTES) throw new Error('La presentación pesa demasiado (' + Math.round(bytes.length / 1048576) + ' MB).');
  // Un .pptx es un ZIP: empieza por "PK".
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error('El fichero recibido no es un .pptx válido.');

  var nombre = _nombre(f);
  var blob = Utilities.newBlob(bytes, S_CONFIG.MIME_PPTX, nombre);

  // Bloqueo: dos clics seguidos no deben crear dos ficheros iguales.
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var carpeta = _carpetaMes(f, true);
    var fich = _fichero(carpeta, nombre);
    var accion;
    if (fich) {
      _sobrescribir(fich.getId(), bytes);
      fich = DriveApp.getFileById(fich.getId());
      accion = 'actualizada';
    } else {
      fich = carpeta.createFile(blob);
      accion = 'creada';
    }
    return {
      accion: accion,
      nombre: nombre,
      ruta: _ruta(f).join('/'),
      url: fich.getUrl(),
      carpetaUrl: carpeta.getUrl(),
      modificado: fich.getLastUpdated().toISOString()
    };
  } finally {
    lock.releaseLock();
  }
}

/* DriveApp no puede reemplazar el contenido binario de un fichero: se usa
   la API de Drive (upload media). Mismo id y enlace; Drive guarda la versión
   anterior en el historial. */
function _sobrescribir(fileId, bytes) {
  var res = UrlFetchApp.fetch(
    'https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&supportsAllDrives=true&fields=id',
    {
      method: 'patch',
      contentType: S_CONFIG.MIME_PPTX,
      payload: bytes,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }
  );
  var code = res.getResponseCode();
  if (code >= 300) {
    var msg = res.getContentText().slice(0, 200);
    try { msg = JSON.parse(res.getContentText()).error.message || msg; } catch (_) {}
    throw new Error('Drive (actualizar ' + code + '): ' + msg);
  }
}

// ── Permisos: solo coordinación ─────────────────────────────────────────────
function _exigirCoordinador(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) throw new Error('Falta el email de quien sube la presentación.');
  var resp = UrlFetchApp.fetch(S_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
  var team = (JSON.parse(resp.getContentText()).team || []);
  var ok = team.some(function (m) {
    return m && m.coordinador === true &&
      [m.email, m.emailBBVA].some(function (x) { return String(x || '').trim().toLowerCase() === e; });
  });
  if (!ok) throw new Error('Solo coordinación puede guardar la presentación en Drive (' + e + ').');
}
