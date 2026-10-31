"use client";

import Cargando from "@/components/chrome/Cargando";

// Primitivas visuales de Coordinación (/simulador, /capacidad): tarjetas glass, chips, inputs,
// badges y tablas. Misma escala de esquinas (rounded-2xl) y glass que el hub.

/* Clases dinámicas por acento: mapas explícitos para que Tailwind las compile
   (nunca `text-${x}` construido en runtime). */
export const TEXT = {
  serene: "text-serene",
  lime: "text-lime",
  mandarin: "text-mandarin",
  canary: "text-canary",
  aqua: "text-aqua",
  purple: "text-purple",
  sand: "text-sand",
};
export const BGBAR = {
  serene: "bg-serene",
  lime: "bg-lime",
  mandarin: "bg-mandarin",
};

// Tarjeta glass base (mismo lenguaje que las tarjetas del hub).
export const GLASS =
  "rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md";

// Input/select "de formulario" (filtros y editores fuera de tablas).
export const FIELD =
  "rounded-lg border border-white/15 bg-midnight/60 px-2 py-1.5 text-sm text-sand transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";

// Input embebido en celda de tabla (transparente, como el legacy).
export const CELL =
  "bg-transparent text-sand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-serene/60 rounded";

/* ---------- KPI ---------- */
export function Kpi({ label, value, accent = "serene" }) {
  return (
    <div className={`${GLASS} p-4`}>
      <p className={`text-[11px] uppercase tracking-wider ${TEXT[accent] || TEXT.serene}`}>{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-sand">{value}</p>
    </div>
  );
}

/* ---------- chip-botón (tabs, toggles, acciones pequeñas) ---------- */
export function Chip({ on, accent = "purple", className = "", children, ...p }) {
  const onCls =
    accent === "lime"
      ? "border-lime/70 bg-lime/10 text-lime"
      : "border-purple/70 bg-purple/15 text-purple";
  return (
    <button
      type="button"
      className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider backdrop-blur-md transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
        on ? onCls : "border-white/15 bg-white/[0.055] text-sand/80 hover:border-white/30 hover:bg-white/10"
      } ${className}`}
      {...p}
    >
      {children}
    </button>
  );
}

/* ---------- badge de estado (Finalizado/En curso/Cancelado…) ---------- */
export function EstadoBadge({ v }) {
  const s = String(v || "").toLowerCase();
  let c = "sand";
  if (s.indexOf("final") >= 0) c = "lime";
  else if (s.indexOf("cancel") >= 0 || s.indexOf("rechaz") >= 0) c = "mandarin";
  else if (s.indexOf("curso") >= 0 || s.indexOf("aprob") >= 0 || s.indexOf("bolsa") >= 0) c = "serene";
  else if (s.indexOf("cobrad") >= 0) c = "lime";
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[11px] ${TEXT[c]}`}>
      {v || "—"}
    </span>
  );
}

/* ---------- input no controlado que COMMITEA en blur/Enter ----------
   Replica el evento "change" del legacy: solo dispara si el valor cambió.
   (Clave: en Modo normal cada commit escribe en el Excel; nunca por tecla.) */
export function CellInput({ value, type = "text", onCommit, className = "", ...p }) {
  return (
    <input
      type={type}
      defaultValue={value ?? ""}
      className={`${CELL} ${className}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={(e) => {
        if (e.target.value !== String(value ?? "")) onCommit(e.target.value);
      }}
      {...p}
    />
  );
}

/* ---------- celda de solo lectura con "—" apagado ---------- */
export function Ro({ v, f }) {
  if (v == null || v === "") return <span className="text-sand/25">—</span>;
  return <>{f ? f(v) : v}</>;
}

/* ---------- estados vacíos / error ---------- */
export function EmptyCard({ children }) {
  return <div className={`${GLASS} p-6 text-sm text-sand/60`}>{children}</div>;
}

/* ---------- indicador de carga del snapshot ----------
   El Apps Script tarda bastantes segundos en leer el Excel: mientras no haya
   datos hay que DECIRLO, no dejar solo el shimmer. */
export function CargandoExcel({ actualizando = false }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="mb-4 inline-flex items-center gap-2.5 rounded-lg border border-serene/30 bg-serene/[0.08] px-3 py-2 text-xs font-bold text-serene"
    >
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-serene/30 border-t-serene" />
      {actualizando
        ? "Actualizando datos desde el Excel…"
        : "Cargando datos del Excel… la primera carga puede tardar hasta un minuto."}
    </p>
  );
}

/* ---------- skeleton de carga (shimmer .rdr-skel) ---------- */
export function PanelSkeleton({ que }) {
  return (
    <div aria-busy="true" className="space-y-4">
      {que && <Cargando que={que} />}
      <div aria-hidden className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rdr-skel h-9 w-28 rounded-full" />
        ))}
      </div>
      <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="rdr-skel h-24 rounded-2xl" />
        ))}
      </div>
      <span aria-hidden className="rdr-skel block h-72 rounded-2xl" />
    </div>
  );
}

/* ---------- barra horizontal (capacidad) ---------- */
export function Bar({ label, v, extra, col, fmt }) {
  return (
    <div>
      <div className="flex justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-sand/85">
          {label}
          {extra ? <span className="text-sand/40"> {extra}</span> : null}
        </span>
        <span className={`shrink-0 tabular-nums ${TEXT[col]}`}>{fmt}</span>
      </div>
      <div className="mt-0.5 h-2 rounded-full bg-white/10">
        <div
          className={`h-2 rounded-full ${BGBAR[col] || BGBAR.serene}`}
          style={{ width: `${Math.min(100, v * 100)}%` }}
        />
      </div>
    </div>
  );
}

/* ---------- tabla genérica (Encuestas) ---------- */
export function DataTable({ records, cols }) {
  if (!records || !records.length) return <EmptyCard>Sin datos.</EmptyCard>;
  return (
    <div className={`${GLASS} overflow-x-auto p-4`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-serene/80">
            {cols.map((c) => (
              <th key={c.label} className={`p-2 font-bold ${c.r ? "text-right" : ""}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {records.map((rec, i) => {
            const d = rec.data || rec;
            return (
              <tr key={i} className="border-t border-serene/10">
                {cols.map((c) => (
                  <td key={c.label} className={`p-2 ${c.r ? "text-right" : ""}`}>
                    {c.f ? c.f(d[c.k], d) : <Ro v={d[c.k]} />}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
