"use client";

import { useEffect, useRef, useState } from "react";
import { rgba, activo } from "@/lib/ui";
import { ACCENT } from "./lib";

/* Piezas pequeñas propias del catálogo de properties. Las primitivas grandes
   (Tag, TypePill, CodePanel, InfoRow, WfFlow) se importan del explorer. */

/* Estilo del <mark> temado: tinte canary (hex original) + tinta heredada,
   legible sobre glass oscuro y sobre panel claro. current = coincidencia
   activa del buscador interno del visor (superficie sólida → tinta Electric). */
export const markStyle = (current) =>
  current
    ? { ...activo(ACCENT), borderRadius: 3, padding: "0 1px" }
    : { backgroundColor: rgba(ACCENT, 0.32), color: "inherit", borderRadius: 3, padding: "0 1px" };

/* Texto con TODAS las ocurrencias de `q` (ya en minúsculas) envueltas en
   <mark>. Para nombres y snippets de la lista de resultados. */
export function Hl({ text, q }) {
  if (!q || !text) return text || null;
  const lower = text.toLowerCase();
  const out = [];
  let from = 0;
  let i = lower.indexOf(q);
  while (i !== -1) {
    if (i > from) out.push(text.slice(from, i));
    out.push(
      <mark key={i} style={markStyle(false)}>
        {text.slice(i, i + q.length)}
      </mark>
    );
    from = i + q.length;
    i = lower.indexOf(q, from);
  }
  out.push(text.slice(from));
  return out;
}

/* Botón copiar con feedback accesible ("Copiado" 1.6 s). */
export function CopyButton({ text, label = "Copiar", className = "" }) {
  const [ok, setOk] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setOk(true);
          clearTimeout(t.current);
          t.current = setTimeout(() => setOk(false), 1600);
        });
      }}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-white/12 bg-white/[0.05] px-2 py-1 text-[10px] font-bold text-sand/70 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${className}`}
    >
      {ok ? "Copiado ✓" : label}
      <span aria-live="polite" className="sr-only">{ok ? "Copiado al portapapeles" : ""}</span>
    </button>
  );
}

/* Valor en código copiable (ruta, file…). */
export function CodeChip({ label, value }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="w-[52px] shrink-0 text-[10px] font-bold text-sand/55">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-md bg-white/[0.06] px-2 py-1 font-mono text-[11px] text-sand/85" title={value}>
        {value}
      </code>
      <CopyButton text={value} />
    </div>
  );
}
