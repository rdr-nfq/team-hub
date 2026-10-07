/**
 * ============================================================================
 *  VACACIONES RDR  ·  Apps Script (backend de /vacaciones y /vacaciones-gestion)
 * ============================================================================
 *
 *  UN solo proyecto, ligado al Excel principal ("Vacaciones RDR Pablo", V_CONFIG.EXCEL_ID). Sustituye
 *  al Excel auxiliar, al Google Form y al panel de responsables antiguos
 *  (apps-script/vacaciones-antiguo/).
 *
 *  PESTAÑAS DEL EXCEL
 *   Una pestaña de cada por año (Vacas_2026, Festivos_2026, Solicitudes_2026…):
 *   · Vacas_<año>: rejilla editable a mano.
 *       Fila 1 mes · fila 2 día del mes · fila 3 día de la semana.
 *       Desde la fila 4, una persona por fila:
 *         A Persona · B Email · C Grupo festivos · D Activo
 *         E Días año anterior · F Días del año · G Total (=E+F)
 *         H VA (nº de días VA) · I Quedan (=G-H)
 *         J… una columna por día del año (1 ene → 31 dic) con el código:
 *         VA Vacaciones · VP Vac. proyecto · FO Formación · ES Permiso especial
 *         BA Baja · RE Revisión · FT Festivo trabajado · FE Festivo · VE Votación
 *       ⚠ No insertar ni borrar columnas de días: la columna de cada fecha se
 *         calcula (J = 1 de enero). Personas: añadir/quitar filas sin problema.
 *   · Solicitudes_<año>: una fila por petición. Clase NUEVA (pedir días), CANCELACION
 *       (liberar días ya aprobados) o MODIFICACION (cambiar unos días aprobados
 *       por otros). Todas pasan por la aprobación de coordinación.
 *       Estado: PENDIENTE · APROBADA · RECHAZADA · CANCELADA (la retira quien
 *       la pidió) · ANULADA (aprobada y luego cancelada entera) · MODIFICADA
 *       (aprobada y luego sustituida por un cambio).
 *   · Festivos_<año>: grupos y festivos en la misma pestaña, lado a lado.
 *       A:B  Grupo · País (ES/MX)            p. ej. Madrid/ES, México DC/MX
 *       D:F  Fecha · Grupo · Nombre          un festivo por grupo y día
 *   Las pestañas antiguas ("Vacaciones 2026", "2026_Calendario") quedan solo
 *   como registro: migrar2026() (Migracion_2026.gs) copia una vez a Vacas_2026.
 *
 *  REGLAS
 *   · Solo VA descuenta del saldo (igual que la fórmula del Excel antiguo).
 *   · Días de una solicitud = laborables: ni sábado/domingo ni festivo del
 *     grupo de la persona (ni celda FE en su fila).
 *   · Al aprobar se escribe el código en los días laborables del rango, se crea
 *     el evento en el calendario compartido y se avisa a quien lo pidió.
 *   · Coordinación = "coordinador": true en equipo.json (igual que el resto
 *     del hub). Desde la web se piden VA, FO y ES.
 *
 *  DESPLIEGUE (proyecto LIGADO al Excel "Vacaciones RDR"):
 *   1. Abrir el Excel principal -> Extensiones -> Apps Script -> pegar este fichero y
 *      Migracion_2026.gs (dos ficheros del mismo proyecto).
 *   2. Ejecutar `autorizar` y aceptar permisos (Hojas, Calendar, correo, UrlFetch).
 *   3. Ejecutar `empezarDeCero` (migración completa) y revisar la pestaña
 *      "Migracion_2026". Al reabrir el Excel aparece el menú «🌴 Vacaciones».
 *   4. Implementar -> Aplicación web (Ejecutar como: Yo · Acceso: Cualquier
 *      persona). Pegar la URL /exec en links.json -> "vacacionesV2Backend".
 *
 *  API — respuesta { ok, data | error }
 *   GET  ?action=ping
 *   GET  ?action=datos&anio=2026&email=…   calendario + mis solicitudes
 *        (+ saldos, solicitudes pendientes y grupos si el email es de coordinación)
 *   GET  ?modo=publico                      formato antiguo (lo usa el Time Report)
 *   POST text/plain JSON { action, email, … }:
 *        solicitar     { clase:'NUEVA', tipo, desde, hasta, comentario }
 *                      { clase:'CANCELACION', tipo, desde, hasta, ref?, comentario }
 *                      { clase:'MODIFICACION', tipoOrig, origDesde, origHasta,
 *                        tipo, desde, hasta, ref?, comentario }
 *                      (ref = Id de la solicitud aprobada original, si la hay:
 *                       los días migrados o puestos a mano en el Excel no tienen)
 *        cancelar      { id }                                   (la propia, pendiente)
 *        resolver      { id, decision:'aprobar'|'rechazar', motivo?, forzar? }   (coord.)
 *        guardarFestivo{ fecha, nombre, grupos:[…] }                              (coord.)
 *        borrarFestivo { fecha, grupo }                                            (coord.)
 *        guardarGrupo  { grupo, pais, anterior? }   (crear o renombrar)            (coord.)
 *        borrarGrupo   { grupo }                                                   (coord.)
 *        asignarGrupo  { anio, persona, grupo }                                    (coord.)
 *        crearAnio     { anio }                     (Vacas_<anio> desde el anterior) (coord.)
 * ============================================================================
 */

const V_CONFIG = {
  EXCEL_ID: '1XflnB-FMdEAK1RXrO3qxMLOLC-oxd9jL6pUkIkKfRwU', // «Vacaciones RDR Pablo»
  EQUIPO_JSON_URL: 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json',
  WEB_URL: 'https://rdr-nfq.github.io/team-hub/vacaciones/',
  GESTION_URL: 'https://rdr-nfq.github.io/team-hub/vacaciones-gestion/',
  // Calendario compartido donde se crea un evento al aprobar (vacío = no se crea).
  CALENDARIO_ID: 'c_7f897d2240e831b1b87e40c7018e7c9d300b59f1b57146aade363d870536c314@group.calendar.google.com',
  REMITE: 'Vacaciones RDR',
  TIPOS_SOLICITABLES: ['VA', 'FO', 'ES']
};

// Una pestaña de cada por año: Vacas_2026, Festivos_2026, Solicitudes_2026.
const PREFIJO_ANIO = 'Vacas_';
const PREFIJO_FESTIVOS = 'Festivos_';
const PREFIJO_SOLICITUDES = 'Solicitudes_';
// Festivos_<año>: dos tablas lado a lado. A:B grupos · D:F festivos.
const F = { GRUPO: 1, PAIS: 2, FECHA: 4, FGRUPO: 5, NOMBRE: 6 };

// Rejilla Vacas_<año>
const G = {
  FILA_MES: 1, FILA_DIA: 2, FILA_SEM: 3, FILA_1: 4,
  PERSONA: 1, EMAIL: 2, GRUPO: 3, ACTIVO: 4, ANTERIORES: 5, DIAS: 6, TOTAL: 7, VA: 8, QUEDAN: 9,
  DIA1: 10
};
const CABECERA_GRID = ['Persona', 'Email', 'Grupo festivos', 'Activo', 'Días año anterior', 'Días del año', 'Total', 'VA', 'Quedan'];

const CODIGOS = {
  VA: { texto: 'Vacaciones', color: '#88E783' },
  VP: { texto: 'Vacaciones proyecto', color: '#8BE1E9' },
  FO: { texto: 'Formación', color: '#85C8FF' },
  ES: { texto: 'Permiso especial', color: '#9694FF' },
  BA: { texto: 'Baja', color: '#FF9A9A' },
  RE: { texto: 'Revisión', color: '#FFE761' },
  FT: { texto: 'Festivo trabajado', color: '#FFB56B' },
  FE: { texto: 'Festivo', color: '#CAD1D8' },
  VE: { texto: 'Votación elecciones', color: '#E2E6EA' }
};

const COLS_SOL = ['Id', 'Creada', 'Email', 'Persona', 'Clase', 'Tipo', 'Desde', 'Hasta', 'Días',
  'Tipo original', 'Original desde', 'Original hasta', 'Días original', 'Referencia',
  'Comentario', 'Estado', 'Resuelta por', 'Resuelta', 'Motivo', 'Evento calendario'];
const CLASES = ['NUEVA', 'CANCELACION', 'MODIFICACION'];
const S = {}; COLS_SOL.forEach(function (c, i) { S[c] = i; });

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
// Color por persona (solo para la web: identifica a cada uno en el calendario).
const PALETA_PERSONAS = ['#85C8FF', '#88E783', '#FFB56B', '#9694FF', '#8BE1E9', '#FFE761', '#5BBEFF', '#F8CD51', '#B5E5A4', '#D0A3FF'];

/* EJECUTAR UNA VEZ A MANO tras pegar código nuevo: pide todos los permisos. */
function autorizar() {
  _ss().getName();
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch(V_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true });
  if (V_CONFIG.CALENDARIO_ID) CalendarApp.getCalendarById(V_CONFIG.CALENDARIO_ID);
  Logger.log('Permisos concedidos. Excel: ' + _ss().getName());
}

function _ss() { return SpreadsheetApp.openById(V_CONFIG.EXCEL_ID); }

// ── Entrada HTTP ─────────────────────────────────────────────────────────────
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (String(p.modo || '').toLowerCase() === 'publico') {
    try { return _salida(datosPublicos(p.anio)); } catch (err) { return _salida({ error: String(err.message || err) }); }
  }
  return _servir(p);
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
  const q = (e && e.parameter) || {};
  Object.keys(q).forEach(function (k) { if (p[k] === undefined) p[k] = q[k]; });
  return _servir(p);
}

