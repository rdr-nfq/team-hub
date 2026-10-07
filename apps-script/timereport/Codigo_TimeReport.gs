/**
 * ============================================================================
 *  TIME REPORT WEB  ·  Apps Script (backend de /timereport y /timereport-gestion)
 * ============================================================================
 *
 *  Almacén del Time Report del equipo: proyectos del trimestre, reparto de
 *  horas por quincena/persona/día, estados (Nivel 2) por quincena, horas
 *  incurridas (manuales) y personas bloqueadas. Los datos viven en un Google
 *  Sheet PROPIO de este script (se crea solo en el primer guardado; su ID
 *  queda en Propiedades del script).
 *
 *  Además:
 *   · EVIDENCIAS por quincena en Drive: carpeta <raíz>/<Año>/<n>_Quincena_<Mes><Año>
 *     (p.ej. 2026/2_Quincena_Junio2026). El backend crea las carpetas, dice
 *     quién ha subido ya su evidencia y quién falta, RENOMBRA los ficheros al
 *     nombre canónico (2_Quincena_Junio2026_PabloLlorente.pdf) y genera un ZIP
 *     con todas para que coordinación lo arrastre al correo del cliente.
 *   · RECORDATORIO por email (9:00, Europe/Madrid) los días 1 y 15 de cada mes
 *     —o el siguiente laborable si caen en finde/festivo— a todo el equipo:
 *     "mañana es el día de enviar las evidencias", con enlace a la web y a la
 *     carpeta de la quincena. Desde noreply@<dominio> (noReply:true).
 *
 *  DESPLIEGUE (proyecto Apps Script INDEPENDIENTE):
 *   1. script.google.com -> Nuevo proyecto -> pegar este fichero.
 *   2. La carpeta raíz de evidencias se lee de links.json ("evidenciasDrive"),
 *      como el resto de enlaces del hub. Debe estar compartida (editor) con el
 *      equipo para que puedan subir sus ficheros.
 *   3. Ejecutar una vez `autorizar` (Drive + Gmail + UrlFetch) y una vez
 *      `crearTriggerRecordatorioTR` (disparador diario a las 9:00).
 *   4. Implementar -> Aplicación web (Ejecutar como YO, Cualquier persona) ->
 *      "Nueva versión" en cada cambio. Pegar la URL /exec en links.json ->
 *      "timereportBackend".
 *
 *  API (GET query o POST text/plain JSON):
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
  PRUEBA_TO: ''
};

var MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

var HOJAS = {
  // 'Personas', 'Incurridas', 'Inicio' y 'Fin' van al FINAL para no romper hojas
  // creadas con versiones previas (las filas antiguas no tienen esas celdas).
  proyectos: ['TR_Proyectos', ['Q', 'Id', 'SDATOOL', 'Nombre', 'Feature', 'Horas', 'Estados', 'Actualizado', 'Personas', 'Incurridas', 'Inicio', 'Fin']],
  reparto: ['TR_Reparto', ['Q', 'Quincena', 'Persona', 'ProyectoId', 'Dias', 'Actualizado']],
  bloqueadas: ['TR_Bloqueadas', ['Q', 'Personas', 'Actualizado']]
};

/* Ejecutar UNA vez desde el editor para conceder los permisos que usan las
   evidencias (Drive), el recordatorio (Gmail) y la lectura de equipo.json
   (UrlFetch). Si tras un cambio aparece "No tienes permiso para llamar a…",
   volver a ejecutarla. */
function autorizar() {
  DriveApp.getRootFolder().getName();
  GmailApp.getAliases();
  UrlFetchApp.fetch(TR_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true });
  Logger.log('Permisos concedidos. Raíz de evidencias (links.json → evidenciasDrive): ' + (_evidenciasRootId() || '(sin configurar)'));
}

function _ss() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DATA_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create('RDR TimeReport Web (datos)');
  props.setProperty('DATA_SPREADSHEET_ID', ss.getId());
  return ss;
}

