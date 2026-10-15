/**
 * ARCHIVO: Codigo_Retrospectiva.gs
 * Backend para Retro RDR servido como API JSON consumida desde GitHub Pages.
 *
 * ESTADOS DE SESIÓN (columna 4 de la hoja 'Sesiones'):
 *   - ACTIVE    → en curso o disponible para unirse. Aparece en el desplegable.
 *   - ARCHIVED  → terminada, se conserva en el histórico (lectura).
 *   - INACTIVE  → prueba/error, oculta. Sólo accesible desde "gestionar inactivas".
 *
 * IMPORTANTE:
 * - Todas las acciones se hacen vía POST (excepto la lectura inicial vía GET)
 *   con Content-Type: text/plain para evitar el preflight CORS del navegador.
 * - doPost recibe el cuerpo en e.postData.contents (JSON serializado).
 * - doGet sirve para health-check y lectura de listas vía query string.
 * - Las respuestas son siempre TextOutput con MimeType.JSON.
 *
 * DESPLIEGUE: forma parte del proyecto único de apps-script/ (?app=retro;
 * ver apps-script/README.md). La hoja «Retrospectiva RDR» (pestañas Sesiones,
 * Usuarios, Tarjetas, Mejoras y Termometro) se abre por id:
 * _hubHoja('RETRO') en _comun/Hub.gs.
 */

// =================================================================
// ROUTER
// =================================================================

function doGetRetro(e) {
  // GET sólo para acciones de lectura (más rápidas y cacheables).
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    var data;
    switch (action) {
      case 'ping':            data = { ok: true, ts: Date.now() }; break;
      case 'listaSesiones':   data = obtenerListaSesiones(); break;
      case 'historico':       data = obtenerHistorico(); break;
      case 'inactivas':       data = obtenerInactivas(); break;
      case 'datosCompletos':  data = obtenerDatosCompletos(e.parameter.id); break;
      default: throw new Error("Acción GET desconocida: " + action);
    }
    return _jsonRetro({ ok: true, data: data });
  } catch (err) {
    return _jsonRetro({ ok: false, error: err.message || String(err) });
  }
}

function doPostRetro(e) {
  // POST para todas las mutaciones. Body: JSON con {action, ...payload}.
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) throw new Error("Body vacío");
    var body = JSON.parse(raw);
    var action = body.action;
    var data;
    switch (action) {
      case 'crearSesion':         data = crearSesion(body.fechaStr, body.nombreSesion); break;
      case 'cambiarEstadoSesion': data = cambiarEstadoSesion(body.idSesion, body.estado); break;
      case 'eliminarSesion':      data = eliminarSesion(body.idSesion); break;
      case 'registrarUsuario':    registrarUsuario(body.idSesion, body.nombre); data = true; break;
      case 'crearTarjeta':        data = crearTarjeta(body.idSesion, body.categoria, body.texto); break;
      case 'crearMejora':         data = crearMejora(body.idSesion, body.texto); break;
      case 'votarTarjeta':        data = votarTarjeta(body.idSesion, body.idTarjeta); break;
      case 'votoTermometro':      data = enviarVotoTermometro(body.idSesion, body.idOpcionVoto); break;
      case 'cambiarFase':         data = cambiarFase(body.idSesion, body.nuevaFase); break;
      default: throw new Error("Acción POST desconocida: " + action);
    }
    return _jsonRetro({ ok: true, data: data });
  } catch (err) {
    return _jsonRetro({ ok: false, error: err.message || String(err) });
  }
}

function _jsonRetro(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =================================================================
// CACHÉ — acelera el polling de datosCompletos
// =================================================================
// Estrategia: cacheamos el JSON ya serializado de cada sesión durante
// CACHE_TTL_SEC. Cualquier mutación invalida la caché de esa sesión y
// también la de la lista de sesiones. Esto reduce drásticamente el
// nº de lecturas a SpreadsheetApp (caras: ~100-300ms cada una).

var RETRO_CACHE_TTL = 30; // los datos se refrescan cada 30s aunque nadie escriba
// Prefijo «retro:»: la caché es la misma para todo el proyecto único.
var RETRO_CACHE_DATOS = function (id) { return 'retro:datos:' + String(id).trim(); };
var RETRO_CACHE_LISTA = 'retro:lista:activas';
var RETRO_CACHE_HIST  = 'retro:lista:archived';
var RETRO_CACHE_INAC  = 'retro:lista:inactive';

function _cacheGetRetro(key) {
  try {
    var raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _cachePutRetro(key, value) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), RETRO_CACHE_TTL);
  } catch (e) { /* ignorar: la caché es opcional */ }
}

