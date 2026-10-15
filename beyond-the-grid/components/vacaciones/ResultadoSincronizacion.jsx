"use client";

import { TEXT } from "../coordinacion/ui";

/* Resultado de sincronizarEquipo (backend de vacaciones): altas, emails
   puestos y casos que hay que mirar a mano. Lo usan Gestión de equipo (tras
   guardar) y la pestaña Personas de /vacaciones-gestion. */
export default function ResultadoSincronizacion({ r }) {
  if (!r) return null;
  const nada = !r.altas.length && !r.vinculados.length && !r.revisar.length;
  return (
    <div className="space-y-1 text-[12px]">
      {nada && <p className="text-sand/60">Vacaciones: todo el equipo ya está en {r.anios.map((a) => `Vacas_${a}`).join(" y ") || "el Excel"}.</p>}
      {r.altas.map((a) => (
        <p key={`a${a.anio}${a.nombre}`} className={`font-bold ${TEXT.lime}`}>
          ✓ Vacaciones: alta de {a.nombre} en Vacas_{a.anio} (grupo {a.grupo}, {String(a.dias).replace(".", ",")} días del año). Revisa grupo y días en Vacaciones → Personas.
        </p>
      ))}
      {r.vinculados.map((v) => (
        <p key={`v${v.anio}${v.nombre}`} className="text-sand/70">✓ Vacaciones: {v.nombre} ya estaba en Vacas_{v.anio}; se le ha puesto el email {v.email}.</p>
      ))}
      {r.revisar.map((x) => (
        <p key={`r${x.anio}${x.nombre}`} className="font-bold text-canary">⚠ Vacaciones {x.anio}: {x.nombre} no se ha añadido: {x.motivo}</p>
      ))}
    </div>
  );
}