function _servir(p) {
  try {
    let data;
    switch (p.action) {
      case 'ping': data = { ok: true, excel: _ss().getName() }; break;
      case 'datos': data = datos(p.anio, p.email); break;
      case 'solicitar': data = solicitar(p); break;
      case 'cancelar': data = cancelar(p); break;
      case 'resolver': _exigirCoord(p.email); data = resolver(p); break;
      case 'guardarFestivo': _exigirCoord(p.email); data = guardarFestivo(p); break;
      case 'borrarFestivo': _exigirCoord(p.email); data = borrarFestivo(p); break;
      case 'guardarGrupo': _exigirCoord(p.email); data = guardarGrupo(p); break;
      case 'borrarGrupo': _exigirCoord(p.email); data = borrarGrupo(p); break;
      case 'asignarGrupo': _exigirCoord(p.email); data = asignarGrupo(p); break;
      case 'crearAnio': _exigirCoord(p.email); data = crearAnio(p); break;
      default: throw new Error('Acción desconocida: ' + p.action);
    }
    return _salida({ ok: true, data: data });
  } catch (err) {
    console.error(err);
    return _salida({ ok: false, error: String((err && err.message) || err) });
  }
}

function _salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Fechas (ISO "yyyy-MM-dd", aritmética en UTC: sin sustos de zona horaria) ──
function _pad(n) { return (n < 10 ? '0' : '') + n; }
function _isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
function _utc(iso) { const p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
function _isoDeUtc(t) { const d = new Date(t); return d.getUTCFullYear() + '-' + _pad(d.getUTCMonth() + 1) + '-' + _pad(d.getUTCDate()); }
function _sumar(iso, n) { return _isoDeUtc(_utc(iso) + n * 86400000); }
function _dow(iso) { return new Date(_utc(iso)).getUTCDay(); }
function _finde(iso) { const d = _dow(iso); return d === 0 || d === 6; }
function _diasAnio(anio) { return (Date.UTC(anio + 1, 0, 1) - Date.UTC(anio, 0, 1)) / 86400000; }
function _idxDia(iso) { return Math.round((_utc(iso) - Date.UTC(Number(iso.slice(0, 4)), 0, 1)) / 86400000); }
function _isoDeIdx(anio, idx) { return _isoDeUtc(Date.UTC(anio, 0, 1) + idx * 86400000); }
function _rango(desde, hasta) { const out = []; for (let d = desde; d <= hasta; d = _sumar(d, 1)) out.push(d); return out; }
function _hoyISO() { return Utilities.formatDate(new Date(), _ss().getSpreadsheetTimeZone() || 'Europe/Madrid', 'yyyy-MM-dd'); }
function _fechaEs(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

/** Celda -> ISO: admite Date, "2026-10-08", "8/10/2026". '' si no es fecha. */
function _isoDeCelda(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz || 'Europe/Madrid', 'yyyy-MM-dd');
  const s = String(v || '').trim();
  if (_isoOk(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + _pad(Number(m[2])) + '-' + _pad(Number(m[1]));
  return '';
}

function _colLetra(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function _norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function _normEmail(s) { return String(s || '').trim().toLowerCase(); }
function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ── Equipo (equipo.json) ────────────────────────────────────────────────────
function _equipo() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('equipo');
  if (hit) return JSON.parse(hit);
  const resp = UrlFetchApp.fetch(V_CONFIG.EQUIPO_JSON_URL, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
  const team = (JSON.parse(resp.getContentText()).team || []).filter(function (m) { return m && m.nombre; });
  cache.put('equipo', JSON.stringify(team), 300);
  return team;
}
function _emailsDe(m) { return [m.email, m.emailBBVA].map(_normEmail).filter(Boolean); }
function _esCoord(email) {
  const e = _normEmail(email);
  return !!e && _equipo().some(function (m) { return m.coordinador === true && _emailsDe(m).indexOf(e) >= 0; });
}
function _exigirCoord(email) {
  if (!_esCoord(email)) throw new Error('Solo coordinación puede hacer esto (' + (email || 'sin email') + ').');
}
function _coordinadores() {
  return _equipo().filter(function (m) { return m.coordinador === true && m.email; }).map(function (m) { return _normEmail(m.email); });
}
/** Emails (web y BBVA) de equipo.json que corresponden a un email dado. */
function _aliasEmail(email) {
  const e = _normEmail(email);
  const m = _equipo().filter(function (x) { return _emailsDe(x).indexOf(e) >= 0; })[0];
  return m ? _emailsDe(m) : [e];
}

// ── Grupos y festivos ───────────────────────────────────────────────────────
function _nombreFestivos(anio) { return PREFIJO_FESTIVOS + anio; }
function _nombreSolicitudes(anio) { return PREFIJO_SOLICITUDES + anio; }
/** Años con pestaña de ese prefijo (p. ej. Festivos_2026 -> 2026). */
function _aniosDe(ss, prefijo) {
  const re = new RegExp('^' + prefijo + '(\\d{4})$');
  return ss.getSheets().map(function (sh) { const m = re.exec(sh.getName()); return m ? Number(m[1]) : null; })
    .filter(Boolean).sort();
}
/** Última fila con dato en una columna (las dos tablas de Festivos crecen por separado). */
function _ultimaFila(sh, col) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const vals = sh.getRange(2, col, n - 1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim() !== '') return i + 2;
  return 1;
}

/** Festivos_<anio>: la crea con su formato si no existe. */
function _hojaFestivos(ss, anio) {
  const nombre = _nombreFestivos(anio);
  let sh = ss.getSheetByName(nombre);
  if (sh) return sh;
  sh = ss.insertSheet(nombre);
  sh.getRange(1, 1, 1, 6).setValues([['Grupo', 'País (ES/MX)', '', 'Fecha', 'Grupo', 'Nombre']]);
  [sh.getRange(1, F.GRUPO, 1, 2), sh.getRange(1, F.FECHA, 1, 3)].forEach(function (r) {
    r.setFontWeight('bold').setBackground('#001391').setFontColor('#F7F8F8');
  });
  sh.getRange(2, 1, 500, 6).setFontColor('#001391');
  sh.getRange(2, F.FECHA, 500, 1).setNumberFormat('@');
  sh.getRange(2, F.PAIS, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ES', 'MX'], true).build());
  sh.getRange(2, F.FGRUPO, 500, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(sh.getRange('A2:A200'), true).setAllowInvalid(true).build());
  sh.setFrozenRows(1);
  sh.setHiddenGridlines(true);
  sh.setColumnWidth(F.GRUPO, 160); sh.setColumnWidth(F.PAIS, 90); sh.setColumnWidth(3, 30);
  sh.setColumnWidth(F.FECHA, 110); sh.setColumnWidth(F.FGRUPO, 160); sh.setColumnWidth(F.NOMBRE, 260);
  sh.getRange(1, 1).setNote('Grupos de festivos (A:B) y festivos de cada grupo (D:F). Cada persona tiene su grupo en Vacas_' + anio + ' (columna C).');
  return sh;
}

/** Deja la tabla de festivos (D:F) ordenada por fecha y grupo. */
function _ordenarFestivos(sh) {
  const n = _ultimaFila(sh, F.FECHA);
  if (n > 2) sh.getRange(2, F.FECHA, n - 1, 3).sort([{ column: F.FECHA, ascending: true }, { column: F.FGRUPO, ascending: true }]);
}

/** Grupos de un año: [{grupo, pais, fila, sh}] ([] si no hay Festivos_<anio>). */
function _leerGrupos(ss, anio) {
  const sh = ss.getSheetByName(_nombreFestivos(anio));
  if (!sh || sh.getLastRow() < 2) return [];
  const out = [];
  sh.getRange(2, F.GRUPO, sh.getLastRow() - 1, 2).getValues().forEach(function (r, i) {
    const g = String(r[0] || '').trim();
    if (g) out.push({ grupo: g, pais: String(r[1] || 'ES').trim().toUpperCase() === 'MX' ? 'MX' : 'ES', fila: i + 2, sh: sh });
  });
  return out;
}

/** Festivos de un año, o de todos los Festivos_<año> si no se indica. */
function _leerFestivos(ss, anio) {
  const tz = ss.getSpreadsheetTimeZone();
  const anios = anio ? [Number(anio)] : _aniosDe(ss, PREFIJO_FESTIVOS);
  const out = [];
  anios.forEach(function (a) {
    const sh = ss.getSheetByName(_nombreFestivos(a));
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, F.FECHA, sh.getLastRow() - 1, 3).getValues().forEach(function (r, i) {
      const fecha = _isoDeCelda(r[0], tz);
      const grupo = String(r[1] || '').trim();
      if (fecha && grupo) out.push({ fecha: fecha, grupo: grupo, nombre: String(r[2] || '').trim(), fila: i + 2, sh: sh });
    });
  });
  return out;
}

/** { grupo: Set(iso) } */
function _festivosPorGrupo(festivos) {
  const out = {};
  festivos.forEach(function (f) { (out[f.grupo] = out[f.grupo] || {})[f.fecha] = true; });
  return out;
}

// ── Rejilla Vacas_<año> ─────────────────────────────────────────────────────
function _nombreHoja(anio) { return PREFIJO_ANIO + anio; }
function _anios(ss) {
  return ss.getSheets().map(function (s) { const m = /^Vacas_(\d{4})$/.exec(s.getName()); return m ? Number(m[1]) : null; })
    .filter(Boolean).sort();
}

/** Lee Vacas_<anio>: { sh, anio, nDias, personas:[{fila, nombre, email, grupo, activo, anteriores, dias, total, va, quedan, codigos[]}] } */
function _leerAnio(ss, anio) {
  const sh = ss.getSheetByName(_nombreHoja(anio));
  if (!sh) return null;
  const nDias = _diasAnio(anio);
  const ultima = sh.getLastRow();
  const personas = [];
  if (ultima >= G.FILA_1) {
    const vals = sh.getRange(G.FILA_1, 1, ultima - G.FILA_1 + 1, G.DIA1 - 1 + nDias).getValues();
    vals.forEach(function (r, i) {
      const nombre = String(r[G.PERSONA - 1] || '').trim();
      if (!nombre) return;
      const codigos = r.slice(G.DIA1 - 1).map(function (c) { return String(c || '').trim().toUpperCase(); });
      const anteriores = Number(r[G.ANTERIORES - 1]) || 0;
      const dias = Number(r[G.DIAS - 1]) || 0;
      const va = codigos.filter(function (c) { return c === 'VA'; }).length;
      const activoRaw = r[G.ACTIVO - 1];
      personas.push({
        fila: G.FILA_1 + i, nombre: nombre,
        email: _normEmail(r[G.EMAIL - 1]),
        grupo: String(r[G.GRUPO - 1] || '').trim(),
        activo: !(activoRaw === false || String(activoRaw).toUpperCase() === 'FALSE' || String(activoRaw).toUpperCase() === 'FALSO'),
        anteriores: anteriores, dias: dias, total: anteriores + dias, va: va, quedan: anteriores + dias - va,
        codigos: codigos
      });
    });
  }
  return { sh: sh, anio: anio, nDias: nDias, personas: personas };
}

function _personaPorEmail(grid, email) {
  const alias = _aliasEmail(email);
  let p = grid.personas.filter(function (x) { return x.email && alias.indexOf(x.email) >= 0; })[0];
  if (p) return p;
  // Sin email en la rejilla: por nombre de equipo.json.
  const m = _equipo().filter(function (x) { return _emailsDe(x).indexOf(_normEmail(email)) >= 0; })[0];
  if (!m) return null;
  return grid.personas.filter(function (x) { return _mismoNombre(x.nombre, m.nombre); })[0] || null;
}
function _personaPorNombre(grid, nombre) {
  return grid.personas.filter(function (x) { return x.nombre === nombre; })[0] || null;
}

/** Nombres "parecidos": iguales normalizados o con 2+ palabras en común. */
function _mismoNombre(a, b) {
  const x = _norm(a), y = _norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const tx = x.split(' '), ty = y.split(' ');
  const comunes = tx.filter(function (t) { return t.length > 1 && ty.indexOf(t) >= 0; }).length;
  return comunes >= 2 || (comunes === 1 && Math.min(tx.length, ty.length) === 1);
}

/** ¿Día laborable para esta persona? (ni finde, ni festivo de su grupo, ni FE en su fila) */
function _laborable(persona, iso, fxg) {
  if (_finde(iso)) return false;
  if (persona.grupo && fxg[persona.grupo] && fxg[persona.grupo][iso]) return false;
  const c = persona.codigos[_idxDia(iso)];
  return c !== 'FE';
}

// ── Lectura para la web ─────────────────────────────────────────────────────
function datos(anioParam, email) {
  const ss = _ss();
  const anios = _anios(ss);
  const anioHoy = Number(_hoyISO().slice(0, 4));
  const anio = Number(anioParam) || (anios.indexOf(anioHoy) >= 0 ? anioHoy : anios[anios.length - 1]);
  const grid = anio ? _leerAnio(ss, anio) : null;
  if (!grid) throw new Error('No existe la pestaña ' + _nombreHoja(anio || anioHoy) + ' en el Excel. ¿Se ha ejecutado migrar2026()?');

  const grupos = _leerGrupos(ss, anio);
  const festivos = _leerFestivos(ss, anio);
  const esCoord = _esCoord(email);
  const yo = email ? _personaPorEmail(grid, email) : null;

  // Personas: activas primero y alfabético; color fijo por persona.
  const orden = grid.personas.slice().sort(function (a, b) {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  const empleados = orden.map(function (p, i) {
    return { nombre: p.nombre, color: PALETA_PERSONAS[i % PALETA_PERSONAS.length], activo: p.activo, grupo: p.grupo };
  });
  const empleadosMap = {};
  empleados.forEach(function (e) { empleadosMap[e.nombre] = e; });

  const ausenciasPorDia = {};
  grid.personas.forEach(function (p) {
    p.codigos.forEach(function (c, i) {
      if (!c || c === 'FE') return;
      const iso = _isoDeIdx(anio, i);
      (ausenciasPorDia[iso] = ausenciasPorDia[iso] || []).push({ nombre: p.nombre, motivo: c });
    });
  });

  const out = {
    v: 2, year: anio, anios: anios, generatedAt: new Date().toISOString(),
    esCoordinador: esCoord,
    yo: yo ? { nombre: yo.nombre, grupo: yo.grupo } : null,
    empleados: empleados, empleadosMap: empleadosMap, paletaEquipos: {},
    ausenciasPorDia: ausenciasPorDia,
    festivos: _festivosVista(festivos, grupos),
    festivosDetalle: festivos.map(function (f) { return { fecha: f.fecha, grupo: f.grupo, nombre: f.nombre }; }),
    grupos: grupos.map(function (g) { return { grupo: g.grupo, pais: g.pais }; }),
    tipos: V_CONFIG.TIPOS_SOLICITABLES.map(function (t) { return { id: t, texto: CODIGOS[t].texto }; }),
    misSolicitudes: []
  };

  const sols = _leerSolicitudes(ss);
  if (email) {
    const alias = _aliasEmail(email);
    out.misSolicitudes = sols.filter(function (s) { return alias.indexOf(s.email) >= 0; })
      .sort(function (a, b) { return b.creada.localeCompare(a.creada); }).slice(0, 40).map(_solPublica);
  }

  if (esCoord) {
    const pendientes = sols.filter(function (s) { return s.estado === 'PENDIENTE'; });
    out.pendientes = pendientes.sort(function (a, b) { return a.desde.localeCompare(b.desde); }).map(_solPublica);
    out.recientes = sols.filter(function (s) { return s.estado !== 'PENDIENTE'; })
      .sort(function (a, b) { return String(b.resuelta).localeCompare(String(a.resuelta)); }).slice(0, 25).map(_solPublica);
    out.saldos = grid.personas.map(function (p) {
      // Efecto neto en VA de lo pendiente (las cancelaciones suman, los cambios compensan).
      const pend = pendientes.filter(function (s) { return s.persona === p.nombre && s.desde.slice(0, 4) === String(anio); })
        .reduce(function (n, s) { return n + _deltaVA(s); }, 0);
      return {
        nombre: p.nombre, email: p.email, grupo: p.grupo, activo: p.activo,
        anteriores: p.anteriores, dias: p.dias, total: p.total, va: p.va, quedan: p.quedan,
        pendientesVA: pend, quedanTrasPendientes: p.quedan - pend
      };
    });
    out.festivosTodos = _leerFestivos(ss).map(function (f) { return { fecha: f.fecha, grupo: f.grupo, nombre: f.nombre }; });
  }
  return out;
}

/** Vista de calendario: fecha -> 'ES' | 'MX' | 'AMBOS' según el país de los grupos. */
function _festivosVista(festivos, grupos) {
  const pais = {};
  grupos.forEach(function (g) { pais[g.grupo] = g.pais; });
  const out = {};
  festivos.forEach(function (f) {
    const p = pais[f.grupo] || 'ES';
    out[f.fecha] = out[f.fecha] && out[f.fecha] !== p ? 'AMBOS' : p;
  });
  return out;
}

/** Formato antiguo (?modo=publico): lo sigue usando el Time Report (festivos). */
function datosPublicos(anio) {
  const d = datos(anio, '');
  return {
    year: d.year, generatedAt: d.generatedAt,
    empleados: d.empleados, empleadosMap: d.empleadosMap, paletaEquipos: {},
    ausenciasPorDia: d.ausenciasPorDia, festivos: d.festivos
  };
}

// ── Solicitudes ─────────────────────────────────────────────────────────────
function _hojaSolicitudes(ss, anio) {
  const nombre = _nombreSolicitudes(anio);
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, COLS_SOL.length).setValues([COLS_SOL]).setFontWeight('bold').setBackground('#001391').setFontColor('#F7F8F8');
    sh.getRange(2, 1, 1000, COLS_SOL.length).setFontColor('#001391');
    [S.Creada, S.Desde, S.Hasta, S['Original desde'], S['Original hasta'], S.Resuelta].forEach(function (c) {
      sh.getRange(2, c + 1, 1000, 1).setNumberFormat('@');
    });
    sh.setFrozenRows(1);
    sh.setHiddenGridlines(true);
    return sh;
  }
  const cab = sh.getRange(1, 1, 1, COLS_SOL.length).getValues()[0];
  if (cab.join('|') !== COLS_SOL.join('|')) {
    if (sh.getLastRow() > 1) throw new Error('La pestaña ' + nombre + ' tiene columnas de otra versión: renómbrala (p. ej. ' + nombre + '_old) y se creará de nuevo.');
    sh.getRange(1, 1, 1, COLS_SOL.length).setValues([COLS_SOL]).setFontWeight('bold');
  }
  return sh;
}

/** Solicitudes de un año, o de todos los Solicitudes_<año>. Cada una lleva su pestaña (sh). */
function _leerSolicitudes(ss, anio) {
  const tz = ss.getSpreadsheetTimeZone();
  const t = function (v) { return v instanceof Date ? v.toISOString() : String(v || ''); };
  const anios = anio ? [Number(anio)] : _aniosDe(ss, PREFIJO_SOLICITUDES);
  const out = [];
  anios.forEach(function (a) {
    const sh = ss.getSheetByName(_nombreSolicitudes(a));
    if (!sh || sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, COLS_SOL.length).getValues().forEach(function (r, i) {
      if (!String(r[S.Id] || '').trim()) return;
      const clase = String(r[S.Clase] || 'NUEVA').trim().toUpperCase();
      out.push({
        sh: sh, fila: i + 2, id: String(r[S.Id]), creada: t(r[S.Creada]),
        email: _normEmail(r[S.Email]), persona: String(r[S.Persona]).trim(),
        clase: CLASES.indexOf(clase) >= 0 ? clase : 'NUEVA',
        tipo: String(r[S.Tipo]).trim().toUpperCase(),
        desde: _isoDeCelda(r[S.Desde], tz), hasta: _isoDeCelda(r[S.Hasta], tz), dias: Number(r[S.Días]) || 0,
        tipoOrig: String(r[S['Tipo original']] || '').trim().toUpperCase(),
        origDesde: _isoDeCelda(r[S['Original desde']], tz), origHasta: _isoDeCelda(r[S['Original hasta']], tz),
        diasOrig: Number(r[S['Días original']]) || 0, ref: String(r[S.Referencia] || '').trim(),
        comentario: String(r[S.Comentario] || ''), estado: String(r[S.Estado] || '').trim().toUpperCase(),
        resueltaPor: String(r[S['Resuelta por']] || ''), resuelta: t(r[S.Resuelta]),
        motivo: String(r[S.Motivo] || ''), evento: String(r[S['Evento calendario']] || '')
      });
    });
  });
  return out;
}

function _solPublica(s) {
  return {
    id: s.id, creada: s.creada, persona: s.persona, clase: s.clase, tipo: s.tipo, desde: s.desde, hasta: s.hasta, dias: s.dias,
    tipoOrig: s.tipoOrig, origDesde: s.origDesde, origHasta: s.origHasta, diasOrig: s.diasOrig, ref: s.ref,
    comentario: s.comentario, estado: s.estado, resueltaPor: s.resueltaPor, resuelta: s.resuelta, motivo: s.motivo,
    deltaVA: _deltaVA(s)
  };
}

/** Efecto de la solicitud en los días de VA consumidos (+ consume, − libera). */
function _deltaVA(s) {
  if (s.clase === 'CANCELACION') return s.tipo === 'VA' ? -s.dias : 0;
  if (s.clase === 'MODIFICACION') return (s.tipo === 'VA' ? s.dias : 0) - (s.tipoOrig === 'VA' ? s.diasOrig : 0);
  return s.tipo === 'VA' ? s.dias : 0;
}

/** Días laborables del rango para la persona y días en conflicto (celdas ocupadas,
 *  salvo las que se van a liberar en el mismo cambio: `libres`). */
function _analizarRango(persona, desde, hasta, fxg, libres) {
  const laborables = [], ocupados = [];
  _rango(desde, hasta).forEach(function (iso) {
    if (!_laborable(persona, iso, fxg)) return;
    laborables.push(iso);
    const c = persona.codigos[_idxDia(iso)];
    if (c && !(libres && libres.indexOf(iso) >= 0)) ocupados.push(iso + ' (' + c + ')');
  });
  return { laborables: laborables, ocupados: ocupados };
}

/** Días del rango cuya celda tiene exactamente ese código (los que se liberarían). */
function _diasConCodigo(persona, desde, hasta, tipo) {
  return _rango(desde, hasta).filter(function (iso) { return persona.codigos[_idxDia(iso)] === tipo; });
}

function _validarRango(desde, hasta, que) {
  if (!_isoOk(desde) || !_isoOk(hasta)) throw new Error('Fechas no válidas' + (que ? ' (' + que + ')' : '') + '.');
  if (hasta < desde) throw new Error('La fecha de fin es anterior a la de inicio' + (que ? ' (' + que + ')' : '') + '.');
  if (desde.slice(0, 4) !== hasta.slice(0, 4)) throw new Error('No puede cruzar de año: divídela en dos (hasta el 31/12 y desde el 1/1).');
}

function solicitar(p) {
  const email = _normEmail(p.email);
  if (!email) throw new Error('Falta tu email.');
  const clase = String(p.clase || 'NUEVA').toUpperCase();
  if (CLASES.indexOf(clase) < 0) throw new Error('Clase de solicitud no válida: ' + p.clase);
  const tipo = String(p.tipo || '').toUpperCase();
  if (V_CONFIG.TIPOS_SOLICITABLES.indexOf(tipo) < 0) throw new Error('Tipo no válido: ' + p.tipo);
  const desde = String(p.desde || ''), hasta = String(p.hasta || '');
  _validarRango(desde, hasta, clase === 'MODIFICACION' ? 'días nuevos' : '');
  const tipoOrig = clase === 'MODIFICACION' ? String(p.tipoOrig || '').toUpperCase() : '';
  const origDesde = clase === 'MODIFICACION' ? String(p.origDesde || '') : '';
  const origHasta = clase === 'MODIFICACION' ? String(p.origHasta || '') : '';
  if (clase === 'MODIFICACION') {
    if (!CODIGOS[tipoOrig]) throw new Error('Tipo original no válido.');
    _validarRango(origDesde, origHasta, 'días originales');
    if (origDesde.slice(0, 4) !== desde.slice(0, 4)) throw new Error('El cambio tiene que quedarse en el mismo año.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = _ss();
    const anio = Number(desde.slice(0, 4));
    const grid = _leerAnio(ss, anio);
    if (!grid) throw new Error('Todavía no existe la pestaña ' + _nombreHoja(anio) + ': avisa a coordinación.');
    const persona = _personaPorEmail(grid, email);
    if (!persona) throw new Error('No apareces en ' + _nombreHoja(anio) + ' (' + email + '): pide a coordinación que te añada.');
    const fxg = _festivosPorGrupo(_leerFestivos(ss));
    const sols = _leerSolicitudes(ss);

    let dias = 0, diasOrig = 0;
    if (clase === 'NUEVA') {
      const a = _analizarRango(persona, desde, hasta, fxg);
      if (!a.laborables.length) throw new Error('El rango no tiene días laborables (fines de semana o festivos).');
      if (a.ocupados.length) throw new Error('Ya tienes días registrados en ese rango: ' + a.ocupados.join(', ') + '.');
      dias = a.laborables.length;
    } else if (clase === 'CANCELACION') {
      const libres = _diasConCodigo(persona, desde, hasta, tipo);
      if (!libres.length) throw new Error('No tienes días de ' + CODIGOS[tipo].texto.toLowerCase() + ' entre el ' + _fechaEs(desde) + ' y el ' + _fechaEs(hasta) + '.');
      dias = libres.length;
    } else {
      const libres = _diasConCodigo(persona, origDesde, origHasta, tipoOrig);
      if (!libres.length) throw new Error('No tienes días de ' + CODIGOS[tipoOrig].texto.toLowerCase() + ' entre el ' + _fechaEs(origDesde) + ' y el ' + _fechaEs(origHasta) + '.');
      const a = _analizarRango(persona, desde, hasta, fxg, libres);
      if (!a.laborables.length) throw new Error('Los días nuevos no tienen ningún laborable.');
      if (a.ocupados.length) throw new Error('Los días nuevos chocan con otros que ya tienes: ' + a.ocupados.join(', ') + '.');
      if (tipo === tipoOrig && a.laborables.join(',') === libres.join(',')) throw new Error('El cambio deja los mismos días: no hay nada que modificar.');
      dias = a.laborables.length; diasOrig = libres.length;
    }

    // Nada pendiente de esa persona que toque los mismos días.
    const rangos = [[desde, hasta]].concat(clase === 'MODIFICACION' ? [[origDesde, origHasta]] : []);
    const solapa = sols.filter(function (s) {
      if (s.estado !== 'PENDIENTE' || s.persona !== persona.nombre) return false;
      const suyos = [[s.desde, s.hasta]].concat(s.clase === 'MODIFICACION' ? [[s.origDesde, s.origHasta]] : []);
      return rangos.some(function (r) { return suyos.some(function (x) { return !(x[1] < r[0] || x[0] > r[1]); }); });
    });
    if (solapa.length) throw new Error('Ya tienes una solicitud pendiente sobre esos días (' + _fechaEs(solapa[0].desde) + ' – ' + _fechaEs(solapa[0].hasta) + '): espera a que se resuelva o cancélala.');

    let ref = String(p.ref || '').trim();
    if (ref && !sols.some(function (s) { return s.id === ref && s.persona === persona.nombre && s.estado === 'APROBADA'; })) ref = '';

    // Id único (dos solicitudes en el mismo segundo no pueden compartirlo).
    const usados = {};
    sols.forEach(function (x) { usados[x.id] = true; });
    let id;
    do { id = 'VAC-' + Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6); } while (usados[id]);
    const fila = COLS_SOL.map(function () { return ''; });
    fila[S.Id] = id; fila[S.Creada] = new Date().toISOString(); fila[S.Email] = email; fila[S.Persona] = persona.nombre;
    fila[S.Clase] = clase; fila[S.Tipo] = tipo; fila[S.Desde] = desde; fila[S.Hasta] = hasta; fila[S.Días] = dias;
    fila[S['Tipo original']] = tipoOrig; fila[S['Original desde']] = origDesde; fila[S['Original hasta']] = origHasta;
    fila[S['Días original']] = clase === 'MODIFICACION' ? diasOrig : ''; fila[S.Referencia] = ref;
    fila[S.Comentario] = String(p.comentario || '').slice(0, 1000); fila[S.Estado] = 'PENDIENTE';
    _hojaSolicitudes(ss, anio).appendRow(fila);

    const sol = { id: id, persona: persona.nombre, email: email, clase: clase, tipo: tipo, desde: desde, hasta: hasta, dias: dias,
      tipoOrig: tipoOrig, origDesde: origDesde, origHasta: origHasta, diasOrig: diasOrig, ref: ref, comentario: String(p.comentario || '') };
    const pendDelta = sols.filter(function (s) { return s.estado === 'PENDIENTE' && s.persona === persona.nombre; })
      .reduce(function (n, s) { return n + _deltaVA(s); }, 0);
    const delta = _deltaVA(sol);
    const saldoTras = delta ? persona.quedan - pendDelta - delta : null;
    const aviso = _avisar(function () { _correoNuevaSolicitud(sol, saldoTras); });
    return { solicitud: _solPublica(sol), aviso: aviso };
  } finally {
    lock.releaseLock();
  }
}

function cancelar(p) {
  const ss = _ss();
  const alias = _aliasEmail(p.email);
  const s = _leerSolicitudes(ss).filter(function (x) { return x.id === String(p.id); })[0];
  if (!s) throw new Error('No se encuentra la solicitud.');
  if (alias.indexOf(s.email) < 0) throw new Error('Solo puedes retirar tus propias solicitudes.');
  if (s.estado !== 'PENDIENTE') throw new Error('Solo se pueden retirar solicitudes pendientes (esta está ' + s.estado.toLowerCase() + '). Para anular días ya aprobados, pide una cancelación.');
  const sh = s.sh;
  sh.getRange(s.fila, S.Estado + 1).setValue('CANCELADA');
  sh.getRange(s.fila, S.Resuelta + 1).setValue(new Date().toISOString());
  return { id: s.id, estado: 'CANCELADA' };
}

function resolver(p) {
  const decision = String(p.decision || '').toLowerCase();
  if (decision !== 'aprobar' && decision !== 'rechazar') throw new Error('Decisión no válida.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = _ss();
    const sols = _leerSolicitudes(ss);
    const s = sols.filter(function (x) { return x.id === String(p.id); })[0];
    if (!s) throw new Error('No se encuentra la solicitud.');
    if (s.estado !== 'PENDIENTE') throw new Error('La solicitud ya está ' + s.estado.toLowerCase() + '.');
    const sh = s.sh;
    const quien = _normEmail(p.email);
    const motivo = String(p.motivo || '').trim().slice(0, 500);
    let eventoId = '';
    let escritos = 0, liberados = 0;

    if (decision === 'aprobar') {
      const anio = Number(s.desde.slice(0, 4));
      const grid = _leerAnio(ss, anio);
      if (!grid) throw new Error('No existe la pestaña ' + _nombreHoja(anio) + '.');
      const persona = _personaPorNombre(grid, s.persona);
      if (!persona) throw new Error(s.persona + ' ya no está en ' + _nombreHoja(anio) + '.');
      const fxg = _festivosPorGrupo(_leerFestivos(ss));
      const celda = function (iso) { return grid.sh.getRange(persona.fila, G.DIA1 + _idxDia(iso)); };
      const ref = s.ref ? sols.filter(function (x) { return x.id === s.ref; })[0] : null;

      if (s.clase === 'NUEVA') {
        const a = _analizarRango(persona, s.desde, s.hasta, fxg);
        if (a.ocupados.length && !p.forzar) {
          throw new Error('SOLAPAMIENTO: ' + s.persona + ' ya tiene días registrados: ' + a.ocupados.join(', ') + '. Revísalo en el Excel o aprueba forzando.');
        }
        a.laborables.forEach(function (iso) { celda(iso).setValue(s.tipo); escritos++; });
        eventoId = _crearEvento(s) || '';
        sh.getRange(s.fila, S.Días + 1).setValue(a.laborables.length);

      } else if (s.clase === 'CANCELACION') {
        const libres = _diasConCodigo(persona, s.desde, s.hasta, s.tipo);
        if (!libres.length) throw new Error('Esos días ya no tienen ' + s.tipo + ' en el Excel: no hay nada que cancelar.');
        libres.forEach(function (iso) { celda(iso).setValue(''); persona.codigos[_idxDia(iso)] = ''; liberados++; });
        sh.getRange(s.fila, S.Días + 1).setValue(libres.length);
        if (ref) _ajustarOriginal(ref, persona, 'ANULADA');

      } else {
        const libres = _diasConCodigo(persona, s.origDesde, s.origHasta, s.tipoOrig);
        const a = _analizarRango(persona, s.desde, s.hasta, fxg, libres);
        if (a.ocupados.length && !p.forzar) {
          throw new Error('SOLAPAMIENTO: los días nuevos chocan con ' + a.ocupados.join(', ') + '. Revísalo en el Excel o aprueba forzando.');
        }
        libres.forEach(function (iso) { celda(iso).setValue(''); persona.codigos[_idxDia(iso)] = ''; liberados++; });
        a.laborables.forEach(function (iso) { celda(iso).setValue(s.tipo); persona.codigos[_idxDia(iso)] = s.tipo; escritos++; });
        sh.getRange(s.fila, S.Días + 1).setValue(a.laborables.length);
        sh.getRange(s.fila, S['Días original'] + 1).setValue(libres.length);
        if (ref) _ajustarOriginal(ref, persona, 'MODIFICADA');
        eventoId = _crearEvento(s) || '';
      }
    }
    sh.getRange(s.fila, S.Estado + 1).setValue(decision === 'aprobar' ? 'APROBADA' : 'RECHAZADA');
    sh.getRange(s.fila, S['Resuelta por'] + 1).setValue(quien);
    sh.getRange(s.fila, S.Resuelta + 1).setValue(new Date().toISOString());
    sh.getRange(s.fila, S.Motivo + 1).setValue(motivo);
    sh.getRange(s.fila, S['Evento calendario'] + 1).setValue(eventoId);
    const aviso = _avisar(function () { _correoResolucion(s, decision, motivo, quien); });
    return { id: s.id, clase: s.clase, estado: decision === 'aprobar' ? 'APROBADA' : 'RECHAZADA', dias: escritos, liberados: liberados, evento: !!eventoId, aviso: aviso };
  } finally {
    lock.releaseLock();
  }
}

/* Tras cancelar o cambiar días de una solicitud aprobada (ref): su evento del
   calendario se rehace con lo que le quede y, si no le queda nada (o ha sido
   sustituida por un cambio), pasa a `estadoFinal`. */
function _ajustarOriginal(ref, persona, estadoFinal) {
  const sh = ref.sh;
  _borrarEvento(ref.evento);
  const quedan = estadoFinal === 'MODIFICADA' ? [] : _diasConCodigo(persona, ref.desde, ref.hasta, ref.tipo);
  let nuevoEvento = '';
  if (quedan.length) {
    nuevoEvento = _crearEvento({ id: ref.id, persona: ref.persona, tipo: ref.tipo, desde: quedan[0], hasta: quedan[quedan.length - 1] }) || '';
    sh.getRange(ref.fila, S.Días + 1).setValue(quedan.length);
    sh.getRange(ref.fila, S.Desde + 1).setValue(quedan[0]);
    sh.getRange(ref.fila, S.Hasta + 1).setValue(quedan[quedan.length - 1]);
  } else {
    sh.getRange(ref.fila, S.Estado + 1).setValue(estadoFinal);
  }
  sh.getRange(ref.fila, S['Evento calendario'] + 1).setValue(nuevoEvento);
}

function _crearEvento(s) {
  try {
    if (!V_CONFIG.CALENDARIO_ID) return null;
    const cal = CalendarApp.getCalendarById(V_CONFIG.CALENDARIO_ID);
    if (!cal) return null;
    const p1 = s.desde.split('-').map(Number), p2 = _sumar(s.hasta, 1).split('-').map(Number);
    const ini = new Date(p1[0], p1[1] - 1, p1[2]);
    const finExcl = new Date(p2[0], p2[1] - 1, p2[2]);
    const titulo = s.persona + ' — ' + ((CODIGOS[s.tipo] || {}).texto || s.tipo);
    const ev = cal.createAllDayEvent(titulo, ini, finExcl, { description: 'Solicitud ' + s.id + ' · generado por Vacaciones RDR.' });
    try { ev.setColor(s.tipo === 'VA' ? CalendarApp.EventColor.GREEN : s.tipo === 'FO' ? CalendarApp.EventColor.BLUE : CalendarApp.EventColor.MAUVE); } catch (_) {}
    return ev.getId();
  } catch (e) {
    console.error('Calendario: ' + e);
    return null;
  }
}

function _borrarEvento(id) {
  if (!id || !V_CONFIG.CALENDARIO_ID) return;
  try {
    const ev = CalendarApp.getCalendarById(V_CONFIG.CALENDARIO_ID).getEventById(id);
    if (ev) ev.deleteEvent();
  } catch (e) {
    console.error('Calendario (borrar): ' + e);
  }
}

// ── Festivos y grupos (coordinación) ────────────────────────────────────────
/** Recalcula los FE de una persona según su grupo (solo toca celdas vacías o FE). */
function _sincronizarFE(grid, persona, fxg) {
  const set = (persona.grupo && fxg[persona.grupo]) || {};
  const r = grid.sh.getRange(persona.fila, G.DIA1, 1, grid.nDias);
  const vals = r.getValues()[0];
  let cambios = 0;
  for (let i = 0; i < grid.nDias; i++) {
    const iso = _isoDeIdx(grid.anio, i);
    const c = String(vals[i] || '').trim().toUpperCase();
    if (set[iso] && !c) { vals[i] = 'FE'; cambios++; }
    else if (!set[iso] && c === 'FE') { vals[i] = ''; cambios++; }
  }
  if (cambios) r.setValues([vals]);
  return cambios;
}

function guardarFestivo(p) {
  const fecha = String(p.fecha || '');
  if (!_isoOk(fecha)) throw new Error('Fecha no válida.');
  const anio = Number(fecha.slice(0, 4));
  const grupos = [].concat(p.grupos || []).map(function (g) { return String(g).trim(); }).filter(Boolean);
  if (!grupos.length) throw new Error('Elige al menos un grupo.');
  const ss = _ss();
  const existentes = _leerGrupos(ss, anio).map(function (g) { return g.grupo; });
  grupos.forEach(function (g) { if (existentes.indexOf(g) < 0) throw new Error('No existe el grupo ' + g + ' en ' + _nombreFestivos(anio) + '.'); });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = _hojaFestivos(ss, anio);
    const ya = _leerFestivos(ss, anio);
    const nombre = String(p.nombre || 'Festivo').trim();
    const nuevos = [];
    grupos.forEach(function (g) {
      const f = ya.filter(function (x) { return x.fecha === fecha && x.grupo === g; })[0];
      if (f) sh.getRange(f.fila, F.NOMBRE).setValue(nombre);
      else nuevos.push([fecha, g, nombre]);
    });
    if (nuevos.length) {
      sh.getRange(_ultimaFila(sh, F.FECHA) + 1, F.FECHA, nuevos.length, 3).setNumberFormat('@').setValues(nuevos);
      _ordenarFestivos(sh);
    }
    // FE en la rejilla del año para quienes son de esos grupos.
    const grid = _leerAnio(ss, anio);
    const ocupados = [];
    if (grid) {
      const col = G.DIA1 + _idxDia(fecha);
      grid.personas.filter(function (x) { return grupos.indexOf(x.grupo) >= 0; }).forEach(function (x) {
        const c = x.codigos[_idxDia(fecha)];
        if (!c) grid.sh.getRange(x.fila, col).setValue('FE');
        else if (c !== 'FE') ocupados.push(x.nombre + ' (' + c + ')');
      });
    }
    return { fecha: fecha, grupos: grupos, ocupados: ocupados };
  } finally {
    lock.releaseLock();
  }
}

function borrarFestivo(p) {
  const ss = _ss();
  const fecha = String(p.fecha || ''), grupo = String(p.grupo || '').trim();
  if (!_isoOk(fecha)) throw new Error('Fecha no válida.');
  const anio = Number(fecha.slice(0, 4));
  const f = _leerFestivos(ss, anio).filter(function (x) { return x.fecha === fecha && x.grupo === grupo; })[0];
  if (!f) throw new Error('No existe ese festivo.');
  // Solo su tabla (D:F): la de grupos (A:B) comparte filas y no se toca.
  f.sh.getRange(f.fila, F.FECHA, 1, 3).deleteCells(SpreadsheetApp.Dimension.ROWS);
  const grid = _leerAnio(ss, anio);
  if (grid) {
    const col = G.DIA1 + _idxDia(fecha);
    grid.personas.filter(function (x) { return x.grupo === grupo && x.codigos[_idxDia(fecha)] === 'FE'; })
      .forEach(function (x) { grid.sh.getRange(x.fila, col).setValue(''); });
  }
  return { fecha: fecha, grupo: grupo };
}

/** Año de las operaciones de grupos: el que mande la web o el de hoy. */
function _anioParam(p) { return Number(p.anio) || Number(_hoyISO().slice(0, 4)); }

function guardarGrupo(p) {
  const ss = _ss();
  const anio = _anioParam(p);
  const grupo = String(p.grupo || '').trim();
  const pais = String(p.pais || 'ES').toUpperCase() === 'MX' ? 'MX' : 'ES';
  if (!grupo) throw new Error('Falta el nombre del grupo.');
  const sh = _hojaFestivos(ss, anio);
  const grupos = _leerGrupos(ss, anio);
  const anterior = String(p.anterior || '').trim();
  if (anterior && anterior !== grupo) {
    const g = grupos.filter(function (x) { return x.grupo === anterior; })[0];
    if (!g) throw new Error('No existe el grupo ' + anterior + '.');
    if (grupos.some(function (x) { return x.grupo === grupo; })) throw new Error('Ya existe un grupo ' + grupo + '.');
    sh.getRange(g.fila, F.GRUPO, 1, 2).setValues([[grupo, pais]]);
    // Renombrar en sus festivos y en la rejilla de ese año.
    _leerFestivos(ss, anio).filter(function (f) { return f.grupo === anterior; }).forEach(function (f) { sh.getRange(f.fila, F.FGRUPO).setValue(grupo); });
    const grid = _leerAnio(ss, anio);
    if (grid) grid.personas.filter(function (x) { return x.grupo === anterior; }).forEach(function (x) { grid.sh.getRange(x.fila, G.GRUPO).setValue(grupo); });
    return { grupo: grupo, pais: pais, renombrado: anterior };
  }
  const g = grupos.filter(function (x) { return x.grupo === grupo; })[0];
  if (g) sh.getRange(g.fila, F.PAIS).setValue(pais);
  else sh.getRange(_ultimaFila(sh, F.GRUPO) + 1, F.GRUPO, 1, 2).setValues([[grupo, pais]]);
  return { grupo: grupo, pais: pais };
}

function borrarGrupo(p) {
  const ss = _ss();
  const anio = _anioParam(p);
  const grupo = String(p.grupo || '').trim();
  const g = _leerGrupos(ss, anio).filter(function (x) { return x.grupo === grupo; })[0];
  if (!g) throw new Error('No existe el grupo ' + grupo + '.');
  const grid = _leerAnio(ss, anio);
  const usan = grid ? grid.personas.filter(function (x) { return x.grupo === grupo; }).map(function (x) { return x.nombre; }) : [];
  if (usan.length) throw new Error('No se puede borrar: lo tienen asignado ' + usan.join(', ') + '.');
  _leerFestivos(ss, anio).filter(function (f) { return f.grupo === grupo; }).map(function (f) { return f.fila; })
    .sort(function (a, b) { return b - a; }).forEach(function (fila) { g.sh.getRange(fila, F.FECHA, 1, 3).deleteCells(SpreadsheetApp.Dimension.ROWS); });
  g.sh.getRange(g.fila, F.GRUPO, 1, 2).deleteCells(SpreadsheetApp.Dimension.ROWS);
  return { grupo: grupo };
}

function asignarGrupo(p) {
  const ss = _ss();
  const anio = Number(p.anio);
  const grid = _leerAnio(ss, anio);
  if (!grid) throw new Error('No existe ' + _nombreHoja(anio) + '.');
  const persona = _personaPorNombre(grid, String(p.persona || ''));
  if (!persona) throw new Error('No existe ' + p.persona + ' en ' + _nombreHoja(anio) + '.');
  const grupo = String(p.grupo || '').trim();
  if (grupo && !_leerGrupos(ss, anio).some(function (g) { return g.grupo === grupo; })) throw new Error('No existe el grupo ' + grupo + ' en ' + _nombreFestivos(anio) + '.');
  grid.sh.getRange(persona.fila, G.GRUPO).setValue(grupo);
  persona.grupo = grupo;
  const cambios = _sincronizarFE(grid, persona, _festivosPorGrupo(_leerFestivos(ss, anio)));
  return { persona: persona.nombre, grupo: grupo, celdasFE: cambios };
}

/** Crea Vacas_<anio> a partir del año anterior: personas activas, grupo,
 *  días del año, y como "Días año anterior" lo que les quedaba. */
function crearAnio(p) {
  const ss = _ss();
  const anio = Number(p.anio);
  if (!(anio >= 2000 && anio < 2100)) throw new Error('Año no válido.');
  if (ss.getSheetByName(_nombreHoja(anio))) throw new Error('Ya existe ' + _nombreHoja(anio) + '.');
  const prev = _leerAnio(ss, anio - 1);
  if (!prev) throw new Error('No existe ' + _nombreHoja(anio - 1) + ' para copiar las personas.');
  const filas = prev.personas.filter(function (x) { return x.activo; }).map(function (x) {
    return { nombre: x.nombre, email: x.email, grupo: x.grupo, activo: true, anteriores: Math.max(0, x.quedan), dias: x.dias, codigos: {} };
  });
  // Festivos_<anio> con los mismos grupos (los festivos del año nuevo se
  // añaden desde la web o en la pestaña; si ya hay alguno, se marcan FE).
  const shF = _hojaFestivos(ss, anio);
  const ya = _leerGrupos(ss, anio).map(function (g) { return g.grupo; });
  const copiar = _leerGrupos(ss, anio - 1).filter(function (g) { return ya.indexOf(g.grupo) < 0; }).map(function (g) { return [g.grupo, g.pais]; });
  if (copiar.length) shF.getRange(_ultimaFila(shF, F.GRUPO) + 1, F.GRUPO, copiar.length, 2).setValues(copiar);
  const fxg = _festivosPorGrupo(_leerFestivos(ss, anio));
  filas.forEach(function (f) {
    Object.keys(fxg[f.grupo] || {}).forEach(function (iso) { f.codigos[iso] = 'FE'; });
  });
  _crearRejilla(ss, anio, filas);
  _hojaSolicitudes(ss, anio);
  return { anio: anio, personas: filas.length, grupos: copiar.length };
}

/** Escribe una rejilla nueva. filas: [{nombre, email, grupo, activo, anteriores, dias, codigos:{iso: código}}] */
function _crearRejilla(ss, anio, filas) {
  const nDias = _diasAnio(anio);
  const sh = ss.insertSheet(_nombreHoja(anio));
  const nCols = G.DIA1 - 1 + nDias;
  if (sh.getMaxColumns() < nCols) sh.insertColumnsAfter(sh.getMaxColumns(), nCols - sh.getMaxColumns());
  const nFilas = Math.max(filas.length, 1);
  if (sh.getMaxRows() < G.FILA_1 + nFilas + 20) sh.insertRowsAfter(sh.getMaxRows(), G.FILA_1 + nFilas + 20 - sh.getMaxRows());

  // Cabeceras: mes (fila 1), día (fila 2), letra de la semana (fila 3).
  const fMes = [], fDia = [], fSem = [];
  for (let i = 0; i < nDias; i++) {
    const iso = _isoDeIdx(anio, i);
    const d = Number(iso.slice(8, 10));
    fMes.push(d === 1 ? MESES_ES[Number(iso.slice(5, 7)) - 1] : '');
    fDia.push(d);
    fSem.push(LETRA_DIA[_dow(iso)]);
  }
  sh.getRange(G.FILA_MES, 1, 1, nCols).setValues([['VACACIONES ' + anio, '', '', '', '', '', '', '', ''].concat(fMes)]);
  sh.getRange(G.FILA_DIA, 1, 1, nCols).setValues([CABECERA_GRID.concat(fDia)]);
  sh.getRange(G.FILA_SEM, 1, 1, nCols).setValues([['', '', '', '', '', '', '', '', ''].concat(fSem)]);

  // Personas: datos y códigos (las fórmulas G:I las pone _formatearRejilla).
  if (filas.length) {
    const valores = filas.map(function (f) {
      const izq = [f.nombre, f.email || '', f.grupo || '', f.activo !== false, Number(f.anteriores) || 0, Number(f.dias) || 0, '', '', ''];
      const dias = [];
      for (let i = 0; i < nDias; i++) dias.push(f.codigos[_isoDeIdx(anio, i)] || '');
      return izq.concat(dias);
    });
    sh.getRange(G.FILA_1, 1, filas.length, nCols).setValues(valores);
  }
  _formatearRejilla(ss, sh, anio);
  return sh;
}

/* Fórmulas y formato de Vacas_<año>. No toca los datos: se puede volver a
   ejecutar sobre una pestaña existente (aplicarFormatoVacas). */
function _formatearRejilla(ss, sh, anio) {
  const nDias = _diasAnio(anio);
  const nCols = G.DIA1 - 1 + nDias;
  const ELECTRIC = '#001391', LINEA = '#CAD1D8';
  const ultimaPersona = Math.max(sh.getLastRow(), G.FILA_1);
  const nPersonas = ultimaPersona - G.FILA_1 + 1;
  const filasFmt = nPersonas + 15;                       // margen para añadir gente
  if (sh.getMaxRows() < G.FILA_1 + filasFmt) sh.insertRowsAfter(sh.getMaxRows(), G.FILA_1 + filasFmt - sh.getMaxRows());
  const ultCol = _colLetra(nCols), dia1 = _colLetra(G.DIA1);

  // Fórmulas con setFormulas (sintaxis inglesa, la que espera la API en
  // cualquier idioma) y SIN separadores de argumentos: con setValues el Excel
  // en español esperaba ";" y daba #ERROR!.
  const nombres = sh.getRange(G.FILA_1, G.PERSONA, filasFmt, 1).getValues();
  const formulas = [];
  for (let k = 0; k < filasFmt; k++) {
    const f = G.FILA_1 + k;
    const hayPersona = String(nombres[k][0] || '').trim();
    formulas.push(hayPersona
      ? ['=E' + f + '+F' + f, '=SUMPRODUCT(--(' + dia1 + f + ':' + ultCol + f + '="VA"))', '=G' + f + '-H' + f]
      : ['', '', '']);
  }
  sh.getRange(G.FILA_1, G.TOTAL, filasFmt, 3).setFormulas(formulas);

  // Sin cuadrícula; todo el texto en Electric Blue.
  sh.setHiddenGridlines(true);
  const todo = sh.getRange(1, 1, G.FILA_1 + filasFmt - 1, nCols);
  todo.setFontColor(ELECTRIC).setFontFamily('Lato').setVerticalAlignment('middle');
  sh.getRange(1, 1, 3, nCols).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(G.FILA_MES, 1).setHorizontalAlignment('left').setFontSize(13).setFontFamily('Source Serif 4');

  // Cabecera de columnas fijas: Electric con texto claro.
  sh.getRange(G.FILA_DIA, 1, 2, G.DIA1 - 1).setBackground(ELECTRIC).setFontColor('#F7F8F8').setWrap(true);
  try { sh.getRange(G.FILA_DIA, 1, 2, G.DIA1 - 1).mergeVertically(); } catch (_) {}

  // Meses: celdas combinadas sobre sus días, alternando tono, y agrupados
  // (botón −/+ encima) para poder plegar meses sin romper nada.
  sh.getRange(G.FILA_MES, G.DIA1, 1, nDias).breakApart();
  let ini = 0;
  for (let m = 0; m < 12; m++) {
    const n = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
    const rMes = sh.getRange(G.FILA_MES, G.DIA1 + ini, 1, n);
    rMes.merge().setValue(MESES_ES[m]).setBackground(m % 2 ? '#D6EDFF' : '#85C8FF').setFontColor(ELECTRIC);
    sh.getRange(G.FILA_DIA, G.DIA1 + ini, 2, n).setBackground(m % 2 ? '#F2F9FF' : '#E6F3FF');
    sh.getRange(G.FILA_MES, G.DIA1 + ini, G.FILA_1 + filasFmt - 1, 1)
      .setBorder(null, true, null, null, null, null, ELECTRIC, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    try {
      if (!sh.getColumnGroup(G.DIA1 + ini, 1)) sh.getRange(1, G.DIA1 + ini, 1, n).shiftColumnGroupDepth(1);
    } catch (e) {
      try { sh.getRange(1, G.DIA1 + ini, 1, n).shiftColumnGroupDepth(1); } catch (_) {}
    }
    ini += n;
  }
  try { sh.setColumnGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE); } catch (_) {}

  // Zona de días: centrado, fines de semana en gris.
  const zona = sh.getRange(G.FILA_1, G.DIA1, filasFmt, nDias);
  zona.setHorizontalAlignment('center').setFontSize(9);
  const fondos = [], fondoCab = [];
  for (let i = 0; i < nDias; i++) fondoCab.push(_finde(_isoDeIdx(anio, i)) ? '#CAD1D8' : null);
  for (let r = 0; r < filasFmt; r++) fondos.push(fondoCab.map(function (c) { return c ? '#E2E6EA' : null; }));
  zona.setBackgrounds(fondos);
  const cabDias = sh.getRange(G.FILA_DIA, G.DIA1, 2, nDias);
  const fondosCab = cabDias.getBackgrounds().map(function (fila) { return fila.map(function (c, i) { return fondoCab[i] || c; }); });
  cabDias.setBackgrounds(fondosCab);

  // Columnas fijas: totales resaltados, datos centrados.
  sh.getRange(G.FILA_1, G.ACTIVO, filasFmt, G.DIA1 - G.ACTIVO).setHorizontalAlignment('center');
  sh.getRange(G.FILA_1, G.TOTAL, filasFmt, 3).setBackground('#F7F8F8').setFontWeight('bold');
  if (nPersonas > 0) sh.getRange(G.FILA_1, G.ACTIVO, nPersonas, 1).insertCheckboxes();

  // Una línea horizontal por persona para seguir la fila.
  sh.getRange(G.FILA_1, 1, filasFmt, nCols)
    .setBorder(null, null, true, null, null, true, LINEA, SpreadsheetApp.BorderStyle.SOLID);
  // Separador entre columnas fijas y días.
  sh.getRange(G.FILA_DIA, G.DIA1 - 1, filasFmt + 2, 1)
    .setBorder(null, null, null, true, null, null, ELECTRIC, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // Colores por código (texto Electric sobre acento).
  const zonaCodigos = sh.getRange(G.FILA_1, G.DIA1, filasFmt, nDias);
  sh.setConditionalFormatRules(Object.keys(CODIGOS).map(function (c) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(c)
      .setBackground(CODIGOS[c].color).setFontColor(ELECTRIC).setBold(true).setRanges([zonaCodigos]).build();
  }));

  // Grupo de festivos: desplegable con la tabla de grupos de Festivos_<año>.
  const shG = _hojaFestivos(ss, anio);
  sh.getRange(G.FILA_1, G.GRUPO, filasFmt, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(shG.getRange('A2:A200'), true).setAllowInvalid(true).build());

  sh.setColumnWidth(G.PERSONA, 230);
  sh.setColumnWidth(G.EMAIL, 200);
  sh.setColumnWidth(G.GRUPO, 110);
  sh.setColumnWidths(G.ACTIVO, G.DIA1 - G.ACTIVO, 68);
  sh.setColumnWidths(G.DIA1, nDias, 26);
  sh.setRowHeight(G.FILA_MES, 26);
  sh.setFrozenRows(3);
  sh.setFrozenColumns(1);
  sh.getRange(G.FILA_MES, 1).setNote(
    'Códigos: ' + Object.keys(CODIGOS).map(function (c) { return c + ' ' + CODIGOS[c].texto; }).join(' · ') +
    '\nSolo VA descuenta del saldo. Puedes ocultar o plegar meses (−/+ de arriba), pero no insertes ni borres columnas de días (J = 1 de enero).');
}

// ── Menú del Excel: botones para ver/ocultar meses ─────────────────────────
/* Al abrir el Excel aparece el menú "🌴 Vacaciones". Las funciones de ver/
   ocultar también se pueden asignar a un dibujo (Insertar → Dibujo → ⋮ →
   Asignar secuencia de comandos: verMesActual, ocultarMesesPasados,
   mostrarTodosLosMeses) para tener botones en la propia hoja. */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const meses = ui.createMenu('Plegar / desplegar un mes');
  MESES_ES.forEach(function (m, i) { meses.addItem(m, 'alternarMes' + (i + 1)); });
  ui.createMenu('🌴 Vacaciones')
    .addItem('📅 Ver solo el mes actual', 'verMesActual')
    .addItem('⏪ Ocultar meses pasados', 'ocultarMesesPasados')
    .addItem('👁️ Mostrar todos los meses', 'mostrarTodosLosMeses')
    .addSubMenu(meses)
    .addSeparator()
    .addItem('🎨 Rehacer formato y fórmulas', 'aplicarFormatoVacas')
    .addItem('🧹 Migrar 2026 desde cero…', 'menuEmpezarDeCero')
    .addToUi();
}

/** Hoja Vacas_ activa o, si no es una, la del año en curso. */
function _hojaVacasMenu() {
  const ss = SpreadsheetApp.getActiveSpreadsheet() || _ss();
  let sh = ss.getActiveSheet();
  let m = sh && /^Vacas_(\d{4})$/.exec(sh.getName());
  if (!m) {
    const anio = Number(_hoyISO().slice(0, 4));
    sh = ss.getSheetByName(_nombreHoja(anio)) || ss.getSheetByName(_nombreHoja(_anios(ss).pop()));
    if (!sh) throw new Error('No hay ninguna pestaña Vacas_<año>.');
    ss.setActiveSheet(sh);
    m = /^Vacas_(\d{4})$/.exec(sh.getName());
  }
  return { sh: sh, anio: Number(m[1]) };
}

function _colsMes(anio, m) {
  const ini = Math.round((Date.UTC(anio, m, 1) - Date.UTC(anio, 0, 1)) / 86400000);
  return { col: G.DIA1 + ini, n: new Date(Date.UTC(anio, m + 1, 0)).getUTCDate() };
}
function _grupoMes(sh, col) { try { return sh.getColumnGroup(col, 1); } catch (_) { return null; } }

/** Pliega (visible=false) o despliega un mes: con su grupo −/+ si lo tiene. */
function _ponerMes(sh, anio, m, visible) {
  const r = _colsMes(anio, m);
  const g = _grupoMes(sh, r.col);
  if (g) { if (visible) g.expand(); else g.collapse(); }
  if (visible) sh.showColumns(r.col, r.n); else if (!g) sh.hideColumns(r.col, r.n);
}
function _mesVisible(sh, anio, m) {
  const r = _colsMes(anio, m);
  const g = _grupoMes(sh, r.col);
  return g ? !g.isCollapsed() : !sh.isColumnHiddenByUser(r.col);
}

function verMesActual() {
  const h = _hojaVacasMenu();
  const hoy = _hoyISO();
  const actual = Number(hoy.slice(0, 4)) === h.anio ? Number(hoy.slice(5, 7)) - 1 : -1;
  for (let m = 0; m < 12; m++) _ponerMes(h.sh, h.anio, m, actual < 0 || m === actual);
  if (actual >= 0) h.sh.getRange(G.FILA_1, _colsMes(h.anio, actual).col).activate();
}
function ocultarMesesPasados() {
  const h = _hojaVacasMenu();
  const hoy = _hoyISO();
  const actual = Number(hoy.slice(0, 4)) === h.anio ? Number(hoy.slice(5, 7)) - 1 : (Number(hoy.slice(0, 4)) > h.anio ? 12 : 0);
  for (let m = 0; m < 12; m++) _ponerMes(h.sh, h.anio, m, m >= actual);
}
function mostrarTodosLosMeses() {
  const h = _hojaVacasMenu();
  try { h.sh.expandAllColumnGroups(); } catch (_) {}
  h.sh.showColumns(G.DIA1, _diasAnio(h.anio));
}
function _alternarMes(m) { const h = _hojaVacasMenu(); _ponerMes(h.sh, h.anio, m, !_mesVisible(h.sh, h.anio, m)); }
function alternarMes1() { _alternarMes(0); }
function alternarMes2() { _alternarMes(1); }
function alternarMes3() { _alternarMes(2); }
function alternarMes4() { _alternarMes(3); }
function alternarMes5() { _alternarMes(4); }
function alternarMes6() { _alternarMes(5); }
function alternarMes7() { _alternarMes(6); }
function alternarMes8() { _alternarMes(7); }
function alternarMes9() { _alternarMes(8); }
function alternarMes10() { _alternarMes(9); }
function alternarMes11() { _alternarMes(10); }
function alternarMes12() { _alternarMes(11); }

function menuEmpezarDeCero() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Migrar 2026 desde cero',
    'Se borran y se rehacen Vacas_2026, Festivos_2026 y el informe Migracion_2026 a partir de «Vacaciones 2026». ' +
    'Si Solicitudes_2026 tiene filas se guarda como copia. ¿Seguir?', ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  const r = empezarDeCero();
  const sh = _ss().getSheetByName(_nombreHoja(MIG.ANIO));
  if (sh) SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sh);
  ui.alert('Migración hecha', r.personas + ' personas · ' + r.diferencias + ' diferencias con 2026_Calendario. Revisa la pestaña Migracion_2026.', ui.ButtonSet.OK);
}

