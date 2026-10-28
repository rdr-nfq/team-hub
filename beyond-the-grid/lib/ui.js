// Helpers de UI compartidos por el hub y la ruta de formación.

/* Acentos BBVA -> sus variables por uso (app/globals.css). En oscuro, el
   propio acento. En claro: los TINTES (alfa bajo: fondos, cuadros de icono)
   siguen en el acento y más intensos; las LÍNEAS (alfa alto: bordes, brillos)
   pasan a Electric suave, porque un acento en línea fina no se lee sobre claro. */
const DECOR = { "85C8FF": "serene", "FFB56B": "mandarin", "88E783": "lime", "9694FF": "purple", "FFE761": "canary", "8BE1E9": "aqua" };

/** HEX (#rrggbb) -> color con alfa. Para tintar bordes/fondos/spotlights por
    acento: los acentos BBVA siguen el tema (ver DECOR); el resto, tal cual. */
export const rgba = (hex, a) => {
  const h = hex.replace("#", "");
  const decor = DECOR[h.toUpperCase()];
  if (decor) return a <= 0.25 ? `rgb(var(--ct-${decor}) / calc(${a} * var(--k-bg)))` : `rgb(var(--cl-${decor}) / calc(${a} * var(--k-linea)))`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

/** Relleno sólido de un acento (puntos de sección, franjas, leyendas): el
    acento en ambos temas. */
export const solido = (hex) => {
  const decor = DECOR[String(hex).replace("#", "").toUpperCase()];
  return decor ? `rgb(var(--c-${decor}))` : hex;
};

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
