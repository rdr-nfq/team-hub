/**
 * ============================================================================
 *  BACKEND RDR BBVA  ·  Google Apps Script
 * ----------------------------------------------------------------------------
 *  API genérica y DINÁMICA para leer y modificar CUALQUIER dato modificable
 *  del libro "Control - RDR BBVA".
 *
 *  Concepto clave (descubierto al analizar el Excel):
 *    - Una celda es MODIFICABLE  ->  NO contiene fórmula  (getFormula() === '')
 *    - Una celda es CALCULADA    ->  contiene fórmula (P, Q, R de Iniciativas,
 *                                    rentabilidades, totales, bolsas, etc.)
 *  Por defecto el backend PROTEGE las celdas con fórmula: no las pisa salvo
 *  que se pase force:true. Así nunca rompes el modelo de cálculo sin querer.
 *
 *  Expone:
 *    1) Funciones llamables desde el propio editor de Apps Script.
 *    2) Una API web (doGet / doPost -> JSON) para usarlo como backend remoto.
 * ============================================================================
 */

/* ===========================================================================
 * 1. CONFIGURACIÓN
 * =========================================================================== */
var CONFIG = {
  // ID del Google Sheet (la parte de la URL .../d/<ESTO>/edit).
  // Déjalo vacío ('') si pegas este script COMO script ligado a la hoja.
  SPREADSHEET_ID: '',

  // Token simple de seguridad para la API web. CÁMBIALO.
  // Toda llamada (salvo action=ping) debe enviar token=<este valor>.
  API_TOKEN: 'CAMBIA_ESTE_TOKEN_LARGO_Y_SECRETO',

  // Si true, no se sobreescriben celdas con fórmula salvo force:true.
  PROTECT_FORMULAS: true,

  // Convertir strings numéricos/booleanos/fechas al escribir ("440" -> 440).
  AUTO_TYPE: true
};

/* ===========================================================================
 * 2. ESQUEMA DEL LIBRO  (pistas para la capa de "tablas" dinámica)
 *    Sólo son DEFAULTS: cualquier acción acepta headerRow/dataStartRow propios,
 *    así que funciona aunque cambie la estructura.
 * =========================================================================== */
var SCHEMAS = {
  '1) Iniciativas':        { headerRow: 6, dataStartRow: 7, mode: 'tabla',
    desc: 'Catálogo de lo vendido. P/Q/R son fórmulas (semáforo de ejecución).' },
  '2)Ejecución Real':      { headerRow: 5, dataStartRow: 6, mode: 'tabla',
    desc: 'Ejecución/revenue repartido por trimestre. L,M y fila 3-4 son fórmulas.' },
  '3) Control Economico.': { headerRow: 4, dataStartRow: 6, mode: 'bloques',
    desc: 'Rentabilidad por persona y trimestre. Muchas fórmulas; usa read/write por celda.' },
  '3) Control Economico':  { headerRow: 6, dataStartRow: 8, mode: 'bloques',
    desc: 'Versión antigua (2025Q1-Q2) del control económico.' },
  '4) Bolsa BBVA':         { headerRow: 5, dataStartRow: 6, mode: 'tabla',
    desc: 'Bolsa de horas BBVA. K (Restante) y K3 (Total) son fórmulas.' },
  '5) Adelantos':          { headerRow: 7, dataStartRow: 8, mode: 'tabla',
    desc: 'Horas adelantadas vs consumidas. L,M (Restante/Importe) son fórmulas.' },
  '6) Gastos':             { headerRow: 4, dataStartRow: 5, mode: 'tabla',
    desc: 'Gastos sueltos (guardias, dietas...). Todo es modificable.' },
  '7) Costes':             { headerRow: 2, dataStartRow: 3, mode: 'bloques',
    desc: 'Horas x coste/h por persona y mes. D = Horas*Coste/h (fórmula).' },
  '8) Seg. Contable':      { headerRow: 6, dataStartRow: 7, mode: 'bloques',
    desc: 'Cierre contable mensual. Casi todo son fórmulas; edita inputs concretos.' },
  '9) Capacidad':          { headerRow: 14, dataStartRow: 15, mode: 'bloques',
    desc: 'Planificación de equipo por trimestre. M y P son fórmulas de cobertura.' },
  '10) Encuestas Q4':      { headerRow: 2, dataStartRow: 3, mode: 'tabla',
    desc: 'Encuestas de satisfacción Q4. Notas modificables.' },
  '11) Encuestas Q1':      { headerRow: 1, dataStartRow: 2, mode: 'tabla',
    desc: 'Encuestas de satisfacción Q1. F (Calidad total) puede ser fórmula.' }
};

function _schema(name) { return SCHEMAS[name] || {}; }

/* ===========================================================================
 * 3. UTILIDADES INTERNAS
 * =========================================================================== */
function _ss() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function _sheet(name) {
  if (!name) throw new Error('Falta el nombre de pestaña (sheet).');
  var sh = _ss().getSheetByName(name);
  if (!sh) throw new Error('No existe la pestaña: "' + name + '".');
  return sh;
}

// Índice de columna (1-based) -> letra A1.
function _colLetter(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

// Detecta string de fecha ISO ("2026-01-01" o "2026-01-01 00:00:00").
function _maybeDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) return null;
  var d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

// Escribe UN valor en un rango de 1 celda, interpretando tipo y fórmulas.
function _setOne(rng, value) {
  if (value === null || value === undefined) { rng.clearContent(); return; }
  if (typeof value === 'string') {
    if (value === '') { rng.clearContent(); return; }
    if (value.charAt(0) === '=') { rng.setFormula(value); return; }     // fórmula explícita
    if (CONFIG.AUTO_TYPE) {
      var d = _maybeDate(value);          if (d)               { rng.setValue(d);    return; }
      if (value === 'true')               { rng.setValue(true);  return; }
      if (value === 'false')              { rng.setValue(false); return; }
      if (/^-?\d+(\.\d+)?$/.test(value))  { rng.setValue(Number(value)); return; }
    }
    rng.setValue(value); return;
  }
  rng.setValue(value); // number | boolean | Date
}

// Lanza error si el rango toca fórmulas y no se fuerza.
function _assertWritable(rng, force) {
  if (force || !CONFIG.PROTECT_FORMULAS) return;
  var fs = rng.getFormulas();
  for (var r = 0; r < fs.length; r++) {
    for (var c = 0; c < fs[r].length; c++) {
      if (fs[r][c] !== '') {
        var a1 = _colLetter(rng.getColumn() + c) + (rng.getRow() + r);
        throw new Error('La celda ' + rng.getSheet().getName() + '!' + a1 +
          ' contiene una fórmula (' + fs[r][c] + '). Usa force:true para sobrescribirla.');
      }
    }
  }
}

