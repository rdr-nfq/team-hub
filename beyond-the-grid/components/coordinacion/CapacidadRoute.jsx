"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { esActivo } from "@/lib/equipos";
import { useSnapshot } from "./datos";
import { num, h, curQ, horasQPersona, qsDisponibles, bloqueParaQ, colEjecucion, normQ } from "./model";
import { GLASS, FIELD, TEXT, Kpi, EmptyCard, PanelSkeleton, Bar, CargandoExcel } from "./ui";
import { BarList, Donut } from "./charts";
import { IconUsers, IconPlus, IconX, IconAlert } from "./icons";

/* Capacidad del equipo · Coordinación.
   Sustituye a la pestaña "9) Capacidad" del Excel: lee del snapshot los
   proyectos en ejecución del Q (2) Ejecución Real) y las personas con
   dedicación (3) Control Económico → horas disponibles por persona en el Q),
   y gestiona aquí las asignaciones Persona–Proyecto–%:
     · una persona no puede sumar más del 100 % entre proyectos (se marca);
     · cobertura del proyecto = Σ horasQ(persona) × % vs horas a ejecutar.
   Las asignaciones se guardan en la hoja propia "Capacidad_Web" del Excel vía
   backend (acción guardarCapacidadWeb) — la pestaña antigua no se toca. */

const SAVE_MS = 900;
// Persona sin horas informadas en Control Económico: estimación de Q completo.
const HORAS_Q_ESTIMADAS = 450;
// Desde este Q, TODA la capacidad se gestiona en la web: la pestaña
// "9) Capacidad" del Excel deja de ser referencia (aunque alguien la rellene).
// Los Qs anteriores son copia fiel de la pestaña.
const PRIMER_Q_WEB = "2026Q4";

// Estado de una persona según su carga asignada (Σ % en proyectos).
const cargaCol = (v) => (v > 100 ? "mandarin" : v >= 60 ? "lime" : "serene");
const cargaHex = (v) => (v > 100 ? PALETTE.mandarin : v >= 60 ? PALETTE.lime : PALETTE.serene);
// Cobertura de un proyecto.
const cobCol = (v) => (v >= 0.95 && v <= 1.15 ? "lime" : v > 1.15 ? "serene" : "mandarin");

