import VacacionesSwitch from "@/components/vacaciones/VacacionesSwitch";

export const metadata = {
  title: "Vacaciones del equipo · RDR Knowledge",
  description: "Calendario de ausencias del equipo RDR y solicitud de vacaciones.",
};

// Ruta migrada desde public/vacaciones.html. El chrome (auth, cabecera,
// footer NFQ, enlaces) vive en AppFrame (layout); aquí solo va el contenido.
export default function VacacionesPage() {
  return <VacacionesSwitch />;
}
