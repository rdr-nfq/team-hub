/**
 * ============================================================================
 *  FORMACIONES · certificados → progreso del equipo (proyecto único, ?app=formaciones)
 * ============================================================================
 *
 *  1. syncCertificates (disparador cada 5 min, lo crea instalarDisparadores)
 *     lee la carpeta de Drive donde se suben los PDFs de certificados
 *     ({userId}__{courseId}__{YYYYMMDD}.pdf) y los apunta en la pestaña
 *     «Certificados» de la hoja Certificados_Formaciones (HUB_HOJAS.FORMACIONES).
 *     Cada fichero es UNA fila (se identifica por su id de Drive): si se
 *     renombra un PDF (p. ej. para corregir el userId), se actualiza su fila
 *     en vez de añadir otra.
 *  2. doGetFormaciones devuelve todos los registros en JSON para
 *     /formacion/equipo y el progreso de cada persona (records por userId =
 *     id de equipo.json).
 *
 *  Desde el editor: syncCertificates() a mano; resetearCertificados() vacía
 *  la pestaña (se vuelve a llenar en la siguiente sincronización).
 * ============================================================================
 */

// Carpeta de Drive con los PDFs de certificados.
const FORM_CARPETA_ID = '1e5zysoDRyBIj30VrKtC6jLPhDzpRQDgl';

// Nombre de la pestaña del Sheet donde guardamos los registros
const FORM_HOJA = 'Certificados';

/**
 * Sincroniza la carpeta de Drive con el Sheet: añade los PDFs nuevos y
 * actualiza la fila de los que se han renombrado.
 */
function syncCertificates() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { Logger.log('Otra sincronización en curso: se omite esta.'); return { added: 0, updated: 0, skipped: 0 }; }
  try {
    const sheet = _hojaFormaciones();
    let filas = _refsFormaciones(sheet); // fileId -> { fila, ref }
    // Filas repetidas del mismo fichero (renombrados con la versión anterior
    // de este script): se borran y se queda la última.
    if (filas._repetidas.length) {
      filas._repetidas.sort(function (a, b) { return b - a; }).forEach(function (f) { sheet.deleteRow(f); });
      Logger.log('Borradas ' + filas._repetidas.length + ' filas repetidas del mismo fichero.');
      filas = _refsFormaciones(sheet);
    }
    delete filas._repetidas;
    const refs = {};
    Object.keys(filas).forEach(function (id) { refs[filas[id].ref] = true; });
    const files = DriveApp.getFolderById(FORM_CARPETA_ID).getFiles();
    let added = 0, updated = 0, skipped = 0;
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if (!name.toLowerCase().endsWith('.pdf')) continue;
      // {userId}__{courseId}__{YYYYMMDD}.pdf
      const ref = name.replace(/\.pdf$/i, '');
      const parts = ref.split('__');
      if (parts.length !== 3) { Logger.log('Nombre con formato no válido: ' + name); continue; }
      const [userId, courseId, dateStr] = parts;
      if (!/^\d{8}$/.test(dateStr)) { Logger.log('Fecha inválida en: ' + name); continue; }
      const previa = filas[file.getId()];
      if (previa) {
        if (previa.ref === ref) { skipped++; continue; }
        // Renombrado: misma fila, datos nuevos.
        sheet.getRange(previa.fila, 1, 1, 4).setValues([[ref, userId, courseId, dateStr]]);
        Logger.log('Renombrado: ' + previa.ref + ' → ' + ref);
        previa.ref = ref;
        updated++;
        continue;
      }
      if (refs[ref]) { skipped++; continue; } // mismo nombre en otro fichero (duplicado)
      sheet.appendRow([ref, userId, courseId, dateStr, file.getUrl(), file.getId(), new Date().toISOString()]);
      filas[file.getId()] = { fila: sheet.getLastRow(), ref: ref };
      refs[ref] = true;
      added++;
    }
    Logger.log('Sincronización completa: ' + added + ' nuevos, ' + updated + ' renombrados, ' + skipped + ' sin cambios.');
    return { added: added, updated: updated, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

/* Disparador de la sincronización (lo llama instalarDisparadores; se puede
   repetir: no duplica). */
function instalarSincronizacionFormaciones() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncCertificates') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncCertificates').timeBased().everyMinutes(5).create();
}

/**
 * Endpoint público: devuelve todos los registros como JSON.
 * URL: <hubBackend>?app=formaciones
 *
 * Cada record incluye los campos crudos del Sheet + un objeto `courseMeta`
 * derivado del courseId (nombre legible, nivel, track) para que la web no
 * necesite mantener un catálogo aparte.
 */
function doPostFormaciones(e) { return doGetFormaciones(e); } // solo lectura

