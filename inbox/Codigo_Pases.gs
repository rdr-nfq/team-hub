/**
 * ============================================================================
 *  RDR Hub · Code.gs (versión optimizada)
 * ============================================================================
 *
 *  Cambios respecto a la versión anterior:
 *
 *  [LECTURA]
 *  - Cache de referencias a hojas a nivel de petición (SheetCtx), evita
 *    abrir el spreadsheet decenas de veces por endpoint.
 *  - Cache de datos crudos por hoja en la misma petición (los pases se leen
 *    una sola vez aunque varias funciones internas los necesiten).
 *  - CacheService:
 *      · "estáticos" (equipo / clientes / tipos): 6 h, ya existía. Se mantiene.
 *      · "dashboard:{fecha}": 60 s. Se invalida explícitamente en cada escritura
 *        que afecte a esa fecha. Conviene para reaperturas del HTML en frío.
 *
 *  [ESCRITURA]
 *  - Las mutaciones triviales (checks, mergeo, OK proyecto, SOM, cabecera,
 *    editar componente) devuelven solo "OK". El cliente ya hace cambios
 *    optimistas: no necesitamos devolver el dashboard completo.
 *  - actualizarOrdenCompleto: se acabaron los deleteRow en bucle. Borramos
 *    en bloque y reescribimos en un único setValues.
 *  - editarComponentesBatch: nuevo endpoint para guardar N componentes en
 *    una sola petición.
 *  - actualizarProbadoComponente: check "Probado" por componente (columna 10,
 *    antes el campo muerto "listoImplantar"). Bloquea el cierre de la
 *    preparación hasta que todos los componentes estén probados (validación
 *    en cliente, como el resto del validador de preparación).
 *  - actualizarOKProyecto: si el cliente nos manda la fila, no rastreamos
 *    la hoja entera.
 *
 *  [ESTRUCTURA]
 *  - SheetCtx encapsula spreadsheet + cache de hojas + cache de datos.
 *  - mutate(fecha, fn) ejecuta fn dentro del contexto e invalida cache
 *    de dashboard de esa fecha.
 *
 *  Compatibilidad: el contrato JSON (status / data / message) se mantiene.
 *  Todas las actions del cliente antiguo siguen funcionando.
 *
 * ============================================================================
 */

const CONSTANTES = {
  MODO_DEBUG: false, // fallback si ScriptProperties no está disponible — ver getModoDebug()
  BUZON_PRUEBAS_DEBUG: "pablo.llorentec.contractor@bbva.com",
  BUZON_DESARROLLOS: "desarrollos.nfq.rdr.group@bbva.com",
  HOJA_PASES:        "Pases_Calendados",
  HOJA_EQUIPO:       "Equipo RDR",
  HOJA_PARAM:        "Parametrizaciones",
  HOJA_PROYECTOS:    "Proyectos",
  HOJA_COMPONENTES:  "Componentes",
  HOJA_ORDEN:        "Orden_Ejecucion",
  HOJA_CLIENTES:     "Clientes BBVA",
};

/* ── Modo debug conmutable desde la web (solo admins) ──
   Con el modo debug activo, TODOS los correos (estados de fase y avisos
   programados de Avisos_Pases.gs) van al buzón de pruebas en vez de al
   equipo, con asunto [TEST]. Persistido en ScriptProperties para que lo
   compartan ambos scripts y sobreviva a los redespliegues. */
function getModoDebug() {
  try {
    const v = PropertiesService.getScriptProperties().getProperty("MODO_DEBUG");
    if (v !== null) return v === "1";
  } catch (_) {}
  return CONSTANTES.MODO_DEBUG;
}

function setModoDebug(val) {
  PropertiesService.getScriptProperties().setProperty("MODO_DEBUG", val ? "1" : "0");
  return "OK";
}

/* ─────────────────────────────────────────────────────────
   Utilidades
   ───────────────────────────────────────────────────────── */

function formatearFechaSegura(fechaObj) {
  if (!(fechaObj instanceof Date)) return String(fechaObj || "");
  return Utilities.formatDate(fechaObj, Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function parsearFechaEs(fechaStr) {
  // "dd/MM/yyyy" → Date, a las 12:00 (mediodía) y NO a medianoche.
  // A medianoche, si el huso horario del proyecto de Apps Script no coincide
  // exactamente con el del propio Sheets, la fecha puede caer justo al otro
  // lado de la frontera del día y guardarse el día ANTERIOR (p.ej. 11/09 en
  // vez del 12/09 sábado). Al mediodía ese margen de error (siempre < 12 h
  // entre husos horarios reales) nunca llega a cruzar la frontera del día.
  const p = String(fechaStr).split('/');
  return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]), 12, 0, 0);
}

/* SheetCtx: cache de hojas y de getDataRange por petición.
   Crear con new SheetCtx(); reutilizar para todas las lecturas/escrituras
   dentro del mismo doPost. */
function SheetCtx() {
  this.ss = SpreadsheetApp.getActiveSpreadsheet();
  this._sheets = {};
  this._data = {};
}
SheetCtx.prototype.sheet = function (name) {
  if (!this._sheets[name]) this._sheets[name] = this.ss.getSheetByName(name);
  return this._sheets[name];
};
SheetCtx.prototype.data = function (name) {
  // Lee la hoja UNA sola vez por petición.
  if (!this._data[name]) this._data[name] = this.sheet(name).getDataRange().getValues();
  return this._data[name];
};
SheetCtx.prototype.invalidar = function (name) { delete this._data[name]; };

