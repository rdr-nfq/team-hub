// Helpers de UI compartidos por el hub y la ruta de formación.

/* Acentos BBVA -> su variable de decoración (app/globals.css): en oscuro el
   propio acento; en claro, Serene (el acento natural del fondo Sand: nada de
   mandarin, lime… como tinte, borde o brillo sobre claro). */
const DECOR = { "85C8FF": "serene", "FFB56B": "mandarin", "88E783": "lime", "9694FF": "purple", "FFE761": "canary", "8BE1E9": "aqua" };

/** HEX (#rrggbb) -> color con alfa. Para tintar bordes/fondos/spotlights por
    acento: los acentos BBVA siguen el tema (ver DECOR); el resto, tal cual. */
export const rgba = (hex, a) => {
  const h = hex.replace("#", "");
  const decor = DECOR[h.toUpperCase()];
  if (decor) return `rgb(var(--ct-${decor}) / ${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

/** Relleno sólido DECORATIVO de un acento (puntos de sección, leyendas…):
    en claro, Serene. Para marcas de datos que deben distinguirse, el hex. */
export const solido = (hex) => rgba(hex, 1);

/** Estilo de un elemento ACTIVO o una etiqueta con relleno de acento (filtro
    seleccionado, chip de categoría…): en oscuro el acento con texto Electric;
    en claro Electric con texto Sand (el botón principal de BBVA). */
export const activo = (hex) => {
  const decor = DECOR[String(hex).replace("#", "").toUpperCase()];
  if (!decor) return { backgroundColor: hex, borderColor: hex, color: "#001391" };
  return { backgroundColor: `rgb(var(--ca-${decor}))`, borderColor: `rgb(var(--ca-${decor}))`, color: "var(--ca-tinta)" };
};

/** Entero -> cadena de 2 cifras con cero a la izquierda (01, 02, … para niveles). */
export const n2 = (n) => String(n).padStart(2, "0");
