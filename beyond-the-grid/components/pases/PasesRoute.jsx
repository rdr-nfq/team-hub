"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLinks } from "@/lib/links";
import { useAccent } from "@/lib/theme";
import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import {
  cacheSet,
  cacheGet,
  dashHash,
  llamarBackend,
  beaconEditarComponente,
  limpiarMulti,
  MESES,
  isT,
} from "./backend";
import { computeValidador } from "./validador";
import { computeMergeUnits } from "./mergeos";
import { useAuth } from "@/components/chrome/AuthGate";
import { ACCENT, BTN, CARD_CLS, Field, SELECT_CLS, INPUT_CLS } from "./ui";
import { IconRocket, IconSave, IconMoon, IconCheck, IconLock, IconRefresh, IconArrowLeft, IconExternal } from "./icons";
import Proyectos from "./Proyectos";
import Secuencia from "./Secuencia";
import PreChecks from "./PreChecks";
import Ejecucion from "./Ejecucion";
import Mergeos from "./Mergeos";
import Resumen from "./Resumen";
import CmdDrawer from "./CmdDrawer";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";

/* ─────────────────────────────────────────────────────────────
   Contexto de la ruta: estado del pase (E), acciones contra el
   backend Apps Script y utilidades de UI (toasts, drawer).
   ───────────────────────────────────────────────────────────── */
const PasesCtx = createContext(null);
export const usePases = () => useContext(PasesCtx);

// Fase → panel por defecto + pestañas habilitadas (portado de refrescarUI).
// RESUMEN no es una fase: es la vista de paquetes/componentes en orden,
// disponible en cuanto hay preparación en marcha.
const ALL_TABS = ["PROYECTOS", "SECUENCIA", "PRE", "ORDEN", "POST", "RESUMEN"];
const FASE_CFG = {
  PENDIENTE: { panel: "PENDIENTE", tabs: [] },
  FASE_1_ENCUESTA: { panel: "ENCUESTA", tabs: ["PROYECTOS"] },
  FASE_0_DESCANSO: { panel: "DESCANSO", tabs: ["PROYECTOS"] },
  FASE_2_3_PREPARACION: { panel: "PROYECTOS", tabs: ["PROYECTOS", "SECUENCIA", "RESUMEN"] },
  FASE_4_CERRADO: { panel: "PRE", tabs: ["PROYECTOS", "SECUENCIA", "PRE", "RESUMEN"] },
  FASE_6_IMPLANTACION: { panel: "ORDEN", tabs: ["PROYECTOS", "SECUENCIA", "PRE", "ORDEN", "RESUMEN"] },
  FASE_7_POST: { panel: "POST", tabs: ALL_TABS },
  COMPLETADO: { panel: "COMPLETADO", tabs: ALL_TABS },
};

const TABS = [
  { id: "PROYECTOS", n: 1, t: "Preparación", s: "Proyectos y componentes" },
  { id: "SECUENCIA", n: 2, t: "Orden del pase", s: "Secuencia" },
  { id: "PRE", n: 3, t: "Pre-implant.", s: "Checks previos" },
  { id: "ORDEN", n: 4, t: "Implantación", s: "Ejecución" },
  { id: "POST", n: 5, t: "Post-implant.", s: "Mergeos" },
  { id: "RESUMEN", n: "≡", t: "Resumen", s: "Paquetes del pase" },
];

const clone = (o) => JSON.parse(JSON.stringify(o));

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
      <span className="rdr-blob left-[-8%] top-[4%] h-80 w-80" style={{ background: PALETTE.lime }} />
      <span className="rdr-blob right-[2%] top-[-10%] h-72 w-72" style={{ background: PALETTE.serene, animationDelay: "-4s" }} />
      <span className="rdr-blob bottom-[-14%] left-[22%] h-96 w-96" style={{ background: PALETTE.royal, animationDelay: "-8s" }} />
    </div>
  );
}

/* Modo debug: conmutable por admins; badge informativo para el resto cuando
   está activo (avisa de que los correos NO llegan al equipo). */
function DebugPill({ on, isAdmin, onToggle }) {
  if (!isAdmin && !on) return null;
  const cls = on ? "border-canary/50 bg-canary/15 text-canary" : "border-white/12 bg-white/[0.05] text-sand/60";
  if (!isAdmin)
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${cls}`} role="status">
        <span aria-hidden>🐞</span> Modo debug · sin correos al equipo
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => onToggle(!on)}
      title={on ? "Desactivar modo debug (los correos volverán al equipo)" : "Activar modo debug (los correos irán al buzón de pruebas, no al equipo)"}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:brightness-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${cls}`}
    >
      <span aria-hidden>🐞</span>
      {on ? "Debug ON · sin correos al equipo" : "Modo debug"}
    </button>
  );
}

/* Indicador de red: verde conectado, canario sincronizando, mandarina error. */
function NetDot({ inflight, error }) {
  const state = inflight > 0 ? "sync" : error ? "err" : "ok";
  const label = state === "sync" ? "Sincronizando…" : state === "err" ? "Error de red" : "Conectado";
  const color = state === "sync" ? "bg-canary" : state === "err" ? "bg-mandarin" : "bg-lime";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 text-xs text-sand/70 backdrop-blur" role="status">
      <span className={`h-2 w-2 rounded-full ${color} ${state === "sync" ? "animate-pulse" : ""}`} aria-hidden />
      {label}
    </span>
  );
}

/* ── Tarjetas de estado (fases sin pestañas) ── */
function EstadoCard({ icon, title, children }) {
  return (
    <section className={`${CARD_CLS} flex flex-col items-center gap-5 px-6 py-14 text-center`}>
      {icon}
      <h2 className="font-display text-2xl font-bold text-sand sm:text-3xl">{title}</h2>
      {children}
    </section>
  );
}

function CalendarIcon({ fecha }) {
  const parts = (fecha || "").split("/");
  const dia = parts[0] || "--";
  const mes = MESES[parseInt(parts[1], 10) - 1] || "---";
  return (
    <div className="w-36 overflow-hidden rounded-xl border-2 border-serene/40 bg-white/[0.06] backdrop-blur" aria-hidden>
      {/* Electric es fijo en ambos temas → el texto encima va en Sand LITERAL
          (text-sand en claro se volvería tinta oscura sobre azul oscuro). */}
      <div className="bg-electric px-2 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[#F7F8F8]">{mes}</div>
      <div className="px-4 py-3 font-display text-6xl font-bold leading-none text-sand">{dia}</div>
    </div>
  );
}

