/**
 * ============================================================================
 *  TIME REPORT WEB  ·  Apps Script (backend de /timereport y /timereport-gestion)
 * ============================================================================
 *
 *  UN Time Report POR EQUIPO (param. `equipo`: rdr · market-abuse ·
 *  comms-surveillance; sin él, rdr): proyectos, reparto, bloqueos, cálculos y
 *  evidencias completamente separados. Quien está en dos equipos (equipo.json,
 *  "equipos") sale en el reparto de los dos, pero su evidencia y sus avisos
 *  van a su equipo PRINCIPAL ("equipoTR"); "activo": false lo saca de todo.
 *  Las filas de las hojas llevan la columna «Equipo» (vacía = rdr: lo
 *  guardado antes de separarlos).
 *
 *  Almacén del Time Report del equipo: proyectos del trimestre, reparto de
 *  horas por quincena/persona/día, estados (Nivel 2) por quincena, horas
 *  incurridas (manuales) y personas bloqueadas. Los datos viven en un Google
 *  Sheet PROPIO de este script (se crea solo en el primer guardado; su ID
 *  queda en Propiedades del script).
 *
 *  Además:
 *   · EVIDENCIAS por quincena en Drive: carpeta <raíz>/<Año>/<MM. Mes>/<n>_Quincena_<Mes><Año>
 *     (p.ej. 2026/06. Junio/2_Quincena_Junio2026). El backend crea las carpetas, dice
 *     quién ha subido ya su evidencia y quién falta, RENOMBRA los ficheros al
 *     nombre canónico (TR 16 - 30 Junio 2026. Pablo Llorente.pdf) y genera un ZIP
 *     con todas para que coordinación lo arrastre al correo del cliente.
 *   · RECORDATORIO por email el primer día laborable en Madrid desde el 2 y
 *     desde el 16 de cada mes (la quincena que acaba de cerrar): a las 9:00, a
 *     todo el equipo («hoy toca subir las evidencias»), con enlace a la web y
 *     a la carpeta de la quincena DE SU EQUIPO; a las 11, 13, 15 y 17 h, solo a
 *     quien aún no ha subido la suya. Uno por equipo (con carpeta de
 *     evidencias configurada) y persona, desde el grupo (_comun/Correo.gs).
 *     A mano: enviarRecordatorioTRAhora() (a todos) y enviarPendientesTRAhora()
 *     (a quien falta), de la última quincena cerrada.
 *
 *  DESPLIEGUE (proyecto Apps Script INDEPENDIENTE):
 *   1. script.google.com -> Nuevo proyecto -> pegar este fichero.
 *   2. La carpeta raíz de evidencias se lee de links.json ("evidenciasDrive"),
 *      como el resto de enlaces del hub. Debe estar compartida (editor) con el
 *      equipo para que puedan subir sus ficheros.
 *   3. Ejecutar una vez `autorizar` (Drive + Gmail + UrlFetch) y una vez
 *      `crearTriggerRecordatorioTR` (disparador diario a las 7:00 que programa los envíos).
 *   4. Implementar -> Aplicación web (Ejecutar como YO, Cualquier persona) ->
 *      "Nueva versión" en cada cambio. Pegar la URL /exec en links.json ->
 *      "timereportBackend".
 *
 *  API (GET query o POST text/plain JSON; todas aceptan `equipo`):
 *   ?action=snapshot&q=2026Q3 -> { proyectos, reparto, bloqueadas, qs }
 *   POST { action:'guardarProyectos', q, proyectos:[{id,sdatool,nombre,feature,horas,estados,personas,incurridas,inicio,fin}] }
 *        (inicio/fin: quincenas 1..6 que acotan el reparto del proyecto; fin 0 = automático)
 *   POST { action:'guardarReparto',  q, desdeQuincena, filas:[{quincena,persona,proyectoId,dias}] }
 *        (borra las filas del Q con quincena >= desdeQuincena y escribe las nuevas;
 *         las filas de personas bloqueadas que se conservan YA vienen incluidas)
 *   POST { action:'guardarBloqueadas', q, personas:[nombres] }
 *   ?action=carpetaEvidencias&q=2026Q3&quincena=4   -> { id, url, nombre } (la crea si no existe)
 *   ?action=estadoEvidencias&q=2026Q3&quincena=4    -> { carpeta, entregados, pendientes, sinIdentificar, zip }
 *   POST { action:'descargarEvidencias', q, quincena } -> { url, verUrl, nombre, n } (ZIP en la carpeta)
 *   (las tres admiten `raiz`: la URL de la carpeta raíz que la web ya tiene de
 *    links.json; si no viene, el backend lee links.json de GitHub él mismo)
 * ============================================================================
 */

var TR_CONFIG = {
  TZ: 'Europe/Madrid',
  WEB_URL: 'https://rdr-nfq.github.io/team-hub/timereport/',
  REMITE: 'Time Report RDR',
  // La carpeta raíz de evidencias NO va aquí: se lee de links.json
  // ("evidenciasDrive", fuente única de enlaces del hub). Solo como último
  // recurso se mira la propiedad del script EVIDENCIAS_FOLDER_ID.
  // Fuentes de datos del hub (URLs "raw" de GitHub: devuelven JSON plano).
  EQUIPO_JSON_URL: 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json',
  LINKS_JSON_URL: 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/links/links.json',
  // Destinatario de la prueba del recordatorio (vacío = quien ejecuta).
  PRUEBA_TO: '',
  // Equipos que reciben los avisos de evidencias (por su equipo principal).
  // De momento solo RDR; para sumar otro: 'market-abuse', 'comms-surveillance'.
  EQUIPOS_AVISO: ['rdr']
};

