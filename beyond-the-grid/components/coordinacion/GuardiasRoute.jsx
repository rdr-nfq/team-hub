"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useAuth } from "../chrome/AuthGate";
import { useEquipo } from "../timereport/datos";
import { mismoEmail } from "@/lib/email";
import { FIELD, TEXT, EmptyCard, PanelSkeleton } from "./ui";
import { IconClock, IconAlert, IconX } from "./icons";
import { IconCheck } from "../icons";
import { curQ } from "./model";
import { useGuardias } from "../guardias/datos";
import { qDeFecha, fechaEs, eur, ESTADO } from "../guardias/model";

/* Guardias · vista de COORDINACIÓN.
   Todas las guardias solicitadas por el equipo, filtrables por Q, con las
   PENDIENTES siempre destacadas arriba (sea cual sea el Q elegido) para no
   perder ninguna. Cada pendiente se resuelve aquí mismo: 4 importes rápidos,
   "Otro importe" o Rechazar con motivo. El link del email de aviso trae
   ?id=<guardia> y la deja en primer plano (resaltada + centrada). */

const IMPORTES_RAPIDOS = [30, 70, 120, 240];

function EstadoBadge({ estado }) {
  const e = ESTADO[estado] || ESTADO.pendiente;
  return <span className={`inline-block whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] font-bold ${TEXT[e.accent]}`}>{e.label}</span>;
}

