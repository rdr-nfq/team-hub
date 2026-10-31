"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { useRouter } from "next/navigation";
import { useAuth } from "../chrome/AuthGate";
import { EQUIPO } from "@/lib/equipos";
import { accesos, seccion } from "@/lib/seccion";
import Baldosa, { CLASE, FOCO } from "./Baldosa";

/* Portada: todos los accesos a la vista en una pantalla de portátil, en tres
   columnas por sección (colores e iconos de lib/seccion.js). Equipo con lo
   más usado en grande; Proyectos según el equipo elegido; Gestión (solo
   coordinación) o Formación en la tercera. Buscador con la tecla «/». */

/* Proyectos del equipo elegido (equipo.json → "equipos"). Pases solo existe
   en RDR. Los enlaces externos salen de public/links/links.json. */
const PROYECTOS = {
  rdr: [
    { ...accesos("proyectos")[0], grande: true },
    { label: "Planificación", desc: "Hoja de planificación · otra pestaña", icono: "frequency", abrir: "planificacionNFQ" },
    { label: "Repositorio", desc: "Copia el enlace de GitHub", icono: "folder", copiar: "githubBBVA" },
    { label: "Drive", desc: "Copia el enlace de la carpeta", icono: "cloud", copiar: "driveBBVA" },
  ],
  "market-abuse": [
    // Hoja en el Google de BBVA: se copia el enlace (como el Drive), no se abre.
    { label: "Planificación", desc: "Copia el enlace de la hoja", icono: "frequency", copiar: "planificacionMarketAbuse" },
    { label: "Drive", desc: "Copia el enlace de la documentación", icono: "cloud", copiar: "driveMarketAbuse" },
  ],
  "comms-surveillance": [
    { label: "Planificación", desc: "Aún no disponible", icono: "frequency", pronto: true },
    { label: "Drive", desc: "Copia el enlace de la documentación", icono: "cloud", copiar: "driveCommsSurveillance" },
  ],
};
const CLAVE_EQUIPO_HUB = "rdr_hub_equipo";

function Seccion({ id, sec, titulo, extra, children }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-[30px] items-center gap-2.5">
        <h2 id={id} className={`hub-etiqueta ${CLASE[sec]} rounded-full px-3 py-[7px] text-[13px] font-bold uppercase leading-none tracking-[0.05em]`}>{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

const sinTildes = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/* Buscador: filtra las páginas del hub; flechas para elegir, Enter para ir. */
function Buscador({ isCoordinador }) {
  const router = useRouter();
  const ref = useRef(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const indice = useMemo(() => {
    const ids = ["equipo", "proyectos", "formacion"].concat(isCoordinador ? ["gestion"] : []);
    const base = ids.flatMap((id) => accesos(id).map((a) => ({ ...a, sec: id, nombre: seccion(id).nombre })));
    return isCoordinador ? base.concat({ label: "Gestión", ruta: "/gestion", sec: "gestion", nombre: "Gestión" }) : base;
  }, [isCoordinador]);
  const term = sinTildes(q.trim());
  const hits = term ? indice.filter((x) => sinTildes(x.label).includes(term)) : [];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || /input|select|textarea/i.test(e.target.tagName) || e.target.isContentEditable) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") setQ("");
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % hits.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + hits.length) % hits.length); }
    if (e.key === "Enter") { e.preventDefault(); router.push(hits[Math.min(sel, hits.length - 1)].ruta); }
  };

  return (
    <div role="search" className="relative w-full sm:w-[440px]">
      <label htmlFor="hub-buscar" className="sr-only">Buscar en el hub</label>
      <input
        ref={ref} id="hub-buscar" type="search" autoComplete="off" placeholder="Buscar en el hub"
        value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
        aria-expanded={!!term} aria-controls="hub-resultados"
        className="h-[42px] w-full rounded-full border-[1.5px] border-white/30 bg-midnight pl-5 pr-12 text-[15px] text-sand placeholder:text-serene focus-visible:border-serene focus-visible:outline-none"
      />
      <kbd aria-hidden className="pointer-events-none absolute right-3.5 top-2.5 rounded border border-white/30 px-1.5 font-sans text-xs font-bold leading-5 text-serene">/</kbd>
      {term && (
        <ul id="hub-resultados" className="absolute inset-x-0 top-[calc(100%+8px)] z-30 rounded-xl border border-white/25 bg-midnight p-1.5 shadow-[0_18px_40px_-16px_rgb(0_5_25/0.6)]">
          {hits.length ? hits.map((x, i) => (
            <li key={x.ruta}>
              <Link href={x.ruta} className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sand ${i === sel ? "bg-white/10" : "hover:bg-white/10"} ${FOCO}`}>
                <span aria-hidden className={`hub-placa ${CLASE[x.sec]} h-2.5 w-2.5 rounded-full`} />
                {x.label}
                <small className="ml-auto text-xs text-sand/70">{x.nombre}</small>
              </Link>
            </li>
          )) : <li className="px-2.5 py-2 text-sand/75">Nada con «{q}». Prueba con vacaciones, guardias o pases.</li>}
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
      <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        {eq.slice(3).map((it) => <Baldosa key={it.ruta} item={it} sec="equipo" suave />)}
      </div>
    </Seccion>
  );
  const columnaProyectos = (
    <Seccion
      id="hub-proyectos" sec="proyectos" titulo="Proyectos"
      extra={misEquipos.length > 1 ? (
        <>
          <label htmlFor="hub-equipo-proyectos" className="sr-only">Equipo</label>
          <select
            id="hub-equipo-proyectos" value={equipoActual} onChange={(e) => cambiarEquipo(e.target.value)}
            className={`rounded-lg border-[1.5px] border-white/30 bg-midnight px-2 py-1 text-sm font-bold text-sand ${FOCO}`}
          >
            {misEquipos.map((id) => <option key={id} value={id}>{EQUIPO[id].nombre}</option>)}
          </select>
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
  const columnaGestion = (
    <Seccion
      id="hub-gestion" sec="gestion" titulo="Gestión"
      extra={<Link href="/gestion" className={`ml-auto text-[13px] font-bold text-sand underline decoration-[#9694FF] decoration-2 underline-offset-[5px] hover:decoration-current ${FOCO}`}>Ver todo</Link>}
    >
      {accesos("gestion").map((it) => <Baldosa key={it.ruta} item={it} sec="gestion" suave />)}
    </Seccion>
  );

  return (
    <main className="mx-auto w-full max-w-[1376px] px-4 pb-6 pt-cabecera sm:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 className="text-balance font-display text-[clamp(24px,2.2vw,30px)] font-bold tracking-[-0.015em] text-sand">
          {hola}{nombre ? `, ${nombre}` : ""}
        </h1>
        <Buscador isCoordinador={isCoordinador} />
      </div>
      {/* Coordinación: Formación baja bajo Proyectos y Gestión ocupa la tercera columna. */}
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 lg:grid-cols-3">
        {columnaEquipo}
        {isCoordinador ? (
          <div className="flex min-w-0 flex-col gap-[22px]">{columnaProyectos}{columnaFormacion}</div>
        ) : columnaProyectos}
        {isCoordinador ? columnaGestion : columnaFormacion}
      </div>
    </main>
  );
}