/* ─────────────────────────────────────────────────────────
   Router HTTP
   ───────────────────────────────────────────────────────── */

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "ok", message: "API RDR Hub up" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doOptions(e) {
  return ContentService
    .createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Petición malformada: no hay body.");

    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const payload = body.payload || {};
    const ctx = new SheetCtx();
    let resultado;

    switch (action) {

      // ── Lecturas ────────────────────────────────────────
      case "obtenerDatosDashboard":
        resultado = obtenerDatosDashboard(ctx, payload.fecha);
        break;

      // ── Mutaciones estructurales (devuelven dashboard fresco) ──
      case "guardarNuevoProyecto":
        guardarNuevoProyecto(ctx, payload.fechaStr, payload.nombre, payload.feature, payload.respBBVA);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "agregarComponentesVacios":
        agregarComponentesVacios(ctx, payload.proy, payload.cantidadStr, payload.fechaStr);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "eliminarComponente":
        eliminarComponente(ctx, payload.fila);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "eliminarProyecto":
        eliminarProyecto(ctx, payload.fechaStr, payload.nombre);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "iniciarPase":
        iniciarPase(ctx, payload.fila, payload.fechaStr);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "responderEncuesta":
        responderEncuesta(ctx, payload.respuesta, payload.fila, payload.fechaStr);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "avanzarFase":
        avanzarFase(ctx, payload.fila, payload.fechaStr, payload.faseActual);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "activarEmergencia":
        activarEmergencia(ctx, payload.fila, payload.fechaStr);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "cancelarSubida":
        cancelarSubida(ctx, payload.fila, payload.fechaStr, payload.motivo, payload.faseAnterior);
        invalidarDashboard(payload.fechaStr);
        resultado = obtenerDatosDashboard(ctx, payload.fechaStr);
        break;
      case "notificarModificacion":
        resultado = notificarModificacion(ctx, payload.fila, payload.fechaStr, payload.comentario);
        break;

      // ── Mutaciones ligeras (solo "OK"; cliente ya hace optimismo) ──
      case "guardarCabecera":
        resultado = guardarCabecera(ctx, payload.fila, payload.crq, payload.lider, payload.aprende, payload.instTecnica);
        invalidarDashboardPorFila(ctx, payload.fila);
        break;
      case "actualizarChecksPre":
        resultado = actualizarChecksPre(ctx, payload.fila, payload.checks);
        invalidarDashboardPorFila(ctx, payload.fila);
        break;
      case "actualizarOKProyecto":
        resultado = actualizarOKProyecto(ctx, payload.fechaStr, payload.nombre, payload.val);
        invalidarDashboard(payload.fechaStr);
        break;
      case "actualizarIdTraspaso":
        resultado = actualizarIdTraspaso(ctx, payload.fechaStr, payload.nombre, payload.idTraspaso);
        invalidarDashboard(payload.fechaStr);
        break;
      case "actualizarCorreoAns":
        resultado = actualizarCorreoAns(ctx, payload.fechaStr, payload.nombre, payload.val);
        invalidarDashboard(payload.fechaStr);
        break;
      case "editarComponente":
        resultado = editarComponente(ctx, payload.fila, payload.nom, payload.tipo, payload.subida, payload.resp, payload.cod, payload.us, payload.releaseCheck, payload.com);
        // No conocemos la fecha del componente sin lookup → no invalidamos por fecha aquí.
        break;
      case "editarComponentesBatch":
        // Nuevo: payload = { changes: [ {fila, nom, tipo, subida, resp, cod, us, releaseCheck, com}, ... ] }
        resultado = editarComponentesBatch(ctx, payload.changes || []);
        break;
      case "actualizarMergeComponente":
        resultado = actualizarMergeComponente(ctx, payload.fila, payload.val);
        break;
      case "actualizarProbadoComponente":
        resultado = actualizarProbadoComponente(ctx, payload.fila, payload.val);
        break;
      case "setModoDebug":
        resultado = setModoDebug(!!payload.val);
        if (payload.fechaStr) invalidarDashboard(payload.fechaStr);
        break;
      case "actualizarOrdenCompleto":
        resultado = actualizarOrdenCompleto(ctx, payload.fechaStr, payload.elementos);
        invalidarDashboard(payload.fechaStr);
        break;
      case "actualizarCheckOrden":
        resultado = actualizarCheckOrden(ctx, payload.fila, payload.val);
        break;
      case "actualizarSomOrden":
        resultado = actualizarSomOrden(ctx, payload.fila, payload.val);
        break;
      case "debugTotal":
        resultado = debugTotal(ctx);
        try { CacheService.getScriptCache().removeAll(["RDR_Hub_Estaticos"]); } catch (_) {}
        break;

      default:
        throw new Error("Acción desconocida: " + action);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success", data: resultado }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ─────────────────────────────────────────────────────────
   Cache de dashboard por fecha (60 s)
   ───────────────────────────────────────────────────────── */

function invalidarDashboard(fechaStr) {
  if (!fechaStr) return;
  try { CacheService.getScriptCache().remove("dash:" + fechaStr); } catch (_) {}
}
function invalidarDashboardPorFila(ctx, filaPase) {
  // Cuando solo conocemos la fila del pase (cabecera, checksPre…), miramos su fecha y la invalidamos.
  try {
    if (!filaPase || filaPase < 2) return;
    const dFecha = ctx.sheet(CONSTANTES.HOJA_PASES).getRange(filaPase, 1).getValue();
    invalidarDashboard(formatearFechaSegura(dFecha));
  } catch (_) {}
}

/* ─────────────────────────────────────────────────────────
   Lectura principal: obtenerDatosDashboard
   ───────────────────────────────────────────────────────── */

function obtenerDatosDashboard(ctx, fechaRequerida) {
  try {
    // Si el cliente pasa una fecha concreta y la cache del dashboard la tiene fresca, devolvemos
    if (fechaRequerida) {
      const cached = CacheService.getScriptCache().get("dash:" + fechaRequerida);
      if (cached) {
        try { return JSON.parse(cached); } catch (_) {}
      }
    }

    const cache = CacheService.getScriptCache();
    // v3: invalidamos cache anterior porque ahora incluimos listadoRules.
    const cacheKeyEst = "RDR_Hub_Estaticos_v3";
    let equipo, clientes, tiposComp, tiposSubida, schemaPorSubida, listadoRules;

    // ── Estáticos: equipo / clientes / tipos / schemas / rules. Cache 6 h ──
    const cachedEst = cache.get(cacheKeyEst);
    if (cachedEst) {
      const parsed = JSON.parse(cachedEst);
      equipo = parsed.equipo; clientes = parsed.clientes;
      tiposComp = parsed.tiposComp; tiposSubida = parsed.tiposSubida;
      schemaPorSubida = parsed.schemaPorSubida || {};
      listadoRules = parsed.listadoRules || [];
    } else {
      equipo   = ctx.data(CONSTANTES.HOJA_EQUIPO   ).slice(1).map(r => r[0] + " " + r[1]);
      clientes = ctx.data(CONSTANTES.HOJA_CLIENTES ).slice(1).map(r => r[0]);
      const param = ctx.data(CONSTANTES.HOJA_PARAM);
      tiposComp = []; tiposSubida = []; schemaPorSubida = {}; listadoRules = [];
      for (let i = 1; i < param.length; i++) {
        if (param[i][0]) tiposComp.push(param[i][0]);
        if (param[i][1]) {
          const sub = String(param[i][1]).trim();
          tiposSubida.push(sub);
          // Schema en la columna 3 (índice 2). Vacío = sin validación para ese tipo.
          const schema = param[i][2] ? String(param[i][2]).trim() : "";
          if (sub && schema) schemaPorSubida[sub] = schema;
        }
        // Listado Rules en la columna 5 (índice 4). Excepciones a la regla "rdrRules → Streetref".
        if (param[i][4]) listadoRules.push(String(param[i][4]).trim());
      }
      cache.put(cacheKeyEst, JSON.stringify({ equipo, clientes, tiposComp, tiposSubida, schemaPorSubida, listadoRules }), 21600);
    }

    // ── Pases ──
    const pases = ctx.data(CONSTANTES.HOJA_PASES);
    const listaFechas = [];
    let paseEncontrado = null, filaPase = -1, fechaFinalStr = "";
    const hoyLimpio = new Date().setHours(0, 0, 0, 0);

    for (let i = 1; i < pases.length; i++) {
      const dP = pases[i][0]; if (!dP) continue;
      const fStr = formatearFechaSegura(dP);
      listaFechas.push(fStr);
      const dPLimpio = new Date(dP).getTime();

      if (fechaRequerida) {
        if (fStr === fechaRequerida) { paseEncontrado = pases[i]; filaPase = i + 1; fechaFinalStr = fStr; }
      } else {
        if (dPLimpio >= hoyLimpio && filaPase === -1) { paseEncontrado = pases[i]; filaPase = i + 1; fechaFinalStr = fStr; }
      }
    }
    if (!paseEncontrado) {
      paseEncontrado = pases[1];
      filaPase = 2;
      fechaFinalStr = formatearFechaSegura(pases[1][0]);
    }

    // ── Proyectos y componentes ──
    const allProys = ctx.data(CONSTANTES.HOJA_PROYECTOS);
    const proys = []; const proysFila = [];
    for (let i = 1; i < allProys.length; i++) {
      if (formatearFechaSegura(allProys[i][0]) === fechaFinalStr) { proys.push(allProys[i]); proysFila.push(i + 1); }
    }

    // Conjunto de nombres de proyecto de ESTA fecha (para asignar huérfanos).
    const nombresDeEstaFecha = new Set(proys.map(p => p[1]));

    // Componentes: identificador de proyecto = (Fecha del Pase, Nombre).
    // Columna 0 = Nombre, columna 11 (índice 11) = Fecha del Pase (NUEVO).
    // Compatibilidad: filas sin fecha en columna 11 son datos "viejos" y solo se
    // asignan al proyecto si su nombre coincide con un proyecto de esta fecha
    // Y NO existe el mismo nombre en otra fecha (para no duplicarlos).
    const allComps = ctx.data(CONSTANTES.HOJA_COMPONENTES);
    const compsByProy = {};
    // Pre-cálculo: nombres de proyecto que aparecen en >1 fecha (en hoja Proyectos).
    const nombresPorFecha = {};
    for (let i = 1; i < allProys.length; i++) {
      const f = formatearFechaSegura(allProys[i][0]);
      const n = allProys[i][1];
      if (!f || !n) continue;
      nombresPorFecha[n] = nombresPorFecha[n] || new Set();
      nombresPorFecha[n].add(f);
    }

    for (let i = 1; i < allComps.length; i++) {
      const c = allComps[i];
      const proy = c[0];
      if (!proy) continue;
      const fechaComp = c[11] ? formatearFechaSegura(c[11]) : "";

      // Regla 1: si la fila tiene fecha, debe coincidir con la actual.
      if (fechaComp) {
        if (fechaComp !== fechaFinalStr) continue;
      } else {
        // Regla 2 (fallback huérfano): no hay fecha en el componente.
        // Solo lo asignamos si el nombre del proyecto SOLO existe en esta fecha
        // (sin ambigüedad). Si el mismo nombre existe en varias fechas, dejamos
        // el componente huérfano sin asignar para evitar duplicar.
        if (!nombresDeEstaFecha.has(proy)) continue;
        const fechasConEseNombre = nombresPorFecha[proy] || new Set();
        if (fechasConEseNombre.size > 1) continue; // ambiguo
      }

      if (!compsByProy[proy]) compsByProy[proy] = [];
      compsByProy[proy].push({
        fila: i + 1,
        nombre: c[1], tipo: c[2], subida: c[3], resp: c[4],
        codigo: c[5], us: c[6], release: c[7],
        mergeado: c[8] || false,
        // Columna 10 (índice 9): "Probado". Antes era el campo muerto
        // "listoImplantar"; se reutiliza como check de pruebas del componente.
        probado: c[9] || false,
        comentarios: c[10] || ""
      });
    }

    const proyectosList = proys.map((p, idx) => ({
      fila: proysFila[idx],
      nombre: p[1], feature: p[2], cliente: p[3], ok: p[4],
      // Columnas nuevas (F=ID Traspaso, G=Correo ANS Enviado). Vacías si la hoja
      // no se ha migrado todavía — se pintan como "sin definir" en el cliente.
      idTraspaso: p[5] || "",
      correoAns: p[6] === true || String(p[6]).toUpperCase() === "TRUE" || String(p[6]).toUpperCase() === "VERDADERO",
      componentes: compsByProy[p[1]] || []
    }));

    // ── Orden de ejecución ──
    const allOrden = ctx.data(CONSTANTES.HOJA_ORDEN);
    const orden = [];
    for (let i = 1; i < allOrden.length; i++) {
      const r = allOrden[i];
      if (formatearFechaSegura(r[0]) === fechaFinalStr) {
        orden.push({ fila: i + 1, orden: r[1], elemento: r[2], implantado: r[3], som: r[4] || "" });
      }
    }
    // Reindexar fila lógica 1..N (compatibilidad con cliente que usa o.fila como índice secuencial)
    orden.forEach((o, i) => o.fila = i + 1);

    // ── Checks pre ──
    const pC = (val) => {
      if (val === "NA") return { aplica: "NA", ok: false };
      if (val === "OK" || val === true) return { aplica: "APLICA", ok: true };
      return { aplica: "APLICA", ok: false };
    };

    const result = {
      fechasDisponibles: listaFechas,
      fechaSeleccionada: fechaFinalStr,
      fila: filaPase,
      subimos: paseEncontrado[1] || "",
      faseActual: (paseEncontrado[2] && paseEncontrado[2] !== "") ? paseEncontrado[2] : "PENDIENTE",
      crq: paseEncontrado[3] || "",
      liderar: paseEncontrado[4] || "",
      aprender: paseEncontrado[5] || "",
      instTecnica: paseEncontrado[12] || false,
      checksPre: {
        dpPro:     pC(paseEncontrado[6]),
        jiraOk:    pC(paseEncontrado[7]),
        remOk:     pC(paseEncontrado[8]),
        docPruebas: pC(paseEncontrado[9]),
        traspaso:  pC(paseEncontrado[10]),
      },
      equipo, clientes, tiposComp, tiposSubida, schemaPorSubida, listadoRules,
      proyectos: proyectosList,
      ordenPase: orden,
      modoDebug: getModoDebug(),
    };

    // Cacheamos el resultado del dashboard 60 s
    try { CacheService.getScriptCache().put("dash:" + fechaFinalStr, JSON.stringify(result), 60); } catch (_) {}
    return result;

  } catch (e) {
    return { error: e.message };
  }
}

/* ─────────────────────────────────────────────────────────
   Escrituras
   ───────────────────────────────────────────────────────── */

function guardarNuevoProyecto(ctx, fechaStr, nombre, feature, respBBVA) {
  const d = parsearFechaEs(fechaStr);
  const sheet = ctx.sheet(CONSTANTES.HOJA_PROYECTOS);
  asegurarColumnasProyectos(sheet); // F=ID Traspaso, G=Correo ANS
  // Cols: fecha, nombre, feature, cliente, ok, idTraspaso, correoAns
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 7).setValues([[d, nombre, feature, respBBVA, false, "", false]]);
  ctx.invalidar(CONSTANTES.HOJA_PROYECTOS);
  return "OK";
}

/* ── Notificación de modificación tras el cierre de la preparación ──
   Con el pase ya cerrado, la web permite un modo edición puntual; al
   terminar se envía este correo a todo el equipo con el comentario. */
function notificarModificacion(ctx, fila, fechaStr, comentario) {
  const seguro = String(comentario || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  let extraHtml = "";
  try { extraHtml = construirResumenPaquetesHtml(ctx, fechaStr); } catch (_) {}
  const html = htmlCorreoEstado({
    tono: "warning",
    titulo: "Pase modificado tras el cierre",
    parrafos: [
      "Se ha modificado el pase después de cerrar la preparación. Revisad los cambios en la web.",
      "<strong>Comentario:</strong> «" + (seguro || "sin comentario") + "»",
    ],
    extraHtml: extraHtml,
    fechaPase: fechaStr,
  });
  enviarCorreoSeguro(ctx, "[MODIFICADO] Pase modificado tras el cierre", html, fechaStr, fila, false);
  return "OK";
}

/* Migración suave para hoja Proyectos: cabeceras F (ID Traspaso) y G (Correo ANS). */
function asegurarColumnasProyectos(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 6 || !String(sheet.getRange(1, 6).getValue() || "").toLowerCase().includes("traspaso")) {
    sheet.getRange(1, 6).setValue("ID Traspaso");
  }
  if (lastCol < 7 || !String(sheet.getRange(1, 7).getValue() || "").toLowerCase().includes("ans")) {
    sheet.getRange(1, 7).setValue("Correo ANS Enviado");
  }
}

function agregarComponentesVacios(ctx, proy, cantidadStr, fechaStr) {
  const cantidad = parseInt(cantidadStr);
  const sheet = ctx.sheet(CONSTANTES.HOJA_COMPONENTES);
  // Asegurar que la hoja tiene la columna 12 ("Fecha del Pase") como cabecera.
  // Si no la tiene, la añadimos (migración suave; idempotente).
  asegurarColumnaFechaComponentes(sheet);
  asegurarColumnaProbado(sheet);

  // Convertimos fecha string a Date para meterla en la columna 12.
  const d = fechaStr ? parsearFechaEs(fechaStr) : "";
  const rows = [];
  for (let i = 0; i < cantidad; i++) {
    // Cols: nombreProy, nombre, tipo, subida, resp, codigo, us, release, mergeado, probado, comentarios, fechaPase
    rows.push([proy, "", "", "", "", "", "", false, false, false, "", d]);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, cantidad, 12).setValues(rows);
  ctx.invalidar(CONSTANTES.HOJA_COMPONENTES);
  return "OK";
}

/* Migración suave: asegura que la hoja Componentes tiene la columna 12
   con cabecera "Fecha del Pase". Idempotente — si ya existe, no hace nada. */
function asegurarColumnaFechaComponentes(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol >= 12) {
    const header = sheet.getRange(1, 12).getValue();
    if (header && String(header).toLowerCase().includes("fecha")) return; // ya existe
  }
  sheet.getRange(1, 12).setValue("Fecha del Pase");
}

