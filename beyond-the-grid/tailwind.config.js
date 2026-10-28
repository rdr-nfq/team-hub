const ACENTOS = ["serene", "lime", "canary", "aqua", "purple", "mandarin"];
const ACENTO_TINTA = Object.fromEntries(ACENTOS.map((c) => [c, `rgb(var(--t-${c}) / <alpha-value>)`]));
// Alfa × --k-bg: en claro un bg-lime/10 sería casi invisible sobre Sand.
const ACENTO_FONDO = Object.fromEntries(ACENTOS.map((c) => [c, `rgb(var(--c-${c}) / calc(<alpha-value> * var(--k-bg)))`]));

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
      /* Norma BBVA en claro: sobre fondo claro el TEXTO, los ICONOS y las
         LÍNEAS van en Electric/Midnight; los acentos (lime, mandarin…) solo
         como RELLENO, con texto Electric encima. Por eso los acentos leen
         variables distintas según el uso: texto/iconos/bordes/anillos ->
         --t-* (en claro, Electric) y fondos -> --c-* (el acento BBVA tal
         cual; en claro los tintes suaves se refuerzan con --k-bg). */
      textColor: ACENTO_TINTA,
      fill: ACENTO_TINTA,
      stroke: ACENTO_TINTA,
      borderColor: ACENTO_TINTA,
      ringColor: ACENTO_TINTA,
      outlineColor: ACENTO_TINTA,
      divideColor: ACENTO_TINTA,
      textDecorationColor: ACENTO_TINTA,
      backgroundColor: ACENTO_FONDO,
    },
  },
  plugins: [],
};
