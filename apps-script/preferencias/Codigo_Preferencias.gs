/* ===========================================================================
   PREFERENCIAS · backend de las preferencias de cada cuenta del hub
   (?app=preferencias del proyecto único)

   De momento solo el TEMA (claro u oscuro): se recuerda por cuenta, así cada
   persona ve siempre el que eligió, en cualquier ordenador o navegador.
   Se guarda en las Propiedades del script, una por cuenta:
     pref:<email>  ->  {"tema":"light","actualizado":"2026-10-28T…"}
   Solo cuentas de equipo.json (email NFQ o BBVA).

   API — respuesta { ok, data | error }
     GET  ?app=preferencias&action=leer&email=…        -> { tema: 'light'|'dark'|null }
     POST { action:'guardar', email, tema:'light'|'dark' } -> { tema }
   =========================================================================== */

const PREF_EQUIPO_URL = 'https://raw.githubusercontent.com/rdr-nfq/team-hub/main/beyond-the-grid/public/equipo/equipo.json';
const PREF_TEMAS = ['light', 'dark'];

function doGetPreferencias(e) { return _servirPreferencias((e && e.parameter) || {}); }
function doPostPreferencias(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
  const q = (e && e.parameter) || {};
  Object.keys(q).forEach(function (k) { if (p[k] === undefined) p[k] = q[k]; });
  return _servirPreferencias(p);
}

function _servirPreferencias(p) {
  let out;
  try {
    const email = _prefCuenta(p.email);
    let data;
    switch (String(p.action || '')) {
      case 'leer': data = _prefLeer(email); break;
      case 'guardar': data = _prefGuardar(email, p.tema); break;
      default: throw new Error('Acción desconocida: ' + p.action);
    }
    out = { ok: true, data: data };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Email normalizado de una cuenta de equipo.json (si no, error). */
function _prefCuenta(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) throw new Error('Falta el email.');
  const cache = CacheService.getScriptCache();
  let txt = cache.get('pref:equipo');
  if (!txt) {
    const resp = UrlFetchApp.fetch(PREF_EQUIPO_URL, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() !== 200) throw new Error('HTTP ' + resp.getResponseCode() + ' al leer equipo.json');
    txt = resp.getContentText();
    try { cache.put('pref:equipo', txt, 600); } catch (_) {}
  }
  const esta = (JSON.parse(txt).team || []).some(function (m) {
    return [m.email, m.emailBBVA].some(function (x) { return String(x || '').trim().toLowerCase() === e; });
  });
  if (!esta) throw new Error('Cuenta desconocida: ' + e);
  return e;
}

function _prefLeer(email) {
  let d = null;
  try { d = JSON.parse(PropertiesService.getScriptProperties().getProperty('pref:' + email) || 'null'); } catch (_) {}
  return { tema: d && PREF_TEMAS.indexOf(d.tema) >= 0 ? d.tema : null };
}

function _prefGuardar(email, tema) {
  if (PREF_TEMAS.indexOf(tema) < 0) throw new Error('Tema no válido: ' + tema);
  PropertiesService.getScriptProperties().setProperty('pref:' + email, JSON.stringify({ tema: tema, actualizado: new Date().toISOString() }));
  return { tema: tema };
}