function _hoja(clave) {
  var def = HOJAS[clave];
  var ss = _ss();
  var sh = ss.getSheetByName(def[0]);
  if (!sh) {
    sh = ss.insertSheet(def[0]);
    sh.getRange(1, 1, 1, def[1].length).setValues([def[1]]);
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
      case 'ping': data = { ok: 1 }; break;
      case 'snapshot': data = getSnapshot(p.q); break;
      case 'guardarProyectos': data = guardarProyectos(p.q, p.proyectos); break;
      case 'guardarReparto': data = guardarReparto(p.q, p.desdeQuincena, p.filas); break;
      case 'guardarBloqueadas': data = guardarBloqueadas(p.q, p.personas); break;
      case 'carpetaEvidencias': data = carpetaEvidencias(p.q, p.quincena, p.raiz); break;
      case 'estadoEvidencias': data = estadoEvidencias(p.q, p.quincena, p.raiz); break;
      case 'descargarEvidencias': data = descargarEvidencias(p.q, p.quincena, p.raiz); break;
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

function _filas(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function _q(v) { return String(v || '').replace(/[_\s]+/g, '').toUpperCase(); }

/* ────────────────────────── Snapshot y guardados ────────────────────────── */

function getSnapshot(q) {
  q = _q(q);
  var qsSet = {};
  var proyectos = [];
  _filas(_hoja('proyectos')).forEach(function (r) {
    var rq = _q(r[0]);
    if (rq) qsSet[rq] = 1;
    if (rq !== q) return;
    var estados = {}, personasProy = [];
    try { estados = JSON.parse(r[6] || '{}'); } catch (e2) {}
    try { personasProy = JSON.parse(r[8] || '[]'); } catch (e5) {}
    proyectos.push({
      id: String(r[1]), sdatool: String(r[2] || ''), nombre: String(r[3] || ''), feature: String(r[4] || ''),
      horas: Number(r[5]) || 0, estados: estados, personas: personasProy,
      incurridas: Number(r[9]) || 0,
      inicio: Number(r[10]) || 1, fin: Number(r[11]) || 0
    });
  });
  var reparto = [];
  _filas(_hoja('reparto')).forEach(function (r) {
    var rq = _q(r[0]);
    if (rq) qsSet[rq] = 1;
    if (rq !== q) return;
    var dias = {};
    try { dias = JSON.parse(r[4] || '{}'); } catch (e3) {}
    reparto.push({ quincena: Number(r[1]) || 0, persona: String(r[2] || ''), proyectoId: String(r[3] || ''), dias: dias });
  });
  var bloqueadas = [];
  _filas(_hoja('bloqueadas')).forEach(function (r) {
    if (_q(r[0]) !== q) return;
    try { bloqueadas = JSON.parse(r[1] || '[]'); } catch (e4) {}
  });
  return {
    generadoEn: new Date().toISOString(),
    q: q, proyectos: proyectos, reparto: reparto, bloqueadas: bloqueadas,
    qs: Object.keys(qsSet).sort(),
    evidenciasConfiguradas: !!_evidenciasRootId()
  };
}

function _borrarDelQ(sh, q, filtroExtra) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (_q(vals[i][0]) !== q) continue;
    if (filtroExtra && !filtroExtra(vals[i])) continue;
    sh.deleteRow(i + 2);
  }
}

function guardarProyectos(q, proyectos) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var sh = _hoja('proyectos');
  // Hojas creadas con versiones previas: añadir la cabecera de las columnas nuevas.
  var cab = HOJAS.proyectos[1];
  if (sh.getLastColumn() < cab.length) sh.getRange(1, 1, 1, cab.length).setValues([cab]);
  _borrarDelQ(sh, q);
  var now = new Date();
  var rows = (proyectos || []).map(function (p) {
    return [q, String(p.id), String(p.sdatool || ''), String(p.nombre || ''), String(p.feature || ''), Number(p.horas) || 0,
      JSON.stringify(p.estados || {}), now, JSON.stringify(p.personas || []), Number(p.incurridas) || 0,
      Number(p.inicio) || 1, Number(p.fin) || 0];
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, cab.length).setValues(rows);
  return { n: rows.length };
}

function guardarReparto(q, desdeQuincena, filas) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var desde = Number(desdeQuincena) || 1;
  var sh = _hoja('reparto');
  _borrarDelQ(sh, q, function (fila) { return (Number(fila[1]) || 0) >= desde; });
  var now = new Date();
  var rows = (filas || [])
    .filter(function (f) { return (Number(f.quincena) || 0) >= desde; })
    .map(function (f) {
      return [q, Number(f.quincena) || 0, String(f.persona || ''), String(f.proyectoId || ''), JSON.stringify(f.dias || {}), now];
    });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
  return { n: rows.length, desde: desde };
}

