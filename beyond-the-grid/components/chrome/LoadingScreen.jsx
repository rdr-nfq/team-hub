"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Splash de marca BBVA. Se muestra UNA sola vez por sesión:
 *   - flag en sessionStorage -> no reaparece al volver de páginas .html ni en
 *     recargas dentro de la misma sesión (sí en una pestaña/sesión nueva).
 *   - empieza oculto (evita parpadeo en SSR/hidratación) y se decide en cliente.
 *   - a los ~900ms se oculta con un fundido. Fondo Electric Blue (#001391).
 */
export default function LoadingScreen() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("rdr_splash_done")) return;
      sessionStorage.setItem("rdr_splash_done", "1");
    } catch {}
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-electric"
        >
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-sans text-xs uppercase tracking-[0.4em] text-[#85C8FF]"
          >
            BBVA × NFQ
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-3 max-w-4xl text-balance font-display text-4xl font-bold tracking-tight text-[#F7F8F8] md:text-6xl"
          >
            Reference Data &amp; Surveillance Hub
          </motion.h1>
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="mt-8 h-px w-40 origin-left bg-[#85C8FF]/60"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
