/**
 * ============================================================================
 *  SEGUIMIENTO RDR  ·  Apps Script (backend de la página /seguimiento)
 * ============================================================================
 *
 *  1) DATOS de la web, UNA PESTAÑA POR COORDINADOR (equipo.json,
 *     "coordinador": true) + la configuración de la presentación combinada.
 *     Cada pestaña es un JSON en <raíz>/_datos_web/seguimiento_<id>.json con
 *     un número de revisión: si dos personas editan la misma pestaña, la
 *     segunda en guardar recibe CONFLICTO en vez de pisar a la primera.
 *
 *  2) PRESENTACIONES que genera la web:
 *
 *    Presentación seguimiento BBVA/            (CARPETA_RAIZ_ID)
 *      _datos_web/                             (datos de las pestañas)
 *      2026/
 *        9. Septiembre/
 *          Seguimiento RDR - 28/09/26 - Autogenerado.pptx                  (combinada)
 *          Seguimiento RDR - 28/09/26 - Ángela Montero - Autogenerado.pptx (de una pestaña)
 *
 *  - Las carpetas de año y mes se crean si no existen ("10. Octubre"…).
 *  - Si el fichero de esa reunión YA existe, se sobrescribe su contenido
 *    (mismo fichero, mismo enlace; Drive conserva la versión anterior en
 *    "Gestionar versiones"). Si no existe, se crea.
 *  - El nombre lo pone SIEMPRE el servidor a partir de la fecha: los .pptx
 *    hechos a mano ("28/09/2026 Seguimiento_RDR_GLOBAL_2026.pptx") nunca se
 *    tocan.
 *  - Solo coordinación (equipo.json, "coordinador": true) lee los datos,
 *    guarda pestañas y sube presentaciones. Cualquier coordinador puede
 *    editar cualquier pestaña (p. ej. para cubrir a otro).
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
 *    ping                                    -> { carpeta }
 *    datos   { email }                       -> { coordinadores:[{id,nombre,email}],
 *                                                 pestanas:{ <id>|'resumen': { doc, rev, actualizado, por } } }
 *    guardar { email, id, doc, rev, forzar? } -> { rev, actualizado, por }
 *                                               (rev = la que se leyó; si ha cambiado: error "CONFLICTO: …")
 *    estado  { fecha:'2026-09-28', quien? }  -> { existe, nombre, ruta, url?, modificado?, carpetaUrl? }
 *    subir   { fecha, email, base64, quien? } -> { accion:'creada'|'actualizada', nombre, ruta, url, carpetaUrl, modificado }
 *            quien = id del coordinador (su presentación) o vacío (la combinada).
 *            Con la combinada, borrar:[{ quien, fecha }] -> las presentaciones
 *            independientes que incluye van a la papelera (+ borradas:[nombres]).
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
      case 'estado': data = estado(p.fecha, _quien(p.quien)); break;
      case 'subir':
        _exigirCoordinador(p.email);
        data = subir(p.fecha, p.base64, _quien(p.quien));
        // Al combinar, las independientes que entran en la combinada sobran.
        if (!p.quien && Array.isArray(p.borrar)) data.borradas = borrarIndependientes(p.borrar);
        break;
      case 'datos':
        _exigirCoordinador(p.email);
        data = datos();
        break;
      case 'guardar':
        data = guardar(p.id, p.doc, p.rev, _exigirCoordinador(p.email), p.forzar === true);
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

/** Mismo formato que nombreFichero() de components/seguimiento/modelo.js.
 *  quien = nombre del coordinador (presentación de su pestaña) o '' (combinada). */
