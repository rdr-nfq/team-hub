"use client";

import { AnimatePresence, motion } from "framer-motion";

/** Aviso flotante (reemplaza el #toast del index.html original). La región
    viva está siempre montada para que el lector de pantalla lo anuncie. */
export default function Toast({ message }) {
  return (
    <div role="status" aria-live="polite">
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="pointer-events-none fixed bottom-8 left-1/2 z-[110] -translate-x-1/2 rounded-full border border-electric/15 bg-[#F7F8F8] px-6 py-3 font-sans text-sm font-bold text-[#001391] shadow-xl"
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
    </div>
  );
}