function _indexOfHeader(headers, name) {
  for (var i = 0; i < headers.length; i++) if (headers[i] === name) return i;          // exacto
  var t = String(name).trim().toLowerCase();
  for (var j = 0; j < headers.length; j++) if (String(headers[j]).trim().toLowerCase() === t) return j; // laxo
  return -1;
}

/* ===========================================================================
 * 4. LECTURA
 * =========================================================================== */

/** Lista todas las pestañas con sus dimensiones. */
function getSheets() {
  return _ss().getSheets().map(function (sh) {
    return { name: sh.getName(), index: sh.getIndex(),
             rows: sh.getLastRow(), cols: sh.getLastColumn() };
  });
}

/** Metadatos: nombre del libro, pestañas y esquema conocido. */
function getMeta() {
  return { spreadsheet: _ss().getName(), sheets: getSheets(), schemas: SCHEMAS };
}

/**
 * Lee un rango (o toda la hoja si a1 es vacío) devolviendo valores, fórmulas
 * y una máscara 'editable' (true = celda modificable, sin fórmula).
 */
function readRange(sheetName, a1) {
  var sh = _sheet(sheetName);
  var rng = a1 ? sh.getRange(a1) : sh.getDataRange();
  var formulas = rng.getFormulas();
  return {
    sheet: sh.getName(), a1: rng.getA1Notation(),
    startRow: rng.getRow(), startCol: rng.getColumn(),
    numRows: rng.getNumRows(), numCols: rng.getNumColumns(),
    values: rng.getValues(),
    formulas: formulas,
    editable: formulas.map(function (row) { return row.map(function (f) { return f === ''; }); })
  };
}

/** Lee una sola celda. */
function readCell(sheetName, a1) {
  var sh = _sheet(sheetName);
  var rng = sh.getRange(a1);
  return { sheet: sh.getName(), a1: rng.getA1Notation(),
           value: rng.getValue(), formula: rng.getFormula(),
           editable: rng.getFormula() === '' };
}

/**
 * Devuelve SOLO las celdas modificables (sin fórmula) de un rango/hoja.
 * Responde directamente a "recuperar cualquier dato modificable".
 */
function getModifiable(sheetName, a1, opts) {
  opts = opts || {};
  var sh = _sheet(sheetName);
  var rng = a1 ? sh.getRange(a1) : sh.getDataRange();
  var vals = rng.getValues(), fs = rng.getFormulas();
  var sr = rng.getRow(), sc = rng.getColumn();
  var out = [];
  for (var r = 0; r < vals.length; r++) {
    for (var c = 0; c < vals[r].length; c++) {
      if (fs[r][c] !== '') continue;                       // es fórmula -> no modificable
      var v = vals[r][c];
      if (!opts.includeEmpty && (v === '' || v === null)) continue;
      out.push({ a1: _colLetter(sc + c) + (sr + r), row: sr + r, col: sc + c, value: v });
    }
  }
  return { sheet: sh.getName(), count: out.length, cells: out };
}

/* ===========================================================================
 * 5. ESCRITURA
 * =========================================================================== */

// Aplica una actualización {sheet, a1, value | values} sin flush (uso interno).
function _applyUpdate(u, force) {
  var sh = _sheet(u.sheet);
  var rng = sh.getRange(u.a1);
  _assertWritable(rng, force || u.force);
  if (Array.isArray(u.values)) {
    if (!Array.isArray(u.values[0])) throw new Error('"values" debe ser una matriz 2D.');
    if (rng.getNumRows() !== u.values.length || rng.getNumColumns() !== u.values[0].length) {
      throw new Error('Dimensiones de values (' + u.values.length + 'x' + u.values[0].length +
        ') no coinciden con ' + u.sheet + '!' + rng.getA1Notation() +
        ' (' + rng.getNumRows() + 'x' + rng.getNumColumns() + ').');
    }
    for (var r = 0; r < u.values.length; r++)
      for (var c = 0; c < u.values[r].length; c++)
        _setOne(rng.getCell(r + 1, c + 1), u.values[r][c]);
  } else {
    if (rng.getNumRows() !== 1 || rng.getNumColumns() !== 1)
      throw new Error('Para rangos multi-celda usa "values" (matriz). Rango: ' + rng.getA1Notation());
    _setOne(rng, u.value);
  }
  return { sheet: sh.getName(), a1: rng.getA1Notation() };
}

/** Escribe una sola celda. value puede ser número, texto, "=FÓRMULA" o fecha ISO. */
function writeCell(sheetName, a1, value, opts) {
  opts = opts || {};
  _applyUpdate({ sheet: sheetName, a1: a1, value: value }, opts.force);
  SpreadsheetApp.flush();
  return readCell(sheetName, a1);
}

/** Escribe un rango a partir de una matriz 2D de valores. */
function writeRange(sheetName, a1, values, opts) {
  opts = opts || {};
  _applyUpdate({ sheet: sheetName, a1: a1, values: values }, opts.force);
  SpreadsheetApp.flush();
  return readRange(sheetName, a1);
}

/** Actualización en lote: updates = [{sheet, a1, value} | {sheet, a1, values}]. */
function batchUpdate(updates, opts) {
  opts = opts || {};
  if (!Array.isArray(updates)) throw new Error('updates debe ser un array.');
  var res = updates.map(function (u) { return _applyUpdate(u, opts.force); });
  SpreadsheetApp.flush();
  return { updated: res.length, cells: res };
}

/* ===========================================================================
 * 6. CAPA DE TABLAS DINÁMICA  (registros como objetos {cabecera: valor})
 * =========================================================================== */

