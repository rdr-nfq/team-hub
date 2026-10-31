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

/* Logo NFQ con nombre (PNG transparente): «nfq» en Midnight sobre claro y en
   blanco sobre oscuro; globals.css enseña el del tema activo. */
function NfqLogo() {
  return (
    <>
      <img src="/team-hub/logos/nfq-claro.png" alt="NFQ" className="rdr-solo-claro h-[18px] w-auto" />
      <img src="/team-hub/logos/nfq-oscuro.png" alt="NFQ" className="rdr-solo-oscuro h-[18px] w-auto" />
    </>
  );
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
            {/* Co-branding NFQ (regla nº5 CLAUDE.md: presente y menor que BBVA).
                Al final de la página, sin tapar contenido. */}
            <footer className="mx-auto flex w-full max-w-[1376px] items-center gap-2.5 px-4 pb-5 pt-2 text-[13px] text-sand/75 sm:px-8">
              Hecho por <NfqLogo />
            </footer>
          </div>
        </AuthGate>
      </LinksProvider>
    </ThemeProvider>
  );
}