/* EJECUTAR DESDE EL EDITOR si hace falta: vuelve a poner fórmulas y formato a
   las pestañas Vacas_<año> existentes (sin tocar personas ni días). */
function aplicarFormatoVacas() {
  const ss = _ss();
  _anios(ss).forEach(function (a) {
    _formatearRejilla(ss, ss.getSheetByName(_nombreHoja(a)), a);
    Logger.log('Formato y fórmulas aplicados a ' + _nombreHoja(a));
  });
}

// ── Correos (MailApp: los emojis del asunto llegan bien) ────────────────────
function _avisar(fn) {
  try { fn(); return null; } catch (e) { console.error(e); return String(e.message || e); }
}

function _marco(titulo, cuerpo, botonUrl, botonTexto, color) {
  return '<div style="font-family:Lato,Arial,sans-serif;max-width:540px;margin:0 auto;color:#070E46;">'
    + '<div style="background:#001391;color:#F7F8F8;border-radius:14px 14px 0 0;padding:20px 24px;">'
    +   '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#85C8FF;">Vacaciones RDR · BBVA × NFQ</div>'
    +   '<div style="font-family:Georgia,\'Source Serif 4\',serif;font-size:22px;font-weight:bold;margin-top:4px;">' + titulo + '</div></div>'
    + '<div style="border:1px solid #E2E6EA;border-top:0;border-radius:0 0 14px 14px;padding:22px 24px;background:#FFFFFF;">'
    +   cuerpo
    +   (botonUrl ? '<a href="' + botonUrl + '" style="display:inline-block;background:' + (color || '#85C8FF') + ';color:#001391;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:999px;font-size:15px;margin-top:6px;">' + botonTexto + '</a>' : '')
    + '</div></div>';
}

