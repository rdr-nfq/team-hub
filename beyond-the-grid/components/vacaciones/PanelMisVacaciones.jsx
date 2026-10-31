"use client";

import { useEffect, useMemo, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import { laborables, CLASE_SOL, ESTADO_SOL } from "./datos";
import { useMisBloques, CambioForm } from "./SolicitudPanel";
import { solsDeSemana, rangoSemana } from "./CampanaForm";
import { colorMotivo, textoMotivo, fCorta, masDias, qDe } from "./vistaUsuario";

/* «Mis vacaciones» de la vista de usuario: pestañas (formularios especiales
   abiertos, Pedir días, Aprobados, Solicitudes). El formulario de Pedir días
   y las semanas marcadas viven en la ruta, porque también se eligen y se
   pintan en el calendario. */

const Spinner = () => <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" />;

function Estado({ estado }) {
  return <span className={`v-estado v-estado-${estado}`}>{ESTADO_SOL[estado]?.label || estado}</span>;
}

/* Fecha con borrador propio: se aplica cuando está completa (año de 4 cifras)
   o al salir del campo, para que escribirla a mano no salte a cada tecla. */
function CampoFecha({ valor, min, onFijar }) {
  const [v, setV] = useState(valor);
  useEffect(() => setV(valor), [valor]);
  return (
    <input className="v-inp" type="date" min={min} value={v}
      onChange={(e) => { setV(e.target.value); if (!e.target.value || e.target.value >= "2000") onFijar(e.target.value); }}
      onBlur={() => v !== valor && onFijar(v)} />
  );
}

/* ── Pedir días ── */
function PedirDias({ datos, ctx }) {
  const { form, setForm, fijarFechas, elegir, setElegir, fxg, pend, hoy, post, onEnviada, verRango, qs } = ctx;
  const yo = datos.yo;
  const anio = datos.year;
  const [fase, setFase] = useState({ f: "form" });

  const hasta = form.hasta || form.desde;
  const dias = form.desde ? laborables(form.desde, hasta, fxg) : [];
  const pasado = !!form.desde && form.desde < hoy;
  const alReves = !!(form.desde && form.hasta && form.hasta < form.desde);
  const choca = dias.filter((s) => pend.has(s));
  const mios = dias.filter((s) => (datos.ausenciasPorDia[s] || []).some((a) => a.nombre === yo.nombre));
  // El backend trabaja año a año: un rango que cruza al año siguiente se
  // envía como dos solicitudes (solo si ese año ya está abierto).
  const a1 = Number(form.desde.slice(0, 4)), a2 = Number(hasta.slice(0, 4));
  const cruza = !!(form.desde && hasta && a2 !== a1);
  const cruzaMal = cruza && (a2 !== a1 + 1 || !(datos.anios || []).includes(a2));
  const tramos = !form.desde ? [] : cruza
    ? [[form.desde, `${a1}-12-31`], [`${a2}-01-01`, hasta]].filter(([x, y]) => laborables(x, y, fxg).length)
    : [[form.desde, hasta]];
  const ok = dias.length > 0 && !pasado && !alReves && !choca.length && !mios.length && !cruzaMal;

  const fuera = dias.map((s) => [s, (datos.ausenciasPorDia[s] || []).filter((a) => a.nombre !== yo.nombre).length]);
  const min = fuera.length ? Math.min(...fuera.map((x) => x[1])) : 0;
  const max = fuera.length ? Math.max(...fuera.map((x) => x[1])) : 0;
  const pico = fuera.find((x) => x[1] === max);
  const ocultos = [...new Set(dias.map((s) => qDe(s, anio)))].filter((q) => !qs.has(q));

  const enviar = async () => {
    if (!ok || fase.f === "enviando") return;
    setFase({ f: "enviando" });
    let total = 0, aviso = "", hechas = 0;
    try {
      for (const [x, y] of tramos) {
        const r = await post("solicitar", { clase: "NUEVA", tipo: form.tipo, desde: x, hasta: y, comentario: form.comentario.trim() });
        total += r.solicitud.dias; hechas++;
        if (r.aviso) aviso = r.aviso;
      }
      setFase({ f: "form" });
      onEnviada(aviso
        ? `Solicitud guardada (${total} días), pero el aviso por correo falló: ${aviso}. Avisa tú a coordinación.`
        : `Solicitud enviada: ${total} ${total === 1 ? "día" : "días"}. Coordinación la revisa y te llega un correo.`);
    } catch (e) {
      const parcial = hechas ? `Se guardó la parte de ${tramos[0][0].slice(0, 4)} (${total} días), pero no la de ${tramos[1][0].slice(0, 4)}: ` : "";
      setFase({ f: "error", error: parcial + String(e.message || e) });
    }
  };

  return (
    <>
      <div className="v-form">
        <label className="v-campo v-ancho">
          <span>Tipo</span>
          <span className="relative flex">
            <select className="v-inp" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {(datos.tipos || []).map((t) => <option key={t.id} value={t.id}>{t.texto}</option>)}
            </select>
            <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
          </span>
        </label>
        <label className="v-campo">
          <span>Desde</span>
          <CampoFecha valor={form.desde} min={hoy} onFijar={(v) => fijarFechas({ desde: v })} />
        </label>
        <label className="v-campo">
          <span>Hasta (incluido)</span>
          <CampoFecha valor={form.hasta} min={form.desde || hoy} onFijar={(v) => fijarFechas({ hasta: v })} />
        </label>
        <div className="v-ancho flex flex-wrap items-center gap-2.5">
          <button type="button" className="v-chip" aria-pressed={!!elegir} onClick={() => setElegir(elegir ? false : "desde")}>
            {elegir ? "Eligiendo en el calendario" : "Elegir en el calendario"}
          </button>
          <span className="v-nota" role="status">
            {elegir === "desde" ? <>Pulsa el <b>primer día</b>.</> : elegir === "hasta" ? <>Ahora pulsa el <b>último día</b>.</> : "o escribe las fechas."}
          </span>
        </div>
        <label className="v-campo v-ancho">
          <span>Comentario (opcional)</span>
          <input className="v-inp" value={form.comentario} placeholder="Para coordinación…" onChange={(e) => setForm({ ...form, comentario: e.target.value })} />
        </label>
      </div>

      {pasado && <p className="v-aviso">No se pueden pedir días pasados: elige a partir de hoy.</p>}
      {alReves && <p className="v-aviso">La fecha final es anterior a la inicial.</p>}
      {cruzaMal && !pasado && <p className="v-aviso">{a2 !== a1 + 1 ? "Como mucho puede llegar al año siguiente." : `Todavía no está abierto ${a2}: pide hasta el 31 de diciembre y avisa a coordinación.`}</p>}
      {form.desde && !pasado && !alReves && !cruzaMal && (dias.length ? (
        <>
          <p className="v-nota">
            <b>{dias.length} {dias.length === 1 ? "día laborable" : "días laborables"}</b> (sin fines de semana ni festivos{yo.grupo ? ` de ${yo.grupo}` : ""}).
            {cruza && tramos.length > 1 && " Cruza de año: se envía como dos solicitudes."}
            {ocultos.length
              ? <> Están en <b>Q{ocultos.join(", Q")}</b>: <button type="button" className="v-btn v-btn-t !inline !p-0 underline" onClick={verRango}>verlos en el calendario</button></>
              : " Marcados en el calendario con borde."}
          </p>
          <p className="v-cobertura">
            {max === 0 ? <>Esos días <b>no falta nadie más</b> del equipo.</>
              : <>Esos días ya faltan <b>{min === max ? max : `${min}–${max}`} {max === 1 ? "persona" : "personas"}</b> del equipo{min !== max ? ` (máx. ${max} el ${fCorta(pico[0], anio)})` : ""}.</>}
          </p>
        </>
      ) : <p className="v-aviso">Ese rango no tiene días laborables.</p>)}
      {!pasado && choca.length > 0 && (
        <p className="v-aviso"><b>Ya tienes pendiente</b> una petición que incluye {choca.length === 1 ? `el ${fCorta(choca[0], anio)}` : `del ${fCorta(choca[0], anio)} al ${fCorta(choca[choca.length - 1], anio)}`}: retírala en «Solicitudes» o cambia las fechas.</p>
      )}
      {!pasado && mios.length > 0 && (
        <p className="v-aviso"><b>Ya tienes</b> el {fCorta(mios[0], anio)}{mios.length > 1 ? ` y ${mios.length - 1} ${mios.length === 2 ? "día" : "días"} más` : ""} en ese rango.</p>
      )}
      <div>
        <button type="button" className="v-btn" disabled={!ok || fase.f === "enviando"} onClick={enviar}>
          {fase.f === "enviando" ? <><Spinner /> Enviando…</> : ok ? `Enviar · ${dias.length} ${dias.length === 1 ? "día" : "días"}` : "Enviar solicitud"}
        </button>
      </div>
      {fase.f === "error" && <p className="v-aviso" role="alert">No se pudo enviar: {fase.error}</p>}
    </>
  );
}

/* ── Formulario especial (Navidad…): semanas, con lo ya pedido retirable ── */
function Campana({ campana, datos, ctx }) {
  const { semSel, setSemSel, fxg, post, onEnviada, retirar, ocultas } = ctx;
  const [desc, setDesc] = useState("");
  const [fase, setFase] = useState({ f: "form" });
  const obligatoria = campana.descripcionObligatoria !== false;
  const sols = (datos.misSolicitudes || []).filter((s) => !ocultas.has(s.id));
  const falta = !semSel.size ? "Marca al menos una semana." : obligatoria && desc.trim().length < 3 ? "Rellena el backup." : "";

  const enviar = async () => {
    if (falta || fase.f === "enviando") return;
    setFase({ f: "enviando" });
    try {
      const r = await post("solicitarCampana", { campana: campana.id, semanas: [...semSel].sort(), comentario: desc.trim() });
      setFase({ f: "form" }); setDesc("");
      onEnviada(r.aviso
        ? `Guardado (${r.dias} días), pero el aviso por correo falló: ${r.aviso}. Avisa tú a coordinación.`
        : `Enviado: ${r.dias} días laborables${r.solicitudes.length > 1 ? ` en ${r.solicitudes.length} solicitudes` : ""}.`, "campana");
    } catch (e) {
      setFase({ f: "error", error: String(e.message || e) });
    }
  };

  return (
    <>
      <p className="text-[13px]">{campana.texto || "Marca la semana o semanas que te coges. Coordinación las revisa todas juntas."}</p>
      <div className="flex flex-col gap-2" role="group" aria-label="Semanas">
        {campana.semanas.map((lunes) => {
          const lab = laborables(lunes, masDias(lunes, 4), fxg).length;
          const fest = 5 - lab;
          const txt = (
            <span>
              <b>{rangoSemana(lunes)}</b><br />
              <small>{lab} laborables{fest > 0 ? ` · ${fest} festivo${fest > 1 ? "s" : ""}` : ""}</small>
            </span>
          );
          const ya = solsDeSemana(sols, campana.id, lunes)[0];
          if (ya) {
            return (
              <div key={lunes} className="v-semana v-pedida">
                {txt}
                <span className="inline-flex items-center gap-1.5">
                  <Estado estado={ya.estado} />
                  {ya.estado === "PENDIENTE" && <button type="button" className="v-btn v-btn-t" onClick={() => retirar(ya)}>Retirar</button>}
                </span>
              </div>
            );
          }
          const on = semSel.has(lunes);
          return (
            <button key={lunes} type="button" className="v-semana" aria-pressed={on}
              onClick={() => setSemSel((prev) => { const n = new Set(prev); if (n.has(lunes)) n.delete(lunes); else n.add(lunes); return n; })}>
              {txt}
              {on && <IconoBBVA nombre="checkmark" size={18} />}
            </button>
          );
        })}
      </div>
      <label className="v-campo">
        <span>{campana.sugerencia ? "Backup que dejas" : "Descripción"} {obligatoria ? "(obligatorio)" : "(opcional)"}</span>
        <textarea className="v-inp resize-y" rows={3} value={desc} placeholder={campana.sugerencia || ""} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="v-btn" disabled={!!falta || fase.f === "enviando"} onClick={enviar}>
          {fase.f === "enviando" ? <><Spinner /> Enviando…</> : semSel.size ? `Enviar ${semSel.size} semana${semSel.size > 1 ? "s" : ""}` : "Enviar solicitud"}
        </button>
        {falta && semSel.size > 0 && <span className="v-nota">{falta}</span>}
      </div>
      {fase.f === "error" && <p className="v-aviso" role="alert">No se pudo enviar: {fase.error}</p>}
    </>
  );
}

/* ── Aprobados: bloques por delante, con cambiar/cancelar ── */
function Aprobados({ datos, ctx, bloques }) {
  const { post, onHecho, anio } = ctx;
  const [abierto, setAbierto] = useState(null);
  if (!bloques.length) return <p className="v-nota">No tienes días aprobados por delante.</p>;
  const pendienteDe = (b) => (datos.misSolicitudes || []).find((s) => s.estado === "PENDIENTE" && s.clase !== "NUEVA"
    && [[s.desde, s.hasta], [s.origDesde, s.origHasta]].some(([a, z]) => a && !(z < b.inicio || a > b.fin)));
  return (
    <>
      <p className="v-nota">Para cambiarlos o cancelarlos se pide a coordinación, igual que una solicitud.</p>
      <ul className="v-lista">
        {bloques.map((b) => {
          const key = `${b.motivo}-${b.inicio}`;
          const pend = pendienteDe(b);
          return (
            <li key={key}>
              <span className="v-fila">
                <b>{textoMotivo(b.motivo)} · {fCorta(b.inicio, anio)}{b.fin !== b.inicio ? ` – ${fCorta(b.fin, anio)}` : ""}</b>
                <span className="v-motivo" style={{ background: colorMotivo(b.motivo) }}>{b.dias} {b.dias === 1 ? "día" : "días"}</span>
              </span>
              {pend ? <span className="v-nota"><b>{CLASE_SOL[pend.clase].label} pendiente de aprobar</b></span>
                : abierto?.key === key ? <CambioForm b={b} modo={abierto.modo} datos={datos} post={post} onHecho={onHecho} onCerrar={() => setAbierto(null)} />
                : (
                  <span className="flex gap-1">
                    <button type="button" className="v-btn v-btn-t" onClick={() => setAbierto({ key, modo: "cambiar" })}>Cambiar fechas</button>
                    <button type="button" className="v-btn v-btn-t" onClick={() => setAbierto({ key, modo: "cancelar" })}>Cancelar estos días</button>
                  </span>
                )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ── Solicitudes: todas, con retirar (y deshacer) y pedir otras fechas ── */
function Solicitudes({ datos, ctx }) {
  const { retirar, ocultas, pedirOtras, anio, fxg } = ctx;
  const sols = (datos.misSolicitudes || []).filter((s) => !(ocultas.has(s.id) && s.estado === "PENDIENTE"));
  if (!sols.length) return <p className="v-nota">Todavía no has enviado ninguna solicitud.</p>;
  const pend = sols.filter((s) => s.estado === "PENDIENTE").length;
  const campanas = Object.fromEntries((datos.campanas || []).map((c) => [c.id, c.nombre]));
  return (
    <>
      <p className="v-nota">{pend} pendiente{pend === 1 ? "" : "s"} de {sols.length} solicitud{sols.length === 1 ? "" : "es"}.</p>
      <ul className="v-lista">
        {sols.map((s) => {
          const clase = s.clase === "CANCELACION" ? "Cancelación · " : s.clase === "MODIFICACION" ? "Cambio · " : "";
          const dias = s.dias ?? laborables(s.desde, s.hasta, fxg).length;
          return (
            <li key={s.id}>
              <span className="v-fila">
                <b>{clase}{textoMotivo(s.tipo)} · {fCorta(s.desde, anio)}{s.hasta !== s.desde ? ` – ${fCorta(s.hasta, anio)}` : ""}</b>
                <Estado estado={s.estado} />
              </span>
              <span className="v-nota">{dias} {dias === 1 ? "día laborable" : "días laborables"}{s.campana && campanas[s.campana] ? ` · ${campanas[s.campana]}` : ""}</span>
              {s.clase === "MODIFICACION" && <span className="v-nota">Antes: {fCorta(s.origDesde, anio)}{s.origHasta !== s.origDesde ? ` – ${fCorta(s.origHasta, anio)}` : ""}</span>}
              {s.motivo && <span className="v-nota">Coordinación: {s.motivo}</span>}
              {s.estado === "PENDIENTE" && <span><button type="button" className="v-btn v-btn-t" onClick={() => retirar(s)}>Retirar solicitud</button></span>}
              {s.estado === "RECHAZADA" && s.clase === "NUEVA" && <span><button type="button" className="v-btn v-btn-t" onClick={() => pedirOtras(s)}>Pedir otras fechas</button></span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function PanelMisVacaciones({ datos, tab, setTab, ctx }) {
  const bloques = useMisBloques(datos);
  const campanas = (datos.campanas || []).filter((c) => c.activa);
  const pendientes = (datos.misSolicitudes || []).filter((s) => s.estado === "PENDIENTE" && !ctx.ocultas.has(s.id)).length;
  const pestanas = useMemo(() => [
    ...campanas.map((c) => ({ id: `c-${c.id}`, label: `${c.emoji ? `${c.emoji} ` : ""}${c.nombre}`, campana: c })),
    { id: "pedir", label: "Pedir días" },
    { id: "aprobados", label: "Aprobados", n: bloques.length },
    { id: "solicitudes", label: "Solicitudes", n: pendientes, sr: "pendientes" },
  ], [campanas, bloques.length, pendientes]);
  const actual = pestanas.find((p) => p.id === tab) || pestanas.find((p) => p.id === "pedir");

  if (!datos.yo) {
    return (
      <section className="v-mis" aria-labelledby="v-mis-t">
        <h2 id="v-mis-t" className="text-[17px] font-bold">Mis vacaciones</h2>
        <p className="text-[13px]">No apareces en la pestaña Vacas_{datos.year} del Excel con este email, así que todavía no puedes pedir días desde aquí. Pide a coordinación que te añadan.</p>
      </section>
    );
  }

  const teclas = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = pestanas.findIndex((p) => p.id === actual.id);
    const sig = pestanas[(i + (e.key === "ArrowRight" ? 1 : -1) + pestanas.length) % pestanas.length];
    setTab(sig.id);
    requestAnimationFrame(() => document.getElementById(`v-tab-${sig.id}`)?.focus());
  };

  return (
    <section className="v-mis" aria-labelledby="v-mis-t">
      <h2 id="v-mis-t" className="text-[17px] font-bold">Mis vacaciones</h2>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Mis vacaciones" onKeyDown={teclas}>
        {pestanas.map((p) => (
          <button key={p.id} id={`v-tab-${p.id}`} type="button" role="tab" className="v-chip" aria-selected={p.id === actual.id}
            aria-controls="v-panel-mis" tabIndex={p.id === actual.id ? 0 : -1} onClick={() => setTab(p.id)}>
            {p.label}
            {p.n > 0 && <span className="v-n">{p.n}<span className="sr-only"> {p.sr || ""}</span></span>}
          </button>
        ))}
      </div>
      <div id="v-panel-mis" role="tabpanel" aria-labelledby={`v-tab-${actual.id}`} className="flex flex-col gap-3">
        {actual.campana ? <Campana key={actual.id} campana={actual.campana} datos={datos} ctx={ctx} />
          : actual.id === "pedir" ? <PedirDias datos={datos} ctx={ctx} />
          : actual.id === "aprobados" ? <Aprobados datos={datos} ctx={ctx} bloques={bloques} />
          : <Solicitudes datos={datos} ctx={ctx} />}
      </div>
    </section>
  );
}
