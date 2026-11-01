"use client";

import { useEffect, useMemo, useState } from "react";
import IconoBBVA from "../iconosBBVA";
import ResultadoSincronizacion from "./ResultadoSincronizacion";
import { coincide, fCorta } from "./vistaUsuario";

/* Gestión de vacaciones: pestaña Personas (saldos, sede y días del año, con
   «Deshacer») y, en Configuración, «Sedes y festivos» y «Años» (crear el
   año siguiente y, aparte y plegado, rehacer uno desde cero). */

const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const PAIS = { ES: "España", MX: "México" };

/* ── Personas ── */
function DiasInput({ valor, nombre, deshabilitado, onGuardar }) {
  const [v, setV] = useState(String(valor ?? ""));
  useEffect(() => { setV(String(valor ?? "")); }, [valor]);
  const guardar = () => {
    const n = Number(String(v).replace(",", "."));
    if (String(v).trim() === "" || !Number.isFinite(n) || n === Number(valor)) { setV(String(valor ?? "")); return; }
    onGuardar(n);
  };
  return (
    <input type="number" min={0} max={99} step={0.5} value={v} disabled={deshabilitado} aria-label={`Días del año de ${nombre}`}
      onChange={(e) => setV(e.target.value)} onBlur={guardar}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(String(valor ?? "")); e.currentTarget.blur(); } }}
      className="v-inp !w-[72px] !py-1 text-right tabular-nums" />
  );
}

function Sincronizar({ post, onCambio }) {
  const [estado, setEstado] = useState({ fase: "listo" });
  const sincronizar = async () => {
    setEstado({ fase: "enviando" });
    try {
      const r = await post("sincronizarEquipo", {});
      setEstado({ fase: "ok", r });
      if (r.altas.length || r.vinculados.length) onCambio();
    } catch (e) { setEstado({ fase: "error", error: String(e.message || e) }); }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="v-nota max-w-[720px]">Las altas se hacen en <a href="/team-hub/equipo-gestion/" className="font-bold underline">Gestión de equipo</a>: al guardar allí, quien falte aquí se añade solo, con la sede Madrid y los días que quedan del año.</p>
        <button type="button" disabled={estado.fase === "enviando"} onClick={sincronizar} className="v-btn v-btn-l">
          <IconoBBVA nombre="arrows" size={16} />{estado.fase === "enviando" ? "Sincronizando…" : "Sincronizar con Gestión de equipo"}
        </button>
      </div>
      {estado.fase === "ok" && <ResultadoSincronizacion r={estado.r} />}
      {estado.fase === "error" && <p className="v-aviso" role="alert">{estado.error}</p>}
    </div>
  );
}

const COLS = [["nombre", "Persona"], ["grupo", "Sede (festivos)"], ["anteriores", "Del año anterior"], ["dias", "Días del año"], ["total", "Total"], ["va", "Cogidos"], ["quedan", "Quedan"], ["pendientesVA", "Pendientes"], ["quedanTrasPendientes", "Quedarían"]];

