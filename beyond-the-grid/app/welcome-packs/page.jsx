"use client";

import SelectorEquipo from "@/components/equipos/SelectorEquipo";
import { IconBook } from "@/components/icons";

// Welcome Packs: la introducción de cada equipo. ¿Qué es RDR? es la de
// siempre (/que-es-rdr); las demás, cuando existan, se enlazan aquí.
export default function WelcomePacksPage() {
  return (
    <SelectorEquipo
      kicker="Formación"
      titulo="Welcome Packs"
      intro="La presentación de bienvenida de cada equipo: qué hace, con quién trabaja y cómo encaja."
      opciones={[
        { equipo: "rdr", label: "¿Qué es RDR?", desc: "Presentación de introducción al Repositorio de Datos de Referencia.", href: "/que-es-rdr", icon: IconBook },
        { equipo: "market-abuse", label: "¿Qué es Market Abuse?", desc: "Presentación de introducción al equipo de Market Abuse." },
        { equipo: "comms-surveillance", label: "¿Qué es Comms Surveillance?", desc: "Presentación de introducción al equipo de Comms Surveillance." },
      ]}
    />
  );
}
