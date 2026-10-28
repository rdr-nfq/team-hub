"use client";

import { rgba, activo } from "@/lib/ui";
import { useAcc, Tag } from "@/components/recursos/explorer/ui";
import { ACCENT, FLAG_DEFS, OTHER_FEEDS } from "./lib";
import { Hl } from "./ui";

/* Sidebar del catálogo de properties: búsqueda rápida (el corazón de la
   página) + filtros combinables + lista de resultados con el motivo del
   match cuando la coincidencia no es por nombre de fichero. */

const IconSearch = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);

/* Chip de filtro: activo = superficie sólida canary literal con tinta
   Electric (convención del repo para superficies sólidas). */
function Chip({ on, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
        on ? "" : "border-white/12 bg-white/[0.04] text-sand/65 hover:bg-white/[0.08] hover:text-sand"
      }`}
      style={on ? activo(ACCENT) : undefined}
    >
      {children}
    </button>
  );
}

function Filters({ feeds, filters, onFilters }) {
  const set = (patch) => onFilters({ ...filters, ...patch });
  return (
    <div className="space-y-2">
      {/* businessFeed: los más frecuentes + "otros" (radio-toggle) */}
      <div role="group" aria-label="Filtrar por business feed" className="flex flex-wrap gap-1.5">
        {feeds.map(([f, n]) => (
          <Chip key={f} on={filters.feed === f} onClick={() => set({ feed: filters.feed === f ? null : f })}>
            {f} <span className="tabular-nums opacity-70">{n}</span>
          </Chip>
        ))}
        <Chip on={filters.feed === OTHER_FEEDS} onClick={() => set({ feed: filters.feed === OTHER_FEEDS ? null : OTHER_FEEDS })}>
          otros feeds
        </Chip>
      </div>
      {/* flags (AND) + con/sin flujo */}
      <div role="group" aria-label="Filtrar por flags y flujo" className="flex flex-wrap items-center gap-1.5">
        {FLAG_DEFS.map((f) => (
          <Chip
            key={f.k}
            on={!!filters.flags[f.k]}
            onClick={() => set({ flags: { ...filters.flags, [f.k]: !filters.flags[f.k] } })}
          >
            {f.label}
          </Chip>
        ))}
        <span aria-hidden className="mx-0.5 h-4 w-px bg-white/15" />
        <Chip on={filters.flujo === "con"} onClick={() => set({ flujo: filters.flujo === "con" ? "all" : "con" })}>
          con flujo
        </Chip>
        <Chip on={filters.flujo === "sin"} onClick={() => set({ flujo: filters.flujo === "sin" ? "all" : "sin" })}>
          sin flujo
        </Chip>
      </div>
    </div>
  );
}

function ResultRow({ r, q, selected, onSelect }) {
  const acc = useAcc();
  const p = r.item;
  const sub =
    [p.businessFeed, p.messageType].filter(Boolean).join(" · ") ||
    p.modEjecucion ||
    (p.file ? p.file.split("/").pop() : "");
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(p.id)}
        className={`w-full border-l-2 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${
          selected ? "bg-white/[0.09]" : "border-transparent hover:bg-white/[0.06]"
        }`}
        style={selected ? { borderLeftColor: acc(ACCENT) } : undefined}
      >
        <span className="grid grid-cols-[34px,1fr] items-center gap-x-2.5">
          <span
            aria-hidden
            title={p.numPasos > 0 ? `${p.numPasos} pasos` : "sin flujo"}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[10px] font-bold tabular-nums"
            style={{ borderColor: rgba(ACCENT, 0.45), color: acc(ACCENT), backgroundColor: rgba(ACCENT, 0.07) }}
          >
            {p.raw ? (p.numPasos > 0 ? p.numPasos : "·") : "∅"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-sand">
              <Hl text={p.fichero} q={q} />
            </span>
            {sub && <span className="block truncate text-[10.5px] text-sand/55">{sub}</span>}
          </span>
        </span>
        {/* Por qué matchea, cuando no es por nombre: badge + snippet resaltado */}
        {r.match?.label && (
          <span className="mt-1.5 flex min-w-0 items-center gap-1.5 pl-[calc(34px+0.625rem)]">
            <Tag hex={ACCENT} strong className="shrink-0">{r.match.label}</Tag>
            {r.match.snippet && (
              <span className="min-w-0 truncate font-mono text-[10px] text-sand/60">
                <Hl text={r.match.snippet} q={q} />
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

export default function Sidebar({ query, onQuery, q, feeds, filters, onFilters, results, selectedId, onSelect }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md">
      <div className="flex flex-col gap-2.5 border-b border-white/12 p-3">
        {/* Búsqueda rápida: grande y prominente, multi-campo (incluido raw) */}
        <label className="relative block">
          <span className="sr-only">
            Buscar por nombre de fichero, feed, message type, JARs, scripts, workflows, variables o contenido
          </span>
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sand/40">
            <IconSearch />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar proceso, workflow, JAR… o dentro del contenido"
            autoComplete="off"
            className="w-full rounded-xl border border-white/15 bg-white/[0.05] py-2.5 pl-10 pr-3 text-[13px] text-sand placeholder:text-sand/40 focus:border-serene/60 focus:outline-none focus:ring-2 focus:ring-serene/25"
          />
        </label>
        <Filters feeds={feeds} filters={filters} onFilters={onFilters} />
        <p aria-live="polite" className="px-0.5 text-[10.5px] tabular-nums text-sand/50">
          {results.length} {results.length === 1 ? "fichero" : "ficheros"}
          {q ? ` para “${query.trim()}”` : ""}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="Resultados">
        {results.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-sand/55">
            Sin resultados. Prueba con otro término o quita algún filtro.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {results.map((r) => (
              <ResultRow key={r.item.id} r={r} q={q} selected={selectedId === r.item.id} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
