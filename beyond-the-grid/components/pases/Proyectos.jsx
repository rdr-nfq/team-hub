"use client";

import { useEffect, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { usePases } from "./PasesRoute";
import {
  CIBRDR_PREFIX,
  getSchema,
  limpiarMulti,
  validarCodVsSchema,
  validarIdTraspasoValor,
  isT,
} from "./backend";
import { BTN, BtnIcon, CARD_CLS, INPUT_CLS, SELECT_CLS, LABEL_CLS, AutoTextarea, Empty } from "./ui";
import { IconTrash, IconSave, IconCheck, IconX, IconAlert, IconPlus } from "./icons";

/* Vista 1 · Preparación: proyectos + componentes + validador.
   Editable solo en FASE_2_3_PREPARACION (proyectosLocked el resto). */

// Rotación cíclica de acentos BBVA para distinguir proyectos (como el legacy).
const PROJECT_COLORS = [PALETTE.serene, PALETTE.lime, PALETTE.canary, PALETTE.mandarin, PALETTE.purple, PALETTE.aqua];

const AUTOSAVE_MS = 1200;

/* ── Banner de estado del pase (activo / cerrado / edición puntual) ── */
function StatusBanner() {
  const { fase, isCompletado, edicion, setEdicion, actions } = usePases();
  const [comentario, setComentario] = useState("");
  if (isCompletado) return null;
  if (fase === "FASE_2_3_PREPARACION")
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lime/40 bg-lime/10 px-4 py-3">
        <span className="text-sm font-bold text-lime">Pase activo · Preparación</span>
        <span className="text-[11px] text-sand/50">«Cancelar pase» está arriba, junto a «Abrir Sheets» (vale en cualquier fase).</span>
      </div>
    );
  if (fase && (fase.includes("CERRADO") || fase.includes("IMPLANTACION") || fase.includes("POST"))) {
    // Modo edición puntual: el pase sigue en su fase, pero proyectos y
    // secuencia se desbloquean; al terminar se notifica al equipo por correo.
    if (edicion)
      return (
        <div className="mb-4 space-y-3 rounded-xl border border-canary/50 bg-canary/10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-canary">✏️ Modo edición · el pase sigue cerrado, recuerda notificar los cambios</span>
            <button
              type="button"
              className={`${BTN.ghost} !px-3 !py-1.5 !text-xs`}
              onClick={() => {
                if (confirm("¿Salir de la edición SIN notificar al equipo? Si has cambiado algo, es mejor enviar el correo.")) setEdicion(false);
              }}
            >
              Salir sin notificar
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1">
              <span className={`${LABEL_CLS} mb-1 block`}>¿Qué se ha modificado? (irá en el correo al equipo)</span>
              <AutoTextarea
                className={INPUT_CLS}
                placeholder="Ej: añadido el componente X al paquete DP-KYTL-…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={BTN.success}
              disabled={!comentario.trim()}
              style={!comentario.trim() ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
              onClick={() => {
                actions.notificarModificacion(comentario.trim());
                setComentario("");
              }}
            >
              Terminar edición · Notificar al equipo
            </button>
          </div>
        </div>
      );
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mandarin/40 bg-mandarin/10 px-4 py-3">
        <span className="text-sm font-bold text-mandarin">Pase cerrado para edición</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BTN.warn} !px-3 !py-2 !text-xs`} onClick={() => setEdicion(true)}>
            ✏️ Editar pase (con aviso al equipo)
          </button>
          <button type="button" className={`${BTN.ghost} !px-3 !py-2 !text-xs`} onClick={actions.activarEmergencia}>
            Reabrir emergencia
          </button>
        </div>
      </div>
    );
  }
  return null;
}

/* ── Fila de componente (draft local + autosave con debounce) ── */
function CompRow({ c, E }) {
  const { actions, registerDraft, unregisterDraft, proyectosLocked } = usePases();
  const [d, setD] = useState(() => seed(c));
  const [dirty, setDirty] = useState(false);
  const timer = useRef();

  function seed(comp) {
    return {
      nom: comp.nombre || "", tipo: comp.tipo || "", subida: comp.subida || "", resp: comp.resp || "",
      cod: comp.codigo || "", us: comp.us || "", release: isT(comp.release), com: comp.comentarios || "",
    };
  }

  // Resincroniza desde el servidor solo si no hay edición en curso.
  useEffect(() => {
    if (!dirty) setD(seed(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.nombre, c.tipo, c.subida, c.resp, c.codigo, c.us, c.release, c.comentarios]);

  const save = async (draft) => {
    const ok = await actions.saveComp(c.fila, draft);
    if (ok) { setDirty(false); unregisterDraft(c.fila); }
  };

  const upd = (patch) => {
    const next = { ...d, ...patch };
    setD(next);
    setDirty(true);
    registerDraft(c.fila, next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), AUTOSAVE_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const schema = getSchema(E, d.subida);
  const codErr = validarCodVsSchema(d.cod, schema);

  const cell = "min-w-0";
  return (
    <div className="grid grid-cols-2 items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 lg:grid-cols-[1.4fr_0.9fr_0.9fr_1fr_1.2fr_0.8fr_60px_64px_1.2fr_72px] lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent lg:p-0 lg:py-2">
      <div className={`${cell} col-span-2 lg:col-span-1`}>
        <span className={`${LABEL_CLS} lg:hidden`}>Componente</span>
        <AutoTextarea className={INPUT_CLS} placeholder="Nombre…" value={d.nom} onChange={(e) => upd({ nom: e.target.value })} />
      </div>
      <div className={cell}>
        <span className={`${LABEL_CLS} lg:hidden`}>Tipo</span>
        <select className={SELECT_CLS} value={d.tipo} onChange={(e) => upd({ tipo: e.target.value })}>
          <option value=""></option>
          {(E.tiposComp || []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <div className={cell}>
        <span className={`${LABEL_CLS} lg:hidden`}>Subida</span>
        <select className={SELECT_CLS} value={d.subida} onChange={(e) => upd({ subida: e.target.value })}>
          <option value=""></option>
          {(E.tiposSubida || []).map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <div className={cell}>
        <span className={`${LABEL_CLS} lg:hidden`}>Cód.</span>
        <input
          type="text"
          className={`${INPUT_CLS} ${codErr ? "!border-mandarin/70" : ""}`}
          placeholder={schema ? schema + "…" : "Sin schema"}
          value={d.cod}
          title={codErr || undefined}
          onFocus={(e) => { if (!e.target.value.trim() && schema) upd({ cod: schema }); }}
          onChange={(e) => upd({ cod: e.target.value })}
        />
        {codErr && <p className="mt-1 text-[10px] font-bold text-mandarin">{codErr}</p>}
      </div>
      <div className={cell}>
        <span className={`${LABEL_CLS} lg:hidden`}>Historias usuario</span>
        <AutoTextarea
          className={INPUT_CLS}
          placeholder="CIBRDR-…"
          value={d.us}
          onFocus={(e) => { if (!e.target.value.trim()) upd({ us: CIBRDR_PREFIX }); }}
          onBlur={() => { const limpio = limpiarMulti(d.us); const nuevo = limpio ? limpio + "; " : ""; if (nuevo !== d.us) upd({ us: nuevo }); }}
          onChange={(e) => upd({ us: e.target.value })}
        />
      </div>
      <div className={cell}>
        <span className={`${LABEL_CLS} lg:hidden`}>Resp.</span>
        <select className={SELECT_CLS} value={d.resp} onChange={(e) => upd({ resp: e.target.value })}>
          <option value=""></option>
          {(E.equipo || []).map((x) => <option key={x} value={x}>{x.split(" ")[0]}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2 lg:justify-center lg:pt-2">
        <span className={`${LABEL_CLS} lg:hidden`}>tech-kytl</span>
        <input type="checkbox" className="h-4 w-4 accent-[#88E783]" checked={d.release} onChange={(e) => upd({ release: e.target.checked })} />
      </div>
      {/* Probado: acción optimista inmediata (no pasa por el draft/autosave). */}
      <div className="flex items-center gap-2 lg:justify-center lg:pt-2">
        <span className={`${LABEL_CLS} lg:hidden`}>Probado</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-[#88E783]"
          aria-label="Componente probado"
          checked={isT(c.probado)}
          onChange={(e) => actions.chkProbado(c.fila, e.target.checked)}
        />
      </div>
      <div className={`${cell} col-span-2 lg:col-span-1`}>
        <span className={`${LABEL_CLS} lg:hidden`}>Comentarios</span>
        <AutoTextarea className={INPUT_CLS} placeholder="Comentarios…" value={d.com} onChange={(e) => upd({ com: e.target.value })} />
      </div>
      {!proyectosLocked && (
        <div className="col-span-2 flex justify-end gap-1 lg:col-span-1 lg:justify-start lg:pt-1">
          <BtnIcon title="Guardar ahora" onClick={() => { clearTimeout(timer.current); save(d); }}>
            {dirty ? <IconSave size={15} className="text-canary" /> : <IconSave size={15} />}
          </BtnIcon>
          <BtnIcon title="Eliminar" danger onClick={() => actions.delComp(c.fila)}><IconTrash size={15} /></BtnIcon>
        </div>
      )}
    </div>
  );
}

/* ── Fila de componente en SOLO LECTURA (pase bloqueado) ──
   Sin inputs: texto plano seleccionable para poder copiar con el ratón el
   nombre, el código, las historias o el comentario de cualquier componente. */
function CompRowLectura({ c }) {
  const cell = "min-w-0 select-text";
  const V = ({ mono, children }) =>
    children ? (
      <p className={`break-words text-[12.5px] leading-snug text-sand ${mono ? "font-mono text-[11.5px]" : ""}`}>{children}</p>
    ) : (
      <p aria-hidden className="text-[12.5px] text-sand/30">—</p>
    );
  const Chk = ({ on }) =>
    on ? <IconCheck size={14} className="text-lime" aria-label="Sí" /> : <span aria-label="No" className="text-sand/30">—</span>;
  return (
    <div className="grid grid-cols-2 items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 lg:grid-cols-[1.4fr_0.9fr_0.9fr_1fr_1.2fr_0.8fr_60px_64px_1.2fr_72px] lg:rounded-none lg:border-0 lg:border-t lg:bg-transparent lg:p-0 lg:py-2.5">
      <div className={`${cell} col-span-2 lg:col-span-1`}>
        <span className={`${LABEL_CLS} lg:hidden`}>Componente</span>
        <V>{c.nombre}</V>
      </div>
      <div className={cell}><span className={`${LABEL_CLS} lg:hidden`}>Tipo</span><V>{c.tipo}</V></div>
      <div className={cell}><span className={`${LABEL_CLS} lg:hidden`}>Subida</span><V>{c.subida}</V></div>
      <div className={cell}><span className={`${LABEL_CLS} lg:hidden`}>Cód.</span><V mono>{c.codigo}</V></div>
      <div className={cell}><span className={`${LABEL_CLS} lg:hidden`}>Historias usuario</span><V mono>{c.us}</V></div>
      <div className={cell}><span className={`${LABEL_CLS} lg:hidden`}>Resp.</span><V>{(c.resp || "").split(" ")[0]}</V></div>
      <div className="flex items-center gap-2 lg:justify-center">
        <span className={`${LABEL_CLS} lg:hidden`}>tech-kytl</span>
        <Chk on={isT(c.release)} />
      </div>
      <div className="flex items-center gap-2 lg:justify-center">
        <span className={`${LABEL_CLS} lg:hidden`}>Probado</span>
        <Chk on={isT(c.probado)} />
      </div>
      <div className={`${cell} col-span-2 lg:col-span-1`}>
        <span className={`${LABEL_CLS} lg:hidden`}>Comentarios</span>
        <V>{c.comentarios}</V>
      </div>
      <div aria-hidden />
    </div>
  );
}

/* ── Contenedor de un proyecto ── */
function ProjectCard({ p, idx, E }) {
  const { actions, proyectosLocked } = usePases();
  const mapAccent = useAccentMap();
  const color = PROJECT_COLORS[idx % PROJECT_COLORS.length]; // superficie (dot, inset): literal, vale en ambos temas
  const textColor = mapAccent(color); // como TEXTO se tema (en claro los acentos claros no contrastan)
  const [idT, setIdT] = useState(p.idTraspaso || "");
  useEffect(() => { setIdT(p.idTraspaso || ""); }, [p.idTraspaso]);
  const idErr = validarIdTraspasoValor(idT);
  const feats = String(p.feature || "").split(";").map((f) => f.trim()).filter(Boolean);

  return (
    <section className={`${CARD_CLS} p-4`} style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <h4 className="font-display text-lg font-bold text-sand">{p.nombre}</h4>
          {feats.map((f) => (
            <span key={f} className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: textColor, backgroundColor: rgba(color, 0.14) }}>{f}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-sand/70">
          <span>Resp. BBVA: <strong className="text-sand">{p.cliente}</strong></span>
          <label className="flex items-center gap-1.5">
            <span className={LABEL_CLS}>ID Traspaso</span>
            {proyectosLocked ? (
              // Bloqueado: texto seleccionable (los inputs disabled no dejan copiar bien).
              <span className="select-text font-mono text-xs font-bold text-sand">{idT || "—"}</span>
            ) : (
              <input
                type="text"
                className={`${INPUT_CLS} !w-32 !py-1.5 ${idErr ? "!border-mandarin/70" : ""}`}
                placeholder="YYYY-…"
                value={idT}
                title={idErr || undefined}
                onFocus={(e) => { if (!e.target.value.trim()) { const v = new Date().getFullYear() + "-"; setIdT(v); actions.programarSaveIdTraspaso(p.nombre, v); } }}
                onChange={(e) => { setIdT(e.target.value); actions.programarSaveIdTraspaso(p.nombre, e.target.value); }}
              />
            )}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 font-bold text-sand">
            <input type="checkbox" className="h-4 w-4 accent-[#88E783]" checked={isT(p.ok)} disabled={proyectosLocked} onChange={(e) => actions.updOkProy(p.nombre, e.target.checked)} />
            OK proyecto
          </label>
          {!proyectosLocked && (
            <BtnIcon title="Eliminar proyecto" danger onClick={() => actions.delProyecto(p.nombre)}><IconTrash size={15} /></BtnIcon>
          )}
        </div>
      </header>

      {/* Tabla de componentes (cabecera solo desktop) */}
      <div className="overflow-x-auto">
        <div className="min-w-0 lg:min-w-[1044px]">
          <div className="hidden grid-cols-[1.4fr_0.9fr_0.9fr_1fr_1.2fr_0.8fr_60px_64px_1.2fr_72px] gap-2 pb-1.5 lg:grid">
            {["Componente", "Tipo", "Subida", "Cód.", "Historias usuario", "Resp.", "tech-kytl", "Probado", "Comentarios", ""].map((h, i) => (
              <span key={i} className={`${LABEL_CLS} ${h === "tech-kytl" || h === "Probado" ? "text-center" : ""}`}>{h}</span>
            ))}
          </div>
          <div className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-white/[0.06]">
            {(p.componentes || []).map((c) =>
              proyectosLocked ? <CompRowLectura key={c.fila} c={c} /> : <CompRow key={c.fila} c={c} E={E} />
            )}
          </div>
        </div>
      </div>

      {!proyectosLocked && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="text-xs text-sand/60">+ Añadir componentes en blanco:</span>
          {[1, 5, 10].map((n) => (
            <button key={n} type="button" className={`${BTN.ghost} !px-3 !py-1.5 !text-xs`} onClick={() => actions.addCompVacio(p.nombre, n)}>+ {n}</button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Formulario "Añadir proyecto" ── */
function AddProyecto({ E }) {
  const { actions } = usePases();
  const [nombre, setNombre] = useState("");
  const [feature, setFeature] = useState("");
  const [resp, setResp] = useState("");
  const submit = async () => {
    await actions.addProyecto({ nombre: nombre.trim(), feature, respBBVA: resp });
    setNombre(""); setFeature("");
  };
  return (
    <section className={`${CARD_CLS} p-4`}>
      <h4 className="mb-3 font-display text-base font-bold text-sand">Añadir nuevo proyecto</h4>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Nombre proyecto</span>
          <input type="text" className={INPUT_CLS} placeholder="Ej: Integración de emisiones…" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Feature</span>
          <input
            type="text" className={INPUT_CLS} placeholder="CIBRDR-…" value={feature}
            onFocus={(e) => { if (!e.target.value.trim()) setFeature(CIBRDR_PREFIX); }}
            onBlur={() => { const l = limpiarMulti(feature); setFeature(l ? l + "; " : ""); }}
            onChange={(e) => setFeature(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Resp. BBVA</span>
          <select className={SELECT_CLS} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">Elegir…</option>
            {(E.clientes || E.equipo || []).map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <button type="button" className={BTN.accent} onClick={submit}><IconPlus size={15} /> Añadir proyecto</button>
      </div>
    </section>
  );
}

/* ── Caja del validador (solo en preparación) ── */
function ValidadorBox() {
  const { validador, validadorFlash, fase } = usePases();
  if (fase !== "FASE_2_3_PREPARACION" || !validador) return null;
  return (
    <section
      key={validadorFlash} // reinicia la animación de aviso al fallar el avance
      className={`${CARD_CLS} p-4 ${validadorFlash ? "animate-[rdr-rise_0.45s_ease_both] ring-2 ring-mandarin/60" : ""}`}
      aria-label="Validador de preparación"
    >
      <h4 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-sand">
        <IconAlert size={16} className="text-canary" /> Validador del pase
      </h4>
      <ul className="space-y-1.5">
        {validador.items.map((it, i) => (
          <li key={i} className={`flex items-start gap-2 text-[13px] ${it.ok ? "text-sand/75" : "font-semibold text-mandarin"}`}>
            {it.ok
              ? <IconCheck size={15} className="mt-0.5 shrink-0 text-lime" />
              : <IconX size={15} className="mt-0.5 shrink-0 text-mandarin" />}
            {it.txt}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Proyectos() {
  const { E, fase, isCompletado, proyectosLocked, validador, actions } = usePases();

  return (
    <div className="space-y-4">
      <StatusBanner />

      {/* Con el pase bloqueado, las filas se pintan en SOLO LECTURA (texto
          plano seleccionable): no se puede modificar nada, pero sí marcar
          con el ratón y copiar componentes, códigos o comentarios. */}
      <div className="space-y-4">
        {(E.proyectos || []).length === 0 && <Empty>Aún no hay proyectos en este pase.</Empty>}
        {(E.proyectos || []).map((p, idx) => <ProjectCard key={p.nombre} p={p} idx={idx} E={E} />)}
        {!proyectosLocked && <AddProyecto E={E} />}
      </div>

      <ValidadorBox />

      {fase === "FASE_2_3_PREPARACION" && !isCompletado && (
        <button
          type="button"
          className={`${validador?.todoCorrecto ? BTN.success : BTN.ghost} w-full`}
          onClick={actions.validarYAvanzarPrep}
        >
          {validador?.todoCorrecto ? "Cerrar preparación · Avanzar al pase" : "Completa el validador para avanzar"}
        </button>
      )}
    </div>
  );
}
