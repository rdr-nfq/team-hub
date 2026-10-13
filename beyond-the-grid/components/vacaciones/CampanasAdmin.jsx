"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { GLASS, FIELD, TEXT, EmptyCard } from "../coordinacion/ui";
import { IconPlus, IconX } from "../coordinacion/icons";
import { deIso, isoDe, fechaCortaEs } from "./datos";
import { rangoSemana, solsDeSemana } from "./CampanaForm";

/* Coordinación · pestaña «Formularios»: formularios especiales de vacaciones
   (Navidad, Verano…) que salen encima del normal en /vacaciones.
   Por formulario: nombre, semanas que se pueden elegir, si la descripción es
   obligatoria y su texto de ayuda, y mostrar/ocultar. Debajo, quién ha pedido
   qué semana y su descripción (p. ej. el backup que deja). */

const BTN = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";
const SUGERENCIA_BACKUP = "Indica el backup que dejas en cada uno de tus proyectos (proyecto → persona que te cubre).";

const lunesDe = (iso) => { const d = deIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDe(d); };
const masDias = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const lunesEntre = (desde, hasta) => { const out = []; for (let l = lunesDe(desde); l <= hasta; l = masDias(l, 7)) out.push(l); return out; };

/** Plantillas: semanas de Navidad (de la del 21/12 a la de Reyes) y de verano (julio y agosto). */
function plantilla(tipo, anio) {
  if (tipo === "navidad")
    return {
      nombre: `Navidad ${anio}`, emoji: "🎄", texto: "Marca la semana o semanas que te coges en Navidad.",
      semanas: lunesEntre(`${anio}-12-21`, `${anio + 1}-01-07`),
    };
  return {
    nombre: `Verano ${anio}`, emoji: "☀️", texto: "Marca las semanas que te coges en verano.",
    semanas: lunesEntre(`${anio}-07-01`, `${anio}-08-31`),
  };
}

