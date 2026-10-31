import { PALETTE } from "@/lib/palette";

/* Secciones del hub: su color BBVA y sus páginas. La cabecera pinta, bajo la
   barra, las pestañas de la sección de la página actual (para saltar de Time
   Report a Vacaciones sin volver al inicio); la portada usa los mismos
   nombres, colores e iconos. Una pestaña está activa si la ruta empieza por
   alguno de sus `rutas` (la primera es el destino del enlace); `desc` es la
   línea que acompaña al nombre en las baldosas y `claves`, otras palabras con
   las que el buscador de la portada la encuentra. */
export const SECCIONES = [
  {
    id: "equipo", nombre: "Equipo", color: PALETTE.mandarin,
    paginas: [
      { label: "Time Report", rutas: ["/timereport"], desc: "Tu imputación de la quincena", icono: "clock", claves: "imputar horas quincena" },
      { label: "Vacaciones", rutas: ["/vacaciones"], desc: "Calendario, saldo y política", icono: "aeroplane", claves: "ausencias días libres permisos" },
      { label: "Guardias", rutas: ["/guardias"], desc: "Solicita y consulta tus guardias", icono: "alarm", claves: "turnos disponibilidad" },
      { label: "Comidas", rutas: ["/comidas"], desc: "Restaurante de los jueves", icono: "coffeeshop", claves: "votar votación comer" },
      { label: "Retrospectiva", rutas: ["/retro"], desc: "Retros y mejoras", icono: "feedback", claves: "retro sprint" },
    ],
  },
  {
    id: "proyectos", nombre: "Proyectos", color: PALETTE.lime,
    paginas: [
      { label: "Pases Calendados", rutas: ["/pases"], desc: "Releases por entorno y ciclo del pase", icono: "automate", claves: "despliegue producción entornos" },
      // Fuera de la portada; la pestaña solo aparece estando en Recursos.
      { label: "Recursos", rutas: ["/recursos"], icono: "bookstore", soloActiva: true },
    ],
  },
  {
    id: "formacion", nombre: "Formación", color: PALETTE.serene,
    paginas: [
      { label: "HUB Formativo", rutas: ["/formaciones", "/formacion"], desc: "Tu ruta formativa", icono: "cultureandtalent", claves: "formación cursos certificados" },
      { label: "Welcome Packs", rutas: ["/welcome-packs", "/que-es-rdr"], desc: "Qué es RDR, Market Abuse y Comms", icono: "bookstore", claves: "bienvenida introducción" },
    ],
  },
  {
    id: "gestion", nombre: "Gestión", color: PALETTE.purple, coordinacion: true,
    paginas: [
      { label: "Time Report del equipo", rutas: ["/timereport-gestion"], desc: "Proyectos y reparto de horas", icono: "wikimetrics", claves: "imputaciones horas" },
      { label: "Vacaciones del equipo", rutas: ["/vacaciones-gestion"], desc: "Solicitudes, saldos y festivos", icono: "children", claves: "aprobar ausencias" },
      { label: "Guardias del equipo", rutas: ["/guardias-gestion"], desc: "Solicitudes por aprobar", icono: "clientok", claves: "aprobar turnos" },
      { label: "Ofertas", rutas: ["/ofertas"], desc: "Generador de ofertas", icono: "commercialoffer", claves: "propuestas presupuesto" },
      { label: "Seguimiento RDR", rutas: ["/seguimiento"], desc: "Presentación de seguimiento (.pptx)", icono: "document", claves: "informe powerpoint" },
      { label: "Gestión de equipo", rutas: ["/equipo-gestion"], desc: "Miembros, roles y tracks", icono: "directory", claves: "personas" },
      // Ocultas en el hub; solo como pestaña estando en ellas.
      { label: "Simulador", rutas: ["/simulador"], icono: "wikimetrics", soloActiva: true },
      { label: "Capacidad", rutas: ["/capacidad"], icono: "directory", soloActiva: true },
    ],
  },
];

const SECCION = Object.fromEntries(SECCIONES.map((s) => [s.id, s]));
export const seccion = (id) => SECCION[id];

// "/vacaciones" no debe activar "/vacaciones-gestion": coincide la ruta o una subruta.
const coincide = (p, base) => p === base || p.startsWith(base + "/");

/** Sección y pestaña de una ruta: { seccion, pagina } o null (portada y /gestion sin pestaña). */
export function seccionDe(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  for (const s of SECCIONES)
    for (const pg of s.paginas)
      if (pg.rutas.some((r) => coincide(p, r))) return { seccion: s, pagina: pg };
  return null;
}

/** Accesos visibles de una sección (sin las páginas ocultas), listos para pintar baldosas. */
export const accesos = (id) =>
  seccion(id).paginas.filter((pg) => !pg.soloActiva).map((pg) => ({ label: pg.label, ruta: pg.rutas[0], icono: pg.icono, desc: pg.desc, claves: pg.claves }));

/** Página de Gestión (botón de la cabecera, enlace guardable para coordinación). */
export const GESTION = { label: "Gestión", ruta: "/gestion", icono: "digitalsignature", desc: "Todas las herramientas de coordinación", claves: "coordinación" };
