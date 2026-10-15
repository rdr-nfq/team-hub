/**
 * ============================================================================
 *  SINCRONIZADOR DE CERTIFICADOS · BBVA × NFQ · RDR FORMACIONES
 * ============================================================================
 *
 *  Este Apps Script:
 *   1. Lee periódicamente una carpeta de Google Drive donde se suben los PDFs
 *      de certificados (nombres con formato: {userId}__{courseId}__{YYYYMMDD}.pdf)
 *   2. Registra cada certificado nuevo en un Google Sheet (id, curso, fecha)
 *   3. Expone un endpoint doGet que devuelve un JSON con todos los registros
 *      para que la web `equipo-formaciones.html` lo consuma vía fetch.
 *
 *  ============================================================================
 *  INSTRUCCIONES DE INSTALACIÓN
 *  ============================================================================
 *
 *  1. Crea una carpeta en Google Drive para los certificados (compartida con el equipo).
 *     Copia su ID del URL: https://drive.google.com/drive/folders/XXXXXX  →  el XXXXXX.
 *
 *  2. Crea un Google Sheet vacío. Copia su ID del URL:
 *     https://docs.google.com/spreadsheets/d/XXXXXX/edit → el XXXXXX.
 *
 *  3. Abre el Sheet → menú "Extensiones" → "Apps Script".
 *
 *  4. Pega ESTE archivo entero en el editor (reemplazando el código por defecto).
 *
 *  5. Edita las dos constantes de abajo (FOLDER_ID y SHEET_ID) con tus IDs.
 *
 *  6. Guarda (icono disquete).
 *
 *  7. Ejecuta la función `syncCertificates` manualmente una vez para autorizar
 *     los permisos (Drive + Sheets). Acepta los permisos al solicitarlos.
 *
 *  8. Configura el trigger horario:
 *     - Click en el icono del reloj (Triggers) en la barra lateral izquierda.
 *     - "Añadir trigger".
 *     - Función: syncCertificates
 *     - Evento: Basado en tiempo → Cada hora.
 *     - Guardar.
 *
 *  9. Desplegar como Web App:
 *     - Botón "Implementar" → "Nueva implementación".
 *     - Tipo: "Aplicación web".
 *     - Ejecutar como: "Yo mismo".
 *     - Quién tiene acceso: "Cualquier persona" (necesario para que la web pública
 *       pueda hacer fetch sin login).
 *     - "Implementar".
 *     - Copia la URL que aparece (algo como https://script.google.com/macros/s/.../exec)
 *
 *  10. Pega esa URL en `equipo-formaciones.html` reemplazando `APPS_SCRIPT_URL = ""`.
 *
 *  ============================================================================
 */

// >>> EDITAR ESTOS DOS VALORES <<<
const FOLDER_ID = '1e5zysoDRyBIj30VrKtC6jLPhDzpRQDgl';
const SHEET_ID  = '1-J6IETYor07e4f3NTYBBbvC9nGmzJfmVVGIOyq1KjoA';

// Nombre de la pestaña del Sheet donde guardamos los registros
const SHEET_NAME = 'Certificados';

/**
 * Sincroniza la carpeta de Drive con el Sheet.
 * Lee todos los PDFs de la carpeta, parsea sus nombres y añade los nuevos al Sheet.
 * Ejecutar manualmente la primera vez y luego mediante un trigger horario.
 */
function syncCertificates() {
  const sheet = getOrCreateSheet();
  const existing = loadExistingRefs(sheet);
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  let added = 0;
  let skipped = 0;

  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();

    // Solo PDFs
    if (!name.toLowerCase().endsWith('.pdf')) {
      continue;
    }

    // Parsear nombre: {userId}__{courseId}__{YYYYMMDD}.pdf
    const ref = name.replace(/\.pdf$/i, '');
    const parts = ref.split('__');

    if (parts.length !== 3) {
      Logger.log('Nombre con formato no válido: ' + name);
      continue;
    }

    const [userId, courseId, dateStr] = parts;

    // Validar fecha YYYYMMDD
    if (!/^\d{8}$/.test(dateStr)) {
      Logger.log('Fecha inválida en: ' + name);
      continue;
    }

    if (existing.has(ref)) {
      skipped++;
      continue;
    }

    // Añadir fila: ref, userId, courseId, date, fileUrl, fileId, importedAt
    sheet.appendRow([
      ref,
      userId,
      courseId,
      dateStr,
      file.getUrl(),
      file.getId(),
      new Date().toISOString(),
    ]);
    existing.add(ref);
    added++;
  }

  Logger.log(`Sincronización completa: ${added} nuevos, ${skipped} ya existentes.`);
  return { added, skipped };
}

/**
 * Endpoint público: devuelve todos los registros como JSON.
 * URL: https://script.google.com/macros/s/.../exec
 *
 * Cada record incluye los campos crudos del Sheet + un objeto `courseMeta`
 * derivado del courseId (nombre legible, nivel, track) para que la web no
 * necesite mantener un catálogo aparte.
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();

    // Cabecera en la primera fila
    if (data.length <= 1) {
      return jsonResponse({ records: [], updatedAt: new Date().toISOString() });
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
        courseMeta: deriveCourseMeta(courseId),
      };
    });

    return jsonResponse({
      records: records,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
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
function deriveCourseMeta(courseId) {
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
function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
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
 * Conjunto con los `ref` ya registrados (para no duplicar).
 */
function loadExistingRefs(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();
  const refs = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  return new Set(refs);
}

/**
 * Helper para devolver JSON con CORS abierto.
 * (Las Web Apps de Apps Script tienen CORS gestionado automáticamente
 *  cuando se despliegan como "Cualquier persona".)
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función auxiliar para limpiar el Sheet en caso de necesidad.
 * Solo ejecutar manualmente. NO añadir a triggers.
 */
function resetSheet() {
  const sheet = getOrCreateSheet();
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