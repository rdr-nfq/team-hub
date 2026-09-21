"use client";

// Datos de Guardias (backend Codigo_Guardias.gs, clave "guardiasBackend" de
// links.json). Mismo patrón que Time Report: GET para leer (parametrizado
// por `action`), POST text/plain JSON para escribir (simple request, sin
// preflight).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLinks } from "@/lib/links";

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
    try {
      const qp = new URLSearchParams({ action, ...JSON.parse(paramsKey) }).toString();
      const u = url + (url.indexOf("?") < 0 ? "?" : "&") + qp;
      const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(60000) }).then((r) => r.json());
      if (!res || !res.ok) throw new Error((res && res.error) || "respuesta inesperada");
      setSnap({ data: res.data, error: "" });
    } catch (e) {
      setSnap({ data: null, error: String(e.message || e) });
    }
  }, [getUrl, linksError, action, paramsKey]);

  useEffect(() => {
    const ready = linksError || getUrl("guardiasBackend") != null || getUrl("_updated") != null || getUrl("_comment") != null;
    if (!ready) return;
    load();
  }, [getUrl, linksError, load]);

  const post = useCallback(async (act, body) => {
    const url = urlRef.current;
    if (!url) throw new Error("Backend no configurado (guardiasBackend en links.json).");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: act, ...body }),
    }).then((r) => r.json());
    if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
    return res.data;
  }, []);

  return { snap, reload: load, post };
}
