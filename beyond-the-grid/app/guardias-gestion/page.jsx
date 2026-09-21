import GuardiasRoute from "@/components/coordinacion/GuardiasRoute";
import SoloCoordinacion from "@/components/coordinacion/SoloCoordinacion";

export const metadata = {
  title: "Guardias · Coordinación · RDR",
  description: "Solicitudes de guardia del equipo: pendientes siempre destacadas, filtro por Q, aprobación con importe o rechazo con motivo.",
};

// Ruta fina: la lógica vive en components/coordinacion/. Chrome global en AppFrame.
export default function GuardiasGestionPage() {
  return (
    <SoloCoordinacion>
      <GuardiasRoute />
    </SoloCoordinacion>
  );
}
