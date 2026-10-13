/**
 * ============================================================================
 *  SEGUIMIENTO RDR  ·  Apps Script (backend de la página /seguimiento)
 * ============================================================================
 *
 *  1) DATOS de la web POR SEMANA (lunes de la semana de la reunión, que es
 *     cada 2 semanas) y UNA PESTAÑA POR COORDINADOR (equipo.json,
 *     "coordinador": true) + la configuración de la presentación combinada.
 *     Cada pestaña de cada semana es un JSON en
 *     <raíz>/_datos_web/seguimiento_<id>_<lunes>.json con un número de
 *     revisión: si dos personas editan la misma pestaña, la segunda en guardar
 *     recibe CONFLICTO en vez de pisar a la primera. Una semana sin datos de
 *     un coordinador arranca con lo de su semana anterior ("previas").
 *
 *  1b) HISTÓRICO: las presentaciones hechas a mano de años anteriores
 *     ("28/09/2026 Seguimiento_RDR_GLOBAL_2026.pptx") se pueden LEER para
 *     copiar sus proyectos: el .pptx se descomprime aquí y se devuelven los
 *     textos y tablas de cada diapositiva (la web los convierte en proyectos,
 *     tareas, incidencias y traspasos).
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
 *    datos   { email, semana }               -> { semana, coordinadores:[{id,nombre,email}],
 *                                                 pestanas:{ <id>|'resumen': { doc, rev, actualizado, por } },
 *                                                 previas:{ <id>: { semana, doc } },   (sin datos esa semana)
 *                                                 semanas:[{ semana, ids:[…] }] }       (semanas con datos)
 *    semana  { email, id, semana }           -> { doc, actualizado, por } | null   (para «Copiar de…»)
 *    guardar { email, id, semana, doc, rev, forzar? } -> { rev, actualizado, por }
 *                                               (rev = la que se leyó; si ha cambiado: error "CONFLICTO: …")
 *    historico { email }                     -> [{ id, nombre, fecha, anio }]  (.pptx hechos a mano)
 *    leerPptx  { email, id }                 -> { slides:[{ oculta, textos:[…], tablas:[[[celda]]] }] }
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
        data = datos(p.semana);
        break;
      case 'semana':
        _exigirCoordinador(p.email);
        data = leerSemana(p.id, p.semana);
        break;
      case 'guardar':
        data = guardar(p.id, p.semana, p.doc, p.rev, _exigirCoordinador(p.email), p.forzar === true);
        break;
      case 'historico':
        _exigirCoordinador(p.email);
        data = historico();
        break;
      case 'leerPptx':
        _exigirCoordinador(p.email);
        data = leerPptx(p.id);
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

// ── Datos de las pestañas, por semana (<raíz>/_datos_web) ───────────────────
var CARPETA_DATOS = '_datos_web';
var RE_DATOS = /^seguimiento_(.+)_(\d{4}-\d{2}-\d{2})\.json$/;
var RE_LEGADO = /^seguimiento_([^_]+)\.json$/; // versión sin semanas

function _carpetaDatos() {
  var raiz = DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID);
  return _hija(raiz, function (n) { return n === CARPETA_DATOS; }) || raiz.createFolder(CARPETA_DATOS);
}
function _nombreDatos(id, semana) { return 'seguimiento_' + id + '_' + semana + '.json'; }
function _hoy() { return Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd'); }

/** Lunes de la semana de una fecha ISO. */
function _lunes(iso) {
  var f = _fecha(iso);
  var d = new Date(Date.UTC(f.anio, f.mes - 1, f.dia));
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}
function _leerFichero(f) {
  try { return JSON.parse(f.getBlob().getDataAsString('UTF-8')); } catch (e) { return null; }
}

/** Todo lo guardado: [{ id, semana, file }]. Los ficheros de la versión sin
 *  semanas (seguimiento_<id>.json) pasan a la semana de su fecha de reunión. */