/** Devuelve los registros de una hoja-tabla como objetos clave/valor. */
function getTable(sheetName, opts) {
  opts = opts || {};
  var sh = _sheet(sheetName);
  var headerRow = opts.headerRow || _schema(sheetName).headerRow || 1;
  var dataStart = opts.dataStartRow || _schema(sheetName).dataStartRow || (headerRow + 1);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  // Tope opcional de filas: evita leer hojas con miles de filas vacías
  // (p.ej. "5) Adelantos" llega a la fila 44.000+ y haría lentísimo el snapshot).
  if (opts.maxRows) lastRow = Math.min(lastRow, dataStart + opts.maxRows - 1);
  if (lastRow < dataStart) return { sheet: sh.getName(), headerRow: headerRow, count: 0, records: [] };

  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var cols = [];
  for (var c = 0; c < headers.length; c++)
    if (headers[c] !== '' && headers[c] !== null) cols.push({ index: c, name: String(headers[c]) });

  var n = lastRow - dataStart + 1;
  var vals = sh.getRange(dataStart, 1, n, lastCol).getValues();
  // soloValores: ahorra la lectura de fórmulas y los mapas formulas/editable
  // por registro (el snapshot no los usa: reduce mucho tamaño y latencia).
  var fs = opts.soloValores ? null : sh.getRange(dataStart, 1, n, lastCol).getFormulas();
  var where = opts.where || null;
  var records = [];

  for (var r = 0; r < vals.length; r++) {
    var data = {}, formulas = {}, editable = {}, empty = true;
    for (var k = 0; k < cols.length; k++) {
      var col = cols[k], v = vals[r][col.index];
      if (v !== '' && v !== null) empty = false;
      data[col.name] = v;
      if (fs) {
        formulas[col.name] = fs[r][col.index];
        editable[col.name] = fs[r][col.index] === '';
      }
    }
    if (empty) continue;
    if (where && !_matchWhere(data, where)) continue;
    records.push(fs
      ? { row: dataStart + r, data: data, formulas: formulas, editable: editable }
      : { row: dataStart + r, data: data });
  }
  return { sheet: sh.getName(), headerRow: headerRow, dataStartRow: dataStart,
           columns: cols.map(function (c) { return c.name; }), count: records.length, records: records };
}

// Filtro de registros. where = {col: valor} ó {col: {op, value}}.
function _matchWhere(data, where) {
  return Object.keys(where).every(function (k) {
    var cond = where[k], val = data[k];
    if (cond && typeof cond === 'object') {
      var t = cond.value;
      switch (cond.op) {
        case 'eq':       return val === t;
        case 'ne':       return val !== t;
        case 'contains': return String(val).toLowerCase().indexOf(String(t).toLowerCase()) >= 0;
        case 'gt':       return Number(val) >  Number(t);
        case 'gte':      return Number(val) >= Number(t);
        case 'lt':       return Number(val) <  Number(t);
        case 'lte':      return Number(val) <= Number(t);
        default:         return false;
      }
    }
    return String(val) === String(cond); // igualdad laxa por defecto
  });
}

/** Lee una fila como registro {cabecera: valor}. */
function getRow(sheetName, rowNumber, opts) {
  opts = opts || {};
  var sh = _sheet(sheetName);
  var headerRow = opts.headerRow || _schema(sheetName).headerRow || 1;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var vals = sh.getRange(rowNumber, 1, 1, lastCol).getValues()[0];
  var fs   = sh.getRange(rowNumber, 1, 1, lastCol).getFormulas()[0];
  var data = {}, editable = {};
  for (var c = 0; c < headers.length; c++) {
    if (headers[c] === '' || headers[c] === null) continue;
    data[String(headers[c])] = vals[c];
    editable[String(headers[c])] = fs[c] === '';
  }
  return { sheet: sh.getName(), row: rowNumber, data: data, editable: editable };
}

/** Modifica una fila por número de fila usando un patch {cabecera: nuevoValor}. */
function updateRow(sheetName, rowNumber, patch, opts) {
  opts = opts || {};
  if (!patch || typeof patch !== 'object') throw new Error('patch debe ser un objeto {columna: valor}.');
  var sh = _sheet(sheetName);
  var headerRow = opts.headerRow || _schema(sheetName).headerRow || 1;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var changed = [];
  Object.keys(patch).forEach(function (key) {
    var idx = _indexOfHeader(headers, key);
    if (idx < 0) throw new Error('Columna "' + key + '" no encontrada en ' + sheetName +
                                 ' (cabecera fila ' + headerRow + ').');
    var rng = sh.getRange(rowNumber, idx + 1);
    _assertWritable(rng, opts.force);
    _setOne(rng, patch[key]);
    changed.push({ column: key, a1: rng.getA1Notation() });
  });
  SpreadsheetApp.flush();
  return { sheet: sh.getName(), row: rowNumber, changed: changed };
}

/** Añade un registro nuevo {cabecera: valor} (por defecto en la primera fila libre). */
function appendRow(sheetName, data, opts) {
  opts = opts || {};
  if (!data || typeof data !== 'object') throw new Error('data debe ser un objeto {columna: valor}.');
  var sh = _sheet(sheetName);
  var headerRow = opts.headerRow || _schema(sheetName).headerRow || 1;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  var targetRow = opts.row || (sh.getLastRow() + 1);
  Object.keys(data).forEach(function (key) {
    var idx = _indexOfHeader(headers, key);
    if (idx < 0) throw new Error('Columna "' + key + '" no encontrada en ' + sheetName + '.');
    _setOne(sh.getRange(targetRow, idx + 1), data[key]);
  });
  SpreadsheetApp.flush();
  return getRow(sheetName, targetRow, { headerRow: headerRow });
}

/**
 * Alta de registro CLONANDO la fila anterior: copia fórmulas y formato de la
 * última fila con datos a la nueva (así P/Q/R de Iniciativas, L/M de Ejecución,
 * etc. se replican y se autoajustan), limpia los valores de input heredados y
 * escribe los nuevos. Es la forma correcta de "añadir" en tablas con fórmulas.
 */
function appendCloneRow(sheetName, data, opts) {
  opts = opts || {};
  if (!data || typeof data !== 'object') throw new Error('data debe ser un objeto {columna: valor}.');
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    var sh = _sheet(sheetName);
    var headerRow = opts.headerRow || _schema(sheetName).headerRow || 1;
    var lastCol = sh.getLastColumn();
    var srcRow = sh.getLastRow();
    var newRow = srcRow + 1;
    // 1) Clonar la fila anterior (fórmulas + formato) a la nueva.
    sh.getRange(srcRow, 1, 1, lastCol).copyTo(sh.getRange(newRow, 1, 1, lastCol));
    // 2) Vaciar las celdas de INPUT (sin fórmula) para no arrastrar datos viejos.
    var fs = sh.getRange(newRow, 1, 1, lastCol).getFormulas()[0];
    for (var c = 0; c < lastCol; c++) if (fs[c] === '') sh.getRange(newRow, c + 1).clearContent();
    // 3) Escribir los valores nuevos por cabecera.
    var headers = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
    Object.keys(data).forEach(function (k) {
      var idx = _indexOfHeader(headers, k);
      if (idx >= 0) _setOne(sh.getRange(newRow, idx + 1), data[k]);
    });
    SpreadsheetApp.flush();
    return getRow(sheetName, newRow, { headerRow: headerRow });
  } finally {
    lock.releaseLock();
  }
}

/* ===========================================================================
 * 7. BÚSQUEDA GLOBAL
 * =========================================================================== */