/* ── Matching de nombres ──
   PERSONAS: el Excel usa "Apellido, Nombre" y la web "Nombre Apellido";
   se comparan por tokens sin tildes ("Stella, Laura" ≡ "Laura Stella").
   PROYECTOS: varias OFERTAS pueden pertenecer al mismo proyecto real
   ("Migración Midas 26Q3" ≡ "Migración Midas"); se comparan sin sufijos de Q
   y por contención. */
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tokensDe = (s) => fold(s).split(/[^a-zñ]+/).filter((t) => t.length > 2);
const mismaPersona = (a, b) => {
  const A = tokensDe(a), B = tokensDe(b);
  if (!A.length || !B.length) return false;
  return A.every((t) => B.includes(t)) || B.every((t) => A.includes(t));
};
const foldProy = (s) =>
  fold(s).replace(/\b(20)?\d{2}[_\s]?q[1-4]\b/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim();
const mismoProyecto = (a, b) => {
  const A = foldProy(a), B = foldProy(b);
  return !!A && !!B && (A === B || A.includes(B) || B.includes(A));
};

/* Etiquetas cortas para la gráfica: solo el NOMBRE de pila; si dos personas
   comparten nombre, se añade la inicial del primer apellido ("Laura S.").
   Formatos: "Apellidos, Nombre" (Excel) y "Nombre Apellidos" (equipo.json). */
const partesNombre = (n) => {
  const s = String(n || "").trim();
  const coma = s.indexOf(",");
  if (coma >= 0) return { pila: s.slice(coma + 1).trim(), apellido: s.slice(0, coma).trim() };
  const t = s.split(/\s+/);
  return { pila: t[0] || s, apellido: t.slice(1).join(" ") };
};
const etiquetasCortas = (nombres) => {
  const partes = nombres.map(partesNombre);
  const out = new Map();
  nombres.forEach((n, i) => {
    const { pila, apellido } = partes[i];
    const repetido = partes.some((x, j) => j !== i && fold(x.pila) === fold(pila));
    out.set(n, repetido && apellido ? `${pila} ${apellido[0].toUpperCase()}.` : pila);
  });
  return out;
};

/* Asignaciones importadas de la pestaña "9) Capacidad": roles (responsable/
   ejecutor/apoyo) sumados por persona y proyecto; % en fracción → %. */
const importDesdePestana = (capBloque) => {
  const imp = [];
  (capBloque?.proyectos || []).forEach((pr) => {
    (pr.asignaciones || []).forEach((a) => {
      if (!a.persona) return;
      const pct = Math.round(num(a.pct) * 100);
      const ex = imp.find((x) => x.proyecto === pr.nombre && x.persona === String(a.persona));
      if (ex) ex.pct += pct;
      else imp.push({ proyecto: String(pr.nombre), persona: String(a.persona), pct });
    });
  });
  return imp;
};

export default function CapacidadRoute() {
  const { snap, cargando, post } = useSnapshot();
  const data = snap?.data;

  /* ---------- Q (incluye FUTUROS con iniciativas/ejecución) ---------- */
  const qs = useMemo(() => qsDisponibles(data), [data]);
  const [q, setQ] = useState(null);
  useEffect(() => {
    if (!qs.length || q) return;
    setQ(qs.includes(curQ()) ? curQ() : qs[qs.length - 1]);
  }, [qs, q]);

  /* ---------- asignaciones (persistidas en Capacidad_Web) ---------- */
  const [asigs, setAsigs] = useState(null); // [{proyecto, persona, pct}]
  const [saveState, setSaveState] = useState("ok"); // ok | saving | error | demo
  const saveTimer = useRef();
  const seededQ = useRef(null);
  const touched = useRef(false); // el usuario ya ha editado asignaciones en este Q

  /* ---------- personas del Q (solo lectura del Excel) ----------
     TODAS las del bloque de Control Económico: horas del Q = imputadas
     reales si las hay, si no teóricas×dedicación−ausencias, y si el Excel
     no informa nada, una estimación de Q completo (marcada como estimada).
     Se pueden añadir más a mano (quedan persistidas vía sus asignaciones). */
  const [extra, setExtra] = useState([]); // nombres añadidos a mano en esta sesión
  // Plantilla completa del equipo (equipo/equipo.json de la web): garantiza
  // que TODOS salgan aunque no tengan fila en el Control Económico.
  const [equipoWeb, setEquipoWeb] = useState([]);
  useEffect(() => {
    fetch("/team-hub/equipo/equipo.json")
      .then((r) => r.json())
      .then((d) => setEquipoWeb((d.team || []).filter(esActivo).map((p) => String(p.nombre || "")).filter(Boolean)))
      .catch(() => {});
  }, []);

  const personas = useMemo(() => {
    const bloque = bloqueParaQ(data, q);
    const base = (bloque?.personas || []).map((p) => {
      const imp = (p.horasImputadas || []).reduce((a, v) => a + num(v), 0);
      const teo = horasQPersona(p);
      const horasQ = Math.round(imp > 0 ? imp : teo);
      return {
        nombre: p.nombre, equipo: p.equipo,
        horasQ: horasQ > 0 ? horasQ : HORAS_Q_ESTIMADAS,
        estimada: horasQ <= 0,
      };
    });
    // Equipo web + asignaciones guardadas + altas a mano que no casen (por
    // tokens de nombre) con nadie del Excel: entran con horas estimadas.
    const candidatos = [...equipoWeb, ...(asigs || []).map((a) => a.persona), ...extra];
    const extras = [];
    candidatos.forEach((n) => {
      if (!n) return;
      if (base.some((p) => mismaPersona(p.nombre, n))) return;
      if (extras.some((p) => mismaPersona(p.nombre, n))) return;
      extras.push({ nombre: n, equipo: "", horasQ: HORAS_Q_ESTIMADAS, estimada: true });
    });
    return [...base, ...extras];
  }, [data, q, asigs, extra, equipoWeb]);

  /* Bloque del Q en la pestaña "9) Capacidad" del Excel. Solo cuenta para Qs
     ANTERIORES a PRIMER_Q_WEB: esos son "legado" y la web los representa
     fielmente (proyectos, horas y capacidades de la pestaña mandan, aunque no
     cuadren con Ejecución Real). De PRIMER_Q_WEB en adelante la pestaña se
     ignora y todo se construye/gestiona en la web. */
  const capBloque = useMemo(
    () =>
      q && q < PRIMER_Q_WEB
        ? (data?.capacidad?.bloques || []).find((b) => normQ(b.q) === q) || null
        : null,
    [data, q]
  );

  /* Proyectos del Q.
     · Q LEGADO (con bloque en la pestaña): los proyectos de la pestaña tal
       cual, con sus horas y su cobertura calculadas por el propio Excel.
     · Q FUTURO (sin bloque): se construyen desde Ejecución Real, AGRUPANDO las
       ofertas que pertenecen al mismo proyecto real (sin sufijos de Q). */
  const proyectos = useMemo(() => {
    if (capBloque) {
      return (capBloque.proyectos || [])
        .map((pr) => {
          let cob = num(pr.cobertura);
          if (cob > 3) cob /= 100; // por si la celda viene en % entero
          return { nombre: String(pr.nombre || "").trim(), horas: num(pr.horas), coberturaExcel: cob, ofertas: [] };
        })
        .filter((g) => g.nombre && g.horas > 0);
    }
    const grupos = [];
    const qc = colEjecucion(data, q);
    (data?.ejecucion?.records || [])
      .filter((r) => num(r.data?.[qc]) > 0)
      .forEach((r) => {
        const nombre = String(r.data.Proyecto || r.data.proyecto || "Proyecto");
        const horas = num(r.data[qc]);
        const g = grupos.find((x) => mismoProyecto(x.nombre, nombre));
        if (g) { g.horas += horas; g.ofertas.push({ nombre, horas }); }
        else grupos.push({ nombre, horas, ofertas: [{ nombre, horas }] });
      });
    return grupos.filter((g) => g.horas > 0);
  }, [data, q, capBloque]);

  const [importado, setImportado] = useState(false);
  useEffect(() => {
    if (!data || !q) return;
    // La siembra se repite cuando el snapshot FRESCO sustituye al cacheado
    // (sessionStorage), pero nunca pisando cambios ya hechos por el usuario.
    const key = q + (snap?.cached ? "|cache" : "|fresh");
    if (seededQ.current === key) return;
    if (touched.current && String(seededQ.current || "").split("|")[0] === q) {
      seededQ.current = key;
      return;
    }
    seededQ.current = key;
    const web = (data.capacidadWeb || [])
      .filter((a) => normQ(a.q) === q)
      .map((a) => ({ proyecto: a.proyecto, persona: a.persona, pct: num(a.pct) }));
    if (web.length) {
      setAsigs(web);
      setImportado(false);
    } else {
      // Sin datos web para este Q: si es LEGADO (anterior a PRIMER_Q_WEB),
      // importa las asignaciones de la pestaña "9) Capacidad" y entra en modo
      // copia fiel; desde PRIMER_Q_WEB se empieza en blanco (solo web).
      const bloqueCap = q < PRIMER_Q_WEB
        ? (data.capacidad?.bloques || []).find((b) => normQ(b.q) === q)
        : null;
      setAsigs(importDesdePestana(bloqueCap));
      setImportado(!!bloqueCap);
    }
    setSaveState(snap?.demo ? "demo" : "ok");
  }, [data, q, snap]);

  const persist = useCallback(
    (next) => {
      touched.current = true;
      setAsigs(next);
      setImportado(false);
      clearTimeout(saveTimer.current);
      if (snap?.demo) { setSaveState("demo"); return; }
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          await post("guardarCapacidadWeb", { q, asignaciones: next.filter((a) => a.persona && a.proyecto) });
          setSaveState("ok");
        } catch {
          setSaveState("error");
        }
      }, SAVE_MS);
    },
    [post, q, snap]
  );

  /* Vuelve a la copia fiel de la pestaña del Excel: descarta la versión web
     guardada de este Q (borra sus filas de Capacidad_Web) y re-importa. */
  const restaurar = async () => {
    if (!capBloque) return;
    clearTimeout(saveTimer.current);
    touched.current = false;
    setAsigs(importDesdePestana(capBloque));
    setImportado(true);
    if (snap?.demo) { setSaveState("demo"); return; }
    try {
      setSaveState("saving");
      await post("guardarCapacidadWeb", { q, asignaciones: [] });
      setSaveState("ok");
    } catch {
      setSaveState("error");
    }
  };

  const setPct = (proyecto, persona, pct) =>
    persist(asigs.map((a) => (a.proyecto === proyecto && a.persona === persona ? { ...a, pct } : a)));
  const addAsig = (proyecto, persona) => {
    if (!persona || asigs.some((a) => a.proyecto === proyecto && a.persona === persona)) return;
    persist([...asigs, { proyecto, persona, pct: 10 }]);
  };
  const delAsig = (proyecto, persona) => persist(asigs.filter((a) => !(a.proyecto === proyecto && a.persona === persona)));

  /* ---------- derivados ----------
     Los nombres guardados (persona/proyecto) se resuelven a su forma canónica
     por matching, para que asignaciones antiguas o importadas sigan contando. */
  const der = useMemo(() => {
    if (!asigs) return null;
    const canonPersona = (n) =>
      (personas.find((p) => p.nombre === n) || personas.find((p) => mismaPersona(p.nombre, n)))?.nombre || n;
    const canonProy = (n) =>
      (proyectos.find((p) => p.nombre === n) || proyectos.find((p) => mismoProyecto(p.nombre, n)))?.nombre || n;
    const horasDe = Object.fromEntries(personas.map((p) => [p.nombre, p.horasQ]));
    // COPIA FIEL: Q legado sin versión web guardada -> capacidad por persona y
    // cobertura por proyecto son las que calcula el PROPIO Excel en la pestaña
    // (aunque no cuadren con lo derivado de las asignaciones). Al primer
    // cambio del usuario se pasa al cálculo propio de la web.
    const fiel = !!capBloque && importado;
    const capsExcel = fiel
      ? (capBloque.capacidadPersona || []).map((cp) => {
          let pct = num(cp.capacidad);
          if (Math.abs(pct) <= 3) pct *= 100; // 1,01 -> 101 %
          return { persona: String(cp.persona || ""), pct: Math.round(pct) };
        })
      : [];
    const capExcelDe = (nombre) => capsExcel.find((c) => mismaPersona(c.persona, nombre))?.pct;
    const carga = {}; // persona (canónica) → Σ pct
    asigs.forEach((a) => {
      const cp = canonPersona(a.persona);
      carga[cp] = (carga[cp] || 0) + num(a.pct);
    });
    const proys = proyectos.map((pr) => {
      const del = asigs.filter((a) => canonProy(a.proyecto) === pr.nombre);
      let horasAsig = del.reduce((acc, a) => acc + ((horasDe[canonPersona(a.persona)] || 0) * num(a.pct)) / 100, 0);
      let cobertura = pr.horas > 0 ? horasAsig / pr.horas : 0;
      if (fiel && pr.coberturaExcel != null && pr.coberturaExcel !== 0) {
        cobertura = pr.coberturaExcel;
        horasAsig = cobertura * pr.horas;
      }
      return { ...pr, asigs: del, horasAsig, cobertura };
    });
    const pers = personas.map((p) => {
      const excel = fiel ? capExcelDe(p.nombre) : undefined;
      return { ...p, carga: excel != null ? excel : carga[p.nombre] || 0 };
    });
    return {
      proys,
      pers,
      sobrecargadas: pers.filter((p) => p.carga > 100),
      infra: pers.filter((p) => p.carga < 60),
      sinCubrir: proys.filter((p) => p.cobertura < 0.95),
      horasSinAsignar: proys.reduce((a, p) => a + Math.max(0, p.horas - p.horasAsig), 0),
    };
  }, [asigs, personas, proyectos, capBloque, importado]);

  const saveTxt = {
    ok: ["text-lime", "Guardado"],
    saving: ["text-canary", "Guardando…"],
    error: ["text-mandarin", "Error al guardar — reintenta con cualquier cambio"],
    demo: ["text-canary", "Modo demo: los cambios no se guardan"],
  }[saveState];

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.purple }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-purple/80">Coordinación</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              <IconUsers size={34} className="text-purple" /> Capacidad del equipo
            </h1>
          </div>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Asigna personas a los proyectos del Q con su % de dedicación y comprueba coberturas y cargas.
            Se guarda automáticamente para todo el equipo.
          </p>
          {snap?.demo && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> Modo demo ({snap.error}) — datos de ejemplo, sin guardado.
            </p>
          )}
          {snap && !snap.demo && snap.error && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> No se pudo actualizar desde el Excel ({snap.error}) — mostrando la última copia cargada.
            </p>
          )}
          {snap && !snap.demo && data?.libro && (
            <p className="mt-2 text-[11px] text-sand/45">
              Datos de{" "}
              <a href={data.libro.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-sand/75">
                {data.libro.nombre}
              </a>
              {data.generadoEn
                ? ` · snapshot de las ${new Date(data.generadoEn).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          )}
        </header>

        {(cargando || !snap) && <CargandoExcel actualizando={!!der} />}
        {!snap || !der ? (
          <PanelSkeleton />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-sand/60">
                Trimestre
                <select
                  value={q || ""}
                  onChange={(e) => { seededQ.current = null; touched.current = false; setQ(e.target.value); }}
                  className={`${FIELD} !py-2 font-bold`}
                >
                  {qs.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              {capBloque && !importado && (
                <button
                  type="button"
                  onClick={restaurar}
                  title="Descarta la versión web de este Q y vuelve a los números de la pestaña 9) Capacidad"
                  className="rounded-full border border-white/15 bg-white/[0.055] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-sand/75 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                >
                  Restaurar copia del Excel
                </button>
              )}
              <span aria-live="polite" className={`ml-auto text-[11px] font-bold ${saveTxt[0]}`}>
                {importado
                  ? "Copia fiel de la pestaña 9) Capacidad (números del Excel) · con tu primer cambio pasa a calcularse en la web"
                  : saveTxt[1]}
              </span>
            </div>

            {/* KPIs resumen */}
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label="Proyectos sin cubrir" value={`${der.sinCubrir.length} / ${der.proys.length}`} accent={der.sinCubrir.length ? "mandarin" : "lime"} />
              <Kpi label="Horas sin asignar" value={h(der.horasSinAsignar)} accent={der.horasSinAsignar > 0 ? "canary" : "lime"} />
              <Kpi label="Personas sobrecargadas" value={der.sobrecargadas.length} accent={der.sobrecargadas.length ? "mandarin" : "lime"} />
              <Kpi label="Personas por debajo del 60%" value={der.infra.length} accent={der.infra.length ? "canary" : "lime"} />
            </div>

            {/* Resumen gráfico: barras de capacidad por persona + donut de cobertura */}
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <section className={`${GLASS} p-4`} aria-label="Gráfica de capacidad de personas">
                <h2 className="mb-3 font-display text-base font-bold text-sand">Capacidad de personas</h2>
                {(() => {
                  const cortas = etiquetasCortas(der.pers.map((p) => p.nombre));
                  return (
                    <BarList
                      labelWidth={86}
                      items={der.pers
                        .slice()
                        .sort((a, b) => b.carga - a.carga)
                        .map((p) => ({
                          label: cortas.get(p.nombre), value: p.carga,
                          hex: cargaHex(p.carga), title: `${p.nombre} · ${p.carga}% de ${h(p.horasQ)}`,
                        }))}
                    />
                  );
                })()}
              </section>
              <section className={`${GLASS} p-4`} aria-label="Gráfica de cobertura de proyectos">
                <h2 className="mb-3 font-display text-base font-bold text-sand">Cobertura de proyectos</h2>
                <Donut
                  segments={[
                    { label: "Cubiertos (≥95%)", value: der.proys.filter((p) => p.cobertura >= 0.95).length, hex: PALETTE.lime },
                    { label: "A medias (60–95%)", value: der.proys.filter((p) => p.cobertura >= 0.6 && p.cobertura < 0.95).length, hex: PALETTE.canary },
                    { label: "Sin cubrir (<60%)", value: der.proys.filter((p) => p.cobertura < 0.6).length, hex: PALETTE.mandarin },
                  ]}
                  centro={`${der.proys.filter((p) => p.cobertura >= 0.95).length}/${der.proys.length}`}
                  sub="proyectos cubiertos"
                />
              </section>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[1.35fr_1fr]">
              {/* ── Proyectos con asignaciones ── */}
              <section className="space-y-3" aria-label="Proyectos del Q">
                {der.proys.length === 0 && <EmptyCard>No hay proyectos con horas en {q}.</EmptyCard>}
                {der.proys.map((pr) => (
                  <article key={pr.nombre} className={`${GLASS} p-4`}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="min-w-0 break-words font-display text-base font-bold text-sand">{pr.nombre}</h3>
                      <span className="text-[11px] tabular-nums text-sand/55">{h(pr.horas)} a ejecutar</span>
                    </div>
    <Bar
                      label="Cobertura"
                      v={pr.cobertura}
                      col={cobCol(pr.cobertura)}
                      fmt={`${h(pr.horasAsig)} (${Math.round(pr.cobertura * 100)}%)`}
                    />
                    {/* Ofertas que componen el proyecto (agrupadas por nombre) */}
                    {pr.ofertas.length > 1 && (
                      <p className="mt-1.5 text-[10.5px] text-sand/45">
                        {pr.ofertas.length} ofertas: {pr.ofertas.map((o) => `${o.nombre} (${h(o.horas)})`).join(" · ")}
                      </p>
                    )}
                    <ul className="mt-3 space-y-1.5">
                      {pr.asigs.map((a) => {
                        const per = der.pers.find((p) => p.nombre === a.persona) || der.pers.find((p) => mismaPersona(p.nombre, a.persona));
                        const sobre = per && per.carga > 100;
                        return (
                          <li key={a.persona} className="flex flex-wrap items-center gap-2">
                            <span className={`min-w-0 flex-1 truncate text-[12.5px] ${sobre ? "font-bold text-mandarin" : "text-sand"}`}>
                              {a.persona}
                              {sobre && <span className="ml-1 text-[10px]">({per.carga}% total ⚠)</span>}
                            </span>
                            <input
                              type="range" min="0" max="100" step="5" value={a.pct}
                              aria-label={`% de ${a.persona} en ${pr.nombre}`}
                              onChange={(e) => setPct(a.proyecto, a.persona, Number(e.target.value))}
                              className="w-28 accent-[#9694FF]"
                            />
                            <span className="w-14 text-right text-[12px] font-bold tabular-nums text-sand/80">
                              {a.pct}% <span className="text-[10px] font-normal text-sand/45">({h(((per?.horasQ || 0) * a.pct) / 100)})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => delAsig(a.proyecto, a.persona)}
                              aria-label={`Quitar a ${a.persona} de ${pr.nombre}`}
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-sand/40 transition hover:bg-white/10 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                            >
                              <IconX size={12} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-2 flex items-center gap-2">
                      <IconPlus size={12} className="shrink-0 text-sand/40" aria-hidden />
                      <select
                        value=""
                        aria-label={`Añadir persona a ${pr.nombre}`}
                        onChange={(e) => addAsig(pr.nombre, e.target.value)}
                        className={`${FIELD} !py-1 text-xs`}
                      >
                        <option value="">Añadir persona…</option>
                        {der.pers
                          .filter((p) => !pr.asigs.some((a) => a.persona === p.nombre))
                          .map((p) => (
                            <option key={p.nombre} value={p.nombre}>
                              {p.nombre} · libre {Math.max(0, 100 - p.carga)}%
                            </option>
                          ))}
                      </select>
                    </div>
                  </article>
                ))}
              </section>

              {/* ── Personas: carga asignada ── */}
              <section className={`${GLASS} sticky top-24 p-4`} aria-label="Carga por persona">
                <h2 className="mb-1 font-display text-lg font-bold text-sand">Carga por persona</h2>
                <p className="mb-3 text-[11px] text-sand/50">
                  % asignado entre todos los proyectos del Q (las horas de cada persona salen del Control Económico).
                </p>
                {der.pers.length === 0 ? (
                  <EmptyCard>No hay personas con dedicación en {q}.</EmptyCard>
                ) : (
                  <div className="space-y-3">
                    {der.pers
                      .slice()
                      .sort((a, b) => b.carga - a.carga)
                      .map((p) => (
                        <Bar
                          key={p.nombre}
                          label={p.nombre}
                          extra={`· ${h(p.horasQ)}${p.estimada ? " (estimadas)" : ""}`}
                          v={p.carga / 100}
                          col={cargaCol(p.carga)}
                          fmt={`${p.carga}%`}
                        />
                      ))}
                  </div>
                )}
                {/* Alta manual: para asignar a alguien que aún no aparece en el
                    Control Económico de este Q (entra con horas estimadas). */}
                <form
                  className="mt-4 flex gap-2 border-t border-white/[0.08] pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = e.currentTarget.elements.nombre.value.trim();
                    if (v && !personas.some((p) => p.nombre === v)) setExtra((x) => [...x, v]);
                    e.currentTarget.reset();
                  }}
                >
                  <input
                    name="nombre"
                    type="text"
                    placeholder="Añadir persona (Apellidos, Nombre)…"
                    aria-label="Añadir persona a la capacidad"
                    className={`${FIELD} min-w-0 flex-1 text-xs`}
                  />
                  <button
                    type="submit"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#9694FF] px-3 py-1.5 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    <IconPlus size={12} /> Añadir
                  </button>
                </form>
                {(der.sobrecargadas.length > 0 || der.sinCubrir.length > 0) && (
                  <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-3 text-[12px]">
                    {der.sobrecargadas.map((p) => (
                      <p key={p.nombre} className={TEXT.mandarin}>⚠ {p.nombre} está al {p.carga}% (más del 100%).</p>
                    ))}
                    {der.sinCubrir.map((p) => (
                      <p key={p.nombre} className={TEXT.canary}>
                        ◔ {p.nombre}: faltan {h(Math.max(0, p.horas - p.horasAsig))} por cubrir.
                      </p>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
