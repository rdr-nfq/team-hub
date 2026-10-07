/**
 * ============================================================================
 *  GESTIÓN DEL EQUIPO  ·  Apps Script (backend de la página /equipo-gestion)
 * ============================================================================
 *
 *  equipo.json es la FUENTE DE VERDAD de la web (login, roles, plantilla) y
 *  vive en el repositorio de GitHub. Este script recibe el equipo editado
 *  desde la web y lo COMMITEA a main vía la API de GitHub; GitHub Pages
 *  redespliega y toda la web (login incluido) recoge el cambio en ~1-2 min.
 *
 *  DESPLIEGUE (proyecto Apps Script INDEPENDIENTE):
 *   1. script.google.com -> Nuevo proyecto -> pegar este fichero.
 *   2. Configuración del proyecto (⚙) -> Propiedades del script -> añadir:
 *        GITHUB_TOKEN  = token de GitHub con permiso de Contents:write SOLO
 *                        sobre rdr-nfq/team-hub (token "fine-grained").
 *        CLAVE_EQUIPO  = clave que se pedirá en la web para poder guardar
 *                        (compártela solo con coordinación).
 *   3. Implementar -> Aplicación web (Ejecutar como YO, Cualquier persona).
 *   4. Pegar la URL /exec en links.json -> "equipoBackend".
 *
 *  API:
 *    GET  ?action=ping -> { ok:true, configurado: true|false }
 *    POST text/plain JSON { action:'guardarEquipo', clave, team:[...] }
 *      -> { ok:true, data:{ commitUrl, miembros } }
 * ============================================================================
 */

var CONFIG = {
  REPO: 'rdr-nfq/team-hub',
  RUTA: 'beyond-the-grid/public/equipo/equipo.json',
  BRANCH: 'main'
};

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
    var props = PropertiesService.getScriptProperties();
    var action = p.action || 'ping';
    var data;
    switch (action) {
      case 'ping':
        data = { configurado: !!(props.getProperty('GITHUB_TOKEN') && props.getProperty('CLAVE_EQUIPO')) };
        break;
      case 'guardarEquipo':
        data = guardarEquipo(p.clave, p.team);
        break;
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

/** Valida y commitea el equipo editado a equipo.json en GitHub. */
function guardarEquipo(clave, team) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var claveOk = props.getProperty('CLAVE_EQUIPO');
  if (!token || !claveOk)
    throw new Error('Backend sin configurar: faltan GITHUB_TOKEN y/o CLAVE_EQUIPO en Propiedades del script.');
  if (String(clave || '') !== claveOk) throw new Error('Clave de coordinación incorrecta.');

  // Validación de estructura: sin esto un guardado roto dejaría a TODO el
  // equipo sin poder entrar en la web (equipo.json manda en el login).
  if (!Array.isArray(team) || !team.length) throw new Error('El equipo no puede quedar vacío.');
  var emails = {};
  team = team.map(function (m, i) {
    if (!m || typeof m !== 'object') throw new Error('Miembro ' + (i + 1) + ' inválido.');
    // Se guarda lo ya LIMPIO, no lo que llegó: antes se validaba el email sin
    // espacios pero se escribía tal cual, y un " correo@nfq.es" con un espacio
    // delante dejaba a esa persona sin poder entrar en la web.
    var limpio = {};
    Object.keys(m).forEach(function (k) {
      limpio[k] = typeof m[k] === 'string' ? m[k].trim() : m[k];
    });
    limpio.email = String(limpio.email || '').toLowerCase();
    if (!limpio.nombre || !limpio.email) throw new Error('Miembro ' + (i + 1) + ': nombre y email son obligatorios.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpio.email)) throw new Error('Email inválido: ' + limpio.email);
    if (emails[limpio.email]) throw new Error('Email duplicado: ' + limpio.email);
    emails[limpio.email] = 1;
    return limpio;
  });
  var hayCoordinador = team.some(function (m) { return !!m.coordinador; });
  if (!hayCoordinador) throw new Error('Debe quedar al menos una persona con rol de coordinador.');

  var api = 'https://api.github.com/repos/' + CONFIG.REPO + '/contents/' + CONFIG.RUTA;
  var headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json'
  };

  // 1. SHA y contenido actuales (se preservan las claves de nivel superior
  //    distintas de "team" que pudiera haber en el fichero).
  var resGet = UrlFetchApp.fetch(api + '?ref=' + CONFIG.BRANCH, { headers: headers, muteHttpExceptions: true });
  if (resGet.getResponseCode() !== 200)
    throw new Error('GitHub (leer ' + resGet.getResponseCode() + '): ' + resGet.getContentText().slice(0, 180));
  var actual = JSON.parse(resGet.getContentText());
  var contenido = {};
  try {
    contenido = JSON.parse(Utilities.newBlob(Utilities.base64Decode(actual.content.replace(/\n/g, ''))).getDataAsString());
  } catch (e) {}
  contenido.team = team;

  // 2. Commit del fichero completo.
  var nuevo = JSON.stringify(contenido, null, 2) + '\n';
  var resPut = UrlFetchApp.fetch(api, {
    method: 'put',
    headers: headers,
    contentType: 'application/json',
    payload: JSON.stringify({
      message: 'Equipo: actualización desde la web (' + team.length + ' miembros)',
      content: Utilities.base64Encode(nuevo, Utilities.Charset.UTF_8),
      sha: actual.sha,
      branch: CONFIG.BRANCH
    }),
    muteHttpExceptions: true
  });
  if (resPut.getResponseCode() >= 300)
    throw new Error('GitHub (commit ' + resPut.getResponseCode() + '): ' + resPut.getContentText().slice(0, 180));
  var out = JSON.parse(resPut.getContentText());
  return {
    miembros: team.length,
    commitUrl: out.commit && out.commit.html_url
  };
}
