"use client";

import { accesos, GESTION } from "@/lib/seccion";
import Baldosa from "@/components/hub/Baldosa";
import IconoBBVA from "@/components/iconosBBVA";

/* /gestion: el botón Gestión de la cabecera lleva aquí. Todas las
   herramientas de coordinación a la vista; dentro de cada una, las pestañas
   de la cabecera permiten saltar a las demás. */
const GRUPOS = [
  { titulo: "Solicitudes y horas del equipo", rutas: ["/timereport-gestion", "/vacaciones-gestion", "/guardias-gestion"] },
  { titulo: "Negocio y personas", rutas: ["/ofertas", "/seguimiento", "/equipo-gestion"] },
];

export default function GestionHub() {
  const todas = accesos("gestion");
  return (
    <main className="mx-auto w-full max-w-[1376px] px-4 pb-10 pt-cabecera sm:px-8">
      <div className="flex items-center gap-3.5">
        <span className="hub-placa hub-ge grid h-11 w-11 shrink-0 place-items-center rounded-[10px]">
          <IconoBBVA nombre={GESTION.icono} size={28} />
        </span>
        <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Gestión</h1>
      </div>
      <p className="mt-1.5 text-[15px] text-sand/80">Solo coordinación. Todas las herramientas del equipo en una página.</p>
      {GRUPOS.map((g) => (
        <section key={g.titulo} aria-label={g.titulo} className="mt-6">
          <h2 className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.05em] text-sand/80">{g.titulo}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {todas.filter((a) => g.rutas.includes(a.ruta)).map((a) => <Baldosa key={a.ruta} item={a} sec="gestion" grande />)}
          </div>
        </section>
      ))}
    </main>
  );
}
