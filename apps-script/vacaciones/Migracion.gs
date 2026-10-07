const ID_EXCEL_PRINCIPAL = "1yCexnLp49FBu9f-g1Gf5glfz2UEFc4u_d0hzBgTnTmA";

function ejecutarMigracionHistoricaV3() {
  const ssAux = SpreadsheetApp.getActiveSpreadsheet();
  let hojaEquipo = ssAux.getSheetByName("Equipo");
  let hojaAprobadas = ssAux.getSheetByName("Ausencias Aprobadas");
  let hojaFestivos = ssAux.getSheetByName("Festivos");

  if (!hojaFestivos) hojaFestivos = ssAux.insertSheet("Festivos");

  // Limpiamos y añadimos la NUEVA columna "Activo"
  hojaEquipo.clear();
  hojaEquipo.appendRow(["Nombre", "Color", "Días Totales", "Días Consumidos", "Días Pendientes", "Activo"]);
  hojaEquipo.getRange("A1:F1").setFontWeight("bold").setBackground("#f1f5f9");

  hojaAprobadas.clear();
  hojaAprobadas.appendRow(["Nombre", "Fecha", "Tipo", "ID Solicitud"]);
  hojaAprobadas.getRange("A1:D1").setFontWeight("bold").setBackground("#f1f5f9");
  
  hojaFestivos.clear();
  hojaFestivos.appendRow(["Fecha", "Tipo (ES/MX/AMBOS)"]);
  hojaFestivos.getRange("A1:B1").setFontWeight("bold").setBackground("#f1f5f9");

  const ssPrincipal = SpreadsheetApp.openById(ID_EXCEL_PRINCIPAL);
  const hojaPrincipal = ssPrincipal.getSheetByName('Vacaciones 2026') || ssPrincipal.getSheets()[0];
  const data = hojaPrincipal.getDataRange().getValues();
  
  const numRows = data.length;
  const numCols = data[0].length;
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const yearMatch = hojaPrincipal.getName().match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

  let summaryHeaderRow = -1; let nameColSummary = -1; let pendCol = -1; let totCol = -1;
  for (let r = 0; r < Math.min(30, numRows); r++) {
    for (let c = 0; c < numCols; c++) {
      let val = String(data[r][c]).trim().toUpperCase();
      if (val === 'PERSONA') { summaryHeaderRow = r; nameColSummary = c; } 
      else if (val.includes('PENDIENTES')) { pendCol = c; } 
      else if (val.includes('TOTALES')) { totCol = c; }
    }
    if (summaryHeaderRow !== -1 && pendCol !== -1) break;
  }

  const summaryFontLines = hojaPrincipal.getRange(1, nameColSummary + 1, numRows, 1).getFontLines();
  const paleta = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
  let colorIndex = 0;
  let empleadosNombres = [];

  let equipoData = [];
  for (let r = summaryHeaderRow + 1; r < numRows; r++) {
    let name = String(data[r][nameColSummary]).trim();
    let nUpper = name.toUpperCase();
    let isBasura = !name || name === '0' || nUpper.includes('VACACIONES') || nUpper.includes('RDR') || nUpper === 'CAL' || nUpper.includes('FESTIVO') || nUpper === 'D' || nUpper === 'S';
    
    // AHORA MOGRAMOS A TODOS (Incluso tachados) PARA NO PERDER SUS FESTIVOS
    if (!isBasura && name.length > 4) {
      let isTachado = summaryFontLines[r][0] === 'line-through';
      let pend = pendCol !== -1 ? parseFloat(data[r][pendCol]) : 0;
      let tot = totCol !== -1 ? parseFloat(data[r][totCol]) : 0;
      let cons = tot - pend;
      
      let color = isTachado ? '#94a3b8' : paleta[colorIndex % paleta.length];
      // Añadimos el estado Activo (TRUE/FALSE) al final
      equipoData.push([name, color, isNaN(tot) ? 0 : tot, isNaN(cons) ? 0 : cons, isNaN(pend) ? 0 : pend, !isTachado]);
      empleadosNombres.push(name);
      if (!isTachado) colorIndex++;
    }
  }
  if(equipoData.length > 0) hojaEquipo.getRange(2, 1, equipoData.length, 6).setValues(equipoData);

  let ausenciasData = [];
  let festivosMap = {};

  for (let r = 0; r < numRows; r++) {
    let possibleMonthIdx = -1;
    for(let c = 0; c < 10; c++) {
       let val = data[r][c];
       let str = (val instanceof Date) ? meses[val.getMonth()] : String(val).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
       let idx = meses.indexOf(str);
       if (idx !== -1) { possibleMonthIdx = idx; break; }
    }

    if (possibleMonthIdx !== -1) {
       let daysFoundRow = -1;
       for (let dr = r; dr <= r + 3; dr++) { 
          if (dr >= numRows) break;
          let dayCount = 0;
          for (let dc = 0; dc < numCols; dc++) {
             let dVal = data[dr][dc];
             let num = (dVal instanceof Date) ? dVal.getDate() : parseInt(String(dVal).trim(), 10);
             if (num >= 1 && num <= 31) dayCount++;
          }
          if (dayCount >= 28) { daysFoundRow = dr; break; }
       }

       if (daysFoundRow !== -1) {
          let currentMonthMap = {}; 
          for (let dc = 0; dc < numCols; dc++) {
             let dVal = data[daysFoundRow][dc];
             let num = (dVal instanceof Date) ? dVal.getDate() : parseInt(String(dVal).trim(), 10);
             if (num >= 1 && num <= 31) {
                let mStr = String(possibleMonthIdx + 1).padStart(2, '0');
                let dStr = String(num).padStart(2, '0');
                let diaSemana = new Date(year, possibleMonthIdx, num).getDay();
                currentMonthMap[dc] = {
                  dateStr: `${year}-${mStr}-${dStr}`,
                  isWeekend: (diaSemana === 0 || diaSemana === 6)
                };
             }
          }
          
          for (let rowMes = daysFoundRow + 1; rowMes < daysFoundRow + 30; rowMes++) {
            if (rowMes >= numRows) break;
            
            let rowName = null;
            for (let c = 0; c < 10; c++) { 
               let name = String(data[rowMes][c]).trim();
               if (empleadosNombres.includes(name)) { rowName = name; break; }
            }

            if (rowName) {
              for (let c in currentMonthMap) {
                 let mark = String(data[rowMes][c]).trim().toUpperCase();
                 let dateInfo = currentMonthMap[c];
                 
                 if (mark === 'FE') {
                    let pais = rowName.toUpperCase().includes('LUIS ANTONIO') ? 'MX' : 'ES';
                    if (!festivosMap[dateInfo.dateStr]) festivosMap[dateInfo.dateStr] = pais;
                    else if (festivosMap[dateInfo.dateStr] !== pais) festivosMap[dateInfo.dateStr] = 'AMBOS';
                 }
                 else if (['VA', 'FO', 'ES', 'BA'].includes(mark)) {
                    if (!dateInfo.isWeekend) {
                      ausenciasData.push([rowName, dateInfo.dateStr, mark, "HISTORICO"]);
                    }
                 }
              }
            }
          }
       }
    }
  }
  
  if (ausenciasData.length > 0) hojaAprobadas.getRange(2, 1, ausenciasData.length, 4).setValues(ausenciasData);
  
  let festivosArray = [];
  for (let date in festivosMap) festivosArray.push([date, festivosMap[date]]);
  if (festivosArray.length > 0) hojaFestivos.getRange(2, 1, festivosArray.length, 2).setValues(festivosArray);

  return true;
}