/** Busca texto en todo el libro (o en pestañas concretas). */
function searchAll(query, opts) {
  opts = opts || {};
  if (query === undefined || query === null || query === '') throw new Error('Falta query.');
  var limit = opts.limit || 200;
  var filter = opts.sheets || null;
  var q = String(query).toLowerCase();
  var matches = [];
  var sheets = _ss().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s], name = sh.getName();
    if (filter && filter.indexOf(name) < 0) continue;
    if (opts.numberedOnly && !/^\s*\d+\)/.test(name)) continue;
    if (sh.getLastRow() === 0) continue;
    var rng = sh.getDataRange(), vals = rng.getValues();
    var sr = rng.getRow(), sc = rng.getColumn();
    for (var r = 0; r < vals.length; r++) {
      for (var c = 0; c < vals[r].length; c++) {
        var v = vals[r][c];
        if (v === '' || v === null) continue;
        if (String(v).toLowerCase().indexOf(q) >= 0) {
          matches.push({ sheet: name, a1: _colLetter(sc + c) + (sr + r),
                         row: sr + r, col: sc + c, value: v });
          if (matches.length >= limit)
            return { query: query, count: matches.length, truncated: true, matches: matches };
        }
      }
    }
  }
  return { query: query, count: matches.length, truncated: false, matches: matches };
}

/* ===========================================================================
 * 7B. LECTURA ESTRUCTURADA POR MÓDULO
 *     Convierte la estructura "de hoja de cálculo" (listas + bloques por Q con
 *     cabeceras combinadas y fórmulas) en JSON limpio listo para el frontend y
 *     sus SIMULACIONES (que corren en cliente, sin volver al backend).
 *     Apps Script lee VALORES calculados (incl. funciones externas de vacaciones),
 *     así que aquí sí obtenemos los números reales que openpyxl no veía.
 * =========================================================================== */

// Localiza bloques por Q buscando un patrón en una columna. Devuelve [{q,row,end}].
function _qBlocks(sh, colIdx, regex) {
  var last = sh.getLastRow();
  if (last < 1) return [];
  var col = sh.getRange(1, colIdx, last, 1).getValues();
  var starts = [];
  for (var r = 0; r < last; r++) {
    var v = col[r][0];
    if (v !== null && v !== '' && regex.test(String(v).trim()))
      starts.push({ q: String(v).trim(), row: r + 1 });
  }
  for (var i = 0; i < starts.length; i++)
    starts[i].end = (i + 1 < starts.length) ? starts[i + 1].row - 1 : last;
  return starts;
}

// Igual pero el marcador de Q puede estar en varias columnas (Capacidad: A o B).
function _qBlocksMulti(sh, cols, regex) {
  var last = sh.getLastRow();
  if (last < 1) return [];
  var maxC = Math.max.apply(null, cols);
  var data = sh.getRange(1, 1, last, maxC).getValues();
  var starts = [];
  for (var r = 0; r < last; r++) {
    for (var ci = 0; ci < cols.length; ci++) {
      var v = data[r][cols[ci] - 1];
      if (v !== null && v !== '' && regex.test(String(v).trim())) {
        starts.push({ q: String(v).trim().replace('_', ''), row: r + 1 });
        break;
      }
    }
  }
  for (var i = 0; i < starts.length; i++)
    starts[i].end = (i + 1 < starts.length) ? starts[i + 1].row - 1 : last;
  return starts;
}

/** Tarifas de proveedor por año/Q (cabecera de "1) Iniciativas", filas 2-3). */
function getTarifas() {
  var sh = _sheet('1) Iniciativas');
  var years = sh.getRange(2, 3, 1, 5).getValues()[0];   // C2..G2
  var tarifas = sh.getRange(3, 3, 1, 5).getValues()[0]; // C3..G3
  var out = {};
  for (var i = 0; i < years.length; i++) {
    if (years[i] !== '' && years[i] !== null) out[String(years[i])] = tarifas[i];
  }
  return out;
}

/** Iniciativas como registros (incluye P/Q/R ya calculados). */
function getIniciativas(opts) {
  return getTable('1) Iniciativas', opts).records;
}

/**
 * Ejecución Real: registros + columnas de Q + el dato clave para economía:
 * el sumatorio de horas por cada Q (totalesHorasQ).
 */
function getEjecucion(opts) {
  var t = getTable('2)Ejecución Real', opts);
  // Acepta "2026Q4", "2026 Q4" y "2026_Q4": en cuanto la columna del Q tenga
  // horas, el Q aparece en la web (el frontend normaliza el formato).
  var qCols = t.columns.filter(function (c) { return /^\d{4}[ _]?Q[1-4]$/i.test(String(c).trim()); });
  var totalesHorasQ = {};
  qCols.forEach(function (q) { totalesHorasQ[q] = 0; });
  t.records.forEach(function (rec) {
    qCols.forEach(function (q) {
      var v = Number(rec.data[q]);
      if (!isNaN(v)) totalesHorasQ[q] += v;
    });
  });
  return { sheet: t.sheet, qColumns: qCols, totalesHorasQ: totalesHorasQ, records: t.records };
}

/* Rangos de fila de las SUMAS verticales de un bloque: [{ini, fin}, ...].

   NADA de esto va con filas fijas. Las fórmulas se leen del libro EN EL MISMO
   momento que los valores (getValues + getFormulas sobre el mismo rango), así
   que los números que llevan dentro son siempre los de ahora: si se da de alta
   o de baja a alguien, o si al crear un Q nuevo los bloques anteriores bajan,
   Sheets reescribe las referencias y aquí se leen ya actualizadas.

   Solo cuentan las sumas de una columna a lo largo de VARIAS filas
   (SUM(Q6:Q21)); las horizontales de cada persona (SUM(R6:T6)) se descartan
   porque empiezan y acaban en la misma fila, igual que las que se cruzan con
   su propia fila (no serían un total de otras). */
function _rangosSuma(fmls, rowStart) {
  var re = /SUMA?\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)/g;
  var out = [];
  for (var i = 0; i < fmls.length; i++) {
    for (var c = 0; c < fmls[i].length; c++) {
      var f = fmls[i][c];
      if (!f) continue;
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(String(f))) !== null) {
        var ini = Number(m[2]), fin = Number(m[4]);
        if (m[1] !== m[3] || ini >= fin) continue; // horizontal o de una sola fila
        if (rowStart + i >= ini && rowStart + i <= fin) continue; // la propia fila dentro: no es total
        out.push({ ini: ini, fin: fin });
      }
    }
  }
  return out;
}

function _dentroDeRango(rangos, row) {
  for (var i = 0; i < rangos.length; i++)
    if (row >= rangos[i].ini && row <= rangos[i].fin) return true;
  return false;
}

