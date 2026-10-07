"use client";

import VacacionesRoute, { VacacionesSkeleton } from "./VacacionesRoute";
import MisVacacionesRoute from "./MisVacacionesRoute";
import { useV2Configurado } from "./datos";

/* Transición al sistema nuevo: con "vacacionesV2Backend" en links.json se usa
   la vista nueva (calendario + solicitudes contra el Excel único); sin ella,
   la vista antigua de solo lectura (Excel auxiliar + Google Form). */
export default function VacacionesSwitch() {
  const v2 = useV2Configurado();
  if (v2 === null)
    return (
      <main className="relative min-h-dvh w-full">
        <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6"><VacacionesSkeleton /></div>
      </main>
    );
  return v2 ? <MisVacacionesRoute /> : <VacacionesRoute />;
}