function Editor({ inicial, d, post, onHecho, onCancelar }) {
  const [c, setC] = useState(() => ({ activa: false, descripcionObligatoria: true, sugerencia: SUGERENCIA_BACKUP, tipo: "VA", semanas: [], emoji: "", texto: "", ...inicial }));
  const [nueva, setNueva] = useState("");
  const [estado, setEstado] = useState("");
  const set = (x) => setC((prev) => ({ ...prev, ...x }));
  const aplicar = (tipo) => {
    const anio = tipo === "navidad" ? new Date().getFullYear() : new Date().getMonth() > 7 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    set(plantilla(tipo, anio));
  };
  const anadir = () => {
    if (!nueva) return;
    const l = lunesDe(nueva);
    set({ semanas: [...new Set([...c.semanas, l])].sort() });
    setNueva("");
  };
  // Años que tocan las semanas y no tienen Vacas_<año>: no se podrán pedir.
  const sinAnio = [...new Set(c.semanas.flatMap((l) => [l.slice(0, 4), masDias(l, 4).slice(0, 4)]))].filter((a) => !(d.anios || []).includes(Number(a)));
  const guardar = async () => {
    setEstado("…");
    try {
      await post("guardarCampana", { campana: c });
      setEstado("");
      onHecho(`Formulario «${c.nombre}» guardado${c.activa ? " y visible para el equipo" : " (oculto)"}.`);
    } catch (e) {
      setEstado("error:" + String(e.message || e));
    }
  };

  return (
    <section className={`${GLASS} space-y-3 p-4`} aria-label="Editar formulario">
      {!inicial?.id && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-sand/60">
          Empezar desde:
          <button type="button" onClick={() => aplicar("navidad")} className={`${BTN} border border-white/15 text-sand/85 hover:border-white/30`}>🎄 Navidad</button>
          <button type="button" onClick={() => aplicar("verano")} className={`${BTN} border border-white/15 text-sand/85 hover:border-white/30`}>☀️ Verano</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-12">
        <label className="block sm:col-span-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Emoji</span>
          <input value={c.emoji} onChange={(e) => set({ emoji: e.target.value })} maxLength={4} className={`${FIELD} block w-full text-center`} />
        </label>
        <label className="block sm:col-span-5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Nombre</span>
          <input value={c.nombre || ""} onChange={(e) => set({ nombre: e.target.value })} placeholder="Navidad 2026" className={`${FIELD} block w-full`} />
        </label>
        <label className="block sm:col-span-4">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Tipo de días</span>
          <select value={c.tipo} onChange={(e) => set({ tipo: e.target.value })} className={`${FIELD} block w-full`}>
            {(d.tipos || []).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-[12.5px] text-sand/80 sm:col-span-2">
          <input type="checkbox" checked={!!c.activa} onChange={(e) => set({ activa: e.target.checked })} className="h-4 w-4 accent-[#85C8FF]" />
          Visible
        </label>
        <label className="block sm:col-span-12">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Texto de cabecera</span>
          <input value={c.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="Marca la semana o semanas que te coges en Navidad." className={`${FIELD} block w-full`} />
        </label>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Semanas disponibles</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {c.semanas.map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5 rounded-full border border-serene/40 bg-serene/10 py-1 pl-3 pr-1.5 text-[12px] text-sand">
              Semana del {fechaCortaEs(l)} <span className="text-sand/50">({rangoSemana(l)})</span>
              <button type="button" onClick={() => set({ semanas: c.semanas.filter((x) => x !== l) })} aria-label={`Quitar la semana del ${fechaCortaEs(l)}`} className="rounded-full p-0.5 text-sand/50 hover:text-mandarin"><IconX size={12} /></button>
            </span>
          ))}
          <input type="date" value={nueva} onChange={(e) => setNueva(e.target.value)} className={`${FIELD}`} aria-label="Día de la semana a añadir" />
          <button type="button" onClick={anadir} disabled={!nueva} className={`${BTN} border border-white/15 text-sand/85 hover:border-white/30`}><IconPlus size={12} /> Añadir semana</button>
        </div>
        <p className="mt-1 text-[11px] text-sand/45">Cualquier día vale: se añade la semana entera (de lunes a viernes).</p>
        {sinAnio.length > 0 && (
          <p className="mt-1 text-[11.5px] font-bold text-canary">Ojo: no existe Vacas_{sinAnio.join(" ni Vacas_")}. Créalo con el botón «Crear año» de arriba o nadie podrá pedir esas semanas.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-12">
        <label className="flex items-end gap-2 pb-2 text-[12.5px] text-sand/80 sm:col-span-3">
          <input type="checkbox" checked={c.descripcionObligatoria !== false} onChange={(e) => set({ descripcionObligatoria: e.target.checked })} className="h-4 w-4 accent-[#85C8FF]" />
          Descripción obligatoria
        </label>
        <label className="block sm:col-span-9">
          <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">Texto de ayuda de la descripción</span>
          <input value={c.sugerencia} onChange={(e) => set({ sugerencia: e.target.value })} className={`${FIELD} block w-full`} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={guardar} disabled={estado === "…" || !String(c.nombre || "").trim() || !c.semanas.length}
          className={`${BTN} text-[#001391]`} style={{ background: PALETTE.serene }}>
          {estado === "…" ? "Guardando…" : "Guardar formulario"}
        </button>
        <button type="button" onClick={onCancelar} className={`${BTN} border border-white/15 text-sand/70`}>Cancelar</button>
        {estado.startsWith("error:") && <span className="text-xs font-bold text-mandarin">{estado.slice(6)}</span>}
      </div>
    </section>
  );
}

/** Quién ha pedido qué semana en un formulario (personas activas). */
function Respuestas({ c, d }) {
  const personas = (d.empleados || []).filter((e) => e.activo).map((e) => e.nombre);
  const sols = (d.solsCampana || []).filter((s) => s.campana === c.id);
  const filas = personas.map((p) => {
    const suyas = sols.filter((s) => s.persona === p);
    const desc = suyas.filter((s) => ["PENDIENTE", "APROBADA"].includes(s.estado)).map((s) => s.comentario).filter(Boolean);
    return { p, celdas: c.semanas.map((l) => solsDeSemana(sols, c.id, l, p)[0]?.estado || ""), desc: [...new Set(desc)].join(" · ") };
  });
  const sinRespuesta = filas.filter((f) => f.celdas.every((x) => !x)).length;
  const icono = { APROBADA: "✅", PENDIENTE: "⏳" };
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead>
          <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-wide text-sand/50">
            <th className="px-3 py-2">Persona</th>
            {c.semanas.map((l) => <th key={l} className="px-2 py-2 text-center">Sem. {fechaCortaEs(l).slice(0, 5)}</th>)}
            <th className="px-3 py-2">Descripción</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.p} className="border-b border-white/[0.06]">
              <td className="px-3 py-1.5 font-bold text-sand">{f.p}</td>
              {f.celdas.map((e, i) => <td key={i} className="px-2 py-1.5 text-center" title={e}>{icono[e] || <span className="text-sand/20">·</span>}</td>)}
              <td className="px-3 py-1.5 text-sand/70">{f.desc || (f.celdas.every((x) => !x) ? <span className="text-sand/35">Sin respuesta</span> : "—")}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-[11px] font-bold text-sand/60">
            <td className="px-3 py-2">Fuera esa semana</td>
            {c.semanas.map((l, i) => <td key={l} className="px-2 py-2 text-center">{filas.filter((f) => f.celdas[i]).length}</td>)}
            <td className="px-3 py-2">{sinRespuesta} sin respuesta</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 px-3 text-[11px] text-sand/45">✅ aprobada · ⏳ pendiente (se aprueban en la pestaña Calendario, como el resto).</p>
    </div>
  );
}

export default function CampanasAdmin({ d, post, onCambio, onAviso }) {
  const [editando, setEditando] = useState(null); // null | {} (nueva) | campaña
  const [abierta, setAbierta] = useState(null);
  const [estado, setEstado] = useState("");
  const lista = useMemo(() => d.campanas || [], [d.campanas]);
  const hecho = (msg) => { setEditando(null); onAviso(msg); onCambio(); };
  const accion = async (fn, msg) => {
    setEstado("…");
    try { await fn(); setEstado(""); hecho(msg); } catch (e) { setEstado("error:" + String(e.message || e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-[12.5px] text-sand/60">
          Formularios especiales (Navidad, verano…) que el equipo ve <b className="text-sand/85">encima</b> del de pedir días mientras estén visibles. Cada semana marcada crea una solicitud normal que se aprueba en Calendario.
        </p>
        {!editando && (
          <button type="button" onClick={() => setEditando({})} className={`${BTN} border border-white/15 bg-white/[0.055] text-sand/85 hover:border-white/30`}><IconPlus size={13} /> Nuevo formulario</button>
        )}
      </div>
      {estado.startsWith("error:") && <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">{estado.slice(6)}</p>}

      {editando && <Editor key={editando.id || "nuevo"} inicial={editando.id ? editando : null} d={d} post={post} onHecho={hecho} onCancelar={() => setEditando(null)} />}

      {!lista.length && !editando && <EmptyCard>No hay formularios especiales. Crea el de Navidad o el de verano con «Nuevo formulario».</EmptyCard>}
      {lista.map((c) => {
        const n = new Set((d.solsCampana || []).filter((s) => s.campana === c.id && ["PENDIENTE", "APROBADA"].includes(s.estado)).map((s) => s.persona)).size;
        return (
          <section key={c.id} className={`${GLASS} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl" aria-hidden>{c.emoji || "🗓️"}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sand">
                  {c.nombre}
                  <span className={`ml-2 rounded-full border px-2 py-0.5 align-middle text-[10px] font-bold uppercase ${c.activa ? `border-lime/50 ${TEXT.lime}` : "border-white/15 text-sand/45"}`}>{c.activa ? "Visible" : "Oculto"}</span>
                </p>
                <p className="text-[12px] text-sand/55">
                  {c.semanas.length} {c.semanas.length === 1 ? "semana" : "semanas"} ({c.semanas.map((l) => fechaCortaEs(l).slice(0, 5)).join(", ")}) · descripción {c.descripcionObligatoria !== false ? "obligatoria" : "opcional"} · {n} {n === 1 ? "persona ha pedido" : "personas han pedido"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={estado === "…"} onClick={() => accion(() => post("guardarCampana", { campana: { ...c, activa: !c.activa } }), `«${c.nombre}» ${c.activa ? "oculto: el equipo ya no lo ve" : "visible para el equipo"}.`)}
                  className={`${BTN} ${c.activa ? "border border-white/15 text-sand/85 hover:border-white/30" : "text-[#001391]"}`} style={c.activa ? undefined : { background: PALETTE.lime }}>
                  {c.activa ? "Ocultar" : "Mostrar"}
                </button>
                <button type="button" onClick={() => setEditando(c)} className={`${BTN} border border-white/15 text-sand/85 hover:border-white/30`}>Editar</button>
                <button type="button" onClick={() => setAbierta(abierta === c.id ? null : c.id)} className={`${BTN} border border-white/15 text-sand/85 hover:border-white/30`}>{abierta === c.id ? "Ocultar respuestas" : "Ver respuestas"}</button>
                <button type="button" disabled={estado === "…"} onClick={() => { if (confirm(`¿Borrar el formulario «${c.nombre}»? Las solicitudes que ya se hicieron con él no se tocan.`)) accion(() => post("borrarCampana", { id: c.id }), `Formulario «${c.nombre}» borrado.`); }}
                  className={`${BTN} border border-white/10 text-sand/50 hover:border-mandarin/60 hover:text-mandarin`}>Borrar</button>
              </div>
            </div>
            {abierta === c.id && <div className="mt-3 border-t border-white/10 pt-3"><Respuestas c={c} d={d} /></div>}
          </section>
        );
      })}
    </div>
  );
}