function _filaDato(k, v) { return '<tr><td style="padding:4px 12px 4px 0;color:#46536D;">' + k + '</td><td style="padding:4px 0;font-weight:bold;">' + v + '</td></tr>'; }

function _rangoEs(desde, hasta) { return _fechaEs(desde) + (hasta !== desde ? ' – ' + _fechaEs(hasta) : ''); }
function _textoTipo(t) { return ((CODIGOS[t] || {}).texto || t).toLowerCase(); }

/** Encabezado y frase de cada clase de solicitud (para los correos). */
function _resumenClase(s) {
  if (s.clase === 'CANCELACION') return {
    emoji: '🗑️', nombre: 'cancelación', a: 'a', titulo: 'Cancelación de ' + _textoTipo(s.tipo),
    frase: 'cancelar ' + s.dias + ' días de ' + _textoTipo(s.tipo) + ' (' + _rangoEs(s.desde, s.hasta) + ')'
  };
  if (s.clase === 'MODIFICACION') return {
    emoji: '🔁', nombre: 'cambio', a: 'o', titulo: 'Cambio de ' + _textoTipo(s.tipoOrig),
    frase: 'cambiar ' + _textoTipo(s.tipoOrig) + ' del ' + _rangoEs(s.origDesde, s.origHasta) + ' por ' + _textoTipo(s.tipo) + ' del ' + _rangoEs(s.desde, s.hasta)
  };
  return {
    emoji: '🌴', nombre: 'solicitud', a: 'a', titulo: 'Nueva solicitud de ' + _textoTipo(s.tipo),
    frase: _textoTipo(s.tipo) + ' del ' + _rangoEs(s.desde, s.hasta)
  };
}

