/* ===========================================================================
   Hub.gs · Proyecto ÚNICO de Apps Script del Reference Data & Surveillance Hub

   Todos los backends de la web viven en este proyecto y comparten UNA
   implementación (una sola URL /exec). Cada página llama a esa URL con
   ?app=<nombre> y aquí se reparte al backend que toca:

     ?app=comidas · control · equipo · formaciones · guardias · ofertas ·
          pases · preferencias · retro · seguimiento · timereport · vacaciones

   En links.json basta con poner la URL /exec en "hubBackend": cada clave de
   backend lleva su "app" y la web compone la URL sola.

   Ficheros: TODOS los .gs de apps-script/ (cada carpeta es una app; _comun/
   es lo compartido). En Apps Script los ficheros comparten el ámbito global:
   comprobar.mjs vigila que no se repita ningún nombre.

   Puesta en marcha (proyecto nuevo, desde el editor):
     1. autorizar()            pide todos los permisos y prueba cada hoja.
     2. instalarDisparadores() crea los disparadores de todas las apps.
     3. diagnosticarHub()      resumen: hojas, propiedades y disparadores.
   =========================================================================== */

const HUB_APPS = ['comidas', 'control', 'equipo', 'formaciones', 'guardias', 'ofertas', 'pases', 'preferencias', 'retro', 'seguimiento', 'timereport', 'vacaciones'];

/* Hojas de cálculo de cada app. Antes comidas, control y pases eran scripts
   ligados a su hoja (getActiveSpreadsheet); en un proyecto independiente hay
   que abrirlas por id. Para cambiar una sin tocar el código: propiedad del
   script <CLAVE>_SPREADSHEET_ID (p. ej. PASES_SPREADSHEET_ID). Vacaciones
   lleva la suya en V_CONFIG.EXCEL_ID. */
const HUB_HOJAS = {
  COMIDAS: '1Wk12cky78qu7aUcHkRlQuDy3OjvRQ8fZXeNcPrgHDP8',    // Comidas_RDR
  CONTROL: '1pk-2g_vVM6mCXGe3ZzljwM465R9O14GVEDUNSpBX40I',    // Control - RDR BBVA
  FORMACIONES: '1-J6IETYor07e4f3NTYBBbvC9nGmzJfmVVGIOyq1KjoA', // Certificados_Formaciones
  PASES: '1PWqHHorE8u_Xdyn9TeMWwf03CFv3FlPPuLeKAEpYr5Y',      // Pases_Calendados_NFQ
  RETRO: '1aJY_RenwDw-vioRlZN2HXLYE2n0Tx4vVpw5PZ7H6qbU',      // Retrospectiva RDR
  GUARDIAS: '1Nn6Jm7CkvDFhSLBMyXZPBGITyH8P9oLBiKMZrGDtoLs',   // RDR Guardias (datos)
  TIMEREPORT: '1k4xF0KSCFbeMZgtIcQAzFIOL0JM5o3bpYaGM_rPRoc4'  // RDR TimeReport Web (datos)
};

const _HUB_SS = {}; // una apertura por hoja y ejecución

/* Responsable del hub: recibe las pruebas (p. ej. enviarRecordatorioPrueba de
   comidas) y las respuestas a los recordatorios de comidas. En un traspaso,
   basta con la propiedad del script HUB_RESPONSABLE (sin tocar el código). */
const HUB_RESPONSABLE = 'pablo.llorente@nfq.es';
function _hubResponsable() {
  let v = '';
  try { v = PropertiesService.getScriptProperties().getProperty('HUB_RESPONSABLE') || ''; } catch (e) {}
  return String(v || HUB_RESPONSABLE).trim();
}

