"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { IconCarta, IconLibro, IconCerrar, IconExterno } from "./icons";

const ACCENT = PALETTE.mandarin;

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-mandarin/30 bg-mandarin/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.04em] text-mandarin transition hover:-translate-y-px hover:bg-mandarin/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mandarin";

function RestoCard({ r, onOpen, delay, reduce }) {
  const tilt = useTilt(reduce);
  const tieneDesc = !!(r.descLarga || r.descCorta);
  return (
    <article
      {...tilt}
      className="rdr-rise rdr-tilt group relative flex flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] backdrop-blur-md"
      style={{ animationDelay: `${delay}ms`, "--pc": rgba(ACCENT, 0.7) }}
    >
      <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(150px circle at var(--mx,50%) var(--my,50%), ${rgba(ACCENT, 0.2)}, transparent 70%)` }} />
      {/* Foto o placeholder con la inicial */}
      {r.foto ? (
        <div className="h-32 shrink-0 bg-cover bg-center" style={{ backgroundImage: `url('${r.foto}')` }} role="img" aria-label={`Foto de ${r.nombre}`} />
      ) : (
        <div aria-hidden className="grid h-32 shrink-0 place-items-center font-display text-4xl font-bold text-[#001391]/55" style={{ background: PALETTE.mandarin }}>
          {(r.nombre || "?").charAt(0)}
        </div>
      )}
      <div className="relative flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-[17px] font-bold text-sand">{r.nombre}</h3>
        <p className="line-clamp-3 flex-1 whitespace-pre-line text-[12.5px] leading-relaxed text-sand/70">
          {r.descCorta || "Sin descripción todavía."}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {r.carta && (
            <a href={r.carta} target="_blank" rel="noopener noreferrer" className={CHIP}>
              <IconCarta size={13} /> Ver carta <IconExterno size={11} className="opacity-70" />
            </a>
          )}
          {tieneDesc && (
            <button type="button" onClick={onOpen} className={CHIP}>
              <IconLibro size={13} /> Descripción
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* Modal de descripción: dialog accesible (Escape, clic fuera, foco al abrir). */
function RestoModal({ resto, onClose, reduce }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-midnight/75 p-5 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resto-modal-title"
        initial={{ opacity: 0, y: reduce ? 0 : 18, scale: reduce ? 1 : 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
        transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="max-h-[82vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/12 bg-midnight p-6 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h3 id="resto-modal-title" className="font-display text-2xl font-bold leading-tight text-sand">{resto.nombre}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-sand transition hover:bg-white/20 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mandarin"
          >
            <IconCerrar size={15} />
          </button>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-sand/90">
          {resto.descLarga || resto.descCorta || "Sin descripción todavía."}
        </p>
        {resto.carta && (
          <div className="mt-5">
            <a href={resto.carta} target="_blank" rel="noopener noreferrer" className={CHIP}>
              <IconCarta size={13} /> Ver carta <IconExterno size={11} className="opacity-70" />
            </a>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** Directorio de restaurantes: fotos, carta y descripción (modal). */
export default function Restaurantes({ restaurantes }) {
  const [abierto, setAbierto] = useState(null); // índice del restaurante en el modal
  const reduce = useReducedMotion();

  if (!restaurantes.length) {
    return <p className="py-6 text-center text-[13px] text-sand/55">No hay restaurantes todavía.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {restaurantes.map((r, i) => (
          <RestoCard key={`${r.nombre}-${i}`} r={r} delay={i * 35} reduce={reduce} onOpen={() => setAbierto(i)} />
        ))}
      </div>
      <AnimatePresence>
        {abierto !== null && restaurantes[abierto] && (
          <RestoModal resto={restaurantes[abierto]} reduce={reduce} onClose={() => setAbierto(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
