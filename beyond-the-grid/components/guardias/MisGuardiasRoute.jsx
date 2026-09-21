"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useAuth } from "../chrome/AuthGate";
import { useEquipo } from "../timereport/datos";
import { mismoEmail } from "@/lib/email";
import { GLASS, FIELD, TEXT, EmptyCard, PanelSkeleton } from "../coordinacion/ui";
import { IconClock, IconAlert, IconPlus } from "../coordinacion/icons";
import { useGuardias } from "./datos";
import { qDeFecha, fechaEs, eur, ESTADO, hoyISO } from "./model";

/* Guardias · vista de MIEMBRO (todo el equipo).
   Da de alta una guardia (día del Pase Calendado, horario y justificación) y
   enseña tus últimas solicitudes con su estado. Al enviar, el backend avisa
   por email a coordinación; cuando alguien la resuelve, te llega la
   respuesta también por email — aquí solo se ve el estado ya resuelto. */

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-0.5 block text-[10.5px] text-sand/40">{ayuda}</span>}
    </label>
  );
}

function EstadoBadge({ estado }) {
  const e = ESTADO[estado] || ESTADO.pendiente;
  return <span className={`inline-block whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold ${TEXT[e.accent]}`}>{e.label}</span>;
}

const FORM_VACIO = { fecha: hoyISO(), horaEntrada: "", horaSalida: "", descripcion: "" };

export default function MisGuardiasRoute() {
  const { email } = useAuth();
  const equipo = useEquipo();
  const yo = useMemo(() => (equipo || []).find((m) => mismoEmail(m.email, email)) || null, [equipo, email]);

  const { snap, reload, post } = useGuardias("misGuardias", { email: email || "" });
  const guardias = snap?.data?.guardias || [];

  const [form, setForm] = useState(FORM_VACIO);
  const [estado, setEstado] = useState({ fase: "form" }); // form | enviando | error

  const listo = !!(form.fecha && form.horaEntrada && form.horaSalida && form.descripcion.trim() && yo);

  const enviar = async () => {
    if (!listo || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    try {
      await post("crear", {
        persona: yo.nombre, email: yo.email,
        fecha: form.fecha, horaEntrada: form.horaEntrada, horaSalida: form.horaSalida,
        descripcion: form.descripcion.trim(),
      });
      setForm(FORM_VACIO);
      setEstado({ fase: "form" });
      reload();
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.mandarin }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.serene }} />
      </div>

      <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-mandarin/80">Equipo</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconClock size={34} className="text-mandarin" /> Guardias
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Solicita una guardia de un Pase Calendado y consulta el estado de tus últimas solicitudes.
          </p>
          {snap?.error && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> {snap.error}
            </p>
          )}
        </header>

        {/* ── Alta de guardia ── */}
        <section className={`${GLASS} space-y-4 p-5`} aria-label="Nueva guardia">
          <h2 className="font-display text-lg font-bold text-sand">Nueva guardia</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Día del Pase Calendado">
              <input
                type="date" value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                className={`${FIELD} w-full`}
              />
            </Campo>
            <Campo etiqueta="Hora de entrada">
              <input
                type="time" value={form.horaEntrada}
                onChange={(e) => setForm({ ...form, horaEntrada: e.target.value })}
                className={`${FIELD} w-full`}
              />
            </Campo>
            <Campo etiqueta="Hora de salida">
              <input
                type="time" value={form.horaSalida}
                onChange={(e) => setForm({ ...form, horaSalida: e.target.value })}
                className={`${FIELD} w-full`}
              />
            </Campo>
          </div>
          <Campo etiqueta="Justificación / descripción" ayuda="Qué Pase Calendado fue, errores o problemas con los que te enfrentaste…">
            <textarea
              value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={4}
              placeholder="Descripción del Pase Calendado, incidencias…"
              className={`${FIELD} block w-full resize-y`}
            />
          </Campo>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!listo || estado.fase === "enviando" || !!snap?.error}
              onClick={enviar}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              style={{ background: PALETTE.mandarin }}
            >
              {estado.fase === "enviando" ? (
                <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Enviando…</>
              ) : (
                <><IconPlus size={15} /> Solicitar guardia</>
              )}
            </button>
            {!listo && (
              <p className="text-[11px] text-sand/45">
                Necesarios: día, hora de entrada, hora de salida y justificación.
              </p>
            )}
          </div>
          {estado.fase === "error" && (
            <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
              No se pudo enviar: {estado.error}
            </p>
          )}
        </section>

        {/* ── Mis últimas guardias ── */}
        <section className="mt-6">
          <h2 className="mb-3 font-display text-lg font-bold text-sand">Mis últimas guardias</h2>
          {!snap ? (
            <PanelSkeleton />
          ) : snap.error ? (
            <p className="inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-2 text-xs font-bold text-canary">
              <IconAlert size={13} /> {snap.error}
            </p>
          ) : guardias.length === 0 ? (
            <EmptyCard>Todavía no has solicitado ninguna guardia.</EmptyCard>
          ) : (
            <ul className="space-y-2">
              {guardias.map((g) => (
                <li key={g.id} className={`${GLASS} p-3 text-[13px]`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sand">{fechaEs(g.fecha)}</span>
                    <span className="text-sand/50">{g.horaEntrada} – {g.horaSalida}</span>
                    <span className="text-sand/30">· {qDeFecha(g.fecha)}</span>
                    <EstadoBadge estado={g.estado} />
                    {g.estado === "aprobada" && g.importe != null && (
                      <span className={`font-bold tabular-nums ${TEXT.lime}`}>{eur.format(g.importe)}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sand/70">{g.descripcion}</p>
                  {g.estado === "rechazada" && g.motivo && (
                    <p className="mt-1.5 text-mandarin">Motivo: {g.motivo}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