/* Equipos con Time Report propio y la clave de links.json con la carpeta raíz
   de sus evidencias (carpetas distintas por equipo). */
var TR_EQUIPOS = {
  'rdr': { nombre: 'RDR', evidencias: 'evidenciasDrive' },
  'market-abuse': { nombre: 'Market Abuse', evidencias: 'evidenciasDriveMarketAbuse' },
  'comms-surveillance': { nombre: 'Comms Surveillance', evidencias: 'evidenciasDriveCommsSurveillance' }
};
function _eqTR(v) {
  var e = String(v || '').trim().toLowerCase();
  if (!e) return 'rdr';
  if (!TR_EQUIPOS[e]) throw new Error('Equipo desconocido: ' + v);
  return e;
}
/* Activo (Gestión de equipo): "activo": false lo saca de evidencias y avisos. */
function _activoTR(m) { return !!m && m.activo !== false && m.baja !== true; }
/* Equipo PRINCIPAL del TR ("equipoTR"; si falta o no es suyo, el primero):
   dónde sube su evidencia y qué avisos recibe (como lib/equipos.js). */
function _equipoTRDe(m) {
  var eqs = _equiposDeTR(m);
  var v = String((m && m.equipoTR) || '').trim().toLowerCase();
  return eqs.indexOf(v) >= 0 ? v : eqs[0];
}
/* Equipos de un miembro de equipo.json (como lib/equipos.js: sin «equipos» = rdr). */
function _equiposDeTR(m) {
  var v = m && m.equipos;
  var lista = Array.isArray(v) ? v : (typeof v === 'string' && v ? v.split(/[,;]/) : []);
  var ids = lista.map(function (x) { return String(x).trim().toLowerCase(); }).filter(function (x) { return TR_EQUIPOS[x]; });
  // En el orden de TR_EQUIPOS (como la web), para que «el primero» coincida.
  return ids.length ? Object.keys(TR_EQUIPOS).filter(function (k) { return ids.indexOf(k) >= 0; }) : ['rdr'];
}

var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

var HOJAS = {
  // 'Personas', 'Incurridas', 'Inicio' y 'Fin' van al FINAL para no romper hojas
  // creadas con versiones previas (las filas antiguas no tienen esas celdas).
  // 'Equipo', la última: vacía = rdr (filas de antes de separar los equipos).
  proyectos: ['TR_Proyectos', ['Q', 'Id', 'SDATOOL', 'Nombre', 'Feature', 'Horas', 'Estados', 'Actualizado', 'Personas', 'Incurridas', 'Inicio', 'Fin', 'Equipo']],
  reparto: ['TR_Reparto', ['Q', 'Quincena', 'Persona', 'ProyectoId', 'Dias', 'Actualizado', 'Equipo']],
  bloqueadas: ['TR_Bloqueadas', ['Q', 'Personas', 'Actualizado', 'Equipo']]
};
/* Equipo de una fila leída (columna «Equipo»; vacía = rdr). */
function _eqFila(r, clave) {
  var col = HOJAS[clave][1].length - 1;
  return String(r[col] || '').trim().toLowerCase() || 'rdr';
}

/* Ejecutar UNA vez desde el editor para conceder los permisos que usan las
   evidencias (Drive), el recordatorio (Gmail) y la lectura de equipo.json
   (UrlFetch). Si tras un cambio aparece "No tienes permiso para llamar a…",
   volver a ejecutarla. */
function autorizarTR() {
  DriveApp.getRootFolder().getName();
  GmailApp.getAliases();
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
  UrlFetchApp.fetch(TR_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true });
  Logger.log('Permisos concedidos. Raíz de evidencias (links.json → evidenciasDrive): ' + (_evidenciasRootId() || '(sin configurar)'));
}

function _ssTR() {
  return _hubHoja('TIMEREPORT'); // «RDR TimeReport Web (datos)» (id en _comun/Hub.gs)
}

function _hojaTR(clave) {
  var def = HOJAS[clave];
  var ss = _ssTR();
  var sh = ss.getSheetByName(def[0]);
  if (!sh) {
    sh = ss.insertSheet(def[0]);
    sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]);
  } else if (sh.getLastColumn() < def[1].length) {
    // Hojas de versiones previas: cabecera de las columnas nuevas (Equipo…).
    sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]);
  }
  return sh;
}

function doGetTR(e)  { return _serveTR(e); }
function doPostTR(e) { return _serveTR(e); }

