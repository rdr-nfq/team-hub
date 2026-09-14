"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Script from "next/script";
import { normEmail } from "@/lib/email";

/**
 * Puerta de acceso del hub con Google Identity Services (GIS).
 * Porta el script de autenticación del index.html original:
 *   - Solo entran correos presentes en equipo/equipo.json (email o emailBBVA).
 *   - La sesión se cachea en localStorage('rdr_auth_email') y se comparte con
 *     las subpáginas estáticas (que usan la misma clave).
 *   - Detecta coordinadores (campo "coordinador") -> expuesto vía useAuth().
 *
 * IMPORTANTE: el origen de despliegue debe estar autorizado en Google Cloud
 * Console (Credenciales OAuth -> Orígenes JS). Añade:
 *   https://rdr-nfq.github.io   y   http://localhost:3000
 */
const AUTH_KEY = "rdr_auth_email";
const EQUIPO_URL = "/team-hub/equipo/equipo.json"; // absoluto: funciona desde / y /formacion/
const GOOGLE_CLIENT_ID =
  "535974839401-54e3t5n61nbc0c31corcfr56gplj8svl.apps.googleusercontent.com";

const AuthContext = createContext({ email: null, isCoordinador: false, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

function decodeJwt(tok) {
  try {
    return JSON.parse(
      decodeURIComponent(
        escape(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
      )
    );
  } catch {
    return null;
  }
}

export default function AuthGate({ children, onAuthed }) {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState(null);
  const [isCoordinador, setCoord] = useState(false);
  const [msg, setMsg] = useState("");
  const [configErr, setConfigErr] = useState("");
  const [teamErr, setTeamErr] = useState("");

  const team = useRef([]);
  const btnRef = useRef(null);

  // Solo se permite el correo NFQ (p.email). El @bbva.com (emailBBVA) NO entra.
  // Los dos lados se normalizan: un espacio de más en equipo.json dejaba a esa
  // persona sin poder entrar, sin que nada lo explicara.
  const emailPermitido = useCallback((e) => {
    const x = normEmail(e);
    if (!x) return false;
    return team.current.some((p) => normEmail(p.email) === x);
  }, []);

  const esCoordinador = useCallback((e) => {
    const x = normEmail(e);
    const m = team.current.find((p) => normEmail(p.email) === x);
    return !!(m && m.coordinador);
  }, []);

  const entrar = useCallback(
    (e) => {
      const lower = e.toLowerCase();
      localStorage.setItem(AUTH_KEY, lower);
      setEmail(lower);
      setCoord(esCoordinador(lower));
      setAuthed(true);
      onAuthed && onAuthed();
    },
    [esCoordinador, onAuthed]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    try {
      if (window.google && window.google.accounts)
        window.google.accounts.id.disableAutoSelect();
    } catch {}
    window.location.reload();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTeam() {
      try {
        const eq = await fetch(EQUIPO_URL, { cache: "no-store" }).then((r) => r.json());
        team.current = eq.team || [];
      } catch {
        team.current = [];
      }
    }

    async function onCredential(resp) {
      const data = decodeJwt(resp && resp.credential);
      await loadTeam();
      const mail = data && data.email_verified && data.email ? data.email : null;
      if (mail && emailPermitido(mail)) {
        setMsg("");
        entrar(mail);
      } else {
        setMsg(
          data && data.email
            ? `El correo ${data.email} no pertenece al equipo RDR. Usa tu cuenta @nfq.es, @nter.es o @nfq.mx del equipo.`
            : "No se pudo verificar el correo. Inténtalo de nuevo."
        );
        try {
          window.google?.accounts?.id?.disableAutoSelect();
        } catch {}
      }
    }

    function waitForGoogle(cb, n = 0) {
      if (window.google?.accounts?.id) return cb();
      if (n > 60) {
        setConfigErr("No se pudo cargar Google Sign-In (¿bloqueo de red/proxy?). Recarga.");
        return;
      }
      setTimeout(() => waitForGoogle(cb, n + 1), 150);
    }

    (async function boot() {
      await loadTeam();
      if (cancelled) return;

      // Si el equipo no cargó (red/proxy corporativo), avisa: nadie podría entrar.
      if (!team.current.length)
        setTeamErr("No se pudo cargar la lista del equipo (¿red o proxy corporativo?). Recarga la página.");

      // 1) ¿sesión cacheada válida?
      const cached = localStorage.getItem(AUTH_KEY);
      if (cached && emailPermitido(cached)) {
        entrar(cached);
        return;
      }
      if (cached) localStorage.removeItem(AUTH_KEY);

      // 2) inicializa GIS y pinta el botón
      waitForGoogle(() => {
        if (cancelled) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: onCredential,
          auto_select: true,
          cancel_on_tap_outside: false,
        });
        if (btnRef.current) {
          window.google.accounts.id.renderButton(btnRef.current, {
            theme: "filled_blue",
            size: "large",
            text: "signin_with",
            shape: "pill",
            logo_alignment: "center",
            width: 300,
          });
        }
        window.google.accounts.id.prompt(); // One-Tap
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [emailPermitido, entrar]);

  return (
    <AuthContext.Provider value={{ email, isCoordinador, logout }}>
      {/* Carga la librería de Google Identity Services */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {authed ? (
        children
      ) : (
        // Overlay de login. El Canvas 3D queda visible detrás (backdrop translúcido).
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-midnight/80 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-serene/20 bg-white/5 p-10 text-center backdrop-blur-xl">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-serene">
              RDR Knowledge · BBVA × NFQ
            </p>
            <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-sand">
              Acceso del equipo RDR
            </h1>
            <p className="mt-3 text-pretty text-sm text-sand/70">
              Inicia sesión con tu cuenta de Google del equipo para entrar al hub.
            </p>

            <div ref={btnRef} className="mt-8 flex justify-center" />

            {msg && <p className="mt-4 text-sm text-mandarin">{msg}</p>}
            {configErr && <p className="mt-4 text-sm text-mandarin">{configErr}</p>}
            {teamErr && <p className="mt-4 text-sm text-mandarin">{teamErr}</p>}

            <p className="mt-8 text-xs text-sand/70">
              Válido con tu correo <b>@nfq.es</b>, <b>@nter.es</b> o <b>@nfq.mx</b> del equipo.
            </p>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
