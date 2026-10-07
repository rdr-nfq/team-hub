import GestionVacacionesRoute from "@/components/vacaciones/GestionVacacionesRoute";
import SoloCoordinacion from "@/components/coordinacion/SoloCoordinacion";

export const metadata = {
  title: "Vacaciones · Coordinación · RDR",
  description: "Solicitudes de vacaciones (aprobar/rechazar), saldos por persona y grupos de festivos.",
};

// Ruta fina: la lógica vive en components/vacaciones/. Chrome global en AppFrame.
export default function VacacionesGestionPage() {
  return (
    <SoloCoordinacion>
      <GestionVacacionesRoute />
    </SoloCoordinacion>
  );
}
