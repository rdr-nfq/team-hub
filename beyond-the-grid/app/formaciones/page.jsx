"use client";

import SelectorEquipo from "@/components/equipos/SelectorEquipo";
import { IconGrad } from "@/components/icons";

// HUB Formativo: primero se elige equipo. Formaciones RDR es la ruta de
// siempre (/formacion); las demás, cuando existan, se enlazan aquí.
export default function FormacionesPage() {
  return (
    <SelectorEquipo
      titulo="HUB Formativo"
      intro="Elige el equipo para ver su ruta de formación."
      opciones={[
        { equipo: "rdr", label: "Formaciones RDR", desc: "Ruta por niveles 00–06: fundamentos, operativa y herramientas.", href: "/formacion", icon: IconGrad },
        { equipo: "market-abuse", label: "Formaciones Market Abuse", desc: "Ruta formativa del equipo de Market Abuse." },
        { equipo: "comms-surveillance", label: "Formaciones Comms Surveillance", desc: "Ruta formativa del equipo de Comms Surveillance." },
      ]}
    />
  );
}