function _serveTR(e) {
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
      case 'ping': data = { ok: 1 }; break;
      case 'snapshot': data = getSnapshotTR(p.q, _eqTR(p.equipo)); break;
      case 'guardarProyectos': data = guardarProyectos(p.q, _eqTR(p.equipo), p.proyectos); break;
      case 'guardarReparto': data = guardarReparto(p.q, _eqTR(p.equipo), p.desdeQuincena, p.filas); break;
      case 'guardarBloqueadas': data = guardarBloqueadas(p.q, _eqTR(p.equipo), p.personas); break;
      case 'carpetaEvidencias': data = carpetaEvidencias(p.q, p.quincena, p.raiz, _eqTR(p.equipo)); break;
      case 'estadoEvidencias': data = estadoEvidencias(p.q, p.quincena, p.raiz, _eqTR(p.equipo)); break;
      case 'descargarEvidencias': data = descargarEvidencias(p.q, p.quincena, p.raiz, _eqTR(p.equipo)); break;
      default: throw new Error('Acción desconocida: ' + action);
    }
    return _jsonTR({ ok: true, action: action, data: data });
  } catch (err) {
    return _jsonTR({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function _jsonTR(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _filasTR(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function _q(v) { return String(v || '').replace(/[_\s]+/g, '').toUpperCase(); }

/* ────────────────────────── Snapshot y guardados ────────────────────────── */

function getSnapshotTR(q, eq) {
  q = _q(q);
  eq = eq || 'rdr';
  var qsSet = {};
  var proyectos = [], posId = {};
  _filasTR(_hojaTR('proyectos')).forEach(function (r) {
    if (_eqFila(r, 'proyectos') !== eq) return;
    var rq = _q(r[0]);
    if (rq) qsSet[rq] = 1;
    if (rq !== q) return;
    var estados = {}, personasProy = [];
    try { estados = JSON.parse(r[6] || '{}'); } catch (e2) {}
    try { personasProy = JSON.parse(r[8] || '[]'); } catch (e5) {}
    // Un proyecto guardado dos veces (guardados que se pisaron): la última fila gana.
    var id = String(r[1]);
    if (posId[id] != null) proyectos.splice(posId[id], 1, null);
    posId[id] = proyectos.length;
    proyectos.push({
      id: id, sdatool: String(r[2] || ''), nombre: String(r[3] || ''), feature: String(r[4] || ''),
      horas: Number(r[5]) || 0, estados: estados, personas: personasProy,
      incurridas: Number(r[9]) || 0,
      inicio: Number(r[10]) || 1, fin: Number(r[11]) || 0
    });
  });
  proyectos = proyectos.filter(Boolean);
  var reparto = [];
  _filasTR(_hojaTR('reparto')).forEach(function (r) {
    if (_eqFila(r, 'reparto') !== eq) return;
    var rq = _q(r[0]);
    if (rq) qsSet[rq] = 1;
    if (rq !== q) return;
    var dias = {};
    try { dias = JSON.parse(r[4] || '{}'); } catch (e3) {}
    reparto.push({ quincena: Number(r[1]) || 0, persona: String(r[2] || ''), proyectoId: String(r[3] || ''), dias: dias });
  });
  var bloqueadas = [];
  _filasTR(_hojaTR('bloqueadas')).forEach(function (r) {
    if (_eqFila(r, 'bloqueadas') !== eq || _q(r[0]) !== q) return;
    try { bloqueadas = JSON.parse(r[1] || '[]'); } catch (e4) {}
  });
  return {
    generadoEn: new Date().toISOString(),
    q: q, equipo: eq, proyectos: proyectos, reparto: reparto, bloqueadas: bloqueadas,
    qs: Object.keys(qsSet).sort(),
    evidenciasConfiguradas: !!_evidenciasRootId('', eq)
  };
}

/* Borra las filas de un Q y un equipo (y que cumplan filtroExtra). */
function _borrarDelQ(sh, clave, q, eq, filtroExtra) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, HOJAS[clave][1].length).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (_q(vals[i][0]) !== q || _eqFila(vals[i], clave) !== eq) continue;
    if (filtroExtra && !filtroExtra(vals[i])) continue;
    sh.deleteRow(i + 2);
  }
}

function guardarProyectos(q, eq, proyectos) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var sh = _hojaTR('proyectos');
  var cab = HOJAS.proyectos[1];
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
  _borrarDelQ(sh, 'proyectos', q, eq);
  var now = new Date();
  var vistos = {};
  var rows = (proyectos || []).filter(function (p) {
    var id = String(p && p.id);
    if (vistos[id]) return false;
    vistos[id] = 1;
    return true;
  }).map(function (p) {
    return [q, String(p.id), String(p.sdatool || ''), String(p.nombre || ''), String(p.feature || ''), Number(p.horas) || 0,
      JSON.stringify(p.estados || {}), now, JSON.stringify(p.personas || []), Number(p.incurridas) || 0,
      Number(p.inicio) || 1, Number(p.fin) || 0, eq];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, cab.length).setValues(rows);
  SpreadsheetApp.flush(); // antes de soltar el bloqueo: si no, el siguiente guardado lee la hoja sin estos cambios y duplica filas
  return { n: rows.length };
  } finally { lock.releaseLock(); }
}

function guardarReparto(q, eq, desdeQuincena, filas) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var desde = Number(desdeQuincena) || 1;
  var sh = _hojaTR('reparto');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
  _borrarDelQ(sh, 'reparto', q, eq, function (fila) { return (Number(fila[1]) || 0) >= desde; });
  var now = new Date();
  var rows = (filas || [])
    .filter(function (f) { return (Number(f.quincena) || 0) >= desde; })
    .map(function (f) {
      return [q, Number(f.quincena) || 0, String(f.persona || ''), String(f.proyectoId || ''), JSON.stringify(f.dias || {}), now, eq];
    });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  SpreadsheetApp.flush();
  return { n: rows.length, desde: desde };
  } finally { lock.releaseLock(); }
}

function guardarBloqueadas(q, eq, personas) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var sh = _hojaTR('bloqueadas');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
  _borrarDelQ(sh, 'bloqueadas', q, eq);
  sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([[q, JSON.stringify(personas || []), new Date(), eq]]);
  SpreadsheetApp.flush();
  return { n: (personas || []).length };
  } finally { lock.releaseLock(); }
}

/* ─────────────────────────── Quincenas (utilidades) ─────────────────────────
   Q "2026Q3" + quincena 1..6 del Q  →  mes, quincena del mes (1|2) y nombre
   canónico "2_Quincena_Junio2026" (misma convención que la web). */

