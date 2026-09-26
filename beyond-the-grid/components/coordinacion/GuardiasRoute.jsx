"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useAuth } from "../chrome/AuthGate";
import { useEquipo } from "../timereport/datos";
import { mismoEmail } from "@/lib/email";
import { FIELD, TEXT, EmptyCard, PanelSkeleton } from "./ui";
import { IconClock, IconAlert, IconX, IconPlus } from "./icons";
import { IconCheck } from "../icons";
import { curQ } from "./model";
import { useGuardias, errorAviso } from "../guardias/datos";
import { qDeFecha, fechaEs, eur, ESTADO, hoyISO } from "../guardias/model";

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

function GuardiaRow({ g, resaltada, resolver, onMyNfq, onBorrar }) {
  const [modo, setModo] = useState(null); // null | 'otro' | 'rechazar'
  const [otro, setOtro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [estado, setEstado] = useState({ fase: "quieto" }); // quieto | enviando | error
  const [myNfqOcupado, setMyNfqOcupado] = useState(false);
  const [borrando, setBorrando] = useState(false);
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

  const toggleMyNfq = async () => {
    setMyNfqOcupado(true);
    try { await onMyNfq(g.id, !g.aprobadaMyNfq); } finally { setMyNfqOcupado(false); }
  };

  const borrar = async () => {
    if (!window.confirm(`¿Borrar esta guardia (${g.persona}, ${fechaEs(g.fecha)})? No se puede deshacer.`)) return;
    setBorrando(true);
    try { await onBorrar(g.id); } finally { setBorrando(false); }
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
        {g.prueba && (
          <span className="inline-block whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sand/70">
            🧪 Prueba
          </span>
        )}
        {g.estado === "aprobada" && g.importe != null && (
          <span className={`font-bold tabular-nums ${TEXT.lime}`}>{eur.format(g.importe)}</span>
        )}
        {onBorrar && (
          <button
            type="button"
            disabled={borrando}
            onClick={borrar}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-mandarin/40 bg-mandarin/10 px-2.5 py-1 text-[11px] font-bold text-mandarin transition hover:bg-mandarin/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconX size={12} /> {borrando ? "Borrando…" : "Borrar"}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-sand/70">{g.descripcion}</p>
      {g.estado === "rechazada" && g.motivo && <p className="mt-1.5 text-mandarin">Motivo: {g.motivo}</p>}
      {g.estado !== "pendiente" && g.resueltoPor && (
        <p className="mt-1 text-[11px] text-sand/40">Resuelta por {g.resueltoPor}</p>
      )}
      {g.estado === "aprobada" && onMyNfq && (
        <label className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] text-sand/80">
          <input
            type="checkbox" checked={!!g.aprobadaMyNfq} disabled={myNfqOcupado}
            onChange={toggleMyNfq}
            className="h-3.5 w-3.5 accent-[#88E783]"
          />
          Aprobada en myNfq
          {g.aprobadaMyNfq && <IconCheck size={12} className="text-lime" />}
        </label>
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

  // Las de PRUEBA nunca entran en Pendientes ni en el Q: tienen su propia
  // sección aparte, para que no salgan mezcladas con solicitudes reales en
  // ningún sitio.
  const pendientes = useMemo(
    () => todas.filter((g) => g.estado === "pendiente" && !g.prueba).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    [todas]
  );
  const delQ = useMemo(
    () => todas.filter((g) => qDeFecha(g.fecha) === q && !g.prueba).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [todas, q]
  );
  const pruebas = useMemo(
    () => todas.filter((g) => g.prueba).sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1)),
    [todas]
  );

  // Si la guardia se guarda pero el correo no sale, se dice aquí arriba en
  // vez de callarlo (el backend devuelve aviso:{ok:false, error}).
  const [avisoEmail, setAvisoEmail] = useState("");

  const resolver = async (id, payload) => {
    const body = { id, resueltoPor, ...(payload.motivo ? { estado: "rechazada", motivo: payload.motivo } : { estado: "aprobada", importe: payload.importe }) };
    try {
      const d = await post("resolver", body);
      const err = errorAviso(d);
      setAvisoEmail(err ? `La guardia se resolvió, pero no se pudo avisar por correo a quien la pidió (${err}).` : "");
    } finally {
      reload(); // también tras un error: puede que se guardara igualmente
    }
  };

  const marcarMyNfq = async (id, valor) => {
    await post("marcarMyNfq", { id, valor });
    reload();
  };

  // Borra cualquier guardia (pendiente, aprobada o rechazada; prueba o real):
  // para limpiar pruebas y para corregir una guardia dada de alta por error.
  const borrar = async (id) => {
    await post("borrar", { id });
    reload();
  };

  /* Guardia de PRUEBA: un clic, sin formulario — solo para comprobar que el
     aviso llega a coordinación y que aprobar/rechazar responde por email.
     Va con la identidad de quien la pulsa (persona y email = quien está en
     esta página, ya filtrada por SoloCoordinacion), así el circuito entero
     queda entre coordinadores: el aviso de alta ya solo va a coordinación,
     y la respuesta al resolverla vuelve a quien la creó. */
  const [prueba, setPrueba] = useState({ fase: "quieto" }); // quieto | enviando | ok | error
  const crearPrueba = async () => {
    setPrueba({ fase: "enviando" });
    let d;
    try {
      const ahora = new Date();
      const fin = new Date(ahora.getTime() + 60 * 60 * 1000);
      const hhmm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      d = await post("crear", {
        persona: resueltoPor, email: yo?.email || email,
        fecha: hoyISO(), horaEntrada: hhmm(ahora), horaSalida: hhmm(fin),
        descripcion: `Guardia de prueba generada por ${resueltoPor} desde Coordinación para comprobar los avisos.`,
        prueba: true,
      });
      setPrueba({ fase: "ok", avisoError: errorAviso(d) });
    } catch (e) {
      setPrueba({ fase: "error", error: String(e.message || e) });
    }
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={prueba.fase === "enviando" || !!snap?.error}
              onClick={crearPrueba}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.055] px-4 py-2 text-xs font-bold uppercase tracking-wider text-sand/80 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            >
              {prueba.fase === "enviando" ? (
                <><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sand/30 border-t-sand" /> Enviando…</>
              ) : (
                <>🧪 <IconPlus size={13} /> Guardia de prueba</>
              )}
            </button>
            <span className="text-[11px] text-sand/45">
              Solo entre coordinadores: el aviso y la resolución se quedan aquí, no llegan a nadie más.
            </span>
          </div>
          {prueba.fase === "ok" && !prueba.avisoError && (
            <p className="mt-2 text-[11.5px] font-bold text-lime">Enviada — revisa el correo de coordinación y resuélvela abajo, en "🧪 Pruebas".</p>
          )}
          {prueba.fase === "ok" && prueba.avisoError && (
            <p className="mt-2 text-[11.5px] font-bold text-canary">Guardada en "🧪 Pruebas", pero el correo a coordinación no salió: {prueba.avisoError}</p>
          )}
          {prueba.fase === "error" && (
            <p className="mt-2 text-[11.5px] font-bold text-mandarin">No se pudo enviar: {prueba.error}</p>
          )}
          {avisoEmail && (
            <p className="mt-2 rounded-lg border border-canary/50 bg-canary/10 px-3 py-2 text-[11.5px] font-bold text-canary">
              {avisoEmail}
            </p>
          )}
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
                    <GuardiaRow key={g.id} g={g} resaltada={g.id === idResaltado} resolver={resolver} onMyNfq={marcarMyNfq} onBorrar={borrar} />
                  ))}
                </ul>
              )}
            </section>

            {/* ── Todas las del Q ── */}
            <section className="mb-6">
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
                    <GuardiaRow key={g.id} g={g} resaltada={g.id === idResaltado} resolver={resolver} onMyNfq={marcarMyNfq} onBorrar={borrar} />
                  ))}
                </ul>
              )}
            </section>

            {/* ── Pruebas: aparte de todo lo demás ── */}
            {pruebas.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg font-bold text-sand">🧪 Pruebas ({pruebas.length})</h2>
                <p className="mb-3 text-[11px] text-sand/45">
                  No cuentan como guardias reales y no salen en Pendientes ni en el Q. Bórralas cuando termines de probar.
                </p>
                <ul className="space-y-2">
                  {pruebas.map((g) => (
                    <GuardiaRow key={g.id} g={g} resaltada={g.id === idResaltado} resolver={resolver} onBorrar={borrar} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