function _correoNuevaSolicitud(s, saldoTras) {
  const coords = _coordinadores();
  if (!coords.length) throw new Error('No hay coordinadores en equipo.json.');
  const c = _resumenClase(s);
  const url = V_CONFIG.GESTION_URL + '?id=' + encodeURIComponent(s.id);
  const asunto = c.emoji + ' ' + c.titulo + ' · ' + s.persona + ' (' + _rangoEs(s.desde, s.hasta) + ')';
  let filas;
  if (s.clase === 'CANCELACION') {
    filas = _filaDato('Cancelar', CODIGOS[s.tipo].texto) + _filaDato('Días', _rangoEs(s.desde, s.hasta)) + _filaDato('Días laborables que se liberan', s.dias);
  } else if (s.clase === 'MODIFICACION') {
    filas = _filaDato('Antes', CODIGOS[s.tipoOrig].texto + ' · ' + _rangoEs(s.origDesde, s.origHasta) + ' (' + s.diasOrig + ' días)')
      + _filaDato('Ahora', CODIGOS[s.tipo].texto + ' · ' + _rangoEs(s.desde, s.hasta) + ' (' + s.dias + ' días)');
  } else {
    filas = _filaDato('Tipo', CODIGOS[s.tipo].texto) + _filaDato('Desde', _fechaEs(s.desde)) + _filaDato('Hasta', _fechaEs(s.hasta)) + _filaDato('Días laborables', s.dias);
  }
  const cuerpo = '<p style="margin:0 0 14px;font-size:15px;">👋 <strong>' + _esc(s.persona) + '</strong> pide ' + (s.clase === 'NUEVA' ? 'días:' : 'un ' + c.nombre + ':') + '</p>'
    + '<table style="font-size:14px;margin:0 0 16px;">' + filas
    + (saldoTras !== null ? _filaDato('Le quedarían', saldoTras + (saldoTras < 0 ? ' ⚠️ supera su saldo' : '')) : '')
    + (s.comentario ? _filaDato('Comentario', _esc(s.comentario)) : '')
    + '</table>';
  const html = _marco(c.emoji + ' ' + c.titulo, cuerpo, url, '✅ Revisar y aprobar →', '#88E783');
  const texto = s.persona + ' pide ' + c.frase + '.\nRevisar: ' + url;
  MailApp.sendEmail(coords.join(','), asunto, texto, { htmlBody: html, name: V_CONFIG.REMITE, replyTo: s.email });
}