function _infoQuincena(q, quincena) {
  q = _q(q);
  var m = /^(\d{4})Q([1-4])$/.exec(q);
  var n = Number(quincena) || 0;
  if (!m || n < 1 || n > 6) throw new Error('Q o quincena inválidos (' + q + ', ' + quincena + ').');
  var anio = Number(m[1]);
  var mes0 = (Number(m[2]) - 1) * 3 + Math.floor((n - 1) / 2);
  var nMes = n % 2 === 1 ? 1 : 2;
  var ult = new Date(anio, mes0 + 1, 0).getDate();
  return {
    q: q, quincena: n, anio: anio, mes0: mes0, mes: MESES[mes0], nMes: nMes,
    desdeDia: nMes === 1 ? 1 : 16, hastaDia: nMes === 1 ? 15 : ult,
    carpeta: nMes + '_Quincena_' + MESES[mes0] + anio,
    carpetaMes: ('0' + (mes0 + 1)).slice(-2) + '. ' + MESES[mes0],
    etiqueta: (nMes === 1 ? '1-15' : '16-' + ult) + ' de ' + MESES[mes0].toLowerCase() + ' de ' + anio
  };
}

function _sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
/* Nombre canónico de una evidencia (sin extensión):
   "TR 16 - 31 Octubre 2026. Pablo Llorente" (misma convención que la web). */
