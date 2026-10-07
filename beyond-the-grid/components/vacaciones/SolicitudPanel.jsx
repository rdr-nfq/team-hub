"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { FIELD, TEXT } from "../coordinacion/ui";
import { IconSun, IconAlert } from "./icons";
import { motivoDe } from "./constants";
import { ESTADO_SOL, CLASE_SOL, fechaCortaEs, festivosDeGrupo, laborables, isoDe, bloquesDe } from "./datos";

const ACCENT = PALETTE.mandarin;

function Campo({ etiqueta, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">{etiqueta}</span>
      {children}
    </label>
  );
}

/** Formulario de solicitud (VA/FO/ES) para quien ha entrado en la web. */
export function SolicitudForm({ datos, post, onHecho }) {
  const mapAccent = useAccentMap();
  const yo = datos.yo;
  const hoy = isoDe(new Date());
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ tipo: "VA", desde: "", hasta: "", comentario: "" });
  const [estado, setEstado] = useState({ fase: "form" }); // form | enviando | ok | error

  const fxg = useMemo(() => festivosDeGrupo(datos.festivosDetalle, yo?.grupo), [datos.festivosDetalle, yo]);
  const hasta = f.hasta || f.desde;
  const dias = useMemo(() => (f.desde ? laborables(f.desde, hasta, fxg) : []), [f.desde, hasta, fxg]);
  // Días que ya tengo registrados dentro del rango.
  const ocupados = useMemo(() => dias.filter((iso) => (datos.ausenciasPorDia[iso] || []).some((a) => a.nombre === yo?.nombre)), [dias, datos.ausenciasPorDia, yo]);
  const cruzaAnio = f.desde && hasta && f.desde.slice(0, 4) !== hasta.slice(0, 4);
  const listo = !!(yo && f.desde && hasta >= f.desde && dias.length && !ocupados.length && !cruzaAnio);

  const enviar = async () => {
    if (!listo || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    try {
      const r = await post("solicitar", { clase: "NUEVA", tipo: f.tipo, desde: f.desde, hasta, comentario: f.comentario.trim() });
      setEstado({ fase: "ok", dias: r.solicitud.dias, aviso: r.aviso });
      setF({ tipo: f.tipo, desde: "", hasta: "", comentario: "" });
      onHecho?.();
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  if (!yo) {
    return (
      <div className="rounded-2xl border border-canary/40 bg-canary/10 p-4 text-[13px] text-canary">
        <IconAlert size={14} className="mr-1.5 inline" />
        No apareces en la pestaña Vacas_{datos.year} del Excel con este email, así que todavía no puedes pedir días desde aquí. Pide a coordinación que te añadan.
      </div>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border bg-white/[0.055] backdrop-blur-md"
      style={{ borderColor: rgba(ACCENT, 0.5) }}
      aria-label="Pedir vacaciones"
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ borderColor: rgba(ACCENT, 0.3), background: rgba(ACCENT, 0.12), color: mapAccent(ACCENT) }}>
          <IconSun size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-sand">Pedir días</span>
          <span className="block text-[12.5px] text-sand/65">Vacaciones, formación o permiso especial: le llega a coordinación.</span>
        </span>
        <span aria-hidden className={`text-sand/45 transition ${abierto ? "rotate-90" : ""}`}>▸</span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-white/10 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Tipo" className="col-span-2">
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={`${FIELD} w-full`}>
                {(datos.tipos || []).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" value={f.desde} min={`${datos.year}-01-01`} onChange={(e) => setF({ ...f, desde: e.target.value, hasta: f.hasta && f.hasta < e.target.value ? e.target.value : f.hasta })} className={`${FIELD} w-full`} />
            </Campo>
            <Campo etiqueta="Hasta (incluido)">
              <input type="date" value={f.hasta} min={f.desde || undefined} onChange={(e) => setF({ ...f, hasta: e.target.value })} className={`${FIELD} w-full`} />
            </Campo>
            <Campo etiqueta="Comentario (opcional)" className="col-span-2">
              <textarea value={f.comentario} onChange={(e) => setF({ ...f, comentario: e.target.value })} rows={2} className={`${FIELD} block w-full resize-y`} />
            </Campo>
          </div>

          {f.desde && (
            <p className="text-[12px] text-sand/65">
              {cruzaAnio ? (
                <span className="text-mandarin">No puede cruzar de año: pídelo en dos solicitudes.</span>
              ) : dias.length ? (
                <>📅 <b className="text-sand">{dias.length}</b> {dias.length === 1 ? "día laborable" : "días laborables"}{yo.grupo ? ` (sin fines de semana ni festivos de ${yo.grupo})` : " (sin fines de semana)"}.</>
              ) : (
                <span className="text-mandarin">Ese rango no tiene días laborables.</span>
              )}
              {f.desde < hoy && !cruzaAnio && <span className="ml-1 text-canary">Ojo: empieza en el pasado.</span>}
            </p>
          )}
          {ocupados.length > 0 && (
            <p className="text-[12px] font-bold text-mandarin">Ya tienes días registrados en ese rango: {ocupados.map(fechaCortaEs).join(", ")}.</p>
          )}

          <button
            type="button"
            disabled={!listo || estado.fase === "enviando"}
            onClick={enviar}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            style={{ background: PALETTE.mandarin }}
          >
            {estado.fase === "enviando"
              ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Enviando…</>
              : "Enviar solicitud"}
          </button>
          {estado.fase === "ok" && (
            <p className={`text-xs font-bold ${estado.aviso ? "text-canary" : TEXT.lime}`}>
              {estado.aviso
                ? `Solicitud guardada (${estado.dias} días), pero el aviso por correo falló: ${estado.aviso}. Avisa tú a coordinación.`
                : `✓ Solicitud enviada (${estado.dias} días): coordinación ya tiene el aviso.`}
            </p>
          )}
          {estado.fase === "error" && (
            <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">No se pudo enviar: {estado.error}</p>
          )}
        </div>
      )}
    </section>
  );
}