/**
 * Control Económico ('3) Control Economico.'): un objeto por trimestre con la
 * lista de personas (NFQ/NTER) y sus datos, costes por equipo y rentabilidades
 * objetivo. Suficiente para simular costes/rentabilidad de un Q en cliente.
 */
function getControlEconomico() {
  var sh = _sheet('3) Control Economico.');
  var blocks = _qBlocks(sh, 3, /^\d{4}Q[1-4]$/); // col C
  var LASTC = 21; // U
  var out = [];
  blocks.forEach(function (b) {
    var n = b.end - b.row + 1;
    var vals = sh.getRange(b.row, 1, n, LASTC).getValues();   // A..U
    var fmls = sh.getRange(b.row, 1, n, LASTC).getFormulas(); // fórmulas de las filas resumen
    // Cabecera de meses (E,F,G): se BUSCA en las primeras filas del bloque en
    // vez de darla por hecha en la segunda, para que una fila en blanco de más
    // entre el rótulo del Q y la cabecera no la deje sin leer.
    var meses = [];
    for (var h = 1; h < Math.min(n, 4); h++) {
      if (vals[h][4] !== '' && vals[h][4] !== null) { meses = [vals[h][4], vals[h][5], vals[h][6]]; break; }
    }
    var team = null, personas = [], objetivos = {}, resumen = [];
    // Fila resumen del bloque (Ingresos/Costes/Rentabilidad/Margen… tal y como
    // los calcula el PROPIO Excel): etiqueta + celdas no vacías con su fórmula.
    // Es la referencia para que el simulador cuadre céntimo a céntimo.
    var addResumen = function (i, label) {
      var celdas = {};
      for (var cc = 3; cc < LASTC; cc++) {
        var vv = vals[i][cc], ff = fmls[i][cc];
        if ((vv !== '' && vv !== null) || ff !== '')
          celdas[_colLetter(cc + 1)] = { v: vv, f: ff };
      }
      resumen.push({ row: b.row + i, label: label, celdas: celdas });
    };
    for (var i = 0; i < n; i++) {
      var C = vals[i][2], D = vals[i][3];
      var cs = (C === null ? '' : String(C).trim());
      var low = cs.toLowerCase();
      if (low === 'nfq') { team = 'NFQ'; continue; }
      if (low === 'nter') { team = 'NTER'; continue; }
      if (/^rentabilidad objetivo/i.test(cs)) {
        if (objetivos.NFQ === undefined) objetivos.NFQ = D; else objetivos.NTER = D;
        addResumen(i, cs);
        continue;
      }
      // Persona: nombre "Apellido, Nombre" (lleva coma) y coste numérico en D.
      if (cs.indexOf(',') >= 0 && typeof D === 'number' && team) {
        personas.push({
          equipo: team, nombre: cs, costeHora: D,
          row: b.row + i, // fila absoluta (para escribir coste/dedicación)
          horasTeoricas: [vals[i][4], vals[i][5], vals[i][6]],
          dedicacion:    [vals[i][7], vals[i][8], vals[i][9]],
          ausencias:     [vals[i][10], vals[i][11], vals[i][12]],
          horasImputadas:[vals[i][13], vals[i][14], vals[i][15]],
          horasQ:        vals[i][16],
          costeMes:      [vals[i][17], vals[i][18], vals[i][19]],
          costeQ:        vals[i][20]
        });
        continue;
      }
      // Cualquier otra fila con etiqueta (en A, B o C): al resumen del bloque.
      // Incluida la propia fila del Q, que suele llevar KPIs a su derecha.
      var label = cs || String(vals[i][0] === null ? '' : vals[i][0]).trim() || String(vals[i][1] === null ? '' : vals[i][1]).trim();
      if (label) addResumen(i, label);
    }
    // Rangos de las SUMAS verticales del bloque (las filas de total por equipo,
    // p.ej. SUM(Q6:Q21)). Sirven para saber qué personas entran de verdad en el
    // total que muestra el Excel: si alguien se añade DEBAJO del rango y nadie
    // amplía la fórmula, el Excel no lo suma, y el simulador tiene que hacer lo
    // mismo para cuadrar con él (se avisa en la web para poder corregirlo).
    var rangos = _rangosSuma(fmls, b.row);
    // Por equipo: solo cuentan los rangos que cubren a ALGUNA de sus personas
    // (así una suma suelta de otra parte del bloque no puede dejar a nadie
    // fuera). Si ningún rango cubre al equipo — porque su total esté escrito a
    // mano en vez de con fórmula, por ejemplo — entran todos: nunca se deja de
    // contar a nadie por no haber sabido leer la suma.
    var rangosUsados = [];
    ['NFQ', 'NTER'].forEach(function (eq) {
      var delEquipo = personas.filter(function (p) { return p.equipo === eq; });
      var suyos = rangos.filter(function (r) {
        return delEquipo.some(function (p) { return p.row >= r.ini && p.row <= r.fin; });
      });
      suyos.forEach(function (r) { rangosUsados.push({ equipo: eq, ini: r.ini, fin: r.fin }); });
      delEquipo.forEach(function (p) {
        p.enSumaExcel = !suyos.length || _dentroDeRango(suyos, p.row);
      });
    });
    var fuera = personas.filter(function (p) { return p.enSumaExcel === false && Number(p.costeQ); })
      .map(function (p) { return { nombre: p.nombre, equipo: p.equipo, row: p.row, costeQ: p.costeQ }; });

    var costeNFQ = 0, costeNTER = 0;
    personas.forEach(function (p) {
      var c = p.enSumaExcel ? (Number(p.costeQ) || 0) : 0;
      if (p.equipo === 'NFQ') costeNFQ += c; else costeNTER += c;
    });
    out.push({
      q: b.q, rowStart: b.row, rowEnd: b.end, meses: meses, personas: personas,
      costeNFQ: costeNFQ, costeNTER: costeNTER,
      rentObjetivoNFQ: objetivos.NFQ, rentObjetivoNTER: objetivos.NTER,
      resumen: resumen,
      // Cómo se ha leído el total del bloque (para diagnosticar sin abrir el
      // Excel): rangos que suma cada equipo y quién queda fuera de ellos.
      sumaExcel: { rangos: rangosUsados, fuera: fuera }
    });
  });
  return { sheet: sh.getName(), bloques: out };
}

// Añade asignaciones (responsable/ejecutor/apoyo) de una fila de proyecto a un proyecto.
function _pushAsig(proj, rv) {
  if (rv[6] !== null && rv[6] !== '') proj.asignaciones.push({ rol: 'responsable', persona: String(rv[6]), pct: rv[7] });
  if (rv[8] !== null && rv[8] !== '') proj.asignaciones.push({ rol: 'ejecutor', persona: String(rv[8]), pct: rv[9] });
  if (rv[10] !== null && rv[10] !== '') proj.asignaciones.push({ rol: 'apoyo', persona: String(rv[10]), pct: rv[11] });
}

