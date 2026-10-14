import { PALETTE } from "./palette";

/* Equipos del Reference Data & Surveillance Hub. Cada persona de equipo.json
   lleva "equipos": ["rdr", …] (se edita en Gestión de equipo); quien no lo
   tiene es de RDR (la plantilla original). El hub enseña la columna de
   proyectos del equipo de quien entra. Los tres en verde (lime), el color de
   la columna de proyectos. */
export const EQUIPOS = [
  { id: "rdr", nombre: "RDR", corto: "RDR", largo: "Reference Data Repository", color: PALETTE.lime },
  { id: "market-abuse", nombre: "Market Abuse", corto: "MA", largo: "Market Abuse", color: PALETTE.lime },
  { id: "comms-surveillance", nombre: "Comms Surveillance", corto: "CS", largo: "Communications Surveillance", color: PALETTE.lime },
];
export const EQUIPO = Object.fromEntries(EQUIPOS.map((e) => [e.id, e]));
export const EQUIPO_DEFECTO = "rdr";

/** Equipos de un miembro de equipo.json (válidos y en el orden de EQUIPOS). */
export function equiposDe(miembro) {
  const v = miembro && miembro.equipos;
  const lista = Array.isArray(v) ? v : typeof v === "string" && v ? v.split(/[,;]/) : [];
  const ids = lista.map((x) => String(x).trim().toLowerCase()).filter((x) => EQUIPO[x]);
  return ids.length ? EQUIPOS.map((e) => e.id).filter((id) => ids.includes(id)) : [EQUIPO_DEFECTO];
}