function _hubIdHoja(clave) {
  let id = '';
  try { id = PropertiesService.getScriptProperties().getProperty(clave + '_SPREADSHEET_ID') || ''; } catch (e) {}
  id = id || HUB_HOJAS[clave];
  if (!id) throw new Error('Falta el id de la hoja de ' + clave + ' (HUB_HOJAS o propiedad ' + clave + '_SPREADSHEET_ID).');
  return id;
}

/** Hoja de cálculo de una app (COMIDAS, CONTROL, PASES, GUARDIAS, TIMEREPORT). */
function _hubHoja(clave) {
  if (!_HUB_SS[clave]) _HUB_SS[clave] = SpreadsheetApp.openById(_hubIdHoja(clave));
  return _HUB_SS[clave];
}

// ── Web: reparto por ?app= ───────────────────────────────────────────────────
function doGet(e) { return _hubRepartir(e, true); }
function doPost(e) { return _hubRepartir(e, false); }

function _hubRepartir(e, get) {
  const app = String((e && e.parameter && e.parameter.app) || '').trim().toLowerCase();
  switch (app) {
    case 'comidas': return get ? doGetComidas(e) : doPostComidas(e);
    case 'control': return get ? doGetControl(e) : doPostControl(e);
    case 'equipo': return get ? doGetEquipo(e) : doPostEquipo(e);
    case 'formaciones': return get ? doGetFormaciones(e) : doPostFormaciones(e);
    case 'guardias': return get ? doGetGuardias(e) : doPostGuardias(e);
    case 'ofertas': return get ? doGetOfertas(e) : doPostOfertas(e);
    case 'pases': return get ? doGetPases(e) : doPostPases(e);
    case 'preferencias': return get ? doGetPreferencias(e) : doPostPreferencias(e);
    case 'retro': return get ? doGetRetro(e) : doPostRetro(e);
    case 'seguimiento': return get ? doGetSeguimiento(e) : doPostSeguimiento(e);
    case 'timereport': return get ? doGetTR(e) : doPostTR(e);
    case 'vacaciones': return get ? doGetVacaciones(e) : doPostVacaciones(e);
  }
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    error: app ? 'App desconocida: ' + app : 'Falta ?app=<nombre> en la URL',
    apps: HUB_APPS
  })).setMimeType(ContentService.MimeType.JSON);
}

// ── Puesta en marcha (ejecutar desde el editor) ──────────────────────────────

/* EJECUTAR tras pegar código nuevo: pide todos los permisos (hojas, Drive,
   correo, calendario, disparadores…) y comprueba que cada app arranca. */
function autorizar() {
  MailApp.getRemainingDailyQuota();
  GmailApp.getAliases();
  DriveApp.getRootFolder();
  CalendarApp.getDefaultCalendar();
  UrlFetchApp.fetch('https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/links/links.json', { muteHttpExceptions: true });
  ScriptApp.getProjectTriggers();
  Object.keys(HUB_HOJAS).forEach(function (k) {
    try { Logger.log('Hoja ' + k + ': ' + _hubHoja(k).getName()); }
    catch (e) { Logger.log('⚠ Hoja ' + k + ': ' + e); }
  });
  _hubEjecutar([['guardias', 'autorizarGuardias', 'Codigo_Guardias'], ['ofertas', 'autorizarOfertas', 'Codigo_Ofertas'],
    ['seguimiento', 'autorizarSeguimiento', 'Codigo_Seguimiento'], ['timereport', 'autorizarTR', 'Codigo_TimeReport'],
    ['vacaciones', 'autorizarVacaciones', 'Codigo_Vacaciones']]);
  Logger.log('Permisos concedidos. Siguiente paso: instalarDisparadores().');
}

/* EJECUTAR UNA VEZ (se puede repetir: no duplica nada). Disparadores de
   todas las apps: recordatorios de comidas y del Time Report, avisos de
   pases, certificados de formaciones y caché de vacaciones. */
