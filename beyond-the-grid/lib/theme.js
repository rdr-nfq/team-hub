"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Tema claro/oscuro de toda la app.
 *
 * - La CLASE `rdr-light` en <html> activa el set de variables CSS del modo
 *   claro (app/globals.css); las utilidades Tailwind (bg-midnight, text-sand,
 *   border-white/12…) leen esas variables, así que el 90% del sitio se
 *   re-tematiza solo.
 * - La preferencia se recuerda POR CUENTA en el backend (?app=preferencias,
 *   ver TemaDeCuenta): cada persona ve siempre su tema, en cualquier equipo.
 *   En este navegador se guarda además en localStorage ("rdr_theme:<email>"
 *   y "rdr_theme", el último usado): un script inline en app/layout.jsx
 *   aplica la clase ANTES del primer paint (sin FOUC).
 * - useAccent(hex): para estilos inline en JS (PALETTE, TRACKS…) devuelve la
 *   TINTA de un acento: en oscuro el acento; en claro Electric (norma BBVA:
 *   ningún acento como texto, icono o línea sobre claro).
 */
const KEY = "rdr_theme";
const AUTH_KEY = "rdr_auth_email";
const claveCuenta = (email) => `${KEY}:${String(email || "").trim().toLowerCase()}`;

/** Tema guardado en este navegador: el de la cuenta con sesión o, si no, el último usado. */
function temaLocal() {
  try {
    const email = localStorage.getItem(AUTH_KEY);
    const t = (email && localStorage.getItem(claveCuenta(email))) || localStorage.getItem(KEY);
    return t === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const ThemeContext = createContext({ theme: "dark", toggle: () => {}, aplicar: () => {}, elegido: 0 });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => (typeof window === "undefined" ? "dark" : temaLocal()));
  // Cuántas veces lo ha cambiado la persona (botón): TemaDeCuenta lo guarda en su cuenta.
  const [elegido, setElegido] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("rdr-light", theme === "light");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {}
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    setElegido((n) => n + 1);
  }, []);
  // Tema que viene de la cuenta (no cuenta como elección: no se vuelve a guardar).
  const aplicar = useCallback((t) => setTheme(t === "light" ? "light" : "dark"), []);

  return <ThemeContext.Provider value={{ theme, toggle, aplicar, elegido }}>{children}</ThemeContext.Provider>;
}

/**
 * Sincroniza el tema con la CUENTA (backend ?app=preferencias, clave
 * preferenciasBackend de links.json). Va dentro de la sesión (AuthGate) y de
 * los enlaces (LinksProvider):
 *  - Al entrar: si la cuenta tiene tema guardado, se aplica. Si no tiene
 *    (primera vez), se le guarda el que esté usando en este navegador.
 *  - Al pulsar el botón de tema: se guarda en la cuenta.
 * Sin backend o sin red, el tema sigue funcionando con lo guardado aquí.
 */
export function TemaDeCuenta({ email, url }) {
  const { theme, aplicar, elegido } = useTheme();
  const leido = useRef(""); // cuenta cuya preferencia ya se ha leído
  const guardar = useCallback((tema) => {
    if (!url || !email) return;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "guardar", email, tema }),
    }).catch(() => {});
  }, [url, email]);

  // Copia local de la cuenta (para el primer paint de la próxima visita).
  useEffect(() => {
    if (!email) return;
    try { localStorage.setItem(claveCuenta(email), theme); } catch {}
  }, [email, theme]);

  const eleccion = useRef(elegido);
  eleccion.current = elegido;
  useEffect(() => {
    if (!url || !email || leido.current === email) return;
    leido.current = email;
    let vivo = true;
    fetch(`${url}${url.includes("?") ? "&" : "?"}action=leer&email=${encodeURIComponent(email)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((r) => {
        // Si en esta visita ya ha pulsado el botón, manda su clic (se guarda abajo).
        if (!vivo || !r || !r.ok || eleccion.current > 0) return;
        if (r.data && r.data.tema) aplicar(r.data.tema);
        else guardar(temaLocal()); // primera vez: su elección actual pasa a la cuenta
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [url, email, aplicar, guardar]);

  // Cambio con el botón: a la cuenta (en cuanto haya backend, si aún no lo hay).
  const ultimo = useRef(0);
  useEffect(() => {
    if (elegido === ultimo.current || !url || !email) return;
    ultimo.current = elegido;
    guardar(theme);
  }, [elegido, theme, guardar]);

  return null;
}

/* Tinta de acento para fondo claro (Sand). Como SUPERFICIE sólida (botones,
   tiles) se sigue usando el hex original literal — funciona en ambos temas. */
/* Manual BBVA (01-color.md): sobre Sand el texto, los iconos y las líneas
   van en Electric/Midnight — la conexión de la marca. Ningún acento va como
   tinta sobre claro: todos pasan a Electric (el color del acento se queda en
   los tintes y rellenos, que usan el hex original). */
const LIGHT_EQ = {
  "#85C8FF": "#001391", // serene  -> Electric (texto principal del manual)
  "#FFB56B": "#001391", // mandarin
  "#88E783": "#001391", // lime
  "#9694FF": "#001391", // purple
  "#FFE761": "#001391", // canary
  "#8BE1E9": "#001391", // aqua
  "#1D7CF4": "#001391", // royal   -> Electric
  "#B9D4EE": "#001391", // hielo (deck qué-es-RDR) -> Electric
  "#F7F8F8": "#070E46", // sand    -> tinta midnight
};

/** Hex temado para UN acento (estilos inline). */
export function useAccent(hex) {
  const { theme } = useTheme();
  if (theme !== "light" || !hex) return hex;
  return LIGHT_EQ[hex.toUpperCase()] || hex;
}

/** Función de mapeo para varios acentos a la vez (p. ej. objetos TRACKS). */
export function useAccentMap() {
  const { theme } = useTheme();
  return useCallback(
    (hex) => (theme === "light" && hex ? LIGHT_EQ[hex.toUpperCase()] || hex : hex),
    [theme]
  );
}
