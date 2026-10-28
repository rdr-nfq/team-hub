const ACENTOS = ["serene", "lime", "canary", "aqua", "purple", "mandarin"];
// Texto, iconos y anillos: --t-* (en claro, Electric).
const ACENTO_TINTA = Object.fromEntries(ACENTOS.map((c) => [c, `rgb(var(--t-${c}) / <alpha-value>)`]));
// Bordes: --ct-* (en claro, Serene: el acento natural del fondo Sand).
const ACENTO_LINEA = Object.fromEntries(ACENTOS.map((c) => [c, `rgb(var(--ct-${c}) / <alpha-value>)`]));
/* Fondos: un relleno SÓLIDO (bg-lime: barras, puntos, botones) es el acento
   BBVA (--c-*); un TINTE (bg-lime/10, con alfa) es decoración: --ct-* (en
   claro, Serene) con el alfa reforzado por --k-bg. */
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
      /* Norma BBVA en claro (fondo Sand): texto e iconos en Electric, Serene
         como único acento natural, y lime/mandarin/canary… solo para
         subrayar DATOS (barras, puntos de estado). Por eso un acento lee
         variables distintas según el uso (app/globals.css): texto/iconos/
         anillos -> --t-*, bordes y tintes -> --ct-*, rellenos sólidos -> --c-*.
         En oscuro las tres son el mismo acento. */
      textColor: ACENTO_TINTA,
      fill: ACENTO_TINTA,
      stroke: ACENTO_TINTA,
      borderColor: ACENTO_LINEA,
      ringColor: ACENTO_TINTA,
      outlineColor: ACENTO_TINTA,
      divideColor: ACENTO_TINTA,
      textDecorationColor: ACENTO_TINTA,
      backgroundColor: ACENTO_FONDO,
    },
  },
  plugins: [],
};
