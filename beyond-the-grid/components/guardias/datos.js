"use client";

// Datos de Guardias (backend Codigo_Guardias.gs, clave "guardiasBackend" de
// links.json). Mismo patrón que Time Report: GET para leer (parametrizado
// por `action`), POST text/plain JSON para escribir (simple request, sin
// preflight).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLinks } from "@/lib/links";

/* Lee la respuesta como JSON. Si Apps Script devuelve una página HTML (su
   pantalla de error o de "Authorization is required"), en vez del críptico
   "Unexpected token '<'" se explica qué ha pasado y dónde mirarlo. */
async function leerJSON(r) {
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    const titulo = ((/<title>([^<]*)<\/title>/i.exec(txt) || [])[1] || "").trim();
    const err = new Error(
      `el backend de Guardias ha devuelto una página de Google en vez de datos (HTTP ${r.status}${titulo ? ` · «${titulo}»` : ""}). ` +
      "Mira el error real en Apps Script → Ejecuciones; suele ser un permiso pendiente de autorizar (ejecuta autorizar() en el editor) " +
      "o que la URL de links.json no es la de la implementación actual."
    );
    err.html = true;
    throw err;
  }
}

export function useGuardias(action, params) {
  const { getUrl, error: linksError } = useLinks();
  const [snap, setSnap] = useState(null); // { data, error }
  const urlRef = useRef(null);
  const paramsKey = JSON.stringify(params || {});

  const load = useCallback(async () => {
    let url = null;
    if (!linksError) url = getUrl("guardiasBackend");
    urlRef.current = url;
    if (!url) {
      setSnap({ data: null, error: linksError ? "no se pudo leer links.json" : "falta guardiasBackend en links.json" });
      return;
    }
    if (!action) return;
    setSnap(null);
    const qp = new URLSearchParams({ action, ...JSON.parse(paramsKey) }).toString();
    const u = url + (url.indexOf("?") < 0 ? "?" : "&") + qp;
    // Una lectura es idempotente: si Google devuelve una página suelta de
    // error, se reintenta una vez antes de enseñarlo.
    for (let intento = 1; ; intento++) {
      try {
        const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(60000) }).then(leerJSON);
        if (!res || !res.ok) throw new Error((res && res.error) || "respuesta inesperada");
        setSnap({ data: res.data, error: "" });
        return;
      } catch (e) {
        if (e.html && intento < 2) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
        setSnap({ data: null, error: String(e.message || e) });
        return;
      }
    }
  }, [getUrl, linksError, action, paramsKey]);

  useEffect(() => {
    const ready = linksError || getUrl("guardiasBackend") != null || getUrl("_updated") != null || getUrl("_comment") != null;
    if (!ready) return;
    load();
  }, [getUrl, linksError, load]);

  // Las escrituras NO se reintentan: la guardia podría haberse guardado ya.
  const post = useCallback(async (act, body) => {
    const url = urlRef.current;
    if (!url) throw new Error("Backend no configurado (guardiasBackend en links.json).");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: act, ...body }),
    }).then(leerJSON);
    if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
    return res.data;
  }, []);

  return { snap, reload: load, post };
}

/* Texto del aviso cuando la guardia se guardó pero el correo no salió. */
export const errorAviso = (data) =>
  data && data.aviso && data.aviso.ok === false ? String(data.aviso.error || "error desconocido") : "";
