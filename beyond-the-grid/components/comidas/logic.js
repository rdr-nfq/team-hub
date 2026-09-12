// Lógica de negocio de Comidas — portada 1:1 de public/comidas.html.
// Sin dependencias de React: funciones puras + constantes, testeables y
// reutilizadas por los componentes de la ruta /comidas.

/** Voto "flexible": el usuario se une a la opción más votada. */
export const FLEX = "El que más se vote";

/** Fallback (solo si no hay backend): restaurantes base para previsualizar. */
export const FALLBACK_RESTAURANTES = [
  { nombre: "Beefius", descCorta: "", carta: "https://www.beefcious.com/menu-beefcious/", foto: "https://www.beefcious.com/wp-content/uploads/2025/07/interior-las-tablas-1024x683.webp", descLarga: "" },
  { nombre: "Kyoka", descCorta: "", carta: "https://kyoka.es/madrid-las-tablas/", foto: "", descLarga: "" },
  { nombre: "Thai", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Indio", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Mano de pablo", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Goiko", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Macao", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Peruano", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "Auten", descCorta: "", carta: "", foto: "", descLarga: "" },
  { nombre: "80 Grados", descCorta: "", carta: "", foto: "", descLarga: "" },
];

/** Semanas de ejemplo (próximos jueves de oficina) si no hay backend. */
export const FALLBACK_SEMANAS = ["18/06/2026", "25/06/2026", "03/09/2026", "10/09/2026"].map((f) => ({ fecha: f, oficina: true }));

/** "dd/mm/yyyy" -> Date local (misma semántica que el legacy). */
export function parseDMY(s) {
  const [d, m, y] = String(s).split("/").map(Number);
  return new Date(y, m - 1, d);
}

/** Hoy a las 00:00 (para comparar fechas de semana). */
export function hoy0() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

/** "dd/mm/yyyy" -> "jueves, 18 de junio". */
export function fmtLargo(s) {
  return parseDMY(s).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}

export const capitaliza = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** El Sheet devuelve booleanos o "Sí"/"Si" según la columna: normaliza. */
export const norm = (b) => b === true || String(b).toLowerCase() === "sí" || String(b).toLowerCase() === "si";

/** Jueves votables: de oficina y de hoy en adelante. */
export function semanasVotables(semanas) {
  const t = hoy0();
  return semanas.filter((s) => s.oficina && parseDMY(s.fecha) >= t);
}

/** Semanas pasadas de oficina, más recientes primero. */
export function semanasPasadas(semanas) {
  const t = hoy0();
  return semanas
    .filter((s) => s.oficina && parseDMY(s.fecha) < t)
    .sort((a, b) => parseDMY(b.fecha) - parseDMY(a.fecha));
}

/**
 * Recuento de una semana:
 * - noEstoy / taperGlovo tienen prioridad sobre la elección.
 * - Sin eleccion1 (o FLEX) cuenta como flexible.
 * - Si TODO EL MUNDO vota flexible no habría ganador, así que en ese caso
 *   decide la SEGUNDA opción de quien la haya puesto (el resto de flexibles
 *   se une igual). Se marca con `porSegunda` para poder decirlo en pantalla.
 * - Desempate del ranking: nº de votos desc y, a igualdad, alfabético.
 */
export function computeWeek(votos, semana) {
  const v = votos.filter((x) => x.semana === semana);
  const count = {}, whoRest = {};    // primeras opciones
  const count2 = {}, whoRest2 = {};  // segundas opciones de quien va flexible
  let flex = 0, taper = 0, no = 0;
  const whoTaper = [], whoNo = [], whoFlex = [];
  v.forEach((x) => {
    if (norm(x.noEstoy)) { no++; whoNo.push(x.companero); return; }
    if (norm(x.taperGlovo)) { taper++; whoTaper.push(x.companero); return; }
    const e1 = (x.eleccion1 || "").trim();
    const e2 = (x.eleccion2 || "").trim();
    if (!e1 || e1 === FLEX) {
      flex++;
      whoFlex.push(x.companero);
      if (e2 && e2 !== FLEX) {
        count2[e2] = (count2[e2] || 0) + 1;
        (whoRest2[e2] = whoRest2[e2] || []).push(x.companero);
      }
    } else {
      count[e1] = (count[e1] || 0) + 1;
      (whoRest[e1] = whoRest[e1] || []).push(x.companero);
    }
  });
  const orden = (c) => Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Nadie ha elegido restaurante en primera opción: manda la segunda.
  const porSegunda = orden(count).length === 0 && orden(count2).length > 0;
  const sorted = porSegunda ? orden(count2) : orden(count);
  const quienes = porSegunda ? whoRest2 : whoRest;
  const puesto = (i) =>
    sorted[i] ? { nombre: sorted[i][0], n: sorted[i][1], quien: quienes[sorted[i][0]] } : null;
  const r1 = puesto(0), r2 = puesto(1);
  // Flexibles que NO están ya contados en el ranking (si decide la segunda
  // opción, quien la puso ya aparece en su tarjeta: no se cuenta dos veces).
  const contados = porSegunda ? (r1 ? r1.n : 0) + (r2 ? r2.n : 0) : 0;
  return {
    total: v.length,
    r1, r2, porSegunda,
    flex, flexExtra: Math.max(0, flex - contados),
    taper, no, whoTaper, whoNo, whoFlex,
  };
}
