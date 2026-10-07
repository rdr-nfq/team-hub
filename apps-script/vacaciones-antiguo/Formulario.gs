function alEnviarFormulario(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaForm = ss.getSheets()[0]; 
  const fila = e.range.getRow();
  
  // 1. Buscamos columnas dinámicamente
  const cabeceras = hojaForm.getRange(1, 1, 1, hojaForm.getLastColumn()).getValues()[0];
  let colEstado = -1, colID = -1, colEmail = 1, colTipo = -1, colIni = -1, colFin = -1;
  
  for (let c = 0; c < cabeceras.length; c++) {
    let t = String(cabeceras[c]).toUpperCase().trim();
    if (t === "ESTADO") colEstado = c + 1;
    if (t.includes("ID")) colID = c + 1;
    if (t.includes("CORREO") || t.includes("EMAIL")) colEmail = c;
    if (t.includes("TIPO")) colTipo = c;
    if (t.includes("INICIO")) colIni = c;
    if (t.includes("FIN")) colFin = c;
  }
  
  const idUnico = "REQ-" + new Date().getTime();
  if(colEstado !== -1) hojaForm.getRange(fila, colEstado).setValue("PENDIENTE");
  if(colID !== -1) hojaForm.getRange(fila, colID).setValue(idUnico);
  
  // 2. Extraer datos del envío
  const emailResp = e.values[colEmail] ? String(e.values[colEmail]).toLowerCase().trim() : "";
  const tipo = (colTipo !== -1 && e.values[colTipo]) ? String(e.values[colTipo]) : "Ausencia";
  let fechaInicio = (colIni !== -1 && e.values[colIni]) ? String(e.values[colIni]).split(" ")[0] : "-";
  let fechaFin = (colFin !== -1 && e.values[colFin]) ? String(e.values[colFin]).split(" ")[0] : "-";
  
  // 3. Buscar Nombre y Responsables en RDR
  const hojaRDR = ss.getSheetByName("RDR");
  let emailsPara = []; 
  let emailsCC = [];   
  let nombreEmpleado = "Compañero/a (" + emailResp + ")"; 
  
  if (hojaRDR) {
    const datosRDR = hojaRDR.getDataRange().getValues();
    for (let i = 1; i < datosRDR.length; i++) {
      let nombreFila = String(datosRDR[i][0]).trim();
      let emailFila = String(datosRDR[i][1]).toLowerCase().trim(); 
      // Limpiamos el rol para que sea texto "1" o "2" aunque venga como número 1.0
      let rolFila = String(datosRDR[i][2]).replace(".0", "").trim();
      
      if (emailFila === emailResp && nombreFila !== "") nombreEmpleado = nombreFila; 
      
      if (emailFila && emailFila.includes("@")) {
        if (rolFila === "2") {
          emailsPara.push(emailFila);
        } else if (rolFila === "1") {
          emailsCC.push(emailFila);
        }
      }
    }
  }
  
  // 4. Configurar y enviar correo
  const urlWeb = "https://script.google.com/a/macros/nfq.es/s/AKfycbw0Fl7SwR-jtV5iUdoVYj4CXhCVFlXUaSjw9g8b0Aem3WfUXLxLLAS_fKd6WDjj2Mo/exec"; 
  const asunto = `NUEVA SOLICITUD: ${tipo} - ${nombreEmpleado}`;
  const cuerpoHTML = `
    <div style="font-family: 'Inter', Arial, sans-serif; color: #1e293b; line-height: 1.6;">
      <h2 style="color: #3b82f6;">Nueva solicitud de vacaciones</h2>
      <p>Hola, tienes una nueva solicitud pendiente de revisar en el sistema:</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><b>Empleado:</b> ${nombreEmpleado}</p>
        <p style="margin: 5px 0;"><b>Tipo:</b> ${tipo}</p>
        <p style="margin: 5px 0;"><b>Periodo:</b> ${fechaInicio} hasta ${fechaFin}</p>
      </div>
      <a href="${urlWeb}" style="background-color: #3b82f6; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Abrir Panel de Aprobaciones</a>
      <p style="font-size: 12px; color: #64748b; margin-top: 30px;">Este es un correo automático generado por el Sistema RDR.</p>
    </div>
  `;
  
  // 5. Envío mediante GmailApp (más preciso con CC)
  if (emailsPara.length > 0 || emailsCC.length > 0) {
    let destinatarioPrincipal = emailsPara.length > 0 ? emailsPara.join(",") : emailsCC.join(",");
    let copiaOculta = emailsPara.length > 0 ? emailsCC.join(",") : "";
    
    let opciones = {
      htmlBody: cuerpoHTML
    };
    
    // Solo añadimos el CC si hay gente en la lista de Rol 1
    if (copiaOculta !== "") {
      opciones.cc = copiaOculta;
    }

    GmailApp.sendEmail(destinatarioPrincipal, asunto, "", opciones);
    
    // LOG DE CONTROL: Puedes ver esto en "Ejecuciones" del script
    Logger.log("Enviado a: " + destinatarioPrincipal);
    Logger.log("En CC a: " + copiaOculta);
  }
}