function guardarBloqueadas(q, personas) {
  q = _q(q);
  if (!q) throw new Error('Falta el Q.');
  var sh = _hoja('bloqueadas');
  _borrarDelQ(sh, q);
  sh.getRange(sh.getLastRow() + 1, 1, 1, 3).setValues([[q, JSON.stringify(personas || []), new Date()]]);
  return { n: (personas || []).length };
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
    etiqueta: (nMes === 1 ? '1-15' : '16-' + ult) + ' de ' + MESES[mes0].toLowerCase() + ' de ' + anio
  };
}

function _sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function _nombreFichero(persona) { return _sinAcentos(persona).replace(/[^A-Za-z0-9]+/g, ''); }
function _norm(s) { return _sinAcentos(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

/* Equipo (equipo.json del hub): [{nombre, email, emailBBVA, coordinador…}] */
function _equipo() {
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
function _evidenciasRootId(raiz) {
  var directo = _idDeUrl(raiz);
  if (directo) return directo;
  var cache = CacheService.getScriptCache();
  var hit = cache.get('evidenciasRootId');
  if (hit) return hit;
  var id = '';
  try {
    var resp = UrlFetchApp.fetch(TR_CONFIG.LINKS_JSON_URL, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode());
    var links = JSON.parse(resp.getContentText());
    var e = links.evidenciasDrive;
    id = _idDeUrl(e ? (typeof e === 'string' ? e : e.url) : '');
  } catch (err) { Logger.log('links.json: ' + err); }
  if (!id) id = PropertiesService.getScriptProperties().getProperty('EVIDENCIAS_FOLDER_ID') || '';
  if (id) cache.put('evidenciasRootId', id, 600);
  return id;
}

/* Diagnóstico (ejecutar desde el editor): qué ve el script de links.json y
   de la carpeta raíz. */
function diagnosticarEvidencias() {
  var resp = UrlFetchApp.fetch(TR_CONFIG.LINKS_JSON_URL, { muteHttpExceptions: true });
  Logger.log('links.json HTTP ' + resp.getResponseCode() + ' (' + TR_CONFIG.LINKS_JSON_URL + ')');
  var links = JSON.parse(resp.getContentText());
  Logger.log('evidenciasDrive en links.json: ' + JSON.stringify(links.evidenciasDrive || null));
  CacheService.getScriptCache().remove('evidenciasRootId');
  var id = _evidenciasRootId();
  Logger.log('Id de la raíz: ' + (id || '(ninguno)'));
  if (id) {
    var f = DriveApp.getFolderById(id);
    Logger.log('Carpeta raíz: "' + f.getName() + '" ' + f.getUrl());
  }
}

function _subcarpeta(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/* Carpeta <raíz>/<Año>/<n>_Quincena_<Mes><Año>; se crea si no existe. */
function _carpetaQuincena(info, raiz) {
  var rootId = _evidenciasRootId(raiz);
  if (!rootId) throw new Error('Evidencias sin configurar: falta la clave "evidenciasDrive" (carpeta raíz de Drive) en links.json (ejecuta diagnosticarEvidencias en el editor).');
  var root = DriveApp.getFolderById(rootId);
  return _subcarpeta(_subcarpeta(root, String(info.anio)), info.carpeta);
}

function carpetaEvidencias(q, quincena, raiz) {
  var info = _infoQuincena(q, quincena);
  var f = _carpetaQuincena(info, raiz);
  return { id: f.getId(), url: f.getUrl(), nombre: info.carpeta, etiqueta: info.etiqueta };
}

var _ZIP_RE = /\.zip$/i;

/* ¿De quién es este fichero? 1) por el nombre (nombre canónico, o el mayor
   número de letras de nombre/apellidos que contenga, si es único); 2) por el
   propietario del fichero (email del equipo). null = sin identificar. */
function _identificar(file, team) {
  var base = _norm(file.getName().replace(/\.[^.]+$/, ''));
  var compacto = base.replace(/\s+/g, '');
  var mejor = null, mejorScore = 0, empate = false;
  team.forEach(function (p) {
    var n = _norm(p.nombre);
    var canon = n.replace(/\s+/g, '');
    var score = 0;
    if (canon && compacto.indexOf(canon) >= 0) score = 100;
    else n.split(' ').forEach(function (t) { if (t.length >= 3 && compacto.indexOf(t) >= 0) score += t.length; });
    if (score > mejorScore) { mejor = p; mejorScore = score; empate = false; }
    else if (score > 0 && score === mejorScore) empate = true;
  });
  if (mejor && !empate && mejorScore >= 4) return mejor;
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
function estadoEvidencias(q, quincena, raiz) {
  var info = _infoQuincena(q, quincena);
  var folder = _carpetaQuincena(info, raiz);
  var team = _equipo();
  var entregados = [], sinIdentificar = [], zip = null;
  var usados = {}; // nombre canónico ya asignado en esta carpeta -> nº de ficheros
  var it = folder.getFiles();
  var ficheros = [];
  while (it.hasNext()) ficheros.push(it.next());
  ficheros.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });
  ficheros.forEach(function (file) {
    var nombre = file.getName();
    if (_ZIP_RE.test(nombre)) { zip = { nombre: nombre, url: 'https://drive.google.com/uc?export=download&id=' + file.getId(), verUrl: file.getUrl() }; return; }
    var p = _identificar(file, team);
    if (!p) { sinIdentificar.push({ fichero: nombre, url: file.getUrl() }); return; }
    var extM = /\.([A-Za-z0-9]{1,6})$/.exec(nombre);
    var ext = extM ? '.' + extM[1].toLowerCase() : (file.getMimeType() === MimeType.PDF ? '.pdf' : '');
    var canon = info.carpeta + '_' + _nombreFichero(p.nombre);
    usados[canon] = (usados[canon] || 0) + 1;
    var deseado = canon + (usados[canon] > 1 ? '_' + usados[canon] : '') + ext;
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
function descargarEvidencias(q, quincena, raiz) {
  var info = _infoQuincena(q, quincena);
  var folder = _carpetaQuincena(info, raiz);
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

/* Ejecutar UNA vez: disparador diario a las 9:00 (Europe/Madrid). El propio
   handler decide si hoy toca (día 1 / 15 o el siguiente laborable). */
function crearTriggerRecordatorioTR() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'enviarRecordatorioTR') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('enviarRecordatorioTR').timeBased().everyDays(1).atHour(9).inTimezone(TR_CONFIG.TZ).create();
  Logger.log('Disparador creado: enviarRecordatorioTR, diario a las 9:00 (' + TR_CONFIG.TZ + ').');
}

function _hoyISO() { return Utilities.formatDate(new Date(), TR_CONFIG.TZ, 'yyyy-MM-dd'); }

/* Festivos de España del backend de vacaciones ({iso:"ES"|"MX"|"AMBOS"}). {} si falla. */
function _festivosES() {
  try {
    var links = JSON.parse(UrlFetchApp.fetch(TR_CONFIG.LINKS_JSON_URL, { muteHttpExceptions: true }).getContentText());
    var url = links.vacacionesBackend && links.vacacionesBackend.url;
    if (!url) return {};
    var d = JSON.parse(UrlFetchApp.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'modo=publico', { muteHttpExceptions: true, followRedirects: true }).getContentText());
    var out = {};
    Object.keys(d.festivos || {}).forEach(function (k) { if (d.festivos[k] === 'ES' || d.festivos[k] === 'AMBOS') out[k] = 1; });
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

/* Si hoy es el día de recordar (1 o 15, o el primer laborable después), devuelve
   la quincena que CIERRA: {q, quincena, info}. Si no toca, null. */
function _quincenaARecordar(hoy, festivos) {
  var p = hoy.split('-').map(Number);
  var anio = p[0], mes0 = p[1] - 1, dia = p[2];
  var ult = new Date(anio, mes0 + 1, 0).getDate();
  var anclas = [1, 15];
  for (var i = 0; i < anclas.length; i++) {
    var d = anclas[i];
    while (d <= ult && !_esLaborable(_iso(anio, mes0, d), festivos)) d++;
    if (d !== dia) continue;
    // Día 1 → cierra la 2ª quincena del mes anterior; día 15 → la 1ª de este mes.
    var mesQ = anclas[i] === 1 ? mes0 - 1 : mes0;
    var anioQ = anio;
    if (mesQ < 0) { mesQ = 11; anioQ--; }
    var q = anioQ + 'Q' + (Math.floor(mesQ / 3) + 1);
    var quincena = (mesQ % 3) * 2 + (anclas[i] === 1 ? 2 : 1);
    return { q: q, quincena: quincena, info: _infoQuincena(q, quincena) };
  }
  return null;
}

/* Handler del disparador diario. */
function enviarRecordatorioTR() {
  var hoy = _hoyISO();
  var r = _quincenaARecordar(hoy, _festivosES());
  if (!r) { Logger.log(hoy + ': hoy no toca recordatorio.'); return; }
  var carpetaUrl = '';
  try { carpetaUrl = _carpetaQuincena(r.info).getUrl(); } catch (e) { Logger.log('carpeta: ' + e); }
  var team = _equipo();
  var n = 0;
  team.forEach(function (p) {
    if (!p.email) return;
    _enviarRecordatorio(p.email, p.nombre, r.info, carpetaUrl, '');
    n++;
  });
  Logger.log(hoy + ': recordatorio de ' + r.info.carpeta + ' enviado a ' + n + ' personas.');
}

/* Prueba: manda el recordatorio de la quincena en curso a PRUEBA_TO (o a quien ejecuta). */
function enviarRecordatorioTRPrueba() {
  var hoy = _hoyISO();
  var p = hoy.split('-').map(Number);
  var q = p[0] + 'Q' + (Math.floor((p[1] - 1) / 3) + 1);
  var quincena = ((p[1] - 1) % 3) * 2 + (p[2] <= 15 ? 1 : 2);
  var info = _infoQuincena(q, quincena);
  var carpetaUrl = '';
  try { carpetaUrl = _carpetaQuincena(info).getUrl(); } catch (e) { Logger.log('carpeta: ' + e); }
  var to = TR_CONFIG.PRUEBA_TO || Session.getActiveUser().getEmail();
  _enviarRecordatorio(to, 'compañero/a', info, carpetaUrl, '[PRUEBA] ');
  Logger.log('Prueba enviada a ' + to + ' (' + info.carpeta + ').');
}

function _enviarRecordatorio(to, nombre, info, carpetaUrl, prefijo) {
  var asunto = (prefijo || '') + '⏰ Time Report · mañana toca enviar las evidencias (' + info.etiqueta + ')';
  var texto = 'Hola ' + nombre + ', mañana es el día de enviar las evidencias del Time Report de la quincena ' + info.etiqueta + '.\n'
    + 'Tu imputación: ' + TR_CONFIG.WEB_URL + (carpetaUrl ? '\nCarpeta de evidencias: ' + carpetaUrl : '');
  var btn = function (href, label, bg) {
    return '<a href="' + href + '" style="display:inline-block;background:' + bg + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;margin:0 8px 8px 0;">' + label + '</a>';
  };
  var html = '<div style="font-family:Lato,Arial,sans-serif;max-width:520px;margin:0 auto;color:#070E46;">'
    + '<div style="background:#001391;color:#F7F8F8;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Time Report RDR · BBVA × NFQ</div>'
    +   '<div style="font-family:Georgia,\'Source Serif 4\',serif;font-size:22px;font-weight:bold;margin-top:4px;">⏰ Mañana toca enviar las evidencias</div></div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;background:#FFFFFF;">'
    +   '<p style="margin:0 0 14px;font-size:15px;">Hola <strong>' + nombre + '</strong>,</p>'
    +   '<p style="margin:0 0 18px;font-size:15px;line-height:1.55;"><strong>Mañana es el día de enviar las evidencias</strong> del Time Report de la quincena <strong>' + info.etiqueta + '</strong>. '
    +   'Comprueba tu imputación en la web, copia las filas al TR de BBVA y sube tu evidencia a la carpeta de la quincena'
    +   (carpetaUrl ? ' (el fichero se renombra solo a <code>' + info.carpeta + '_TuNombre.pdf</code>)' : '') + '.</p>'
    +   btn(TR_CONFIG.WEB_URL, 'Ver mi Time Report →', '#FFB56B')
    +   (carpetaUrl ? btn(carpetaUrl, 'Subir evidencias', '#85C8FF') : '')
    +   '<p style="margin:14px 0 0;font-size:12px;color:#46536D;">Si los botones no van: <a href="' + TR_CONFIG.WEB_URL + '" style="color:#001391;">' + TR_CONFIG.WEB_URL + '</a>'
    +   (carpetaUrl ? ' · <a href="' + carpetaUrl + '" style="color:#001391;">carpeta de evidencias</a>' : '') + '</p></div></div>';
  GmailApp.sendEmail(to, asunto, texto, { htmlBody: html, name: TR_CONFIG.REMITE, noReply: true });
}
