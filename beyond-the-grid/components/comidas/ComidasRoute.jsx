"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { PALETTE } from "@/lib/palette";
import { FLEX, FALLBACK_RESTAURANTES, FALLBACK_SEMANAS, computeWeek, norm, semanasVotables } from "./logic";
import ComidasSkeleton from "./ComidasSkeleton";
import VotoPanel from "./VotoPanel";
import Resultados from "./Resultados";
import Restaurantes from "./Restaurantes";
import Historico from "./Historico";
import { IconSemana, IconHistorial, IconAviso, IconVolver } from "./icons";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";

const EQUIPO_URL = "/team-hub/equipo/equipo.json"; // absoluto: funciona bajo /comidas/ (basePath)

/* Fondo ambiental (blobs) con el mandarín como protagonista — acento de Equipo. */
function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <span className="rdr-blob left-[-8%] top-[8%] h-72 w-72" style={{ background: PALETTE.mandarin }} />
      <span className="rdr-blob right-[-6%] top-[30%] h-80 w-80" style={{ background: PALETTE.royal, animationDelay: "-5s" }} />
      <span className="rdr-blob bottom-[-10%] left-[24%] h-72 w-72" style={{ background: PALETTE.canary, animationDelay: "-9s" }} />
    </div>
  );
}

function SectionHead({ title, hint }) {
  return (
    <div className="mb-4 mt-8 flex items-baseline gap-3">
      <h2 className="font-display text-lg font-bold text-sand">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-white/12" />
      {hint && <span className="hidden text-[11px] text-sand/55 sm:inline">{hint}</span>}
    </div>
  );
}

const TABS = [
  { id: "semana", label: "Esta semana", icon: IconSemana },
  { id: "historico", label: "Histórico", icon: IconHistorial },
];

/**
 * Ruta /comidas — migración de public/comidas.html a Next.
 *
 * Contrato con el backend Apps Script (INTACTO respecto al legacy):
 *  - GET  {comidasBackend}          -> { restaurantes[], semanas[], votos[] }
 *  - POST {comidasBackend}          body JSON.stringify(payload) con
 *    Content-Type text/plain;charset=utf-8 (evita el preflight CORS de Apps
 *    Script) y respuesta .json().
 * La URL sale de links.json (clave "comidasBackend") vía useLinks().
 * La autenticación la aporta el chrome (AuthGate); aquí solo se usa el email
 * para preseleccionar el nombre del votante.
 */
