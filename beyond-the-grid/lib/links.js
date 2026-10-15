"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Toast from "@/components/chrome/Toast";

/**
 * Capa de enlaces del hub (porta la lógica de data-link-key del index.html).
 *
 * - Carga links/links.json (fuente única de URLs) con cache:'no-store'.
 * - getUrl(key): devuelve la URL si existe y no es un placeholder.
 * - copyLink(key): copia al portapapeles y muestra un toast.
 * - showToast(msg): aviso flotante.
 *
 * Ruta absoluta con basePath ("/team-hub/links/links.json") para que funcione
 * desde cualquier ruta, incluida la anidada /formacion/ (el fichero vive en
 * public/links/links.json).
 */
const LinksContext = createContext(null);

/**
 * URL de una clave de links.json (null si falta o es un placeholder).
 * Backends del proyecto único de Apps Script: { app: "vacaciones" } + la URL
 * /exec en "hubBackend" -> <hub>?app=vacaciones. Mientras hubBackend no tenga
 * URL, se usa la "url" propia de la clave. Para código fuera de React
 * (p. ej. lib/progreso.js) que lee links.json por su cuenta.
 */
export function urlDe(links, key) {
  if (!links) return null;
  const valida = (u) => (u && u.indexOf("PEGAR_AQUI") === -1 ? u : null);
  const entry = links[key];
  if (entry && typeof entry === "object" && entry.app) {
    const hub = links.hubBackend && valida(typeof links.hubBackend === "string" ? links.hubBackend : links.hubBackend.url);
    if (hub) return hub + (hub.indexOf("?") < 0 ? "?" : "&") + "app=" + encodeURIComponent(entry.app);
  }
  return valida(entry && (typeof entry === "string" ? entry : entry.url));
}

export function LinksProvider({ children }) {
  const [links, setLinks] = useState(null);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState("");
  const timer = useRef();

  useEffect(() => {
    fetch("/team-hub/links/links.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(setLinks)
      .catch(() => setError(true));
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const getUrl = useCallback((key) => urlDe(links, key), [links]);

  const copyLink = useCallback(
    async (key) => {
      if (error) return showToast("No se pudieron cargar los enlaces");
      const url = getUrl(key);
      if (!url) return showToast("Enlace no disponible — revisa links.json");
      try {
        await navigator.clipboard.writeText(url);
        showToast("Enlace copiado al portapapeles");
      } catch {
        showToast("No se pudo copiar el enlace");
      }
    },
    [error, getUrl, showToast]
  );

  return (
    <LinksContext.Provider value={{ getUrl, copyLink, showToast, error }}>
      {children}
      <Toast message={toast} />
    </LinksContext.Provider>
  );
}

export const useLinks = () => useContext(LinksContext);