function GuardiaRow({ g, resaltada, resolver }) {
  const [modo, setModo] = useState(null); // null | 'otro' | 'rechazar'
  const [otro, setOtro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState({ fase: "quieto" }); // quieto | enviando | error
  const ref = useRef(null);

  useEffect(() => {
    if (resaltada && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltada]);

  const enviar = async (payload) => {
    setEstado({ fase: "enviando" });
    try {
      await resolver(g.id, payload);
      setEstado({ fase: "quieto" });
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  const ocupado = estado.fase === "enviando";

  return (
    <li
      ref={ref}
      className={`rounded-xl border p-3 text-[13px] transition ${
        resaltada ? "border-lime/60 bg-lime/[0.08]" : g.estado === "pendiente" ? "border-canary/40 bg-canary/[0.06]" : "border-white/[0.08] bg-white/[0.03]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-sand">{g.persona}</span>
        <span className="text-sand/50">{fechaEs(g.fecha)} · {g.horaEntrada}–{g.horaSalida}</span>
        <span className="text-sand/30">· {qDeFecha(g.fecha)}</span>
        <EstadoBadge estado={g.estado} />
        {g.estado === "aprobada" && g.importe != null && (
          <span className={`font-bold tabular-nums ${TEXT.lime}`}>{eur.format(g.importe)}</span>
        )}
      </div>
      <p className="mt-1.5 text-sand/70">{g.descripcion}</p>
      {g.estado === "rechazada" && g.motivo && <p className="mt-1.5 text-mandarin">Motivo: {g.motivo}</p>}
      {g.estado !== "pendiente" && g.resueltoPor && (
        <p className="mt-1 text-[11px] text-sand/40">Resuelta por {g.resueltoPor}</p>
      )}

      {g.estado === "pendiente" && (
        <div className="mt-3 space-y-2 border-t border-white/[0.08] pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {IMPORTES_RAPIDOS.map((v) => (
              <button
                key={v}
                type="button"
                disabled={ocupado}
                onClick={() => enviar({ importe: v })}
                className="rounded-lg bg-[#88E783] px-3 py-1.5 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {v} €
              </button>
            ))}
            {modo === "otro" ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number" min="0" step="1" autoFocus value={otro}
                  onChange={(e) => setOtro(e.target.value)}
                  placeholder="0"
                  aria-label="Otro importe"
                  className={`${FIELD} w-24 !py-1 text-right tabular-nums`}
                />
                <span className="text-sand/50">€</span>
                <button
                  type="button"
                  disabled={ocupado || !(Number(otro) > 0)}
                  onClick={() => enviar({ importe: Number(otro) })}
                  className="rounded-lg bg-[#88E783] px-2.5 py-1.5 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconCheck size={13} />
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setModo("otro")}
                className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-1.5 text-xs font-bold text-sand/80 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Otro importe: &quot;&quot; €
              </button>
            )}
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setModo(modo === "rechazar" ? null : "rechazar")}
              className="ml-auto rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-1.5 text-xs font-bold text-mandarin transition hover:bg-mandarin/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="inline-flex items-center gap-1"><IconX size={13} /> Rechazar</span>
            </button>
          </div>
          {modo === "rechazar" && (
            <div className="flex flex-wrap items-start gap-2">
              <textarea
                value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2}
                placeholder="Motivo del rechazo…" aria-label="Motivo del rechazo"
                className={`${FIELD} min-w-[220px] flex-1 resize-y`}
              />
              <button
                type="button"
                disabled={ocupado || !motivo.trim()}
                onClick={() => enviar({ motivo: motivo.trim() })}
                className="rounded-lg bg-mandarin px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Enviar rechazo
              </button>
            </div>
          )}
          {estado.fase === "error" && (
            <p className="text-[11px] font-bold text-mandarin">No se pudo enviar: {estado.error}</p>
          )}
        </div>
      )}
    </li>
  );
}

export default function GuardiasRoute() {
  const { email } = useAuth();
  const equipo = useEquipo();
  const yo = useMemo(() => (equipo || []).find((m) => mismoEmail(m.email, email)) || null, [equipo, email]);
  const resueltoPor = yo?.nombre || email || "coordinación";

  const { snap, reload, post } = useGuardias("todas");
  const todas = snap?.data?.guardias || [];

  const [q, setQ] = useState(curQ());
  const [idResaltado, setIdResaltado] = useState(null);
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) setIdResaltado(id);
    } catch {}
  }, []);

  const qsDisponibles = useMemo(() => {
    const set = new Set();
    const año = new Date().getFullYear();
    [año - 1, año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) set.add(`${a}Q${i}`); });
    todas.forEach((g) => { const qq = qDeFecha(g.fecha); if (qq) set.add(qq); });
    return [...set].sort();
  }, [todas]);

  const pendientes = useMemo(
    () => todas.filter((g) => g.estado === "pendiente").sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    [todas]
  );
  const delQ = useMemo(
    () => todas.filter((g) => qDeFecha(g.fecha) === q).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [todas, q]
  );

  const resolver = async (id, payload) => {
    const body = { id, resueltoPor, ...(payload.motivo ? { estado: "rechazada", motivo: payload.motivo } : { estado: "aprobada", importe: payload.importe }) };
    await post("resolver", body);
    reload();
  };

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.purple }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.canary }} />
      </div>

      <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-purple/80">Coordinación</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconClock size={34} className="text-purple" /> Guardias
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Solicitudes de guardia del equipo. Las pendientes salen siempre destacadas arriba, sea cual sea el Q elegido.
          </p>
        </header>

        {!snap ? (
          <PanelSkeleton />
        ) : snap.error ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-2 text-xs font-bold text-canary">
            <IconAlert size={13} /> {snap.error}
          </p>
        ) : (
          <>
            {/* ── Pendientes (siempre visibles) ── */}
            <section className="mb-6">
              <h2 className="mb-3 font-display text-lg font-bold text-sand">
                Pendientes de resolución {pendientes.length > 0 && <span className={TEXT.canary}>({pendientes.length})</span>}
              </h2>
              {pendientes.length === 0 ? (
                <EmptyCard>No hay guardias pendientes de resolver.</EmptyCard>
              ) : (
                <ul className="space-y-2">
                  {pendientes.map((g) => (
                    <GuardiaRow key={g.id} g={g} resaltada={g.id === idResaltado} resolver={resolver} />
                  ))}
                </ul>
              )}
            </section>

            {/* ── Todas las del Q ── */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-sand">Guardias del Q</h2>
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sand/60">
                  Trimestre
                  <select value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} !py-2 font-bold`}>
                    {qsDisponibles.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
              </div>
              {delQ.length === 0 ? (
                <EmptyCard>Sin guardias en {q}.</EmptyCard>
              ) : (
                <ul className="space-y-2">
                  {delQ.map((g) => (
                    <GuardiaRow key={g.id} g={g} resaltada={g.id === idResaltado} resolver={resolver} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