export function EstadoSolBadge({ estado }) {
  const e = ESTADO_SOL[estado] || { label: estado, accent: "sand" };
  return <span className={`inline-block whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-bold ${TEXT[e.accent] || "text-sand"}`}>{e.label}</span>;
}

/** Mis solicitudes: estado de cada una; las pendientes se pueden cancelar. */
export function MisSolicitudes({ solicitudes, post, onHecho }) {
  const [cancelando, setCancelando] = useState("");
  const [error, setError] = useState("");
  if (!solicitudes?.length) return null;
  const cancelar = async (id) => {
    if (!confirm("¿Retirar esta solicitud? Todavía no estaba aprobada.")) return;
    setCancelando(id); setError("");
    try { await post("cancelar", { id }); onHecho?.(); } catch (e) { setError(String(e.message || e)); }
    setCancelando("");
  };
  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.055] p-4 backdrop-blur-md" aria-label="Mis solicitudes">
      <h2 className="mb-2.5 font-display text-base font-bold text-sand">Mis solicitudes</h2>
      <ul className="space-y-2">
        {solicitudes.slice(0, 8).map((s) => (
          <li key={s.id} className="rounded-xl border border-white/10 bg-midnight/30 p-2.5 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-1.5">
              {CLASE_SOL[s.clase]?.corto && <span className="text-[11px] font-bold text-sand/70">{CLASE_SOL[s.clase].corto}</span>}
              <span className="rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: motivoDe(s.tipo).bg, color: motivoDe(s.tipo).text }}>{s.tipo}</span>
              <span className="font-bold text-sand">{fechaCortaEs(s.desde)}{s.hasta !== s.desde ? ` – ${fechaCortaEs(s.hasta)}` : ""}</span>
              <span className="text-sand/45">· {s.dias} d</span>
              <span className="ml-auto"><EstadoSolBadge estado={s.estado} /></span>
            </div>
            {s.clase === "MODIFICACION" && (
              <p className="mt-0.5 text-[11.5px] text-sand/50">antes: {s.tipoOrig} {fechaCortaEs(s.origDesde)}{s.origHasta !== s.origDesde ? ` – ${fechaCortaEs(s.origHasta)}` : ""}</p>
            )}
            {s.motivo && <p className="mt-1 text-sand/60">💬 {s.motivo}</p>}
            {s.estado === "PENDIENTE" && (
              <button type="button" disabled={cancelando === s.id} onClick={() => cancelar(s.id)} className="mt-1 text-[11px] font-bold text-sand/50 hover:text-mandarin disabled:opacity-40">
                {cancelando === s.id ? "Retirando…" : "Retirar solicitud"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[11.5px] font-bold text-mandarin">{error}</p>}
    </section>
  );
}


/* ── Mis días aprobados: cancelar o cambiar (con aprobación de coordinación) ── */
function bloquePendiente(b, solicitudes) {
  return (solicitudes || []).find((s) => s.estado === "PENDIENTE" && s.clase !== "NUEVA" &&
    [[s.desde, s.hasta], [s.origDesde, s.origHasta]].some(([a, z]) => a && !(z < b.inicio || a > b.fin)));
}

function CambioForm({ b, modo, datos, post, onHecho, onCerrar }) {
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

export function MisDias({ datos, post, onHecho }) {
  const yo = datos.yo;
  const hoy = isoDe(new Date());
  const [abierto, setAbierto] = useState(null); // { key, modo }
  const fxg = useMemo(() => festivosDeGrupo(datos.festivosDetalle, yo?.grupo), [datos.festivosDetalle, yo]);
  const tipos = (datos.tipos || []).map((t) => t.id);
  const bloques = useMemo(
    () => (yo ? bloquesDe(datos.ausenciasPorDia, yo.nombre, fxg, tipos).filter((b) => b.fin >= hoy) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos.ausenciasPorDia, yo, fxg, hoy]
  );
  if (!yo || !bloques.length) return null;
  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.055] p-4 backdrop-blur-md" aria-label="Mis días aprobados">
      <h2 className="font-display text-base font-bold text-sand">Mis días aprobados</h2>
      <p className="mb-2.5 text-[11.5px] text-sand/55">Para cancelarlos o cambiarlos se pide a coordinación, igual que una solicitud.</p>
      <ul className="space-y-2">
        {bloques.map((b) => {
          const key = `${b.motivo}-${b.inicio}`;
          const pend = bloquePendiente(b, datos.misSolicitudes);
          return (
            <li key={key} className="rounded-xl border border-white/10 bg-midnight/30 p-2.5 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: motivoDe(b.motivo).bg, color: motivoDe(b.motivo).text }}>{b.motivo}</span>
                <span className="font-bold text-sand">{fechaCortaEs(b.inicio)}{b.fin !== b.inicio ? ` – ${fechaCortaEs(b.fin)}` : ""}</span>
                <span className="text-sand/45">· {b.dias} d</span>
              </div>
              {pend ? (
                <p className="mt-1 text-[11.5px] font-bold text-canary">{CLASE_SOL[pend.clase].label} pendiente de aprobar</p>
              ) : abierto?.key === key ? (
                <CambioForm b={b} modo={abierto.modo} datos={datos} post={post} onHecho={onHecho} onCerrar={() => setAbierto(null)} />
              ) : (
                <div className="mt-1 flex gap-3">
                  <button type="button" onClick={() => setAbierto({ key, modo: "cambiar" })} className="text-[11.5px] font-bold text-serene hover:underline">🔁 Cambiar</button>
                  <button type="button" onClick={() => setAbierto({ key, modo: "cancelar" })} className="text-[11.5px] font-bold text-sand/60 hover:text-mandarin">🗑️ Cancelar</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