export default function ComidasRoute() {
  const { getUrl, showToast, error: linksError } = useLinks();
  const { email } = useAuth();
  const reduce = useReducedMotion();

  /* ---------- datos base ---------- */
  const [team, setTeam] = useState(null); // equipo/equipo.json (objetos completos)
  const [base, setBase] = useState(null); // { restaurantes, semanas, configured, url }
  const [votos, setVotos] = useState(null);
  const [tab, setTab] = useState("semana");

  // Equipo: siempre desde el repo (misma fuente que el resto del hub).
  useEffect(() => {
    let alive = true;
    fetch(EQUIPO_URL)
      .then((r) => r.json())
      .then((eq) => alive && setTeam(eq.team || []))
      .catch(() => alive && setTeam([]));
    return () => { alive = false; };
  }, []);

  // Datos del Sheet. La URL llega de forma asíncrona (LinksProvider): se espera
  // a que links.json resuelva; si falla o la clave no existe, camino "sin
  // backend" del legacy (banner + datos de ejemplo + votación deshabilitada).
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    const load = async (url) => {
      if (startedRef.current) return;
      startedRef.current = true;
      const configured = !!url;
      let restaurantes = FALLBACK_RESTAURANTES;
      let semanas = FALLBACK_SEMANAS;
      let v = [];
      if (configured) {
        try {
          const data = await fetch(url).then((r) => r.json());
          restaurantes = data.restaurantes || [];
          semanas = data.semanas || [];
          v = data.votos || [];
        } catch {
          // mismo comportamiento que el legacy: fallback + aviso
          restaurantes = FALLBACK_RESTAURANTES;
          semanas = FALLBACK_SEMANAS;
          v = [];
          showToast("No se pudieron cargar los datos del Sheet");
        }
      }
      setBase({ restaurantes, semanas, configured, url });
      setVotos(v);
    };

    const url = getUrl && getUrl("comidasBackend");
    if (url) { load(url); return; }
    if (linksError) { load(null); return; }
    // links.json aún cargando: si en 8s no hay URL, seguimos sin backend.
    const t = setTimeout(() => load(null), 8000);
    return () => clearTimeout(t);
  }, [getUrl, linksError, showToast]);

  /* ---------- formulario ---------- */
  const [quien, setQuien] = useState("");
  const [semana, setSemana] = useState("");
  const [estado, setEstado] = useState("fuera");
  const [e1, setE1] = useState(""); // sin preselección: se elige a mano
  const [e2, setE2] = useState("");
  const [sending, setSending] = useState(false);

  const equipoNombres = useMemo(
    () => (team || []).map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es")),
    [team]
  );
  const votables = useMemo(() => (base ? semanasVotables(base.semanas) : []), [base]);

  // Preselecciones iniciales: nombre por email autenticado + jueves más próximo.
  useEffect(() => {
    if (!team || !email) return;
    const mail = String(email).toLowerCase();
    const yo = team.find((p) => [p.email, p.emailBBVA].map((x) => String(x || "").toLowerCase()).includes(mail));
    if (yo) setQuien((q) => q || yo.nombre);
  }, [team, email]);
  useEffect(() => {
    if (votables.length) setSemana((s) => (s && votables.some((x) => x.fecha === s) ? s : votables[0].fecha));
  }, [votables]);

  // Prefill del voto previo al cambiar de persona o de jueves (como el legacy).
  const votosRef = useRef(votos);
  votosRef.current = votos;
  useEffect(() => {
    if (!quien || !semana || !votosRef.current) return;
    const prev = votosRef.current.find((x) => x.companero === quien && x.semana === semana);
    if (!prev) { setEstado("fuera"); setE1(""); setE2(""); return; }
    if (norm(prev.noEstoy)) setEstado("no");
    else if (norm(prev.taperGlovo)) setEstado("taper");
    else { setEstado("fuera"); setE1(prev.eleccion1 || ""); setE2(prev.eleccion2 || ""); }
  }, [quien, semana]);

  /* Restaurante ya elegido para ese jueves por EL RESTO del equipo. Si lo hay,
     no se abren más frentes: quien vote después se une (flexible), se lleva
     taper o no viene. Dos matices:
     - se calcula SIN el voto propio, para poder seguir cambiando el tuyo si
       eres quien lo eligió;
     - solo cuenta una elección REAL (prioridad 1). El ganador provisional que
       sale del desempate por segundas opciones (porSegunda) no bloquea a
       nadie: ahí todavía no ha elegido restaurante ninguna persona. */
  const yaElegido = useMemo(() => {
    if (!semana || !votos) return null;
    const c = computeWeek(votos.filter((x) => x.companero !== quien), semana);
    return c.porSegunda ? null : c.r1?.nombre || null;
  }, [votos, semana, quien]);

  // El flexible exige prioridad 2 (si no, un voto flexible no aporta nada al
  // recuento). No hace falta cuando ya hay restaurante elegido: hay algo a lo
  // que unirse, así que no puede quedar la semana sin decidir.
  useEffect(() => {
    if (!yaElegido && e1 === FLEX && (!e2 || e2 === FLEX)) setE1("");
  }, [e1, e2, yaElegido]);

  /* ---------- enviar voto (mismo contrato POST del legacy) ---------- */
  const enviarVoto = useCallback(async () => {
    if (!quien) { showToast("Elige quién eres"); return; }
    if (!semana) { showToast("Elige un jueves"); return; }
    if (estado === "fuera" && !e1) { showToast("Elige tu prioridad 1"); return; }
    const payload = {
      nombre: quien,
      semana,
      eleccion1: estado === "fuera" ? e1 : "",
      eleccion2: estado === "fuera" ? e2 : "",
      taperGlovo: estado === "taper",
      noEstoy: estado === "no",
    };
    setSending(true);
    try {
      // POST text/plain (sin preflight CORS): NO cambiar cabeceras ni formato.
      await fetch(base.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      // Upsert local para refrescar resultados sin recargar (como el legacy).
      const local = { semana, companero: quien, eleccion1: payload.eleccion1, eleccion2: payload.eleccion2, taperGlovo: payload.taperGlovo, noEstoy: payload.noEstoy };
      setVotos((prev) => {
        const next = [...prev];
        const idx = next.findIndex((x) => x.companero === quien && x.semana === semana);
        if (idx >= 0) next[idx] = local; else next.push(local);
        return next;
      });
      showToast("¡Voto registrado! 🎉");
    } catch {
      showToast("Error al enviar el voto");
    } finally {
      setSending(false);
    }
  }, [quien, semana, estado, e1, e2, base, showToast]);

  /* ---------- render ---------- */
  if (!base || !votos || team === null) return <ComidasSkeleton />;

  return (
    <main className="relative">
      <ArtBanner src={ART.equipo} />
      <AmbientBackground />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-24 pt-28 sm:px-6">
        {/* Hero */}
        <header className="mb-8">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-mandarin/90">Equipo · 02</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            Comidas de los jueves
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-sand/65">
            Coordinación del equipo RDR: vota dónde comer cada jueves de oficina (no festivos ni de teletrabajo).
          </p>
        </header>

        {/* Aviso si falta backend (clave comidasBackend en links.json) */}
        {!base.configured && (
          <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-mandarin/50 bg-mandarin/10 px-4 py-3 text-[12.5px] leading-relaxed text-sand">
            <IconAviso size={18} className="mt-0.5 shrink-0 text-mandarin" />
            <p>
              <b className="text-mandarin">Falta configurar el backend.</b> Añade la URL del Apps Script en la clave{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">comidasBackend</code> de{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">links/links.json</code>.
              Mientras tanto se muestran los restaurantes de ejemplo y la votación está deshabilitada.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="Vistas de comidas" className="mb-6 inline-flex gap-1 rounded-full border border-white/12 bg-white/[0.055] p-1 backdrop-blur-md">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                role="tab"
                id={`tab-btn-${id}`}
                aria-selected={active}
                aria-controls={`tab-panel-${id}`}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                    const next = TABS[(TABS.findIndex((t) => t.id === tab) + 1) % TABS.length].id;
                    setTab(next);
                    document.getElementById(`tab-btn-${next}`)?.focus();
                  }
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.06em] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mandarin ${
                  active ? "bg-[#FFB56B] text-[#001391]" : "text-sand/70 hover:text-sand"
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {tab === "semana" ? (
            <motion.div
              key="semana"
              role="tabpanel"
              id="tab-panel-semana"
              aria-labelledby="tab-btn-semana"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <VotoPanel
                  equipo={equipoNombres}
                  quien={quien} onQuien={setQuien}
                  semanas={votables}
                  semana={semana} onSemana={setSemana}
                  estado={estado} onEstado={setEstado}
                  e1={e1} onE1={setE1}
                  e2={e2} onE2={setE2}
                  restaurantes={base.restaurantes}
                  yaElegido={yaElegido}
                  onEnviar={enviarVoto}
                  sending={sending}
                  disabled={!base.configured}
                />
                <Resultados semana={semana} votos={votos} equipo={equipoNombres} />
              </div>

              <SectionHead title="Restaurantes" hint="Fotos, carta y descripción" />
              <Restaurantes restaurantes={base.restaurantes} />
            </motion.div>
          ) : (
            <motion.div
              key="historico"
              role="tabpanel"
              id="tab-panel-historico"
              aria-labelledby="tab-btn-historico"
              initial={{ opacity: 0, y: reduce ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <SectionHead title="Semanas anteriores" hint="Qué se eligió cada jueves" />
              <Historico semanas={base.semanas} votos={votos} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
