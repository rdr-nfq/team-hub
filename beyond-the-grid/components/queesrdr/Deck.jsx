"use client";

/* Deck horizontal de "¿Qué es RDR?" — mismo modelo de navegación que las
   presentaciones de /formacion: una diapositiva por pantalla, se avanza de
   IZQUIERDA a DERECHA con flechas, teclado, rueda del ratón, deslizando en
   táctil o pulsando los puntos de navegación.

   Implementación: scroll-snap horizontal nativo (el gesto táctil y el trackpad
   funcionan solos) + IntersectionObserver para saber en qué diapositiva
   estamos. Las diapositivas se descubren por el atributo data-slide, así que
   cada sección puede aportar las suyas sin que el deck las conozca. */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DeckCtx = createContext({ inDeck: false, goToId: () => {}, current: 0, total: 0 });

/** Contexto del deck: `inDeck` permite a las primitivas (Reveal, BlockHeader)
 *  adaptarse cuando se pintan dentro de una diapositiva. */
export const useDeck = () => useContext(DeckCtx);

const ES_CAMPO = (el) => !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

function Flecha({ dir, ...p }) {
  return (
    <button
      type="button"
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[0.07] text-sand backdrop-blur-md transition hover:border-serene/60 hover:bg-white/[0.14] active:scale-95 disabled:cursor-default disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
      {...p}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir === "prev" ? <path d="M15 19l-7-7 7-7" /> : <path d="M9 5l7 7-7 7" />}
      </svg>
    </button>
  );
}

export default function Deck({ children, label = "Diapositivas de ¿Qué es RDR?" }) {
  const scroller = useRef(null);
  const slides = useRef([]);
  const lock = useRef(0);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);

  /* Descubrir las diapositivas del DOM y seguir cuál está en pantalla. */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll("[data-slide]"));
    slides.current = nodes;
    setTotal(nodes.length);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setCurrent(slides.current.indexOf(e.target));
        });
      },
      { root: el, threshold: 0.55 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [children]);

  /* Marca de diapositiva activa (dispara la animación de entrada del contenido). */
  useEffect(() => {
    slides.current.forEach((n, i) => n.setAttribute("data-active", i === current ? "true" : "false"));
  }, [current, total]);

  const irA = useCallback((i) => {
    const nodes = slides.current;
    if (!nodes.length) return;
    const idx = Math.max(0, Math.min(nodes.length - 1, i));
    nodes[idx].scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setCurrent(idx);
  }, []);

  const goToId = useCallback(
    (id) => {
      const i = slides.current.findIndex((n) => n.dataset.slideId === id);
      if (i >= 0) irA(i);
    },
    [irA]
  );

  /* Teclado: ← → (y AvPág/RePág, inicio/fin, espacio). */
  useEffect(() => {
    const onKey = (e) => {
      if (ES_CAMPO(document.activeElement)) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "PageDown" || k === " ") { e.preventDefault(); irA(current + 1); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); irA(current - 1); }
      else if (k === "Home") { e.preventDefault(); irA(0); }
      else if (k === "End") { e.preventDefault(); irA(slides.current.length - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, irA]);

  /* Rueda vertical: pasa de diapositiva cuando la actual no tiene más scroll
     propio (las diapositivas largas se leen antes de avanzar). */
  const onWheel = (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || Math.abs(e.deltaY) < 14) return;
    const s = slides.current[current];
    if (!s) return;
    const puedeScroll = s.scrollHeight > s.clientHeight + 2;
    const arriba = s.scrollTop <= 2;
    const abajo = s.scrollTop + s.clientHeight >= s.scrollHeight - 2;
    if (puedeScroll && ((e.deltaY > 0 && !abajo) || (e.deltaY < 0 && !arriba))) return;
    const ahora = Date.now();
    if (ahora < lock.current) return;
    lock.current = ahora + 620;
    irA(current + (e.deltaY > 0 ? 1 : -1));
  };

  const pct = total > 1 ? (current / (total - 1)) * 100 : 0;

  return (
    <DeckCtx.Provider value={{ inDeck: true, goToId, current, total }}>
      {/* Progreso del deck (sustituye a la barra de scroll de la versión larga) */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent">
        <div
          className="h-full origin-left bg-gradient-to-r from-serene to-lime transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div
        ref={scroller}
        onWheel={onWheel}
        className="rdr-deck flex h-dvh w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
        role="region"
        aria-roledescription="carrusel"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>

      {/* Barra de navegación: anterior · puntos · siguiente · contador */}
      <nav
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/12 bg-midnight/85 px-2.5 py-2 backdrop-blur-md sm:gap-3 sm:px-3"
        aria-label="Navegación de diapositivas"
      >
        <Flecha dir="prev" onClick={() => irA(current - 1)} disabled={current === 0} aria-label="Diapositiva anterior" />
        <ol className="hidden items-center gap-1.5 md:flex" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => irA(i)}
                tabIndex={-1}
                className={`block h-1.5 rounded-full transition-all ${
                  i === current ? "w-5 bg-serene" : "w-1.5 bg-white/25 hover:bg-white/50"
                }`}
              />
            </li>
          ))}
        </ol>
        <p className="min-w-[62px] text-center font-display text-xs font-bold tabular-nums text-sand/75">
          <span className="text-sand">{String(current + 1).padStart(2, "0")}</span>
          <span className="text-sand/40"> / {String(total).padStart(2, "0")}</span>
        </p>
        <Flecha dir="next" onClick={() => irA(current + 1)} disabled={total > 0 && current === total - 1} aria-label="Diapositiva siguiente" />
      </nav>
    </DeckCtx.Provider>
  );
}
