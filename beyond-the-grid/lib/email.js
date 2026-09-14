/**
 * Normalización de correos del equipo.
 *
 * Los correos de equipo.json se teclean a mano en /equipo-gestion, así que
 * pueden llegar con espacios de más (" natalia.jimenez@nfq.es"). La identidad
 * que devuelve Google viene limpia, de modo que una comparación directa falla
 * y esa persona no entra en la web ni se reconoce en comidas, retro o su Time
 * Report. Cualquier comparación de correos pasa por aquí.
 */
export const normEmail = (e) => String(e ?? "").trim().toLowerCase();

/** ¿Son el mismo correo, ignorando espacios y mayúsculas? */
export const mismoEmail = (a, b) => {
  const x = normEmail(a);
  return !!x && x === normEmail(b);
};
