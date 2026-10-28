import "./globals.css";
import { Source_Serif_4, Lato } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import AppFrame from "@/components/chrome/AppFrame";

// BBVA: Source Serif 4 para titulares, Lato para el resto.
const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-serif",
});
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
});

export const metadata = {
  title: "Reference Data & Surveillance Hub · BBVA × NFQ",
  description:
    "Hub de documentación, formación y proyectos de los equipos RDR, Market Abuse y Comms Surveillance.",
};

export default function RootLayout({ children }) {
  return (
    <ViewTransitions>
      <html lang="es" className={`${serif.variable} ${lato.variable}`}>
        <head>
          {/* Aplica el tema guardado ANTES del primer paint (sin destello):
              el de la cuenta con sesión en este navegador o, si no, el último
              usado (lib/theme.js). La clase activa el modo claro de globals.css. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var s=localStorage,e=s.getItem("rdr_auth_email"),t=(e&&s.getItem("rdr_theme:"+e))||s.getItem("rdr_theme");if(t==="light"){var d=document.documentElement;d.classList.add("rdr-light");d.style.colorScheme="light"}}catch(e){}`,
            }}
          />
        </head>
        <body className="bg-midnight font-sans text-sand antialiased">
          <AppFrame>{children}</AppFrame>
          {/* Speculation Rules: prerenderiza el destino al pasar el ratón
              (eagerness moderate) -> abrir una página/formación casi instantáneo.
              Solo Chromium; el resto lo ignora (degradación elegante). */}
          <script
            type="speculationrules"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                prerender: [{ where: { selector_matches: "a[data-prerender]" }, eagerness: "moderate" }],
              }),
            }}
          />
        </body>
      </html>
    </ViewTransitions>
  );
}