function guardarCabecera(ctx, fila, crq, lider, aprende, instTecnica) {
  // Una sola escritura en vez de 4 setValue independientes (1 round-trip al spreadsheet)
  const sheet = ctx.sheet(CONSTANTES.HOJA_PASES);
  sheet.getRange(fila, 4, 1, 3).setValues([[crq, lider, aprende]]);
  sheet.getRange(fila, 13).setValue(instTecnica);
  return "OK";
}

function actualizarChecksPre(ctx, fila, checks) {
  // 4 checks fijos (cols 7..10). El antiguo "traspaso" (col 11) ya no se gestiona
  // desde aquí — ahora es un check por proyecto (col G de hoja Proyectos).
  // No tocamos la col 11 para no perder histórico de pases ya cerrados.
  const eC = c => c.aplica === 'NA' ? 'NA' : (c.ok ? 'OK' : 'PENDIENTE');
  ctx.sheet(CONSTANTES.HOJA_PASES).getRange(fila, 7, 1, 4).setValues([[
    eC(checks.dpPro), eC(checks.jiraOk), eC(checks.remOk), eC(checks.docPruebas)
  ]]);
  return "OK";
}

function actualizarOKProyecto(ctx, fechaStr, nombre, val) {
  // Lectura indexada en vez de barrido completo.
  const sheet = ctx.sheet(CONSTANTES.HOJA_PROYECTOS);
  const data = ctx.data(CONSTANTES.HOJA_PROYECTOS);
  for (let i = 1; i < data.length; i++) {
    if (formatearFechaSegura(data[i][0]) === fechaStr && data[i][1] === nombre) {
      sheet.getRange(i + 1, 5).setValue(val);
      return "OK";
    }
  }
  return "OK";
}