/**
 * Capacidad ('9) Capacidad'): por trimestre, horasQ + proyectos con sus
 * asignaciones (responsable/ejecutor/apoyo + %) + capacidad por persona.
 * Permite recalcular cobertura y capacidad en cliente.
 */
function getCapacidad() {
  var sh = _sheet('9) Capacidad');
  var blocks = _qBlocksMulti(sh, [1, 2], /^\d{4}_Q[1-4]$/);
  var LASTC = 16; // P
  var out = [];
  blocks.forEach(function (b) {
    var n = b.end - b.row + 1;
    var vals = sh.getRange(b.row, 1, n, LASTC).getValues(); // A..P
    var horasQ = null, projStart = -1, teamHdr = -1;
    for (var i = 0; i < n; i++) {
      if (horasQ === null && i < 7 && typeof vals[i][11] === 'number') horasQ = vals[i][11]; // col L
      if (String(vals[i][1]).trim() === 'N0') teamHdr = i;                 // cabecera sub-equipos
      if (String(vals[i][1]).trim() === 'Proyectos') projStart = i + 1;    // col B
    }
    // Sub-equipos: filas entre la cabecera N0 y "Proyectos". Cada fila = un
    // sub-equipo; miembros = celdas B..G (N0..Tech), separando por ";".
    // Estructura: B=N0(manager) C=N1 D=N2(responsable) E=N3 F=N4 G=Tech(cross).
    // Cada fila con N2 abre un sub-equipo; sus miembros son N1/N3/N4/Tech (+ el
    // propio N2). Alex Casal (N0) es Manager -> excluido. Tech = equipo Cross.
    var equipos = [];
    if (teamHdr >= 0) {
      var endTeam = projStart >= 0 ? projStart - 1 : n;
      var nivelCols = [{ c: 2, n: 'N1' }, { c: 4, n: 'N3' }, { c: 5, n: 'N4' }, { c: 6, n: 'Tech' }];
      var curTeam = null;
      for (var t = teamHdr + 1; t < endTeam; t++) {
        var lidRaw = vals[t][3]; // D = N2 = responsable
        var lid = (lidRaw !== null && String(lidRaw).trim() !== '') ? String(lidRaw).split(';')[0].trim() : null;
        if (lid && !/casal/i.test(lid)) {
          curTeam = { lider: lid, miembros: [{ persona: lid, nivel: 'N2' }],
            horasEquipo: vals[t][7], capacidadCubierta: vals[t][9] };
          equipos.push(curTeam);
        }
        if (curTeam) {
          nivelCols.forEach(function (nc) {
            var cell = vals[t][nc.c];
            if (cell !== null && String(cell).trim() !== '')
              String(cell).split(';').forEach(function (nm) {
                nm = nm.trim();
                if (nm && !/casal/i.test(nm)) curTeam.miembros.push({ persona: nm, nivel: nc.n });
              });
          });
        }
      }
    }
    var proyectos = [], capacidadPersona = [], cur = null;
    if (projStart >= 0) {
      for (var j = projStart; j < n; j++) {
        var rv = vals[j];
        if (rv[14] !== null && rv[14] !== '' && typeof rv[15] === 'number')
          capacidadPersona.push({ persona: String(rv[14]), capacidad: rv[15] }); // O/P
        var nombre = rv[1], horas = rv[5]; // B, F
        if (nombre !== null && String(nombre).trim() !== '' && typeof horas === 'number') {
          cur = { nombre: String(nombre), horas: horas, cobertura: rv[12], asignaciones: [] }; // M=cobertura
          _pushAsig(cur, rv);
          proyectos.push(cur);
        } else if (cur) {
          _pushAsig(cur, rv); // fila de continuación (más ejecutores/apoyos)
        }
      }
    }
    out.push({ q: b.q, rowStart: b.row, rowEnd: b.end, horasQ: horasQ, equipos: equipos, proyectos: proyectos, capacidadPersona: capacidadPersona });
  });
  return { sheet: sh.getName(), bloques: out };
}

/**
 * Bolsa / Adelantos AGRUPADOS: cada entrada = un adelanto (proyecto que APORTA
 * horas) con sus consumos (proyectos que las SACAN). Excluye las CERRADAS,
 * detectadas por texto TACHADO (getFontLines === 'line-through'). Acotado en
 * filas (la hoja de Adelantos tiene decenas de miles de filas vacías).
 */
function _parseBolsa(sh, dataStart, c, lastColN) {
  var lastRow = Math.min(sh.getLastRow(), dataStart + 600);
  if (lastRow < dataStart) return { entries: [] };
  var n = lastRow - dataStart + 1;
  var rng = sh.getRange(dataStart, 1, n, lastColN);
  var v = rng.getValues();
  var L = rng.getFontLines(); // 'line-through' = tachado (cerrada)
  var has = function (x) { return x !== '' && x !== null && x !== undefined; };
  var struck = function (i, idx) { return idx != null && L[i][idx] === 'line-through'; };
  var entries = [], cur = null;
  for (var i = 0; i < n; i++) {
    var resp = v[i][c.resp], horas = v[i][c.horas];
    if (has(resp) || (has(horas) && typeof horas === 'number')) {
      cur = {
        responsable: resp, proyecto: v[i][c.proy], pedido: v[i][c.pedido],
        horasAdelantadas: horas, restante: v[i][c.restante],
        importe: c.importe != null ? v[i][c.importe] : null,
        cerrada: struck(i, c.proy) || struck(i, c.resp) || struck(i, c.horas),
        consumos: []
      };
      entries.push(cur);
    }
    var ch = v[i][c.consHoras];
    if (cur && has(ch)) {
      cur.consumos.push({
        fecha: v[i][c.consFecha], detalle: v[i][c.consDet],
        proyecto: c.consProy != null ? v[i][c.consProy] : null, horas: ch
      });
    }
  }
  return { entries: entries.filter(function (e) { return !e.cerrada; }) };
}

/** Bolsa BBVA agrupada (sin las cerradas/tachadas). */
function getBolsa() {
  return _parseBolsa(_sheet('4) Bolsa BBVA'), 6,
    { resp: 1, proy: 3, pedido: 4, horas: 5, restante: 10, consFecha: 6, consDet: 7, consHoras: 9 }, 11);
}

/** Adelantos agrupados (sin los cerrados/tachados). */
function getAdelantos() {
  return _parseBolsa(_sheet('5) Adelantos'), 8,
    { resp: 1, proy: 3, pedido: 4, horas: 6, restante: 11, importe: 12,
      consFecha: 7, consDet: 9, consProy: 8, consHoras: 10 }, 13);
}