function _cacheInvalidarRetro(idSesion) {
  try {
    CacheService.getScriptCache().removeAll([
      RETRO_CACHE_DATOS(idSesion),
      RETRO_CACHE_LISTA,
      RETRO_CACHE_HIST,
      RETRO_CACHE_INAC,
    ]);
  } catch (e) { /* ignorar */ }
}

// =================================================================
// LÓGICA (idéntica a la original; sólo cambia que ya no se llama
// desde HtmlService sino desde fuera)
// =================================================================

function obtenerListaSesiones() {
  // Caché: leemos de SpreadsheetApp es caro (~100-300ms). Esta lista
  // cambia raramente, así que la cacheamos.
  var cached = _cacheGetRetro(RETRO_CACHE_LISTA);
  if (cached) return cached;

  var sheet = _hubHoja('RETRO').getSheetByName('Sesiones');
  if (!sheet) throw new Error("No se encuentra la pestaña 'Sesiones'");

  var data = sheet.getDataRange().getValues();
  var sesiones = [];

  for (var i = 1; i < data.length; i++) {
    // Solo ACTIVE. Las filas sin estado se tratan como ACTIVE por compatibilidad
    // hacia atrás (filas creadas antes de que existiera la columna).
    if (data[i][0] && (data[i][3] === 'ACTIVE' || !data[i][3])) {
      var fechaCelda = data[i][1];
      var fechaTexto = (fechaCelda instanceof Date)
        ? Utilities.formatDate(fechaCelda, Session.getScriptTimeZone(), "dd/MM/yyyy")
        : String(fechaCelda);
      var nombreSesion = data[i][4] ? " - " + data[i][4] : "";
      sesiones.push({
        id: String(data[i][0]).trim(),
        fecha: fechaTexto + nombreSesion,
        fase: Number(data[i][2])
      });
    }
  }
  _cachePutRetro(RETRO_CACHE_LISTA, sesiones);
  return sesiones;
}

/**
 * Devuelve las sesiones ARCHIVED como histórico, con metadatos pre-calculados
 * (nº de participantes, tarjetas, votos termómetro) para que el listado del
 * frontend pueda mostrarlos sin tener que abrir cada sesión.
 */
function obtenerHistorico() {
  var cached = _cacheGetRetro(RETRO_CACHE_HIST);
  if (cached) return cached;
  var r = _obtenerSesionesPorEstado('ARCHIVED', true);
  _cachePutRetro(RETRO_CACHE_HIST, r);
  return r;
}

/**
 * Devuelve las sesiones INACTIVE (pruebas/errores) con los mismos metadatos
 * para facilitar la decisión de reactivar o eliminar permanentemente.
 */
function obtenerInactivas() {
  var cached = _cacheGetRetro(RETRO_CACHE_INAC);
  if (cached) return cached;
  var r = _obtenerSesionesPorEstado('INACTIVE', true);
  _cachePutRetro(RETRO_CACHE_INAC, r);
  return r;
}

/**
 * Núcleo compartido: lista sesiones de un estado, con (opcional) recuento
 * de participantes/tarjetas/mejoras/votos por sesión.
 *
 * Hace UNA sola pasada por cada hoja (Tarjetas/Mejoras/Termometro/Usuarios)
 * y agrupa por idSesion en mapas, en lugar de iterar N veces. Esto importa
 * mucho cuando haya muchas sesiones archivadas.
 */