/* Valida que un ID de Traspaso empiece por YYYY- (4 dígitos + guion).
   Vacío = válido (el usuario puede dejarlo para después en la entrada).
   La obligatoriedad para cambiar de fase se valida aparte. */
function validarIdTraspaso(idTraspaso) {
  const t = (idTraspaso || "").trim();
  if (!t) return null;
  if (!/^\d{4}-/.test(t)) return 'El ID de Traspaso "' + t + '" debe empezar por "YYYY-" (4 dígitos y un guion).';
  return null;
}

function actualizarIdTraspaso(ctx, fechaStr, nombre, idTraspaso) {
  const err = validarIdTraspaso(idTraspaso);
  if (err) throw new Error(err);

  const sheet = ctx.sheet(CONSTANTES.HOJA_PROYECTOS);
  asegurarColumnasProyectos(sheet);
  const data = ctx.data(CONSTANTES.HOJA_PROYECTOS);
  for (let i = 1; i < data.length; i++) {
    if (formatearFechaSegura(data[i][0]) === fechaStr && data[i][1] === nombre) {
      sheet.getRange(i + 1, 6).setValue(idTraspaso || "");
      ctx.invalidar(CONSTANTES.HOJA_PROYECTOS);
      return "OK";
    }
  }
  throw new Error("Proyecto no encontrado: " + nombre);
}

function actualizarCorreoAns(ctx, fechaStr, nombre, val) {
  const sheet = ctx.sheet(CONSTANTES.HOJA_PROYECTOS);
  asegurarColumnasProyectos(sheet);
  const data = ctx.data(CONSTANTES.HOJA_PROYECTOS);
  for (let i = 1; i < data.length; i++) {
    if (formatearFechaSegura(data[i][0]) === fechaStr && data[i][1] === nombre) {
      sheet.getRange(i + 1, 7).setValue(!!val);
      ctx.invalidar(CONSTANTES.HOJA_PROYECTOS);
      return "OK";
    }
  }
  throw new Error("Proyecto no encontrado: " + nombre);
}

/* Lee el mapa Subida → Schema. Usa cache si disponible, si no relee Parametrizaciones.
   Se invoca en cada validación de escritura, así que se mantiene barato. */
function obtenerSchemaPorSubida(ctx) {
  try {
    const cached = CacheService.getScriptCache().get("RDR_Hub_Estaticos_v2");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.schemaPorSubida) return parsed.schemaPorSubida;
    }
  } catch (_) {}
  // Fallback: leer Parametrizaciones directamente.
  const map = {};
  const param = ctx.data(CONSTANTES.HOJA_PARAM);
  for (let i = 1; i < param.length; i++) {
    if (param[i][1] && param[i][2]) {
      map[String(param[i][1]).trim()] = String(param[i][2]).trim();
    }
  }
  return map;
}

/* Valida que `cod` empiece por el schema correspondiente al Tipo de Subida.
   Si subida no tiene schema definido → no validamos (devuelve null).
   Si cod está vacío → no validamos (un componente puede no tener código aún).
   Si discrepa → devuelve mensaje de error. Si todo OK → devuelve null. */
function validarSchemaCod(schemaPorSubida, subida, cod) {
  if (!cod || String(cod).trim() === "" || String(cod).trim() === "-") return null;
  const sub = (subida || "").trim();
  if (!sub) return null;
  const schema = schemaPorSubida[sub];
  if (!schema) return null; // tipo de subida sin schema parametrizado → no se valida
  const codTrim = String(cod).trim();
  if (codTrim.toUpperCase().indexOf(schema.toUpperCase()) === 0) return null;
  return "El código \"" + codTrim + "\" no cumple el schema para subida \"" + sub + "\". Debe empezar por \"" + schema + "\".";
}

function editarComponente(ctx, fila, nom, tipo, subida, resp, cod, us, releaseCheck, com) {
  // Validación de Schema (bloqueante)
  const schemas = obtenerSchemaPorSubida(ctx);
  const err = validarSchemaCod(schemas, subida, cod);
  if (err) throw new Error(err);

  // Una única setValues para columnas 2..8, una para columna 11 (comentarios).
  const h = ctx.sheet(CONSTANTES.HOJA_COMPONENTES);
  h.getRange(fila, 2, 1, 7).setValues([[nom, tipo, subida, resp, cod, us, !!releaseCheck]]);
  h.getRange(fila, 11).setValue(com || "");
  return "OK";
}

/* Batch: valida TODOS los cambios antes de escribir ninguno (transaccional al menos a nivel de validación). */
function editarComponentesBatch(ctx, changes) {
  if (!changes || !changes.length) return "OK";
  const schemas = obtenerSchemaPorSubida(ctx);
  // 1. Validar todo primero
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i];
    const err = validarSchemaCod(schemas, c.subida, c.cod);
    if (err) throw new Error("Fila " + c.fila + ": " + err);
  }
  // 2. Si todo válido, escribir
  const h = ctx.sheet(CONSTANTES.HOJA_COMPONENTES);
  changes.forEach(c => {
    h.getRange(c.fila, 2, 1, 7).setValues([[
      c.nom || "", c.tipo || "", c.subida || "", c.resp || "", c.cod || "", c.us || "", !!c.releaseCheck
    ]]);
    h.getRange(c.fila, 11).setValue(c.com || "");
  });
  return { status: "OK", n: changes.length };
}

function eliminarComponente(ctx, fila) {
  ctx.sheet(CONSTANTES.HOJA_COMPONENTES).deleteRow(fila);
  ctx.invalidar(CONSTANTES.HOJA_COMPONENTES);
  return "OK";
}

/* Elimina un proyecto + todos sus componentes asociados a ESTA fecha.
   Aplica la misma regla de identificación (fecha + nombre) usada en lectura.
   Borra de abajo arriba para no invalidar índices intermedios. */
