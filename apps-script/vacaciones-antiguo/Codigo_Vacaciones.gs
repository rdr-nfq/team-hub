// ============================================================
// Codigo_Vacaciones.gs — Backend Vacaciones RDR
// ============================================================
// Modo de funcionamiento:
//   - doGet() sin parámetros → sirve el HTML de responsables
//     (Index.html), igual que hasta ahora. Se accede vía mail.
//   - doGet(?modo=publico)   → devuelve JSON de SOLO LECTURA
//     para alimentar la web pública en GitHub Pages.
//
// Al aprobar una solicitud, además de pintar el Excel principal
// y notificar por mail, se crea un evento all-day en el calendario
// compartido del equipo (ID_CALENDARIO_AUSENCIAS).
//
// Todo el resto (obtenerDatosCompletos, procesarSolicitud,
// forzarSincronizacionWeb) funciona idéntico al original.
// Formulario.gs y Migracion.gs no se tocan.
// ============================================================


// ------------------------------------------------------------
// 0a. CONFIGURACIÓN — IDs externos
// ------------------------------------------------------------
// ID del calendario compartido donde se crean los eventos al
// aprobar una solicitud. Para obtenerlo:
//   Google Calendar → ⚙ junto al calendario → "Configuración y uso compartido"
//   → busca "Integrar el calendario" → copia el "ID del calendario"
//   (es una cadena tipo "abc123@group.calendar.google.com").
// Importante: la cuenta que ejecuta el Web App debe tener
// permisos de edición sobre este calendario.
// ------------------------------------------------------------
const ID_CALENDARIO_AUSENCIAS = 'c_7f897d2240e831b1b87e40c7018e7c9d300b59f1b57146aade363d870536c314@group.calendar.google.com';


// ------------------------------------------------------------
// 0. PALETA DE EQUIPOS
// ------------------------------------------------------------
// Mapeo: número de equipo (string) → color hex BBVA.
// Para añadir equipos nuevos, simplemente añade aquí.
// Los HTML no necesitan cambios: reciben el color ya resuelto
// dentro de cada empleado.
// ------------------------------------------------------------
const COLOR_POR_EQUIPO = {
  '1': '#001391', // Electric Blue
  '2': '#88E783', // Lime
  '3': '#FFB56B', // Mandarin
  '4': '#9694FF', // Purple
  '5': '#8BE1E9', // Aqua / Ice
  '6': '#FFE761'  // Canary
};
const COLOR_EQUIPO_FALLBACK = '#ADB8C2'; // Gray-4 BBVA — gente sin equipo asignado

/** Normaliza el valor de la celda Equipo: "1.0" → "1", 2 → "2", "" → "". */
function _normalizarNumEquipo(v) {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (!s) return '';
  // Quitar decimales si vienen como "1.0"
  s = s.replace(/\.0+$/, '');
  return s;
}

/** Devuelve el color de un equipo o el fallback si no encaja. */
function _colorDeEquipo(numEquipo) {
  return COLOR_POR_EQUIPO[String(numEquipo)] || COLOR_EQUIPO_FALLBACK;
}

// ------------------------------------------------------------
// 0b. HELPER — Sincronización con Google Calendar
// ------------------------------------------------------------
// Crea un evento all-day en el calendario común al aprobar una
// solicitud. Si algo falla (calendario mal configurado, sin
// permisos, problema de red…), NO rompe la aprobación: solo
// loggea y devuelve null. El Excel sigue siendo la fuente de
// verdad; el calendario es una vista derivada.
// ------------------------------------------------------------

/** Tipo corto (VA/FO/ES) → etiqueta legible + color del evento. */
function _infoTipoAusencia(tipoCorto) {
  switch (tipoCorto) {
    case 'VA': return { etiqueta: 'Vacaciones',       color: CalendarApp.EventColor.GREEN }; // verde — descanso
    case 'FO': return { etiqueta: 'Formación',        color: CalendarApp.EventColor.BLUE  }; // azul — trabajo
    case 'ES': return { etiqueta: 'Permiso especial', color: CalendarApp.EventColor.MAUVE }; // morado — especial
    default:   return { etiqueta: 'Ausencia',         color: null };
  }
}