export default function PasesRoute() {
  const links = useLinks();
  const reduce = useReducedMotion();
  const accent = useAccent(ACCENT); // lime temado para estilos inline (texto/borde legible en claro)
  const { isCoordinador } = useAuth();
  // Modo debug y DEBUG · Reset: solo coordinación (equipo/equipo.json, campo
  // "coordinador"), igual que el resto de páginas de Coordinación — antes
  // dependía de una lista de emails aparte (roles.js) que se desincronizaba.
  const isAdmin = isCoordinador;

  // URLs desde links.json (fuente única) — misma resolución que el legacy.
  const apiUrl = links?.getUrl ? links.getUrl("pasesBackend") : null;
  const jiraTpl = links?.getUrl ? links.getUrl("jiraBrowse") : null;
  const enoaTpl = links?.getUrl ? links.getUrl("despliegueENOA") : null;
  const novaTpl = links?.getUrl ? links.getUrl("novaPlan") : null;
  const apiUrlRef = useRef(null);
  apiUrlRef.current = apiUrl;

  // ── Estado central ──
  const [E, setE] = useState(null);
  const ERef = useRef(null);
  const [boot, setBoot] = useState("loading"); // loading | ready | error
  const [bootMsg, setBootMsg] = useState("Inicializando…");
  const [inflight, setInflight] = useState(0);
  const [netErr, setNetErr] = useState(false);
  const [activePanel, setActivePanel] = useState("PROYECTOS");
  const [tempOrden, setTempOrden] = useState([]);
  const [cab, setCab] = useState({ crq: "", liderar: "", aprender: "", instTecnica: false });
  const [drawerElemento, setDrawerElemento] = useState(null);
  const [validadorFlash, setValidadorFlash] = useState(0);
  const [edicion, setEdicion] = useState(false); // edición puntual con el pase ya cerrado
  const [resumenModal, setResumenModal] = useState(false); // revisión final al cerrar preparación

  const hashRef = useRef("");
  const abortRef = useRef(null);
  const cabTimer = useRef();
  const preTimer = useRef();
  const ordenTimer = useRef();
  // Protección del orden local frente a revalidaciones SWR: mientras haya una
  // edición sin guardar (dirty) o el guardado sea muy reciente (grace), una
  // respuesta del servidor con el orden ANTIGUO no debe pisar tempOrden — era
  // el bug de "reordeno y se vuelve hacia atrás".
  const ordenDirtyRef = useRef(false);
  const ordenGraceUntil = useRef(0);
  const ordenUidSeq = useRef(0); // ids estables para drag & drop (keys de Reorder)
  const idTraspasoTimers = useRef(new Map());
  const draftsRef = useRef(new Map()); // fila → draft pendiente de autosave (beacon)

  // ── Toasts (con dedup, como el legacy) ──
  const [toasts, setToasts] = useState([]);
  const toastsRef = useRef([]);
  const toastSeq = useRef(0);
  const removeToast = useCallback((id) => {
    setToasts((prev) => {
      const next = prev.filter((t) => t.id !== id);
      toastsRef.current = next;
      return next;
    });
  }, []);
  const showToast = useCallback(
    (msg, type = "success", duration = 2500) => {
      const key = type + "|" + msg;
      const dup = toastsRef.current.find((t) => t.key === key);
      if (dup) return dup.id;
      const id = ++toastSeq.current;
      setToasts((prev) => {
        const next = [...prev, { id, key, msg, type }];
        toastsRef.current = next;
        return next;
      });
      if (type !== "loading") setTimeout(() => removeToast(id), duration);
      return id;
    },
    [removeToast]
  );

  // ── Aplicar estado con optimismo (mantiene ERef síncrono para cache/rollback) ──
  const applyE = useCallback((fn) => {
    const next = clone(ERef.current);
    fn(next);
    ERef.current = next;
    setE(next);
    return next;
  }, []);
  const setEstado = useCallback((data) => {
    ERef.current = data;
    setE(data);
  }, []);

  // ── Motor de peticiones (contador de red + errores) ──
  const call = useCallback(async (action, payload = {}, opts = {}) => {
    setInflight((n) => n + 1);
    try {
      const d = await llamarBackend(apiUrlRef.current, action, payload, opts);
      setNetErr(false);
      return d;
    } catch (err) {
      if (err.name !== "AbortError") setNetErr(true);
      throw err;
    } finally {
      setInflight((n) => Math.max(0, n - 1));
    }
  }, []);

  // ── Carga SWR (idéntica estrategia que el legacy) ──
  const revalidar = useCallback(
    async (fecha) => {
      try {
        let data = await call("obtenerDatosDashboard", { fecha }, { signal: abortRef.current?.signal });
        if (data && data.error) return;
        // Si hay una edición del orden pendiente o recién guardada, la copia
        // del servidor puede traer el orden viejo: conservamos el local.
        if ((ordenDirtyRef.current || Date.now() < ordenGraceUntil.current) && ERef.current) {
          data = { ...data, ordenPase: ERef.current.ordenPase };
        }
        const h = dashHash(data);
        cacheSet(fecha, data);
        if (h !== hashRef.current) {
          hashRef.current = h;
          setEstado(data);
        }
      } catch {}
    },
    [call, setEstado]
  );

  const cargarCompleto = useCallback(
    async (fecha, force) => {
      if (abortRef.current) try { abortRef.current.abort(); } catch {}
      abortRef.current = new AbortController();

      // Cambio de fecha / recarga explícita: el orden local deja de ser
      // "protegido" (pertenece al pase anterior).
      clearTimeout(ordenTimer.current);
      ordenDirtyRef.current = false;
      ordenGraceUntil.current = 0;

      const cached = !force && cacheGet(fecha);
      if (cached) {
        setEstado(cached);
        setBoot("ready");
        hashRef.current = dashHash(cached);
        revalidar(fecha).catch(() => {});
        return;
      }

      setBoot("loading");
      setBootMsg("Conectando con Google Apps Script…");
      try {
        const data = await call("obtenerDatosDashboard", { fecha }, { signal: abortRef.current.signal });
        if (data && data.error) throw new Error(data.error);
        setEstado(data);
        cacheSet(fecha, data);
        hashRef.current = dashHash(data);
        setBoot("ready");
      } catch (err) {
        if (err.name === "AbortError") return;
        setBoot("error");
        setBootMsg(err.message || "Error desconocido");
      }
    },
    [call, revalidar, setEstado]
  );

  // Arranque cuando la URL del backend está resuelta desde links.json.
  useEffect(() => {
    if (apiUrl) cargarCompleto(null);
    else if (links && links.error) {
      setBoot("error");
      setBootMsg("No se pudo cargar links.json (URL del backend de pases).");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, links?.error]);

  // Revalidar al volver a la pestaña.
  useEffect(() => {
    const h = () => {
      if (document.visibilityState === "visible" && ERef.current?.fechaSeleccionada) {
        revalidar(ERef.current.fechaSeleccionada).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [revalidar]);

  // Autosaves pendientes al cerrar la pestaña → sendBeacon (fire-and-forget).
  useEffect(() => {
    const h = () => {
      draftsRef.current.forEach((d, fila) => {
        beaconEditarComponente(apiUrlRef.current, {
          fila,
          nom: d.nom || "", tipo: d.tipo || "", subida: d.subida || "", resp: d.resp || "",
          cod: d.cod || "", us: d.us || "", com: d.com || "", releaseCheck: !!d.release,
        });
      });
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // Sincroniza cabecera editable desde el servidor.
  useEffect(() => {
    if (!E) return;
    setCab({ crq: E.crq || "", liderar: E.liderar || "", aprender: E.aprender || "", instTecnica: !!E.instTecnica });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [E?.crq, E?.liderar, E?.aprender, E?.instTecnica, E?.fechaSeleccionada]);

  // Reconcilia tempOrden con el backend (primer render / cambio estructural).
  // NUNCA mientras haya edición local pendiente o guardado reciente: es la
  // otra mitad del arreglo del "orden que se vuelve hacia atrás".
  useEffect(() => {
    if (!E) return;
    if (ordenDirtyRef.current || Date.now() < ordenGraceUntil.current) return;
    const backendOrden = (E.ordenPase || []).map((o) => ({ elemento: o.elemento, som: o.som || "" }));
    setTempOrden((prev) => {
      const same = prev.length === backendOrden.length && prev.every((t, i) => t.elemento === backendOrden[i].elemento);
      // uid estable por item: clave de Reorder (drag & drop) — no usar índices.
      return prev.length === 0 || !same ? backendOrden.map((o) => ({ ...o, uid: ++ordenUidSeq.current })) : prev;
    });
  }, [E]);

  // Snap del panel activo al cambiar de fase (o de fecha).
  const fase = E?.faseActual;
  useEffect(() => {
    if (!fase) return;
    setActivePanel((FASE_CFG[fase] || { panel: "PROYECTOS" }).panel);
    setEdicion(false); // el modo edición no sobrevive a cambios de fase/fecha
    setResumenModal(false);
  }, [fase, E?.fechaSeleccionada]);

  /* ───────────── Acciones estructurales (esperan al backend) ───────────── */
  const procesarNuevoEstado = useCallback(
    (data, msg, t) => {
      setEstado(data);
      cacheSet(data?.fechaSeleccionada, data);
      hashRef.current = dashHash(data);
      if (t) removeToast(t);
      if (msg) showToast(msg, "success", 1500);
    },
    [removeToast, setEstado, showToast]
  );

  const estructural = useCallback(
    async (action, payload, { loadingMsg, okMsg }) => {
      const t = showToast(loadingMsg, "loading", 0);
      try {
        const data = await call(action, payload);
        procesarNuevoEstado(data, okMsg, t);
      } catch (e) {
        removeToast(t);
        showToast(e.message, "error");
      }
    },
    [call, procesarNuevoEstado, removeToast, showToast]
  );

  const comenzarPase = () =>
    estructural("iniciarPase", { fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada }, { loadingMsg: "Abriendo pase…", okMsg: "Pase iniciado" });
  const responderEncuesta = (r) =>
    estructural("responderEncuesta", { respuesta: r, fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada }, { loadingMsg: "Registrando…", okMsg: "Encuesta guardada" });
  const cancelarSubida = () => {
    if (!confirm("¿Cancelar todo el pase?")) return;
    estructural("cancelarSubida", { fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada }, { loadingMsg: "Cancelando…", okMsg: "Pase cancelado" });
  };
  const activarEmergencia = () =>
    estructural("activarEmergencia", { fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada }, { loadingMsg: "Reabriendo…", okMsg: "Pase reabierto" });
  const avanzar = () => {
    if (!confirm("¿Confirmar esta validación y notificar al equipo por correo?")) return;
    estructural(
      "avanzarFase",
      { fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada, faseActual: ERef.current.faseActual },
      { loadingMsg: "Procesando…", okMsg: "Fase completada" }
    );
  };
  const addProyecto = ({ nombre, feature, respBBVA }) => {
    if (!nombre) return showToast("El nombre del proyecto es obligatorio", "error");
    return estructural(
      "guardarNuevoProyecto",
      { fechaStr: ERef.current.fechaSeleccionada, nombre, feature: limpiarMulti(feature), respBBVA },
      { loadingMsg: "Creando proyecto…", okMsg: "Proyecto creado" }
    );
  };
  const delProyecto = (nombre) => {
    const proy = (ERef.current.proyectos || []).find((p) => p.nombre === nombre);
    const nComps = proy ? (proy.componentes || []).length : 0;
    const msg =
      nComps > 0
        ? `¿Eliminar el proyecto "${nombre}" y sus ${nComps} componente(s)? Esta acción no se puede deshacer.`
        : `¿Eliminar el proyecto "${nombre}"? Esta acción no se puede deshacer.`;
    if (!confirm(msg)) return;
    estructural("eliminarProyecto", { fechaStr: ERef.current.fechaSeleccionada, nombre }, { loadingMsg: "Eliminando proyecto…", okMsg: "Proyecto eliminado" });
  };
  const addCompVacio = (nomProy, cantidad) =>
    estructural(
      "agregarComponentesVacios",
      { proy: nomProy, cantidadStr: cantidad, fechaStr: ERef.current.fechaSeleccionada },
      { loadingMsg: `Añadiendo ${cantidad} fila(s)…`, okMsg: "Filas añadidas" }
    );
  const delComp = (fila) => {
    if (!confirm("¿Eliminar este componente del proyecto?")) return;
    estructural("eliminarComponente", { fila, fechaStr: ERef.current.fechaSeleccionada }, { loadingMsg: "Eliminando…", okMsg: "Componente eliminado" });
  };

  /* ───────────── Acciones optimistas ───────────── */
  const saveComp = useCallback(
    async (fila, draft) => {
      const payload = {
        fila,
        nom: draft.nom, tipo: draft.tipo, subida: draft.subida, resp: draft.resp,
        cod: draft.cod, us: limpiarMulti(draft.us), release: draft.release, com: draft.com,
        releaseCheck: draft.release,
      };
      let prevComp = null;
      (ERef.current.proyectos || []).forEach((p) =>
        (p.componentes || []).forEach((c) => {
          if (c.fila === fila) prevComp = { ...c };
        })
      );
      applyE((d) =>
        d.proyectos.forEach((p) =>
          p.componentes.forEach((c) => {
            if (c.fila === fila) {
              c.nombre = payload.nom; c.tipo = payload.tipo; c.subida = payload.subida; c.resp = payload.resp;
              c.codigo = payload.cod; c.us = payload.us; c.release = payload.release; c.comentarios = payload.com;
            }
          })
        )
      );
      try {
        await call("editarComponente", payload);
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
        return true;
      } catch (e) {
        if (prevComp)
          applyE((d) =>
            d.proyectos.forEach((p) => p.componentes.forEach((c) => { if (c.fila === fila) Object.assign(c, prevComp); }))
          );
        showToast("No se pudo guardar · " + e.message, "error");
        return false;
      }
    },
    [applyE, call, showToast]
  );

  const updOkProy = useCallback(
    async (nombre, isChecked) => {
      const prev = ERef.current.proyectos.map((p) => ({ nombre: p.nombre, ok: p.ok }));
      applyE((d) => d.proyectos.forEach((p) => { if (p.nombre === nombre) p.ok = isChecked; }));
      try {
        await call("actualizarOKProyecto", { fechaStr: ERef.current.fechaSeleccionada, nombre, val: isChecked });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => prev.forEach((o) => d.proyectos.forEach((p) => { if (p.nombre === o.nombre) p.ok = o.ok; })));
        showToast("No se pudo guardar OK · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  const saveIdTraspaso = useCallback(
    async (nombre, valor) => {
      let prevVal;
      applyE((d) =>
        d.proyectos.forEach((p) => {
          if (p.nombre === nombre) { prevVal = p.idTraspaso; p.idTraspaso = valor.trim(); }
        })
      );
      try {
        await call("actualizarIdTraspaso", { fechaStr: ERef.current.fechaSeleccionada, nombre, idTraspaso: valor.trim() });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => d.proyectos.forEach((p) => { if (p.nombre === nombre) p.idTraspaso = prevVal || ""; }));
        showToast("No se pudo guardar ID Traspaso · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  // Debounce 500 ms por proyecto (solo envía si el formato YYYY- es válido).
  const programarSaveIdTraspaso = useCallback(
    (nombre, valor) => {
      const timers = idTraspasoTimers.current;
      if (timers.has(nombre)) clearTimeout(timers.get(nombre));
      timers.set(
        nombre,
        setTimeout(() => {
          timers.delete(nombre);
          const t = (valor || "").trim();
          if (t && !/^\d{4}-/.test(t)) return; // inválido: no se envía (el usuario sigue editando)
          saveIdTraspaso(nombre, valor);
        }, 500)
      );
    },
    [saveIdTraspaso]
  );

  const updCorreoAns = useCallback(
    async (nombre, isChecked) => {
      let prevVal;
      applyE((d) => d.proyectos.forEach((p) => { if (p.nombre === nombre) { prevVal = p.correoAns; p.correoAns = isChecked; } }));
      try {
        await call("actualizarCorreoAns", { fechaStr: ERef.current.fechaSeleccionada, nombre, val: isChecked });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => d.proyectos.forEach((p) => { if (p.nombre === nombre) p.correoAns = prevVal; }));
        showToast("No se pudo guardar correo ANS · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  const chkOrden = useCallback(
    async (fila, val) => {
      const prev = ERef.current.ordenPase.find((o) => o.fila === fila)?.implantado;
      applyE((d) => d.ordenPase.forEach((o) => { if (o.fila === fila) o.implantado = val; }));
      try {
        await call("actualizarCheckOrden", { fila, val });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => d.ordenPase.forEach((o) => { if (o.fila === fila) o.implantado = prev; }));
        showToast("Error al actualizar · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  const updSomEjecucion = useCallback(
    async (fila, val) => {
      applyE((d) => d.ordenPase.forEach((o) => { if (o.fila === fila) o.som = val; }));
      try {
        await call("actualizarSomOrden", { fila, val });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        showToast("Error · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  const chkMerge = useCallback(
    async (fila, val) => {
      let prev;
      applyE((d) => d.proyectos.forEach((p) => p.componentes.forEach((c) => { if (c.fila === fila) { prev = c.mergeado; c.mergeado = val; } })));
      try {
        await call("actualizarMergeComponente", { fila, val });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => d.proyectos.forEach((p) => p.componentes.forEach((c) => { if (c.fila === fila) c.mergeado = prev; })));
        showToast("Error al guardar merge · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  // Mergeo por UNIDAD (Workstation, ObjetosGS, Estáticos…): marca de golpe el
  // check de todas las filas de componente que respalda la unidad.
  const chkMergeUnidad = useCallback(
    async (filas, val) => {
      const set = new Set(filas);
      const prev = new Map();
      applyE((d) =>
        d.proyectos.forEach((p) =>
          p.componentes.forEach((c) => {
            if (set.has(c.fila)) { prev.set(c.fila, c.mergeado); c.mergeado = val; }
          })
        )
      );
      try {
        for (const fila of filas) await call("actualizarMergeComponente", { fila, val });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) =>
          d.proyectos.forEach((p) =>
            p.componentes.forEach((c) => {
              if (prev.has(c.fila)) c.mergeado = prev.get(c.fila);
            })
          )
        );
        showToast("Error al guardar merge · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  // Modo debug (solo admins): los correos del backend y de los avisos van al
  // buzón de pruebas en vez de al equipo. Persistido en el Apps Script.
  const setModoDebug = useCallback(
    async (val) => {
      const prev = !!ERef.current.modoDebug;
      applyE((d) => { d.modoDebug = val; });
      try {
        await call("setModoDebug", { val, fechaStr: ERef.current.fechaSeleccionada });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
        showToast(
          val ? "Modo debug ACTIVADO · los correos van al buzón de pruebas" : "Modo debug desactivado · correos al equipo",
          "success",
          3200
        );
      } catch (e) {
        applyE((d) => { d.modoDebug = prev; });
        showToast("No se pudo cambiar el modo debug · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  // Check "Probado" por componente (optimista, como chkMerge / updOkProy).
  const chkProbado = useCallback(
    async (fila, val) => {
      let prev;
      applyE((d) => d.proyectos.forEach((p) => p.componentes.forEach((c) => { if (c.fila === fila) { prev = c.probado; c.probado = val; } })));
      try {
        await call("actualizarProbadoComponente", { fila, val });
        cacheSet(ERef.current.fechaSeleccionada, ERef.current);
      } catch (e) {
        applyE((d) => d.proyectos.forEach((p) => p.componentes.forEach((c) => { if (c.fila === fila) c.probado = prev; })));
        showToast("Error al guardar 'Probado' · " + e.message, "error");
      }
    },
    [applyE, call, showToast]
  );

  // Checks pre generales (debounce 400 ms, envía los 4 a la vez — como el legacy).
  const setCheckPre = useCallback(
    (id, patch) => {
      const next = applyE((d) => {
        const cp = (d.checksPre = d.checksPre || {});
        const cur = (cp[id] = { aplica: "APLICA", ok: false, ...(cp[id] || {}) });
        Object.assign(cur, patch);
        if (cur.aplica !== "APLICA") cur.ok = false; // NA → check apagado
      });
      clearTimeout(preTimer.current);
      preTimer.current = setTimeout(async () => {
        const cp = ERef.current.checksPre || {};
        const get = (k) => ({ aplica: cp[k]?.aplica ?? "APLICA", ok: !!cp[k]?.ok });
        const checks = { dpPro: get("dpPro"), jiraOk: get("jiraOk"), remOk: get("remOk"), docPruebas: get("docPruebas") };
        try {
          await call("actualizarChecksPre", { fila: ERef.current.fila, checks });
          cacheSet(ERef.current.fechaSeleccionada, ERef.current);
        } catch (e) {
          showToast("Error al guardar · " + e.message, "error");
        }
      }, 400);
      return next;
    },
    [applyE, call, showToast]
  );

  // Cabecera (CRQ / liderar / aprender / inst. técnica) — debounce 500 ms.
  const scheduleCabSave = useCallback(
    (next) => {
      clearTimeout(cabTimer.current);
      cabTimer.current = setTimeout(async () => {
        applyE((d) => { d.crq = next.crq; d.liderar = next.liderar; d.aprender = next.aprender; d.instTecnica = next.instTecnica; });
        try {
          await call("guardarCabecera", {
            fila: ERef.current.fila,
            crq: next.crq, lider: next.liderar, aprende: next.aprender, instTecnica: next.instTecnica,
          });
          cacheSet(ERef.current.fechaSeleccionada, ERef.current);
        } catch (e) {
          showToast("Error al guardar · " + e.message, "error");
        }
      }, 500);
    },
    [applyE, call, showToast]
  );

  // ── Orden del pase: manipulación local + autosave 700 ms ──
  const guardarOrdenLocal = useCallback(
    (next) => {
      ordenDirtyRef.current = true; // protege tempOrden hasta confirmar el guardado
      setTempOrden(next);
      applyE((d) => {
        d.ordenPase = next.map((el, i) => ({ fila: i + 1, orden: i + 1, elemento: el.elemento, implantado: false, som: el.som }));
      });
      clearTimeout(ordenTimer.current);
      ordenTimer.current = setTimeout(async () => {
        try {
          // El uid es solo local (keys del drag & drop): no se envía al backend.
          const elementos = next.map(({ elemento, som }) => ({ elemento, som }));
          await call("actualizarOrdenCompleto", { fechaStr: ERef.current.fechaSeleccionada, elementos });
          cacheSet(ERef.current.fechaSeleccionada, ERef.current);
          // Guardado OK: ventana de gracia para ignorar revalidaciones que ya
          // estaban en vuelo con el orden antiguo.
          ordenDirtyRef.current = false;
          ordenGraceUntil.current = Date.now() + 5000;
        } catch (e) {
          // Guardado fallido: seguimos dirty → no se pierde el orden local.
          showToast("Error al guardar secuencia · " + e.message, "error");
        }
      }, 700);
    },
    [applyE, call, showToast]
  );

  const ordenOps = useMemo(
    () => ({
      addPaso: (str) => guardarOrdenLocal([...tempOrden, { elemento: str, som: "", uid: ++ordenUidSeq.current }]),
      removePaso: (idx) => guardarOrdenLocal(tempOrden.filter((_, i) => i !== idx)),
      movePaso: (idx, delta) => {
        const dst = idx + delta;
        if (dst < 0 || dst >= tempOrden.length) return;
        const next = [...tempOrden];
        [next[idx], next[dst]] = [next[dst], next[idx]];
        guardarOrdenLocal(next);
      },
      // Drag & drop (Reorder.Group): recibe la lista ya reordenada.
      reorder: (next) => guardarOrdenLocal(next),
      updSom: (idx, val) => {
        const next = tempOrden.map((o, i) => (i === idx ? { ...o, som: val } : o));
        guardarOrdenLocal(next);
      },
    }),
    [guardarOrdenLocal, tempOrden]
  );

  // ── Notificación de modificación (modo edición con el pase cerrado) ──
  const notificarModificacion = useCallback(
    async (comentario) => {
      const t = showToast("Notificando al equipo…", "loading", 0);
      try {
        await call("notificarModificacion", {
          fila: ERef.current.fila,
          fechaStr: ERef.current.fechaSeleccionada,
          comentario,
        });
        removeToast(t);
        setEdicion(false);
        showToast("Correo enviado · pase modificado", "success", 2500);
      } catch (e) {
        removeToast(t);
        showToast("No se pudo notificar · " + e.message, "error");
      }
    },
    [call, removeToast, showToast]
  );

  // ── Validador + avances de fase ──
  const validador = useMemo(() => (E ? computeValidador(E, cab, tempOrden) : null), [E, cab, tempOrden]);

  const validarYAvanzarPrep = () => {
    if (!validador?.todoCorrecto) {
      setValidadorFlash((n) => n + 1);
      return showToast("Revisa el validador", "error", 3500);
    }
    // Revisión final: el Resumen del pase en pop-up antes de cerrar de verdad.
    setResumenModal(true);
  };

  // Confirmación del pop-up de Resumen → cierra la preparación sin más confirm.
  const confirmarCierrePrep = () => {
    setResumenModal(false);
    estructural(
      "avanzarFase",
      { fila: ERef.current.fila, fechaStr: ERef.current.fechaSeleccionada, faseActual: ERef.current.faseActual },
      { loadingMsg: "Cerrando preparación…", okMsg: "Preparación cerrada" }
    );
  };
  const validarYAvanzarPre = () => {
    const cp = ERef.current.checksPre || {};
    for (const id of ["dpPro", "jiraOk", "remOk", "docPruebas"]) {
      const aplica = (cp[id]?.aplica ?? "APLICA") === "APLICA";
      if (aplica && !cp[id]?.ok) return showToast("Completa los checks generales que aplican", "error", 4000);
    }
    const sinAns = (ERef.current.proyectos || []).filter((p) => !p.correoAns).map((p) => p.nombre);
    if (sinAns.length > 0) return showToast("Falta marcar correo ANS enviado en: " + sinAns.join(", "), "error", 5000);
    avanzar();
  };
  const validarYCompletarImplantacion = () => {
    const falta = ERef.current.ordenPase.some((o) => !isT(o.implantado));
    if (falta) return showToast("Faltan pasos por marcar como implantados", "error", 4000);
    avanzar();
  };
  const validarYFinalizarPase = () => {
    // Validación por UNIDADES de mergeo (Workstation, ObjetosGS, javas…):
    // lo excluido (DataX, API, aperiódicos, directorios, cadenas) no bloquea.
    const pendientes = computeMergeUnits(ERef.current).filter((u) => !u.mergeado);
    if (pendientes.length)
      return showToast("Faltan mergeos: " + pendientes.map((u) => u.label.replace(/^Mergear( ·)? /, "")).join(", "), "error", 5000);
    avanzar();
  };

  const bombaNuclear = async () => {
    if (!confirm("¿Borrar TODOS los datos del Excel? Esta acción no se puede deshacer.")) return;
    setBoot("loading");
    setBootMsg("Vaciando el Excel…");
    try {
      await call("debugTotal", {});
      try { sessionStorage.clear(); } catch {}
      cargarCompleto(null, true);
    } catch (e) {
      setBoot("ready");
      showToast("Error de borrado · " + e.message, "error");
    }
  };

  // ── Registro de drafts (para el beacon de beforeunload) ──
  const registerDraft = useCallback((fila, draft) => { draftsRef.current.set(fila, draft); }, []);
  const unregisterDraft = useCallback((fila) => { draftsRef.current.delete(fila); }, []);

  /* ───────────── Render ───────────── */
  const cfg = FASE_CFG[fase] || { panel: "PROYECTOS", tabs: [] };
  const enabledTabs = new Set(cfg.tabs);
  const isCompletado = fase === "COMPLETADO";
  // Proyectos editable en preparación, o en modo edición puntual (pase cerrado,
  // nunca COMPLETADO); al salir de la edición se notifica al equipo por correo.
  const edicionActiva = edicion && !isCompletado;
  const proyectosLocked = fase !== "FASE_2_3_PREPARACION" && !edicionActiva;

  const ctx = {
    E, fase, isCompletado, proyectosLocked, isAdmin,
    edicion: edicionActiva, setEdicion,
    cab, setCab, scheduleCabSave,
    tempOrden, ordenOps,
    validador, validadorFlash,
    tpls: { jira: jiraTpl, enoa: enoaTpl, nova: novaTpl },
    showToast, removeToast,
    setActivePanel,
    abrirComandos: setDrawerElemento,
    registerDraft, unregisterDraft,
    actions: {
      comenzarPase, responderEncuesta, cancelarSubida, activarEmergencia,
      addProyecto, delProyecto, addCompVacio, delComp, saveComp,
      updOkProy, programarSaveIdTraspaso, updCorreoAns, setCheckPre,
      chkOrden, updSomEjecucion, chkMerge, chkMergeUnidad, chkProbado,
      notificarModificacion,
      validarYAvanzarPrep, validarYAvanzarPre, validarYCompletarImplantacion, validarYFinalizarPase,
    },
  };

  const panelAnim = reduce
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.2 } };

  return (
    <PasesCtx.Provider value={ctx}>
      <main className="relative min-h-dvh w-full">
      <ArtBanner src={ART.proyectos} />
        <AmbientBackground />
        <div className="mx-auto w-full max-w-[1600px] px-5 pb-24 pt-28 sm:px-6">
          {/* Cabecera de página */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-2 font-sans text-xs font-bold uppercase tracking-[0.3em] text-lime/80">Proyectos</p>
              <h2 className="flex items-center gap-3 font-display text-3xl font-bold tracking-tight text-sand sm:text-4xl">
                <span className="grid h-11 w-11 place-items-center rounded-xl border" style={{ borderColor: rgba(accent, 0.35), background: rgba(accent, 0.12), color: accent }}>
                  <IconRocket size={24} />
                </span>
                Pases Calendados
              </h2>
              <p className="mt-1.5 text-sm text-sand/65">Releases por entorno · ciclo completo del pase a producción</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {links?.getUrl && links.getUrl("pasesSheet") && (
                <a
                  href={links.getUrl("pasesSheet")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BTN.ghost}
                  title="Abrir el Google Sheets de Pases Calendados"
                >
                  <IconExternal size={14} /> Abrir Sheets
                </a>
              )}
              <DebugPill on={!!E?.modoDebug} isAdmin={isAdmin} onToggle={setModoDebug} />
              <NetDot inflight={inflight} error={netErr} />
            </div>
          </div>

          {boot === "loading" && <BootSkeleton msg={bootMsg} />}

          {boot === "error" && (
            <section className={`${CARD_CLS} border-mandarin/40 p-8 text-center`} role="alert">
              <p className="font-display text-xl font-bold text-mandarin">No se pudo cargar el pase</p>
              <p className="mx-auto mt-2 max-w-lg text-sm text-sand/70">{bootMsg}</p>
              <button type="button" className={`${BTN.accent} mt-6`} onClick={() => cargarCompleto(null, true)}>
                <IconRefresh size={16} /> Reintentar
              </button>
            </section>
          )}

          {boot === "ready" && E && (
            <>
              <CabeceraControles ctx={ctx} onCambiarFecha={(f) => cargarCompleto(f)} />

              {/* Timeline de fases */}
              <Stepper tabs={TABS} enabled={enabledTabs} active={activePanel} onSelect={setActivePanel} fase={fase} />

              <AnimatePresence mode="wait">
                <motion.div key={activePanel} {...panelAnim}>
                  {activePanel === "PENDIENTE" && (
                    <EstadoCard icon={<CalendarIcon fecha={E.fechaSeleccionada} />} title="Pase calendado no iniciado">
                      <button type="button" className={BTN.success} onClick={comenzarPase}>Comenzar pase</button>
                    </EstadoCard>
                  )}
                  {activePanel === "ENCUESTA" && (
                    <EstadoCard
                      icon={<span className="grid h-16 w-16 place-items-center rounded-2xl border border-serene/40 bg-serene/10 text-serene"><IconRocket size={32} /></span>}
                      title="¿Tenemos subida en este pase?"
                    >
                      <p className="max-w-md text-sm text-sand/65">Confirma si vuestros proyectos se incluyen en el pase calendado.</p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <button type="button" className={BTN.success} onClick={() => responderEncuesta("SI")}>Sí, adelante</button>
                        <button type="button" className={BTN.danger} onClick={() => responderEncuesta("NO")}>No hay subida</button>
                      </div>
                    </EstadoCard>
                  )}
                  {activePanel === "DESCANSO" && (
                    <EstadoCard
                      icon={<span className="grid h-16 w-16 place-items-center rounded-2xl border border-purple/40 bg-purple/10 text-purple"><IconMoon size={32} /></span>}
                      title="Semana de descanso"
                    >
                      <p className="max-w-md text-sm text-sand/65">No hay subida este pase. Si surge una urgencia puedes reactivarlo:</p>
                      <button type="button" className={BTN.warn} onClick={activarEmergencia}>Reactivar pase de emergencia</button>
                    </EstadoCard>
                  )}
                  {activePanel === "COMPLETADO" && (
                    // Superficie lime LITERAL: idéntica en ambos temas; texto Electric encima (regla 9).
                    <section className="relative overflow-hidden rounded-2xl border border-[#88E783] bg-[#88E783] px-6 py-14 text-center text-[#001391]">
                      <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-electric/10"><IconCheck size={34} /></span>
                      <h2 className="mt-5 font-display text-3xl font-bold sm:text-5xl">Pase completado al 100 %</h2>
                      <p className="mx-auto mt-3 max-w-xl text-base sm:text-lg">
                        Todos los proyectos están operativos en producción y las ramas mergeadas correctamente.
                      </p>
                      <div className="mx-auto mt-6 inline-block max-w-xl rounded-lg border-l-4 border-electric bg-electric/[0.08] p-4 text-left">
                        <p className="flex items-center gap-2 font-bold"><IconLock size={16} /> Pase en modo solo lectura</p>
                        <p className="mt-1.5 text-[13px]">El registro se ha bloqueado. Puedes navegar por las pestañas para revisar el historial.</p>
                      </div>
                    </section>
                  )}
                  {activePanel === "PROYECTOS" && <Proyectos />}
                  {activePanel === "SECUENCIA" && <Secuencia />}
                  {activePanel === "PRE" && <PreChecks />}
                  {activePanel === "ORDEN" && <Ejecucion />}
                  {activePanel === "POST" && <Mergeos />}
                  {activePanel === "RESUMEN" && <Resumen />}
                </motion.div>
              </AnimatePresence>
            </>
          )}

          {/* Footer utilitario (el co-branding NFQ lo pone AppFrame) */}
          {boot === "ready" && (
            <footer className="mt-14 flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-sand/40">
              <span>Pases Calendados RDR · BBVA × NFQ</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={bombaNuclear}
                  title="DEBUG: vaciar el Excel"
                  className="rounded-md border border-white/15 px-2.5 py-1 opacity-50 transition hover:opacity-100 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                >
                  DEBUG · Reset
                </button>
              )}
            </footer>
          )}
        </div>

        {/* Toasts */}
        <div className="pointer-events-none fixed bottom-5 right-5 z-[95] flex max-w-[360px] flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2 rounded-lg border-l-[3px] bg-midnight/95 px-4 py-3 text-[13px] font-bold text-sand shadow-lg backdrop-blur ${
                t.type === "error" ? "border-mandarin" : t.type === "loading" ? "border-serene" : "border-lime"
              }`}
            >
              {t.type === "loading" && (
                <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-sand/25 border-t-sand" aria-hidden />
              )}
              <span>{t.msg}</span>
            </div>
          ))}
        </div>

        <CmdDrawer elemento={drawerElemento} onClose={() => setDrawerElemento(null)} />

        {/* Pop-up de revisión final: el Resumen del pase antes de cerrar la
            preparación y avanzar a pre-implantación. */}
        <AnimatePresence>
          {resumenModal && (
            <div className="fixed inset-0 z-[97] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Revisión final del pase">
              <motion.button
                type="button"
                aria-label="Cancelar cierre"
                onClick={() => setResumenModal(false)}
                className="absolute inset-0 h-full w-full cursor-default bg-midnight/70 backdrop-blur-sm"
                {...(reduce ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } })}
              />
              <motion.div
                className="relative flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-midnight shadow-2xl"
                {...(reduce ? {} : { initial: { opacity: 0, y: 16, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: 10, scale: 0.98 }, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } })}
              >
                <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime/80">Revisión final</p>
                    <h3 className="mt-1 font-display text-lg font-bold text-sand">
                      Comprueba el resumen antes de cerrar la preparación
                    </h3>
                  </div>
                  <button
                    type="button"
                    aria-label="Cerrar (sin avanzar)"
                    onClick={() => setResumenModal(false)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sand/70 transition hover:bg-white/10 hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    ✕
                  </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <Resumen />
                </div>
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
                  <button type="button" className={BTN.ghost} onClick={() => setResumenModal(false)}>
                    Volver a revisar
                  </button>
                  <button type="button" className={BTN.success} onClick={confirmarCierrePrep}>
                    Todo correcto · Cerrar preparación y notificar
                  </button>
                </footer>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>
    </PasesCtx.Provider>
  );
}

/* ── Cabecera del pase: fecha + CRQ + liderar/aprender + instalación técnica ── */
function CabeceraControles({ ctx, onCambiarFecha }) {
  const { E, cab, setCab, scheduleCabSave, isCompletado } = ctx;
  const lockCls = isCompletado ? "pointer-events-none opacity-55 grayscale-[40%] select-none" : "";

  const upd = (patch, save = true) => {
    const next = { ...cab, ...patch };
    setCab(next);
    if (save) scheduleCabSave(next);
  };

  return (
    <section className={`${CARD_CLS} mb-5 p-4 sm:p-5`} aria-label="Cabecera del pase">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Fecha del pase">
          <select className={SELECT_CLS} value={E.fechaSeleccionada || ""} onChange={(e) => onCambiarFecha(e.target.value)}>
            {(E.fechasDisponibles || []).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </Field>
        <div className={lockCls} style={{ display: "contents" }}>
          <Field label="CRQ general" className={lockCls}>
            <div className="flex gap-1.5">
              <input
                type="text"
                className={INPUT_CLS}
                placeholder="CRQ000…"
                autoComplete="off"
                value={cab.crq}
                onChange={(e) => upd({ crq: e.target.value }, false)}
              />
              <button
                type="button"
                title="Guardar cabecera"
                aria-label="Guardar cabecera"
                onClick={() => scheduleCabSave(cab)}
                className="grid w-10 shrink-0 place-items-center rounded-lg bg-[#85C8FF] text-[#001391] transition hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <IconSave size={15} />
              </button>
            </div>
          </Field>
          <Field label="Liderar" className={lockCls}>
            <select className={SELECT_CLS} value={cab.liderar} onChange={(e) => upd({ liderar: e.target.value })}>
              <option value="">Elegir…</option>
              {(E.equipo || []).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Aprender" className={lockCls}>
            <select className={SELECT_CLS} value={cab.aprender} onChange={(e) => upd({ aprender: e.target.value })}>
              <option value="">Elegir…</option>
              {(E.equipo || []).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
          <div className={`flex flex-col gap-1 ${lockCls}`}>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-sand/60">Validación fase 2</span>
            <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-mandarin/30 bg-mandarin/10 px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#FFB56B]"
                checked={cab.instTecnica}
                onChange={(e) => upd({ instTecnica: e.target.checked })}
              />
              <span className="text-xs font-bold text-sand">Instalación técnica</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Stepper / timeline de fases (pestañas) ── */
function Stepper({ tabs, enabled, active, onSelect, fase }) {
  // Índice de la fase "actual" para la jerarquía visual del timeline.
  const currentIdx =
    fase === "FASE_2_3_PREPARACION" ? 0
      : fase === "FASE_4_CERRADO" ? 2
      : fase === "FASE_6_IMPLANTACION" ? 3
      : fase === "FASE_7_POST" ? 4
      : fase === "COMPLETADO" ? 5
      : -1;

  return (
    <nav aria-label="Fases del pase" className="mb-6 overflow-x-auto pb-1">
      <ol className="flex min-w-max items-stretch gap-2">
        {tabs.map((tab, i) => {
          const on = enabled.has(tab.id);
          const isActive = active === tab.id;
          const done = currentIdx > i;
          return (
            <li key={tab.id} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!on}
                aria-current={isActive ? "step" : undefined}
                onClick={() => onSelect(tab.id)}
                className={`group flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
                  isActive
                    ? "border-lime/60 bg-lime/10"
                    : on
                    ? "border-white/12 bg-white/[0.04] hover:border-lime/40 hover:bg-white/[0.08]"
                    : "cursor-not-allowed border-white/[0.06] bg-transparent opacity-35"
                }`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold tabular-nums ${
                    done
                      ? "border-lime/50 bg-lime/20 text-lime"
                      : isActive
                      ? "border-[#88E783] bg-[#88E783] text-[#001391]" // superficie literal: en claro bg-lime se oscurecería bajo texto Electric
                      : "border-white/20 text-sand/60"
                  }`}
                  aria-hidden
                >
                  {done ? <IconCheck size={13} /> : tab.n}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-bold leading-tight ${isActive ? "text-lime" : "text-sand/85"}`}>{tab.t}</span>
                  <span className="block text-[10px] leading-tight text-sand/50">{tab.s}</span>
                </span>
              </button>
              {i < tabs.length - 1 && <span aria-hidden className={`h-px w-4 shrink-0 sm:w-6 ${done ? "bg-lime/50" : "bg-white/15"}`} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── Skeleton de carga (SWR frío) ── */
function BootSkeleton({ msg }) {
  return (
    <div aria-busy="true" aria-label={msg}>
      <div className={`${CARD_CLS} mb-5 p-5`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rdr-skel h-14 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rdr-skel h-14 w-44 shrink-0 rounded-xl" />
        ))}
      </div>
      <div className={`${CARD_CLS} p-5`}>
        <div className="rdr-skel mb-4 h-8 w-1/3 rounded-lg" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rdr-skel mb-2.5 h-12 rounded-lg" />
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-sand/60">{msg}</p>
    </div>
  );
}