/* ===========================================================================
 * 7b. CAPACIDAD WEB — asignaciones Persona-Proyecto-% gestionadas desde la
 *     página /capacidad del hub. Viven en una hoja PROPIA ("Capacidad_Web",
 *     oculta) para no tocar la pestaña legada "9) Capacidad" ni el resto del
 *     Excel. Columnas: Q | Proyecto | Persona | Pct | Actualizado.
 * =========================================================================== */
var HOJA_CAPACIDAD_WEB = 'Capacidad_Web';

function _sheetCapacidadWeb() {
  var ss = CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(HOJA_CAPACIDAD_WEB);
  if (!sh) {
    sh = ss.insertSheet(HOJA_CAPACIDAD_WEB);
    sh.getRange(1, 1, 1, 5).setValues([['Q', 'Proyecto', 'Persona', 'Pct', 'Actualizado']]);
    sh.hideSheet();
  }
  return sh;
}

/** Asignaciones de la web: todas, o solo las de un Q si se pasa p.q. */
function getCapacidadWeb(q) {
  var sh = _sheetCapacidadWeb();
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 4).getValues();
    for (var i = 0; i < vals.length; i++) {
      var vq = String(vals[i][0] || '').trim();
      if (!vq || (q && vq !== q)) continue;
      out.push({ q: vq, proyecto: String(vals[i][1] || ''), persona: String(vals[i][2] || ''), pct: Number(vals[i][3]) || 0 });
    }
  }
  return { asignaciones: out };
}