/**
 * Crea un evento all-day en el calendario común.
 * @return {string|null} ID del evento creado, o null si falla.
 */
function _crearEventoCalendarioAusencia(nombre, tipoCorto, fInicio, fFin, idSolicitud) {
  try {
    if (!ID_CALENDARIO_AUSENCIAS || ID_CALENDARIO_AUSENCIAS.indexOf('PEGA_') === 0) {
      Logger.log('Calendario no configurado (ID_CALENDARIO_AUSENCIAS vacío). Salto sincronización.');
      return null;
    }

    const cal = CalendarApp.getCalendarById(ID_CALENDARIO_AUSENCIAS);
    if (!cal) {
      Logger.log('No se puede acceder al calendario: ' + ID_CALENDARIO_AUSENCIAS);
      return null;
    }

    const info = _infoTipoAusencia(tipoCorto);
    const titulo = nombre + ' — ' + info.etiqueta;

    // En createAllDayEvent(title, startDate, endDate), endDate es EXCLUSIVO.
    // Si la solicitud es del 1 al 5, el evento all-day debe ir de 1 a 6.
    const fInicioCopy = new Date(fInicio.getFullYear(), fInicio.getMonth(), fInicio.getDate());
    const fFinExclusivo = new Date(fFin.getFullYear(), fFin.getMonth(), fFin.getDate() + 1);

    const descripcion =
      'Empleado: ' + nombre + '\n' +
      'Tipo: ' + info.etiqueta + ' (' + tipoCorto + ')\n' +
      'Solicitud: ' + idSolicitud + '\n\n' +
      'Generado automáticamente por Vacaciones RDR.';

    let evento;
    if (fInicioCopy.getTime() === fFin.getTime()) {
      // Un solo día — la firma de 1 día es distinta
      evento = cal.createAllDayEvent(titulo, fInicioCopy, { description: descripcion });
    } else {
      evento = cal.createAllDayEvent(titulo, fInicioCopy, fFinExclusivo, { description: descripcion });
    }

    if (info.color) {
      try { evento.setColor(info.color); } catch (e) { /* ignorar; no es crítico */ }
    }

    return evento.getId();
  } catch (err) {
    Logger.log('ERROR creando evento Calendar: ' + err.message);
    return null;
  }
}

/**
 * Lee la hoja RDR y construye:
 *   { emailToNombre, nombreToEquipo, esResponsableEmail }
 * Usado por las funciones de lectura para no duplicar el barrido.
 */
function _leerIndiceRDR(emailUsuario) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaRDR = ss.getSheetByName("RDR");
  const result = { emailToNombre: {}, nombreToEquipo: {}, esResponsable: false };
  if (!hojaRDR) return result;

  const datosRDR = hojaRDR.getDataRange().getValues();
  // Cabecera en fila 0: A=Nombre, B=Email, C=Rol, D=Equipo
  for (let i = 1; i < datosRDR.length; i++) {
    let nombre  = String(datosRDR[i][0] || '').trim();
    let email   = String(datosRDR[i][1] || '').toLowerCase().trim();
    let rol     = String(datosRDR[i][2] || '').trim().replace(/\.0+$/, '');
    let equipo  = _normalizarNumEquipo(datosRDR[i][3]);

    if (email && nombre) result.emailToNombre[email] = nombre;
    if (nombre && equipo) result.nombreToEquipo[nombre] = equipo;
    if (emailUsuario && email === emailUsuario && (rol === '1' || rol === '2')) {
      result.esResponsable = true;
    }
  }
  return result;
}


// ------------------------------------------------------------
// 1. ENTRY POINT
// ------------------------------------------------------------

