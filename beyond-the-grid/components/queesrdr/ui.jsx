"use client";

// Primitivas visuales de la presentación "¿Qué es RDR?": diapositivas del deck
// horizontal, revelado del contenido, separadores de módulo, tarjetas glass y
// pequeños átomos (kicker, pills, stats). Todo respeta prefers-reduced-motion.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { useDeck } from "./Deck";

const EASE = [0.16, 1, 0.3, 1];

/** Bloque que se revela (fade + rise) la primera vez que entra en viewport.
 *  Dentro del deck no se usa el viewport (las diapositivas están fuera de
 *  pantalla en horizontal): el contenido se pinta siempre y la entrada la
 *  dispara la clase .rdr-anim cuando la diapositiva pasa a estar activa. */
export function Reveal({ children, delay = 0, className, as = "div", ...rest }) {
  const reduce = useReducedMotion();
  const { inDeck } = useDeck();
  if (inDeck) {
    const Tag = as;
    return (
      <Tag className={`rdr-anim ${className || ""}`} style={{ "--rdr-d": `${Math.round(delay * 1000)}ms` }} {...rest}>
        {children}
      </Tag>
    );
  }
  const M = motion[as] || motion.div;
  return (
    <M
      initial={{ opacity: 0, y: reduce ? 0 : 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className={className}
      {...rest}
    >
      {children}
    </M>
  );
}

/** Etiqueta pequeña sobre los titulares (equivale al ante-title del legacy). */
export function Kicker({ color = "#85C8FF", children }) {
  const mapAccent = useAccentMap(); // texto de acento legible en claro
  return (
    <p className="font-sans text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: mapAccent(color) }}>
      {children}
    </p>
  );
}

/** Titular de bloque (Source Serif 4). */
export function H2({ children, className = "" }) {
  return (
    <h2 className={`mt-2 text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight text-sand sm:text-4xl ${className}`}>
      {children}
    </h2>
  );
}

export function H3({ children, className = "" }) {
  return <h3 className={`font-display text-lg font-bold leading-snug text-sand sm:text-xl ${className}`}>{children}</h3>;
}

/** Párrafo destacado bajo el titular. */
export function Lead({ children, className = "" }) {
  return <p className={`mt-4 max-w-prose text-pretty text-[15px] leading-relaxed text-sand/80 sm:text-base ${className}`}>{children}</p>;
}

/** Tarjeta glass estándar (mismo cristal que el hub). */
export function Glass({ accent, className = "", children, style, ...p }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md ${className}`}
      style={{ ...(accent ? { boxShadow: `inset 0 2px 0 ${rgba(accent, 0.65)}` } : null), ...style }}
      {...p}
    >
      {children}
    </div>
  );
}

/** Tarjeta con banda lateral de acento (equivale a las cajas border-left del legacy). */
export function EdgeCard({ accent = "#85C8FF", title, children, className = "" }) {
  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-sm ${className}`}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      {title && <p className="mb-1 text-sm font-bold text-sand">{title}</p>}
      <div className="text-[13px] leading-relaxed text-sand/70">{children}</div>
    </div>
  );
}

/** Cifra destacada (KPI). */
export function Stat({ value, label, sub, color = "#85C8FF" }) {
  const mapAccent = useAccentMap(); // cifra con acento legible en claro; el inset del Glass mantiene el hex original
  return (
    <Glass accent={color} className="flex flex-col items-center gap-1 px-4 py-6 text-center">
      <span className="font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl" style={{ color: mapAccent(color) }}>
        {value}
      </span>
      <span className="mt-1.5 text-sm font-bold text-sand">{label}</span>
      {sub && <span className="text-xs text-sand/60">{sub}</span>}
    </Glass>
  );
}

/** Pill de etiqueta con acento. */
export function Pill({ color = "#85C8FF", children, className = "" }) {
  const mapAccent = useAccentMap(); // texto temado; tintes de borde/fondo con el hex original
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}
      style={{ color: mapAccent(color), borderColor: rgba(color, 0.4), background: rgba(color, 0.1) }}
    >
      {children}
    </span>
  );
}