function _obtenerSesionesPorEstado(estado, conMetadatos) {
  var ss = _hubHoja('RETRO');
  var sheetSesiones = ss.getSheetByName('Sesiones');
  if (!sheetSesiones) throw new Error("No se encuentra la pestaña 'Sesiones'");

  var data = sheetSesiones.getDataRange().getValues();
  var sesiones = [];
  var ids = {}; // map: idSesion -> índice en sesiones[]
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][3] === estado) {
      var id = String(data[i][0]).trim();
      var fechaCelda = data[i][1];
      var fechaTexto = (fechaCelda instanceof Date)
        ? Utilities.formatDate(fechaCelda, Session.getScriptTimeZone(), "dd/MM/yyyy")
        : String(fechaCelda);
      var fechaOrden = (fechaCelda instanceof Date)
        ? fechaCelda.getTime()
        : _fechaRetro(String(fechaCelda));
      sesiones.push({
        id: id,
        fecha: fechaTexto,
        nombre: data[i][4] || '',
        fechaOrden: fechaOrden,   // para ordenar; se elimina al final
        participantes: 0,
        tarjetas: 0,
        mejoras: 0,
        votosTermometro: 0,
      });
      ids[id] = sesiones.length - 1;
    }
  }

  if (conMetadatos && sesiones.length) {
    _contarRetro(ss, 'Usuarios',   ids, sesiones, 'participantes', 0); // col 0 = idSesion
    _contarRetro(ss, 'Tarjetas',   ids, sesiones, 'tarjetas',      1); // col 1 = idSesion
    _contarRetro(ss, 'Mejoras',    ids, sesiones, 'mejoras',       1); // col 1 = idSesion
    _contarRetro(ss, 'Termometro', ids, sesiones, 'votosTermometro', 0); // col 0 = idSesion
  }

  // Ordenar por fecha descendente (más reciente primero) y limpiar fechaOrden
  sesiones.sort(function (a, b) { return b.fechaOrden - a.fechaOrden; });
  sesiones.forEach(function (s) { delete s.fechaOrden; });

  return sesiones;
}

/** Helper para contar filas por sesión sin reescribir el loop 4 veces. */
function _contarRetro(ss, nombreHoja, ids, sesiones, prop, colId) {
  var hoja = ss.getSheetByName(nombreHoja);
  if (!hoja) return;
  var datos = hoja.getDataRange().getValues();
  // Para 'Usuarios' contamos nombres únicos por sesión
  var setNombres = (nombreHoja === 'Usuarios') ? {} : null;
  for (var i = 1; i < datos.length; i++) {
    var id = String(datos[i][colId] || '').trim();
    if (!id || !(id in ids)) continue;
    if (setNombres) {
      var nombre = String(datos[i][1] || '').trim();
      if (!nombre) continue;
      var key = id + '|' + nombre;
      if (setNombres[key]) continue;
      setNombres[key] = true;
    }
    sesiones[ids[id]][prop]++;
  }
}

/** Parsea 'dd/MM/yyyy' a timestamp; si falla devuelve 0. */
function _fechaRetro(s) {
  var p = (s || '').split(' - ')[0].split('/');
  if (p.length !== 3) return 0;
  var d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function crearSesion(fechaStr, nombreSesion) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _hubHoja('RETRO').getSheetByName('Sesiones');
    var idSesion = Utilities.getUuid();
    sheet.appendRow([idSesion, fechaStr, 1, 'ACTIVE', nombreSesion || '']);
    _cacheInvalidarRetro(idSesion);
    return idSesion;
  } finally { lock.releaseLock(); }
}


/**
 * Cambia el estado de una sesión. Estados válidos: ACTIVE, ARCHIVED, INACTIVE.
 * Devuelve la lista de sesiones activas actualizada (para refrescar el menú).
 */
function cambiarEstadoSesion(idSesion, estado) {
  var ESTADOS = ['ACTIVE', 'ARCHIVED', 'INACTIVE'];
  if (ESTADOS.indexOf(estado) === -1) {
    throw new Error("Estado no válido: " + estado);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _hubHoja('RETRO').getSheetByName('Sesiones');
    var data = sheet.getDataRange().getValues();
    var encontrado = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(idSesion).trim()) {
        sheet.getRange(i + 1, 4).setValue(estado);
        encontrado = true;
        break;
      }
    }
    if (!encontrado) throw new Error("Sesión no encontrada");
    _cacheInvalidarRetro(idSesion);
    return obtenerListaSesiones();
  } finally { lock.releaseLock(); }
}

