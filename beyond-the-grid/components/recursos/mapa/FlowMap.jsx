"use client";

import "@xyflow/react/dist/style.css";
import "./flow-theme.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "next-view-transitions";
import { useReducedMotion } from "framer-motion";
import { ReactFlow, Background, BackgroundVariant, Controls, MiniMap, MarkerType } from "@xyflow/react";
import { rgba, activo } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import { DATA_URL, C } from "../explorer/lib";
import { buildIndexes, buildGraph, procKey, procLabel, PROC_HEX, PROC_LABEL, buildMapHash, parseMapHash } from "./graph";
import { nodeTypes } from "./nodes";
import Selector from "./Selector";
import DetailPanel from "./DetailPanel";

/* Mapa interactivo de flujos de ejecución RDR. Sustituye a la antigua pestaña
   "Mapa" del Process Explorer: se elige un proceso (cadena batch o listener
   online), se dibuja su flujo como grafo (React Flow) y desde los nodos
   conectados con OTROS procesos se puede "viajar" manteniendo el rastro en
   migas de pan. La publicación no es un proceso: cada cadena termina en la(s)
   cola(s) destino en las que publica. Acento de la página: purple #9694FF. */

const ACCENT = PALETTE.purple;

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

/* Migas del viaje: una parada por proceso visitado; click = volver ahí. */
function Trail({ trail, onGoto, onNew }) {
  const acc = useAccentMap();
  return (
    <nav aria-label="Rastro del viaje" className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onNew}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
        style={activo(ACCENT)}
      >
        <span aria-hidden>⌕</span> Elegir proceso
      </button>
      {trail.map((p, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${procKey(p)}:${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-[10px] text-sand/40">→</span>}
            <button
              type="button"
              onClick={() => onGoto(i)}
              aria-current={last ? "step" : undefined}
              title={`${PROC_LABEL[p.kind]} · ${p.label}`}
              className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
                last
                  ? "border-white/25 bg-white/[0.1] font-bold text-sand"
                  : "border-white/12 bg-white/[0.04] text-sand/65 hover:bg-white/[0.08] hover:text-sand"
              }`}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: PROC_HEX[p.kind] }} />
              <span className="truncate">{p.label}</span>
              {!last && <span className="sr-only">(volver a esta parada)</span>}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function ErrorState({ onRetry }) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-2xl border border-white/12 bg-white/[0.055] p-8 text-center backdrop-blur-md">
      <p className="font-display text-lg font-bold text-sand">No se pudo cargar el inventario</p>
      <p className="mt-2 text-sm text-sand/65">
        Falló la descarga de procesos-rdr-data.json. Revisa la conexión e inténtalo de nuevo.
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

export default function FlowMap() {
  const acc = useAccentMap();
  const { theme } = useTheme();
  const reduce = useReducedMotion();

  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  const [trail, setTrail] = useState([]); // paradas del viaje [{kind,id,label}]
  const [selectorOpen, setSelectorOpen] = useState(true);
  const [selNode, setSelNode] = useState(null);

  useEffect(() => {
    let vivo = true;
    setError(false);
    setData(null);
    fetch(DATA_URL, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [intento]);

  const idx = useMemo(() => (data ? buildIndexes(data) : null), [data]);
  const current = trail[trail.length - 1] || null;

  /* Deep links: restaura el proceso del hash al cargar (y en Atrás/Adelante).
     Acepta #chain/…, #online/…, #publish/… y #proc/P-xxx (enlaces "Ver en el
     mapa" del Process Explorer). El rastro se reinicia en esa parada. */
  useEffect(() => {
    if (!data || !idx) return;
    const apply = () => {
      const p = parseMapHash(data, idx, window.location.hash);
      if (!p) return;
      setTrail((tr) => {
        const cur = tr[tr.length - 1];
        if (cur && cur.kind === p.kind && String(cur.id) === String(p.id)) return tr;
        return [{ ...p, label: procLabel(data, p) }];
      });
      setSelectorOpen(false);
      setSelNode(null);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [data, idx]);

  /* Mantiene el hash sincronizado con la parada actual (replaceState: viajar
     por el mapa no debe inflar el historial). */
  useEffect(() => {
    if (!data || typeof window === "undefined") return;
    const desired = current ? buildMapHash(data, current) : null;
    if (desired && desired !== "#" && (window.location.hash || "") !== desired)
      window.history.replaceState(null, "", desired);
  }, [data, current]);

  /* Viajar: añade parada al rastro y cierra paneles. */
  const follow = useCallback(
    (t) => {
      if (!data) return;
      setTrail((tr) => [...tr, { kind: t.kind, id: t.id, label: t.label || procLabel(data, t) }]);
      setSelNode(null);
    },
    [data]
  );

  const goto = useCallback((i) => {
    setTrail((tr) => tr.slice(0, i + 1));
    setSelNode(null);
  }, []);

  const pick = useCallback(
    (t) => {
      // Elegir desde el selector = viaje nuevo (rastro reiniciado).
      setTrail([{ kind: t.kind, id: t.id, label: t.label }]);
      setSelectorOpen(false);
      setSelNode(null);
    },
    []
  );

  /* Grafo del proceso actual + decoración temada de nodos y edges. */
  const graph = useMemo(
    () => (data && idx && current ? buildGraph(data, idx, current) : { nodes: [], edges: [] }),
    [data, idx, current]
  );

  const nodes = useMemo(
    () => graph.nodes.map((n) => ({ ...n, data: { ...n.data, onFollow: follow } })),
    [graph, follow]
  );

  const edges = useMemo(() => {
    const light = theme === "light";
    const seqHex = acc(C.serene);
    const travelHex = acc(ACCENT);
    const fanColor = light ? "rgba(7,14,70,0.30)" : "rgba(247,248,248,0.22)";
    return graph.edges.map((e) => {
      const kind = e.data?.kind || "seq";
      const color = kind === "seq" ? rgba(seqHex, 0.6) : kind === "travel" ? rgba(travelHex, 0.7) : fanColor;
      return {
        ...e,
        animated: kind === "seq" && !reduce,
        style: {
          stroke: color,
          strokeWidth: kind === "seq" ? 1.8 : 1.4,
          strokeDasharray: kind === "travel" ? "6 4" : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    });
  }, [graph, theme, acc, reduce]);

  const stats = data?.stats;
  const light = theme === "light";

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: ACCENT }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-8 pt-cabecera sm:px-6">
        <header className="mb-4">
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <h1 className="font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              Mapa de flujos
            </h1>
            <Link
              href="/recursos"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-xs font-bold uppercase tracking-wide text-sand/80 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            >
              <IconArrowLeft /> Recursos
            </Link>
          </div>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Viaja por el flujo de ejecución de cada proceso RDR: pasos, workflows, eventos y colas conectados entre
            sí. Los nodos con «Seguir» saltan al proceso conectado sin perder el rastro.
          </p>
          {stats && (
            <div className="mt-4 flex flex-wrap gap-2">
              <StatPill n={stats.chains_count} label="cadenas" />
              <StatPill n={stats.online_count} label="listeners" />
              <StatPill n={stats.workflows_count} label="workflows" />
              <StatPill n={stats.eventos_count} label="eventos" />
            </div>
          )}
        </header>

        {error ? (
          <ErrorState onRetry={() => setIntento((n) => n + 1)} />
        ) : (
          <>
            {data && trail.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Trail trail={trail} onGoto={goto} onNew={() => setSelectorOpen(true)} />
                {current && (
                  /* El explorador entiende este mismo hash (#chain/… etc.) y
                     lo traduce al proceso del inventario dueño del flujo. */
                  <a
                    href={`/team-hub/recursos/procesos/${buildMapHash(data, current)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-[11px] font-bold text-sand/75 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    Ficha en el explorador <span aria-hidden>→</span>
                  </a>
                )}
              </div>
            )}

            {/* Canvas: contenedor relativo — selector y detalle flotan dentro (lg+). */}
            <div className="rdr-flowmap relative min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03]">
              {!data ? (
                <div className="grid h-full min-h-[480px] place-items-center" aria-hidden>
                  <div className="w-full max-w-md space-y-3 p-8">
                    <div className="rdr-skel h-9 rounded-xl" />
                    <div className="rdr-skel h-24 rounded-xl" />
                    <div className="rdr-skel h-24 rounded-xl" />
                  </div>
                </div>
              ) : current ? (
                // absolute inset-0: ReactFlow usa height:100%, que NO resuelve
                // contra el min-height del contenedor (quedaba con alto 0).
                <div className="absolute inset-0">
                <ReactFlow
                  key={trail.map(procKey).join(">")}
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  colorMode={theme}
                  fitView
                  fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                  minZoom={0.12}
                  maxZoom={1.75}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  edgesFocusable={false}
                  zoomOnDoubleClick={false}
                  onNodeClick={(_, n) => setSelNode(n)}
                  onPaneClick={() => setSelNode(null)}
                  style={{ background: "transparent" }}
                  proOptions={{ hideAttribution: false }}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1.4}
                    color={light ? "rgba(7,14,70,0.16)" : "rgba(247,248,248,0.12)"}
                  />
                  <Controls position="bottom-left" showInteractive={false} />
                  <MiniMap
                    position="bottom-right"
                    pannable
                    zoomable
                    bgColor={light ? "#EDEFF4" : "#070E46"}
                    maskColor={light ? "rgba(7,14,70,0.10)" : "rgba(247,248,248,0.08)"}
                    nodeColor={(n) => rgba(n.data?.hex || "#85C8FF", 0.75)}
                    nodeStrokeWidth={0}
                    nodeBorderRadius={4}
                  />
                </ReactFlow>
                </div>
              ) : (
                <div className="grid h-full min-h-[480px] place-items-center p-8 text-center">
                  <div>
                    <p aria-hidden className="text-3xl opacity-30">🧭</p>
                    <p className="mt-2 text-sm text-sand/55">Elige un proceso para dibujar su flujo</p>
                  </div>
                </div>
              )}

              {data && selectorOpen && (
                <Selector
                  data={data}
                  onPick={pick}
                  onClose={current ? () => setSelectorOpen(false) : null}
                />
              )}
              {selNode && <DetailPanel node={selNode} data={data} onClose={() => setSelNode(null)} />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
