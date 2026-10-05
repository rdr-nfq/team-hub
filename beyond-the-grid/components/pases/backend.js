/**
 * Contrato con el backend Apps Script de pases (clave "pasesBackend" en
 * links/links.json). PORTADO 1:1 de public/pases-calendados.html — no cambiar
 * métodos, params, body ni parsing sin cambiar también el Apps Script.
 *
 * Patrón CORS de Apps Script: POST con Content-Type "text/plain;charset=utf-8"
 * (simple request, sin preflight OPTIONS que Apps Script no contesta).
 * Body: JSON.stringify({ action, payload }). Respuesta: { status, message?, data }.
 *
 * Acciones usadas (todas POST al mismo /exec):
 *   obtenerDatosDashboard        { fecha }
 *   iniciarPase                  { fila, fechaStr }
 *   responderEncuesta            { respuesta, fila, fechaStr }
 *   cancelarSubida               { fila, fechaStr, faseAnterior?, motivo? }  (cualquier fase salvo COMPLETADO)
 *   activarEmergencia            { fila, fechaStr }
 *   avanzarFase                  { fila, fechaStr, faseActual }
 *   guardarNuevoProyecto         { fechaStr, nombre, feature, respBBVA }
 *   eliminarProyecto             { fechaStr, nombre }
 *   agregarComponentesVacios     { proy, cantidadStr, fechaStr }
 *   editarComponente             { fila, nom, tipo, subida, resp, cod, us, release, com, releaseCheck }
 *   eliminarComponente           { fila, fechaStr }
 *   actualizarOKProyecto         { fechaStr, nombre, val }
 *   actualizarIdTraspaso         { fechaStr, nombre, idTraspaso }
 *   actualizarCorreoAns          { fechaStr, nombre, val }
 *   actualizarChecksPre          { fila, checks }
 *   guardarCabecera              { fila, crq, lider, aprende, instTecnica }
 *   actualizarOrdenCompleto      { fechaStr, elementos: [{ elemento, som }] }
 *   actualizarCheckOrden         { fila, val }
 *   actualizarSomOrden           { fila, val }
 *   actualizarMergeComponente    { fila, val }
 *   debugTotal                   { }
 */

export const CACHE_KEY_PREFIX = "rdr_hub_state_v3_"; // misma clave que el legacy
export const CACHE_TTL_MS = 1000 * 60 * 30;

export const CIBRDR_PREFIX = "CIBRDR-";
// ID de Traspaso: debe empezar por "YYYY-" (4 dígitos + guion).
export const RE_ID_TRASPASO = /^\d{4}-/;

export const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

/** true / "TRUE" / "VERDADERO" (el Excel devuelve strings localizados). */
export const isT = (v) =>
  v === true || String(v).toUpperCase() === "TRUE" || String(v).toUpperCase() === "VERDADERO";

/** Normaliza un campo multivalor separado por ";" (Historias de usuario, Features). */
export function limpiarMulti(v) {
  return String(v == null ? "" : v)
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && s !== CIBRDR_PREFIX.trim())
    .join("; ");
}

/** Valida un código contra un schema. null si OK, o mensaje de error. */
export function validarCodVsSchema(cod, schema) {
  if (!cod || cod.trim() === "" || cod.trim() === "-") return null;
  if (!schema) return null;
  return cod.trim().toUpperCase().indexOf(schema.toUpperCase()) === 0
    ? null
    : 'El código no cumple el schema. Debe empezar por "' + schema + '".';
}

/** null si el ID Traspaso es válido (o vacío), o mensaje de error. */
export function validarIdTraspasoValor(idT) {
  const t = (idT || "").trim();
  if (!t) return null;
  if (!RE_ID_TRASPASO.test(t)) return 'El ID de Traspaso debe empezar por "YYYY-" (4 dígitos y guion).';
  return null;
}

/** Schema esperado para un Tipo de Subida (parametrizado en el Excel). */
export function getSchema(E, subida) {
  return (E && E.schemaPorSubida && E.schemaPorSubida[(subida || "").trim()]) || "";
}

// ── Cache local (sessionStorage, Stale-While-Revalidate) ──
export function cacheGet(fecha) {
  try {
    const key = CACHE_KEY_PREFIX + (fecha || "__default__");
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj.ts || Date.now() - obj.ts > CACHE_TTL_MS) return null;
    return obj.data;
  } catch {
    return null;
  }
}

export function cacheSet(fecha, data) {
  try {
    const wrap = JSON.stringify({ ts: Date.now(), data });
    sessionStorage.setItem(CACHE_KEY_PREFIX + (fecha || "__default__"), wrap);
    if (data && data.fechaSeleccionada) {
      sessionStorage.setItem(CACHE_KEY_PREFIX + data.fechaSeleccionada, wrap);
    }
  } catch {}
}

/** Hash barato del dashboard para reconciliar SWR sin repintar de más. */
export function dashHash(d) {
  if (!d) return "";
  try {
    return JSON.stringify({
      f: d.fechaSeleccionada,
      fa: d.faseActual,
      crq: d.crq,
      lid: d.liderar,
      apr: d.aprender,
      it: d.instTecnica,
      md: d.modoDebug,
      cp: d.checksPre,
      p: (d.proyectos || []).map((p) => [
        p.fila,
        p.nombre,
        p.ok,
        (p.componentes || []).map((c) => [c.fila, c.nombre, c.tipo, c.subida, c.resp, c.codigo, c.us, c.release, c.mergeado, c.probado, c.comentarios]),
      ]),
      o: (d.ordenPase || []).map((o) => [o.fila, o.orden, o.elemento, o.implantado, o.som]),
    });
  } catch {
    return Math.random().toString();
  }
}

// ── Motor de peticiones (idéntico al legacy) ──
export async function llamarBackend(apiUrl, actionName, payloadData = {}, options = {}) {
  if (!apiUrl) throw new Error("URL del backend de pases no disponible (links.json)");
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: actionName, payload: payloadData }),
    signal: options.signal,
  });
  if (!res.ok) throw new Error("Servidor respondió HTTP " + res.status);
  const json = await res.json();
  if (json.status === "error") throw new Error(json.message);
  return json.data;
}

/** Beacon fire-and-forget para autosaves pendientes al cerrar la pestaña. */
export function beaconEditarComponente(apiUrl, payload) {
  try {
    const body = JSON.stringify({ action: "editarComponente", payload });
    navigator.sendBeacon?.(apiUrl, new Blob([body], { type: "text/plain;charset=utf-8" }));
  } catch {}
}
