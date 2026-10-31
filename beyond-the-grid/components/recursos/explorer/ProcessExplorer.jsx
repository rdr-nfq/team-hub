"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { motion, useReducedMotion } from "framer-motion";
import { PALETTE } from "@/lib/palette";
import { activo } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import {
  C, DATA_URL, CLASIF_URL, CAJON_ID, cxColor,
  buildDataIndex, buildClasifIndex, matchProceso, matchCajon, buildHash, parseHash,
} from "./lib";
import { ExplorerActions } from "./ui";
import Sidebar from "./Sidebar";
import { ProcesoDetail, CajonDetail } from "./Details";

/* Process Explorer RDR — reestructurado alrededor del INVENTARIO: los 91
   procesos oficiales son el eje único. Se filtra por Batch/Online y por las
   8 categorías de la clasificación oficial (data/clasificacion-procesos-rdr
   .html → clasificacion-rdr.json). Toda la información técnica del dataset
   original (cadenas Control-M paso a paso, listeners online, publicaciones,
   colas) sigue disponible: agregada dentro de cada proceso, o en el cajón
   desastre si no encaja en ninguno. */

const ACCENT = PALETTE.aqua; // acento de la sección Recursos

const IconArrowLeft = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </svg>
);

const IconArrowRight = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const IconLink = (p) => (
  <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
);

