"use client";

import { usePathname } from "next/navigation";
import { LinksProvider, useLinks } from "@/lib/links";
import { seccionDe } from "@/lib/seccion";
import { rgba } from "@/lib/ui";
import { ThemeProvider, TemaDeCuenta, useTheme } from "@/lib/theme";
import LoadingScreen from "./LoadingScreen";
import AuthGate, { useAuth } from "./AuthGate";
import Header from "./Header";

/* Tema recordado por cuenta (dentro de la sesión y de los enlaces). */
function SincronizarTema() {
  const { email } = useAuth();
  const { getUrl } = useLinks();
  return <TemaDeCuenta email={email} url={getUrl("preferenciasBackend")} />;
}

/* Modo claro: banda del color de la sección detrás de la cabecera de cada
   página (título y descripción), para saber dónde se está. El acento va de
   relleno suave y el texto encima sigue en Electric (norma BBVA). */
function BandaSeccion() {
  const { theme } = useTheme();
  const seccion = seccionDe(usePathname());
  if (theme !== "light" || !seccion) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[300px]"
      style={{ background: `linear-gradient(to bottom, ${rgba(seccion.color, 0.16)} 0%, ${rgba(seccion.color, 0.16)} 70%, transparent 100%)` }}
    />
  );
}

/* Logo NFQ según tema (blanco sobre Midnight, negro sobre Sand). */
function NfqLogo() {
  const { theme } = useTheme();
  const src = theme === "light" ? "/team-hub/logos/nfq-black.png" : "/team-hub/logos/nfq-white.png?v=2";
  return <img src={src} alt="NFQ" className="h-6 w-auto" />;
}

/**
 * Chrome PERSISTENTE de la app: proveedor de enlaces + splash (1×sesión) +
 * puerta de acceso + cabecera + co-branding NFQ.
 *
 * Transiciones: el SPA (index <-> /formacion) lo anima next-view-transitions
 * (provider en el layout). Las páginas .html llevan SU PROPIO splash de carga;
 * el hub solo navega (con prerender en hover vía Speculation Rules). Sin velos
 * ni barras propias para no apilar pantallas de carga.
 */
export default function AppFrame({ children }) {
  return (
    <ThemeProvider>
      <LinksProvider>
        <LoadingScreen />
        <AuthGate>
          <SincronizarTema />
          <div className="relative isolate min-h-dvh w-full">
            <BandaSeccion />
            <Header />
            {children}
            {/* Co-branding NFQ (regla nº5 CLAUDE.md: presente y menor que BBVA). */}
            <footer className="pointer-events-none fixed bottom-3 left-5 z-30 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.25em] text-sand/60">Hecho por</span>
              <NfqLogo />
            </footer>
          </div>
        </AuthGate>
      </LinksProvider>
    </ThemeProvider>
  );
}