function _indice(carpeta) {
  var out = [], legado = [];
  var it = carpeta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    var n = f.getName(), m;
    if ((m = RE_DATOS.exec(n))) out.push({ id: m[1], semana: m[2], file: f });
    else if ((m = RE_LEGADO.exec(n))) legado.push({ id: m[1], file: f });
  }
  legado.forEach(function (l) {
    var d = _leerFichero(l.file);
    var fecha = d && d.doc && /^\d{4}-\d{2}-\d{2}$/.test(d.doc.fechaReunion || '') ? d.doc.fechaReunion : _hoy();
    var sem = _lunes(fecha);
    if (out.some(function (x) { return x.id === l.id && x.semana === sem; })) return;
    l.file.setName(_nombreDatos(l.id, sem));
    out.push({ id: l.id, semana: sem, file: l.file });
  });
  return out;
}

function datos(semana) {
  semana = _lunes(semana || _hoy());
  var coord = _coordinadores();
  var idx = _indice(_carpetaDatos());
  var pestanas = {}, previas = {};
  coord.map(function (c) { return c.id; }).concat(['resumen']).forEach(function (id) {
    var suyos = idx.filter(function (x) { return x.id === id; });
    var esta = suyos.filter(function (x) { return x.semana === semana; })[0];
    if (esta) {
      var d = _leerFichero(esta.file);
      if (d) pestanas[id] = d;
      return;
    }
    if (id === 'resumen') return;
    // Sin datos esta semana: lo último que tuviera antes.
    var ant = suyos.filter(function (x) { return x.semana < semana; })
      .sort(function (a, b) { return a.semana < b.semana ? 1 : -1; })[0];
    if (ant) {
      var d2 = _leerFichero(ant.file);
      if (d2) previas[id] = { semana: ant.semana, doc: d2.doc };
    }
  });
  var porSemana = {};
  idx.forEach(function (x) {
    if (x.id !== 'resumen') (porSemana[x.semana] = porSemana[x.semana] || []).push(x.id);
  });
  return {
    semana: semana,
    coordinadores: coord.map(function (c) { return { id: c.id, nombre: c.nombre, email: c.email }; }),
    pestanas: pestanas,
    previas: previas,
    semanas: Object.keys(porSemana).sort().map(function (s) { return { semana: s, ids: porSemana[s] }; })
  };
}

function leerSemana(id, semana) {
  var f = _fichero(_carpetaDatos(), _nombreDatos(String(id || ''), _lunes(semana)));
  var d = f ? _leerFichero(f) : null;
  return d ? { doc: d.doc, actualizado: d.actualizado, por: d.por } : null;
}

function guardar(id, semana, doc, rev, quien, forzar) {
  id = String(id || '').trim();
  semana = _lunes(semana);
  var ids = _coordinadores().map(function (c) { return c.id; }).concat(['resumen']);
  if (ids.indexOf(id) < 0) throw new Error('Pestaña desconocida: ' + id);
  if (!doc || typeof doc !== 'object') throw new Error('No llegan los datos de la pestaña.');
  if (id !== 'resumen' && !Array.isArray(doc.proyectos)) throw new Error('Los datos no tienen la lista de proyectos.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var carpeta = _carpetaDatos();
    var nombre = _nombreDatos(id, semana);
    var f = _fichero(carpeta, nombre);
    var actual = f ? _leerFichero(f) : null;
    var revActual = actual ? Number(actual.rev) || 0 : 0;
    if (!forzar && revActual !== (Number(rev) || 0)) {
      throw new Error('CONFLICTO: ' + (actual.por || 'otra persona') + ' guardó esta pestaña a las ' +
        Utilities.formatDate(new Date(actual.actualizado), 'Europe/Madrid', 'HH:mm') + ' mientras editabas.');
    }
    var nuevo = { rev: revActual + 1, actualizado: new Date().toISOString(), por: quien.nombre, doc: doc };
    var texto = JSON.stringify(nuevo);
    if (f) f.setContent(texto);
    else carpeta.createFile(nombre, texto, 'application/json');
    return { rev: nuevo.rev, actualizado: nuevo.actualizado, por: nuevo.por };
  } finally {
    lock.releaseLock();
  }
}