const IconCheck = (p) => (
  <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/* Escapa el valor para un selector de atributo CSS. */
const cssAttr = (v) => String(v).replace(/["\\]/g, "\\$&");

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
    <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px),1fr]" aria-hidden>
      <div className="space-y-2 rounded-2xl border border-white/12 bg-white/[0.055] p-3 backdrop-blur-md">
        <div className="rdr-skel h-9 rounded-xl" />
        <div className="rdr-skel h-9 rounded-xl" />
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
      <p className="font-display text-lg font-bold text-sand">No se pudieron cargar los procesos</p>
      <p className="mt-2 text-sm text-sand/65">
        Falló la descarga del inventario (procesos-rdr-data.json / clasificacion-rdr.json). Revisa la conexión e
        inténtalo de nuevo.
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

export default function ProcessExplorer() {
  const acc = useAccentMap();
  const reduce = useReducedMotion();

  const [data, setData] = useState(null); //     procesos-rdr-data.json
  const [clasif, setClasif] = useState(null); // clasificacion-rdr.json
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  const [eje, setEje] = useState("todos"); // todos | BATCH | ONLINE
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query).trim().toLowerCase();
  const [sel, setSel] = useState(null); //     P-xxx | CAJON_ID | null
  const [openSub, setOpenSub] = useState(null); // cadena/listener/pub a desplegar (del hash)
  const [selCats, setSelCats] = useState([]); // filtro por categorías oficiales (OR)
  const [mobileDetail, setMobileDetail] = useState(false); // <lg: lista ↔ detalle apilados
  const [activeId, setActiveId] = useState(null); // resaltado de teclado en la lista
  const [copied, setCopied] = useState(false); // feedback del botón "Copiar enlace"

  const searchRef = useRef(null);
  const hashReadyRef = useRef(false); // no escribir el hash hasta restaurar el inicial

  useEffect(() => {
    let vivo = true;
    setError(false);
    setData(null);
    setClasif(null);
    Promise.all([
      fetch(DATA_URL, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
      fetch(CLASIF_URL, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))),
    ])
      .then(([d, c]) => {
        if (!vivo) return;
        setData(d);
        setClasif(c);
      })
      .catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [intento]);

  const ready = data && clasif;
  const dataIndex = useMemo(() => (data ? buildDataIndex(data) : null), [data]);
  const clasifIndex = useMemo(() => (clasif ? buildClasifIndex(clasif) : null), [clasif]);

  /* Procesos del eje activo que casan con la búsqueda (ANTES del filtro de
     categorías, para que los contadores del desplegable no colapsen). */
  const searched = useMemo(() => {
    if (!ready || !clasifIndex) return [];
    return clasif.procesos.filter(
      (p) => (eje === "todos" || p.tipo === eje) && matchProceso(p, clasifIndex.catMap[p.categoria], data, q)
    );
  }, [ready, clasif, clasifIndex, data, eje, q]);

  const catCounts = useMemo(() => {
    const c = {};
    searched.forEach((p) => { c[p.categoria] = (c[p.categoria] || 0) + 1; });
    return c;
  }, [searched]);

  /* Filtro de categorías (OR) + normalización de filas para el Sidebar. */
  const items = useMemo(() => {
    const list = selCats.length ? searched.filter((p) => selCats.includes(p.categoria)) : searched;
    return list.map((p) => ({
      id: p.id,
      badge: p.id.replace("P-", ""),
      badgeHex: p.tipo === "ONLINE" ? C.canary : C.serene,
      name: p.nombre,
      sub: `${p.tipo === "ONLINE" ? "Online" : "Batch"} · ${
        p.tipo === "ONLINE" && p.listeners.length
          ? `${p.listeners.length} listener${p.listeners.length === 1 ? "" : "s"}`
          : `${p.cadenas.length} cadena${p.cadenas.length === 1 ? "" : "s"}`
      }${p.publicacion.length ? ` · ${p.publicacion.length} publish` : ""}`,
      right: p.complejidad || "",
      rightHex: p.complejidad ? cxColor(p.complejidad) : null,
      cat: clasifIndex ? clasifIndex.catMap[p.categoria] : null,
    }));
  }, [searched, selCats, clasifIndex]);

  /* El cajón desastre aparece al final de la lista salvo que haya filtro de
     categoría activo (no pertenece a ninguna) o la búsqueda no case. */
  const cajonVisible = useMemo(
    () => !!ready && selCats.length === 0 && matchCajon(clasif.cajon, q),
    [ready, clasif, selCats, q]
  );
  const cajonCount = ready ? (clasif.cajon.eventos || []).length + (clasif.cajon.colas || []).length : 0;

  const onToggleCat = useCallback((id) => {
    setSelCats((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);
  const onClearCats = useCallback(() => setSelCats([]), []);

  /* Índice del seleccionado dentro de la lista filtrada (para prev/next). */
  const navIds = useMemo(() => {
    const ids = items.map((it) => it.id);
    if (cajonVisible) ids.push(CAJON_ID);
    return ids;
  }, [items, cajonVisible]);
  const curIdx = useMemo(() => navIds.indexOf(sel), [navIds, sel]);

  /* Escribe el hash con history.pushState SOLO ante una navegación explícita
     del usuario. La restauración desde el hash NO llama aquí → sin bucles. */
  const pushHash = useCallback((pid, sub) => {
    if (!hashReadyRef.current || typeof window === "undefined") return;
    const desired = pid ? buildHash(pid, sub) : "#";
    const current = window.location.hash || "#";
    if (current !== desired) window.history.pushState(null, "", desired);
  }, []);

  const onEje = useCallback((t) => {
    setEje(t);
    setMobileDetail(false);
    setActiveId(null);
  }, []);

  const onSelect = useCallback((id) => {
    setSel(id);
    setOpenSub(null);
    setActiveId(id);
    setMobileDetail(true);
    pushHash(id);
  }, [pushHash]);

  /* Anterior/Siguiente por la lista filtrada (botones ← → y Alt+↑/↓). */
  const goRelative = useCallback((delta) => {
    if (curIdx < 0) return;
    const ni = curIdx + delta;
    if (ni < 0 || ni >= navIds.length) return;
    onSelect(navIds[ni]);
  }, [curIdx, navIds, onSelect]);

  /* Navega a otro proceso (relacionados). Limpia filtros que lo ocultarían. */
  const onNavigate = useCallback((pid) => {
    setSelCats([]);
    setEje("todos");
    onSelect(pid);
  }, [onSelect]);

  /* Referencia cruzada clicable → rellena el buscador global. */
  const onTerm = useCallback((term) => {
    const t = String(term || "").trim();
    setQuery(t);
    setSelCats([]);
    setEje("todos");
    setMobileDetail(false);
    if (searchRef.current) searchRef.current.focus();
  }, []);

  /* Copia el enlace canónico (con el hash del proceso) al portapapeles. */
  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") return;
    const href = `${window.location.origin}${window.location.pathname}${window.location.search}${sel ? buildHash(sel, openSub) : ""}`;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard no disponible: sin feedback, no rompemos la navegación */
    }
  }, [sel, openSub]);

  const actions = useMemo(() => ({ onTerm }), [onTerm]);

  /* Lleva a la vista una fila de la lista por su id (block: "nearest"). */
  const scrollItemIntoView = useCallback((id) => {
    if (id == null || typeof document === "undefined") return;
    const list = document.getElementById("rdr-explorer-list");
    const el = list && list.querySelector(`[data-rdr-item="${cssAttr(id)}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, []);

  /* Restaura la selección desde el hash al montar y en cada hashchange
     (Atrás/Adelante). Acepta los hashes antiguos (#batch/…, #online/…,
     #publish/…, #inv/…) y los traduce al proceso dueño. */
  useEffect(() => {
    if (!ready || !clasifIndex) return;
    const apply = () => {
      const p = parseHash(window.location.hash, clasifIndex);
      if (p && (p.pid === CAJON_ID || clasifIndex.byId.has(p.pid))) {
        setSel(p.pid);
        setOpenSub(p.sub || null);
        setActiveId(p.pid);
        setMobileDetail(true);
      } else {
        setSel(null);
        setOpenSub(null);
        setActiveId(null);
        setMobileDetail(false);
      }
      hashReadyRef.current = true;
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [ready, clasifIndex]);

  /* Al cambiar la selección, lleva la fila a la vista. */
  useEffect(() => {
    if (sel == null || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => scrollItemIntoView(sel));
    return () => window.cancelAnimationFrame(raf);
  }, [sel, scrollItemIntoView]);

  /* Mantiene el resaltado de teclado dentro de la lista filtrada vigente. */
  useEffect(() => {
    if (activeId != null && activeId !== CAJON_ID && !items.some((it) => it.id === activeId)) setActiveId(null);
  }, [items, activeId]);

  /* Atajos globales: "/" enfoca el buscador; Alt+↑/↓ recorren prev/siguiente. */
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (searchRef.current) { searchRef.current.focus(); searchRef.current.select(); }
        return;
      }
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        if (sel == null) return;
        e.preventDefault();
        goRelative(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, goRelative]);

  /* Teclado dentro del buscador o la lista: ↑/↓ mueven el resaltado, Enter
     abre el resaltado (desde el buscador), Escape limpia el buscador. */
  const onListKeyDown = useCallback((e) => {
    if (e.altKey) return; // Alt+↑/↓ lo gestiona el atajo global
    const t = e.target;
    const inSearch = t === searchRef.current;
    const inList = !!(t.closest && t.closest("#rdr-explorer-list"));
    if (!inSearch && !inList) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!navIds.length) return;
      const cur = activeId != null ? navIds.indexOf(activeId) : -1;
      let ni;
      if (cur === -1) ni = e.key === "ArrowDown" ? 0 : navIds.length - 1;
      else ni = Math.max(0, Math.min(navIds.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1)));
      const nid = navIds[ni];
      setActiveId(nid);
      if (typeof window !== "undefined") window.requestAnimationFrame(() => scrollItemIntoView(nid));
    } else if (e.key === "Enter") {
      if (inSearch && activeId != null) { e.preventDefault(); onSelect(activeId); }
    } else if (e.key === "Escape") {
      if (inSearch) { e.preventDefault(); setQuery(""); setActiveId(null); }
    }
  }, [navIds, activeId, onSelect, scrollItemIntoView]);

  /* Panel de detalle. */
  let detail = null;
  const detailKey = `proc:${sel}`;
  if (ready && clasifIndex && sel != null) {
    if (sel === CAJON_ID) detail = <CajonDetail cajon={clasif.cajon} q={q} />;
    else {
      const p = clasifIndex.byId.get(sel);
      if (p)
        detail = (
          <ProcesoDetail
            p={p}
            cat={clasifIndex.catMap[p.categoria]}
            data={data}
            dataIndex={dataIndex}
            clasifIndex={clasifIndex}
            openSub={openSub}
            onNavigate={onNavigate}
            mapHref={`/team-hub/recursos/mapa/#proc/${encodeURIComponent(p.id)}`}
          />
        );
    }
  }

  const nBatch = ready ? clasif.procesos.filter((p) => p.tipo === "BATCH").length : 0;
  const nOnline = ready ? clasif.procesos.length - nBatch : 0;
  const ejeCounts = { todos: ready ? clasif.procesos.length : 0, BATCH: nBatch, ONLINE: nOnline };

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.aqua }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-cabecera sm:px-6">
        <header className="mb-8">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em]" style={{ color: acc(ACCENT) }}>
            Recursos · Biblioteca
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              Process Explorer
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {/* La antigua pestaña "Mapa" vive ahora en /recursos/mapa. */}
              <Link
                href="/recursos/mapa"
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                style={activo(PALETTE.purple)}
              >
                Mapa interactivo <span aria-hidden>→</span>
              </Link>
              <Link
                href="/recursos"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-bold uppercase tracking-wide text-sand/80 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <IconArrowLeft /> Recursos
              </Link>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Los 91 procesos del inventario RDR, clasificados por la taxonomía oficial. Cada proceso agrega sus
            cadenas Control-M paso a paso, sus listeners online y su publicación.
          </p>
          {ready && (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatPill n={clasif.procesos.length} label="procesos" />
              <StatPill n={nBatch} label="batch" />
              <StatPill n={nOnline} label="online" />
              <StatPill n={data.stats?.chains_count ?? 0} label="cadenas" />
              <StatPill n={data.stats?.publishing_count ?? 0} label="publicaciones" />
            </div>
          )}
        </header>

        {error ? (
          <ErrorState onRetry={() => setIntento((n) => n + 1)} />
        ) : !ready ? (
          <Skeleton />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,360px),1fr]">
            {/* Sidebar: en <lg se oculta cuando el detalle está abierto. */}
            <div
              onKeyDown={onListKeyDown}
              className={`${mobileDetail ? "hidden lg:block" : ""} lg:sticky lg:top-cabecera lg:h-[calc(100dvh-8rem)] [&>div]:max-h-[70dvh] lg:[&>div]:h-full lg:[&>div]:max-h-none`}
            >
              <Sidebar
                eje={eje}
                onEje={onEje}
                ejeCounts={ejeCounts}
                categorias={clasif.categorias}
                query={query}
                onQuery={setQuery}
                items={items}
                cajonVisible={cajonVisible}
                cajonCount={cajonCount}
                selectedId={sel}
                activeId={activeId}
                onSelect={onSelect}
                searchRef={searchRef}
                catCounts={catCounts}
                selCats={selCats}
                onToggleCat={onToggleCat}
                onClearCats={onClearCats}
              />
            </div>

            {/* Panel de detalle: en <lg sustituye a la lista, con botón volver. */}
            <section
              aria-label="Detalle del proceso"
              className={`${mobileDetail ? "" : "hidden lg:block"} min-w-0 rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md sm:p-6`}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMobileDetail(false)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene lg:hidden"
                >
                  <IconArrowLeft size={12} /> Volver a la lista
                </button>
                {detail && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => goRelative(-1)}
                      disabled={curIdx <= 0}
                      aria-disabled={curIdx <= 0}
                      aria-label="Proceso anterior de la lista (Alt+Flecha arriba)"
                      title="Anterior (Alt+↑)"
                      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.05] p-2 text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.05]"
                    >
                      <IconArrowLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => goRelative(1)}
                      disabled={curIdx < 0 || curIdx >= navIds.length - 1}
                      aria-disabled={curIdx < 0 || curIdx >= navIds.length - 1}
                      aria-label="Proceso siguiente de la lista (Alt+Flecha abajo)"
                      title="Siguiente (Alt+↓)"
                      className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.05] p-2 text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-white/[0.05]"
                    >
                      <IconArrowRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={copyLink}
                      aria-label="Copiar enlace a este proceso"
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-[11px] font-bold text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                    >
                      {copied ? <IconCheck /> : <IconLink />}
                      <span aria-live="polite">{copied ? "Copiado" : "Copiar enlace"}</span>
                    </button>
                  </div>
                )}
              </div>
              {detail ? (
                <ExplorerActions.Provider value={actions}>
                  <motion.div
                    key={detailKey}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {detail}
                  </motion.div>
                </ExplorerActions.Provider>
              ) : (
                <div className="grid min-h-[300px] place-items-center text-center">
                  <div>
                    <p aria-hidden className="text-3xl opacity-30">▶</p>
                    <p className="mt-2 text-sm text-sand/55">
                      Selecciona un proceso para ver sus cadenas, listeners y publicación
                    </p>
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