function eliminarProyecto(ctx, fechaStr, nombre) {
  // 1. Localizar la fila del proyecto en hoja Proyectos
  const hProy = ctx.sheet(CONSTANTES.HOJA_PROYECTOS);
  const dataProy = ctx.data(CONSTANTES.HOJA_PROYECTOS);
  let filaProy = -1;
  for (let i = 1; i < dataProy.length; i++) {
    if (formatearFechaSegura(dataProy[i][0]) === fechaStr && dataProy[i][1] === nombre) {
      filaProy = i + 1; break;
    }
  }
  if (filaProy < 0) throw new Error("Proyecto no encontrado: " + nombre);

  // 2. Localizar todas las filas de componentes de este proyecto
  //    (mismas reglas que en obtenerDatosDashboard para no romper datos antiguos)
  const dataComp = ctx.data(CONSTANTES.HOJA_COMPONENTES);
  // Pre-cálculo de nombres repetidos entre fechas (para la regla de huérfanos)
  const nombresPorFecha = {};
  for (let i = 1; i < dataProy.length; i++) {
    const f = formatearFechaSegura(dataProy[i][0]);
    const n = dataProy[i][1];
    if (!f || !n) continue;
    (nombresPorFecha[n] = nombresPorFecha[n] || new Set()).add(f);
  }
  const fechasConEseNombre = nombresPorFecha[nombre] || new Set();

  const filasABorrar = [];
  for (let i = 1; i < dataComp.length; i++) {
    const c = dataComp[i];
    if (c[0] !== nombre) continue;
    const fechaComp = c[11] ? formatearFechaSegura(c[11]) : "";
    if (fechaComp) {
      if (fechaComp === fechaStr) filasABorrar.push(i + 1);
    } else {
      // Huérfano: solo lo borramos si no hay ambigüedad de nombre.
      if (fechasConEseNombre.size <= 1) filasABorrar.push(i + 1);
    }
  }

  // 3. Borrar componentes de abajo arriba
  const hComp = ctx.sheet(CONSTANTES.HOJA_COMPONENTES);
  filasABorrar.sort((a, b) => b - a).forEach(r => hComp.deleteRow(r));

  // 4. Borrar la fila del proyecto
  hProy.deleteRow(filaProy);

  ctx.invalidar(CONSTANTES.HOJA_PROYECTOS);
  ctx.invalidar(CONSTANTES.HOJA_COMPONENTES);
  return "OK";
}

function actualizarMergeComponente(ctx, fila, val) {
  ctx.sheet(CONSTANTES.HOJA_COMPONENTES).getRange(fila, 9).setValue(val);
  return "OK";
}

/* Check "Probado" de un componente (columna 10, antes "listoImplantar"). */
function actualizarProbadoComponente(ctx, fila, val) {
  const sheet = ctx.sheet(CONSTANTES.HOJA_COMPONENTES);
  asegurarColumnaProbado(sheet);
  sheet.getRange(fila, 10).setValue(!!val);
  return "OK";
}

/* Migración suave: renombra la cabecera de la columna 10 a "Probado".
   La columna ya existe (antes contenía el campo muerto "listoImplantar");
   solo actualizamos el nombre para que la hoja sea autoexplicativa. Idempotente. */
function asegurarColumnaProbado(sheet) {
  const header = sheet.getRange(1, 10).getValue();
  if (String(header).trim() !== "Probado") sheet.getRange(1, 10).setValue("Probado");
}

/* Reescritura completa del orden, optimizada:
   - Antes: deleteRow en bucle (cada delete dispara recálculo del spreadsheet).
   - Ahora: identifica el rango contiguo de filas con esta fecha y lo limpia/sobrescribe
     de una sola pasada. Si hay menos filas nuevas que viejas, limpia el sobrante. */
function actualizarOrdenCompleto(ctx, fechaStr, elementos) {
  const hOrden = ctx.sheet(CONSTANTES.HOJA_ORDEN);
  const data = ctx.data(CONSTANTES.HOJA_ORDEN);

  // Detectar filas existentes con esta fecha
  const filasExist = [];
  for (let i = 1; i < data.length; i++) {
    if (formatearFechaSegura(data[i][0]) === fechaStr) filasExist.push(i + 1);
  }

  const dObj = parsearFechaEs(fechaStr);
  const nuevasRows = (elementos || []).map((el, i) => [dObj, i + 1, el.elemento, false, el.som || ""]);

  if (filasExist.length === 0 && nuevasRows.length === 0) return "OK";

  if (filasExist.length === 0) {
    // Solo append
    hOrden.getRange(hOrden.getLastRow() + 1, 1, nuevasRows.length, 5).setValues(nuevasRows);
  } else {
    // Sobrescribir desde la primera fila existente
    const firstRow = filasExist[0];
    const overlap = Math.min(filasExist.length, nuevasRows.length);
    if (overlap > 0) {
      hOrden.getRange(firstRow, 1, overlap, 5).setValues(nuevasRows.slice(0, overlap));
    }
    // Limpiar filas sobrantes (si nuevasRows es más corto)
    if (filasExist.length > nuevasRows.length) {
      const toDelete = filasExist.slice(nuevasRows.length).reverse(); // borramos de abajo arriba
      toDelete.forEach(r => hOrden.deleteRow(r));
    }
    // Append filas nuevas adicionales (si nuevasRows es más largo)
    if (nuevasRows.length > filasExist.length) {
      const extra = nuevasRows.slice(filasExist.length);
      hOrden.getRange(hOrden.getLastRow() + 1, 1, extra.length, 5).setValues(extra);
    }
  }

  ctx.invalidar(CONSTANTES.HOJA_ORDEN);
  return "OK";
}

function actualizarCheckOrden(ctx, fila, val) {
  ctx.sheet(CONSTANTES.HOJA_ORDEN).getRange(fila, 4).setValue(val);
  return "OK";
}

function actualizarSomOrden(ctx, fila, val) {
  ctx.sheet(CONSTANTES.HOJA_ORDEN).getRange(fila, 5).setValue(val);
  return "OK";
}

function debugTotal(ctx) {
  // BLOQUEO DE SEGURIDAD: Solo funciona si MODO_DEBUG es true
  if (!CONSTANTES.MODO_DEBUG) {
    throw new Error("Acción denegada: El modo DEBUG está desactivado. No se puede borrar la base de datos en Producción.");
  }

  [CONSTANTES.HOJA_PROYECTOS, CONSTANTES.HOJA_COMPONENTES, CONSTANTES.HOJA_ORDEN].forEach(n => {
    const h = ctx.sheet(n);
    if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, h.getLastColumn()).clearContent();
  });
  
  const hP = ctx.sheet(CONSTANTES.HOJA_PASES);
  if (hP.getLastRow() > 1) hP.getRange(2, 2, hP.getLastRow() - 1, 12).clearContent();
  
  return "EXCEL RESETEADO CON ÉXITO";
}

/* ─────────────────────────────────────────────────────────
   Estados mayores
   ───────────────────────────────────────────────────────── */

function iniciarPase(ctx, fila, fechaStr) {
  ctx.sheet(CONSTANTES.HOJA_PASES).getRange(fila, 3).setValue("FASE_1_ENCUESTA");
  const html = htmlCorreoEstado({
    tono: "informativo",
    titulo: "Pase calendado abierto",
    parrafos: [
      "Se ha abierto el pase en el sistema RDR Hub.",
      "Confirmad si vuestros proyectos suben rellenando la encuesta en la web."
    ],
    fechaPase: fechaStr,
  });
  enviarCorreoSeguro(ctx, "[INICIO] PASE CALENDADO", html, fechaStr, fila, true);
  return "OK";
}

function responderEncuesta(ctx, r, fila, fechaStr) {
  ctx.sheet(CONSTANTES.HOJA_PASES).getRange(fila, 2, 1, 2).setValues([[
    r, r === "SI" ? "FASE_2_3_PREPARACION" : "FASE_0_DESCANSO"
  ]]);
  const conSubida = r === "SI";
  const html = htmlCorreoEstado({
    tono: conSubida ? "informativo" : "recordatorio",
    titulo: conSubida ? "Subida confirmada" : "Sin subida en este pase",
    parrafos: conSubida
      ? ["Iniciamos la preparación de componentes y OKs en la web."]
      : ["Esta semana no nos toca subir nada. Disfrutad de la tranquilidad."],
    fechaPase: fechaStr,
  });
  enviarCorreoSeguro(ctx, conSubida ? "[OK] SUBIDA CONFIRMADA" : "[CANCELADO] NO HAY SUBIDA",
    html, fechaStr, fila, false);
  return "OK";
}

