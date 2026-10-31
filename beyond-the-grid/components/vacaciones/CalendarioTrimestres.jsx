"use client";

import { useMemo, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import { deIso } from "./datos";
import {
  MES, MCOR, COLOR_YO, LEYENDA, colorMotivo, textoMotivo, esFinde, fCorta, fLarga,
  coincide, mesesDeQ, diasDeMes, semanaPico,
} from "./vistaUsuario";

/* Calendario del equipo por trimestres (vista de usuario de /vacaciones):
   una tira con los 4 trimestres (mostrar/ocultar, con la carga de cada uno),
   la leyenda y el filtro por persona, y los meses de cada trimestre visible
   con hasta 3 nombres por día. El 4º trimestre añade enero del año siguiente.
   Teclado: una parada de tabulador por trimestre y flechas entre días. */

const ESP = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function Histo({ q, anio, aus }) {
  return mesesDeQ(q, anio).map(([y, m], k) => (
    <span key={`${y}-${m}`} className="contents">
      {k > 0 && <i className="v-sep" />}
      {diasDeMes(y, m).filter((s) => !esFinde(s)).map((s) => {
        const c = (aus[s] || []).length;
        return <i key={s} className={c ? "" : "v-cero"} style={{ height: Math.min(22, c * 3 + 1) }} />;
      })}
    </span>
  ));
}

function Tira({ anio, qs, onToggleQ, aus }) {
  return (
    <div className="v-tira" role="group" aria-label="Trimestres a la vista">
      {[1, 2, 3, 4].map((q) => {
        const on = qs.has(q);
        const ms = mesesDeQ(q, anio);
        const pico = semanaPico(q, anio, aus);
        const rango = `${MCOR[ms[0][1]]} – ${MCOR[ms[ms.length - 1][1]]}${q === 4 ? ` ${String(anio + 1).slice(2)}` : ""}`;
        const picoTxt = pico && pico[1] ? `semana del ${fCorta(pico[0], anio)} · ${pico[1]} fuera` : "nadie fuera";
        return (
          <button key={q} type="button" className="v-q" aria-pressed={on} onClick={() => onToggleQ(q)}
            aria-label={`Q${q}, ${rango}. ${on ? "Visible: pulsa para ocultar" : "Oculto: pulsa para ver"}. Semana más cargada: ${picoTxt}`}>
            <span className="flex items-center justify-between text-[13px] font-bold">
              <span>Q{q} <small className="v-soft text-[12px] font-normal">{rango}</small></span>
              <span className="text-[11px]">{on ? "Ocultar" : "Ver"}</span>
            </span>
            <span className="v-histo" aria-hidden><Histo q={q} anio={anio} aus={aus} /></span>
            <small className="v-soft truncate text-[12px]">Pico: {picoTxt}</small>
          </button>
        );
      })}
    </div>
  );
}

function Filtro({ personas, filtro, setFiltro }) {
  const [buscar, setBuscar] = useState("");
  const texto = filtro || buscar;
  const coinc = buscar && !filtro ? personas.filter((n) => coincide(n, buscar)).slice(0, 6) : [];
  return (
    <span className="flex flex-wrap items-center gap-2">
      {filtro && (
        <span className="inline-flex items-center gap-1 text-[13px] font-bold">
          Viendo solo a {filtro}
          <button type="button" className="v-btn v-btn-t" onClick={() => { setFiltro(""); setBuscar(""); }}>Quitar</button>
        </span>
      )}
      <span className="relative w-[260px] max-w-full">
        <label className="relative block">
          <span className="sr-only">Ver solo a una persona</span>
          <IconoBBVA nombre="filter" size={16} className="v-soft pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="v-inp v-con-icono" autoComplete="off" placeholder="Ver solo a una persona…" value={texto}
            aria-describedby="v-filtro-res"
            onChange={(e) => { setBuscar(e.target.value); if (filtro) setFiltro(""); }}
            onKeyDown={(e) => { if (e.key === "Enter" && coinc.length) { setFiltro(coinc[0]); setBuscar(coinc[0]); } if (e.key === "Escape") { setBuscar(""); setFiltro(""); } }} />
        </label>
        {buscar && !filtro ? (
          <span id="v-filtro-res" className="v-hoja absolute left-0 right-0 top-11 z-20 flex flex-col gap-0.5 !p-1.5">
            {coinc.length ? coinc.map((n) => (
              <button key={n} type="button" className="v-btn v-btn-t justify-start" onClick={() => { setFiltro(n); setBuscar(n); }}>{n}</button>
            )) : <span className="v-nota p-1.5">Sin coincidencias</span>}
          </span>
        ) : <span id="v-filtro-res" className="sr-only" />}
      </span>
    </span>
  );
}

function Mes({ y, m, ctx, foco }) {
  const { anio, hoy, aus, filtro, yo, cortos, festVista, festOtros, pend, pide, elegir, onDia } = ctx;
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  const hoyF = deIso(hoy);
  const actual = y === hoyF.getFullYear() && m === hoyF.getMonth();
  const siguiente = y !== anio;
  return (
    <section className={`v-mes ${actual ? "v-actual" : ""}`} aria-label={`${MES[m]} ${y}`}>
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <h3 className="text-[15px] font-bold">{MES[m]}{siguiente ? ` ${y}` : ""}</h3>
        {actual && <span className="v-etq">Este mes</span>}
        {siguiente && <span className="v-etq">Año siguiente</span>}
      </div>
      <div className="v-dow" aria-hidden>{ESP.map((x) => <span key={x}>{x}</span>)}</div>
      <div className="v-dias">
        {Array.from({ length: off }, (_, i) => <span key={`v${i}`} className="v-vacio" />)}
        {diasDeMes(y, m).map((s) => {
          const d = Number(s.slice(8));
          if (esFinde(s)) return <span key={s} className="v-dia v-finde" aria-hidden><span className="v-num">{d}</span></span>;
          const fest = festVista[s];
          const festOtro = !fest ? festOtros[s] : null;
          const todos = aus[s] || [];
          const lista = filtro ? todos.filter((a) => a.nombre === filtro) : todos;
          const mio = todos.some((a) => a.nombre === yo);
          const eleg = elegir && s >= hoy;
          const ord = [...lista].sort((a, b) => (a.nombre === yo ? -1 : b.nombre === yo ? 1 : 0));
          const corto = (a) => (a.nombre === yo ? "Tú" : cortos[a.nombre] || a.nombre);
          const quien = ord.slice(0, 3).map((a) => (a.nombre === yo ? "tú" : corto(a))).join(", ") + (lista.length > 3 ? ` y ${lista.length - 3} más` : "");
          const etiqueta = `${fLarga(s, anio)}: ${lista.length ? `${lista.length} fuera (${quien})` : "nadie fuera"}${fest ? ` · festivo ${fest}` : ""}${pide.has(s) ? " · lo estás pidiendo" : ""}${pend.has(s) ? " · pendiente de aprobar" : ""}${eleg ? (elegir === "desde" ? " · pulsa para empezar aquí" : " · pulsa para terminar aquí") : ""}`;
          const cls = ["v-dia", fest && "v-festivo", mio && "v-mio", pend.has(s) && "v-pend", pide.has(s) && "v-pide", s < hoy && "v-pasado", s === hoy && "v-hoy", eleg && "v-elegible"].filter(Boolean).join(" ");
          return (
            <button key={s} type="button" className={cls} data-dia={s} tabIndex={s === foco ? 0 : -1} aria-label={etiqueta} onClick={() => onDia(s)}>
              <span className="v-num">{d}</span>
              {(fest || festOtro) && <span className="v-fest">{fest || festOtro}</span>}
              {ord.slice(0, 3).map((a, i) => (
                <span key={a.nombre} className={`v-nom ${i === 2 ? "v-tercero" : ""}`} style={{ background: a.nombre === yo ? COLOR_YO : colorMotivo(a.motivo) }}>{corto(a)}</span>
              ))}
              {lista.length > 3 && <span className="v-mas v-mas3">+{lista.length - 3} más</span>}
              {lista.length > 2 && <span className="v-mas v-mas2">+{lista.length - 2}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function CalendarioTrimestres({
  anio, hoy, qs, onToggleQ, aus, personas, filtro, setFiltro, yo, cortos,
  festVista, festOtros, grupoVista, pend, pide, elegir, onDia, focoDia, sinEnero,
}) {
  const ctx = { anio, hoy, aus, filtro, yo, cortos, festVista, festOtros, pend, pide, elegir, onDia };
  const qHoy = deIso(hoy).getFullYear() === anio ? Math.floor(deIso(hoy).getMonth() / 3) + 1 : 1;

  // Flechas: ±1 día laborable a izquierda/derecha, ±1 semana arriba/abajo.
  const teclas = (e) => {
    const dia = e.target.closest?.("[data-dia]");
    const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    if (!dia || !paso) return;
    e.preventDefault();
    let f = deIso(dia.dataset.dia);
    for (let i = 0; i < 10; i++) {
      f.setDate(f.getDate() + paso);
      const s = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
      const el = document.querySelector(`[data-dia="${s}"]`);
      if (el) { dia.tabIndex = -1; el.tabIndex = 0; el.focus(); el.scrollIntoView({ block: "nearest" }); return; }
      if (Math.abs(paso) === 7) f.setDate(f.getDate() + (paso > 0 ? -6 : 6));
    }
  };

  const trimestres = useMemo(() => [1, 2, 3, 4].filter((q) => qs.has(q)).map((q) => {
    const ms = mesesDeQ(q, anio).filter(([y]) => !(sinEnero && y > anio));
    const dias = ms.flatMap(([y, m]) => diasDeMes(y, m)).filter((s) => !esFinde(s));
    const foco = dias.includes(focoDia) ? focoDia : dias.includes(hoy) ? hoy : dias.find((s) => s >= hoy) || dias[0];
    return { q, ms, foco };
  }), [qs, anio, sinEnero, focoDia, hoy]);

  return (
    <section className="v-cal" id="calendario" tabIndex={-1} aria-label="Calendario del equipo" onKeyDown={teclas}>
      <Tira anio={anio} qs={qs} onToggleQ={onToggleQ} aus={aus} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="v-leyenda">
          {LEYENDA.map((k) => <span key={k}><i className="v-sw" style={{ background: colorMotivo(k) }} />{textoMotivo(k)}</span>)}
          <span><i className="v-sw" style={{ background: COLOR_YO }} />Tú</span>
          <span><i className="v-sw" style={{ border: "2px dashed var(--v-ink)" }} />Pendiente</span>
          <span><i className="v-sw" style={{ boxShadow: "inset 0 0 0 2px var(--v-ink)" }} />Lo que estás pidiendo</span>
          {grupoVista && <span><i className="v-sw" style={{ background: "var(--v-rayas)" }} />Festivo de {grupoVista}</span>}
        </div>
        <Filtro personas={personas} filtro={filtro} setFiltro={setFiltro} />
      </div>
      {trimestres.map(({ q, ms, foco }) => (
        <section key={q} className="flex flex-col gap-2.5" aria-labelledby={`v-q${q}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 id={`v-q${q}`} className="text-lg font-bold">Q{q} <small className="v-soft text-sm font-normal">· {ms.map(([y, m]) => MES[m] + (y !== anio ? ` ${y}` : "")).join(", ")}</small></h2>
            <button type="button" className="v-btn v-btn-t" onClick={() => onToggleQ(q)}>Ocultar Q{q}</button>
          </div>
          {q === 4 && sinEnero && <p className="v-nota">Enero de {anio + 1} aparecerá aquí cuando coordinación abra ese año.</p>}
          <p className="sr-only">Usa las flechas para moverte entre los días.</p>
          <div className="v-meses">{ms.map(([y, m]) => <Mes key={`${y}-${m}`} y={y} m={m} ctx={ctx} foco={foco} />)}</div>
        </section>
      ))}
      {!qs.size && (
        <div className="flex items-center justify-between gap-2.5 rounded-xl border-[1.5px] border-dashed px-3.5 py-2.5 text-[13px]" style={{ borderColor: "var(--v-line-soft)" }}>
          <span className="v-soft">Todos los trimestres están ocultos.</span>
          <button type="button" className="v-btn v-btn-l" onClick={() => onToggleQ(qHoy)}>Ver el trimestre actual</button>
        </div>
      )}
    </section>
  );
}
