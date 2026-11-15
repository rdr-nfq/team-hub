/* ===========================================================================
   Comidas RDR · Backend Apps Script (v2)
   Cambios respecto a la v1:
   - doGet devuelve también los votos crudos de "Equipo" y la columna "oficina"
     de cada semana, para que la web calcule los recuentos (más votados,
     Taper/Glovo, No estoy) e histórico sin depender de fórmulas en "Semana".
   - doPost hace UPSERT: si el compañero ya votó esa semana, actualiza su fila
     en vez de añadir una nueva (evita votos duplicados / permite cambiar).
   - v3: se vota solo como uno mismo (el nombre sale del email, vía
     equipo.json) y se puede retirar el voto ({accion:'retirar'}).
   Despliegue: Implementar > Aplicación web > Ejecutar como "Yo" · Acceso
   "Cualquier persona". Copia la URL /exec en links.json -> "comidasBackend".
   =========================================================================== */

function getSpreadsheet() {
  return _hubHoja('COMIDAS'); // Comidas_RDR (id en _comun/Hub.gs)
}

// ── GET · cargar datos al inicio ──────────────────────────────────────────
function doGetComidas(e) {
  const ss = getSpreadsheet();

  // 1) Restaurantes
  const sheetRest = ss.getSheetByName('Restaurantes');
  const dataRest = sheetRest.getDataRange().getValues();
  dataRest.shift(); // cabeceras
  const restaurantes = dataRest.map(row => ({
    nombre:    row[0],
    descCorta: row[1] || '',
    carta:     row[2] || '',
    foto:      row[3] || '',
    descLarga: row[4] || ''   // 5ª columna opcional (Descripción larga)
  })).filter(r => r.nombre);

  // 2) Semanas (todas, con bandera de oficina)
  const sheetSem = ss.getSheetByName('Semana');
  const dataSem = sheetSem.getDataRange().getDisplayValues(); // formato DD/MM/YYYY
  dataSem.shift();
  const semanas = dataSem
    .filter(row => row[0]) // fecha no vacía
    .map(row => ({
      fecha:   row[0],
      oficina: String(row[1]).trim().toUpperCase() === 'N' // N = se va a la oficina, votación abierta
    }));

  // 3) Votos crudos de "Equipo"
  const sheetEq = ss.getSheetByName('Equipo');
  const dataEq = sheetEq.getDataRange().getDisplayValues();
  dataEq.shift();
  const votos = dataEq
    .filter(row => row[0] && row[1]) // semana + compañero
    .map(row => ({
      semana:     row[0],
      companero:  row[1],
      eleccion1:  row[2] || '',
      eleccion2:  row[3] || '',
      taperGlovo: String(row[4]).trim().toLowerCase() === 'sí' || String(row[4]).trim().toLowerCase() === 'si',
      noEstoy:    String(row[5]).trim().toLowerCase() === 'sí' || String(row[5]).trim().toLowerCase() === 'si'
    }));

  return ContentService
    .createTextOutput(JSON.stringify({ restaurantes, semanas, votos }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── POST · guardar, actualizar o retirar el voto de quien está en la web ──
// Se vota SOLO como uno mismo: la web manda el email con el que se ha entrado
// y aquí se busca su nombre en equipo.json (no se fía del nombre que llegue).
//   { semana, email, eleccion1, eleccion2, taperGlovo, noEstoy }  -> upsert
//   { accion: 'retirar', semana, email }                          -> borra su fila
function doPostComidas(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    const email = String(data.email || '').trim();
    if (!email) throw new Error('Falta tu email: vuelve a entrar en la web.');
    const yo = _comidasPersona(email);
    if (!yo) throw new Error('No te encuentro en equipo.json (' + email + '): pide que te den de alta.');
    const semana = String(data.semana || '').trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(semana)) throw new Error('Falta el jueves.');

    lock.waitLock(20000);
    const sheet = getSpreadsheet().getSheetByName('Equipo');
    const values = sheet.getDataRange().getDisplayValues();
    let rowIndex = -1; // 1-based en la hoja
    for (let i = 1; i < values.length; i++) { // i=0 son cabeceras
      if (values[i][0] === semana && nombreClave_(values[i][1]) === nombreClave_(yo.nombre)) { rowIndex = i + 1; break; }
    }

    if (String(data.accion || '') === 'retirar') {
      if (rowIndex > 0) sheet.deleteRow(rowIndex);
      return _comidasJson({ status: 'success', retirado: rowIndex > 0, nombre: yo.nombre });
    }

    const noEstoy = data.noEstoy === true, taperGlovo = !noEstoy && data.taperGlovo === true;
    const e1 = noEstoy || taperGlovo ? '' : String(data.eleccion1 || '').trim();
    let e2 = noEstoy || taperGlovo ? '' : String(data.eleccion2 || '').trim();
    if (!noEstoy && !taperGlovo && !e1) throw new Error('Falta tu 1ª opción.');
    if (e2 === e1) e2 = ''; // la misma en 1ª y 2ª no suma dos veces
    const fila = [semana, yo.nombre, e1, e2, taperGlovo ? 'Sí' : 'No', noEstoy ? 'Sí' : 'No'];
    if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, fila.length).setValues([fila]); // actualizar
    else sheet.appendRow(fila); // nuevo voto
    return _comidasJson({ status: 'success', updated: rowIndex > 0, nombre: yo.nombre });

  } catch (error) {
    return _comidasJson({ status: 'error', message: String(error && error.message ? error.message : error) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function _comidasJson(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Persona de equipo.json con ese email (o su email de BBVA). equipo.json se
 *  guarda 10 min en la caché del script para no leerlo en cada voto. */
function _comidasPersona(email) {
  const cache = CacheService.getScriptCache();
  let team = null;
  try { team = JSON.parse(cache.get('comidas_equipo') || 'null'); } catch (_) {}
  if (!team) {
    team = equipo_().map(function (p) { return { nombre: p.nombre, email: p.email, emailBBVA: p.emailBBVA || '' }; });
    if (team.length) cache.put('comidas_equipo', JSON.stringify(team), 600);
  }
  return team.filter(function (p) { return mismoEmail_(p.email, email) || (p.emailBBVA && mismoEmail_(p.emailBBVA, email)); })[0] || null;
}

// ── CORS preflight ────────────────────────────────────────────────────────
function doOptionsComidas(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}
