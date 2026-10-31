"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useAuth } from "../chrome/AuthGate";
import { useLinks } from "@/lib/links";
import { EQUIPO } from "@/lib/equipos";
import { accesos, seccion, GESTION } from "@/lib/seccion";
import Baldosa, { CLASE, FOCO } from "./Baldosa";
import IconoBBVA from "@/components/iconosBBVA";

/* Portada: todos los accesos a la vista en una pantalla de portátil, en tres
   columnas por sección (colores e iconos de lib/seccion.js). Equipo con lo
   más usado en grande; Proyectos según el equipo elegido; Gestión (solo
   coordinación) o Formación en la tercera. Buscador con la tecla «/». */

/* Proyectos del equipo elegido (equipo.json → "equipos"). Pases solo existe
   en RDR. Los enlaces externos salen de public/links/links.json. */
const PROYECTOS = {
  rdr: [
    { ...accesos("proyectos")[0], grande: true },
    { label: "Planificación", desc: "Hoja de planificación del equipo", icono: "frequency", abrir: "planificacionNFQ", claves: "planning" },
    { label: "Repositorio", desc: "Copia el enlace de GitHub", icono: "folder", copiar: "githubBBVA", claves: "github código git" },
    { label: "Drive", desc: "Copia el enlace de la carpeta", icono: "cloud", copiar: "driveBBVA", claves: "documentación google" },
  ],
  "market-abuse": [
    // Hoja en el Google de BBVA: se copia el enlace (como el Drive), no se abre.
    { label: "Planificación", desc: "Copia el enlace de la hoja", icono: "frequency", copiar: "planificacionMarketAbuse", claves: "planning" },
    { label: "Drive", desc: "Copia el enlace de la documentación", icono: "cloud", copiar: "driveMarketAbuse", claves: "documentación google" },
  ],
  "comms-surveillance": [
    { label: "Planificación", desc: "Aún no disponible", icono: "frequency", pronto: true },
    { label: "Drive", desc: "Copia el enlace de la documentación", icono: "cloud", copiar: "driveCommsSurveillance", claves: "documentación google" },
  ],
};
const CLAVE_EQUIPO_HUB = "rdr_hub_equipo";

