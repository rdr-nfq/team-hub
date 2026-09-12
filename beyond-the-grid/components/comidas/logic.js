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
 * Recuento de una semana.
 * - noEstoy / taperGlovo tienen prioridad sobre la elección.
 * - RANKING de restaurantes: suma los votos de prioridad 1 y los de
 *   prioridad 2 (valen lo mismo). La web enseña el 1º y el 2º del ranking.
 * - Quien vota flexible NO suma al ranking: se une a la opción ganadora.
 * - Desempate: primero quien tenga más votos de prioridad 1 y, si siguen
 *   iguales, por orden alfabético.
 */
export function computeWeek(votos, semana) {
  const v = votos.filter((x) => x.semana === semana);
  const rank = {}; // restaurante -> { n1, n2, quien: [] }
  let flex = 0, taper = 0, no = 0;
  const whoTaper = [], whoNo = [], whoFlex = [];
  const anota = (nombre, persona, prioridad) => {
    const r = (rank[nombre] = rank[nombre] || { n1: 0, n2: 0, quien: [] });
    if (prioridad === 1) r.n1++; else r.n2++;
    if (!r.quien.includes(persona)) r.quien.push(persona);
  };
  v.forEach((x) => {
    if (norm(x.noEstoy)) { no++; whoNo.push(x.companero); return; }
    if (norm(x.taperGlovo)) { taper++; whoTaper.push(x.companero); return; }
    const e1 = (x.eleccion1 || "").trim();
    const e2 = (x.eleccion2 || "").trim();
    if (!e1 || e1 === FLEX) { flex++; whoFlex.push(x.companero); return; } // no suma
    anota(e1, x.companero, 1);
    if (e2 && e2 !== FLEX) anota(e2, x.companero, 2);
  });
  const sorted = Object.entries(rank).sort(
    (a, b) =>
      (b[1].n1 + b[1].n2) - (a[1].n1 + a[1].n2) || // más votos en total
      b[1].n1 - a[1].n1 ||                         // a igualdad, más de prioridad 1
      a[0].localeCompare(b[0])
  );
  const puesto = (i) =>
    sorted[i]
      ? { nombre: sorted[i][0], n: sorted[i][1].n1 + sorted[i][1].n2, n1: sorted[i][1].n1, n2: sorted[i][1].n2, quien: sorted[i][1].quien }
      : null;
  return {
    total: v.length,
    ranking: sorted.map((x) => x[0]),
    r1: puesto(0), r2: puesto(1),
    flex, taper, no, whoTaper, whoNo, whoFlex,
  };
}
