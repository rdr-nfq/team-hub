"use client";

import { useMemo, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import { deIso, isoDe, laborables, festivosDeGrupo } from "./datos";
import { rangoSemana, solsDeSemana } from "./CampanaForm";

/* Gestión de vacaciones · Configuración · «Formularios especiales» (Navidad,
   verano…) que el equipo ve encima de «Pedir días» mientras estén visibles.
   Por formulario: nombre, semanas, si el backup es obligatorio, mostrar u
   ocultar y las RESPUESTAS: quién pide qué semana (aprobada o pendiente), el
   backup que deja y, primero, quién no ha respondido todavía. */

const SUGERENCIA_BACKUP = "Indica el backup que dejas en cada uno de tus proyectos (proyecto → persona que te cubre).";
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (iso) => { const d = deIso(iso); return `${d.getDate()} ${MES3[d.getMonth()]}`; };
const lunesDe = (iso) => { const d = deIso(iso); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDe(d); };
const masDias = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const lunesEntre = (desde, hasta) => { const out = []; for (let l = lunesDe(desde); l <= hasta; l = masDias(l, 7)) out.push(l); return out; };
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/** Plantillas: semanas de Navidad (de la del 21/12 a la de Reyes) y de verano (julio y agosto). */
function plantilla(tipo, anio) {
  if (tipo === "navidad")
    return { nombre: `Navidad ${anio}`, emoji: "🎄", texto: "Marca la semana o semanas que te coges en Navidad.", semanas: lunesEntre(`${anio}-12-21`, `${anio + 1}-01-07`) };
  return { nombre: `Verano ${anio}`, emoji: "☀️", texto: "Marca las semanas que te coges en verano.", semanas: lunesEntre(`${anio}-07-01`, `${anio}-08-31`) };
}

function Campo({ etiqueta, children, className = "" }) {
  return <label className={`v-campo ${className}`}><span>{etiqueta}</span>{children}</label>;
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
    set({ semanas: [...new Set([...c.semanas, lunesDe(nueva)])].sort() });
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
    <section className="vg-bloque" aria-label="Editar formulario">
      {!inicial?.id && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="v-soft">Empezar desde:</span>
          <button type="button" onClick={() => aplicar("navidad")} className="v-chip">Navidad</button>
          <button type="button" onClick={() => aplicar("verano")} className="v-chip">Verano</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-12">
        <Campo etiqueta="Emoji" className="sm:col-span-2"><input value={c.emoji} onChange={(e) => set({ emoji: e.target.value })} maxLength={4} className="v-inp text-center" /></Campo>
        <Campo etiqueta="Nombre" className="sm:col-span-6"><input value={c.nombre || ""} onChange={(e) => set({ nombre: e.target.value })} placeholder="Navidad 2026" className="v-inp" /></Campo>
        <Campo etiqueta="Tipo de días" className="sm:col-span-4">
          <span className="relative flex">
            <select value={c.tipo} onChange={(e) => set({ tipo: e.target.value })} className="v-inp">{(d.tipos || []).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}</select>
            <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
          </span>
        </Campo>
        <Campo etiqueta="Texto para el equipo" className="sm:col-span-12"><input value={c.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="Marca la semana o semanas que te coges en Navidad." className="v-inp" /></Campo>
      </div>
      <div className="flex flex-col gap-2">
        <p className="vg-lbl">Semanas que se pueden pedir</p>
        <div className="flex flex-wrap items-center gap-2">
          {c.semanas.map((l) => (
            <span key={l} className="vg-pill inline-flex items-center gap-1">
              {rangoSemana(l)}
              <button type="button" onClick={() => set({ semanas: c.semanas.filter((x) => x !== l) })} aria-label={`Quitar la semana del ${corta(l)}`} className="v-btn v-btn-t !p-0.5"><IconoBBVA nombre="close" size={14} /></button>
            </span>
          ))}
          <input type="date" value={nueva} onChange={(e) => setNueva(e.target.value)} className="v-inp !w-auto" aria-label="Un día de la semana que quieres añadir" />
          <button type="button" onClick={anadir} disabled={!nueva} className="v-btn v-btn-l"><IconoBBVA nombre="add" size={16} />Añadir semana</button>
        </div>
        <p className="v-nota">Vale cualquier día: se añade la semana entera, de lunes a viernes.</p>
        {sinAnio.length > 0 && <p className="v-aviso">Todavía no existe {sinAnio.join(" ni ")}: créalo en «Años» o nadie podrá pedir esas semanas.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-12">
        <label className="flex items-center gap-2 text-[13px] sm:col-span-4">
          <input type="checkbox" checked={c.descripcionObligatoria !== false} onChange={(e) => set({ descripcionObligatoria: e.target.checked })} className="h-4 w-4" />
          Backup obligatorio
        </label>
        <Campo etiqueta="Texto de ayuda del backup" className="sm:col-span-8"><input value={c.sugerencia} onChange={(e) => set({ sugerencia: e.target.value })} className="v-inp" /></Campo>
        <label className="flex items-center gap-2 text-[13px] sm:col-span-12">
          <input type="checkbox" checked={!!c.activa} onChange={(e) => set({ activa: e.target.checked })} className="h-4 w-4" />
          Visible para el equipo al guardar
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={guardar} disabled={estado === "…" || !String(c.nombre || "").trim() || !c.semanas.length} className="v-btn">
          {estado === "…" ? "Guardando…" : "Guardar formulario"}
        </button>
        <button type="button" onClick={onCancelar} className="v-btn v-btn-t">Cancelar</button>
      </div>
      {estado.startsWith("error:") && <p className="v-aviso" role="alert">{estado.slice(6)}</p>}
    </section>
  );
}

/** Quién ha pedido qué semana (personas activas) y quién falta por responder. */
function Respuestas({ c, d, onAviso }) {
  const [ver, setVer] = useState("todos");
  const corto = (n) => d.cortos?.[n] || n;
  const personas = (d.empleados || []).filter((e) => e.activo).map((e) => e.nombre);
  const sols = (d.solsCampana || []).filter((s) => s.campana === c.id);
  const filas = personas.map((p) => {
    const suyas = sols.filter((s) => s.persona === p && ["PENDIENTE", "APROBADA"].includes(s.estado));
    return { p, celdas: c.semanas.map((l) => solsDeSemana(sols, c.id, l, p)[0]?.estado || ""), desc: [...new Set(suyas.map((s) => s.comentario).filter(Boolean))].join(" · ") };
  });
  const sin = filas.filter((f) => f.celdas.every((x) => !x)).sort((a, b) => corto(a.p).localeCompare(corto(b.p), "es"));
  const con = filas.filter((f) => !f.celdas.every((x) => !x)).sort((a, b) => corto(a.p).localeCompare(corto(b.p), "es"));
  const lista = ver === "sin" ? sin : ver === "con" ? con : [...sin, ...con];
  // Fuera en total esa semana (cualquier motivo, de lunes a viernes; el día con más gente)
  const total = (l) => Math.max(0, ...[0, 1, 2, 3, 4].map((i) => (d.ausenciasPorDia?.[masDias(l, i)] || []).length));
  const copiar = async () => {
    const txt = sin.map((f) => corto(f.p)).join(", ");
    try { await navigator.clipboard.writeText(txt); onAviso(`Copiados ${plural(sin.length, "nombre", "nombres")}: pégalos en un correo o en Teams.`); }
    catch { onAviso(`Sin responder: ${txt}`); }
  };
  const Estado = ({ e }) => (e ? <span className={`v-estado v-estado-${e}`}>{e === "APROBADA" ? "Aprobada" : "Pendiente"}</span> : <span className="v-soft" aria-label="No la pide">—</span>);
  return (
    <div className="vg-bloque">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ver respuestas">
          {[["todos", "Todos", filas.length], ["sin", "Sin responder", sin.length], ["con", "Han respondido", con.length]].map(([v, t, n]) => (
            <button key={v} type="button" className="v-chip" aria-pressed={ver === v} onClick={() => setVer(v)}>{t}<span className="v-n">{n}</span></button>
          ))}
        </div>
        {sin.length ? <button type="button" className="v-btn v-btn-l" onClick={copiar}><IconoBBVA nombre="copy" size={16} />Copiar quién falta por responder</button>
          : <span className="v-nota"><b>Ha respondido todo el equipo.</b></span>}
      </div>
      <div className="overflow-x-auto">
        <table className="vg-tabla min-w-[620px]">
          <thead><tr><th><span>Persona</span></th>{c.semanas.map((l) => <th key={l} className="!text-center"><span>{rangoSemana(l)}</span></th>)}<th className="vg-izq"><span>Backup que deja</span></th></tr></thead>
          <tbody>
            {lista.map((f) => {
              const nada = f.celdas.every((x) => !x);
              return (
                <tr key={f.p}>
                  <td><b>{corto(f.p)}</b></td>
                  {f.celdas.map((e, i) => <td key={i} className="!text-center"><Estado e={e} /></td>)}
                  <td className="vg-izq">{nada ? <span className="v-neg">Sin responder</span> : (f.desc.replace(/^Backup:\s*/i, "") || "—")}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="v-soft text-[12px]">Pedidas con el formulario</td>
              {c.semanas.map((l, i) => {
                const n = filas.filter((f) => f.celdas[i]).length; const p = filas.filter((f) => f.celdas[i] === "PENDIENTE").length;
                return <td key={l} className="!text-center font-bold">{n}{p ? <span className="v-soft font-normal"> ({p} pend.)</span> : ""}</td>;
              })}
              <td className="vg-izq v-soft text-[12px]">{plural(sin.length, "persona sin responder", "personas sin responder")}</td>
            </tr>
            <tr>
              <td className="v-soft text-[12px]">Fuera en total (día con más gente)</td>
              {c.semanas.map((l) => <td key={l} className="!text-center font-bold">{total(l)}</td>)}
              <td className="vg-izq v-soft text-[12px]">Cuenta todo lo aprobado, también lo pedido fuera del formulario.</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function CampanasAdmin({ d, post, onCambio, onAviso, onRevisar }) {
  const [editando, setEditando] = useState(null); // null | {} (nueva) | campaña
  const [abierta, setAbierta] = useState(() => (d.campanas || []).find((c) => c.activa)?.id || null);
  const [estado, setEstado] = useState("");
  const lista = useMemo(() => d.campanas || [], [d.campanas]);
  const hecho = (msg) => { setEditando(null); onAviso(msg); onCambio(); };
  const accion = async (fn, msg) => {
    setEstado("…");
    try { await fn(); setEstado(""); hecho(msg); } catch (e) { setEstado("error:" + String(e.message || e)); }
  };
  const pendientesDe = (c) => (d.pendientes || []).filter((s) => s.campana === c.id).length;
  const fxg = festivosDeGrupo(d.festivosTodos || d.festivosDetalle, "Madrid");

  return (
    <section className="vg-secc vg-ancho" aria-labelledby="vg-formularios">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="vg-formularios" className="text-[17px] font-bold">Formularios especiales</h2>
        {!editando && <button type="button" onClick={() => setEditando({})} className="v-btn v-btn-l"><IconoBBVA nombre="add" size={16} />Nuevo formulario</button>}
      </div>
      <p className="v-nota">Salen encima de «Pedir días» en la página de cada persona mientras estén visibles. Cada semana marcada crea una solicitud normal, que se aprueba en Solicitudes.</p>
      {estado.startsWith("error:") && <p className="v-aviso" role="alert">{estado.slice(6)}</p>}
      {editando && <Editor key={editando.id || "nuevo"} inicial={editando.id ? editando : null} d={d} post={post} onHecho={hecho} onCancelar={() => setEditando(null)} />}
      {!lista.length && !editando && <p className="v-nota">No hay formularios especiales. Crea el de Navidad o el de verano con «Nuevo formulario».</p>}
      {lista.map((c) => {
        const n = new Set((d.solsCampana || []).filter((s) => s.campana === c.id && ["PENDIENTE", "APROBADA"].includes(s.estado)).map((s) => s.persona)).size;
        const np = pendientesDe(c);
        const sinAnio = [...new Set(c.semanas.flatMap((l) => [l.slice(0, 4), masDias(l, 4).slice(0, 4)]))].filter((a) => !(d.anios || []).includes(Number(a)));
        return (
          <div key={c.id} className="vg-bloque">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-[15px]">{c.emoji ? `${c.emoji} ` : ""}{c.nombre}</b>
              <span className={`v-estado ${c.activa ? "v-estado-APROBADA" : "v-estado-CANCELADA"}`}>{c.activa ? "Visible: lo ve el equipo" : "Oculto"}</span>
            </div>
            <p className="v-nota">
              {c.semanas.map((l) => rangoSemana(l)).join(" · ")} · {c.semanas.map((l) => laborables(l, masDias(l, 4), fxg).length).reduce((a, b) => a + b, 0)} laborables en total · backup {c.descripcionObligatoria !== false ? "obligatorio" : "opcional"} · {plural(n, "persona ha respondido", "personas han respondido")}
            </p>
            {sinAnio.length > 0 && <p className="v-aviso">Las semanas de {sinAnio.join(" y ")} no se pueden pedir hasta que <b>crees {sinAnio.join(" y ")}</b> en «Años».</p>}
            <div className="flex flex-wrap items-center gap-2">
              {np > 0 && <button type="button" className="v-btn" onClick={() => onRevisar(c.id)}>Revisar {plural(np, "pendiente", "pendientes")}</button>}
              <button type="button" disabled={estado === "…"} className="v-btn v-btn-l"
                onClick={() => accion(() => post("guardarCampana", { campana: { ...c, activa: !c.activa } }), `«${c.nombre}» ${c.activa ? "oculto: el equipo ya no lo ve" : "visible para el equipo"}.`)}>
                {c.activa ? "Ocultar al equipo" : "Mostrar al equipo"}
              </button>
              <button type="button" onClick={() => setEditando(c)} className="v-btn v-btn-t">Editar</button>
              <button type="button" onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="v-btn v-btn-t" aria-expanded={abierta === c.id}>{abierta === c.id ? "Ocultar respuestas" : "Ver respuestas"}</button>
              <button type="button" disabled={estado === "…"} className="v-btn v-btn-t ml-auto"
                onClick={() => { if (confirm(`¿Borrar el formulario «${c.nombre}»? Las solicitudes que ya se hicieron con él no se tocan.`)) accion(() => post("borrarCampana", { id: c.id }), `Formulario «${c.nombre}» borrado.`); }}>
                <IconoBBVA nombre="delete" size={16} />Borrar
              </button>
            </div>
            {abierta === c.id && <Respuestas c={c} d={d} onAviso={onAviso} />}
          </div>
        );
      })}
    </section>
  );
}