function Seccion({ id, sec, titulo, extra, children }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex min-h-[30px] items-center gap-2.5">
        <h2 id={id} className={`hub-etiqueta ${CLASE[sec]} rounded-md px-2.5 py-[7px] text-[13px] font-bold uppercase leading-none tracking-[0.05em]`}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const normal = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const empiezaPalabra = (texto, t) => texto.split(/[^a-z0-9ñ]+/).some((w) => w.startsWith(t));

/* Relevancia: nombre exacto, empieza por, alguna palabra del nombre empieza
   por, el nombre contiene, y por último la descripción o las palabras clave.
   Entre nombres que empiezan igual, primero el más corto («Gestión» antes que
   «Gestión de equipo»). */
function puntua(x, t) {
  const n = normal(x.label);
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  if (empiezaPalabra(n, t)) return 2;
  if (n.includes(t)) return 3;
  const resto = normal(`${x.desc} ${x.claves || ""} ${x.nombre}`);
  if (empiezaPalabra(resto, t)) return 4;
  return resto.includes(t) ? 5 : null;
}

const PISTA = { copiar: "Copia el enlace", abrir: "Otra pestaña" };

/* Buscador (tecla «/»): todo lo que hay en la portada, también lo que copia o
   abre fuera. Flechas para elegir, Enter para ir (o copiar / abrir), Esc o un
   clic fuera para cerrar. */
function Buscador({ isCoordinador, proyectos }) {
  const router = useRouter();
  const { getUrl, copyLink } = useLinks();
  const caja = useRef(null);
  const campo = useRef(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [foco, setFoco] = useState(false);
  const indice = useMemo(() => {
    const de = (id, lista) => lista.filter((a) => !a.pronto).map((a) => ({ ...a, sec: id, nombre: seccion(id).nombre }));
    return [
      ...de("equipo", accesos("equipo")),
      ...de("proyectos", proyectos),
      ...de("formacion", accesos("formacion")),
      ...(isCoordinador ? [...de("gestion", accesos("gestion")), ...de("gestion", [GESTION])] : []),
    ];
  }, [isCoordinador, proyectos]);
  const t = normal(q.trim());
  const hits = t
    ? indice.map((x, i) => ({ x, i, p: puntua(x, t) })).filter((h) => h.p !== null).sort((a, b) => a.p - b.p || (a.p <= 2 ? a.x.label.length - b.x.label.length : 0) || a.i - b.i).map((h) => h.x)
    : [];
  const visible = abierto && !!t;
  const actual = Math.min(sel, hits.length - 1);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || /input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      campo.current?.focus();
    };
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", fuera);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", fuera); };
  }, []);

  const activar = (x) => {
    setAbierto(false);
    if (x.ruta) return router.push(x.ruta);
    if (x.copiar) return copyLink(x.copiar);
    const url = getUrl(x.abrir);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") { setQ(""); setAbierto(false); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAbierto(true); setSel((s) => (s + 1) % hits.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setAbierto(true); setSel((s) => (s - 1 + hits.length) % hits.length); }
    if (e.key === "Enter" && visible) { e.preventDefault(); activar(hits[actual]); }
  };

  return (
    <div ref={caja} role="search" className="relative w-full sm:w-[440px]">
      <label htmlFor="hub-buscar" className="sr-only">Buscar en el hub</label>
      <input
        ref={campo} id="hub-buscar" type="search" autoComplete="off" placeholder="Buscar en el hub"
        value={q} onChange={(e) => { setQ(e.target.value); setSel(0); setAbierto(true); }} onKeyDown={onKeyDown}
        onFocus={() => { setFoco(true); setAbierto(true); }} onBlur={() => setFoco(false)}
        role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls="hub-resultados"
        aria-activedescendant={visible && hits.length ? `hub-res-${actual}` : undefined}
        className="h-[42px] w-full rounded-full border-[1.5px] border-sand/50 bg-midnight pl-5 pr-12 text-[15px] text-sand placeholder:text-serene focus-visible:border-serene focus-visible:outline-none"
      />
      {!foco && !q && <kbd aria-hidden className="pointer-events-none absolute right-3.5 top-2.5 rounded border border-sand/40 px-1.5 font-sans text-xs font-bold leading-5 text-serene">/</kbd>}
      {visible && (
        <ul id="hub-resultados" role="listbox" aria-label="Resultados" className="absolute inset-x-0 top-[calc(100%+8px)] z-30 rounded-xl border border-white/25 bg-midnight p-1.5 shadow-[0_18px_40px_-16px_rgb(0_5_25/0.6)]">
          {hits.length ? hits.map((x, i) => {
            const cls = `flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sand ${CLASE[x.sec]} ${i === actual ? "hub-sel" : ""}`;
            const fila = (
              <>
                <span aria-hidden className={`hub-placa ${CLASE[x.sec]} h-2.5 w-2.5 shrink-0 rounded-full`} />
                <span className="min-w-0 flex-1 truncate">{x.label}</span>
                <small className="shrink-0 text-xs text-sand/75">{PISTA[x.copiar ? "copiar" : x.abrir ? "abrir" : ""] || x.nombre}</small>
              </>
            );
            return (
              <li key={`${x.sec}-${x.label}`} id={`hub-res-${i}`} role="option" aria-selected={i === actual} onMouseEnter={() => setSel(i)}>
                {x.ruta
                  ? <Link href={x.ruta} tabIndex={-1} onClick={() => setAbierto(false)} className={cls}>{fila}</Link>
                  : <button type="button" tabIndex={-1} onClick={() => activar(x)} className={cls}>{fila}</button>}
              </li>
            );
          }) : <li role="option" aria-selected="false" aria-disabled="true" className="px-2.5 py-2 text-sand/75">Nada con «{q}». Prueba con vacaciones, guardias o drive.</li>}
        </ul>
      )}
    </div>
  );
}

const saludo = () => {
  const h = new Date().getHours();
  return h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
};

