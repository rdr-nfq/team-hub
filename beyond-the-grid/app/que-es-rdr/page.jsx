import QueEsRdrRoute from "@/components/queesrdr/QueEsRdrRoute";

export const metadata = {
  title: "¿Qué es RDR? · RD&S Hub",
  description:
    "El Repositorio de Datos de Referencia de BBVA: entidades, arquitectura, flujo de datos e integraciones.",
};

// Página introductoria "¿Qué es RDR?" (migración de public/que-es-rdr.html).
// El chrome (auth, cabecera, co-branding NFQ) vive en AppFrame (layout).
export default function QueEsRdrPage() {
  return <QueEsRdrRoute />;
}