function _correoResolucion(s, decision, motivo, quien) {
  if (!s.email) return;
  const c = _resumenClase(s);
  const ok = decision === 'aprobar';
  const asunto = (ok ? '✅ ' : '❌ ') + 'Tu ' + c.nombre + ' está ' + (ok ? 'aprobad' : 'rechazad') + c.a + ' (' + _rangoEs(s.desde, s.hasta) + ')';
  const final = ok
    ? (s.clase === 'CANCELACION' ? 'Esos días vuelven a estar libres en el calendario. 👍' : s.clase === 'MODIFICACION' ? 'El calendario ya tiene los días nuevos. 🌴' : '¡A disfrutar! 🌴')
    : '';
  const cuerpo = '<p style="margin:0 0 14px;font-size:15px;">👋 Hola <strong>' + _esc(s.persona.split(' ')[0]) + '</strong>,</p>'
    + '<p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Tu petición de <strong>' + _esc(c.frase) + '</strong> '
    + (ok ? 'está <strong style="color:#1B7A3E;">aprobada</strong>. ' + final : 'está <strong style="color:#C53030;">rechazada</strong>.') + '</p>'
    + (motivo ? '<p style="margin:0 0 16px;font-size:14px;">💬 ' + _esc(motivo) + '</p>' : '');
  const html = _marco((ok ? '✅ ' : '❌ ') + c.titulo + (ok ? ' aprobad' : ' rechazad') + c.a, cuerpo, V_CONFIG.WEB_URL, '📅 Ver el calendario →', ok ? '#88E783' : '#85C8FF');
  const texto = 'Tu petición de ' + c.frase + ' está ' + (ok ? 'APROBADA' : 'RECHAZADA') + '.' + (motivo ? '\n' + motivo : '') + '\n' + V_CONFIG.WEB_URL;
  const opts = { htmlBody: html, name: V_CONFIG.REMITE };
  const coords = _coordinadores();
  if (coords.length) opts.replyTo = coords.join(',');
  MailApp.sendEmail(s.email, asunto, texto, opts);
}