function _nombre(f, quien) {
  return 'Seguimiento RDR - ' + _n2(f.dia) + '/' + _n2(f.mes) + '/' + String(f.anio).slice(2) +
    (quien ? ' - ' + quien : '') + ' - Autogenerado.pptx';
}
/** id de coordinador -> su nombre (para el fichero); '' = combinada. */
function _quien(id) {
  id = String(id || '').trim();
  if (!id) return '';
  var c = _coordinadores().filter(function (m) { return m.id === id; })[0];
  if (!c) throw new Error('Coordinador desconocido: ' + id);
  return c.nombre;
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
function estado(fechaIso, quien) {
  var f = _fecha(fechaIso);
  var out = { existe: false, nombre: _nombre(f, quien), ruta: _ruta(f).join('/') };
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

function subir(fechaIso, base64, quien) {
  var f = _fecha(fechaIso);
  var b64 = String(base64 || '').replace(/^data:[^,]*,/, '');
  if (!b64) throw new Error('No llega la presentación.');
  var bytes = Utilities.base64Decode(b64);
  if (bytes.length > S_CONFIG.MAX_BYTES) throw new Error('La presentación pesa demasiado (' + Math.round(bytes.length / 1048576) + ' MB).');
  // Un .pptx es un ZIP: empieza por "PK".
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw new Error('El fichero recibido no es un .pptx válido.');

  var nombre = _nombre(f, quien);
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

/** Manda a la papelera (recuperable 30 días) la presentación independiente de
 *  cada { quien: id de coordinador, fecha } que exista. Devuelve los nombres. */
function borrarIndependientes(lista) {
  var borradas = [];
  lista.forEach(function (x) {
    if (!x || !x.quien) return; // nunca la combinada
    var f = _fecha(x.fecha);
    var carpeta = _carpetaMes(f, false);
    if (!carpeta) return;
    var nombre = _nombre(f, _quien(x.quien));
    var it = carpeta.getFilesByName(nombre);
    while (it.hasNext()) {
      var fich = it.next();
      if (fich.isTrashed()) continue;
      fich.setTrashed(true);
      borradas.push(nombre);
    }
  });
  return borradas;
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

// ── Datos de las pestañas (un JSON por coordinador en <raíz>/_datos_web) ────
var CARPETA_DATOS = '_datos_web';

function _carpetaDatos() {
  var raiz = DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID);
  return _hija(raiz, function (n) { return n === CARPETA_DATOS; }) || raiz.createFolder(CARPETA_DATOS);
}
function _nombreDatos(id) { return 'seguimiento_' + id + '.json'; }
function _leerDatos(carpeta, id) {
  var f = _fichero(carpeta, _nombreDatos(id));
  if (!f) return null;
  try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return null; }
}

function datos() {
  var coord = _coordinadores();
  var carpeta = _carpetaDatos();
  var pestanas = {};
  coord.map(function (c) { return c.id; }).concat(['resumen']).forEach(function (id) {
    var d = _leerDatos(carpeta, id);
    if (d) pestanas[id] = d;
  });
  return {
    coordinadores: coord.map(function (c) { return { id: c.id, nombre: c.nombre, email: c.email }; }),
    pestanas: pestanas
  };
}

function guardar(id, doc, rev, quien, forzar) {
  id = String(id || '').trim();
  var ids = _coordinadores().map(function (c) { return c.id; }).concat(['resumen']);
  if (ids.indexOf(id) < 0) throw new Error('Pestaña desconocida: ' + id);
  if (!doc || typeof doc !== 'object') throw new Error('No llegan los datos de la pestaña.');
  if (id !== 'resumen' && !Array.isArray(doc.proyectos)) throw new Error('Los datos no tienen la lista de proyectos.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var carpeta = _carpetaDatos();
    var actual = _leerDatos(carpeta, id);
    var revActual = actual ? Number(actual.rev) || 0 : 0;
    if (!forzar && revActual !== (Number(rev) || 0)) {
      throw new Error('CONFLICTO: ' + (actual.por || 'otra persona') + ' guardó esta pestaña a las ' +
        Utilities.formatDate(new Date(actual.actualizado), 'Europe/Madrid', 'HH:mm') + ' mientras editabas.');
    }
    var nuevo = { rev: revActual + 1, actualizado: new Date().toISOString(), por: quien.nombre, doc: doc };
    var texto = JSON.stringify(nuevo);
    var f = _fichero(carpeta, _nombreDatos(id));
    if (f) f.setContent(texto);
    else carpeta.createFile(_nombreDatos(id), texto, 'application/json');
    return { rev: nuevo.rev, actualizado: nuevo.actualizado, por: nuevo.por };
  } finally {
    lock.releaseLock();
  }
}

// ── Permisos: solo coordinación ─────────────────────────────────────────────
/** Coordinadores de equipo.json (caché 5 min). */
function _coordinadores() {
  var cache = CacheService.getScriptCache();
  var txt = cache.get('equipo');
  if (!txt) {
    var resp = UrlFetchApp.fetch(S_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
    txt = resp.getContentText();
    try { cache.put('equipo', txt, 300); } catch (e) {}
  }
  return (JSON.parse(txt).team || []).filter(function (m) { return m && m.coordinador === true && m.id; });
}

/** Devuelve el coordinador con ese email o lanza error. */
function _exigirCoordinador(email) {
  var e = String(email || '').trim().toLowerCase();
  if (!e) throw new Error('Falta el email de quien usa Seguimiento.');
  var c = _coordinadores().filter(function (m) {
    return [m.email, m.emailBBVA].some(function (x) { return String(x || '').trim().toLowerCase() === e; });
  })[0];
  if (!c) throw new Error('Solo coordinación puede usar Seguimiento (' + e + ').');
  return c;
}
