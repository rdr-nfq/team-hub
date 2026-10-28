const ACENTOS = ["serene", "lime", "canary", "aqua", "purple", "mandarin"];
// Texto, iconos y anillos: --t-* (en claro, Electric).
const ACENTO_TINTA = Object.fromEntries(ACENTOS.map((c) => [c, `rgb(var(--t-${c}) / <alpha-value>)`]));
// Bordes: --cl-* (en claro, Electric suave: --k-linea).
const ACENTO_LINEA = Object.fromEntries(ACENTOS.map((c) => [c, ({ opacityValue }) =>
  opacityValue === undefined || String(opacityValue).startsWith("var(")
    ? `rgb(var(--cl-${c}) / ${opacityValue ?? 1})`
    : `rgb(var(--cl-${c}) / calc(${opacityValue} * var(--k-linea)))`,
]));
/* Fondos: un relleno SÓLIDO (bg-lime: barras, puntos, botones) es el acento
   BBVA (--c-*); un TINTE (bg-lime/10, con alfa) es --ct-* (también el acento)
   con el alfa reforzado en claro por --k-bg. */
const ACENTO_FONDO = Object.fromEntries(ACENTOS.map((c) => [c, ({ opacityValue }) =>
  opacityValue === undefined || String(opacityValue).startsWith("var(")
    ? `rgb(var(--c-${c}) / ${opacityValue ?? 1})`
    : `rgb(var(--ct-${c}) / calc(${opacityValue} * var(--k-bg)))`,
]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        // BBVA: Source Serif 4 (titulares) + Lato (texto). Vars de next/font.
        display: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-lato)", "system-ui", "sans-serif"],
      },
      colors: {
        // Paleta BBVA vía variables CSS por tema (:root / html.rdr-light en
        // app/globals.css): bg-midnight, text-sand, border-white/12… cambian
        // solas entre oscuro y claro. Electric es fijo (funciona en ambos).
        // Para SUPERFICIES que no deben cambiar con el tema (botón lime, tile
        // serene…) usar el literal: bg-[#88E783]. lib/palette.js replica los
        // hex oscuros para estilos inline; lib/theme.js los tema (useAccent).
        midnight: "rgb(var(--c-midnight) / <alpha-value>)",
        electric: "#001391",
        serene: "rgb(var(--c-serene) / <alpha-value>)",
        sand: "rgb(var(--c-sand) / <alpha-value>)",
        canary: "rgb(var(--c-canary) / <alpha-value>)",
        lime: "rgb(var(--c-lime) / <alpha-value>)",
        aqua: "rgb(var(--c-aqua) / <alpha-value>)",
        purple: "rgb(var(--c-purple) / <alpha-value>)",
        mandarin: "rgb(var(--c-mandarin) / <alpha-value>)",
        white: "rgb(var(--c-white) / <alpha-value>)",
      },
      /* Norma BBVA en claro (fondo Sand): el acento de cada sección como
         RELLENO, y el texto, los iconos y las líneas en Electric. Por eso un
         acento lee una variable distinta según el uso (app/globals.css):
         texto/iconos/anillos -> --t-*, bordes -> --cl-*, tintes -> --ct-*,
         rellenos sólidos -> --c-*. En oscuro todas son el mismo acento. */
      textColor: ACENTO_TINTA,
      /* bg-white/[0.055]… (cristal de las tarjetas): en claro, blanco sólido
         (--k-tarjeta multiplica el alfa). Bordes y texto «white» siguen con
         --c-white (Gray 5 en claro). */
      backgroundColor: {
        ...ACENTO_FONDO,
        white: ({ opacityValue }) =>
          opacityValue === undefined || String(opacityValue).startsWith("var(")
            ? `rgb(var(--c-white) / ${opacityValue ?? 1})`
            : `rgb(var(--c-tarjeta) / min(1, calc(${opacityValue} * var(--k-tarjeta))))`,
      },
      fill: ACENTO_TINTA,
      stroke: ACENTO_TINTA,
      borderColor: ACENTO_LINEA,
      ringColor: ACENTO_TINTA,
      outlineColor: ACENTO_TINTA,
      divideColor: ACENTO_TINTA,
      textDecorationColor: ACENTO_TINTA,
    },
  },
  plugins: [],
};