function _nombreEvidencia(info, persona) {
  return 'TR ' + info.desdeDia + ' - ' + info.hastaDia + ' ' + info.mes + ' ' + info.anio + '. ' + String(persona || '').trim();
}
function _normTR(s) { return _sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/* Equipo (equipo.json del hub): [{nombre, email, emailBBVA, coordinador…}] */
function _equipoTR() {
  var resp = UrlFetchApp.fetch(TR_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
  var body = resp.getContentText();
  if (body.trim().charAt(0) !== '{') throw new Error('equipo.json: respuesta no-JSON');
  return (JSON.parse(body).team || []).filter(function (p) { return p && p.nombre; });
}

/* ────────────────────────────── Evidencias (Drive) ────────────────────────── */

/* Id de la carpeta raíz. Fuente única: la clave "evidenciasDrive" de
   links.json. La web la manda en cada llamada (`raiz`); si no viene (p.ej. el
   recordatorio programado) se lee links.json de GitHub (caché 10 min). Último
   recurso: propiedad del script EVIDENCIAS_FOLDER_ID. */
function _idDeUrl(url) {
  url = String(url || '').trim();
  if (!url || url.indexOf('PEGAR_AQUI') >= 0) return '';
  var m = /\/folders\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? m[1] : url;
}
function _evidenciasRootId(raiz, eq) {
  eq = eq || 'rdr';
  var directo = _idDeUrl(raiz);
  if (directo) return directo;
  var cache = CacheService.getScriptCache();
  var ck = 'tr:evidencias:' + eq;
  var hit = cache.get(ck);
  if (hit) return hit;
  var id = '';
  try {
    var resp = UrlFetchApp.fetch(TR_CONFIG.LINKS_JSON_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
    var links = JSON.parse(resp.getContentText());
    var e = links[TR_EQUIPOS[eq].evidencias];
    id = _idDeUrl(e ? (typeof e === 'string' ? e : e.url) : '');
  } catch (err) { Logger.log('links.json: ' + err); }
  if (!id && eq === 'rdr') id = PropertiesService.getScriptProperties().getProperty('EVIDENCIAS_FOLDER_ID') || '';
  if (id) cache.put(ck, id, 600);
  return id;
}

/* Diagnóstico (ejecutar desde el editor): qué ve el script de links.json y
   de la carpeta raíz. */
function diagnosticarEvidencias() {
  var resp = UrlFetchApp.fetch(TR_CONFIG.LINKS_JSON_URL, { muteHttpExceptions: true });
  Logger.log('links.json HTTP ' + resp.getResponseCode() + ' (' + TR_CONFIG.LINKS_JSON_URL + ')');
  var links = JSON.parse(resp.getContentText());
  Object.keys(TR_EQUIPOS).forEach(function (eq) {
    var clave = TR_EQUIPOS[eq].evidencias;
    CacheService.getScriptCache().remove('tr:evidencias:' + eq);
    var id = _evidenciasRootId('', eq);
    Logger.log(TR_EQUIPOS[eq].nombre + ' · ' + clave + ': ' + JSON.stringify(links[clave] || null) + ' → id ' + (id || '(ninguno)'));
    if (id) {
      var f = DriveApp.getFolderById(id);
      Logger.log('   Carpeta raíz: "' + f.getName() + '" ' + f.getUrl());
    }
  });
}

function _subcarpetaTR(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/* Carpeta <raíz>/<Año>/<MM. Mes>/<n>_Quincena_<Mes><Año>
   (p.ej. 2026/10. Octubre/2_Quincena_Octubre2026); se crea si no existe. */
function _carpetaQuincena(info, raiz, eq) {
  eq = eq || 'rdr';
  var rootId = _evidenciasRootId(raiz, eq);
  if (!rootId) throw new Error('Evidencias de ' + TR_EQUIPOS[eq].nombre + ' sin configurar: falta la clave "' + TR_EQUIPOS[eq].evidencias + '" (carpeta raíz de Drive) en links.json (ejecuta diagnosticarEvidencias en el editor).');
  var root = DriveApp.getFolderById(rootId);
  var mes = _subcarpetaTR(_subcarpetaTR(root, String(info.anio)), info.carpetaMes);
  return _subcarpetaTR(mes, info.carpeta);
}

function carpetaEvidencias(q, quincena, raiz, eq) {
  var info = _infoQuincena(q, quincena);
  var f = _carpetaQuincena(info, raiz, eq);
  return { id: f.getId(), url: f.getUrl(), nombre: info.carpeta, etiqueta: info.etiqueta };
}

var _ZIP_RE = /\.zip$/i;

/* ¿De quién es este fichero? 1) por el NOMBRE, entre todas las personas
   activas (nombre canónico, o el mayor número de letras de nombre/apellidos
   que contenga, si es único): así se pueden subir a mano evidencias de otros
   con su nombre; 2) si el nombre no dice nada, por el propietario del fichero
   (solo entre los del equipo de la carpeta). null = sin identificar. */
function _identificar(file, team, delEquipo) {
  var base = _normTR(file.getName().replace(/\.[^.]+$/, ''));
  var compacto = base.replace(/\s+/g, '');
  var mejor = null, mejorScore = 0, empate = false;
  team.forEach(function (p) {
    var n = _normTR(p.nombre);
    var canon = n.replace(/\s+/g, '');
    var score = 0;
    if (canon && compacto.indexOf(canon) >= 0) score = 100;
    else n.split(' ').forEach(function (t) { if (t.length >= 3 && compacto.indexOf(t) >= 0) score += t.length; });
    if (score > mejorScore) { mejor = p; mejorScore = score; empate = false; }
    else if (score > 0 && score === mejorScore) empate = true;
  });
  if (mejor && !empate && mejorScore >= 4) return mejor;
  team = delEquipo || team;
  var email = '';
  try { var o = file.getOwner(); email = o ? String(o.getEmail() || '').toLowerCase() : ''; } catch (e) {}
  if (email) {
    for (var i = 0; i < team.length; i++) {
      var p2 = team[i];
      if (String(p2.email || '').toLowerCase() === email || String(p2.emailBBVA || '').toLowerCase() === email) return p2;
    }
  }
  return null;
}

/* Estado de la carpeta de una quincena: renombra al nombre canónico lo que
   haga falta y dice quién ha entregado y quién falta. */
function estadoEvidencias(q, quincena, raiz, eq) {
  eq = eq || 'rdr';
  var info = _infoQuincena(q, quincena);
  var folder = _carpetaQuincena(info, raiz, eq);
  // Deben entregar aquí las personas activas con este equipo como PRINCIPAL;
  // los ficheros se reconocen por nombre entre todas las activas.
  var activos = _equipoTR().filter(_activoTR);
  var team = activos.filter(function (p) { return _equipoTRDe(p) === eq; });
  var entregados = [], sinIdentificar = [], zip = null;
  var usados = {}; // nombre canónico ya asignado en esta carpeta -> nº de ficheros
  var it = folder.getFiles();
  var ficheros = [];
  while (it.hasNext()) ficheros.push(it.next());
  ficheros.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });
  ficheros.forEach(function (file) {
    var nombre = file.getName();
    if (_ZIP_RE.test(nombre)) { zip = { nombre: nombre, url: 'https://drive.google.com/uc?export=download&id=' + file.getId(), verUrl: file.getUrl() }; return; }
    var p = _identificar(file, activos, team);
    if (!p) { sinIdentificar.push({ fichero: nombre, url: file.getUrl() }); return; }
    var extM = /\.([A-Za-z0-9]{1,6})$/.exec(nombre);
    var ext = extM ? '.' + extM[1].toLowerCase() : (file.getMimeType() === MimeType.PDF ? '.pdf' : '');
    var canon = _nombreEvidencia(info, p.nombre);
    usados[canon] = (usados[canon] || 0) + 1;
    var deseado = canon + (usados[canon] > 1 ? ' (' + usados[canon] + ')' : '') + ext;
    var renombrado = false;
    if (nombre !== deseado) { try { file.setName(deseado); renombrado = true; nombre = deseado; } catch (e) {} }
    entregados.push({ persona: p.nombre, fichero: nombre, url: file.getUrl(), actualizado: file.getLastUpdated().toISOString(), renombrado: renombrado });
  });
  var tienen = {};
  entregados.forEach(function (e) { tienen[e.persona] = 1; });
  var pendientes = team.filter(function (p) { return !tienen[p.nombre]; }).map(function (p) { return p.nombre; });
  return {
    carpeta: { id: folder.getId(), url: folder.getUrl(), nombre: info.carpeta, etiqueta: info.etiqueta },
    entregados: entregados, pendientes: pendientes, sinIdentificar: sinIdentificar, zip: zip,
    generadoEn: new Date().toISOString()
  };
}

/* ZIP con todas las evidencias de la quincena (los Docs/Sheets nativos van
   exportados a PDF). Se deja en la propia carpeta (reemplazando el anterior) y
   se devuelve el enlace de descarga directa. */
function descargarEvidencias(q, quincena, raiz, eq) {
  var info = _infoQuincena(q, quincena);
  var folder = _carpetaQuincena(info, raiz, eq);
  var zipName = 'Evidencias_' + info.carpeta + '.zip';
  var blobs = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var nombre = f.getName();
    if (_ZIP_RE.test(nombre)) continue;
    var mime = f.getMimeType() || '';
    try {
      if (mime.indexOf('application/vnd.google-apps') === 0) {
        blobs.push(f.getAs(MimeType.PDF).setName(nombre.replace(/\.[^.]+$/, '') + '.pdf'));
      } else {
        blobs.push(f.getBlob().setName(nombre));
      }
    } catch (e) { Logger.log('No se pudo incluir ' + nombre + ': ' + e); }
  }
  if (!blobs.length) throw new Error('La carpeta ' + info.carpeta + ' no tiene evidencias todavía.');
  var previos = folder.getFilesByName(zipName);
  while (previos.hasNext()) previos.next().setTrashed(true);
  var zip = folder.createFile(Utilities.zip(blobs, zipName));
  return { nombre: zipName, n: blobs.length, url: 'https://drive.google.com/uc?export=download&id=' + zip.getId(), verUrl: zip.getUrl() };
}

/* ───────────────────────── Recordatorio de evidencias ─────────────────────── */
/* El primer día LABORABLE EN MADRID después del 1 y del 15 de cada mes (el 2
   y el 16, o el siguiente laborable), la quincena que acaba de cerrar:
     · 9:00  → a TODO el equipo: «hoy toca subir tu evidencia».
     · 11:00, 13:00, 15:00 y 17:00 → solo a quien aún no la ha subido
       (estadoEvidencias de su carpeta); si ya no falta nadie, se para.
   Horas exactas: un disparador diario (7-8 h) decide si hoy toca y programa
   el de las 9:00; cada envío programa el siguiente (un solo disparador
   puntual a la vez, «recordatorioTRTramo»). */
var TR_TRAMOS = [9, 11, 13, 15, 17];
var TR_PROP_RECORDATORIO = 'tr:recordatorio';

/* Ejecutar UNA vez (lo hace instalarDisparadores; se puede repetir). */
function crearTriggerRecordatorioTR() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'enviarRecordatorioTR' || h === 'recordatorioTRTramo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarRecordatorioTR').timeBased().everyDays(1).atHour(7).inTimezone(TR_CONFIG.TZ).create();
  Logger.log('Disparador creado: enviarRecordatorioTR, diario a las 7:00 (' + TR_CONFIG.TZ + '); los días de recordatorio programa los envíos de las ' + TR_TRAMOS.join(', ') + ' h.');
}

