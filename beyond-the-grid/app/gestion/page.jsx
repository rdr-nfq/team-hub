import GestionHub from "@/components/coordinacion/GestionHub";
import SoloCoordinacion from "@/components/coordinacion/SoloCoordinacion";

export const metadata = {
  title: "Gestión · RDR",
  description: "Todas las herramientas de coordinación del equipo RDR en una página.",
};

// Ruta fina: la lógica vive en components/coordinacion/. Chrome global en AppFrame.
export default function GestionPage() {
  return (
    <SoloCoordinacion>
      <GestionHub />
    </SoloCoordinacion>
  );
}
