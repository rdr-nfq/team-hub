"use client";

// Carga de datos de Coordinación (/simulador y /capacidad).
//
// CONTRATO BACKEND (Apps Script "controlBackend" de links.json):
//   - Lectura:   GET  {url}?action=snapshot            -> { ok, data } | { ok:false, error }
//   - Escritura: POST text/plain JSON.stringify({ action, ...params })
//     (solo guardarCapacidadWeb: escribe en su hoja propia "Capacidad_Web",
//      JAMÁS en los datos del Excel).
//
// El snapshot de Apps Script tarda BASTANTES segundos (lee medio Excel), así
// que se cachea en sessionStorage: las visitas siguientes pintan al instante
// con lo cacheado (flag `cached`) mientras se revalida en segundo plano
// (flag `cargando`). Sin backend accesible se sirve el snapshot DEMO.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLinks } from "@/lib/links";
import { DEMO } from "./model";

const CACHE_KEY = "rdr_coord_snap_v2"; // v2: la caché guarda también la URL

// La caché va LIGADA a la URL del backend: si cambia el despliegue en
// links.json, la copia del anterior se descarta (no enseñar datos de otro
// backend ni un segundo).
const leeCache = (url) => {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    return c && c.url === url && c.data ? c.data : null;
  } catch {
    return null;
  }
};

export function useSnapshot() {
  const { getUrl, error: linksError } = useLinks();
  const [snap, setSnap] = useState(null); // { data, demo, cached, error }
  const [cargando, setCargando] = useState(true); // hay un fetch en vuelo
  const urlRef = useRef(null);

  const load = useCallback(async () => {
    let url = null;
    let err = "";
    if (linksError) err = "no se pudo leer links.json";
    else url = getUrl("controlBackend");
    urlRef.current = url;
    // Con la URL ya resuelta: pinta al instante la copia cacheada DE ESA URL.
    if (url) {
      const cached = leeCache(url);
      if (cached) setSnap((prev) => prev || { data: cached, demo: false, cached: true, error: "" });
    }
    setCargando(true);
    if (url) {
      try {
        const u = url + (url.indexOf("?") < 0 ? "?" : "&") + "action=snapshot";
        // Timeout duro: sin él, un Apps Script colgado deja la página en el
        // esqueleto de carga para siempre (mejor caer a DEMO con aviso).
        // no-store: sin él el navegador puede servir un snapshot viejo de su
        // caché HTTP y la revalidación no sería real (la caché la ponemos
        // nosotros en sessionStorage, controlada).
        const resp = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(90000) });
        const texto = await resp.text();
        // Se parsea a mano (no resp.json()) para poder diferenciar POR QUÉ
        // falla: un HTTP distinto de 200 (deploy caído/sin permiso), o un
        // cuerpo que no es JSON (típico: Apps Script devuelve la página de
        // login de Google en vez de datos si el despliegue exige iniciar
        // sesión, o una página de error si el script no compila). Antes todo
        // esto cafa en el mismo "CORS/red", que rara vez es la causa real:
        // los Apps Script ContentService sí llevan cabeceras CORS.
        let res;
        try {
          res = JSON.parse(texto);
        } catch {
          throw new Error(
            resp.ok
              ? "el backend no devolvió JSON (¿pide iniciar sesión o el despliegue está roto?): " + texto.slice(0, 120)
              : "HTTP " + resp.status + " del backend: " + texto.slice(0, 120)
          );
        }
        if (!resp.ok) throw new Error("HTTP " + resp.status + " del backend: " + (res?.error || texto.slice(0, 120)));
        if (res && res.ok && res.data) {
          setSnap({ data: res.data, demo: false, cached: false, error: "" });
          setCargando(false);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ url, data: res.data }));
          } catch {} // cuota llena: sin caché, sin drama
          return;
        }
        err = res && res.error ? "backend: " + res.error : "respuesta inesperada del backend";
      } catch (e) {
        err =
          e && e.name === "TimeoutError" ? "el backend no respondió en 90 s"
          : e && e.message && /HTTP \d|no devolvió JSON/.test(e.message) ? e.message
          : "sin conexión con el backend (" + (e && e.message ? e.message : "red") + ")";
      }
    } else if (!err) {
      err = "falta controlBackend en links.json";
    }
    setCargando(false);
    // Con caché previa nos quedamos con ella (datos reales, aunque no frescos);
    // sin nada, snapshot DEMO con el motivo en el banner.
    setSnap((prev) =>
      prev && !prev.demo ? { ...prev, error: err } : { data: DEMO, demo: true, cached: false, error: err }
    );
  }, [getUrl, linksError]);

  // Arranque: espera a links.json (la caché se pinta dentro de load(), ya con
  // la URL real del backend resuelta).
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    const ready = linksError || getUrl("controlBackend") != null || getUrl("_updated") != null || getUrl("_comment") != null;
    if (!ready) return;
    booted.current = true;
    load();
  }, [getUrl, linksError, load]);

  /* POST de escritura (capacidad). Lanza si no hay backend (modo DEMO). */
  const post = useCallback(async (action, params) => {
    const url = urlRef.current;
    if (!url) throw new Error("Sin backend (modo demo): los cambios no se guardan.");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request, sin preflight
      body: JSON.stringify({ action, ...params }),
    }).then((r) => r.json());
    if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
    return res.data;
  }, []);

  return { snap, cargando, reload: load, post };
}