function doGet(e) {
  const modo = (e && e.parameter && e.parameter.modo) ? String(e.parameter.modo).toLowerCase() : '';

  // --- Endpoint público (JSON) para GitHub Pages ---
  if (modo === 'publico') {
    let payload;
    try {
      payload = obtenerDatosPublicos();
    } catch (err) {
      payload = { error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // --- Modo original: HTML para responsables ---
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Dashboard RDR')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


// ------------------------------------------------------------
// 2. LECTURA DE LA BASE DE DATOS (responsables)
// ------------------------------------------------------------
// Igual que el original. Sigue usándose vía google.script.run.
// ------------------------------------------------------------

function obtenerDatosCompletos() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();

    // Leer RDR (permisos + diccionario email→nombre + nombre→equipo)
    const idx = _leerIndiceRDR(emailUsuario);
    const emailToNombre  = idx.emailToNombre;
    const nombreToEquipo = idx.nombreToEquipo;
    const isResponsable  = idx.esResponsable;

    // Leer Equipo (datos del empleado). El color YA NO sale de la columna B,
    // sale de la paleta de equipos cruzando con RDR.
    const hojaEquipo = ss.getSheetByName("Equipo");
    const datosEquipo = hojaEquipo.getDataRange().getValues();
    let empleadosList = []; let empleadosMap = {};
    for (let i = 1; i < datosEquipo.length; i++) {
      let nombre = String(datosEquipo[i][0]).trim();
      if (!nombre) continue;
      let numEquipo = nombreToEquipo[nombre] || '';
      let emp = {
        nombre: nombre,
        equipo: numEquipo,                        // string ('1', '2', '' si no asignado)
        color: _colorDeEquipo(numEquipo),         // color resuelto desde la paleta
        consumidas: parseFloat(datosEquipo[i][3]) || 0,
        pendientes: parseFloat(datosEquipo[i][4]) || 0,
        activo: datosEquipo[i][5] !== false
      };
      empleadosList.push(emp); empleadosMap[nombre] = emp;
    }

    // Leer Ausencias
    const hojaAprobadas = ss.getSheetByName("Ausencias Aprobadas");
    const datosAprobadas = hojaAprobadas.getDataRange().getValues();
    let ausenciasPorDia = {};
    for (let i = 1; i < datosAprobadas.length; i++) {
      let nombre = String(datosAprobadas[i][0]).trim();
      let fecha = datosAprobadas[i][1];
      let tipo = String(datosAprobadas[i][2]).trim();
      if (!nombre || !fecha) continue;
      let dateStr = formatearFecha(fecha);
      if (!ausenciasPorDia[dateStr]) ausenciasPorDia[dateStr] = [];
      ausenciasPorDia[dateStr].push({ nombre: nombre, motivo: tipo });
    }

    // Leer Festivos
    const hojaFestivos = ss.getSheetByName("Festivos");
    let festivosMap = {};
    if (hojaFestivos) {
      const datosFestivos = hojaFestivos.getDataRange().getValues();
      for (let i = 1; i < datosFestivos.length; i++) {
        let fecha = datosFestivos[i][0]; let pais = String(datosFestivos[i][1]).trim().toUpperCase();
        if (fecha && pais) festivosMap[formatearFecha(fecha)] = pais;
      }
    }

    // Leer Solicitudes (Buscando columnas por nombre)
    let solicitudes = [];
    if (isResponsable) {
      const hojaSol = ss.getSheets()[0];
      const datosSol = hojaSol.getDataRange().getValues();
      if (datosSol.length > 0) {
        let cabeceras = datosSol[0];
        let cEmail = 1, cTipo = 2, cIni = 3, cFin = 4, cCom = 5, cEst = 6, cID = 7;

        for (let c = 0; c < cabeceras.length; c++) {
          let t = String(cabeceras[c]).toUpperCase().trim();
          if (t.includes("CORREO")) cEmail = c;
          if (t.includes("TIPO")) cTipo = c;
          if (t.includes("INICIO")) cIni = c;
          if (t.includes("FIN")) cFin = c;
          if (t.includes("COMENTARIO")) cCom = c;
          if (t === "ESTADO") cEst = c;
          if (t.includes("ID")) cID = c;
        }

        for (let i = 1; i < datosSol.length; i++) {
          let estado = String(datosSol[i][cEst] || "").trim().toUpperCase();
          if (estado === "PENDIENTE") {
            let emailSol = String(datosSol[i][cEmail]).toLowerCase().trim();
            let nombreAsignado = emailToNombre[emailSol] || "Empleado (" + emailSol + ")";

            solicitudes.push({
              timestamp: String(datosSol[i][0]),
              email: emailSol,
              nombre: nombreAsignado,
              tipo: String(datosSol[i][cTipo]).trim(),
              inicioStr: formatearFecha(datosSol[i][cIni]),
              finStr: formatearFecha(datosSol[i][cFin]),
              comentarios: datosSol[i][cCom],
              id: datosSol[i][cID]
            });
          }
        }
      }
    }

    return {
      year: new Date().getFullYear(),
      empleados: empleadosList,
      empleadosMap: empleadosMap,
      ausenciasPorDia: ausenciasPorDia,
      festivos: festivosMap,
      solicitudes: solicitudes,
      isResponsable: isResponsable,
      paletaEquipos: COLOR_POR_EQUIPO   // { '1': '#001391', '2': '#88E783', ... }
    };
  } catch (error) { return { error: error.message }; }
}


// ------------------------------------------------------------
// 2.b. DATOS PÚBLICOS (GitHub Pages)
// ------------------------------------------------------------
// Mismo perímetro de datos que el dashboard normal PERO:
//   - Nunca devuelve `solicitudes` (no se exponen peticiones).
//   - Nunca devuelve la columna de email de los empleados.
//   - No depende de Session.getActiveUser() (el endpoint es anónimo).
// Si quisieras endurecer más adelante puedes:
//   - Filtrar empleados inactivos.
//   - Anonimizar nombres (iniciales).
//   - Usar una "key" en la URL como semi-secreto.
// ------------------------------------------------------------

function obtenerDatosPublicos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Cruzar nombres con la columna Equipo de RDR
  const idx = _leerIndiceRDR(null); // sin email — endpoint anónimo
  const nombreToEquipo = idx.nombreToEquipo;

  // Equipo
  const hojaEquipo = ss.getSheetByName("Equipo");
  const datosEquipo = hojaEquipo.getDataRange().getValues();
  let empleadosList = []; let empleadosMap = {};
  for (let i = 1; i < datosEquipo.length; i++) {
    let nombre = String(datosEquipo[i][0]).trim();
    if (!nombre) continue;
    let numEquipo = nombreToEquipo[nombre] || '';
    let emp = {
      nombre: nombre,
      equipo: numEquipo,
      color: _colorDeEquipo(numEquipo),
      consumidas: parseFloat(datosEquipo[i][3]) || 0,
      pendientes: parseFloat(datosEquipo[i][4]) || 0,
      activo: datosEquipo[i][5] !== false
    };
    empleadosList.push(emp);
    empleadosMap[nombre] = emp;
  }

  // Ausencias
  const hojaAprobadas = ss.getSheetByName("Ausencias Aprobadas");
  const datosAprobadas = hojaAprobadas.getDataRange().getValues();
  let ausenciasPorDia = {};
  for (let i = 1; i < datosAprobadas.length; i++) {
    let nombre = String(datosAprobadas[i][0]).trim();
    let fecha = datosAprobadas[i][1];
    let tipo = String(datosAprobadas[i][2]).trim();
    if (!nombre || !fecha) continue;
    let dateStr = formatearFecha(fecha);
    if (!ausenciasPorDia[dateStr]) ausenciasPorDia[dateStr] = [];
    ausenciasPorDia[dateStr].push({ nombre: nombre, motivo: tipo });
  }

  // Festivos
  const hojaFestivos = ss.getSheetByName("Festivos");
  let festivosMap = {};
  if (hojaFestivos) {
    const datosFestivos = hojaFestivos.getDataRange().getValues();
    for (let i = 1; i < datosFestivos.length; i++) {
      let fecha = datosFestivos[i][0];
      let pais = String(datosFestivos[i][1]).trim().toUpperCase();
      if (fecha && pais) festivosMap[formatearFecha(fecha)] = pais;
    }
  }

  return {
    year: new Date().getFullYear(),
    empleados: empleadosList,
    empleadosMap: empleadosMap,
    ausenciasPorDia: ausenciasPorDia,
    festivos: festivosMap,
    paletaEquipos: COLOR_POR_EQUIPO,
    generatedAt: new Date().toISOString()
  };
}


// ------------------------------------------------------------
// 3. LÓGICA DE APROBAR / RECHAZAR (sin cambios)
// ------------------------------------------------------------

function procesarSolicitud(idSolicitud, accion) {
  let hojaSol, filaActualizar = -1, cEst = 6;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const emailUsuario = Session.getActiveUser().getEmail().toLowerCase().trim();

    // --- 1. IDENTIFICACIÓN Y PERMISOS ---
    const hojaRDR = ss.getSheetByName("RDR");
    let esJefe = false; let emailToNombre = {};
    const datosRDR = hojaRDR.getDataRange().getValues();
    for (let i = 1; i < datosRDR.length; i++) {
      let emailFila = String(datosRDR[i][1]).toLowerCase().trim();
      let rolFila = String(datosRDR[i][2]).trim().replace(".0", "");
      if (emailFila) emailToNombre[emailFila] = String(datosRDR[i][0]).trim();
      if (emailFila === emailUsuario && (rolFila === "1" || rolFila === "2")) esJefe = true;
    }
    if (!esJefe) throw new Error("No tienes permisos de responsable.");

    // --- 2. DATOS DE LA SOLICITUD ---
    hojaSol = ss.getSheets()[0];
    const datosSol = hojaSol.getDataRange().getValues();
    let cabeceras = datosSol[0];
    let cEmail = 1, cTipo = 2, cIni = 3, cFin = 4, cID = 7;
    for (let c = 0; c < cabeceras.length; c++) {
      let t = String(cabeceras[c]).toUpperCase().trim();
      if (t.includes("ESTADO")) cEst = c;
      if (t.includes("CORREO") || t.includes("EMAIL")) cEmail = c;
      if (t.includes("TIPO")) cTipo = c;
      if (t.includes("INICIO")) cIni = c;
      if (t.includes("FIN")) cFin = c;
      if (t.includes("ID")) cID = c;
    }

    let datosFila = null;
    for (let i = 1; i < datosSol.length; i++) {
      if (String(datosSol[i][cID]).trim() === String(idSolicitud).trim()) {
        filaActualizar = i + 1; datosFila = datosSol[i]; break;
      }
    }
    if (filaActualizar === -1) throw new Error("No se encontró la solicitud.");

    const emailEmpleado = datosFila[cEmail];
    const nombre = emailToNombre[String(emailEmpleado).toLowerCase().trim()] || "Empleado";
    const tipoCompleto = datosFila[cTipo];
    const tipoCorto = tipoCompleto.includes('VA') ? 'VA' : (tipoCompleto.includes('FO') ? 'FO' : 'ES');
    const fInicio = new Date(datosFila[cIni]); const fFin = new Date(datosFila[cFin]);
    const strInicio = `${String(fInicio.getDate()).padStart(2, '0')}/${String(fInicio.getMonth() + 1).padStart(2, '0')}/${fInicio.getFullYear()}`;
    const strFin = `${String(fFin.getDate()).padStart(2, '0')}/${String(fFin.getMonth() + 1).padStart(2, '0')}/${fFin.getFullYear()}`;

    if (accion === 'APROBAR') {
      const hojaAprobadas = ss.getSheetByName("Ausencias Aprobadas");

      // 🛑 BARRERA ANTI-SOLAPAMIENTOS
      const datosAprobados = hojaAprobadas.getDataRange().getValues();
      let check = new Date(fInicio);
      while (check <= fFin) {
        if (check.getDay() !== 0 && check.getDay() !== 6) {
          let s = formatearFecha(check);
          for (let a = 1; a < datosAprobados.length; a++) {
            if (String(datosAprobados[a][0]).trim() === nombre && formatearFecha(datosAprobados[a][1]) === s) {
              throw new Error(`¡SOLAPAMIENTO! ${nombre} ya tiene una ausencia el ${s}.`);
            }
          }
        }
        check.setDate(check.getDate() + 1);
      }

      const ssPrincipal = SpreadsheetApp.openById(ID_EXCEL_PRINCIPAL);
      const yearReq = fInicio.getFullYear();
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

      // ============================================================
      // 🚀 MOTOR A: "Vacaciones <año de la solicitud>"
      // (antes 'Vacaciones 2026' fijo: una solicitud de 2027 escribía,
      // sin avisar, en la pestaña de 2026 en vez de en la de 2027)
      // ============================================================
      const hojaVaca = ssPrincipal.getSheetByName(`Vacaciones ${yearReq}`);
      if (hojaVaca) {
        const dataV = hojaVaca.getRange(1, 1, hojaVaca.getLastRow(), Math.min(hojaVaca.getLastColumn(), 50)).getValues();
        let mapaV = {};
        for (let r = 0; r < dataV.length; r++) {
          let mIdx = -1;
          for(let c = 0; c < 10; c++) {
            let v = dataV[r][c];
            let s = (v instanceof Date) ? meses[v.getMonth()] : String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            if (meses.indexOf(s) !== -1) { mIdx = meses.indexOf(s); break; }
          }
          if (mIdx !== -1) {
            let rDias = -1;
            for (let dr = r; dr <= r + 4; dr++) {
              if (dr >= dataV.length) break;
              let dCount = 0;
              for (let dc = 0; dc < dataV[0].length; dc++) { if (parseInt(dataV[dr][dc]) >= 1) dCount++; }
              if (dCount >= 28) { rDias = dr; break; }
            }
            if (rDias !== -1) {
              let colMap = {};
              for (let dc = 0; dc < dataV[0].length; dc++) {
                let n = parseInt(dataV[rDias][dc]); if (n >= 1) colMap[n] = dc + 1;
              }
              for (let re = rDias + 1; re < rDias + 60; re++) {
                if (re >= dataV.length) break;
                if (String(dataV[re][0] || dataV[re][1] || "").trim() === nombre) {
                  for (let d in colMap) {
                    mapaV[`${yearReq}-${String(mIdx + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`] = { r: re + 1, c: colMap[d] };
                  }
                  break;
                }
              }
            }
          }
        }
        let dV = new Date(fInicio);
        while (dV <= fFin) {
          if (dV.getDay() !== 0 && dV.getDay() !== 6) {
            let claveA = `${dV.getFullYear()}-${String(dV.getMonth() + 1).padStart(2,'0')}-${String(dV.getDate()).padStart(2,'0')}`;
            if (mapaV[claveA]) hojaVaca.getRange(mapaV[claveA].r, mapaV[claveA].c).setValue(tipoCorto);
          }
          dV.setDate(dV.getDate() + 1);
        }
      }

      // ============================================================
      // 🚀 MOTOR B: "<año de la solicitud>_Calendario"
      // (antes '2026_Calendario' fijo: mismo problema que el Motor A)
      // ============================================================
      const nombreHojaCal = `${yearReq}_Calendario`;
      const hojaCal = ssPrincipal.getSheetByName(nombreHojaCal);
      if (!hojaCal) throw new Error(`No existe la pestaña ${nombreHojaCal}.`);

      const dataCal = hojaCal.getRange(1, 1, hojaCal.getLastRow(), hojaCal.getLastColumn()).getValues();
      let filaEmp = -1; let colMapeadas = {};

      // 1. Buscar Empleado
      for (let r = 0; r < dataCal.length; r++) {
        for (let c = 0; c < 5; c++) {
          if (String(dataCal[r][c] || "").trim() === nombre) { filaEmp = r + 1; break; }
        }
        if (filaEmp !== -1) break;
      }
      if (filaEmp === -1) throw new Error(`El empleado ${nombre} no está en ${nombreHojaCal}.`);

      // 2. Buscar fila de Meses y Días
      let filaMeses = -1; let filaDias = -1;
      for(let r = 0; r < 15; r++) {
         for(let c = 0; c < dataCal[0].length; c++) {
            let val = String(dataCal[r][c] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
            if(meses.some(m => val === m || val.includes(m))) { filaMeses = r; break; }
         }
         if(filaMeses !== -1) break;
      }
      if (filaMeses !== -1) {
        for(let r = filaMeses + 1; r <= filaMeses + 3; r++) {
           if (r >= dataCal.length) break;
           let numCount = 0;
           for(let c = 0; c < dataCal[0].length; c++) {
              let cell = dataCal[r][c];
              if (cell instanceof Date) {
                numCount++;
              } else {
                let v = parseInt(cell);
                if(!isNaN(v) && v >= 1 && v <= 31) numCount++;
              }
           }
           if(numCount >= 28) { filaDias = r; break; }
        }
      }
      if (filaMeses === -1 || filaDias === -1) throw new Error("No se pudo leer la fila de meses o días.");

      // 3. Mapeo de Fechas
      let mesAct = -1;
      for (let c = 0; c < dataCal[0].length; c++) {
        let celdaMes = String(dataCal[filaMeses][c] || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        if (meses.indexOf(celdaMes) !== -1) mesAct = meses.indexOf(celdaMes);

        if (mesAct !== -1) {
          let celdaDia = dataCal[filaDias][c];
          let dNum = -1;

          if (celdaDia instanceof Date) {
            dNum = celdaDia.getDate();
            mesAct = celdaDia.getMonth();
          } else {
            dNum = parseInt(celdaDia);
          }

          if (!isNaN(dNum) && dNum >= 1 && dNum <= 31) {
            let clave = `${yearReq}-${String(mesAct + 1).padStart(2,'0')}-${String(dNum).padStart(2,'0')}`;
            colMapeadas[clave] = c + 1;
          }
        }
      }

      // 4. Escribir
      let dC = new Date(fInicio);
      let pintados = 0;
      while (dC <= fFin) {
        if (dC.getDay() !== 0 && dC.getDay() !== 6) {
          let claveB = `${dC.getFullYear()}-${String(dC.getMonth() + 1).padStart(2,'0')}-${String(dC.getDate()).padStart(2,'0')}`;
          if (colMapeadas[claveB]) {
            hojaCal.getRange(filaEmp, colMapeadas[claveB]).setValue(tipoCorto);
            pintados++;
          }
        }
        dC.setDate(dC.getDate() + 1);
      }
      if (pintados === 0) throw new Error("Las fechas de la solicitud no existen en las columnas del Calendario.");

      // --- REGISTRO FINAL Y CORREOS ---
      hojaSol.getRange(filaActualizar, cEst + 1).setValue('APROBADA');

      // === SINCRONIZACIÓN CON GOOGLE CALENDAR ===
      // Se ejecuta UNA sola vez por solicitud (un solo evento all-day
      // que abarca todo el rango). Si falla, devuelve null y seguimos
      // sin romper la aprobación.
      const eventId = _crearEventoCalendarioAusencia(nombre, tipoCorto, fInicio, fFin, idSolicitud);

      let d2 = new Date(fInicio);
      while (d2 <= fFin) {
        if (d2.getDay() !== 0 && d2.getDay() !== 6) {
          hojaAprobadas.appendRow([nombre, new Date(d2), tipoCorto, idSolicitud, eventId || '']);
        }
        d2.setDate(d2.getDate() + 1);
      }
      if(emailEmpleado) {
        const bodyAprobado = `Hola <b>${nombre}</b>,<br><br>
        Nos complace informarte que tu solicitud de <b>${tipoCompleto}</b> ha sido <span style="color: #001391;"><b>APROBADA</b></span>.<br><br>
        <b>Detalles de la solicitud:</b><br>
        <ul>
          <li><b>Fecha de inicio:</b> ${strInicio}</li>
          <li><b>Fecha de fin:</b> ${strFin}</li>
        </ul><br>
        ¡Que tengas un buen día!<br><br>
        Tu equipo responsable.`;

        MailApp.sendEmail({
          to: emailEmpleado,
          subject: "✅ Solicitud APROBADA",
          htmlBody: bodyAprobado
        });
      }

    } else if (accion === 'RECHAZAR') {
      hojaSol.getRange(filaActualizar, cEst + 1).setValue('RECHAZADA');

      if(emailEmpleado) {
        const bodyRechazado = `Hola <b>${nombre}</b>,<br><br>
        Te informamos que tu solicitud de <b>${tipoCompleto}</b> ha sido <span style="color: #46536D;"><b>DENEGADA</b></span>.<br><br>
        <b>Detalles de la solicitud:</b><br>
        <ul>
          <li><b>Fecha de inicio:</b> ${strInicio}</li>
          <li><b>Fecha de fin:</b> ${strFin}</li>
        </ul><br>
        Si tienes alguna duda o necesitas más contexto, por favor contacta con tu responsable.<br><br>
        Un saludo.`;

        MailApp.sendEmail({
          to: emailEmpleado,
          subject: "❌ Solicitud DENEGADA",
          htmlBody: bodyRechazado
        });
      }
    }
    return { success: true };

  } catch(err) {
    try {
      if (filaActualizar !== -1) {
        hojaSol.getRange(filaActualizar, cEst + 1).setValue("ERROR: " + err.message);
      }
    } catch(e) {}

    return { success: false, message: err.message };
  }
}


// ------------------------------------------------------------
// 4. UTILIDADES
// ------------------------------------------------------------

function formatearFecha(fecha) {
  if (!(fecha instanceof Date)) return String(fecha);
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}-${d}`;
}

function forzarSincronizacionWeb() {
  try {
    ejecutarMigracionHistoricaV3();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}


// ------------------------------------------------------------
// 5. DIAGNÓSTICO MANUAL (opcional)
// ------------------------------------------------------------

/**
 * Función de prueba: ejecútala manualmente desde el editor de Apps
 * Script (Ejecutar → testCalendarioAusencias) para verificar que
 * tienes bien configurado el ID y los permisos antes de aprobar
 * una solicitud real. Crea un evento de prueba de mañana, te
 * loggea el resultado, y lo borra automáticamente.
 */
function testCalendarioAusencias() {
  if (!ID_CALENDARIO_AUSENCIAS || ID_CALENDARIO_AUSENCIAS.indexOf('PEGA_') === 0) {
    Logger.log('❌ ID_CALENDARIO_AUSENCIAS no está configurado. Edita la constante al principio del archivo.');
    return;
  }
  const cal = CalendarApp.getCalendarById(ID_CALENDARIO_AUSENCIAS);
  if (!cal) {
    Logger.log('❌ No se puede acceder al calendario con ID: ' + ID_CALENDARIO_AUSENCIAS);
    Logger.log('   Verifica que el ID es correcto y que la cuenta que ejecuta este script tiene permisos sobre ese calendario.');
    return;
  }
  Logger.log('✅ Calendario accesible. Nombre: "' + cal.getName() + '"');

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const eventId = _crearEventoCalendarioAusencia('PRUEBA - puede borrarse', 'VA', manana, manana, 'TEST-' + Date.now());

  if (!eventId) {
    Logger.log('❌ La función helper devolvió null. Mira logs anteriores para el motivo.');
    return;
  }
  Logger.log('✅ Evento de prueba creado correctamente. ID: ' + eventId);
  Logger.log('   Voy a borrarlo automáticamente en 3 segundos para no dejar basura...');
  Utilities.sleep(3000);
  try {
    const evt = cal.getEventById(eventId);
    if (evt) { evt.deleteEvent(); Logger.log('✅ Evento de prueba borrado. Todo listo.'); }
  } catch (e) {
    Logger.log('⚠ No pude borrarlo automáticamente. Hazlo a mano en el calendario. (' + e.message + ')');
  }
}
