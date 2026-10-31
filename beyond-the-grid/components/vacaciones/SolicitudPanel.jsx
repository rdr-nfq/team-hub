"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { FIELD, TEXT } from "../coordinacion/ui";
import { ESTADO_SOL, fechaCortaEs, festivosDeGrupo, laborables, isoDe, bloquesDe } from "./datos";

/* Piezas de solicitudes compartidas: la etiqueta de estado (Gestión), el
   formulario para cambiar o cancelar días aprobados y los bloques aprobados
   por delante (vista de usuario, PanelMisVacaciones). */

export function EstadoSolBadge({ estado }) {
  const e = ESTADO_SOL[estado] || { label: estado, accent: "sand" };
  return <span className={`inline-block whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-bold ${TEXT[e.accent] || "text-sand"}`}>{e.label}</span>;
}

/* ── Cambiar o cancelar días aprobados (con aprobación de coordinación) ── */
export function CambioForm({ b, modo, datos, post, onHecho, onCerrar }) {
  const yo = datos.yo;
  const hoy = isoDe(new Date());
  const fxg = useMemo(() => festivosDeGrupo(datos.festivosDetalle, yo?.grupo), [datos.festivosDetalle, yo]);
  const [f, setF] = useState(() => ({
    desde: modo === "cancelar" ? (b.inicio < hoy && b.fin >= hoy ? hoy : b.inicio) : b.inicio,
    hasta: b.fin, tipo: b.motivo, comentario: "",
  }));
  const [estado, setEstado] = useState({ fase: "form" });

  // Cancelar: días del bloque dentro del rango. Cambiar: días nuevos laborables.
  const aCancelar = modo === "cancelar" ? b.fechas.filter((iso) => iso >= f.desde && iso <= f.hasta) : [];
  const nuevos = modo === "cambiar" && f.desde && f.hasta >= f.desde ? laborables(f.desde, f.hasta, fxg) : [];
  const choques = nuevos.filter((iso) => !b.fechas.includes(iso) && (datos.ausenciasPorDia[iso] || []).some((a) => a.nombre === yo.nombre));
  const igual = modo === "cambiar" && f.tipo === b.motivo && nuevos.join(",") === b.fechas.join(",");
  const listo = modo === "cancelar"
    ? aCancelar.length > 0
    : nuevos.length > 0 && !choques.length && !igual && f.desde.slice(0, 4) === b.inicio.slice(0, 4) && f.hasta.slice(0, 4) === b.inicio.slice(0, 4);

  // Solicitud aprobada de la que vienen esos días (si la hay): para rehacer su evento.
  const ref = (datos.misSolicitudes || []).find((s) => s.estado === "APROBADA" && s.clase !== "CANCELACION" && s.tipo === b.motivo && !(s.hasta < b.inicio || s.desde > b.fin))?.id || "";

  const enviar = async () => {
    if (!listo || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    try {
      const body = modo === "cancelar"
        ? { clase: "CANCELACION", tipo: b.motivo, desde: aCancelar[0], hasta: aCancelar[aCancelar.length - 1], ref, comentario: f.comentario.trim() }
        : { clase: "MODIFICACION", tipoOrig: b.motivo, origDesde: b.inicio, origHasta: b.fin, tipo: f.tipo, desde: f.desde, hasta: f.hasta, ref, comentario: f.comentario.trim() };
      const r = await post("solicitar", body);
      setEstado({ fase: "ok", aviso: r.aviso });
      onHecho?.();
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  if (estado.fase === "ok") {
    return (
      <div className="mt-2 rounded-lg border border-lime/40 bg-lime/10 p-2.5 text-[12px] font-bold text-lime">
        {estado.aviso ? `Guardada, pero el aviso por correo falló (${estado.aviso}).` : "✓ Enviada: queda pendiente de que coordinación la apruebe."}
        <button type="button" onClick={onCerrar} className="ml-2 text-sand/60 hover:text-sand">Cerrar</button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-white/12 bg-midnight/40 p-2.5">
      {modo === "cambiar" && (
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Tipo</span>
          <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={`${FIELD} w-full`}>
            {(datos.tipos || []).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">{modo === "cancelar" ? "Cancelar desde" : "Nuevo desde"}</span>
          <input type="date" value={f.desde} min={modo === "cancelar" ? b.inicio : undefined} max={modo === "cancelar" ? b.fin : undefined}
            onChange={(e) => setF({ ...f, desde: e.target.value })} className={`${FIELD} w-full`} />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Hasta</span>
          <input type="date" value={f.hasta} min={f.desde || undefined} max={modo === "cancelar" ? b.fin : undefined}
            onChange={(e) => setF({ ...f, hasta: e.target.value })} className={`${FIELD} w-full`} />
        </label>
      </div>
      <textarea value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} rows={2} placeholder="Comentario (opcional)" className={`${FIELD} block w-full resize-y text-[13px]`} />
      <p className="text-[11.5px] text-sand/60">
        {modo === "cancelar"
          ? (aCancelar.length ? `Se liberan ${aCancelar.length} ${aCancelar.length === 1 ? "día" : "días"}.` : "Ese rango no tiene días de este bloque.")
          : igual ? "Son los mismos días: no hay nada que cambiar."
          : choques.length ? <span className="text-mandarin">Chocan con otros días tuyos: {choques.map(fechaCortaEs).join(", ")}.</span>
          : nuevos.length ? `Pasas de ${b.dias} a ${nuevos.length} ${nuevos.length === 1 ? "día" : "días"} laborables.` : "Elige los días nuevos."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!listo || estado.fase === "enviando"} onClick={enviar}
          className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#001391] disabled:cursor-not-allowed disabled:opacity-40" style={{ background: PALETTE.mandarin }}>
          {estado.fase === "enviando" ? "Enviando…" : modo === "cancelar" ? "Pedir cancelación" : "Pedir cambio"}
        </button>
        <button type="button" onClick={onCerrar} className="px-2 text-xs font-bold text-sand/55 hover:text-sand">Volver</button>
      </div>
      {estado.fase === "error" && <p className="text-[11.5px] font-bold text-mandarin">{estado.error}</p>}
    </div>
  );
}

/** Mis bloques de días aprobados que aún no han pasado (MisDias y su pestaña). */
export function useMisBloques(datos) {
  const yo = datos.yo;
  const hoy = isoDe(new Date());
  const fxg = useMemo(() => festivosDeGrupo(datos.festivosDetalle, yo?.grupo), [datos.festivosDetalle, yo]);
  const tipos = (datos.tipos || []).map((t) => t.id);
  return useMemo(
    () => (yo ? bloquesDe(datos.ausenciasPorDia, yo.nombre, fxg, tipos).filter((b) => b.fin >= hoy) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.ausenciasPorDia, yo, fxg, hoy]
  );
}
