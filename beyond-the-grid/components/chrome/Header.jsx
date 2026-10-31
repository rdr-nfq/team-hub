"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthGate";
import { useTheme } from "@/lib/theme";
import { seccionDe } from "@/lib/seccion";
import IconoBBVA from "@/components/iconosBBVA";

const PILL =
  "inline-flex h-9 items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#85C8FF]";

/**
 * Cabecera fija, igual en todas las páginas (vive en AppFrame).
 * - Barra Electric en los dos temas: nombre del hub (vuelve al inicio),
 *   Gestión (solo coordinación), correo, tema, Salir y logo BBVA.
 * - En las páginas de una sección, debajo, sus pestañas (lib/seccion.js):
 *   se salta de Time Report a Vacaciones sin pasar por la portada.
 * Altura: 56px la barra + 45px las pestañas. globals.css la publica en
 * --cabecera para que las páginas dejen su hueco (.pt-cabecera, .top-cabecera).
 */
export default function Header() {
  const { email, isCoordinador, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const actual = seccionDe(pathname);
  const enGestion = (pathname || "").replace(/\/+$/, "") === "/gestion" || actual?.seccion.id === "gestion";
  const pestanas = actual && (!actual.seccion.coordinacion || isCoordinador)
    ? actual.seccion.paginas.filter((pg) => !pg.soloActiva || pg === actual.pagina)
    : null;
  const textoTema = theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="bg-electric text-[#F7F8F8]">
        <div className="mx-auto flex h-14 w-full max-w-[1376px] items-center gap-4 px-4 sm:px-8">
          <Link href="/" className="whitespace-nowrap rounded-md font-display text-[19px] font-bold leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#85C8FF]">
            <span className="hidden min-[1180px]:inline">Reference Data &amp; Surveillance Hub</span>
            <span className="min-[1180px]:hidden">RD&amp;S Hub</span>
          </Link>

          <div className="ml-auto flex items-center gap-2.5">
            {isCoordinador && (
              <Link
                href="/gestion"
                aria-current={enGestion ? "page" : undefined}
                aria-label="Gestión"
                className={`${PILL} rdr-btn-gestion text-[#001391]`}
              >
                <IconoBBVA nombre="directory" size={17} />
                <span className="hidden sm:inline">Gestión</span>
              </Link>
            )}
            {email && <span className="hidden text-sm text-[#85C8FF] lg:inline">{email}</span>}
            <button
              type="button"
              onClick={toggle}
              title={textoTema}
              aria-label={textoTema}
              className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-[#F7F8F8]/55 transition-colors hover:border-[#F7F8F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#85C8FF]"
            >
              {/* Contraste: el círculo medio relleno gira al cambiar de tema. */}
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform duration-300 ${theme === "dark" ? "rotate-180" : ""}`}>
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
              </svg>
            </button>
            <button type="button" onClick={logout} className={`${PILL} border-[#F7F8F8]/55 hover:border-[#F7F8F8]`}>
              Salir
            </button>
            {/* Logo oficial BBVA en blanco: la barra es Electric en los dos temas. */}
            <img src="/team-hub/logos/bbva-white.png?v=2" alt="BBVA" className="ml-1 h-5 w-auto" />
          </div>
        </div>
      </div>

      {pestanas && (
        <nav aria-label={actual.seccion.nombre} className="rdr-pestanas border-b border-white/15 bg-midnight">
          <div className="mx-auto flex h-11 w-full max-w-[1376px] items-stretch gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-8">
            <span className="mr-2 flex shrink-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.05em] text-sand/70">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: actual.seccion.color }} />
              {actual.seccion.nombre}
            </span>
            {pestanas.map((pg) => {
              const activa = pg === actual.pagina;
              return (
                <Link
                  key={pg.label}
                  href={pg.rutas[0]}
                  aria-current={activa ? "page" : undefined}
                  className={`flex shrink-0 items-center whitespace-nowrap border-b-[3px] px-3 pt-[3px] text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${activa ? "text-sand" : "border-transparent text-sand/65 hover:text-sand"}`}
                  style={activa ? { borderColor: actual.seccion.color } : undefined}
                >
                  {pg.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