export default function BentoHub() {
  const { nombre, isCoordinador, equipos } = useAuth();
  const misEquipos = equipos && equipos.length ? equipos : ["rdr"];
  const [equipo, setEquipo] = useState(misEquipos[0]);
  const [hola, setHola] = useState("Hola");
  useEffect(() => setHola(saludo()), []);
  useEffect(() => {
    let guardado = null;
    try { guardado = localStorage.getItem(CLAVE_EQUIPO_HUB); } catch {}
    setEquipo(misEquipos.includes(guardado) ? guardado : misEquipos[0]);
  }, [misEquipos.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const cambiarEquipo = (id) => { setEquipo(id); try { localStorage.setItem(CLAVE_EQUIPO_HUB, id); } catch {} };
  const equipoActual = misEquipos.includes(equipo) ? equipo : misEquipos[0];

  const eq = accesos("equipo");
  const columnaEquipo = (
    <Seccion id="hub-equipo" sec="equipo" titulo="Equipo">
      {eq.slice(0, 3).map((it) => <Baldosa key={it.ruta} item={it} sec="equipo" grande />)}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {eq.slice(3).map((it) => <Baldosa key={it.ruta} item={it} sec="equipo" suave arriba />)}
      </div>
    </Seccion>
  );
  const columnaProyectos = (
    <Seccion
      id="hub-proyectos" sec="proyectos" titulo="Proyectos"
      extra={misEquipos.length > 1 ? (
        <>
          <label htmlFor="hub-equipo-proyectos" className="sr-only">Equipo del proyecto</label>
          <span className="relative inline-flex">
            <select
              id="hub-equipo-proyectos" value={equipoActual} onChange={(e) => cambiarEquipo(e.target.value)}
              className={`hub-chip hub-pr cursor-pointer appearance-none rounded-full py-[5px] pl-3 pr-8 text-[13px] font-bold leading-none text-sand ${FOCO}`}
            >
              {misEquipos.map((id) => <option key={id} value={id}>{EQUIPO[id].nombre}</option>)}
            </select>
            <IconoBBVA nombre="fold" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-180 text-sand" />
          </span>
        </>
      ) : <span className="text-sm font-bold text-sand">{EQUIPO[equipoActual].nombre}</span>}
    >
      {(PROYECTOS[equipoActual] || []).map((it) => (
        <Baldosa key={it.label} item={it} sec="proyectos" grande={it.grande} suave={!it.grande} />
      ))}
    </Seccion>
  );
  const columnaFormacion = (
    <Seccion id="hub-formacion" sec="formacion" titulo="Formación">
      {accesos("formacion").map((it) => <Baldosa key={it.ruta} item={it} sec="formacion" />)}
    </Seccion>
  );
  // En dos grupos, como /gestion: solicitudes y horas del equipo; negocio y personas.
  const ge = accesos("gestion");
  const columnaGestion = (
    <Seccion id="hub-gestion" sec="gestion" titulo="Gestión">
      {ge.slice(0, 3).map((it) => <Baldosa key={it.ruta} item={it} sec="gestion" suave />)}
      <div aria-hidden className="h-1" />
      {ge.slice(3).map((it) => <Baldosa key={it.ruta} item={it} sec="gestion" suave />)}
    </Seccion>
  );

  return (
    <main className="mx-auto w-full max-w-[1376px] px-4 pb-4 pt-[calc(var(--cabecera)+1rem)] sm:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="text-balance font-display text-[clamp(24px,2.2vw,30px)] font-bold tracking-[-0.015em] text-sand">
          {hola}{nombre ? `, ${nombre}` : ""}
        </h1>
        <Buscador isCoordinador={isCoordinador} proyectos={PROYECTOS[equipoActual] || []} />
      </div>
      {/* Coordinación: Formación baja bajo Proyectos y Gestión ocupa la tercera columna. */}
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
        {columnaEquipo}
        {isCoordinador ? (
          <div className="flex min-w-0 flex-col gap-4">{columnaProyectos}{columnaFormacion}</div>
        ) : columnaProyectos}
        {isCoordinador ? columnaGestion : columnaFormacion}
      </div>
    </main>
  );
}
