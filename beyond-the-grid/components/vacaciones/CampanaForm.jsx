"use client";

import { deIso, isoDe } from "./datos";

/* Utilidades de los formularios especiales de vacaciones («campañas»: Navidad,
   Verano…). Coordinación los abre y elige las semanas en /vacaciones-gestion;
   en /vacaciones se piden desde «Mis vacaciones» (PanelMisVacaciones). */

const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (iso) => { const d = deIso(iso); return `${d.getDate()} ${MES3[d.getMonth()]}`; };
const mas = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };

/** Lunes -> "21 – 25 dic" (o "28 dic – 1 ene"). */
export const rangoSemana = (lunes) => {
  const v = mas(lunes, 4);
  return lunes.slice(5, 7) === v.slice(5, 7) ? `${Number(lunes.slice(8))} – ${corta(v)}` : `${corta(lunes)} – ${corta(v)}`;
};

/** Solicitudes de la campaña que tocan una semana (pendientes o aprobadas). */
export const solsDeSemana = (sols, campanaId, lunes, persona) =>
  (sols || []).filter((s) => s.campana === campanaId && (!persona || s.persona === persona)
    && ["PENDIENTE", "APROBADA"].includes(s.estado) && !(s.hasta < lunes || s.desde > mas(lunes, 6)));