// ── Diagnóstico (ejecutar desde el editor) ──────────────────────────────────
function diagnosticar() {
  const ss = _ss();
  Logger.log('Excel: ' + ss.getName() + ' · pestañas de año: ' + _anios(ss).join(', '));
  _anios(ss).forEach(function (a) {
    const g = _leerAnio(ss, a);
    const sinEmail = g.personas.filter(function (p) { return !p.email; }).map(function (p) { return p.nombre; });
    const sinGrupo = g.personas.filter(function (p) { return !p.grupo; }).map(function (p) { return p.nombre; });
    Logger.log(_nombreHoja(a) + ': ' + g.personas.length + ' personas · sin email: ' + (sinEmail.join(', ') || '—') + ' · sin grupo: ' + (sinGrupo.join(', ') || '—'));
  });
  _aniosDe(ss, PREFIJO_FESTIVOS).forEach(function (a) {
    Logger.log(_nombreFestivos(a) + ': grupos ' + _leerGrupos(ss, a).map(function (g) { return g.grupo + ' (' + g.pais + ')'; }).join(', ') + ' · ' + _leerFestivos(ss, a).length + ' festivos');
  });
  Logger.log('Solicitudes pendientes: ' + _leerSolicitudes(ss).filter(function (s) { return s.estado === 'PENDIENTE'; }).length);
  Logger.log('Coordinadores (equipo.json): ' + _coordinadores().join(', '));
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
}