function avanzarFase(ctx, fila, fechaStr, faseActual) {
  let nuevaFase = "";
  if      (faseActual === "FASE_2_3_PREPARACION") nuevaFase = "FASE_4_CERRADO";
  else if (faseActual === "FASE_4_CERRADO")        nuevaFase = "FASE_6_IMPLANTACION";
  else if (faseActual === "FASE_6_IMPLANTACION")   nuevaFase = "FASE_7_POST";
  else if (faseActual === "FASE_7_POST")           nuevaFase = "COMPLETADO";

  // Validación: para cerrar la preparación, todos los proyectos deben tener ID Traspaso válido.
  if (faseActual === "FASE_2_3_PREPARACION") {
    const data = ctx.data(CONSTANTES.HOJA_PROYECTOS);
    const sinId = [];
    const invalidos = [];
    for (let i = 1; i < data.length; i++) {
      if (formatearFechaSegura(data[i][0]) !== fechaStr) continue;
      const nombre = data[i][1];
      const idT = String(data[i][5] || "").trim();
      if (!idT) sinId.push(nombre);
      else if (!/^\d{4}-/.test(idT)) invalidos.push(nombre + " (" + idT + ")");
    }
    if (sinId.length)     throw new Error("Falta el ID de Traspaso en: " + sinId.join(", "));
    if (invalidos.length) throw new Error("ID de Traspaso con formato inválido en: " + invalidos.join(", "));
  }

  // Validación: para cerrar pre-implantación, todos los proyectos deben tener
  // su check "Correo ANS Enviado" marcado.
  if (faseActual === "FASE_4_CERRADO") {
    const data = ctx.data(CONSTANTES.HOJA_PROYECTOS);
    const faltan = [];
    for (let i = 1; i < data.length; i++) {
      if (formatearFechaSegura(data[i][0]) !== fechaStr) continue;
      const correoAns = data[i][6] === true || String(data[i][6]).toUpperCase() === "TRUE" || String(data[i][6]).toUpperCase() === "VERDADERO";
      if (!correoAns) faltan.push(data[i][1]);
    }
    if (faltan.length) throw new Error("Falta marcar el correo ANS para: " + faltan.join(", "));
  }

  if (nuevaFase) {
    ctx.sheet(CONSTANTES.HOJA_PASES).getRange(fila, 3).setValue(nuevaFase);
    const configs = {
      "FASE_4_CERRADO": {
        prefijo: "[CERRADO]",
        tono: "informativo",
        titulo: "Pase cerrado · Lista de componentes validada",
        parrafos: [
          "La preparación se ha cerrado con éxito. Todos los proyectos están listos para la fase de pre-implantación.",
          "Próximo paso: completar los checks pre-implantación del jueves al viernes (DPs, JIRAs, REMEDYs, Documento de pruebas y Correo ANS por proyecto)."
        ],
      },
      "FASE_6_IMPLANTACION": {
        prefijo: "[IMPLANTACION]",
        tono: "warning",
        titulo: "Comienza la implantación",
        parrafos: [
          "Se ha activado la fase de implantación. El sábado se ejecuta el orden del pase.",
          "Recordad marcar cada paso en la web a medida que se vaya implantando en producción, e informar del SOM en las paradas y arranques."
        ],
      },
      "FASE_7_POST": {
        prefijo: "[POST]",
        tono: "recordatorio",
        titulo: "Mergeos pendientes",
        parrafos: [
          "La implantación ha terminado correctamente. Queda pendiente realizar los mergeos de los componentes DP-KYTL.",
          "Marcad en la web cada mergeo a medida que se completa."
        ],
      },
      "COMPLETADO": {
        prefijo: "[COMPLETADO]",
        tono: "informativo",
        titulo: "Pase finalizado al 100%",
        parrafos: [
          "Todos los mergeos están completados y el pase ha quedado cerrado con éxito.",
          "Gracias al equipo por el trabajo durante toda la cadena."
        ],
      },
    };
    const cfg = configs[nuevaFase];
    if (cfg) {
      // Al cerrar la preparación, el correo incluye el resumen de paquetes en
      // orden con los componentes de cada uno (misma info que la pestaña
      // "Resumen" de la web) para la comprobación final del equipo.
      let extraHtml = "";
      if (nuevaFase === "FASE_4_CERRADO") {
        try { extraHtml = construirResumenPaquetesHtml(ctx, fechaStr); } catch (_) {}
      }
      const html = htmlCorreoEstado({
        tono: cfg.tono,
        titulo: cfg.titulo,
        parrafos: cfg.parrafos,
        extraHtml: extraHtml,
        fechaPase: fechaStr,
      });
      enviarCorreoSeguro(ctx, cfg.prefijo + " " + cfg.titulo, html, fechaStr, fila, false);
    }
  }
  return { status: "OK", nuevaFase };
}

function activarEmergencia(ctx, fila, fechaStr) {
  ctx.sheet(CONSTANTES.HOJA_PASES).getRange(fila, 3).setValue("FASE_2_3_PREPARACION");
  const html = htmlCorreoEstado({
    tono: "alerta",
    titulo: "Reapertura de emergencia",
    parrafos: [
      "El pase ha sido reabierto en modo emergencia desde la web.",
      "Revisad los proyectos y componentes antes de proceder a la siguiente fase."
    ],
    fechaPase: fechaStr,
  });
  enviarCorreoSeguro(ctx, "[EMERGENCIA] REAPERTURA DE EMERGENCIA", html, fechaStr, fila, false);
  return "OK";
}

/* Cancela el pase esté en la fase que esté (encuesta, preparación, cerrado,
   implantación o mergeos). Los proyectos y componentes NO se borran: si se
   reactiva en modo emergencia, el pase vuelve a preparación con todo intacto.
   motivo y faseAnterior son opcionales (los manda la web para el correo). */
const NOMBRE_FASE = {
  PENDIENTE: "sin iniciar",
  FASE_1_ENCUESTA: "encuesta",
  FASE_2_3_PREPARACION: "preparación",
  FASE_4_CERRADO: "pre-implantación",
  FASE_6_IMPLANTACION: "implantación",
  FASE_7_POST: "mergeos (post-implantación)",
};

