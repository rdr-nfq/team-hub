"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { rgba, solido, activo } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { EJES, CAJON_ID, CAT_SHORT } from "./lib";
import { useAcc, CatPill, optionDomId } from "./ui";

/* Sidebar del Process Explorer reestructurado: buscador + eje Batch/Online
   (con totales) + filtro por las 8 categorías oficiales (desplegable con
   chips removibles) + lista de los 91 procesos del inventario + acceso al
   cajón desastre. Los items llegan ya filtrados y normalizados desde
   ProcessExplorer ({ id, badge, name, sub, right, rightHex, cat }). */

const ACCENT = PALETTE.aqua;

const IconSearch = (p) => (
  <svg width={p.size || 15} height={p.size || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const IconFilter = (p) => (
  <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 5h18M6 12h12M10 19h4" />
  </svg>
);

const IconChevron = (p) => (
  <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconCheck = (p) => (
  <svg width={p.size || 11} height={p.size || 11} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/* Control segmentado de EJE (Todos / Batch / Online) con el nº de procesos
   de cada uno. Opción activa: superficie aqua literal con tinta midnight fija
   — como superficie sólida funciona igual en ambos temas (convención del
   repo). */
function EjeTabs({ eje, onEje, counts }) {
  return (
    <div role="tablist" aria-label="Tipo de proceso" className="grid grid-cols-3 gap-1.5">
      {EJES.map((t) => {
        const on = eje === t.id;
        const n = counts ? counts[t.id] : undefined;
        return (
          <button
            key={t.id}
            role="tab"
            id={`rdr-tab-${t.id}`}
            aria-selected={on}
            aria-controls="rdr-explorer-list"
            type="button"
            onClick={() => onEje(t.id)}
            className={`flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${
              on
                ? "border-transparent"
                : "border-white/12 bg-white/[0.04] text-sand/70 hover:bg-white/[0.07] hover:text-sand"
            }`}
            style={on ? activo(ACCENT) : undefined}
          >
            <span className="text-[12px] font-bold leading-tight">{t.label}</span>
            <span className={`text-[12px] font-bold leading-none tabular-nums ${on ? "opacity-70" : "text-sand/45"}`}>
              {n == null ? "—" : n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* Filtro por CATEGORÍA OFICIAL como desplegable (popover casero: estado +
   click-fuera + Escape). Las categorías del eje activo aparecen primero; las
   del otro eje quedan atenuadas si no tienen resultados. Multi-selección (OR)
   con chips removibles (superficie SÓLIDA del color con tinta Electric
   #001391 literal — igual en ambos temas). */
function CategoryFilter({ categorias, counts, selCats, onToggle, onClear }) {
  const acc = useAcc();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        if (btnRef.current) btnRef.current.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const n = selCats.length;
  const selected = categorias.filter((c) => selCats.includes(c.key));

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={wrapRef} className="relative">
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-left text-xs font-bold text-sand transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-sand/55"><IconFilter /></span>
            {n > 0 ? (
              <span className="truncate">
                <span className="tabular-nums" style={{ color: acc(ACCENT) }}>{n}</span>{" "}
                {n === 1 ? "categoría" : "categorías"}
              </span>
            ) : (
              <span>Categoría</span>
            )}
          </span>
          <span aria-hidden className={`shrink-0 text-sand/50 transition-transform ${open ? "rotate-180" : ""}`}>
            <IconChevron />
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              aria-label="Filtrar por categoría oficial"
              initial={reduce ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              /* Panel sólido Midnight literal (superficie sólida → igual en
                 ambos temas). Scroll propio si hace falta. */
              className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[52vh] overflow-y-auto overscroll-contain rounded-xl border border-white/15 p-1.5 shadow-2xl backdrop-blur-md"
              style={{ backgroundColor: "#070E46" }}
            >
              {n > 0 && (
                <div className="flex items-center justify-between px-1.5 pb-1.5 pt-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-sand/45">
                    <span className="tabular-nums">{n}</span> {n === 1 ? "activa" : "activas"}
                  </span>
                  <button
                    type="button"
                    onClick={onClear}
                    className="rounded text-[11px] font-bold text-sand/70 underline decoration-dotted underline-offset-2 transition hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    Limpiar
                  </button>
                </div>
              )}
              {categorias.map((c) => {
                const cn = counts[c.key] || 0;
                const on = selCats.includes(c.key);
                const muted = !on && cn === 0;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    disabled={muted}
                    onClick={() => onToggle(c.key)}
                    title={c.desc}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${
                      muted ? "cursor-default opacity-40" : "hover:bg-white/[0.07]"
                    }`}
                  >
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: solido(c.color) }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-sand">
                      {c.emoji} {c.nombre}
                    </span>
                    <span className="shrink-0 rounded bg-white/[0.07] px-1 text-[9px] font-bold uppercase text-sand/45">
                      {c.eje === "ONLINE" ? "On" : "Batch"}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold tabular-nums text-sand/45">{cn}</span>
                    <span
                      aria-hidden
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${on ? "" : "border-white/25"}`}
                      style={on ? activo(ACCENT) : undefined}
                    >
                      {on && <IconCheck />}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Categorías seleccionadas">
          {selected.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-[10.5px] font-bold"
              style={activo(c.color)}
            >
              <span className="max-w-[130px] truncate">{CAT_SHORT[c.key] || c.nombre}</span>
              <button
                type="button"
                onClick={() => onToggle(c.key)}
                aria-label={`Quitar filtro ${c.nombre}`}
                className="grid h-4 w-4 place-items-center rounded-full leading-none transition hover:bg-black/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001391]"
                style={{ color: "#001391" }}
              >
                <span aria-hidden>✕</span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemRow({ it, selected, active, onSelect }) {
  const acc = useAcc();
  const badgeHex = it.badgeHex || ACCENT;
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        id={optionDomId("proc", it.id)}
        data-rdr-item={String(it.id)}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(it.id)}
        className={`grid w-full grid-cols-[34px,1fr,auto] items-center gap-x-2.5 border-l-2 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${
          selected ? "bg-white/[0.09]" : active ? "bg-white/[0.05]" : "border-transparent hover:bg-white/[0.06]"
        } ${active && !selected ? "ring-1 ring-inset ring-serene/50" : ""}`}
        style={selected ? { borderLeftColor: acc(ACCENT) } : undefined}
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[10px] font-bold tabular-nums"
          style={{ borderColor: rgba(badgeHex, 0.5), color: acc(badgeHex), backgroundColor: rgba(badgeHex, 0.07) }}
        >
          {it.badge}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-sand">{it.name}</span>
          {it.sub && <span className="block truncate text-[10.5px] text-sand/55">{it.sub}</span>}
          {it.cat && (
            <span className="mt-1 flex items-center gap-1">
              <CatPill cat={it.cat} />
            </span>
          )}
        </span>
        <span
          className="max-w-[110px] truncate text-[10px] font-bold text-sand/50"
          style={it.rightHex ? { color: acc(it.rightHex) } : undefined}
        >
          {it.right}
        </span>
      </button>
    </li>
  );
}

export default function Sidebar({
  eje, onEje, ejeCounts, categorias, query, onQuery, items, cajonVisible, cajonCount,
  selectedId, activeId, onSelect, searchRef, catCounts, selCats, onToggleCat, onClearCats,
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md">
      <div className="flex flex-col gap-3 border-b border-white/12 p-3">
        <label className="relative block">
          <span className="sr-only">Buscar proceso, cadena, evento, JAR o workflow</span>
          <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sand/40">
            <IconSearch />
          </span>
          <input
            ref={searchRef}
            type="search"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="rdr-explorer-list"
            aria-autocomplete="list"
            aria-activedescendant={activeId != null ? optionDomId("proc", activeId) : undefined}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Buscar proceso, cadena, JAR, workflow…"
            autoComplete="off"
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] py-2.5 pl-9 pr-3 text-xs text-sand placeholder:text-sand/40 focus:border-serene/60 focus:outline-none focus:ring-2 focus:ring-serene/25"
          />
        </label>
        <EjeTabs eje={eje} onEje={onEje} counts={ejeCounts} />
        <CategoryFilter
          categorias={categorias}
          counts={catCounts || {}}
          selCats={selCats || []}
          onToggle={onToggleCat}
          onClear={onClearCats}
        />
        <p aria-live="polite" className="px-0.5 text-[10.5px] tabular-nums text-sand/50">
          {items.length} {items.length === 1 ? "proceso" : "procesos"}
        </p>
      </div>

      <div id="rdr-explorer-list" role="tabpanel" aria-labelledby={`rdr-tab-${eje}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.length === 0 && !cajonVisible ? (
          <p className="px-4 py-8 text-center text-xs text-sand/55">Sin resultados para esta búsqueda.</p>
        ) : (
          <ul role="listbox" aria-label="Procesos" className="divide-y divide-white/[0.05]">
            {items.map((it) => (
              <ItemRow key={it.id} it={it} selected={selectedId === it.id} active={activeId === it.id} onSelect={onSelect} />
            ))}
            {cajonVisible && (
              <li role="option" aria-selected={selectedId === CAJON_ID}>
                <button
                  type="button"
                  id={optionDomId("proc", CAJON_ID)}
                  data-rdr-item={CAJON_ID}
                  aria-current={selectedId === CAJON_ID ? "true" : undefined}
                  onClick={() => onSelect(CAJON_ID)}
                  className={`grid w-full grid-cols-[34px,1fr,auto] items-center gap-x-2.5 border-l-2 px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene ${
                    selectedId === CAJON_ID
                      ? "border-[#FB7185] bg-white/[0.09]"
                      : activeId === CAJON_ID
                        ? "border-transparent bg-white/[0.05] ring-1 ring-inset ring-serene/50"
                        : "border-transparent hover:bg-white/[0.06]"
                  }`}
                >
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#FB7185]/50 bg-[#FB7185]/[0.07] text-[13px]">
                    🗃️
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-sand">Cajón desastre</span>
                    <span className="block truncate text-[10.5px] text-sand/55">
                      Eventos y colas sin proceso asignado
                    </span>
                  </span>
                  <span className="text-[10px] font-bold tabular-nums text-sand/50">{cajonCount}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