function _hoyISOTR() { return Utilities.formatDate(new Date(), TR_CONFIG.TZ, 'yyyy-MM-dd'); }

/* Festivos de MADRID ({iso: 1}) de vacaciones (grupos de festivos cuyo nombre
   contiene «Madrid»; si no hay ninguno, los de España). {} si falla. */
function _festivosMadrid() {
  try {
    var d = datos(undefined, ''); // mismo proyecto que vacaciones
    var out = {};
    var madrid = (d.festivosDetalle || []).filter(function (f) { return /madrid/i.test(f.grupo || ''); });
    if (madrid.length) madrid.forEach(function (f) { out[f.fecha] = 1; });
    else Object.keys(d.festivos || {}).forEach(function (k) { if (d.festivos[k] === 'ES' || d.festivos[k] === 'AMBOS') out[k] = 1; });
    return out;
  } catch (e) { Logger.log('festivos: ' + e); return {}; }
}

function _esLaborable(iso, festivos) {
  var p = iso.split('-').map(Number);
  var dow = new Date(p[0], p[1] - 1, p[2], 12).getDay();
  return dow !== 0 && dow !== 6 && !festivos[iso];
}

function _iso(anio, mes0, dia) {
  return anio + '-' + ('0' + (mes0 + 1)).slice(-2) + '-' + ('0' + dia).slice(-2);
}

/* Si hoy es día de recordatorio (el primer laborable desde el 2 o desde el
   16), la quincena que CIERRA: {q, quincena, info}. Si no toca, null. */
function _quincenaARecordar(hoy, festivos) {
  var p = hoy.split('-').map(Number);
  var anio = p[0], mes0 = p[1] - 1, dia = p[2];
  var ult = new Date(anio, mes0 + 1, 0).getDate();
  var anclas = [2, 16];
  for (var i = 0; i < anclas.length; i++) {
    var d = anclas[i];
    while (d <= ult && !_esLaborable(_iso(anio, mes0, d), festivos)) d++;
    if (d !== dia) continue;
    // Desde el 2 → la 2ª quincena del mes anterior; desde el 16 → la 1ª de este mes.
    return anclas[i] === 2 ? _quincenaDeMes(anio, mes0 - 1, 2) : _quincenaDeMes(anio, mes0, 1);
  }
  return null;
}

/* {q, quincena, info} de la quincena nMes (1|2) del mes mes0 (-1 = diciembre anterior). */
function _quincenaDeMes(anio, mes0, nMes) {
  if (mes0 < 0) { mes0 = 11; anio--; }
  var q = anio + 'Q' + (Math.floor(mes0 / 3) + 1);
  var quincena = (mes0 % 3) * 2 + nMes;
  return { q: q, quincena: quincena, info: _infoQuincena(q, quincena) };
}

/* Última quincena cerrada (para los envíos a mano). */
function _ultimaQuincenaCerrada() {
  var p = _hoyISOTR().split('-').map(Number);
  return p[2] <= 15 ? _quincenaDeMes(p[0], p[1] - 2, 2) : _quincenaDeMes(p[0], p[1] - 1, 1);
}

/* Handler del disparador diario (7-8 h): si hoy toca, programa las 9:00. */
function enviarRecordatorioTR() {
  var hoy = _hoyISOTR();
  var r = _quincenaARecordar(hoy, _festivosMadrid());
  if (!r) { Logger.log(hoy + ': hoy no toca recordatorio.'); return; }
  PropertiesService.getScriptProperties().setProperty(TR_PROP_RECORDATORIO, JSON.stringify({ hoy: hoy, q: r.q, quincena: r.quincena, tramo: 0 }));
  _programarTramoTR(hoy, 0);
  Logger.log(hoy + ': recordatorio de ' + r.info.carpeta + ' programado a las ' + TR_TRAMOS[0] + ':00.');
}

