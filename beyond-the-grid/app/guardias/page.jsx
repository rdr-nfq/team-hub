import MisGuardiasRoute from "@/components/guardias/MisGuardiasRoute";

export const metadata = {
  title: "Guardias · RDR",
  description: "Solicita una guardia de un Pase Calendado y consulta el estado de tus últimas solicitudes.",
};

// Ruta fina: la lógica vive en components/guardias/. Chrome global en AppFrame.
export default function GuardiasPage() {
  return <MisGuardiasRoute />;
}
