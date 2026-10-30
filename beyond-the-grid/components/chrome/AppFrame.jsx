"use client";

import { LinksProvider, useLinks } from "@/lib/links";
import { ThemeProvider, TemaDeCuenta } from "@/lib/theme";
import LoadingScreen from "./LoadingScreen";
import AuthGate, { useAuth } from "./AuthGate";
import Header from "./Header";

/* Tema recordado por cuenta (dentro de la sesión y de los enlaces). */
function SincronizarTema() {
  const { email } = useAuth();
  const { getUrl } = useLinks();
  return <TemaDeCuenta email={email} url={getUrl("preferenciasBackend")} />;
}

/* Logo NFQ: el isotipo en color (PNG transparente), igual en los dos modos. */
function NfqLogo() {
  return <img src="/team-hub/logos/nfq-white.png?v=2" alt="NFQ" className="h-6 w-auto" />;
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
