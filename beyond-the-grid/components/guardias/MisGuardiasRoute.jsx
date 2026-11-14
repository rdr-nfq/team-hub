"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../chrome/AuthGate";
import { useEquipo } from "../timereport/datos";
import { mismoEmail } from "@/lib/email";
import IconoBBVA from "../iconosBBVA";
import { useGuardias, errorAviso } from "./datos";
import { hoyISO, fDur, fDia, masUnDia, haceDias, eur, minutos } from "./model";
import { CampoHora, PanelReloj, normaHora, pad } from "./RelojHora";

/* Guardias · vista de MIEMBRO (todo el equipo).
   Izquierda: pedir una guardia eligiendo el pase (desplegable con los Pases
   Calendados de los últimos 90 días, u «Otro día…»), la hora de entrada y de
   salida (se escriben o se eligen en el reloj) y qué pasó.
   Derecha: «Mis guardias» en dos pestañas. En curso: las pendientes (se
   pueden corregir o retirar mientras coordinación no las resuelva) y las
   aprobadas aún sin dar de alta en MyNFQ. Histórico: las cerradas, por años.
   Al enviar, el backend avisa por correo a coordinación; al resolverla, te
   llega la respuesta también por correo. */

const ESPERA = 5000; // margen para «Deshacer» al retirar
const DIAS_PASES = 90;
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
const masDias = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const aMin = (h) => { const m = /^(\d{2}):(\d{2})$/.exec(h || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const enCurso = (g) => g.estado === "pendiente" || (g.estado === "aprobada" && !g.aprobadaMyNfq);
const qDe = (iso) => `Q${Math.floor((Number(String(iso).slice(5, 7)) - 1) / 3) + 1}`;
const ERR_HORA = "Escribe la hora así: 22:30 o 2230.";
const FORM_VACIO = { pase: null, otro: "", he: "", hs: "", desc: "" };

function analisis(he, hs) {
  const e = aMin(he), s = aMin(hs);
  if (e == null || s == null) return null;
  if (e === s) return { error: "La entrada y la salida son la misma hora." };
  let m = s - e; const cruza = m < 0; if (cruza) m += 1440;
  return { m, cruza, largo: m > 600 };
}

function Estado({ g }) {
  if (g.estado === "pendiente") return <span className="gu-est gu-est-pend">Pendiente</span>;
  if (g.estado === "rechazada") return <span className="gu-est gu-est-rech">Rechazada</span>;
  const imp = g.importe != null ? ` · ${eur.format(g.importe)}` : "";
  return g.aprobadaMyNfq ? <span className="gu-est gu-est-alta">En MyNFQ{imp}</span> : <span className="gu-est gu-est-falta">Aprobada{imp}</span>;
}

function Ciclo({ g }) {
  const n = g.estado === "pendiente" ? 1 : g.aprobadaMyNfq ? 3 : 2;
  const pasos = ["Pedida", `Aprobada${g.estado === "aprobada" && g.importe != null ? ` · ${eur.format(g.importe)}` : ""}`, "En MyNFQ"];
  return (
    <ol className="gu-ciclo" aria-label="Ciclo de la guardia">
      {pasos.map((t, i) => (
        <li key={t} className={i < n ? "gu-hecho" : ""}>
          {i > 0 && <span className={`gu-raya${i < n ? " gu-hecho" : ""}`} aria-hidden="true" />}
          <span className="gu-pt">{i < n && <IconoBBVA nombre="checkmark" size={12} />}</span>
          {t}<span className="sr">{i < n ? " (hecho)" : " (pendiente)"}</span>
        </li>
      ))}
    </ol>
  );
}

export default function MisGuardiasRoute() {
  const { email } = useAuth();
  const equipo = useEquipo();
  const yo = useMemo(() => (equipo || []).find((m) => mismoEmail(m.email, email)) || null, [equipo, email]);
  const { snap, reload, post, beacon } = useGuardias("misGuardias", { email: email || "" });
  const hoy = hoyISO();
  const anioHoy = hoy.slice(0, 4);
  const dia = (iso) => fDia(iso, anioHoy);

  // Cambios locales mientras el backend responde (se limpian al recargar).
  const [extra, setExtra] = useState([]);
  const [cambios, setCambios] = useState({});
  const [ocultas, setOcultas] = useState(() => new Set());
  useEffect(() => { setExtra([]); setCambios({}); }, [snap]);

  const guardias = useMemo(() => {
    const base = (snap?.data?.guardias || []).map((g) => cambios[g.id] || g);
    const ids = new Set(base.map((g) => g.id));
    return [...extra.filter((g) => !ids.has(g.id)), ...base]
      .filter((g) => !ocultas.has(g.id))
      .sort((a, b) => (b.fecha < a.fecha ? -1 : b.fecha > a.fecha ? 1 : String(b.creadoEn).localeCompare(String(a.creadoEn))));
  }, [snap, cambios, extra, ocultas]);

  const pases = useMemo(() => (snap?.data?.pases || []).filter((p) => diasEntre(p, hoy) >= 0 && diasEntre(p, hoy) <= DIAS_PASES), [snap, hoy]);

  const [form, setForm] = useState(FORM_VACIO);
  const [raw, setRaw] = useState({});
  const [errores, setErrores] = useState({});
  const [editando, setEditando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [picker, setPicker] = useState(null); // 'he' | 'hs' | null
  const [modo, setModo] = useState("h");
  const [nueva, setNueva] = useState(null);
  const [vista, setVista] = useState("curso");
  const [anio, setAnio] = useState(null);
  const [envios, setEnvios] = useState([]);
  const [anuncio, setAnuncio] = useState("");

  // Foco tras pintar (como en el prototipo): se pide un selector y se enfoca en el siguiente render.
  const foco = useRef(null);
  const [, repintar] = useState(0);
  const enfocar = (sel) => { foco.current = sel; repintar((t) => t + 1); }; // repinta aunque no cambie nada más
  useEffect(() => {
    if (!foco.current) return;
    const el = document.querySelector(foco.current); foco.current = null;
    if (!el) return;
    el.focus({ preventScroll: true });
    const r = el.getBoundingClientRect(), cab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cabecera")) || 100;
    if (r.top < cab || r.bottom > window.innerHeight) el.scrollIntoView({ block: el.classList.contains("mg-g") ? "center" : "nearest" });
  });
  const anunciar = (t) => { setAnuncio(""); setTimeout(() => setAnuncio(t), 30); };

  /* ── Avisos de abajo (con Deshacer) ── */
  const kEnvio = useRef(0);
  const aviso = useCallback((texto, { error, deshacer, dura } = {}) => {
    const id = ++kEnvio.current;
    setEnvios((l) => [...l, { id, texto, error, deshacer }]);
    anunciar(texto);
    setTimeout(() => setEnvios((l) => l.filter((x) => x.id !== id)), dura || (deshacer ? ESPERA : error ? 9000 : 4000));
    return id;
  }, []);
  const quitarAviso = (id) => setEnvios((l) => l.filter((x) => x.id !== id));

  /* ── Pase propuesto: el más reciente aún sin pedir ── */
  const pedida = (fecha, salvo) => guardias.find((g) => g.fecha === fecha && g.id !== salvo);
  const propuesto = pases.find((p) => !guardias.some((g) => g.fecha === p)) || pases[0] || "otro";
  const pase = form.pase ?? propuesto;
  const fecha = pase === "otro" ? form.otro : pase;
  const a = analisis(form.he, form.hs);
  const ya = fecha && pedida(fecha, editando);
  const ed = editando ? guardias.find((g) => g.id === editando) : null;

  /* ── Horas: se interpretan al salir del campo o con Intro ── */
  const leerHora = (k) => {
    if (raw[k] == null) return form[k] || "";
    const n = normaHora(raw[k]);
    setRaw((r) => { const x = { ...r }; delete x[k]; return x; });
    if (n === null) { setForm((f) => ({ ...f, [k]: "" })); setErrores((e) => ({ ...e, [k]: ERR_HORA })); return null; }
    setForm((f) => ({ ...f, [k]: n }));
    setErrores((e) => { const x = { ...e }; delete x[k]; if (x.hs && /misma hora/.test(x.hs)) delete x.hs; return x; });
    return n;
  };
  const fijarHora = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setRaw((r) => { const x = { ...r }; delete x[k]; return x; });
    setErrores((e) => { const x = { ...e }; delete x[k]; if (x.hs && /misma hora/.test(x.hs)) delete x.hs; return x; });
  };
  const abrirPk = (k, conBoton) => {
    leerHora("he"); leerHora("hs");
    if (conBoton && picker === k) { setPicker(null); enfocar(`#f-${k}`); return; }
    setPicker(k); setModo("h"); enfocar(`#f-${k}`);
  };
  const cerrarPk = (volver) => { const k = picker; setPicker(null); if (volver && k) enfocar(`#f-${k}`); };
  // Lo habitual en un pase es entrar a las 7:00; para la salida no hay hora habitual.
  const tipica = (k) => (x) => k === "he" && x === 7;
  const elegir = (k) => (m, x, teclado) => {
    const v = form[k];
    if (m === "h") {
      const mm = v ? v.slice(3) : "00";
      fijarHora(k, `${pad(x)}:${mm}`); setModo("m");
      enfocar(teclado ? `#mg-${k}-m${(Math.round(Number(mm) / 5) * 5) % 60}` : `#f-${k}`);
      return;
    }
    const hh = v ? v.slice(0, 2) : "00";
    fijarHora(k, `${hh}:${pad(x)}`);
    if (k === "he" && !form.hs) { setPicker("hs"); setModo("h"); enfocar(teclado ? `#mg-hs-h${(Number(hh) + 3) % 24}` : "#f-hs"); return; }
    setPicker(null); enfocar("#f-desc");
  };
  const teclaHora = (k) => (e) => {
    if (e.key === "Enter") { e.preventDefault(); const ok = leerHora(k); setPicker(null); enfocar(ok !== null ? (k === "he" ? "#f-hs" : "#f-desc") : `#f-${k}`); return; }
    if (e.key === "Escape" && picker) { e.preventDefault(); setPicker(null); return; }
    if (e.key === "Tab" && !e.shiftKey && picker === k) {
      e.preventDefault(); const v = leerHora(k); setModo("h");
      enfocar(`#mg-${k}-h${v ? Number(v.slice(0, 2)) : k === "he" ? 7 : (Number(String(form.he).slice(0, 2)) || 7)}`); return;
    }
    if (e.key === "ArrowDown" && e.altKey) { e.preventDefault(); abrirPk(k); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const v = leerHora(k);
      const cur = aMin(v) ?? (k === "he" ? 6 * 60 + 45 : aMin(form.he) ?? 6 * 60 + 45); // ↑ desde vacío: 7:00
      const n = (((Math.round(cur / 15) * 15 + (e.key === "ArrowUp" ? 15 : -15)) % 1440) + 1440) % 1440;
      fijarHora(k, `${pad(Math.floor(n / 60))}:${pad(n % 60)}`);
    }
  };
  // Clic fuera del campo y del reloj: se cierra.
  useEffect(() => {
    if (!picker) return;
    const fuera = (e) => { if (!e.target.closest(".mg-pk") && !e.target.closest(".mg-hora")) setPicker(null); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [picker]);

  /* ── Enviar (nueva o corrección) ── */
  const limpiar = () => { setForm(FORM_VACIO); setRaw({}); setErrores({}); setEditando(null); setPicker(null); };
  const enviar = async (e) => {
    e?.preventDefault();
    if (enviando) return; // un solo envío aunque se pulse dos veces
    const he = leerHora("he"), hs = leerHora("hs");
    setPicker(null);
    const f = { ...form, he: he || "", hs: hs || "" };
    const an = analisis(f.he, f.hs);
    const err = {};
    if (!fecha) err.fecha = "Elige el pase o escribe el día.";
    else if (diasEntre(fecha, hoy) < 0) err.fecha = "Ese día aún no ha llegado.";
    else if (diasEntre(fecha, hoy) > DIAS_PASES) err.fecha = `Solo se pueden pedir guardias de los últimos ${DIAS_PASES} días.`;
    if (he === null) err.he = ERR_HORA; else if (!f.he) err.he = "Falta la hora de entrada.";
    if (hs === null) err.hs = ERR_HORA; else if (!f.hs) err.hs = "Falta la hora de salida.";
    if (an && an.error) err.hs = an.error;
    if (!f.desc.trim()) err.desc = "Cuenta qué pasó: es lo que ve coordinación para aprobarla.";
    if (!editando && !yo) err.fecha = err.fecha || (equipo ? "No te encuentro en equipo.json: pide a coordinación que te den de alta." : "Cargando el equipo… prueba en un momento.");
    setErrores(err);
    const k = Object.keys(err);
    if (k.length) { enfocar({ fecha: "#f-pase", he: "#f-he", hs: "#f-hs", desc: "#f-desc" }[k[0]] || "#f-pase"); anunciar(Object.values(err).join(" ")); return; }

    setEnviando(true);
    try {
      if (editando) {
        const d = await post("corregir", { id: editando, email, fecha, horaEntrada: f.he, horaSalida: f.hs, descripcion: f.desc.trim() });
        setCambios((c) => ({ ...c, [editando]: d.guardia }));
        aviso(`Guardia del ${dia(fecha)} corregida`);
        setNueva(editando); enfocar(`#g-${editando}`);
      } else {
        const d = await post("crear", { persona: yo.nombre, email: yo.email, fecha, horaEntrada: f.he, horaSalida: f.hs, descripcion: f.desc.trim() });
        setExtra((l) => [d.guardia, ...l]);
        const fallo = errorAviso(d);
        if (fallo) aviso(`Guardia del ${dia(fecha)} guardada, pero el correo a coordinación no salió (${fallo}): avísales tú.`, { error: true });
        else aviso(`Guardia del ${dia(fecha)} enviada a coordinación`);
        setNueva(d.guardia.id); enfocar(`#g-${d.guardia.id}`);
      }
      setVista("curso"); limpiar();
      reload(true);
    } catch (er) {
      aviso(`No se pudo ${editando ? "guardar la corrección" : "enviar"}: ${er.message || er}. ${editando ? "" : "Antes de reintentar, mira en «En curso» si se guardó."}`, { error: true });
      if (editando && /ya la ha|no es tuya|No existe/.test(String(er.message))) limpiar();
      reload(true);
    } finally {
      setEnviando(false);
    }
  };
  useEffect(() => { if (!nueva) return; const t = setTimeout(() => setNueva(null), 4000); return () => clearTimeout(t); }, [nueva]);

  /* ── Corregir / retirar (solo pendientes) ── */
  const corregir = (g) => {
    const enLista = pases.includes(g.fecha);
    setEditando(g.id); setErrores({}); setRaw({}); setPicker(null);
    setForm({ pase: enLista ? g.fecha : "otro", otro: enLista ? "" : g.fecha, he: g.horaEntrada, hs: g.horaSalida, desc: g.descripcion });
    enfocar("#f-he");
    document.querySelector(".mg-pedir")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const retiros = useRef(new Map()); // id → timer, aún con «Deshacer»
  const retirar = (g) => {
    if (editando === g.id) limpiar();
    setOcultas((s) => new Set(s).add(g.id));
    const avisoId = aviso(`Guardia del ${dia(g.fecha)} retirada`, {
      deshacer: () => {
        clearTimeout(retiros.current.get(g.id)); retiros.current.delete(g.id);
        setOcultas((s) => { const n = new Set(s); n.delete(g.id); return n; });
        quitarAviso(avisoId); enfocar(`#g-${g.id}`); anunciar("Recuperada");
      },
    });
    enfocar("#h-tit");
    retiros.current.set(g.id, setTimeout(async () => {
      retiros.current.delete(g.id);
      try { await post("retirar", { id: g.id, email }); reload(true); }
      catch (er) {
        setOcultas((s) => { const n = new Set(s); n.delete(g.id); return n; });
        aviso(`No se pudo retirar la guardia del ${dia(g.fecha)}: ${er.message || er}`, { error: true });
        reload(true);
      }
    }, ESPERA));
  };
  // Si te vas con un retiro aún en espera, se manda igualmente.
  useEffect(() => {
    const salir = () => { retiros.current.forEach((t, id) => { clearTimeout(t); beacon("retirar", { id, email }); }); retiros.current.clear(); };
    window.addEventListener("pagehide", salir);
    return () => window.removeEventListener("pagehide", salir);
  }, [beacon, email]);

  /* ── Pintar ── */
  const curso = guardias.filter(enCurso), cerradas = guardias.filter((g) => !enCurso(g));
  const debe = guardias.filter((g) => g.estado === "aprobada" && !g.aprobadaMyNfq).reduce((n, g) => n + (g.importe || 0), 0);
  const pend = guardias.filter((g) => g.estado === "pendiente").length;
  const verVista = cerradas.length && vista === "hist" ? "hist" : "curso";
  const anios = [...new Set(cerradas.map((g) => g.fecha.slice(0, 4)))];
  const anioSel = anios.includes(anio) ? anio : anios[0];
  const delAnio = cerradas.filter((g) => g.fecha.startsWith(anioSel || ""));
  const err = errores;
  const desc = (k) => (err[k] ? { "aria-invalid": true, "aria-describedby": `e-${k}` } : {});
  const boton = editando ? "Guardar la corrección" : fecha ? `Pedir la guardia del ${dia(fecha)}` : "Pedir la guardia";
  const pie = picker === "hs" && modo === "m" && a && !a.error
    ? <><span className="gu-dur">{fDur(a.m)}</span><span>{a.cruza ? `termina el ${dia(masUnDia(fecha || hoy))}` : "el mismo día"}</span></>
    : <span>O escríbela: <kbd>730</kbd> → 07:30</span>;

  const fila = (g) => {
    const m = minutos(g);
    if (!enCurso(g)) return (
      <li key={g.id}>
        <div className="mg-l1"><b>{dia(g.fecha)}</b><span>{g.horaEntrada} – {g.horaSalida}</span><span className="gu-dur">{fDur(m)}</span><Estado g={g} />{g.estado !== "rechazada" && <span className="mg-desc" title={g.descripcion}>{g.descripcion}</span>}</div>
        {g.estado === "rechazada" && <p>Rechazada{g.resueltoPor ? ` por ${g.resueltoPor}` : ""}{g.motivo ? `: «${g.motivo}»` : ""}</p>}
      </li>
    );
    return (
      <li key={g.id} id={`g-${g.id}`} tabIndex={-1} className={`mg-g${g.estado === "pendiente" ? " mg-pend" : ""}${nueva === g.id ? " mg-nueva" : ""}`}>
        <div className="mg-l1">
          <b>{dia(g.fecha)}</b><span>{g.horaEntrada} – {g.horaSalida}</span><span className="gu-dur">{fDur(m)}</span><Estado g={g} />
          {g.estado === "pendiente" && (
            <span className="mg-acc">
              <button type="button" className="v-btn v-btn-l" onClick={() => corregir(g)} aria-label={`Corregir la guardia del ${dia(g.fecha)}`}>Corregir</button>
              <button type="button" className="v-btn v-btn-t" onClick={() => retirar(g)} aria-label={`Retirar la guardia del ${dia(g.fecha)}`}>Retirar</button>
            </span>
          )}
        </div>
        <p className="mg-desc">{g.descripcion}</p>
        <Ciclo g={g} />
        {g.estado === "aprobada" && <p className="mg-desc">Aprobada{g.resueltoPor ? ` por ${g.resueltoPor}` : ""}. El alta en MyNFQ la hace coordinación.</p>}
      </li>
    );
  };

  const tab = (k, t, n, viva) => (
    <button type="button" role="tab" id={`tab-${k}`} aria-selected={verVista === k} aria-controls="panel-mg" tabIndex={verVista === k ? 0 : -1}
      onClick={() => { setVista(k); enfocar(`#tab-${k}`); }}
      onKeyDown={(e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const o = verVista === "hist" ? "curso" : "hist"; setVista(o); enfocar(`#tab-${o}`); } }}>
      {t} <span className={`mg-n${viva && n ? " mg-viva" : ""}`}>{n}</span>
    </button>
  );

  let historico = null;
  if (cerradas.length) {
    const cobrado = delAnio.filter((g) => g.estado === "aprobada").reduce((n, g) => n + (g.importe || 0), 0);
    const rech = delAnio.filter((g) => g.estado === "rechazada").length;
    let q = "";
    historico = (
      <div className="mg-hist">
        <div className="mg-cab">
          <h3 className="text-[15px] font-bold">{anios.length > 1 ? "Cerradas en" : `Cerradas en ${anioSel}`}</h3>
          {anios.length > 1 && (
            <span className="gu-anio">
              <select id="h-anio" className="v-inp" value={anioSel} aria-label="Año de las guardias cerradas" onChange={(e) => { setAnio(e.target.value); enfocar("#h-anio"); }}>
                {anios.map((y) => <option key={y} value={y}>{y} · {cerradas.filter((g) => g.fecha.startsWith(y)).length}</option>)}
              </select>
              <IconoBBVA nombre="fold" size={14} />
            </span>
          )}
        </div>
        <p className="mg-resanio"><b>{delAnio.length}</b> {delAnio.length === 1 ? "guardia" : "guardias"}{cobrado ? <> · <b>{eur.format(cobrado)}</b> en MyNFQ</> : ""}{rech ? ` · ${rech} ${rech === 1 ? "rechazada" : "rechazadas"}` : ""}</p>
        <ul className="mg-tabla">
          {delAnio.map((g) => {
            const t = qDe(g.fecha); const cab = t !== q; q = t;
            return [cab && <li key={"q" + t} className="mg-subq" aria-hidden="true">{t}</li>, fila(g)];
          })}
        </ul>
      </div>
    );
  }

  return (
    <main className="vacu gu mg mx-auto flex w-full max-w-[1376px] flex-col gap-4 px-4 pb-10 pt-cabecera sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3.5">
          <span className="hub-placa hub-eq grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="alarm" size={28} /></span>
          <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Guardias</h1>
        </div>
        {snap?.data && (
          <p className="v-nota text-[14px]">
            {debe ? <><b>{eur.format(debe)}</b> aprobados por dar de alta en MyNFQ</> : "Nada aprobado pendiente de MyNFQ"} · <b>{pend}</b> {pend === 1 ? "pendiente" : "pendientes"} de resolver
          </p>
        )}
      </div>

      <div className="mg-rejilla">
        {/* ── Pedir ── */}
        <section className="mg-pedir" aria-labelledby="f-tit">
          <div className="mg-cab">
            <h2 id="f-tit">{ed ? `Corregir la guardia del ${dia(ed.fecha)}` : "Pedir una guardia"}</h2>
            {ed && <button type="button" className="v-btn v-btn-t" onClick={() => { limpiar(); enfocar("#f-tit"); }}>Cancelar</button>}
          </div>
          {ed && <p className="mg-resumen">Coordinación aún no la ha resuelto: verá la versión corregida.</p>}
          <form className="mg-form" noValidate onSubmit={enviar}>
            <div className="v-campo">
              <label htmlFor="f-pase">Pase</label>
              <span className="mg-sel">
                <select id="f-pase" className="v-inp" value={pase} disabled={enviando} {...desc("fecha")}
                  onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, pase: v })); setErrores((x) => { const n = { ...x }; delete n.fecha; return n; }); if (v === "otro") enfocar("#f-otro"); }}>
                  {pases.map((p) => <option key={p} value={p}>{dia(p)} · {haceDias(p, hoy)}{pedida(p, editando) ? " · ya la pediste" : ""}</option>)}
                  <option value="otro">Otro día…</option>
                </select>
                <IconoBBVA nombre="fold" size={14} />
              </span>
            </div>
            {pase === "otro" && (
              <div className="v-campo">
                <label htmlFor="f-otro">Día de la guardia</label>
                <input id="f-otro" className="v-inp" type="date" value={form.otro} max={hoy} min={masDias(hoy, -DIAS_PASES)} disabled={enviando} {...desc("fecha")}
                  onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, otro: v })); setErrores((x) => { const n = { ...x }; delete n.fecha; return n; }); }} />
              </div>
            )}
            {snap?.data?.pasesError && <p className="mg-pista">No se pudo leer la lista de pases: elige «Otro día…».</p>}
            {err.fecha && <p className="mg-error" id="e-fecha">{err.fecha}</p>}
            {ya && (
              <p className="mg-aviso">
                Ya pediste una guardia para el {dia(fecha)} ({ya.horaEntrada}–{ya.horaSalida}). Si es otra distinta, sigue
                {ya.estado === "pendiente" ? <>; si es la misma, <button type="button" onClick={() => corregir(ya)}>corrígela</button>.</> : "."}
              </p>
            )}
            <div className="mg-dos">
              <CampoHora k="he" etiqueta="Entrada" valor={form.he} raw={raw.he} abierto={picker === "he"} disabled={enviando}
                invalido={!!err.he} describedby={err.he ? "e-he" : undefined}
                onRaw={(v) => setRaw((r) => ({ ...r, he: v }))} onLeer={() => leerHora("he")} onAbrir={(b) => abrirPk("he", b)} onTecla={teclaHora("he")} />
              <CampoHora k="hs" etiqueta="Salida" valor={form.hs} raw={raw.hs} abierto={picker === "hs"} disabled={enviando}
                invalido={!!err.hs || !!(a && a.error)} describedby={err.hs || (a && a.error) ? "e-hs" : undefined}
                onRaw={(v) => setRaw((r) => ({ ...r, hs: v }))} onLeer={() => leerHora("hs")} onAbrir={(b) => abrirPk("hs", b)} onTecla={teclaHora("hs")} />
            </div>
            {picker && !enviando && (
              <PanelReloj k={picker} valor={form[picker]} modo={modo} setModo={setModo} onElegir={elegir(picker)} tipica={tipica(picker)} pie={pie} cerrar={cerrarPk} />
            )}
            {err.he && <p className="mg-error" id="e-he">{err.he}</p>}
            {(err.hs || (a && a.error)) && <p className="mg-error" id="e-hs">{err.hs || a.error}</p>}
            {a && !a.error && picker !== "hs" && (
              <p className="mg-resumen" id="f-resumen">
                <span className="gu-dur">{fDur(a.m)}</span>
                {a.cruza ? <span>termina el <b>{dia(masUnDia(fecha || hoy))} a las {form.hs}</b></span> : <span>de {form.he} a {form.hs}</span>}
              </p>
            )}
            {a && a.largo && !a.error && <p className="mg-aviso">Más de 10 horas: comprueba las horas antes de pedirla.</p>}
            <div className="v-campo">
              <label htmlFor="f-desc">Qué pasó</label>
              <textarea id="f-desc" className="v-inp" value={form.desc} disabled={enviando}
                placeholder="p. ej. el arranque de cadenas falló y hubo que relanzar CH_RDR_04"
                aria-invalid={err.desc ? true : undefined} aria-describedby={`f-desc-ayuda${err.desc ? " e-desc" : ""}`}
                onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, desc: v })); if (v.trim()) setErrores((x) => { const n = { ...x }; delete n.desc; return n; }); }}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(e); }} />
            </div>
            <p className="mg-pista" id="f-desc-ayuda">Incidencias o tareas de esa noche: es lo que ve coordinación para aprobarla.</p>
            {err.desc && <p className="mg-error" id="e-desc">{err.desc}</p>}
            <button type="submit" id="f-enviar" className="v-btn v-btn-p mg-enviar" disabled={enviando || !!snap?.error}>
              <IconoBBVA nombre={editando ? "checkmark" : "add"} size={18} />
              {enviando ? (editando ? "Guardando…" : "Enviando…") : boton}
            </button>
            <p className="mg-pista">{editando ? "Coordinación ve el cambio en su bandeja." : "Le llega a coordinación; te avisamos por correo cuando la resuelvan. El alta en MyNFQ la hace coordinación."}</p>
          </form>
        </section>

        {/* ── Mis guardias ── */}
        <section className="mg-hist" aria-labelledby="h-tit">
          <div className="mg-cab">
            <h2 id="h-tit" tabIndex={-1} className="outline-none">Mis guardias</h2>
            {snap?.data && cerradas.length > 0 && (
              <div className="mg-pest" role="tablist" aria-label="Mis guardias">
                {tab("curso", "En curso", curso.length, true)}{tab("hist", "Histórico", cerradas.length)}
              </div>
            )}
          </div>
          {!snap ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Cargando tus guardias">
              {[120, 96, 96].map((h, i) => <div key={i} className="mg-esq" style={{ height: h }} />)}
            </div>
          ) : snap.error ? (
            <div className="mg-vacio flex flex-wrap items-center gap-3" role="alert">
              <span>No se pudieron cargar tus guardias: {snap.error}</span>
              <button type="button" className="v-btn v-btn-l" onClick={() => reload()}>Reintentar</button>
            </div>
          ) : !guardias.length ? (
            <p className="mg-vacio">Aún no has pedido ninguna guardia. Cuando la pidas, aquí verás si la aprueban, por cuánto y cuándo se da de alta en MyNFQ.</p>
          ) : (
            <div id="panel-mg" role={cerradas.length ? "tabpanel" : undefined} aria-labelledby={cerradas.length ? `tab-${verVista}` : undefined}>
              {verVista === "hist" ? historico : curso.length ? (
                <ol className="mg-lista">{curso.map(fila)}</ol>
              ) : (
                <div className="flex flex-col items-start gap-2">
                  <p className="mg-nada">Nada en curso: todas tus guardias están cerradas.</p>
                  <button type="button" className="v-btn v-btn-l" onClick={() => { setVista("hist"); enfocar("#tab-hist"); }}>Ver el histórico</button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <div className="gu-envios" aria-live="off">
        {envios.map((x) => (
          <div key={x.id} className={`gu-envio${x.error ? " gu-envio-error" : ""}`}>
            <span>{x.texto}</span>
            {x.deshacer && <button type="button" onClick={x.deshacer}>Deshacer</button>}
          </div>
        ))}
      </div>
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{anuncio}</div>
    </main>
  );
}