/** Reescribe TODAS las asignaciones de un Q (borrado + alta en bloque). */
function guardarCapacidadWeb(q, asignaciones) {
  if (!q) throw new Error('Falta el Q.');
  var sh = _sheetCapacidadWeb();
  var last = sh.getLastRow();
  // Borra de abajo arriba las filas de este Q.
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i][0] || '').trim() === q) sh.deleteRow(i + 2);
    }
  }
  var rows = [];
  var now = new Date();
  (asignaciones || []).forEach(function (a) {
    if (!a || !a.proyecto || !a.persona) return;
    rows.push([q, String(a.proyecto), String(a.persona), Number(a.pct) || 0, now]);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  return { q: q, n: rows.length };
}

/**
 * Horas de bolsa/adelantos CONSUMIDAS por Q, replicando la fórmula del total
 * de horas ejecutadas del Excel:
 *   SUMAR.SI.CONJUNTO('4) Bolsa BBVA'!J:J;      '4) Bolsa BBVA'!G:G;      <Q>)
 * + SUMAR.SI.CONJUNTO('Bolsa BBVA Cerrada'!M:M; 'Bolsa BBVA Cerrada'!L:L; <Q>)
 * + SUMAR.SI.CONJUNTO('5) Adelantos'!K:K;       '5) Adelantos'!H:H;       <Q>)
 * Devuelve { '2026Q3': horas, ... } con el Q normalizado (sin espacios/_).
 */
function getHorasBolsaPorQ() {
  var out = {};
  var suma = function (sheetName, qCol, hCol) {
    var sh = _ss().getSheetByName(sheetName);
    if (!sh) return;
    var last = Math.min(sh.getLastRow(), 5000);
    if (last < 2) return;
    var vals = sh.getRange(1, 1, last, Math.max(qCol, hCol)).getValues();
    for (var i = 0; i < vals.length; i++) {
      var q = String(vals[i][qCol - 1] === null ? '' : vals[i][qCol - 1]).replace(/[_\s]+/g, '').toUpperCase();
      var h = Number(vals[i][hCol - 1]);
      if (!/^\d{4}Q[1-4]$/.test(q) || isNaN(h) || !h) continue;
      out[q] = (out[q] || 0) + h;
    }
  };
  suma('4) Bolsa BBVA', 7, 10);       // G = Q del consumo, J = horas
  suma('Bolsa BBVA Cerrada', 12, 13); // L = Q del consumo, M = horas
  suma('5) Adelantos', 8, 11);        // H = Q del consumo, K = horas
  return out;
}

/**
 * SNAPSHOT: TODO lo necesario para el frontend y las simulaciones en una sola
 * llamada (minimiza la latencia de Apps Script).
 */
function getSnapshot() {
  // soloValores: el frontend de /simulador y /capacidad solo consume los
  // VALORES (nunca formulas/editable) -> snapshot mucho más pequeño y rápido.
  var lite = { soloValores: true };
  var ss = _ss();
  return {
    generadoEn: new Date().toISOString(),
    // Identifica el LIBRO del que sale todo: el frontend lo muestra para que
    // se vea a simple vista si el despliegue apunta al Excel equivocado.
    libro: { id: ss.getId(), nombre: ss.getName(), url: ss.getUrl() },
    tarifas: getTarifas(),
    iniciativas: getIniciativas(lite),
    ejecucion: getEjecucion(lite),
    economico: getControlEconomico(),
    capacidad: getCapacidad(),
    capacidadWeb: getCapacidadWeb().asignaciones, // asignaciones de la página /capacidad
    // (los gastos de la hoja 6 ya no van: la rentabilidad solo usa NFQ+NTER)
    bolsa: getBolsa().entries,        // agrupado y sin cerradas (tachadas)
    bolsaHorasQ: getHorasBolsaPorQ(), // horas de bolsa consumidas por Q (incl. hoja Cerrada)
    adelantos: getAdelantos().entries
    // (las encuestas ya no van en el snapshot: ninguna página las usa)
  };
}

/* ===========================================================================
 * 8. API WEB  (doGet / doPost -> JSON)
 * =========================================================================== */
function doGet(e)  { return _serve(e); }
function doPost(e) { return _serve(e); }

// Acciones de SOLO LECTURA: NO exigen token (la web pública sólo lee del libro).
// Cualquier acción de ESCRITURA (write/writeRange/batch/append/updateRow) SÍ
// exige token, que NO se publica en la web -> protege la modificación del Excel.
var _READ_ACTIONS = {
  '': 1, ping: 1, help: 1, meta: 1, sheets: 1, read: 1, readCell: 1, modifiable: 1,
  table: 1, row: 1, search: 1, snapshot: 1, tarifas: 1, iniciativas: 1,
  ejecucion: 1, economico: 1, capacidad: 1, capacidadWeb: 1,
  // guardarCapacidadWeb escribe SOLO en su hoja propia "Capacidad_Web" (nunca
  // en los datos del Excel) -> se permite sin token, como los backends de la web.
  guardarCapacidadWeb: 1
};

function _serve(e) {
  try {
    var p = _params(e);
    var action = p.action || 'help';
    if (!_READ_ACTIONS[action]) _auth(p); // sólo las escrituras requieren token
    return _json({ ok: true, action: action, data: _route(p.action, p) });
  } catch (err) {
    return _json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// Mezcla parámetros GET (e.parameter) con el cuerpo JSON (POST).
function _params(e) {
  var p = {};
  if (e && e.parameter) for (var k in e.parameter) p[k] = e.parameter[k];
  if (e && e.postData && e.postData.contents) {
    try { var b = JSON.parse(e.postData.contents); for (var j in b) p[j] = b[j]; } catch (_) {}
  }
  return p;
}

function _auth(p) {
  // Las escrituras genéricas al Excel (write/writeRange/batch/append/updateRow)
  // SOLO funcionan con un token real configurado. Con el token vacío o con el
  // placeholder del repositorio quedan DESHABILITADAS por completo: así se
  // garantiza que, desde la web, lo único que puede cambiar del Excel es la
  // hoja propia "Capacidad_Web" (guardarCapacidadWeb, en _READ_ACTIONS).
  if (!CONFIG.API_TOKEN || CONFIG.API_TOKEN === 'CAMBIA_ESTE_TOKEN_LARGO_Y_SECRETO')
    throw new Error('Escrituras genéricas deshabilitadas: configura un API_TOKEN propio en CONFIG.');
  if (p.token !== CONFIG.API_TOKEN) throw new Error('Token inválido o ausente.');
}

// Coerción de parámetros que pueden venir como string (GET) u objeto (POST).
function _bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function _num(v)  { return (v === undefined || v === null || v === '') ? undefined : Number(v); }
function _obj(v)  {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return v; } }
  return v;
}

function _route(action, p) {
  switch (action) {
    case undefined: case '': case 'ping': case 'help': return _help();
    case 'meta':        return getMeta();
    case 'sheets':      return getSheets();
    case 'read':        return readRange(p.sheet, p.a1);
    case 'readCell':    return readCell(p.sheet, p.a1);
    case 'modifiable':  return getModifiable(p.sheet, p.a1, { includeEmpty: _bool(p.includeEmpty) });
    case 'write':       return writeCell(p.sheet, p.a1, p.value, { force: _bool(p.force) });
    case 'writeRange':  return writeRange(p.sheet, p.a1, _obj(p.values), { force: _bool(p.force) });
    case 'batch':       return batchUpdate(_obj(p.updates), { force: _bool(p.force) });
    case 'table':       return getTable(p.sheet, { headerRow: _num(p.headerRow),
                                                   dataStartRow: _num(p.dataStartRow), where: _obj(p.where) });
    case 'row':         return getRow(p.sheet, _num(p.row), { headerRow: _num(p.headerRow) });
    case 'updateRow':   return updateRow(p.sheet, _num(p.row), _obj(p.patch),
                                         { headerRow: _num(p.headerRow), force: _bool(p.force) });
    case 'append':      return appendRow(p.sheet, _obj(p.data),
                                         { headerRow: _num(p.headerRow), row: _num(p.row), force: _bool(p.force) });
    case 'appendClone': return appendCloneRow(p.sheet, _obj(p.data), { headerRow: _num(p.headerRow) });
    case 'search':      return searchAll(p.query, { sheets: _obj(p.sheets),
                                                    numberedOnly: _bool(p.numberedOnly), limit: _num(p.limit) });
    // --- Lectura estructurada por módulo (alimenta las simulaciones) ---
    case 'snapshot':    return getSnapshot();
    case 'tarifas':     return getTarifas();
    case 'iniciativas': return getIniciativas();
    case 'ejecucion':   return getEjecucion();
    case 'economico':   return getControlEconomico();
    case 'capacidad':   return getCapacidad();
    case 'capacidadWeb':        return getCapacidadWeb(p.q);
    case 'guardarCapacidadWeb': return guardarCapacidadWeb(p.q, _obj(p.asignaciones));
    case 'bolsa':       return getBolsa();
    case 'adelantos':   return getAdelantos();
    default: throw new Error('Acción desconocida: "' + action + '". Llama action=help.');
  }
}

function _help() {
  return {
    info: 'Backend RDR BBVA. Envía ?action=... y token=... (POST JSON recomendado).',
    actions: {
      ping:       'sin token, comprueba conectividad',
      meta:       'metadatos del libro + esquema',
      sheets:     'lista de pestañas',
      read:       'sheet, a1?            -> valores+fórmulas+editable',
      readCell:   'sheet, a1',
      modifiable: 'sheet, a1?, includeEmpty? -> sólo celdas sin fórmula',
      write:      'sheet, a1, value, force?',
      writeRange: 'sheet, a1, values(2D), force?',
      batch:      'updates:[{sheet,a1,value|values}], force?',
      table:      'sheet, headerRow?, dataStartRow?, where?',
      row:        'sheet, row, headerRow?',
      updateRow:  'sheet, row, patch:{col:val}, headerRow?, force?',
      append:     'sheet, data:{col:val}, headerRow?, row?, force?',
      search:     'query, sheets?, numberedOnly?, limit?',
      snapshot:   'TODO el libro estructurado en una llamada (para el simulador)',
      tarifas:    'tarifas de proveedor por año/Q',
      iniciativas:'lista de iniciativas (con P/Q/R calculados)',
      ejecucion:  'ejecución + totalesHorasQ por trimestre',
      economico:  'control económico parseado por Q (personas, costes, rentab. obj.)',
      capacidad:  'capacidad parseada por Q (proyectos, asignaciones, capacidad/persona)'
    }
  };
}

function _json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ===========================================================================
 * 9. PRUEBAS RÁPIDAS (ejecútalas desde el editor para autorizar permisos)
 * =========================================================================== */
function _test_lectura() {
  Logger.log(getSheets());
  Logger.log(getTable('6) Gastos'));                 // tabla dinámica
  Logger.log(getModifiable('1) Iniciativas', 'B7:S7')); // sólo lo editable de una iniciativa
}
function _test_estructura() {
  Logger.log(getTarifas());
  Logger.log(getEjecucion().totalesHorasQ);
  Logger.log(getControlEconomico().bloques[0]); // bloque del Q más reciente
  Logger.log(getCapacidad().bloques[0]);
}
function _test_escritura() {
  // Cambia un comentario (celda sin fórmula) -> permitido.
  Logger.log(writeCell('6) Gastos', 'D5', 'Pago guardia (editado por backend)'));
  // Intenta pisar una fórmula -> debe fallar salvo force:true.
  try { writeCell('1) Iniciativas', 'Q7', 999); } catch (e) { Logger.log('Protegido OK: ' + e.message); }
}