// ── Histórico: presentaciones hechas a mano ─────────────────────────────────
/** .pptx de las carpetas de año (y mes) que no son autogenerados (caché 10 min). */
function historico() {
  var cache = CacheService.getScriptCache();
  var c = cache.get('historico');
  if (c) return JSON.parse(c);
  var out = [];
  var buscar = function (carpeta, prof) {
    var fs = carpeta.getFiles();
    while (fs.hasNext()) {
      var f = fs.next();
      var n = f.getName();
      if (f.isTrashed() || !/\.pptx$/i.test(n) || /Autogenerado/i.test(n)) continue;
      var m = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(n);
      var fecha = m ? m[3] + '-' + _n2(Number(m[2])) + '-' + _n2(Number(m[1])) : Utilities.formatDate(f.getLastUpdated(), 'Europe/Madrid', 'yyyy-MM-dd');
      out.push({ id: f.getId(), nombre: n, fecha: fecha, anio: Number(fecha.slice(0, 4)) });
    }
    if (prof < 2) {
      var ds = carpeta.getFolders();
      while (ds.hasNext()) {
        var d = ds.next();
        if (d.getName() !== CARPETA_DATOS) buscar(d, prof + 1);
      }
    }
  };
  buscar(DriveApp.getFolderById(S_CONFIG.CARPETA_RAIZ_ID), 0);
  out.sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0; });
  try { cache.put('historico', JSON.stringify(out), 600); } catch (e) {}
  return out;
}

/** Textos y tablas de cada diapositiva de un .pptx del histórico, en orden. */
function leerPptx(id) {
  id = String(id || '');
  if (!historico().some(function (x) { return x.id === id; })) throw new Error('Esa presentación no está en el histórico de Seguimiento.');
  var cache = CacheService.getScriptCache();
  var c = cache.get('pptx:' + id);
  if (c) return JSON.parse(c);
  var blob = DriveApp.getFileById(id).getBlob().setContentType('application/zip');
  var partes = {};
  Utilities.unzip(blob).forEach(function (b) { partes[b.getName()] = b; });
  var leer = function (n) { return partes[n] ? partes[n].getDataAsString('UTF-8') : ''; };
  // Orden real de las diapositivas: presentation.xml (sldIdLst) -> rels -> slideN.xml
  var rels = {};
  leer('ppt/_rels/presentation.xml.rels').replace(/<Relationship\b[^>]*>/g, function (tag) {
    rels[_attr(tag, 'Id')] = _attr(tag, 'Target');
    return '';
  });
  var slides = [];
  leer('ppt/presentation.xml').replace(/<p:sldId\b[^>]*>/g, function (tag) {
    var t = rels[_attr(tag, 'r:id')];
    if (t) slides.push(_parseSlide(leer('ppt/' + t.replace(/^\/?ppt\//, ''))));
    return '';
  });
  var out = { slides: slides };
  try { cache.put('pptx:' + id, JSON.stringify(out), 3600); } catch (e) {}
  return out;
}

function _attr(tag, nombre) {
  var m = new RegExp('\\s' + nombre + '="([^"]*)"').exec(tag);
  return m ? m[1] : '';
}
function _xmlTexto(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&amp;/g, '&');
}
/** Párrafos (<a:p>) de un trozo de XML: cada uno, sus <a:t> seguidos (<a:br/> = salto). */
function _parrafos(xml) {
  var out = [];
  xml.replace(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g, function (_, p) {
    var t = '';
    p.replace(/<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g, function (m, txt) { t += txt !== undefined ? _xmlTexto(txt) : '\n'; return ''; });
    out.push(t);
    return '';
  });
  return out;
}
function _parseSlide(xml) {
  var tablas = [];
  var resto = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, function (tbl) {
    var filas = [];
    tbl.replace(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g, function (_, tr) {
      var celdas = [];
      tr.replace(/<a:tc\b[^>]*\/>|<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g, function (m, tc) {
        celdas.push(tc ? _parrafos(tc).join('\n').trim() : '');
        return '';
      });
      filas.push(celdas);
      return '';
    });
    tablas.push(filas);
    return '';
  });
  var textos = [];
  resto.replace(/<p:txBody>([\s\S]*?)<\/p:txBody>/g, function (_, body) {
    var t = _parrafos(body).join('\n').trim();
    if (t) textos.push(t);
    return '';
  });
  return { oculta: /<p:sld\b[^>]*\sshow="0"/.test(xml), textos: textos, tablas: tablas };
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
