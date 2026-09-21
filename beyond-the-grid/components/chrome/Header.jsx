"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthGate";
import { useTheme } from "@/lib/theme";

/**
 * Cabecera fija (glass). Sesión + cerrar sesión + logo BBVA.
 * Detecta la ruta actual (vive en AppFrame, persistente): en /formacion muestra
 * el botón de volver al hub y cambia el subtítulo.
 */
export default function Header() {
  const { email, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  // Subtítulo por sección (la coincidencia más específica primero).
  const SUBTITLES = [
    ["/formacion/equipo", "Formaciones del equipo"],
    ["/formacion", "Ruta formativa · niveles 00–06"],
    ["/comidas", "Comidas del equipo"],
    ["/vacaciones", "Vacaciones del equipo"],
    ["/retro", "Retrospectivas del equipo"],
    ["/simulador", "Simulador de rentabilidad · Coordinación"],
    ["/capacidad", "Capacidad del equipo · Coordinación"],
    ["/ofertas", "Generación de ofertas · Coordinación"],
    ["/equipo-gestion", "Gestión del equipo · Coordinación"],
    ["/timereport-gestion", "Time Report · Coordinación"],
    ["/timereport", "Mi Time Report · Equipo"],
    ["/guardias-gestion", "Guardias · Coordinación"],
    ["/guardias", "Guardias del equipo"],
    ["/pases", "Pases calendados · Releases"],
    ["/recursos", "Recursos · Biblioteca RDR"],
    ["/que-es-rdr", "¿Qué es RDR? · Introducción"],
  ];
  const p = pathname || "/";
  const match = SUBTITLES.find(([base]) => p.startsWith(base));
  const backHref = match ? "/" : null;
  const subtitle = match ? match[1] : "Hub de documentación · BBVA × NFQ";

  return (
    // Barra sólida con blur: el contenido pasa POR DEBAJO al hacer scroll,
    // nunca se superpone con el título/sesión.
    <header className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-midnight">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label="Volver al inicio"
            className="inline-flex shrink-0 items-center gap-0 rounded-full border-[1.5px] border-serene/35 bg-midnight/70 p-2.5 font-sans text-xs font-bold uppercase tracking-[0.08em] text-sand shadow-[0_4px_14px_rgba(0,0,0,0.3)] backdrop-blur transition hover:-translate-y-px hover:border-serene/70 hover:bg-midnight/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene min-[460px]:gap-2 min-[460px]:px-4 min-[460px]:py-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="hidden min-[460px]:inline">Inicio</span>
          </Link>
        )}
        {/* Marca compacta en móviles muy estrechos (<460px), donde el título completo se oculta */}
        <span className="font-display text-lg font-bold leading-none text-sand min-[460px]:hidden">RDR</span>
        <div className="hidden min-w-0 min-[460px]:block">
          <h1 className="truncate font-display text-xl font-bold leading-tight tracking-tight text-sand sm:text-2xl md:text-3xl">
            RDR Knowledge
          </h1>
          <p className="mt-0.5 truncate text-xs text-serene/80 sm:text-sm">{subtitle}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        {email && <span className="hidden text-xs text-sand/70 lg:inline">{email}</span>}
        {/* Conmutador de tema claro/oscuro (persistente, sin FOUC) */}
        <button
          type="button"
          onClick={toggle}
          title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="grid h-9 w-9 place-items-center rounded-full border border-serene/30 bg-midnight/70 text-sand transition-colors hover:border-serene active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
        >
          {theme === "dark" ? (
            // Sol -> pasar a claro
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            // Luna -> pasar a oscuro
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={logout}
          className="rounded-full border border-serene/30 bg-midnight/70 px-3 py-2 font-sans text-xs font-bold uppercase tracking-wider text-sand backdrop-blur transition-colors hover:border-serene active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene sm:px-4"
        >
          Salir
        </button>
        {/* Logo oficial BBVA — regla dura nº4: WHITE sobre Midnight, RGB sobre claros. */}
        <img
          src={theme === "light" ? "/team-hub/logos/bbva-rgb.png" : "/team-hub/logos/bbva-white.png?v=2"}
          alt="BBVA"
          className="h-6 w-auto md:h-7"
        />
      </div>
      </div>
    </header>
  );
}