export function Personas({ d, post, onCambio, avisar }) {
  const [guardando, setGuardando] = useState("");
  const [buscar, setBuscar] = useState("");
  const [orden, setOrden] = useState({ col: "quedan", dir: 1 });
  const corto = (n) => d.cortos?.[n] || n;
  const enDirecto = (d.anios || []).includes(d.year - 1);
  const filas = useMemo(() => {
    const out = (d.saldos || []).filter((p) => !buscar || coincide(`${p.nombre} ${corto(p.nombre)}`, buscar)).map((p) => ({ ...p, corto: corto(p.nombre) }));
    const { col, dir } = orden;
    const k = col === "nombre" ? "corto" : col;
    return out.sort((a, b) => (a.activo !== b.activo ? (a.activo ? -1 : 1) : (typeof a[k] === "string" ? String(a[k]).localeCompare(String(b[k]), "es") : (a[k] || 0) - (b[k] || 0)) * dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.saldos, buscar, orden]);

  const cambiar = async (accion, persona, campo, valor, anterior, texto) => {
    setGuardando(persona);
    try {
      await post(accion, { anio: d.year, persona, [campo]: valor });
      onCambio();
      avisar(`Guardado: ${texto}`, async () => { await post(accion, { anio: d.year, persona, [campo]: anterior }); onCambio(); avisar("Deshecho"); });
    } catch (e) { avisar(`No se pudo guardar: ${e.message || e}`); }
    setGuardando("");
  };
  const ordenar = (col) => setOrden((o) => ({ col, dir: o.col === col ? -o.dir : ["nombre", "grupo"].includes(col) ? 1 : -1 }));

  return (
    <section className="vg-secc" aria-label="Personas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="v-nota max-w-[760px]">
          <b>Cogidos</b> cuenta solo vacaciones (no formación ni permisos). <b>Quedarían</b> descuenta además lo pendiente de aprobar; una cancelación pendiente suma.
          {enDirecto && <> «Del año anterior» va <b>en directo</b>: lo que le queda de {d.year - 1} y baja si coge días allí.</>} Los días sueltos se corrigen en el Excel (pestaña Vacas_{d.year}).
        </p>
        <label className="relative w-[240px] max-w-full">
          <span className="sr-only">Buscar persona</span>
          <IconoBBVA nombre="filter" size={16} className="v-soft pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input className="v-inp v-con-icono" placeholder="Buscar persona…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
      </div>
      <Sincronizar post={post} onCambio={onCambio} />
      <div className="overflow-x-auto">
        <table className="vg-tabla min-w-[820px]">
          <thead><tr>{COLS.map(([k, t]) => (
            <th key={k} className={k === "grupo" ? "vg-izq" : ""} aria-sort={orden.col === k ? (orden.dir > 0 ? "ascending" : "descending") : "none"}>
              <button type="button" onClick={() => ordenar(k)}>{t}{orden.col === k ? (orden.dir > 0 ? " ↑" : " ↓") : ""}</button>
            </th>))}</tr></thead>
          <tbody>
            {filas.map((p) => (
              <tr key={p.nombre} className={p.activo ? "" : "opacity-60"}>
                <td><b>{p.corto}</b>{!p.activo && <span className="v-soft"> · de baja</span>}{!p.email && <span className="vg-pill ml-1.5" title="Sin email en el Excel: no puede pedir días desde la web">sin email</span>}</td>
                <td className="vg-izq">
                  <span className="relative inline-flex">
                    <select value={p.grupo || ""} disabled={guardando === p.nombre} aria-label={`Sede de ${p.corto}`} className="v-inp !w-auto !py-1 !pr-8"
                      onChange={(e) => cambiar("asignarGrupo", p.nombre, "grupo", e.target.value, p.grupo || "", `${p.corto} pasa a los festivos de ${e.target.value || "ninguna sede"}`)}>
                      <option value="">—</option>
                      {(d.grupos || []).map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
                    </select>
                    <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
                  </span>
                </td>
                <td>{p.anteriores < 0 ? <span className="v-neg">{p.anteriores}</span> : p.anteriores}</td>
                <td><DiasInput valor={p.dias} nombre={p.corto} deshabilitado={guardando === p.nombre} onGuardar={(n) => cambiar("ajustarDias", p.nombre, "dias", n, p.dias, `${p.corto} tiene ${n} días en ${d.year}`)} /></td>
                <td>{p.total}</td>
                <td>{p.va}</td>
                <td><b>{p.quedan < 0 ? <span className="v-neg">{p.quedan}</span> : p.quedan}</b></td>
                <td>{p.pendientesVA > 0 ? p.pendientesVA : p.pendientesVA < 0 ? `+${-p.pendientesVA} (cancela)` : <span className="v-soft">—</span>}</td>
                <td>{p.pendientesVA ? (p.quedanTrasPendientes < 0 ? <span className="v-neg">{p.quedanTrasPendientes}</span> : p.quedanTrasPendientes) : <span className="v-soft">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Sedes y festivos ── */
/** «dd/mm/aaaa» → ISO (o "" si no es una fecha válida). */
function deTextoES(t) {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(t || "");
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(y, mo - 1, d);
  return f.getFullYear() === y && f.getMonth() === mo - 1 && f.getDate() === d ? `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
}

export function SedesFestivos({ d, post, onCambio, avisar }) {
  const [ocupado, setOcupado] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState({ grupo: "", pais: "ES" });
  const [renombrar, setRenombrar] = useState({});
  const [nf, setNf] = useState({ fecha: "", nombre: "", grupos: [] });
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const hacer = async (action, body, ok) => {
    setOcupado(true);
    try { const r = await post(action, body); ok?.(r); onCambio(); } catch (e) { avisar(`No se pudo: ${e.message || e}`); }
    setOcupado(false);
  };
  const anio = String(d.year);
  const porFecha = {};
  (d.festivosTodos || []).filter((f) => f.fecha.slice(0, 4) === anio && (!filtroGrupo || f.grupo === filtroGrupo)).forEach((f) => {
    (porFecha[f.fecha] = porFecha[f.fecha] || { fecha: f.fecha, nombre: f.nombre, grupos: [] }).grupos.push(f.grupo);
  });
  const lista = Object.values(porFecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const usos = {}; (d.saldos || []).forEach((p) => { if (p.grupo) usos[p.grupo] = (usos[p.grupo] || 0) + 1; });
  const nFest = {}; (d.festivosTodos || []).forEach((f) => { if (f.fecha.slice(0, 4) === anio) nFest[f.grupo] = (nFest[f.grupo] || 0) + 1; });
  const fechaIso = deTextoES(nf.fecha);
  const quitar = (f, g) => hacer("borrarFestivo", { fecha: f.fecha, grupo: g }, () =>
    avisar(`Festivo del ${fCorta(f.fecha)} quitado de ${g}`, () => hacer("guardarFestivo", { fecha: f.fecha, nombre: f.nombre, grupos: [g] }, () => avisar("Festivo recuperado"))));

  return (
    <section className="vg-secc" aria-labelledby="vg-sedes">
      <h2 id="vg-sedes" className="text-[17px] font-bold">Sedes y festivos {anio}</h2>
      <p className="v-nota">Cada persona tiene una sede (pestaña Personas) y descansa en sus festivos. Un festivo nacional se añade a todas las sedes de España a la vez.</p>
      <ul className="vg-lista">
        {(d.grupos || []).map((g) => {
          const nombre = renombrar[g.grupo] ?? g.grupo;
          return (
            <li key={g.grupo}>
              <input value={nombre} aria-label={`Nombre de la sede ${g.grupo}`} onChange={(e) => setRenombrar({ ...renombrar, [g.grupo]: e.target.value })} className="v-inp !w-[150px] !py-1 font-bold" />
              <span className="relative inline-flex">
                <select value={g.pais} disabled={ocupado} aria-label={`País de ${g.grupo}`} onChange={(e) => hacer("guardarGrupo", { anio: d.year, grupo: g.grupo, pais: e.target.value })} className="v-inp !w-auto !py-1 !pr-8">
                  {Object.entries(PAIS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
                <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
              </span>
              <span className="v-soft flex-1 text-[13px]">{plural(usos[g.grupo] || 0, "persona", "personas")} · {plural(nFest[g.grupo] || 0, "festivo", "festivos")}</span>
              {nombre.trim() !== g.grupo && <button type="button" disabled={ocupado || !nombre.trim()} className="v-btn v-btn-l" onClick={() => hacer("guardarGrupo", { anio: d.year, grupo: nombre.trim(), pais: g.pais, anterior: g.grupo }, () => { setRenombrar({}); avisar(`Sede renombrada a ${nombre.trim()}`); })}>Renombrar</button>}
              <button type="button" disabled={ocupado} aria-label={`Borrar la sede ${g.grupo}`} className="v-btn v-btn-t" onClick={() => confirm(`¿Borrar la sede ${g.grupo} y sus festivos de ${anio}?`) && hacer("borrarGrupo", { anio: d.year, grupo: g.grupo })}><IconoBBVA nombre="delete" size={16} /></button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="v-campo w-[180px]"><span>Nueva sede</span><input value={nuevoGrupo.grupo} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, grupo: e.target.value })} placeholder="Sevilla" className="v-inp" /></label>
        <span className="relative inline-flex">
          <select value={nuevoGrupo.pais} aria-label="País de la nueva sede" onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, pais: e.target.value })} className="v-inp !w-auto !pr-8">{Object.entries(PAIS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
        </span>
        <button type="button" className="v-btn v-btn-l" disabled={ocupado || !nuevoGrupo.grupo.trim()} onClick={() => hacer("guardarGrupo", { anio: d.year, grupo: nuevoGrupo.grupo.trim(), pais: nuevoGrupo.pais }, () => { avisar(`Sede ${nuevoGrupo.grupo.trim()} creada`); setNuevoGrupo({ grupo: "", pais: "ES" }); })}><IconoBBVA nombre="add" size={16} />Añadir sede</button>
      </div>

      <div className="vg-bloque">
        <p className="vg-lbl">Añadir festivo</p>
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2">
          <label className="v-campo"><span>Fecha (dd/mm/aaaa)</span><input value={nf.fecha} inputMode="numeric" placeholder={`15/05/${anio}`} onChange={(e) => setNf({ ...nf, fecha: e.target.value })} className="v-inp" aria-invalid={!!nf.fecha && !fechaIso} /></label>
          <label className="v-campo"><span>Nombre</span><input value={nf.nombre} onChange={(e) => setNf({ ...nf, nombre: e.target.value })} placeholder="San Isidro" className="v-inp" /></label>
        </div>
        {nf.fecha && !fechaIso && <p className="v-nota">Escribe la fecha como día/mes/año, por ejemplo 15/05/{anio}.</p>}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sedes del festivo">
          {(d.grupos || []).map((g) => {
            const on = nf.grupos.includes(g.grupo);
            return <button key={g.grupo} type="button" className="v-chip" aria-pressed={on} onClick={() => setNf({ ...nf, grupos: on ? nf.grupos.filter((x) => x !== g.grupo) : [...nf.grupos, g.grupo] })}>{g.grupo}</button>;
          })}
          <button type="button" className="v-btn v-btn-t" onClick={() => setNf({ ...nf, grupos: (d.grupos || []).filter((g) => g.pais === "ES").map((g) => g.grupo) })}>Todas las de España</button>
          <button type="button" className="v-btn ml-auto" disabled={ocupado || !fechaIso || !nf.grupos.length}
            onClick={() => hacer("guardarFestivo", { fecha: fechaIso, nombre: nf.nombre.trim() || "Festivo", grupos: nf.grupos }, (r) => {
              avisar(r.ocupados?.length ? `Festivo guardado. Ojo: ese día ya tenían otro código y no se ha pisado: ${r.ocupados.join(", ")}` : `Festivo del ${fCorta(fechaIso)} añadido`);
              setNf({ fecha: "", nombre: "", grupos: nf.grupos });
            })}>
            <IconoBBVA nombre="add" size={16} />Añadir festivo
          </button>
        </div>
        <p className="v-nota">Se marca como FE en el Excel a quien sea de esas sedes (si ese día lo tiene libre).</p>
      </div>

      <div className="vg-bloque">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="vg-lbl">Festivos de {anio}</p>
          <span className="relative inline-flex">
            <select value={filtroGrupo} aria-label="Sede" onChange={(e) => setFiltroGrupo(e.target.value)} className="v-inp !w-auto !py-1 !pr-8"><option value="">Todas las sedes</option>{(d.grupos || []).map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}</select>
            <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" />
          </span>
        </div>
        {!lista.length ? <p className="v-nota">No hay festivos en {anio}.</p> : (
          <ul className="vg-lista">
            {lista.map((f) => (
              <li key={f.fecha}>
                <b className="w-[84px] tabular-nums">{fCorta(f.fecha)}</b>
                <span className="min-w-0 flex-1">{f.nombre}</span>
                {f.grupos.map((g) => (
                  <span key={g} className="vg-pill inline-flex items-center gap-1">{g}
                    <button type="button" disabled={ocupado} aria-label={`Quitar ${f.nombre} de ${g}`} className="v-btn v-btn-t !p-0.5" onClick={() => quitar(f, g)}><IconoBBVA nombre="close" size={14} /></button>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── Años ── */
export function Anios({ d, post, onHecho, avisar }) {
  const actual = new Date().getFullYear();
  const sig = actual + 1;
  const anios = d.anios || [];
  const existe = anios.includes(sig);
  const hayBase = anios.includes(actual);
  const futuros = anios.filter((a) => a > actual);
  const [confirmar, setConfirmar] = useState(false);
  const [rehacer, setRehacer] = useState({ anio: futuros[futuros.length - 1] || sig, texto: "" });
  const [estado, setEstado] = useState("");
  const crear = async (anio, rehacerlo) => {
    setEstado("…");
    try {
      const r = await post("crearAnio", { anio, rehacer: rehacerlo });
      setEstado(""); setConfirmar(false); setRehacer({ ...rehacer, texto: "" });
      onHecho(anio, `${anio} ${r.rehecho ? "rehecho desde cero" : "creado"}: ${plural(r.personas, "persona", "personas")}${r.grupos ? ` · ${plural(r.grupos, "sede copiada", "sedes copiadas")}` : ""}. Revisa sus festivos en «Sedes y festivos».`);
    } catch (e) { setEstado(""); avisar(`No se pudo: ${e.message || e}`); }
  };
  const activos = (d.saldos || []).filter((p) => p.activo).length;
  return (
    <section className="vg-secc" aria-labelledby="vg-anios">
      <h2 id="vg-anios" className="text-[17px] font-bold">Años</h2>
      <ul className="vg-lista">
        {anios.map((a) => <li key={a}><b className="w-[56px]">{a}</b><span className="flex-1">{a < actual ? "Cerrado" : a === actual ? "Año en curso" : "Creado: ya se pueden pedir días"}</span></li>)}
      </ul>
      {existe ? <p className="v-nota"><b>{sig} ya está creado.</b> {sig + 1} se podrá crear a partir de enero de {sig}.</p> : (
        <div className="vg-bloque">
          <b className="text-[15px]">Crear {sig}</b>
          <p className="v-nota">Se crea a partir de {actual}: las personas activas con su sede y sus días del año, y lo que les quede de {actual} pasa a «Del año anterior» (se actualiza solo mientras cojan días de {actual}). Se copian las sedes, sin festivos: añádelos en «Sedes y festivos». Desde ese momento el equipo puede pedir días de {sig}.</p>
          {!hayBase ? <p className="v-aviso">Hace falta {actual} para crear {sig}.</p> : confirmar ? (
            <>
              <p className="v-aviso" role="alert">¿Crear {sig} con {plural(activos, "persona activa", "personas activas")}?</p>
              <div className="flex flex-wrap gap-2"><button type="button" className="v-btn" disabled={estado === "…"} onClick={() => crear(sig, false)}>{estado === "…" ? `Creando ${sig}…` : `Sí, crear ${sig}`}</button><button type="button" className="v-btn v-btn-t" onClick={() => setConfirmar(false)}>Cancelar</button></div>
            </>
          ) : <div><button type="button" className="v-btn" onClick={() => setConfirmar(true)}><IconoBBVA nombre="add" size={16} />Crear {sig}</button></div>}
        </div>
      )}
      {futuros.length > 0 && (
        <details className="vg-peligro">
          <summary className="cursor-pointer font-bold">Rehacer un año desde cero</summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="v-nota">Borra los días apuntados en ese año y lo vuelve a crear desde el anterior. Los festivos se conservan y las solicitudes se guardan como copia. Solo para corregir un año recién creado.</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="v-campo"><span>Año</span>
                <span className="relative inline-flex"><select className="v-inp !w-auto !pr-8" value={rehacer.anio} onChange={(e) => setRehacer({ anio: Number(e.target.value), texto: "" })}>{futuros.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                  <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180" /></span></label>
              <label className="v-campo w-[200px]"><span>Escribe {rehacer.anio} para confirmar</span><input className="v-inp" inputMode="numeric" value={rehacer.texto} onChange={(e) => setRehacer({ ...rehacer, texto: e.target.value.trim() })} /></label>
              <button type="button" className="v-btn v-btn-peligro" disabled={rehacer.texto !== String(rehacer.anio) || estado === "…"} onClick={() => crear(rehacer.anio, true)}>{estado === "…" ? "Rehaciendo…" : `Rehacer ${rehacer.anio}`}</button>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