function doGetFormaciones(e) {
  try {
    const sheet = _hojaFormaciones();
    const data = sheet.getDataRange().getValues();

    // Cabecera en la primera fila
    if (data.length <= 1) {
      return _jsonFormaciones({ records: [], updatedAt: new Date().toISOString() });
    }

    // [ref, userId, courseId, date, fileUrl, fileId, importedAt]
    const records = data.slice(1).map(row => {
      const courseId = row[2];
      return {
        ref: row[0],
        userId: row[1],
        courseId: courseId,
        date: row[3],
        fileUrl: row[4],
        courseMeta: _metaCursoFormaciones(courseId),
      };
    });

    return _jsonFormaciones({
      records: records,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return _jsonFormaciones({ error: err.toString() });
  }
}

/**
 * Deriva metadatos legibles a partir del courseId.
 *
 * Convención esperada del courseId:
 *   form-{track}-{nivel}-{slug}
 *
 * Ejemplos:
 *   form-welcome-0-que-es-rdr      → { track: "welcome",   nivel: 0, nombre: "¿Qué es RDR?" }
 *   form-functional-1-finance-basic → { track: "funcional", nivel: 1, nombre: "Finance Basic" }
 *
 * Si el courseId no encaja con la convención, devuelve un meta genérico.
 */
function _metaCursoFormaciones(courseId) {
  // Pequeño catálogo manual para nombres legibles bonitos.
  // Añade aquí entradas cuando publiques nuevas formaciones; lo que NO esté
  // listado se autogenera del slug.
  const PRETTY_NAMES = {
    'form-welcome-0-que-es-rdr':         '¿Qué es RDR?',
    'form-functional-1-finance-basic':   'Finanzas Básico',
    'form-tecnico-1-tecnologias-rdr': 'Tecnologías RDR',
  };

  // Patrón: form-{track}-{nivel}-{slug...}
  const m = String(courseId).match(/^form-([a-z]+)-(\d+)-(.+)$/);
  if (!m) {
    return { track: 'cross', nivel: null, nombre: courseId, tag: '—' };
  }

  const [, rawTrack, levelStr, slug] = m;

  // Normalización del track
  const trackMap = {
    welcome:    { track: 'welcome',   tag: 'Onboarding' },
    functional: { track: 'funcional', tag: 'Funcional' },
    funcional:  { track: 'funcional', tag: 'Funcional' },
    technical:  { track: 'tecnico',   tag: 'Técnico' },
    tecnico:    { track: 'tecnico',   tag: 'Técnico' },
    cross:      { track: 'cross',     tag: 'Cross' },
  };
  const trackInfo = trackMap[rawTrack] || { track: 'cross', tag: '—' };

  // Nombre bonito si existe en el override, si no se autogenera del slug
  let nombre = PRETTY_NAMES[courseId];
  if (!nombre) {
    nombre = slug
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  return {
    track: trackInfo.track,
    tag: trackInfo.tag,
    nivel: parseInt(levelStr, 10),
    nombre: nombre,
  };
}

/**
 * Devuelve la hoja "Certificados", creándola con cabecera si no existe.
 */
function _hojaFormaciones() {
  const ss = _hubHoja('FORMACIONES');
  let sheet = ss.getSheetByName(FORM_HOJA);
  if (!sheet) {
    sheet = ss.insertSheet(FORM_HOJA);
    sheet.appendRow([
      'ref', 'userId', 'courseId', 'date', 'fileUrl', 'fileId', 'importedAt'
    ]);
    sheet.setFrozenRows(1);
    // Formato bonito a la cabecera
    sheet.getRange('A1:G1')
      .setFontWeight('bold')
      .setBackground('#001391')
      .setFontColor('#FFFFFF');
  }
  return sheet;
}

/**
 * Filas ya registradas, por id de fichero de Drive: { fileId: { fila, ref } }.
 */
function _refsFormaciones(sheet) {
  const out = { _repetidas: [] }; // _repetidas: filas anteriores de un fileId que se repite
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return out;
  sheet.getRange(2, 1, lastRow - 1, 6).getValues().forEach(function (r, i) {
    const id = String(r[5] || '').trim();
    if (!id) return;
    if (out[id]) out._repetidas.push(out[id].fila);
    out[id] = { fila: i + 2, ref: String(r[0] || '') };
  });
  return out;
}

/**
 * Helper para devolver JSON con CORS abierto.
 * (Las Web Apps de Apps Script tienen CORS gestionado automáticamente
 *  cuando se despliegan como "Cualquier persona".)
 */
function _jsonFormaciones(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función auxiliar para limpiar el Sheet en caso de necesidad.
 * Solo ejecutar manualmente. NO añadir a triggers.
 */
function resetearCertificados() {
  const sheet = _hojaFormaciones();
  sheet.clear();
  sheet.appendRow([
    'ref', 'userId', 'courseId', 'date', 'fileUrl', 'fileId', 'importedAt'
  ]);
  sheet.setFrozenRows(1);
  sheet.getRange('A1:G1')
    .setFontWeight('bold')
    .setBackground('#001391')
    .setFontColor('#FFFFFF');
  Logger.log('Sheet reseteada');
}