function instalarDisparadores() {
  _hubEjecutar([['comidas · recordatorios', 'crearTriggers', 'Comidas_Recordatorios'],
    ['timereport · recordatorio de evidencias', 'crearTriggerRecordatorioTR', 'Codigo_TimeReport'],
    ['pases · avisos programados', 'instalarTriggerAvisos', 'Avisos_Pases'],
    ['formaciones · sincronizar certificados (cada 5 min)', 'instalarSincronizacionFormaciones', 'Codigo_Formaciones'],
    ['vacaciones · cambios en el Excel', 'instalarDisparadoresVacaciones', 'Codigo_Vacaciones'],
    ['vacaciones · caché precalentada', 'instalarPrecalentado', 'Codigo_Vacaciones']]);
  _hubListarDisparadores();
}

/* Ejecuta [etiqueta, nombre de función, fichero] uno a uno. Las funciones se
   buscan por nombre: si falta una (fichero sin pegar o de una versión
   anterior) se avisa y se sigue con las demás, en vez de pararlo todo. */
function _hubEjecutar(lista) {
  const g = globalThis;
  lista.forEach(function (d) {
    if (typeof g[d[1]] !== 'function') {
      Logger.log('⚠ ' + d[0] + ': falta la función ' + d[1] + '. Pega la última versión de ' + d[2] + '.gs (apps-script/ del repositorio).');
      return;
    }
    try { g[d[1]](); Logger.log('✓ ' + d[0]); } catch (e) { Logger.log('⚠ ' + d[0] + ': ' + e); }
  });
}

/** Qué hay configurado: hojas, propiedades (solo nombres) y disparadores. */
function diagnosticarHub() {
  Object.keys(HUB_HOJAS).forEach(function (k) {
    try { Logger.log('Hoja ' + k + ': ' + _hubHoja(k).getName() + ' (' + _hubIdHoja(k) + ')'); }
    catch (e) { Logger.log('⚠ Hoja ' + k + ': ' + e); }
  });
  const props = PropertiesService.getScriptProperties().getKeys();
  Logger.log('Propiedades del script: ' + (props.sort().join(', ') || 'ninguna'));
  ['GITHUB_TOKEN', 'CLAVE_EQUIPO'].forEach(function (k) {
    if (props.indexOf(k) < 0) Logger.log('⚠ Falta la propiedad ' + k + ' (Gestión de equipo no podrá guardar).');
  });
  if (props.indexOf('vac:campanas') < 0) Logger.log('ℹ Sin vac:campanas: vacaciones usará los formularios por defecto (Navidad 2026).');
  if (props.indexOf('FIRMANTES_LATAM') < 0) Logger.log('ℹ Sin FIRMANTES_LATAM: ofertas solo tendrá los firmantes del código.');
  Logger.log('Responsable del hub (pruebas y respuestas): ' + _hubResponsable() + ' · ejecuta el script: ' + (Session.getActiveUser().getEmail() || '?'));
  _hubListarDisparadores();
  Logger.log('Remitente de correo: ' + (_correoRemitente() || 'la cuenta del script') + ' · cuota restante hoy: ' + MailApp.getRemainingDailyQuota());
}

/* TRASPASO: los disparadores son de quien los crea (cada uno solo ve y borra
   los suyos). Quien deja de gestionar el hub ejecuta esto con SU cuenta; quien
   lo recibe ejecuta instalarDisparadores() con la suya. */
function quitarDisparadores() {
  const t = ScriptApp.getProjectTriggers();
  t.forEach(function (x) { ScriptApp.deleteTrigger(x); });
  Logger.log('Borrados ' + t.length + ' disparadores de ' + (Session.getActiveUser().getEmail() || 'esta cuenta') + ' en este proyecto.');
}

function _hubListarDisparadores() {
  const t = ScriptApp.getProjectTriggers();
  Logger.log('Disparadores (' + t.length + '): ' + t.map(function (x) { return x.getHandlerFunction() + ' [' + x.getEventType() + ']'; }).join(', '));
}