/**
 * Elimina PERMANENTEMENTE una sesión: borra la fila de Sesiones y todos los
 * datos asociados en Termometro/Tarjetas/Mejoras/Usuarios. Irreversible.
 * Devuelve la lista actualizada de sesiones inactivas (la pantalla que llama).
 */
function eliminarSesion(idSesion) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = _hubHoja('RETRO');
    var sheet = ss.getSheetByName('Sesiones');
    var cleanId = String(idSesion).trim();
    var data = sheet.getDataRange().getValues();
    var encontrado = false;
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).trim() === cleanId) {
        sheet.deleteRow(i + 1);
        encontrado = true;
        break;
      }
    }
    if (!encontrado) throw new Error("Sesión no encontrada");
    borrarDatosHuerfanos(ss, cleanId);
    _cacheInvalidarRetro(cleanId);
    return obtenerInactivas();
  } finally { lock.releaseLock(); }
}

/** Borra todas las filas asociadas a una sesión en las hojas dependientes. */
function borrarDatosHuerfanos(ss, idSesion) {
  var cleanId = String(idSesion).trim();
  var hojas = ['Termometro', 'Tarjetas', 'Mejoras', 'Usuarios'];
  hojas.forEach(function (nombreHoja) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (hoja) {
      var datos = hoja.getDataRange().getValues();
      for (var j = datos.length - 1; j >= 1; j--) {
        // En Termometro y Usuarios el idSesion está en col 0; en Tarjetas y
        // Mejoras está en col 1 (porque la col 0 es el id del propio registro).
        var colId = (nombreHoja === 'Termometro' || nombreHoja === 'Usuarios') ? 0 : 1;
        if (String(datos[j][colId]).trim() === cleanId) {
          hoja.deleteRow(j + 1);
        }
      }
    }
  });
}

function registrarUsuario(idSesion, nombre) {
  if (!nombre || String(nombre).trim() === 'Anónimo') return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = _hubHoja('RETRO').getSheetByName('Usuarios');
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var cleanId = String(idSesion).trim();
    var cleanNombre = String(nombre).trim();
    var existe = false;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === cleanId && String(data[i][1]).trim() === cleanNombre) {
        existe = true; break;
      }
    }
    if (!existe) {
      sheet.appendRow([cleanId, cleanNombre]);
      _cacheInvalidarRetro(cleanId);
    }
  } finally { lock.releaseLock(); }
}

