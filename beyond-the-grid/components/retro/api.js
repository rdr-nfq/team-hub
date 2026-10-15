"use client";

import { useCallback } from "react";
import { useLinks } from "@/lib/links";

/**
 * Capa de transporte al backend Apps Script de retrospectivas.
 * Réplica EXACTA del contrato de public/retro.html:
 *  - La URL sale de links/links.json (clave "retroBackend") vía useLinks().
 *  - GET  `${url}?action=X&param=...`   para lecturas.
 *  - POST `${url}` con Content-Type text/plain;charset=utf-8 y body JSON
 *    {action, ...payload}  (text/plain evita el preflight CORS de Apps Script).
 *  - redirect: "follow" (Apps Script responde con 302 al contenido real).
 *  - Respuesta {ok, data, error}: si !ok se lanza Error(json.error).
 */
export function useGas() {
  const { getUrl } = useLinks();
  const url = getUrl("retroBackend");

  const gasGet = useCallback(
    async (action, params) => {
      if (!url) throw new Error("Backend de retro no configurado (links.json → retroBackend)");
      const qs = new URLSearchParams({ action, ...(params || {}) }).toString();
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}${qs}`, { method: "GET", redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error desconocido");
      return json.data;
    },
    [url]
  );

  const gasPost = useCallback(
    async (action, payload) => {
      if (!url) throw new Error("Backend de retro no configurado (links.json → retroBackend)");
      const res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...(payload || {}) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Error desconocido");
      return json.data;
    },
    [url]
  );

  return { gasGet, gasPost, ready: !!url };
}
