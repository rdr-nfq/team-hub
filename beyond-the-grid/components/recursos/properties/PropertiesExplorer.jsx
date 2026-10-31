"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "next-view-transitions";
import { motion, useReducedMotion } from "framer-motion";
import { PALETTE } from "@/lib/palette";
import { useAccentMap } from "@/lib/theme";
import { ACCENT, DATA_URL, prepare, matchItem, computeStats, topFeeds, passesFilters } from "./lib";
import Sidebar from "./Sidebar";
import PropertyDetail from "./Detail";

/* Properties GSProcess — catálogo consultable de los 510 ficheros .properties
   de RDR. Búsqueda rápida multi-campo (nombre, feed, messageType, JARs,
   scripts, workflows, variables Y contenido raw) + filtros combinables +
   visor del fichero tal cual está escrito. Datos en
   public/recursos/properties-data.json, cargados en cliente (~960 KB). */

const IconArrowLeft = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

function StatPill({ n, label }) {
  const acc = useAccentMap();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-[11px] text-sand/70">
      <strong className="font-bold tabular-nums" style={{ color: acc(ACCENT) }}>{n}</strong>
      {label}
    </span>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px),1fr]" aria-hidden>
      <div className="space-y-2 rounded-2xl border border-white/12 bg-white/[0.055] p-3 backdrop-blur-md">
        <div className="rdr-skel h-10 rounded-xl" />
        <div className="rdr-skel h-14 rounded-xl" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rdr-skel h-12 rounded-xl" />
        ))}
      </div>
      <div className="hidden space-y-3 rounded-2xl border border-white/12 bg-white/[0.055] p-6 backdrop-blur-md lg:block">
        <div className="rdr-skel h-7 w-2/3 rounded-lg" />
        <div className="rdr-skel h-4 w-1/3 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rdr-skel h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-white/12 bg-white/[0.055] p-8 text-center backdrop-blur-md">
      <p className="font-display text-lg font-bold text-sand">No se pudo cargar el catálogo</p>
      <p className="mt-2 text-sm text-sand/65">
        Falló la descarga de los ficheros (properties-data.json). Revisa la conexión e inténtalo de nuevo.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-full border border-serene/40 bg-serene/10 px-5 py-2 text-sm font-bold text-serene transition hover:bg-serene/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
      >
        Reintentar
      </button>
    </div>
  );
}

const EMPTY_FILTERS = { feed: null, flags: {}, flujo: "all" };

export default function PropertiesExplorer() {
  const acc = useAccentMap();
  const reduce = useReducedMotion();

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sel, setSel] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false); // <lg: lista ↔ detalle apilados

  useEffect(() => {
    let vivo = true;
    setError(false);
    setData(null);
    fetch(DATA_URL, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => vivo && setData(prepare(d)))
      .catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [intento]);

  const stats = useMemo(() => (data ? computeStats(data) : null), [data]);
  const feeds = useMemo(() => (data ? topFeeds(data) : []), [data]);
  const topSet = useMemo(() => new Set(feeds.map(([f]) => f)), [feeds]);

  /* Filtros + búsqueda. Con query, los matches por nombre van primero y el
     resto ordenado por el campo donde coinciden (feed < … < contenido). */
  const results = useMemo(() => {
    if (!data) return [];
    const base = data.filter((p) => passesFilters(p, filters, topSet));
    if (!q) return base.map((item) => ({ item, match: null }));
    const out = [];
    for (const item of base) {
      const match = matchItem(item, q);
      if (match) out.push({ item, match });
    }
    out.sort((a, b) => a.match.priority - b.match.priority);
    return out;
  }, [data, q, filters, topSet]);

  const onSelect = useCallback((id) => {
    setSel(id);
    setMobileDetail(true);
  }, []);

  const selected = data && sel != null ? data[sel] : null;

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.canary }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-8">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em]" style={{ color: acc(ACCENT) }}>
            Recursos · Biblioteca
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              Properties GSProcess
            </h1>
            <Link
              href="/recursos"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-bold uppercase tracking-wide text-sand/80 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            >
              <IconArrowLeft /> Recursos
            </Link>
          </div>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Los ficheros .properties de GSProcess tal y como están escritos, con sus comentarios. Busca por nombre de
            proceso, workflow, JAR… o directamente dentro del contenido.
          </p>
          {stats && (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatPill n={stats.total} label="ficheros" />
              <StatPill n={stats.conFlujo} label="con flujo" />
              <StatPill n={stats.feeds} label="feeds distintos" />
              <StatPill n={stats.vacios} label="vacíos" />
            </div>
          )}
        </header>

        {error ? (
          <ErrorState onRetry={() => setIntento((n) => n + 1)} />
        ) : !data ? (
          <Skeleton />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,380px),1fr]">
            {/* Sidebar: en <lg se oculta cuando el detalle está abierto. */}
            <div
              className={`${mobileDetail ? "hidden lg:block" : ""} lg:sticky lg:top-cabecera lg:h-[calc(100dvh-8rem)] [&>div]:max-h-[75dvh] lg:[&>div]:h-full lg:[&>div]:max-h-none`}
            >
              <Sidebar
                query={query}
                onQuery={setQuery}
                q={q}
                feeds={feeds}
                filters={filters}
                onFilters={setFilters}
                results={results}
                selectedId={sel}
                onSelect={onSelect}
              />
            </div>

            {/* Detalle: en <lg sustituye a la lista, con botón volver. */}
            <section
              aria-label="Detalle del fichero .properties"
              className={`${mobileDetail ? "" : "hidden lg:block"} min-w-0 rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md sm:p-6`}
            >
              <button
                type="button"
                onClick={() => setMobileDetail(false)}
                className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene lg:hidden"
              >
                <IconArrowLeft size={12} /> Volver a la lista
              </button>
              {selected ? (
                <motion.div
                  key={sel}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <PropertyDetail p={selected} />
                </motion.div>
              ) : (
                <div className="grid min-h-[300px] place-items-center text-center">
                  <div>
                    <p aria-hidden className="text-3xl opacity-30">≡</p>
                    <p className="mt-2 text-sm text-sand/55">Selecciona un fichero para ver su contenido tal cual está escrito</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
