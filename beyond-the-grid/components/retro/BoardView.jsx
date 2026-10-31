"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import {
  CATEGORIAS, FASES_NOMBRES, MEJORAS_COLOR, TERMOMETRO_OPCIONES,
  ordenarTarjetas, parseReconocimiento,
} from "./constants";
import { useRetroSession } from "./useRetroSession";
import { GLASS, Modal, Skel, usePanel } from "./ui";
import {
  IconArrowL, IconBackward, IconChevronD, IconChevronR, IconForward,
  IconHeart, IconHeartFill, IconPlus, IconStar, IconThermo, IconUsers,
} from "./icons";

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#FFB56B] px-3 py-1.5 text-sm font-bold text-[#001391] shadow transition hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-sand/80 transition hover:border-white/30 hover:bg-white/[0.1] hover:text-sand active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";

/** Migas de fase (réplica funcional del phase-nav del legacy, scrollable en móvil). */
function PhaseNav({ fase }) {
  return (
    <ol aria-label="Fases de la retrospectiva" className="mt-4 flex items-center gap-0.5 overflow-x-auto pb-1 text-xs font-medium">
      {FASES_NOMBRES.map((nom, i) => {
        const n = i + 1;
        const active = n === fase;
        const past = n < fase;
        return (
          <li key={nom} className="flex shrink-0 items-center gap-0.5">
            {active ? (
              <span aria-current="step" className="flex items-center gap-1.5 rounded-full bg-[#FFB56B] px-3 py-1 font-bold text-[#001391] shadow-sm">
                <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#001391]/15 text-[10px] tabular-nums">{n}</span>
                {nom}
              </span>
            ) : (
              <span className={`flex items-center gap-1 px-2 py-1 ${past ? "text-sand/75" : "text-sand/35"}`}>
                <span className="tabular-nums">{n}.</span> {nom}
              </span>
            )}
            {i < FASES_NOMBRES.length - 1 && <IconChevronR size={12} className="shrink-0 text-sand/25" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Desplegable de participantes (solo organizador, como en el legacy). */
function Participantes({ usuarios }) {
  const panel = usePanel();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unicos = useMemo(() => [...new Set(usuarios)], [usuarios]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={BTN_GHOST}
      >
        <IconUsers size={15} className="text-serene" />
        <span className="tabular-nums">{unicos.length || 1}</span>
        <IconChevronD size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl ${panel} p-1.5`}>
          <p className="border-b border-white/10 px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-sand/55">
            Participantes
          </p>
          <ul className="max-h-48 overflow-y-auto py-1 text-sm text-sand/80">
            {unicos.length ? (
              unicos.map((u) => (
                <li key={u} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/[0.06]">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                  <span className="truncate">{u}</span>
                </li>
              ))
            ) : (
              <li className="px-2 py-1 text-xs italic text-sand/45">Solo tú</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Tarjeta del tablero (con badge "Para:" en reconocimientos y corazón de votos). */
function Tarjeta({ t, color, fase, onVotar }) {
  const acc = useAccentMap();
  const { txt, dest } = parseReconocimiento(t);
  return (
    <article
      className="rounded-xl border border-white/10 bg-white/[0.05] p-3 transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
      style={{ borderLeft: `3px solid ${rgba(color, 0.85)}` }}
    >
      {dest && (
        <p className="mb-2">
          <span className="inline-flex items-center gap-1 rounded border border-serene/40 bg-serene/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-serene">
            <IconStar size={11} className="text-canary" /> Para: {dest}
          </span>
        </p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed text-sand/90">{txt}</p>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-xs">
        {fase === 3 && (
          <button
            type="button"
            onClick={() => onVotar(t.id)}
            aria-label="Votar esta tarjeta"
            className="rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1 text-sand/50 transition hover:border-mandarin/50 hover:bg-mandarin/10 hover:text-mandarin active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
          >
            <IconHeart size={13} />
          </button>
        )}
        {t.votos > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-white/[0.08] px-1.5 py-0.5 font-bold tabular-nums text-sand">
            <IconHeartFill size={11} className="text-mandarin" /> {t.votos}
          </span>
        )}
      </div>
    </article>
  );
}

/** Columna del tablero con cabecera de acento y botón de añadir. */
function Columna({ titulo, desc, color, children, vacia, addLabel, onAdd, delay = 0 }) {
  const acc = useAccentMap();
  return (
    <section
      aria-label={titulo}
      className={`rdr-rise flex min-h-[180px] flex-col overflow-hidden ${GLASS} transition hover:border-white/25`}
      style={{ boxShadow: `inset 0 2px 0 ${rgba(color, 0.75)}`, animationDelay: `${delay}ms` }}
    >
      <div className="border-b border-white/10 p-3.5">
        <h3 className="font-display text-base font-bold" style={{ color: acc(color) }}>{titulo}</h3>
        <p className="mt-0.5 text-xs text-sand/55">{desc}</p>
      </div>
      <div className="flex-1 space-y-3 p-3">
        {children}
        {vacia && <p className="px-1 py-4 text-center text-xs italic text-sand/40">Sin entradas todavía</p>}
      </div>
      {onAdd && (
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm font-medium transition hover:bg-white/[0.07] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            style={{ color: acc(color) }}
          >
            <IconPlus size={15} /> {addLabel}
          </button>
        </div>
      )}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" className="space-y-6">
      <Skel className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skel className="h-72 w-full rounded-2xl" />
        <Skel className="h-72 w-full rounded-2xl" />
        <Skel className="h-72 w-full rounded-2xl" />
        <Skel className="h-72 w-full rounded-2xl" />
      </div>
      <p role="status" aria-live="polite" className="text-center text-xs font-bold uppercase tracking-[0.3em] text-serene/80">
        Entrando a la sesión…
      </p>
    </div>
  );
}

/**
 * Sala de retrospectiva en vivo. Misma máquina de fases que el legacy:
 *  1 Termómetro · 2 Grupo (añadir) · 3 Votar · 4 Comentamos (mejoras) · 5 Completo.
 */
export default function BoardView({ gasGet, gasPost, sessionId, nombre, role, onSalir, alerta, toast }) {
  const acc = useAccentMap();
  const fatal = (err) => {
    alerta("⚠️ Error de conexión: " + err.message);
    onSalir();
  };
  const fatalRef = useRef(fatal);
  fatalRef.current = fatal;

  const { estado, mutar } = useRetroSession({
    gasGet,
    gasPost,
    sessionId,
    onFatal: (err) => fatalRef.current(err),
  });

  // Voto local del termómetro: se resetea al entrar en la sesión (como el legacy).
  const [votadoLocal, setVotadoLocal] = useState(false);

  // Registro del participante al entrar (el legacy lo salta para "Anónimo").
  // Guard: UNA sola vez por sesión, aunque el nombre se re-resuelva después.
  const registrado = useRef(null);
  useEffect(() => {
    if (!nombre || nombre === "Anónimo" || registrado.current === sessionId) return;
    registrado.current = sessionId;
    gasPost("registrarUsuario", { idSesion: sessionId, nombre }).catch((err) =>
      console.warn("No se pudo registrar usuario:", err.message)
    );
  }, [gasPost, sessionId, nombre]);

  /** Wrapper de mutaciones: toasts unificados + alerta de error (idéntico al legacy). */
  const ejecutar = async (accion, payload, mensajes, errorMsg) => {
    if (mensajes && mensajes.progreso) toast.progress(mensajes.progreso);
    try {
      await mutar(accion, payload);
      if (mensajes && mensajes.exito) toast.success(mensajes.exito);
    } catch (err) {
      toast.hide();
      if (errorMsg !== false) alerta((errorMsg || "Error") + ": " + err.message);
      throw err;
    }
  };

  const avanzarFase = () => {
    if (role !== "organizador" || !estado || estado.fase >= 5) return;
    ejecutar("cambiarFase", { nuevaFase: estado.fase + 1 }, { progreso: "Avanzando de fase...", exito: "¡Fase actualizada!" }, "⚠️ Error al cambiar de fase").catch(() => {});
  };
  const retrocederFase = () => {
    if (role !== "organizador" || !estado || estado.fase <= 1) return;
    ejecutar("cambiarFase", { nuevaFase: estado.fase - 1 }, { progreso: "Retrocediendo de fase...", exito: "¡Fase actualizada!" }, "⚠️ Error al cambiar de fase").catch(() => {});
  };
  const votarTermometro = (idOp) => {
    if (!estado || estado.fase !== 1 || votadoLocal) return;
    setVotadoLocal(true);
    ejecutar("votoTermometro", { idOpcionVoto: idOp }, { progreso: "Guardando voto...", exito: "¡Voto anónimo registrado!" }, "Error al votar").catch(() => setVotadoLocal(false));
  };
  const votarTarjeta = (idTarjeta) => {
    if (!estado || estado.fase !== 3) return;
    // Sin alerta si falla (solo toast), como el legacy.
    ejecutar("votarTarjeta", { idTarjeta }, { progreso: "Registrando voto...", exito: "¡Voto registrado!" }, false).catch(() => {});
  };

  // ── Modal añadir tarjeta / mejora ──
  const [modal, setModal] = useState(null); // { categoria } | { esMejora: true } | null
  const [texto, setTexto] = useState("");
  const [destinatario, setDestinatario] = useState("Todo el equipo");

  const abrirTarjeta = (categoria) => {
    if (!estado || estado.fase !== 2) return;
    setTexto("");
    setDestinatario("Todo el equipo");
    setModal({ categoria });
  };
  const abrirMejora = () => {
    if (role !== "organizador" || !estado || estado.fase === 5) return;
    setTexto("");
    setModal({ esMejora: true });
  };
  const guardarModal = () => {
    let t = texto.trim();
    if (!t || !modal) return;
    const m = modal;
    setModal(null);
    let accion;
    let params;
    if (m.esMejora) {
      accion = "crearMejora";
      params = { texto: t };
    } else {
      if (m.categoria === "RECONOCIMIENTO") t = `[PARA:${destinatario || "Todo el equipo"}]${t}`;
      accion = "crearTarjeta";
      params = { categoria: m.categoria, texto: t };
    }
    ejecutar(accion, params, { progreso: "Añadiendo elemento...", exito: "¡Elemento añadido!" }, "Error al añadir").catch(() => {});
  };

  if (!estado) return <BoardSkeleton />;

  const { fase, nombreSesion, usuarios, votosTermometro, tarjetas, mejoras } = estado;
  const total = Object.values(votosTermometro).reduce((a, b) => a + b, 0);
  const showRes = fase > 1;
  const canVote = fase === 1 && !votadoLocal;
  const ordenadas = ordenarTarjetas(tarjetas, fase);
  const otros = [...new Set(usuarios)].filter((u) => u !== nombre);

  const termometro = (
    <section aria-label="Termómetro de confianza" className={`rdr-rise flex flex-col overflow-hidden ${GLASS}`} style={{ boxShadow: `inset 0 2px 0 ${rgba(PALETTE.royal, 0.75)}` }}>
      <div className="border-b border-white/10 p-4">
        <h3 className="flex items-center gap-2 font-display text-base font-bold text-sand">
          <IconThermo size={17} className="text-serene" /> Termómetro
        </h3>
        <p className="mt-0.5 text-xs text-sand/55">Encuesta anónima de confianza</p>
      </div>
      <div className="space-y-2.5 p-4">
        {TERMOMETRO_OPCIONES.map((op) => {
          const v = votosTermometro[op.id] || 0;
          const pct = total ? Math.round((v / total) * 100) : 0;
          const Cmp = canVote ? "button" : "div";
          return (
            <Cmp
              key={op.id}
              {...(canVote
                ? { type: "button", onClick: () => votarTermometro(op.id), "aria-label": `Votar: ${op.texto}` }
                : {})}
              className={`relative block w-full overflow-hidden rounded-lg border border-white/12 p-2.5 text-left transition ${
                canVote
                  ? "cursor-pointer hover:-translate-y-0.5 hover:border-mandarin/50 hover:bg-white/[0.07] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  : "opacity-95"
              }`}
            >
              {showRes && (
                <span aria-hidden className="absolute bottom-0 left-0 top-0 transition-all duration-500" style={{ width: `${pct}%`, background: rgba(op.color, 0.28) }} />
              )}
              <span className="relative z-10 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="text-lg leading-none">{op.emoji}</span>
                  <span className="text-sm font-medium text-sand">{op.texto}</span>
                </span>
                {showRes && <span className="text-xs font-bold tabular-nums text-sand/65">{pct}%</span>}
              </span>
            </Cmp>
          );
        })}
        {fase === 1 && votadoLocal && (
          <p className="pt-1 text-center text-xs text-lime" role="status">Voto registrado. Esperando al resto del equipo…</p>
        )}
      </div>
      <div className="mt-auto border-t border-white/10 bg-white/[0.03] p-3 text-center text-xs text-sand/60">
        <span className="font-medium tabular-nums">{total} Voto{total !== 1 ? "s" : ""}</span>
      </div>
    </section>
  );

  return (
    <div>
      {/* ══ Barra de sesión ══ */}
      <div className={`rdr-rise relative z-20 ${GLASS} p-4`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={onSalir} className={BTN_GHOST} aria-label="Volver al menú de sesiones">
            <IconArrowL size={15} /> <span className="hidden sm:inline">Menú</span>
          </button>
          <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-sand">
            Retro RDR
            {nombreSesion && <span className="font-sans text-sm font-normal text-mandarin"> · {nombreSesion}</span>}
          </h2>
          <span className="hidden items-center gap-1.5 text-xs text-sand/60 md:flex">
            {nombre} <span className="text-sand/35">({role})</span>
          </span>
          {role === "organizador" && (
            <>
              <Participantes usuarios={usuarios} />
              {fase > 1 && (
                <button type="button" onClick={retrocederFase} className={BTN_GHOST}>
                  <IconBackward size={14} /> <span className="hidden md:inline">Atrás</span>
                </button>
              )}
              {fase < 5 && (
                <button type="button" onClick={avanzarFase} className={BTN_PRIMARY}>
                  <span className="hidden md:inline">Avanzar</span> <IconForward size={14} />
                </button>
              )}
            </>
          )}
        </div>
        <PhaseNav fase={fase} />
      </div>

      {/* ══ Contenido por fase ══ */}
      {fase === 1 ? (
        <div className="mx-auto mt-6 w-full max-w-md">{termometro}</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-cabecera">{termometro}</div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {CATEGORIAS.map((cat, i) => {
              const items = ordenadas.filter((t) => t.categoria === cat.id);
              return (
                <Columna
                  key={cat.id}
                  titulo={cat.titulo}
                  desc={cat.desc}
                  color={cat.color}
                  vacia={!items.length}
                  addLabel="Agregar elemento"
                  onAdd={fase === 2 ? () => abrirTarjeta(cat.id) : null}
                  delay={40 + i * 50}
                >
                  {items.map((t) => (
                    <Tarjeta key={t.id} t={t} color={cat.color} fase={fase} onVotar={votarTarjeta} />
                  ))}
                </Columna>
              );
            })}
            {fase >= 4 && (
              <Columna
                titulo="Mejoras 📈"
                desc="Acciones para la próxima sesión"
                color={MEJORAS_COLOR}
                vacia={!mejoras.length}
                addLabel="Agregar acción"
                onAdd={fase === 4 && role === "organizador" ? abrirMejora : null}
                delay={190}
              >
                {mejoras.map((m, i) => (
                  <article
                    key={m.id || i}
                    className="rounded-xl border border-white/10 bg-white/[0.05] p-3 transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
                    style={{ borderLeft: `3px solid ${rgba(MEJORAS_COLOR, 0.85)}` }}
                  >
                    <p className="whitespace-pre-line text-sm leading-relaxed text-sand/90">{m.texto}</p>
                  </article>
                ))}
              </Columna>
            )}
          </div>
        </div>
      )}

      {/* ══ Modal añadir ══ */}
      <Modal open={!!modal} onClose={() => setModal(null)} labelledBy="retro-add-title">
        {modal && (
          <>
            <h3 id="retro-add-title" className="mb-4 border-b border-white/10 pb-2 font-display text-lg font-bold text-sand">
              {modal.esMejora ? "Añadir acción de mejora" : `Añadir a ${modal.categoria}`}
            </h3>
            {modal.categoria === "RECONOCIMIENTO" && (
              <div className="mb-3">
                <label htmlFor="retro-add-dest" className="mb-1 block text-xs font-bold uppercase tracking-wider text-sand/60">
                  ¿A quién va dirigido?
                </label>
                <select
                  id="retro-add-dest"
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-sand focus:border-mandarin/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                >
                  <option value="Todo el equipo">A todo el equipo</option>
                  {otros.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-sand/45">No puedes enviarte un reconocimiento a ti mismo.</p>
              </div>
            )}
            <textarea
              data-autofocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe aquí..."
              aria-label="Texto del elemento"
              className="h-24 w-full resize-none rounded-lg border border-white/15 bg-white/[0.06] p-3 text-sm text-sand placeholder:text-sand/40 focus:border-mandarin/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-sand/70 transition hover:bg-white/10 hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                Cancelar
              </button>
              <button type="button" onClick={guardarModal} disabled={!texto.trim()} className={`${BTN_PRIMARY} px-4 py-2 disabled:cursor-not-allowed disabled:opacity-50`}>
                Guardar
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