/* Un único disparador puntual a la hora del tramo i de hoy. */
function _programarTramoTR(hoy, i) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recordatorioTRTramo') ScriptApp.deleteTrigger(t);
  });
  if (i >= TR_TRAMOS.length) return;
  var cuando = Utilities.parseDate(hoy + ' ' + ('0' + TR_TRAMOS[i]).slice(-2) + ':00', TR_CONFIG.TZ, 'yyyy-MM-dd HH:mm');
  ScriptApp.newTrigger('recordatorioTRTramo').timeBased().at(cuando).create();
}

/* Handler de cada tramo: 9:00 a todos; luego, solo a quien falte. */
function recordatorioTRTramo() {
  var props = PropertiesService.getScriptProperties();
  var plan = JSON.parse(props.getProperty(TR_PROP_RECORDATORIO) || 'null');
  var hoy = _hoyISOTR();
  if (!plan || plan.hoy !== hoy) { _programarTramoTR(hoy, TR_TRAMOS.length); Logger.log('Recordatorio TR: sin plan para hoy.'); return; }
  var info = _infoQuincena(plan.q, plan.quincena);
  var siguen = 1;
  if (plan.tramo === 0) _recordarATodos(info, false);
  else siguen = _recordarPendientes(info, TR_TRAMOS[plan.tramo]);
  plan.tramo++;
  props.setProperty(TR_PROP_RECORDATORIO, JSON.stringify(plan));
  _programarTramoTR(hoy, siguen ? plan.tramo : TR_TRAMOS.length);
}

/* Manda YA el aviso a todo el equipo (última quincena cerrada). A mano. */
function enviarRecordatorioTRAhora() {
  _recordarATodos(_ultimaQuincenaCerrada().info, true);
}

/* Manda YA el aviso a quien aún no ha subido su evidencia. A mano. */
function enviarPendientesTRAhora() {
  _recordarPendientes(_ultimaQuincenaCerrada().info, null);
}

/* Prueba: los dos correos (a todos y a quien falta) de cada equipo con
   carpeta configurada, solo al responsable del hub (PRUEBA_TO si se rellena). */
function enviarRecordatorioTRPrueba() {
  var info = _ultimaQuincenaCerrada().info;
  var to = TR_CONFIG.PRUEBA_TO || _hubResponsable();
  TR_CONFIG.EQUIPOS_AVISO.forEach(function (eq) {
    if (!_evidenciasRootId('', eq)) { Logger.log(TR_EQUIPOS[eq].nombre + ': sin carpeta de evidencias, no se prueba.'); return; }
    var url = _urlCarpeta(info, eq);
    [_correoRecordatorio(info, url, false, eq), _correoRecordatorio(info, url, false, eq, 'Nombre Apellido')].forEach(function (c) {
      var r = _correoEnviar(to, '[PRUEBA] ' + c.asunto, c.texto, c.html, { nombre: c.remite });
      Logger.log(TR_EQUIPOS[eq].nombre + ': prueba ' + (r.enviados.length ? 'enviada' : 'FALLIDA') + ' a ' + to + ' (' + c.asunto + ').');
    });
  });
}

function _urlCarpeta(info, eq) {
  try { return _carpetaQuincena(info, '', eq).getUrl(); } catch (e) { Logger.log('carpeta: ' + e); return ''; }
}

/* Personas activas con email de equipo.json, y emails de coordinación. */
function _equipoConEmailTR() {
  var team = _equipoTR().filter(function (p) { return p.email && _activoTR(p); });
  var coord = team.filter(function (p) { return p.coordinador === true; }).map(function (p) { return String(p.email).trim(); });
  return { team: team, coord: coord.join(',') };
}

/* Un aviso por EQUIPO de TR_CONFIG.EQUIPOS_AVISO (de momento, solo RDR), a
   cada persona activa cuyo equipo PRINCIPAL es ese, por separado y desde el
   grupo (Correo.gs). Necesita la carpeta de evidencias del equipo en
   links.json. Las respuestas van a coordinación. */