function obtenerDatosCompletos(idSesion) {
  if (!idSesion) throw new Error("Falta idSesion");
  var cleanId = String(idSesion).trim();

  // Caché de respuestas completas. Acelera muchísimo el polling (cada
  // participante pregunta cada 3s). Las mutaciones invalidan la caché.
  var cached = _cacheGetRetro(RETRO_CACHE_DATOS(cleanId));
  if (cached) return cached;

  var ss = _hubHoja('RETRO');

  var hojaSesiones = ss.getSheetByName('Sesiones');
  var datosSesiones = hojaSesiones ? hojaSesiones.getDataRange().getValues() : [];
  var faseActual = 1;
  var nombreSesion = '';
  for (var i = 1; i < datosSesiones.length; i++) {
    if (String(datosSesiones[i][0]).trim() === cleanId) {
      faseActual = datosSesiones[i][2];
      nombreSesion = datosSesiones[i][4] || '';
      break;
    }
  }

  var hojaTermometro = ss.getSheetByName('Termometro');
  var datosTermometro = hojaTermometro ? hojaTermometro.getDataRange().getValues() : [];
  var termometro = [];
  for (var i = 1; i < datosTermometro.length; i++) {
    if (String(datosTermometro[i][0]).trim() === cleanId) {
      termometro.push({ voto: datosTermometro[i][1] });
    }
  }

  var hojaTarjetas = ss.getSheetByName('Tarjetas');
  var datosTarjetas = hojaTarjetas ? hojaTarjetas.getDataRange().getValues() : [];
  var tarjetas = [];
  for (var i = 1; i < datosTarjetas.length; i++) {
    if (String(datosTarjetas[i][1]).trim() === cleanId) {
      tarjetas.push({
        id: datosTarjetas[i][0],
        categoria: datosTarjetas[i][2],
        texto: datosTarjetas[i][3],
        votos: datosTarjetas[i][4] || 0
      });
    }
  }

  var hojaMejoras = ss.getSheetByName('Mejoras');
  var datosMejoras = hojaMejoras ? hojaMejoras.getDataRange().getValues() : [];
  var mejoras = [];
  for (var i = 1; i < datosMejoras.length; i++) {
    if (String(datosMejoras[i][1]).trim() === cleanId) {
      mejoras.push({
        id: datosMejoras[i][0],
        texto: datosMejoras[i][2],
        check: datosMejoras[i][3]
      });
    }
  }

  var usuarios = [];
  var hojaUsuarios = ss.getSheetByName('Usuarios');
  if (hojaUsuarios) {
    var datosUsu = hojaUsuarios.getDataRange().getValues();
    for (var i = 1; i < datosUsu.length; i++) {
      if (String(datosUsu[i][0]).trim() === cleanId && datosUsu[i][1]) {
        usuarios.push(String(datosUsu[i][1]).trim());
      }
    }
  }

  var resultado = {
    fase: faseActual,
    nombreSesion: nombreSesion,
    termometro: termometro,
    tarjetas: tarjetas,
    mejoras: mejoras,
    usuarios: usuarios,
    // rev: timestamp del momento de la lectura. El frontend lo usa para
    // descartar respuestas viejas que llegan tarde por culpa del polling.
    rev: Date.now()
  };
  _cachePutRetro(RETRO_CACHE_DATOS(cleanId), resultado);
  return resultado;
}

function crearTarjeta(idSesion, categoria, texto) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = _hubHoja('RETRO').getSheetByName('Tarjetas');
    var idTarjeta = Utilities.getUuid();
    hoja.appendRow([idTarjeta, idSesion, categoria, texto, 0]);
    _cacheInvalidarRetro(idSesion);
    return obtenerDatosCompletos(idSesion);
  } finally { lock.releaseLock(); }
}

function crearMejora(idSesion, texto) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = _hubHoja('RETRO').getSheetByName('Mejoras');
    var idMejora = Utilities.getUuid();
    hoja.appendRow([idMejora, idSesion, texto, false]);
    _cacheInvalidarRetro(idSesion);
    return obtenerDatosCompletos(idSesion);
  } finally { lock.releaseLock(); }
}

function votarTarjeta(idSesion, idTarjeta) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = _hubHoja('RETRO').getSheetByName('Tarjetas');
    var datos = hoja.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (datos[i][0] == idTarjeta) {
        var votosActuales = Number(datos[i][4]) || 0;
        hoja.getRange(i + 1, 5).setValue(votosActuales + 1);
        break;
      }
    }
    _cacheInvalidarRetro(idSesion);
    return obtenerDatosCompletos(idSesion);
  } finally { lock.releaseLock(); }
}

function enviarVotoTermometro(idSesion, idOpcionVoto) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = _hubHoja('RETRO').getSheetByName('Termometro');
    hoja.appendRow([idSesion, idOpcionVoto]);
    _cacheInvalidarRetro(idSesion);
    return obtenerDatosCompletos(idSesion);
  } finally { lock.releaseLock(); }
}

function cambiarFase(idSesion, nuevaFase) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = _hubHoja('RETRO').getSheetByName('Sesiones');
    var datos = hoja.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === String(idSesion).trim()) {
        hoja.getRange(i + 1, 3).setValue(nuevaFase);
        break;
      }
    }
    _cacheInvalidarRetro(idSesion);
    return obtenerDatosCompletos(idSesion);
  } finally { lock.releaseLock(); }
}