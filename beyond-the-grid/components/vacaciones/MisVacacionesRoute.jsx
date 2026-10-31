"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import { useLinks } from "@/lib/links";
import { VacacionesSkeleton, ErrorCard } from "./VacacionesRoute";
import { useVacaciones, festivosDeGrupo, laborables, conEneroSiguiente, isoDe } from "./datos";
import CalendarioTrimestres from "./CalendarioTrimestres";
import PanelMisVacaciones from "./PanelMisVacaciones";
import { COLOR_YO, colorMotivo, textoMotivo, fLarga, masDias, qDe, nombresCortos, vuelve } from "./vistaUsuario";

/* /vacaciones (vista de usuario, backend v2). A un lado «Mis vacaciones»
   (pedir días, formularios especiales como Navidad, aprobados y solicitudes);
   al otro, el calendario del equipo por trimestres con los nombres en cada
   día. Los días se pueden elegir en el calendario o escribir en el
   formulario; lo que pides se marca con borde y lo pendiente, discontinuo.
   «Mis vacaciones» va antes en el código (orden del teclado) y se coloca a
   la derecha con áreas de rejilla. */

const VACIO = { tipo: "VA", desde: "", hasta: "", comentario: "" };
const ESPERA_RETIRAR = 8000;

/* Detalle de un día: quién está fuera, por qué y cuándo vuelve. */
function HojaDia({ s, d, festPorGrupo, festVista, onCerrar }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    return () => prev?.focus?.();
  }, []);
  const lista = d.ausenciasPorDia[s] || [];
  const yo = d.yo?.nombre;
  const teclas = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onCerrar(); }
    if (e.key === "Tab") { // el foco se queda dentro del diálogo
      const f = [...ref.current.querySelectorAll("button")];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  };
  const titulo = fLarga(s, d.year);
  return (
    <div className="v-velo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={ref} className="v-hoja" role="dialog" aria-modal="true" aria-labelledby="v-hoja-t" onKeyDown={teclas}>
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <h2 id="v-hoja-t" className="text-lg font-bold">{titulo[0].toUpperCase() + titulo.slice(1)}</h2>
            <p className="v-nota">{lista.length ? `${lista.length} ${lista.length === 1 ? "persona fuera" : "personas fuera"}` : "Nadie fuera"}{festVista[s] ? ` · festivo: ${festVista[s]}` : ""}</p>
          </div>
          <button type="button" className="v-btn v-btn-t" aria-label="Cerrar" onClick={onCerrar}><IconoBBVA nombre="close" size={18} /></button>
        </div>
        {lista.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {lista.map((a) => {
              const grupo = d.empleadosMap?.[a.nombre]?.grupo;
              const v = vuelve(a.nombre, s, d.ausenciasPorDia, festPorGrupo[grupo]);
              return (
                <li key={a.nombre} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {a.nombre}{a.nombre === yo ? " (tú)" : ""}
                    {v && <><br /><small className="v-soft">Vuelve el {fLarga(v, d.year)}</small></>}
                  </span>
                  <span className="v-motivo" style={{ background: a.nombre === yo ? COLOR_YO : colorMotivo(a.motivo) }}>{textoMotivo(a.motivo)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function MisVacacionesRoute() {
  const { showToast } = useLinks();
  const [anio, setAnio] = useState(null);
  const { snap, reload, post, beacon } = useVacaciones(anio);
  const base = snap?.data;
  // Enero del año siguiente (4º mes del último trimestre): se carga aparte.
  const anioSig = base?.anios?.includes(base.year + 1) ? base.year + 1 : null;
  const { snap: snapSig, reload: reloadSig } = useVacaciones(anioSig, { activo: !!anioSig });
  const d = useMemo(() => conEneroSiguiente(base, snapSig?.data), [base, snapSig]);
  const [hoy] = useState(() => isoDe(new Date()));

  const [tab, setTabRaw] = useState("pedir");
  const [form, setForm] = useState(VACIO);
  const [elegir, setElegir] = useState(false); // false | "desde" | "hasta"
  const [semSel, setSemSel] = useState(() => new Set());
  const [qs, setQs] = useState(() => new Set([Math.floor(new Date().getMonth() / 3) + 1]));
  const [filtro, setFiltro] = useState("");
  const [dia, setDia] = useState(null);
  const [focoDia, setFocoDia] = useState(null);
  const [irA, setIrA] = useState(null);
  const [ocultas, setOcultas] = useState(() => new Set());
  const [deshacer, setDeshacer] = useState(null); // { msg, fn }
  const retiradas = useRef({}); // id -> timer
  const tDeshacer = useRef(null);

  const recargar = useCallback(() => { reload(true); if (anioSig) reloadSig(true); }, [reload, reloadSig, anioSig]);
  const setTab = (t) => { setTabRaw(t); setElegir(false); setSemSel(new Set()); };

  // Festivos por grupo ({grupo: {iso: nombre}}) y país de cada grupo.
  const { festPorGrupo, paisDe } = useMemo(() => {
    const fpg = {};
    (d?.festivosDetalle || []).forEach((f) => { (fpg[f.grupo] = fpg[f.grupo] || {})[f.fecha] = f.nombre || "Festivo"; });
    return { festPorGrupo: fpg, paisDe: Object.fromEntries((d?.grupos || []).map((g) => [g.grupo, g.pais])) };
  }, [d]);
  const fxg = useMemo(() => festivosDeGrupo(d?.festivosDetalle, d?.yo?.grupo), [d]);
  const grupoVista = filtro ? d?.empleadosMap?.[filtro]?.grupo : d?.yo?.grupo;
  const festVista = festPorGrupo[grupoVista] || {};
  const festOtros = useMemo(() => {
    const out = {};
    Object.entries(festPorGrupo).forEach(([g, m]) => {
      if (g === grupoVista) return;
      Object.entries(m).forEach(([iso, n]) => { if (!out[iso]) out[iso] = `${n} (${paisDe[g] || g})`; });
    });
    return out;
  }, [festPorGrupo, paisDe, grupoVista]);

  const personas = useMemo(() => (d?.empleados || []).filter((e) => e.activo).map((e) => e.nombre).sort((a, b) => a.localeCompare(b, "es")), [d]);
  const cortos = useMemo(() => nombresCortos((d?.empleados || []).map((e) => e.nombre)), [d]);

  // Mis días pendientes (borde discontinuo), sin las que estoy retirando.
  const pend = useMemo(() => {
    const set = new Set();
    (d?.misSolicitudes || []).filter((s) => s.estado === "PENDIENTE" && s.clase !== "CANCELACION" && !ocultas.has(s.id))
      .forEach((s) => laborables(s.desde, s.hasta, fxg).forEach((iso) => set.add(iso)));
    return set;
  }, [d, fxg, ocultas]);
  // Lo que estoy pidiendo: el rango del formulario o las semanas marcadas.
  const pide = useMemo(() => {
    if (tab === "pedir") return new Set(form.desde && form.desde >= hoy ? laborables(form.desde, form.hasta || form.desde, fxg) : []);
    const set = new Set();
    semSel.forEach((w) => laborables(w, masDias(w, 4), fxg).forEach((s) => set.add(s)));
    return set;
  }, [tab, form.desde, form.hasta, semSel, fxg, hoy]);

  // Abre los trimestres de un rango y baja hasta su primer día.
  const verRango = useCallback((f = form) => {
    if (!d || !f.desde) return;
    const dias = laborables(f.desde, f.hasta || f.desde, fxg);
    if (!dias.length) return;
    setQs((prev) => new Set([...prev, ...dias.map((s) => qDe(s, d.year))]));
    setIrA(dias[0]);
  }, [d, form, fxg]);
  useEffect(() => {
    if (!irA) return;
    const el = document.querySelector(`[data-dia="${irA}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    setIrA(null);
  }, [irA, qs]);

  const fijarFechas = (cambio) => {
    const f = { ...form, ...cambio };
    if (cambio.desde && (!f.hasta || f.hasta < f.desde)) f.hasta = f.desde;
    setForm(f);
    if (f.desde >= hoy) verRango(f);
  };

  const onDia = (s) => {
    setFocoDia(s);
    if (elegir && tab === "pedir" && s >= hoy) {
      if (elegir === "desde") { setForm({ ...form, desde: s, hasta: s }); setElegir("hasta"); }
      else {
        const [a, z] = s < form.desde ? [s, form.desde] : [form.desde, s];
        setForm({ ...form, desde: a, hasta: z }); setElegir(false);
      }
      return;
    }
    setDia(s);
  };
  const cambiarElegir = (v) => {
    setElegir(v);
    if (v && d && !qs.size) setQs(new Set([qDe(hoy, d.year)]));
  };
  useEffect(() => {
    if (!elegir) return;
    const f = (e) => { if (e.key === "Escape") setElegir(false); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [elegir]);

  // Retirar con «Deshacer»: se oculta al momento y se envía a los 8 s; si la
  // persona se va antes, sale con sendBeacon.
  const enviarRetirada = useCallback(async (id) => {
    delete retiradas.current[id];
    try { await post("cancelar", { id }); recargar(); }
    catch (e) {
      setOcultas((prev) => { const n = new Set(prev); n.delete(id); return n; });
      showToast(`No se pudo retirar: ${e.message || e}`);
    }
  }, [post, recargar, showToast]);
  const retirar = (s) => {
    setOcultas((prev) => new Set(prev).add(s.id));
    retiradas.current[s.id] = setTimeout(() => enviarRetirada(s.id), ESPERA_RETIRAR);
    clearTimeout(tDeshacer.current);
    setDeshacer({
      msg: `Solicitud del ${fLarga(s.desde, d.year).replace(/^\S+ /, "")} retirada`,
      fn: () => {
        clearTimeout(retiradas.current[s.id]); delete retiradas.current[s.id];
        setOcultas((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
        showToast("Solicitud recuperada");
      },
    });
    tDeshacer.current = setTimeout(() => setDeshacer(null), ESPERA_RETIRAR);
  };
  useEffect(() => {
    const salir = () => Object.keys(retiradas.current).forEach((id) => { clearTimeout(retiradas.current[id]); beacon("cancelar", { id }); });
    window.addEventListener("pagehide", salir);
    return () => { window.removeEventListener("pagehide", salir); salir(); };
  }, [beacon]);

  const onEnviada = (msg, de) => {
    showToast(msg);
    if (de === "campana") setSemSel(new Set());
    else { setForm(VACIO); setTabRaw("solicitudes"); }
    recargar();
  };
  const pedirOtras = (s) => { setTabRaw("pedir"); setForm({ ...VACIO, tipo: s.tipo }); };

  const ctx = {
    form, setForm, fijarFechas, elegir, setElegir: cambiarElegir, semSel, setSemSel, fxg, pend, hoy, qs,
    post, onHecho: recargar, onEnviada, verRango: () => verRango(), retirar, ocultas, pedirOtras, anio: d?.year,
  };

  return (
    <main className="vacu mx-auto flex w-full max-w-[1376px] flex-col gap-4 px-4 pb-10 pt-cabecera sm:px-8">
      <a className="v-salto" href="#calendario">Saltar al calendario</a>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-eq grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="aeroplane" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Vacaciones</h1>
        </div>
        {d?.anios?.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Año">
            <span className="mr-1 text-[13px] font-bold">Año</span>
            {d.anios.map((a) => (
              <button key={a} type="button" className="v-chip" aria-pressed={a === d.year} onClick={() => setAnio(a)}>{a}</button>
            ))}
          </div>
        )}
      </div>

      {snap?.actualizando && <p className="v-nota" role="status">Actualizando…</p>}
      {snap?.avisoRecarga && <p className="v-aviso">No se pudo refrescar: {snap.avisoRecarga}</p>}
      {snap?.error ? (
        <ErrorCard mensaje={snap.error} onRetry={() => reload()} />
      ) : !d ? (
        <VacacionesSkeleton />
      ) : (
        <div className="v-rejilla">
          <div className="v-lado">
            <PanelMisVacaciones key={d.year} datos={d} tab={tab} setTab={setTab} ctx={ctx} />
          </div>
          <CalendarioTrimestres
            anio={d.year} hoy={hoy} qs={qs}
            onToggleQ={(q) => setQs((prev) => { const n = new Set(prev); if (n.has(q)) n.delete(q); else n.add(q); return n; })}
            aus={d.ausenciasPorDia || {}} personas={personas} filtro={filtro} setFiltro={setFiltro}
            yo={d.yo?.nombre} cortos={cortos} festVista={festVista} festOtros={festOtros} grupoVista={grupoVista}
            pend={pend} pide={pide} elegir={tab === "pedir" ? elegir : false} onDia={onDia} focoDia={focoDia}
            sinEnero={!d.anioSiguiente}
          />
        </div>
      )}
      {dia && d && (
        <HojaDia s={dia} d={d} festPorGrupo={Object.fromEntries(Object.entries(festPorGrupo).map(([g, m]) => [g, Object.fromEntries(Object.keys(m).map((k) => [k, true]))]))}
          festVista={festVista} onCerrar={() => setDia(null)} />
      )}
      {deshacer && (
        <div role="status" className="fixed bottom-8 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-3 rounded-full bg-sand px-5 py-2.5 text-sm font-bold text-midnight shadow-xl">
          {deshacer.msg}
          <button type="button" onClick={() => { const f = deshacer.fn; setDeshacer(null); clearTimeout(tDeshacer.current); f(); }}
            className="rounded-full border-[1.5px] border-midnight px-3 py-0.5 hover:bg-midnight/10">
            Deshacer
          </button>
        </div>
      )}
    </main>
  );
}
