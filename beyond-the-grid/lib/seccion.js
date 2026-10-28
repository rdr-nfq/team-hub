import { PALETTE } from "@/lib/palette";

/* Sección del índice a la que pertenece cada página. En modo claro su acento
   pinta la franja bajo la cabecera y la banda de la cabecera de la página,
   para saber siempre dónde se está (en oscuro ya lo marcan los acentos). */
const SECCIONES = [
  [/^\/(vacaciones|guardias|timereport)-gestion|^\/(simulador|capacidad|ofertas|equipo-gestion|seguimiento)/, "Coordinación", PALETTE.purple],
  [/^\/(formacion|formaciones|welcome-packs|que-es-rdr)/, "Formación", PALETTE.serene],
  [/^\/(comidas|vacaciones|retro|timereport|guardias)/, "Equipo", PALETTE.mandarin],
  [/^\/(pases|recursos)/, "RDR", PALETTE.lime],
];

/** { nombre, color } de la sección de una ruta, o null (índice). */
export function seccionDe(pathname) {
  const s = SECCIONES.find(([re]) => re.test(pathname || "/"));
  return s ? { nombre: s[1], color: s[2] } : null;
}
