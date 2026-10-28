import { PALETTE } from "@/lib/palette";

/* Sección del índice a la que pertenece cada página: su acento pinta la
   franja bajo la cabecera, en los dos modos, para saber dónde se está. */
const SECCIONES = [
  [/^\/(vacaciones|guardias|timereport)-gestion|^\/(simulador|capacidad|ofertas|equipo-gestion|seguimiento)/, "Coordinación", PALETTE.purple],
  [/^\/(formacion|formaciones|welcome-packs|que-es-rdr)/, "Formación", PALETTE.serene],
  [/^\/(comidas|vacaciones|retro|timereport|guardias)/, "Equipo", PALETTE.mandarin],
  [/^\/(pases|recursos)/, "RDR", PALETTE.lime],
];

/** Colores de las secciones en el orden de las columnas del índice. */
export const SECCIONES_INDICE = [PALETTE.serene, PALETTE.mandarin, PALETTE.lime, PALETTE.purple];

/** { nombre, color } de la sección de una ruta, o null (índice). */
export function seccionDe(pathname) {
  const s = SECCIONES.find(([re]) => re.test(pathname || "/"));
  return s ? { nombre: s[1], color: s[2] } : null;
}
