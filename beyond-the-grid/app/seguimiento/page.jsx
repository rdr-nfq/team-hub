import SeguimientoRoute from "@/components/coordinacion/SeguimientoRoute";
import SoloCoordinacion from "@/components/coordinacion/SoloCoordinacion";

export const metadata = {
  title: "Seguimiento · Coordinación · RDR",
  description: "Datos de la reunión de seguimiento (proyectos, tareas, incidencias y traspasos) y generación de la presentación .pptx.",
};

// Ruta fina: la lógica vive en components/coordinacion/. Chrome global en AppFrame.
export default function SeguimientoPage() {
  return (
    <SoloCoordinacion>
      <SeguimientoRoute />
    </SoloCoordinacion>
  );
}