/** Caja de conclusión / idea clave (equivale a conclusion__box del deck). */
export function KeyIdea({ color = "#85C8FF", children, className = "" }) {
  return (
    <aside
      className={`rounded-2xl border p-5 font-display text-base font-semibold leading-relaxed text-sand sm:text-lg ${className}`}
      style={{ borderColor: rgba(color, 0.35), background: rgba(color, 0.08) }}
    >
      {children}
    </aside>
  );
}

/** Cabecera de sub-bloque dentro de un módulo (kicker + h2 + lead). */
export function BlockHeader({ color, kicker, title, children }) {
  const { inDeck } = useDeck();
  return (
    <Reveal className={inDeck ? "" : "pt-16 sm:pt-20"}>
      <Kicker color={color}>{kicker}</Kicker>
      <H2>{title}</H2>
      {children && <Lead>{children}</Lead>}
    </Reveal>
  );
}

/** Lista con viñetas de acento (equivale a .bbva-list). */
export function DotList({ color = "#85C8FF", items, className = "" }) {
  return (
    <ul className={`mt-4 space-y-2.5 ${className}`}>
      {items.map((it, i) => (
        <li key={i} className="relative pl-5 text-[14px] leading-relaxed text-sand/80">
          <span aria-hidden className="absolute left-0 top-[0.55em] h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {it}
        </li>
      ))}
    </ul>
  );
}

/* ─────────────────────────── Diapositivas ───────────────────────────
   Cada <Slide> ocupa la pantalla completa dentro del deck horizontal. Si su
   contenido no cabe, la propia diapositiva hace scroll vertical y aparece un
   degradado inferior avisando de que queda más por leer. */

/** ¿El contenido de este nodo desborda en vertical? (para el aviso de scroll) */
function useDesborda(ref) {
  const [desborda, setDesborda] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mide = () => setDesborda(el.scrollHeight > el.clientHeight + 4);
    mide();
    const ro = new ResizeObserver(mide);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [ref]);
  return desborda;
}

export function Slide({ id, kicker, title, lead, color = "#85C8FF", wide = false, className = "", children }) {
  const ref = useRef(null);
  const desborda = useDesborda(ref);
  return (
    <article
      ref={ref}
      data-slide
      data-slide-id={id}
      id={id}
      aria-roledescription="diapositiva"
      aria-label={title || id}
      className={`rdr-slide relative flex h-dvh w-full flex-none snap-start snap-always flex-col overflow-y-auto overscroll-contain px-5 pb-24 pt-20 sm:px-8 sm:pt-24 ${className}`}
    >
      {/* m-auto centra el contenido cuando cabe y, cuando no cabe, no lo recorta
          (a diferencia de justify-center en un contenedor con scroll). */}
      <div className={`m-auto w-full ${wide ? "max-w-7xl" : "max-w-6xl"}`}>
        {(kicker || title) && (
          <header className="rdr-anim">
            {kicker && <Kicker color={color}>{kicker}</Kicker>}
            {title && <H2>{title}</H2>}
            {lead && <Lead>{lead}</Lead>}
          </header>
        )}
        {children}
      </div>
      {desborda && (
        <span aria-hidden className="pointer-events-none sticky bottom-0 -mt-10 block h-10 w-full bg-gradient-to-t from-midnight to-transparent" />
      )}
    </article>
  );
}

/** Diapositiva separadora de módulo (equivale a los slides-separador del deck). */
export function SlideModulo({ id, n, color, title, desc }) {
  const mapAccent = useAccentMap(); // texto temado; el punto-swatch conserva el hex original
  return (
    <Slide id={id} color={color}>
      <div className="rdr-anim">
        <div className="flex items-center gap-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="font-sans text-xs font-bold uppercase tracking-[0.35em]" style={{ color: mapAccent(color) }}>
            Módulo {n}
          </span>
        </div>
        <h2 className="mt-5 text-balance font-display text-4xl font-bold leading-[0.98] tracking-tight text-sand sm:text-6xl lg:text-7xl">
          {title}
        </h2>
        {desc && <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-sand/70 sm:text-lg">{desc}</p>}
        <span aria-hidden className="mt-9 block h-px w-28" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      </div>
    </Slide>
  );
}
