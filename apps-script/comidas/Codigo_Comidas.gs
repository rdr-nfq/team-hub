/* ===========================================================================
   Comidas RDR · Backend Apps Script (v2)
   Cambios respecto a la v1:
   - doGet devuelve también los votos crudos de "Equipo" y la columna "oficina"
     de cada semana, para que la web calcule los recuentos (más votados,
     Taper/Glovo, No estoy) e histórico sin depender de fórmulas en "Semana".
   - doPost hace UPSERT: si el compañero ya votó esa semana, actualiza su fila
     en vez de añadir una nueva (evita votos duplicados / permite cambiar).
   Despliegue: Implementar > Aplicación web > Ejecutar como "Yo" · Acceso
   "Cualquier persona". Copia la URL /exec en links.json -> "comidasBackend".
   =========================================================================== */

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet(); // o SpreadsheetApp.openById('ID')
}

// ── GET · cargar datos al inicio ──────────────────────────────────────────
function doGet(e) {
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

// ── POST · guardar / actualizar la elección de un compañero ───────────────
function doPost(e) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName('Equipo');
    const data = JSON.parse(e.postData.contents);

    const fila = [
      data.semana,
      data.nombre,
      data.eleccion1 || '',
      data.eleccion2 || '',
      data.taperGlovo ? 'Sí' : 'No',
      data.noEstoy ? 'Sí' : 'No'
    ];

    // UPSERT: ¿ya existe una fila de este compañero para esta semana?
    const values = sheet.getDataRange().getDisplayValues();
    let rowIndex = -1; // 1-based en la hoja
    for (let i = 1; i < values.length; i++) { // i=0 son cabeceras
      if (values[i][0] === data.semana && values[i][1] === data.nombre) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, fila.length).setValues([fila]); // actualizar
    } else {
      sheet.appendRow(fila); // nuevo voto
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'success', updated: rowIndex > 0 }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── CORS preflight ────────────────────────────────────────────────────────
function doOptions(e) {
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}