function _recordarATodos(info, manual) {
  var e = _equipoConEmailTR();
  TR_CONFIG.EQUIPOS_AVISO.forEach(function (eq) {
    if (!_evidenciasRootId('', eq)) { Logger.log(TR_EQUIPOS[eq].nombre + ': sin carpeta de evidencias en links.json, no se envía.'); return; }
    var emails = e.team.filter(function (p) { return _equipoTRDe(p) === eq; }).map(function (p) { return String(p.email).trim(); });
    if (!emails.length) { Logger.log(TR_EQUIPOS[eq].nombre + ': nadie en el equipo.'); return; }
    var c = _correoRecordatorio(info, _urlCarpeta(info, eq), manual, eq);
    var r = _correoEnviar(emails, c.asunto, c.texto, c.html, { nombre: c.remite, replyTo: e.coord });
    Logger.log(TR_EQUIPOS[eq].nombre + ' · ' + info.carpeta + ': enviado a ' + r.enviados.length + ' de ' + emails.length
      + (r.fallidos.length ? ' · FALLAN: ' + r.fallidos.join(' | ') : ''));
  });
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* Aviso personal a quien aún no ha subido su evidencia (por equipo, según su
   carpeta). Devuelve cuántos faltan en total (0 = ya no hace falta seguir). */
function _recordarPendientes(info, hora) {
  var e = _equipoConEmailTR();
  var faltan = 0;
  TR_CONFIG.EQUIPOS_AVISO.forEach(function (eq) {
    if (!_evidenciasRootId('', eq)) return;
    var st;
    try { st = estadoEvidencias(info.q, info.quincena, '', eq); } catch (err) { Logger.log(TR_EQUIPOS[eq].nombre + ': ' + err); faltan++; return; }
    var pend = {};
    st.pendientes.forEach(function (n) { pend[n] = 1; });
    var personas = e.team.filter(function (p) { return pend[p.nombre] && _equipoTRDe(p) === eq; });
    faltan += personas.length;
    personas.forEach(function (p) {
      var c = _correoRecordatorio(info, st.carpeta.url, false, eq, p.nombre, hora);
      _correoEnviar(String(p.email).trim(), c.asunto, c.texto, c.html, { nombre: c.remite, replyTo: e.coord });
    });
    Logger.log(TR_EQUIPOS[eq].nombre + ' · ' + info.carpeta + ': faltan ' + personas.length + (personas.length ? ' (' + personas.map(function (p) { return p.nombre; }).join(', ') + ')' : ''));
  });
  return faltan;
}

/* Asunto, texto y HTML del aviso. Sin `persona`: a todo el equipo («hoy toca
   subir las evidencias»). Con `persona`: aviso personal a quien aún no la ha
   subido. manual=true: enviado a mano (sin «hoy»). */
function _correoRecordatorio(info, carpetaUrl, manual, eq, persona, hora) {
  eq = eq || 'rdr';
  var nombreEq = TR_EQUIPOS[eq].nombre;
  var web = TR_CONFIG.WEB_URL + (eq === 'rdr' ? '' : '?equipo=' + eq);
  var fichero = _nombreEvidencia(info, persona || 'Nombre Apellido') + '.pdf';
  var titulo = persona ? 'Te falta subir tu evidencia' : (manual ? 'Toca subir las evidencias' : 'Hoy toca subir las evidencias');
  var asunto = (persona ? '⏳📎 ' : '⏰📎 ') + 'Time Report ' + nombreEq + ' · ' + titulo.toLowerCase() + ' (' + info.etiqueta + ')';
  var saludo = persona ? String(persona).split(' ')[0] : 'equipo';
  var frase = persona
    ? 'Todavía no vemos tu evidencia del Time Report ' + nombreEq + ' de la quincena ' + info.etiqueta + ' en la carpeta. Súbela hoy, por favor.'
    : titulo + ' del Time Report ' + nombreEq + ' de la quincena ' + info.etiqueta + ': cada uno sube la suya a la carpeta de la quincena.';
  var texto = 'Hola ' + saludo + ',\n\n' + frase + '\n\n'
    + '📊 Tu imputación: ' + web + '\n'
    + (carpetaUrl ? '📁 Carpeta de evidencias: ' + carpetaUrl + '\n' : '')
    + '\nEl fichero se renombra solo a «' + fichero + '».'
    + (persona && hora && hora < TR_TRAMOS[TR_TRAMOS.length - 1] ? '\n\nTe lo volveremos a recordar cada dos horas (hasta las ' + TR_TRAMOS[TR_TRAMOS.length - 1] + ':00) mientras falte.' : '');
  var btn = function (href, label, bg) {
    return '<a href="' + href + '" style="display:inline-block;background:' + bg + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;margin:0 8px 8px 0;">' + label + '</a>';
  };
  var html = '<div style="font-family:Lato,Arial,sans-serif;max-width:520px;margin:0 auto;color:#070E46;">'
    + '<div style="background:#001391;color:#F7F8F8;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Time Report ' + nombreEq + ' · BBVA × NFQ</div>'
    +   '<div style="font-family:Georgia,\'Source Serif 4\',serif;font-size:22px;font-weight:bold;margin-top:4px;">' + (persona ? '⏳ ' : '⏰ ') + titulo + '</div></div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;background:#FFFFFF;">'
    +   '<p style="margin:0 0 14px;font-size:15px;">👋 Hola <strong>' + saludo + '</strong>,</p>'
    +   '<p style="margin:0 0 14px;font-size:15px;line-height:1.55;">📅 ' + frase.replace(info.etiqueta, '<strong>' + info.etiqueta + '</strong>') + '</p>'
    +   '<p style="margin:0 0 18px;font-size:15px;line-height:1.55;">'
    +     '✅ Comprueba tu imputación en la web<br>'
    +     '📋 Copia las filas al TR de BBVA<br>'
    +     '📎 Sube tu evidencia a la carpeta de la quincena<br>'
    +     '<span style="font-size:13px;color:#46536D;">Se renombra sola a <code>' + fichero + '</code></span></p>'
    +   (carpetaUrl ? btn(carpetaUrl, '📁 Subir mi evidencia', '#85C8FF') : '')
    +   btn(web, '📊 Ver mi Time Report →', '#FFB56B')
    +   (persona && hora && hora < TR_TRAMOS[TR_TRAMOS.length - 1] ? '<p style="margin:10px 0 0;font-size:12px;color:#46536D;">Te lo recordaremos cada dos horas (hasta las ' + TR_TRAMOS[TR_TRAMOS.length - 1] + ':00) mientras falte.</p>' : '')
    +   '<p style="margin:14px 0 0;font-size:12px;color:#46536D;">Si los botones no van: <a href="' + web + '" style="color:#001391;">' + web + '</a>'
    +   (carpetaUrl ? ' · <a href="' + carpetaUrl + '" style="color:#001391;">carpeta de evidencias</a>' : '') + '</p></div></div>';
  return { asunto: asunto, texto: texto, html: html, remite: 'Time Report ' + nombreEq };
}