function cancelarSubida(ctx, fila, fechaStr, motivo, faseAnterior) {
  const hoja = ctx.sheet(CONSTANTES.HOJA_PASES);
  const fase = faseAnterior || String(hoja.getRange(fila, 3).getValue() || "");
  if (fase === "COMPLETADO") throw new Error("El pase ya está completado: no se puede cancelar.");
  hoja.getRange(fila, 2, 1, 2).setValues([["NO", "FASE_0_DESCANSO"]]);

  const parrafos = [
    NOMBRE_FASE[fase]
      ? "El pase se ha cancelado desde la web durante la fase de " + NOMBRE_FASE[fase] + "."
      : "La subida se ha cancelado desde la web.",
  ];
  const m = String(motivo || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();
  if (m) parrafos.push("<strong>Motivo:</strong> «" + m + "»");
  if (fase === "FASE_6_IMPLANTACION" || fase === "FASE_7_POST") {
    parrafos.push("La cancelación llega con la implantación ya iniciada: revisad qué pasos se han ejecutado en producción y si hace falta marcha atrás.");
  }
  parrafos.push("Esta semana no se realiza ningún pase. Si surge una urgencia, el pase puede reactivarse en modo emergencia desde la web (proyectos y componentes se conservan).");

  const html = htmlCorreoEstado({
    tono: "recordatorio",
    titulo: "Pase cancelado",
    parrafos: parrafos,
    fechaPase: fechaStr,
  });
  enviarCorreoSeguro(ctx, "[CANCELADO] PASE CANCELADO", html, fechaStr, fila, false);
  return "OK";
}

/* ─────────────────────────────────────────────────────────
   Helpers de email — HTML maquetado con paleta BBVA
   Mismo sistema visual que Avisos.gs (consistencia entre todos
   los correos del RDR Hub).
   ───────────────────────────────────────────────────────── */

const EMAIL_COLORS = {
  midnight: "#070E46",
  electric: "#001391",
  sand:     "#F7F8F8",
  serene:   "#85C8FF",
  lime:     "#88E783",
  canary:   "#FFE761",
  mandarin: "#FFB56B",
  red:      "#D32F2F",
  gray:     "#46536D",
};

function htmlCorreoEstado(opts) {
  const colorBarra = {
    informativo:  EMAIL_COLORS.serene,
    recordatorio: EMAIL_COLORS.canary,
    warning:      EMAIL_COLORS.mandarin,
    alerta:       EMAIL_COLORS.mandarin,
    alerta_max:   EMAIL_COLORS.red,
  }[opts.tono] || EMAIL_COLORS.serene;

  const parrafosHtml = (opts.parrafos || []).map(t =>
    '<p style="margin: 8px 0; color: ' + EMAIL_COLORS.midnight + ';">' + t + '</p>'
  ).join("");

  return '' +
    '<div style="font-family: Arial, sans-serif; color: ' + EMAIL_COLORS.midnight + '; max-width: 640px; line-height: 1.55;">' +
      '<div style="border-left: 4px solid ' + colorBarra + '; padding: 14px 20px; background: ' + EMAIL_COLORS.sand + ';">' +
        '<h2 style="margin: 0 0 10px; font-size: 18px; color: ' + EMAIL_COLORS.electric + ';">' + opts.titulo + '</h2>' +
        parrafosHtml +
      '</div>' +
      (opts.extraHtml || '') +
      '<p style="margin: 14px 0 0; font-size: 11px; color: ' + EMAIL_COLORS.gray + ';">' +
        'Pase ' + opts.fechaPase + ' · Notificación automática del RDR Hub.' +
      '</p>' +
    '</div>';
}

/* ── Resumen de paquetes del pase (correo de cierre de preparación) ──
   Recorre el orden de ejecución y, para cada paso con código (paquete),
   lista sus componentes con su tipo de subida, para que el equipo compruebe
   que todo está listo antes de la implantación. */
const RE_CODIGOS_PASO = /(?:DP-KYTL-|SS-|ARQDAT-|REQ-)[A-Z0-9_-]+|\/todotasks\/[A-Z0-9_-]+/gi;

function construirResumenPaquetesHtml(ctx, fechaStr) {
  // Orden de ejecución de esta fecha.
  const allOrden = ctx.data(CONSTANTES.HOJA_ORDEN);
  const orden = [];
  for (let i = 1; i < allOrden.length; i++) {
    if (formatearFechaSegura(allOrden[i][0]) === fechaStr) orden.push(String(allOrden[i][2] || ""));
  }

  // Componentes de esta fecha, indexados por código.
  const allProys = ctx.data(CONSTANTES.HOJA_PROYECTOS);
  const nombresProy = {};
  for (let i = 1; i < allProys.length; i++) {
    if (formatearFechaSegura(allProys[i][0]) === fechaStr) nombresProy[allProys[i][1]] = true;
  }
  const allComps = ctx.data(CONSTANTES.HOJA_COMPONENTES);
  const porCodigo = {};
  const sinColocar = [];
  const codigosEnOrden = {};
  orden.forEach(el => (String(el).match(RE_CODIGOS_PASO) || []).forEach(c => { codigosEnOrden[c.toUpperCase()] = true; }));
  for (let i = 1; i < allComps.length; i++) {
    const c = allComps[i];
    if (!c[0]) continue;
    const fechaComp = c[11] ? formatearFechaSegura(c[11]) : "";
    if (fechaComp ? fechaComp !== fechaStr : !nombresProy[c[0]]) continue;
    const comp = { proyecto: c[0], nombre: c[1] || "(sin nombre)", tipo: c[2] || "—", subida: c[3] || "—", resp: c[4] || "—", codigo: String(c[5] || "").trim() };
    const codUp = comp.codigo.toUpperCase();
    if (!comp.codigo || comp.codigo === "-") { sinColocar.push(comp); continue; }
    (porCodigo[codUp] = porCodigo[codUp] || []).push(comp);
    if (!codigosEnOrden[codUp]) sinColocar.push(comp);
  }

  const celda = 'padding:6px 10px;border-bottom:1px solid #E2E6EA;font-size:13px;color:' + EMAIL_COLORS.midnight + ';';
  const cab = 'padding:7px 10px;background:' + EMAIL_COLORS.electric + ';color:#fff;font-size:12px;text-align:left;';

  let html = '<div style="margin-top:16px;">' +
    '<h3 style="margin:0 0 8px;font-size:15px;color:' + EMAIL_COLORS.electric + ';">Resumen del pase · paquetes en orden de ejecución</h3>';

  if (!orden.length) {
    html += '<p style="font-size:13px;color:' + EMAIL_COLORS.gray + ';">No hay orden de ejecución definido.</p></div>';
    return html;
  }

  html += '<table style="width:100%;border-collapse:collapse;border:1px solid #E2E6EA;">' +
    '<tr><th style="' + cab + '">#</th><th style="' + cab + '">Paso</th><th style="' + cab + '">Subida</th><th style="' + cab + '">Componentes</th></tr>';
  orden.forEach((el, i) => {
    const cods = String(el).match(RE_CODIGOS_PASO) || [];
    let comps = [];
    cods.forEach(cod => { comps = comps.concat(porCodigo[cod.toUpperCase()] || []); });
    const subidas = {};
    comps.forEach(c => { subidas[c.subida] = true; });
    const subidaTxt = cods.length ? (Object.keys(subidas).join(", ") || "—") : "Sistema";
    const compsTxt = comps.length
      ? comps.map(c => '· ' + c.nombre + ' <span style="color:' + EMAIL_COLORS.gray + ';">(' + c.tipo + ' · ' + c.proyecto + ')</span>').join('<br>')
      : (cods.length ? '<span style="color:' + EMAIL_COLORS.red + ';">sin componentes asociados</span>' : '—');
    html += '<tr>' +
      '<td style="' + celda + 'white-space:nowrap;">' + (i + 1) + '</td>' +
      '<td style="' + celda + '">' + el + '</td>' +
      '<td style="' + celda + 'white-space:nowrap;">' + subidaTxt + '</td>' +
      '<td style="' + celda + '">' + compsTxt + '</td>' +
    '</tr>';
  });
  html += '</table>';

  if (sinColocar.length) {
    html += '<p style="margin:10px 0 4px;font-size:13px;color:' + EMAIL_COLORS.red + ';font-weight:bold;">Componentes sin código o fuera del orden (revisar):</p>' +
      '<p style="margin:0;font-size:13px;color:' + EMAIL_COLORS.gray + ';">' +
      sinColocar.map(c => c.nombre + ' (' + c.proyecto + (c.codigo ? ' · ' + c.codigo : ' · sin código') + ')').join('<br>') +
      '</p>';
  }
  return html + '</div>';
}

/* ─────────────────────────────────────────────────────────
   Correo (sin cambios funcionales; reaprovecha SheetCtx)
   ───────────────────────────────────────────────────────── */

function enviarCorreoSeguro(ctx, asunto, cuerpo, fechaStr, fila, esInicio) {
  if (!fila || fila < 2) return;
  const debug = getModoDebug();
  const dest = debug ? CONSTANTES.BUZON_PRUEBAS_DEBUG : CONSTANTES.BUZON_DESARROLLOS;
  let asuntoHilo = "[RDR Hub] Pase Calendado - " + fechaStr;
  if (debug) asuntoHilo = "[TEST] " + asuntoHilo;

  // Detectar si cuerpo ya viene como HTML (empieza con < tras posibles espacios).
  // Si es HTML lo respetamos; si es texto plano lo envolvemos en <p>.
  const cuerpoTrim = String(cuerpo || "").trim();
  const esHtml = cuerpoTrim.charAt(0) === "<";
  const htmlBody = esHtml ? cuerpoTrim : "<p>" + cuerpoTrim + "</p>";
  // Versión texto plano para clientes sin soporte HTML
  const plainText = asunto + "\n\n" + (esHtml ? quitarTagsHtml(cuerpoTrim) : cuerpoTrim);

  try {
    // Mismo patrón que los avisos programados (Avisos_Pases.gs): envío DIRECTO con
    // noReply (From = noreply@nfq.es) y asunto fijo por pase. Gmail agrupa los correos
    // en el mismo hilo por asunto + participantes (From + To). NO usamos thread.replyAll:
    // respondería también al remitente noreply@nfq.es —que no recibe correo— y rebotaba.
    // Mismo remitente visible que los avisos (AVISOS_CONFIG es global en el proyecto)
    // para que toda la conversación del pase se vea uniforme.
    GmailApp.sendEmail(dest, asuntoHilo, plainText, {
      htmlBody, name: AVISOS_CONFIG.REMITE, noReply: true
    });
  } catch (e) {
    console.error(e);
  }
}

/* Convierte un HTML simple en texto plano legible (fallback para clientes sin HTML). */
function quitarTagsHtml(s) {
  return String(s || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d|div)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "  · ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// MÓDULO DE ALARMAS: deja aquí tu bloque actual sin cambios.

/**
 * DIAGNÓSTICO · vuelca cabecera + primeras filas de Componentes, Proyectos
 * y Orden_Ejecucion para localizar EXACTAMENTE en qué columna vive la fecha
 * en la hoja real (regularizarFechasPases dio 0/0/0/0 en las tres dos veces
 * seguidas con supuestos distintos de columna — mejor mirar el dato real
 * que seguir adivinando índices de columna a ciegas).
 * Ejecutar y pegar el resultado del registro (Ver → Registros de ejecución).
 */
function inspeccionarFechasPases() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tzScript = Session.getScriptTimeZone();
  const tzSheet = ss.getSpreadsheetTimeZone();
  Logger.log("Zona horaria del SCRIPT: " + tzScript + " · Zona horaria del SHEETS: " + tzSheet +
    (tzScript === tzSheet ? " (coinciden)" : " ⚠ NO COINCIDEN: por eso el Sheets puede pintar el día anterior"));
  [CONSTANTES.HOJA_COMPONENTES, CONSTANTES.HOJA_PROYECTOS, CONSTANTES.HOJA_ORDEN].forEach((nombreHoja) => {
    const sheet = ss.getSheetByName(nombreHoja);
    if (!sheet) { Logger.log("⚠ No existe la hoja " + nombreHoja); return; }
    const lastRow = sheet.getLastRow();
    const lastCol = Math.min(sheet.getLastColumn(), 16);
    Logger.log("===== " + nombreHoja + " · " + lastRow + " filas x " + sheet.getLastColumn() + " cols =====");
    const filas = sheet.getRange(1, 1, Math.min(lastRow, 5), lastCol).getValues();
    filas.forEach((fila, i) => {
      const repr = fila.map((v) => {
        // Nunca toISOString aquí: convierte a UTC y enseña el día anterior
        // (ese despiste hizo creer que había fechas mal guardadas).
        if (v instanceof Date)
          return "[Date script=" + Utilities.formatDate(v, tzScript, "dd/MM/yyyy HH:mm") +
                 " | sheets=" + Utilities.formatDate(v, tzSheet, "dd/MM/yyyy HH:mm") + "]";
        if (typeof v === "string" && v.length > 18) return v.slice(0, 18) + "…";
        return String(v);
      });
      Logger.log((i === 0 ? "CABECERA: " : "fila " + (i + 1) + ": ") + repr.join(" | "));
    });
  });
}

/**
 * ============================================================================
 *  REGULARIZACIÓN ÚNICA · fechas guardadas 1 día antes (bug de medianoche
 *  en parsearFechaEs, ya corregido para las escrituras nuevas).
 * ============================================================================
 *  Corrige, en las hojas Componentes / Proyectos / Orden_Ejecucion, las
 *  filas cuya fecha NO coincide con ninguna fecha real de Pases_Calendados
 *  (columna A, escrita siempre a mano — nunca por el script, así que es la
 *  referencia fiable) pero SÍ coincide sumándole 1 día. Solo esas filas se
 *  tocan: no se desplaza nada a ciegas.
 *
 *  USO (desde el editor de Apps Script, función a ejecutar en el desplegable):
 *    1. regularizarFechasPases()        → SOLO PREVISUALIZA (no escribe nada).
 *       Mira el registro de ejecución (Ver → Registros) para ver qué filas
 *       cambiaría y a qué fecha.
 *    2. regularizarFechasPases(false)   → aplica los cambios de verdad.
 *  Es idempotente: una segunda ejecución no encuentra nada más que corregir.
 * ============================================================================
 */
function regularizarFechasPases(dryRun) {
  if (dryRun === undefined) dryRun = true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tzScript = Session.getScriptTimeZone();
  const tzSheet = ss.getSpreadsheetTimeZone();
  const dia = (d, tz) => Utilities.formatDate(d, tz, "dd/MM/yyyy");

  Logger.log("Zona del SCRIPT: " + tzScript + " · Zona del SHEETS: " + tzSheet +
    (tzScript === tzSheet ? " (coinciden)" : " \u26a0 NO COINCIDEN"));

  // Hoja + columna de la fecha (confirmadas con inspeccionarFechasPases).
  const objetivos = [
    { hoja: CONSTANTES.HOJA_COMPONENTES, col: 12, etiqueta: "Componentes (col L, Fecha del Pase)" },
    { hoja: CONSTANTES.HOJA_PROYECTOS, col: 1, etiqueta: "Proyectos (col A, Fecha del Pase)" },
    { hoja: CONSTANTES.HOJA_ORDEN, col: 1, etiqueta: "Orden_Ejecucion (col A, Fecha del Pase)" },
  ];

  let totalDesfase = 0, totalNormalizadas = 0;
  objetivos.forEach((obj) => {
    const sheet = ss.getSheetByName(obj.hoja);
    if (!sheet) { Logger.log("\u26a0 No existe la hoja " + obj.hoja); return; }
    const last = sheet.getLastRow();
    if (last < 2) { Logger.log(obj.etiqueta + ": sin filas de datos."); return; }

    const rango = sheet.getRange(2, obj.col, last - 1, 1);
    const vals = rango.getValues();
    let desfase = 0, normalizadas = 0, yaOk = 0, noFecha = 0;
    const ejemplos = [];

    for (let i = 0; i < vals.length; i++) {
      const v = vals[i][0];
      if (!(v instanceof Date)) { if (v !== "" && v !== null) noFecha++; continue; }

      const diaScript = dia(v, tzScript);   // el día que el script quiso guardar
      const diaSheets = dia(v, tzSheet);    // el día que PINTA la hoja
      const hora = Number(Utilities.formatDate(v, tzScript, "H"));

      if (diaScript !== diaSheets) desfase++;      // se ve un día distinto del real
      else if (hora === 12) { yaOk++; continue; }  // ya normalizada: nada que hacer

      // Reescribir el MISMO día (el intencionado, el del script) a mediodía:
      // así ninguna zona horaria puede cruzar la frontera del día.
      const p = diaScript.split("/");
      const corregida = new Date(+p[2], +p[1] - 1, +p[0], 12, 0, 0);
      if (ejemplos.length < 5)
        ejemplos.push("fila " + (i + 2) + ": la hoja pintaba " + diaSheets + " \u2192 queda " + diaScript);
      if (!dryRun) vals[i][0] = corregida;
      normalizadas++;
    }

    if (!dryRun && normalizadas > 0) rango.setValues(vals); // una sola escritura

    Logger.log(obj.etiqueta + ": " + normalizadas + (dryRun ? " a normalizar" : " normalizadas") +
      " (de ellas " + desfase + " se pintaban con el día equivocado), " + yaOk + " ya correctas, " +
      noFecha + " valores no-fecha.");
    ejemplos.forEach((e) => Logger.log("   \u00b7 " + e));
    totalDesfase += desfase;
    totalNormalizadas += normalizadas;
  });

  Logger.log((dryRun ? "PREVISUALIZACIÓN (nada escrito). " : "APLICADO. ") +
    "Total: " + totalNormalizadas + " fechas normalizadas a mediodía, " +
    totalDesfase + " de ellas se veían con el día equivocado en la hoja.");
  if (dryRun && totalNormalizadas > 0)
    Logger.log("Para aplicar de verdad: ejecuta regularizarFechasPases(false).");
}
