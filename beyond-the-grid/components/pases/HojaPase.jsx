"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePases } from "./PasesRoute";
import IconoBBVA from "@/components/iconosBBVA";
import { nombresCortos } from "@/components/vacaciones/vistaUsuario";
import { RE_ID_TRASPASO, isT, limpiarMulti } from "./backend";
import {
  analizarPegado, avisos as calcAvisos, colorSubida, esArranque, esParada, etiquetaDp, guardarEquiv, leerEquiv,
  malColocados, modelo, normCod, plural, schemaDe, cumpleSchema, prefijoSchema, sinTilde, tipoPorNombre,
} from "./hoja";
import { extraerCodigosDeElemento } from "./comandos";

/* Hoja de preparación del pase: una sola tabla densa, agrupada por paquete
   (DP) en el orden de implantación, por proyecto o por encargado. Cambios en
   bloque (marcar, arrastrar, «Mover a»), alta rápida, pegado desde Excel con
   equivalencias de tipo y los checks que deja cerrar la preparación.
   Sustituye a las antiguas pestañas «Preparación» y «Orden del pase». */

const ic = (n, s = 14) => <IconoBBVA nombre={n} size={s} />;
const ATAJO_CAMPO = (el) => el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type !== "checkbox"));

export default function HojaPase() {
  const P = usePases();
  const { E, fase, cab, setCab, scheduleCabSave, tempOrden, ordenOps, validador, actions, proyectosLocked, edicion, setEdicion, isCompletado, showToast, inflight, estadoOrden, reintentarOrden } = P;
  const editable = !proyectosLocked && !isCompletado;
  const cerrada = fase !== "FASE_2_3_PREPARACION";

  // ── Estado de la vista ──
  const [vista, setVista] = useState("paquete");
  const [filtro, setFiltro] = useState("");
  const [buscar, setBuscar] = useState("");
  const [desplegados, setDesplegados] = useState(() => new Set()); // por defecto, todo plegado
  const [editCod, setEditCod] = useState(null); // { cod, valor } mientras se renombra un paquete
  const renombrando = useRef(false);
  const [marcadas, setMarcadas] = useState(() => new Set());
  const ultima = useRef(null);
  const [anadir, setAnadir] = useState(null); // { dp } | { proy }
  const [nota, setNota] = useState(null); // fila con el comentario abierto
  const [dlg, setDlg] = useState(null);
  const [verChecks, setVerChecks] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [soltar, setSoltar] = useState(null);
  const [aviso, setAviso] = useState(null); // { msg, deshacer }
  const [dpMeta, setDpMeta] = useState({});
  const [ancho, setAncho] = useState(1366);
  const destino = useRef({ dp: null, proy: "" });
  const arrastre = useRef(null);
  const pila = useRef([]);
  const raiz = useRef(null);
  const herr = useRef(null);
  const tAviso = useRef();

  const m = useMemo(() => modelo(E, tempOrden, dpMeta), [E, tempOrden, dpMeta]);
  const cortos = useMemo(() => nombresCortos(E.equipo || []), [E.equipo]);
  const nc = (n) => cortos[n] || n;
  const tipos = E.tiposComp || [];
  const subidas = E.tiposSubida || [];
  const dpDe = (cod) => m.dps.find((d) => d.cod === cod);
  const avisos = useMemo(() => calcAvisos(m), [m]);
  const mal = useMemo(() => malColocados(m), [m]);
  // Pasos repetidos: el mismo paquete en dos pasos del orden. Solo el primero
  // muestra sus componentes; los demás se marcan para quitarlos.
  const repetido = useMemo(() => {
    const visto = new Set(), out = new Set();
    m.pasos.forEach((p) => { if (p.t !== "dp") return; const k = p.cod; if (visto.has(k)) out.add(`${p.i}:${p.k}`); else visto.add(k); });
    return out;
  }, [m]);

  // ── Ancho disponible → columnas (nunca scroll lateral) ──
  useEffect(() => {
    const f = () => setAncho(window.innerWidth);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  // Altura de la barra de herramientas fija → los títulos de columna se pegan debajo.
  useEffect(() => {
    if (!herr.current || !raiz.current) return;
    const ro = new ResizeObserver(() => raiz.current?.style.setProperty("--herr-h", herr.current.offsetHeight + "px"));
    ro.observe(herr.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle("ph-con-lote", marcadas.size > 0 && editable);
    return () => document.body.classList.remove("ph-con-lote");
  }, [marcadas.size, editable]);

  // DP con componentes que aún no están en el orden: se colocan antes del arranque.
  useEffect(() => {
    // Solo con el orden ya cargado del servidor (si no, se reharía el orden solo con los DP).
    if (!editable || renombrando.current || !m.fuera.length || (!tempOrden.length && (E.ordenPase || []).length)) return;
    const texto = tempOrden.map((o) => String(o.elemento || "").toUpperCase()).join(" | ");
    const faltan = m.fuera.filter((d) => !texto.includes(d.cod.toUpperCase()));
    if (!faltan.length) return;
    const iA = tempOrden.findIndex((o) => esArranque(o.elemento));
    const nuevos = faltan.map((d) => ({ elemento: etiquetaDp(d.subida, d.cod), som: "" }));
    const next = [...tempOrden];
    next.splice(iA < 0 ? next.length : iA, 0, ...nuevos);
    ordenOps.set(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, m.fuera.map((d) => d.cod).join("|")]);

  // ── Avisos con deshacer y pila de Ctrl+Z ──
  const avisar = useCallback((msg, deshacer) => {
    setAviso({ msg, deshacer: deshacer || null });
    clearTimeout(tAviso.current);
    tAviso.current = setTimeout(() => setAviso(null), deshacer ? 8000 : 3500);
  }, []);
  const conDeshacer = (msg, deshacer) => {
    pila.current.push({ msg, deshacer });
    if (pila.current.length > 30) pila.current.shift();
    avisar(msg, async () => {
      pila.current = pila.current.filter((x) => x.deshacer !== deshacer);
      await deshacer();
      avisar("Deshecho");
    });
  };
  const deshacerUltimo = async () => {
    const u = pila.current.pop();
    if (!u) return avisar("No hay nada que deshacer");
    await u.deshacer();
    avisar(`Deshecho: ${u.msg}`);
  };

  // ── Operaciones sobre los datos ──
  const lote = async (cambios, msg) => {
    if (!editable || !cambios.length) return;
    const previos = await actions.editarLote(cambios);
    if (previos && msg) conDeshacer(msg, () => actions.editarLote(previos));
  };
  const setCampo = (c, campo, valor) => lote([{ fila: c.fila, [campo]: valor }]);
  const moverA = (filas, cod) => {
    const dp = cod ? dpDe(cod) : null;
    const cambios = filas.map((f) => {
      const c = m.comps.find((x) => x.fila === f);
      const viejo = dpDe(c.cod);
      const heredaba = !c.resp || (viejo && c.resp === viejo.enc);
      return { fila: f, codigo: cod, subida: dp?.subida || c.subida, resp: heredaba ? (dp?.enc || c.resp) : c.resp };
    });
    setMarcadas(new Set());
    return lote(cambios, `${plural(filas.length, "componente movido", "componentes movidos")} a ${cod || "Sin paquete"}`);
  };
  const setOrden = (next, msg) => {
    const antes = tempOrden.map(({ elemento, som }) => ({ elemento, som }));
    ordenOps.set(next.map(({ elemento, som, uid }) => ({ elemento, som: som || "", uid })));
    if (msg) conDeshacer(msg, async () => ordenOps.set(antes));
  };
  const insertarAntesDeArranque = (elems) => {
    const iA = tempOrden.findIndex((o) => esArranque(o.elemento));
    const next = [...tempOrden];
    next.splice(iA < 0 ? next.length : iA, 0, ...elems.map((elemento) => ({ elemento, som: "" })));
    return next;
  };
  const moverPaso = (i, j) => {
    if (j < 0 || j >= tempOrden.length || i === j) return;
    const next = [...tempOrden];
    const [x] = next.splice(i, 1);
    next.splice(j, 0, x);
    setOrden(next, "Orden cambiado");
  };
  // Del todo arriba o abajo respetando las reglas: un DP no sube por encima de
  // la parada y un REQ no baja por debajo del arranque.
  const destinoExtremo = (i, arriba) => {
    const iP = tempOrden.findIndex((o) => esParada(o.elemento));
    const iA = tempOrden.findIndex((o) => esArranque(o.elemento));
    const cods = extraerCodigosDeElemento(tempOrden[i]?.elemento);
    const esDp = cods.length > 0;
    const req = esDp && cods.every((x) => /^REQ-?\d/i.test(x));
    if (arriba) return esDp && !req && iP >= 0 && i > iP ? iP + 1 : 0;
    if (req && iA >= 0 && i < iA) return iA - 1;
    return tempOrden.length - 1;
  };
  const moverExtremo = (i, arriba) => {
    const j = destinoExtremo(i, arriba);
    if (j === i) return avisar(arriba ? "Ya está lo más arriba posible" : "Ya está lo más abajo posible");
    const next = [...tempOrden];
    const [x] = next.splice(i, 1);
    next.splice(j, 0, x);
    setOrden(next, arriba ? "Movido arriba del todo" : "Movido abajo del todo");
  };
  const renombrarDp = async (d, crudo) => {
    setEditCod(null);
    const nuevo = normCod(crudo);
    if (!nuevo || nuevo === d.cod) return;
    if (extraerCodigosDeElemento(nuevo).map((x) => x.toUpperCase()).join("|") !== nuevo)
      return showToast(`«${nuevo}» no es un código de paquete (DP-KYTL-…, REQ…, SS-…, ARQDAT-…)`, "error", 5000);
    const sc = schemaDe(E, d.subida);
    if (!cumpleSchema(nuevo, sc)) return showToast(`El código de un ${d.subida} empieza por ${prefijoSchema(sc)}`, "error", 5000);
    if (m.dps.some((x) => x.cod === nuevo)) return showToast(`${nuevo} ya está en el pase`, "error", 4500);
    const antes = tempOrden.map(({ elemento, som, uid }) => ({ elemento, som: som || "", uid }));
    renombrando.current = true;
    try {
      if (d.i !== undefined) {
        const next = [...tempOrden];
        const re = new RegExp(d.cod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        next[d.i] = { ...next[d.i], elemento: re.test(next[d.i].elemento) ? next[d.i].elemento.replace(re, nuevo) : etiquetaDp(d.subida, nuevo) };
        ordenOps.set(next);
      }
      setDpMeta((x) => { if (!x[d.cod]) return x; const n = { ...x, [nuevo]: x[d.cod] }; delete n[d.cod]; return n; });
      setDesplegados((s) => { if (!s.has(d.cod)) return s; const n = new Set(s); n.delete(d.cod); n.add(nuevo); return n; });
      const previos = d.comps.length ? await actions.editarLote(d.comps.map((c) => ({ fila: c.fila, codigo: nuevo }))) : null;
      conDeshacer(`${d.cod} ahora es ${nuevo}`, async () => {
        renombrando.current = true;
        try { ordenOps.set(antes); if (previos) await actions.editarLote(previos); } finally { renombrando.current = false; }
      });
    } finally { renombrando.current = false; }
  };
  const quitarDp = async (d) => {
    // Si el paquete sale en más de un paso, la × quita solo ese paso (sus componentes siguen en el otro).
    if (m.pasos.filter((p) => p.t === "dp" && p.cod === d.cod).length > 1) {
      const next = [...tempOrden];
      if (d.multi) next[d.i] = { ...next[d.i], elemento: next[d.i].elemento.replace(d.cod, "").replace(/\s+y\s*$|^\s*y\s+/i, "").trim() };
      else next.splice(d.i, 1);
      return setOrden(next, `Paso repetido de ${d.cod} quitado`);
    }
    if (d.comps.length) await lote(d.comps.map((c) => ({ fila: c.fila, codigo: "" })));
    if (d.i !== undefined) {
      const next = [...tempOrden];
      if (d.multi) next[d.i] = { ...next[d.i], elemento: next[d.i].elemento.replace(d.cod, "").replace(/\s+y\s*$|^\s*y\s+/i, "").trim() };
      else next.splice(d.i, 1);
      ordenOps.set(next);
    }
    avisar(`${d.cod} quitado${d.comps.length ? `: ${plural(d.comps.length, "componente pasa", "componentes pasan")} a Sin paquete` : ""}`);
  };
  const cambiarSubidaDp = (d, sub) => {
    const sc = schemaDe(E, sub);
    if (!cumpleSchema(d.cod, sc)) return showToast(`El código de un ${sub} empieza por ${prefijoSchema(sc)}: ${d.cod} no vale`, "error", 4500);
    if (d.comps.length) lote(d.comps.map((c) => ({ fila: c.fila, subida: sub })), `${d.cod}: subida ${sub}`);
    else setDpMeta((x) => ({ ...x, [d.cod]: { ...x[d.cod], subida: sub } }));
    if (d.i !== undefined && !d.multi) {
      const next = [...tempOrden];
      next[d.i] = { ...next[d.i], elemento: etiquetaDp(sub, d.cod) };
      ordenOps.set(next);
    }
  };
  const cambiarEncDp = (d, enc) => {
    const hereda = d.comps.filter((c) => !c.resp || c.resp === d.enc);
    if (!d.comps.length) return setDpMeta((x) => ({ ...x, [d.cod]: { ...x[d.cod], enc } }));
    lote(hereda.map((c) => ({ fila: c.fila, resp: enc })), `${d.cod}: encargado ${enc ? nc(enc) : "quitado"} para ${plural(hereda.length, "componente", "componentes")}`);
  };
  const quitarMarcadas = async () => {
    const filas = [...marcadas];
    if (!filas.length) return;
    const fotos = m.comps.filter((c) => marcadas.has(c.fila));
    setMarcadas(new Set());
    const ok = await actions.eliminarComps(filas, `Quitando ${plural(filas.length, "componente", "componentes")}…`);
    if (ok) conDeshacer(`${plural(filas.length, "componente quitado", "componentes quitados")} del pase`, () => actions.agregarComps(fotos, "Recuperando…"));
  };
  const alta = async (items, msg) => {
    const filas = await actions.agregarComps(items, msg);
    if (filas) conDeshacer(`${plural(items.length, "componente añadido", "componentes añadidos")}`, () => actions.eliminarComps(filas, "Deshaciendo…"));
    return filas;
  };

  // ── Filtros ──
  const FILTROS_COMP = ["prob", "rel", "street", "sinpaq"];
  const filtraComp = FILTROS_COMP.includes(filtro) || !!buscar;
  const pasa = (c) =>
    (!buscar || sinTilde(c.nombre).includes(sinTilde(buscar))) &&
    (filtro !== "prob" || !c.probado) && (filtro !== "rel" || !c.release) && (filtro !== "sinpaq" || !c.cod) &&
    (filtro !== "street" || /rdrRules\/|streetref/i.test(c.nombre || ""));

  // ── Columnas según el ancho ──
  const W = Math.min(ancho, 1600) - (ancho >= 640 ? 48 : 40);
  let cols = vista === "proyecto" ? ["tipo", "dp"] : vista === "persona" ? ["tipo", "proy", "dp"] : ["tipo", "proy"];
  cols = [...cols, "enc", "rel", "prob", "us"];
  if (W < 1000) cols = cols.filter((k) => k !== "us");
  if (W < 860) cols = cols.filter((k) => k !== "proy" && (vista !== "persona" || k !== "tipo"));
  if (W < 700) cols = cols.filter((k) => !["tipo", "dp", "rel"].includes(k));
  const COLW = { tipo: 124, proy: 150, dp: vista === "proyecto" ? 240 : 200, enc: 140, rel: 58, prob: 58, us: 150 };
  const COLT = { tipo: "Tipo", proy: "Proyecto", dp: "Paquete", enc: "Encargado", rel: "tech-kytl", prob: "Probado", us: "Historias" };
  const span = cols.length + 1;

  // ── Checks ──
  const items = validador?.items || [];
  const nComps = m.comps.length;
  const etiquetaCheck = (it) => {
    switch (it.id) {
      case "proy": return "Añade un proyecto";
      case "proycomp": return `${m.proys.filter((p) => !p.n).map((p) => p.corto).join(", ")} sin componentes`;
      case "okp": return `OK proyecto ${m.proys.filter((p) => p.ok).length}/${m.proys.length}`;
      case "tras": return `ID traspaso: faltan ${validador.proysSinIdT?.length || 0}`;
      case "rel": return `tech-kytl ${m.comps.filter((c) => c.release).length}/${nComps}`;
      case "prob": return `Probados ${m.comps.filter((c) => c.probado).length}/${nComps}`;
      case "street": return "Falta Streetref";
      case "orden": return `Orden: ${it.txt.replace(/^Faltan paquetes o están antes de la PARADA: /, "")}`;
      default: return it.txt;
    }
  };
  const AYUDA = {
    proycomp: "Cada proyecto del pase necesita al menos un componente.",
    okp: "Cada proyecto lleva el OK de su responsable (vista Por proyecto).",
    tras: "Cada proyecto necesita un ID de traspaso que empiece por el año: AAAA-…",
    rel: "Todas las historias de usuario tienen el tech-kytl informado.",
    prob: "Todos los componentes están probados.",
    street: "Si hay rdrRules que no están en el Listado Rules de Parametrizaciones, el componente Streetref debe ir en el pase.",
    orden: "La parada va antes del arranque; los DP, después de la parada; los REQ, antes del arranque.",
  };
  const hechos = items.filter((x) => x.ok);
  const pend = items.filter((x) => !x.ok && x.id !== "crq" && x.id !== "inst");
  const nPend = items.filter((x) => !x.ok).length;
  const MAXP = 4;

  const enfoca = (sel) => setTimeout(() => {
    const el = raiz.current?.querySelector(sel);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }, 30);
  const irACheck = (id) => {
    if (!id) return setFiltro("");
    if (id === "proy") { setVista("proyecto"); return setDlg({ t: "proy", nombre: "", feature: "", cliente: "" }); }
    if (["okp", "tras", "proycomp"].includes(id)) {
      setVista("proyecto"); setFiltro("");
      const p = id === "okp" ? m.proys.find((x) => !x.ok) : id === "tras" ? m.proys.find((x) => !RE_ID_TRASPASO.test(x.idTraspaso.trim())) : m.proys.find((x) => !x.n);
      if (p) enfoca(id === "okp" ? `[data-okp="${CSS.escape(p.nombre)}"]` : id === "tras" ? `[data-tras="${CSS.escape(p.nombre)}"]` : `[data-alta-proy="${CSS.escape(p.nombre)}"]`);
      return;
    }
    if (id === "orden") {
      setVista("paquete"); setFiltro("");
      const iP = tempOrden.findIndex((o) => esParada(o.elemento)), iA = tempOrden.findIndex((o) => esArranque(o.elemento));
      if (iP < 0 || iA < 0) {
        const next = [...tempOrden];
        if (iP < 0) next.unshift({ elemento: "PARADA DEL SISTEMA", som: "" });
        if (iA < 0) next.push({ elemento: "ARRANQUE DEL SISTEMA", som: "" });
        return setOrden(next, "Parada y arranque añadidos");
      }
      const [cod, motivo] = [...mal][0] || [];
      if (cod) { const d = dpDe(cod); avisar(`${cod}: ${motivo}. Arrástralo o usa las flechas.`); enfoca(`[data-${motivo.includes("antes") ? "sube" : "baja"}="${d.i}"]`); }
      return;
    }
    if (id === "vacios") { setVista("paquete"); setFiltro(""); return avisar("Arrastra componentes a los DP vacíos o quítalos con la ×"); }
    if (id === "repes") {
      setVista("paquete"); setFiltro("");
      const r = m.pasos.find((p) => p.t === "dp" && repetido.has(`${p.i}:${p.k}`));
      if (r) { avisar(`${r.cod} sale dos veces en el orden: quita el paso marcado con la ×`); enfoca(`tr[data-paso="${r.i}"].mal .x`); }
      return;
    }
    setVista("paquete");
    setFiltro((f) => (f === id ? "" : id));
  };

  // ── Marcas ──
  const visibles = () => [...(raiz.current?.querySelectorAll("[data-marca]") || [])].map((x) => Number(x.dataset.marca));
  const marcar = (fila, on, shift) => {
    const ids = visibles();
    setMarcadas((prev) => {
      const s = new Set(prev);
      if (shift && ultima.current != null && ids.includes(ultima.current)) {
        const [a, z] = [ids.indexOf(ultima.current), ids.indexOf(fila)].sort((x, y) => x - y);
        ids.slice(a, z + 1).forEach((id) => (on ? s.add(id) : s.delete(id)));
      } else on ? s.add(fila) : s.delete(fila);
      return s;
    });
    ultima.current = fila;
  };
  const marcarGrupo = (filas) => setMarcadas((prev) => {
    const s = new Set(prev);
    const todas = filas.length && filas.every((f) => s.has(f));
    filas.forEach((f) => (todas ? s.delete(f) : s.add(f)));
    return s;
  });

  // ── Teclado y Ctrl+V como en una hoja ──
  const vivo = useRef({});
  vivo.current = { dlg, marcadas, editable, filtro, ayuda, quitarMarcadas, deshacerUltimo, abrirPegar: (t) => abrirPegar(t) };
  useEffect(() => {
    const kd = (e) => {
      const v = vivo.current;
      if (e.key === "Escape") {
        if (v.dlg) return setDlg(null);
        if (v.ayuda) return setAyuda(false);
        if (v.marcadas.size) return setMarcadas(new Set());
        if (v.filtro) return setFiltro("");
        return;
      }
      if (v.dlg || ATAJO_CAMPO(e.target) || !v.editable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); v.deshacerUltimo(); return; }
      if (e.key === "Delete" && v.marcadas.size) { e.preventDefault(); v.quitarMarcadas(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && raiz.current?.contains(document.activeElement || document.body)) {
        e.preventDefault();
        setMarcadas(new Set(visibles()));
      }
    };
    const pg = (e) => {
      const v = vivo.current;
      const txt = e.clipboardData?.getData("text") || "";
      if (v.dlg || !v.editable || ATAJO_CAMPO(e.target) || !txt.trim()) return;
      e.preventDefault();
      v.abrirPegar(txt);
    };
    window.addEventListener("keydown", kd);
    document.addEventListener("paste", pg);
    return () => { window.removeEventListener("keydown", kd); document.removeEventListener("paste", pg); };
  }, []);

  const abrirPegar = (texto = "", proy) => {
    const d = destino.current;
    const pDp = d.dp ? [...new Set((dpDe(d.dp)?.comps || []).map((c) => c.proyecto))] : [];
    setDlg({ t: "pegar", texto, proy: proy ?? (d.proy || (pDp.length === 1 ? pDp[0] : "")), dp: d.dp || "", over: {}, overNom: {}, off: new Set(), recordar: true, cambiar: false });
  };

  // ── Arrastrar y soltar ──
  const onDragStart = (e) => {
    const c = e.target.closest?.("[data-arrastra]");
    const p = e.target.closest?.("[data-arrastra-paso]");
    if (c) {
      const f = Number(c.dataset.arrastra);
      arrastre.current = { t: "comps", filas: marcadas.has(f) ? [...marcadas] : [f] };
    } else if (p) arrastre.current = { t: "paso", i: Number(p.dataset.arrastraPaso) };
    else return;
    e.dataTransfer.setData("text/plain", "pases");
    e.dataTransfer.effectAllowed = "move";
  };
  const destinoDe = (el) => {
    const a = arrastre.current;
    if (!a || !el.closest) return null;
    if (a.t === "paso") return null; // los pasos usan destinoPaso (con la posición del ratón)
    if (vista === "persona") return null;
    if (vista === "proyecto") { const tr = el.closest("tr[data-proy-g], tr[data-proy]"); const pr = tr?.dataset.proyG || tr?.dataset.proy; return pr ? { key: "g" + pr, proy: pr } : null; }
    const tr = el.closest("tr[data-dp]");
    return tr ? { key: "d" + tr.dataset.dp, dp: tr.dataset.dp } : null;
  };
  // Paso arrastrado: la fila bajo el ratón y si va antes o después (mitad de la fila).
  // Sobre los componentes de un DP desplegado, cuenta como «después de ese DP».
  const destinoPaso = (e) => {
    let tr = e.target.closest?.("tr");
    if (!tr || !tr.closest(".t tbody")) return null;
    if (tr.dataset.paso !== undefined && tr.dataset.paso !== "") {
      const r = tr.getBoundingClientRect();
      const antes = e.clientY < r.top + r.height / 2;
      return { key: `p${tr.dataset.paso}${antes ? "a" : "d"}`, paso: Number(tr.dataset.paso), antes };
    }
    let p = tr.previousElementSibling;
    while (p && (p.dataset.paso === undefined || p.dataset.paso === "")) p = p.previousElementSibling;
    return p ? { key: `p${p.dataset.paso}d`, paso: Number(p.dataset.paso), antes: false } : null;
  };
  const autoScroll = (y) => {
    const arriba = (raiz.current?.querySelector(".herr")?.getBoundingClientRect().bottom || 120) + 40;
    if (y < arriba) window.scrollBy(0, -Math.min(30, (arriba - y) / 2 + 6));
    else if (y > window.innerHeight - 70) window.scrollBy(0, Math.min(30, (y - window.innerHeight + 70) / 2 + 6));
  };
  const onDragOver = (e) => {
    if (arrastre.current) autoScroll(e.clientY);
    if (arrastre.current?.t === "paso") {
      const d = destinoPaso(e);
      if (!d) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (soltar !== d.key) setSoltar(d.key);
      return;
    }
    const d = destinoDe(e.target);
    if (!d) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (soltar !== d.key) setSoltar(d.key);
  };
  const onDrop = (e) => {
    const a = arrastre.current;
    const d = a?.t === "paso" ? destinoPaso(e) : destinoDe(e.target);
    setSoltar(null); arrastre.current = null;
    if (!d || !a) return;
    e.preventDefault();
    if (a.t === "paso") {
      let j = d.antes ? d.paso : d.paso + 1;
      if (a.i < j) j -= 1;
      return moverPaso(a.i, j);
    }
    if (d.proy !== undefined) {
      setMarcadas(new Set());
      return lote(a.filas.map((f) => ({ fila: f, proyecto: d.proy })), `${plural(a.filas.length, "componente pasa", "componentes pasan")} a ${d.proy}`);
    }
    if (a.filas.every((f) => m.comps.find((c) => c.fila === f)?.cod === d.dp)) return;
    moverA(a.filas, d.dp);
  };
  const onDragEnd = () => { setSoltar(null); arrastre.current = null; };

  /* ───────────── Celdas y filas ───────────── */
  // Funciones (no componentes) para que React no vuelva a montar las celdas en cada cambio.
  const sel = ({ value, onChange, opts, cls = "", label, punto }) => {
    const o = value && !opts.some(([v]) => v === value) ? [...opts, [value, value]] : opts;
    return (
      <span className={`sel-c ${punto ? "proy-sel" : ""}`}>
        {punto && <i className="pt" style={{ background: punto }} aria-hidden="true" />}
        <select className={`celda ${cls}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={!editable}>
          {o.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {ic("fold", 11)}
      </span>
    );
  };
  const texto = ({ c, campo, placeholder, label }) => (
    <input
      key={`${c.fila}-${c[campo]}`}
      className="celda" style={{ paddingRight: 6 }} defaultValue={campo === "us" ? limpiarMulti(c.us) : c[campo] || ""} placeholder={placeholder} aria-label={label}
      disabled={!editable}
      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (campo === "us" ? limpiarMulti(c.us) : c[campo] || "").trim()) setCampo(c, campo, campo === "us" ? (v ? limpiarMulti(v) + "; " : "") : v); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
  const filaComp = (c) => {
    const dp = dpDe(c.cod);
    const encLabel = dp ? (dp.enc ? `${nc(dp.enc)} · DP` : "Sin encargado") : "—";
    const hereda = !c.resp || (dp && c.resp === dp.enc);
    const color = m.colorProy[c.proyecto];
    const celdas = {
      tipo: () => sel({ value: c.tipo || "", onChange: (v) => setCampo(c, "tipo", v), opts: [["", "—"], ...tipos.map((t) => [t, t])], label: `Tipo de ${c.nombre}` }),
      proy: () => sel({ value: c.proyecto, onChange: (v) => setCampo(c, "proyecto", v), opts: m.proys.map((p) => [p.nombre, p.corto]), label: `Proyecto de ${c.nombre}`, cls: "proy-c", punto: color }),
      dp: () => sel({ value: c.cod, onChange: (v) => moverA([c.fila], v), opts: [["", "Sin paquete"], ...m.dps.map((d) => [d.cod, `${d.cod}${d.subida ? " · " + d.subida : ""}`])], label: `Paquete de ${c.nombre}`, cls: c.cod ? "" : "aviso" }),
      enc: () => sel({ value: hereda ? "" : c.resp, onChange: (v) => setCampo(c, "resp", v || dp?.enc || ""), opts: [["", encLabel], ...(E.equipo || []).map((n) => [n, nc(n)])], label: `Encargado de ${c.nombre}`, cls: hereda ? (dp && !dp.enc ? "aviso" : "hereda") : "excep" }),
      rel: () => <input type="checkbox" className="prob" checked={c.release} disabled={!editable} onChange={(e) => setCampo(c, "release", e.target.checked)} aria-label={`${c.nombre} con tech-kytl`} />,
      prob: () => <input type="checkbox" className="prob" checked={c.probado} disabled={!editable} onChange={(e) => setCampo(c, "probado", e.target.checked)} aria-label={`${c.nombre} probado`} />,
      us: () => texto({ c, campo: "us", placeholder: "+ historia", label: `Historias de ${c.nombre}` }),
    };
    const marcada = marcadas.has(c.fila);
    return (
      <Fragment key={c.fila}>
        <tr className={`fila ${marcada ? "marcada" : ""}`} data-dp={c.cod} data-proy={c.proyecto} style={{ "--pc": color }}>
          <td className="sel" onClick={(e) => { if (e.target === e.currentTarget && editable) marcar(c.fila, !marcada, e.shiftKey); }}>
            <input type="checkbox" className="prob" data-marca={c.fila} checked={marcada} disabled={!editable} onChange={(e) => marcar(c.fila, e.target.checked, e.nativeEvent.shiftKey)} aria-label={`Marcar ${c.nombre}`} />
          </td>
          <td className="nom" draggable={editable && vista !== "persona"} data-arrastra={c.fila} title={c.nombre + (c.comentarios ? " · " + c.comentarios : "")}>
            <span className="nom-in">
              {editable && vista !== "persona" && <span className="asa" aria-hidden="true">⠿</span>}
              {!cols.includes("proy") && vista !== "proyecto" && <i className="pt" style={{ background: color }} title={c.proyecto} />}
              <span className="nom-t">{c.nombre || <em className="mini">(sin nombre)</em>}</span>
              {c.comentarios && <span className="nota-txt">{c.comentarios}</span>}
              {editable && (
                <button type="button" className={`nota-btn ${c.comentarios ? "con" : ""}`} aria-expanded={nota === c.fila} aria-label={`${c.comentarios ? "Editar el comentario" : "Añadir un comentario"} de ${c.nombre}`} title="Comentario" onClick={() => setNota(nota === c.fila ? null : c.fila)}>
                  {ic("document", 14)}
                </button>
              )}
            </span>
          </td>
          {cols.map((k) => <td key={k} className={k === "rel" || k === "prob" ? "chk" : undefined}>{celdas[k]()}</td>)}
        </tr>
        {nota === c.fila && (
          <tr className="nota-fila">
            <td />
            <td colSpan={span}>
              <label className="nota-in">
                Comentario
                <input
                  className="celda" autoFocus defaultValue={c.comentarios || ""} placeholder={`Algo que el equipo deba saber de ${c.nombre}`}
                  onBlur={(e) => { if (e.target.value.trim() !== (c.comentarios || "").trim()) setCampo(c, "comentarios", e.target.value.trim()); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.currentTarget.blur(); setNota(null); } }}
                />
                <span className="mini">Enter o Esc para cerrar</span>
              </label>
            </td>
          </tr>
        )}
      </Fragment>
    );
  };
  const marcaGrupo = (filas, etiqueta) => {
    const n = filas.filter((f) => marcadas.has(f)).length;
    return <input type="checkbox" className="prob" checked={!!filas.length && n === filas.length} disabled={!filas.length || !editable} onChange={() => marcarGrupo(filas)} aria-label={`Marcar todo ${etiqueta}`} />;
  };
  const filaAlta = (dp, proy) => <FilaAlta key="alta" span={span} dp={dp} proyIni={proy} proys={m.proys} vista={vista} onCerrar={() => setAnadir(null)}
    onAlta={async (nombre, proyecto) => {
      if (m.comps.some((c) => sinTilde(c.nombre) === sinTilde(nombre))) { avisar(`${nombre} ya está en el pase`); return false; }
      const d = dp ? dpDe(dp) : null;
      const tipo = tipoPorNombre(nombre, tipos);
      const ok = await alta([{ proyecto, nombre, tipo, subida: d?.subida || "", codigo: dp || "", resp: d?.enc || "" }], `Añadiendo ${nombre}…`);
      if (ok) avisar(`${nombre} añadido${dp ? " a " + dp : ""}${tipo ? " como " + tipo : ""}`);
      return !!ok;
    }}
    onPegarVarios={(txt, proyecto) => { destino.current = { dp: dp || "", proy: proyecto }; abrirPegar(txt, proyecto); }} />;
  const btnAlta = (attrs, txt) => editable && <button type="button" className="mini-btn" {...attrs}>{ic("add", 13)}{txt}</button>;
  const ord = (i) => editable && (
    <span className="ord">
      <button type="button" className="tope" data-tope-arriba={i} aria-label="Arriba del todo" title="Arriba del todo (un DP se queda justo después de la parada)" disabled={i === 0} onClick={() => moverExtremo(i, true)}>{ic("first", 12)}</button>
      <button type="button" data-sube={i} aria-label="Subir" title="Subir uno" disabled={i === 0} onClick={() => moverPaso(i, i - 1)}>{ic("fold", 12)}</button>
      <button type="button" className="abajo" data-baja={i} aria-label="Bajar" title="Bajar uno" disabled={i === tempOrden.length - 1} onClick={() => moverPaso(i, i + 1)}>{ic("fold", 12)}</button>
      <button type="button" className="tope abajo" data-tope-abajo={i} aria-label="Abajo del todo" title="Abajo del todo (un REQ se queda justo antes del arranque)" disabled={i === tempOrden.length - 1} onClick={() => moverExtremo(i, false)}>{ic("first", 12)}</button>
    </span>
  );

  /* ── Vista por paquete ── */
  const vistaPaquete = () => {
    const out = [];
    let ultimoI = -1;
    m.pasos.forEach((p) => {
      const n = p.i + 1;
      if (p.t === "sis") {
        if (filtraComp || filtro === "sinenc") return;
        out.push(
          <tr key={"s" + p.i} className={`sis ${soltar === `p${p.i}a` ? "soltar-antes" : soltar === `p${p.i}d` ? "soltar-despues" : ""}`} data-paso={p.i}>
            <td className="sel" />
            <td colSpan={span}>
              <span className="grp">
                <b className="n">{n}</b>
                <span className="arr-paso" draggable={editable} data-arrastra-paso={p.i}>{editable && <span className="asa" aria-hidden="true">⠿</span>}{p.texto.toUpperCase()}</span>
                <span className="der">
                  <input className="celda som" defaultValue={p.som} key={p.som} placeholder="SOM" aria-label={`SOM de ${p.texto}`} disabled={!editable} onBlur={(e) => e.target.value !== p.som && ordenOps.updSom(p.i, e.target.value)} />
                  {ord(p.i)}
                  {editable && <button type="button" className="x" aria-label={`Quitar ${p.texto}`} onClick={() => setOrden(tempOrden.filter((_, k) => k !== p.i), `Paso «${p.texto}» quitado`)}>{ic("close", 13)}</button>}
                </span>
              </span>
            </td>
          </tr>
        );
        return;
      }
      out.push(...grupoDp(p, p.i !== ultimoI ? n : null));
      ultimoI = p.i;
    });
    m.fuera.forEach((d) => out.push(...grupoDp(d, "?")));
    const sp = m.sinPaquete.filter(pasa);
    if (filtro !== "sinenc" && !(filtraComp && !sp.length)) {
      out.push(
        <tr key="bandeja" className={`grupo bandeja ${soltar === "d" ? "soltar" : ""}`} data-dp="">
          <td className="sel">{marcaGrupo(sp.map((c) => c.fila), "Sin paquete")}</td>
          <td colSpan={span}>
            <span className="grp">
              <span className="cod" style={{ fontFamily: "inherit" }}>Sin paquete · {sp.length}</span>
              <span className="mini" style={{ color: "inherit" }}>Aviso: no se implantarían. Arrástralos a un DP o márcalos y usa «Mover a».</span>
              <span className="der">{btnAlta({ onClick: () => setAnadir({ dp: "" }) }, "Añadir")}</span>
            </span>
          </td>
        </tr>,
        ...sp.map(filaComp)
      );
      if (anadir && anadir.dp === "") out.push(filaAlta("", ""));
    }
    return out;
  };
  const grupoDp = (d, n) => {
    const vis = d.comps.filter(pasa);
    if ((filtro === "sinenc" && d.enc) || (filtraComp && !vis.length) || filtro === "sinpaq") return [];
    const motivo = d.fuera ? "Fuera del orden" : mal.get(d.cod) || "";
    const prob = d.comps.filter((c) => c.probado).length;
    const plegado = !filtraComp && !desplegados.has(d.cod);
    const ultimoDelPaso = !m.pasos.some((x) => x.t === "dp" && x.i === d.i && x.k > (d.k || 0));
    const esRepe = repetido.has(`${d.i}:${d.k}`);
    const kd = `${d.i ?? "f"}-${d.k || 0}-${d.cod}`;
    const proys = [...new Set(d.comps.map((c) => c.proyecto))];
    const sc = schemaDe(E, d.subida);
    const malSchema = !cumpleSchema(d.cod, sc);
    const filas = [
      <tr key={"d" + kd} className={`grupo ${motivo || malSchema || esRepe ? "mal" : ""} ${soltar === "d" + d.cod ? "soltar" : ""} ${d.i !== undefined && !d.k && soltar === `p${d.i}a` ? "soltar-antes" : ""} ${d.i !== undefined && ultimoDelPaso && plegado && soltar === `p${d.i}d` ? "soltar-despues" : ""}`} data-dp={d.cod} data-paso={d.i}>
        <td className="sel">{marcaGrupo(vis.map((c) => c.fila), d.cod)}</td>
        <td colSpan={span}>
          <span className="grp">
            <b className="n">{n ?? "·"}</b>
            <button type="button" className="pliegue" aria-expanded={!plegado} aria-label={`${plegado ? "Desplegar" : "Plegar"} ${d.cod}`} disabled={filtraComp} onClick={() => setDesplegados((s) => { const x = new Set(s); x.has(d.cod) ? x.delete(d.cod) : x.add(d.cod); return x; })}>{ic("fold", 14)}</button>
            {editCod?.cod === d.cod ? (
              <input className="celda cod-inp" autoFocus value={editCod.valor} aria-label={`Nuevo código de ${d.cod}`} spellCheck={false}
                onChange={(e) => setEditCod({ cod: d.cod, valor: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.preventDefault(); setEditCod(null); } }}
                onBlur={() => editCod && renombrarDp(d, editCod.valor)} />
            ) : (<>
              <span className="cod" draggable={editable && d.i !== undefined} data-arrastra-paso={d.i} title={d.elemento || d.cod}>{editable && d.i !== undefined && <span className="asa" aria-hidden="true">⠿</span>}{d.cod}</span>
              {editable && <button type="button" className="cambiar-cod" aria-label={`Cambiar el código de ${d.cod}`} title="Cambiar el código del paquete" onClick={() => setEditCod({ cod: d.cod, valor: d.cod })}>Cambiar</button>}
            </>)}
            <span className="sel-c" style={{ display: "inline-block", flex: "none" }}>
              <select className="celda tpaq" style={{ background: colorSubida(subidas, d.subida) }} value={d.subida} disabled={!editable} onChange={(e) => cambiarSubidaDp(d, e.target.value)} aria-label={`Tipo de subida de ${d.cod}`}>
                {!d.subida && <option value="">Tipo de subida…</option>}
                {subidas.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {ic("fold", 11)}
            </span>
            {esRepe && <span className="marca-mal">Repetido en el orden: quita este paso</span>}
            {!esRepe && (motivo || malSchema) && <span className="marca-mal">{motivo || `El código de un ${d.subida} empieza por ${prefijoSchema(sc)}`}</span>}
            <span className="mini">{d.comps.length}</span>
            <span className="proys">{proys.map((x) => <span key={x} className="proy" style={{ background: m.colorProy[x] }}>{m.proys.find((p) => p.nombre === x)?.corto || x}</span>)}</span>
            <span className="der">
              <button type="button" className={`mini-btn ${prob === d.comps.length && d.comps.length ? "ok" : ""}`} disabled={!d.comps.length || !editable} title={`${prob === d.comps.length ? "Desmarcar" : "Marcar"} todos como probados`}
                onClick={() => { const v = prob !== d.comps.length; lote(d.comps.map((c) => ({ fila: c.fila, probado: v })), `${d.cod}: ${plural(d.comps.length, "componente", "componentes")} ${v ? "" : "sin marcar como "}probados`); }}>
                {prob}/{d.comps.length} probados
              </button>
              <span className="sel-c" style={{ display: "inline-block" }}>
                <select className={`enc ${d.enc ? "" : "vacio"}`} value={d.enc} disabled={!editable} onChange={(e) => cambiarEncDp(d, e.target.value)} aria-label={`Encargado de ${d.cod}`}>
                  <option value="">Sin encargado</option>
                  {(E.equipo || []).map((x) => <option key={x} value={x}>{nc(x)}</option>)}
                </select>
                {ic("fold", 11)}
              </span>
              {btnAlta({ "aria-label": `Añadir componentes a ${d.cod}`, onClick: () => { setAnadir({ dp: d.cod }); setDesplegados((s) => new Set(s).add(d.cod)); } }, "Añadir")}
              {d.i !== undefined && ord(d.i)}
              {editable && <button type="button" className="x" aria-label={`Quitar el paquete ${d.cod}`} title="Quitar el paquete (sus componentes pasan a Sin paquete)" onClick={() => quitarDp(d)}>{ic("close", 13)}</button>}
            </span>
          </span>
        </td>
      </tr>,
    ];
    if (!plegado && !esRepe) {
      filas.push(...vis.map(filaComp));
      if (d.i !== undefined && ultimoDelPaso && soltar === `p${d.i}d`) filas.push(<tr key={"sl" + kd} className="soltar-linea" aria-hidden="true"><td colSpan={span + 1} /></tr>);
      if (anadir && anadir.dp === d.cod) filas.push(filaAlta(d.cod, proys[0] || ""));
      else if (!vis.length) filas.push(<tr key={"v" + kd} data-dp={d.cod}><td /><td colSpan={span} className="mini">Vacío: arrastra aquí componentes o pulsa «Añadir».</td></tr>);
    }
    return filas;
  };

  /* ── Vista por proyecto ── */
  const vistaProyecto = () => {
    const out = [];
    m.proys.forEach((p) => {
      const todos = m.comps.filter((c) => c.proyecto === p.nombre);
      const cs = todos.filter(pasa);
      const trasMal = !RE_ID_TRASPASO.test(p.idTraspaso.trim());
      out.push(
        <tr key={"p" + p.nombre} className={`grupo proy-g ${soltar === "g" + p.nombre ? "soltar" : ""}`} data-proy-g={p.nombre} style={{ "--pc": p.color }}>
          <td className="sel">{marcaGrupo(cs.map((c) => c.fila), p.corto)}</td>
          <td colSpan={span}>
            <span className="grp">
              <span className="proy-nom"><i className="pt" style={{ background: p.color }} />{p.nombre}</span>
              <span className="mini">{[p.feature && limpiarMulti(p.feature), p.cliente, plural(todos.length, "componente", "componentes")].filter(Boolean).join(" · ")}</span>
              <span className="der">
                <label className="mini" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  ID traspaso
                  <IdTraspaso p={p} mal={trasMal} disabled={!editable} onCambio={(v) => P.actions.programarSaveIdTraspaso(p.nombre, v)} />
                </label>
                <label className="mini" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" className="prob" data-okp={p.nombre} checked={p.ok} disabled={!editable} onChange={(e) => actions.updOkProy(p.nombre, e.target.checked)} aria-label={`OK de ${p.corto}`} /> OK proyecto
                </label>
                {btnAlta({ "data-alta-proy": p.nombre, "aria-label": `Añadir componentes a ${p.corto}`, onClick: () => setAnadir({ proy: p.nombre }) }, "Añadir")}
                {editable && <button type="button" className="mini-btn" onClick={() => { destino.current = { dp: "", proy: p.nombre }; abrirPegar("", p.nombre); }}>{ic("copy", 13)}Pegar</button>}
                {editable && <button type="button" className="x" aria-label={`Quitar el proyecto ${p.corto}`} title="Quitar el proyecto y sus componentes" onClick={() => setDlg({ t: "quitarProy", p })}>{ic("close", 13)}</button>}
              </span>
            </span>
          </td>
        </tr>,
        ...cs.map(filaComp)
      );
      if (anadir && anadir.proy === p.nombre) out.push(filaAlta("", p.nombre));
      else if (!cs.length) out.push(<tr key={"pv" + p.nombre}><td /><td colSpan={span} className="mini">Sin componentes: pégalos desde el Excel o pulsa «Añadir».</td></tr>);
    });
    if (editable) out.push(<tr key="alta-proy" className="alta-proy"><td /><td colSpan={span}><button type="button" className="mini-btn" onClick={() => setDlg({ t: "proy", nombre: "", feature: "", cliente: "" })}>{ic("add", 13)}Añadir proyecto</button></td></tr>);
    return out;
  };
  /* ── Vista por encargado ── */
  const vistaPersona = () => {
    const grupos = {};
    m.comps.filter(pasa).forEach((c) => { const r = c.resp || dpDe(c.cod)?.enc || "(sin encargado)"; (grupos[r] = grupos[r] || []).push(c); });
    const orden = Object.keys(grupos).sort((a, b) => (a.startsWith("(") ? 1 : b.startsWith("(") ? -1 : nc(a).localeCompare(nc(b), "es")));
    return orden.flatMap((r) => [
      <tr key={"r" + r} className={`grupo ${r.startsWith("(") ? "bandeja" : ""}`}>
        <td className="sel">{marcaGrupo(grupos[r].map((c) => c.fila), r)}</td>
        <td colSpan={span}><span className="grp"><b>{r.startsWith("(") ? r : nc(r)}</b><span className="mini">{plural(grupos[r].length, "componente", "componentes")} · {grupos[r].filter((c) => c.probado).length}/{grupos[r].length} probados · {[...new Set(grupos[r].map((c) => c.cod).filter(Boolean))].join(", ") || "—"}</span></span></td>
      </tr>,
      ...grupos[r].map(filaComp),
    ]);
  };

  /* ───────────── Pintado ───────────── */
  const filas = vista === "proyecto" ? vistaProyecto() : vista === "persona" ? vistaPersona() : vistaPaquete();
  const datosCab = (
    <>
      <label className="cab-campo">CRQ <input className={`cab-inp ${cab.crq.trim() || !editable ? "" : "mal"}`} value={cab.crq} disabled={!editable} placeholder="CRQ…" onChange={(e) => { const n = { ...cab, crq: e.target.value }; setCab(n); scheduleCabSave(n); }} data-cab="crq" /></label>
      <label className={`cab-campo ${cab.instTecnica || !editable ? "" : "pendiente"}`}><input type="checkbox" className="prob" checked={cab.instTecnica} disabled={!editable} onChange={(e) => { const n = { ...cab, instTecnica: e.target.checked }; setCab(n); scheduleCabSave(n); }} data-cab="inst" /> Instalación técnica</label>
      {[["liderar", "Lidera"], ["aprender", "Aprende"]].map(([k, t]) => (
        <label key={k} className="cab-campo persona">{t}
          <span className="sel-c">
            <select className="celda" value={cab[k]} disabled={!editable} aria-label={`${t} el pase`} onChange={(e) => { const n = { ...cab, [k]: e.target.value }; setCab(n); scheduleCabSave(n); }}>
              <option value="">—</option>
              {(E.equipo || []).map((x) => <option key={x} value={x}>{nc(x)}</option>)}
            </select>
            {ic("fold", 11)}
          </span>
        </label>
      ))}
      <span className="sep" aria-hidden="true" />
    </>
  );

  return (
    <div className="ph" ref={raiz}>
      <a className="salto" href="#tabla-pase">Saltar a la tabla</a>
      {cerrada ? (
        <section className="checks cerrada" aria-label="Preparación cerrada">
          {datosCab}
          {edicion ? (
            <EdicionCerrada onTerminar={actions.notificarModificacion} onSalir={() => setEdicion(false)} />
          ) : (
            <>
              <span className="cerrado-txt">{ic("checkmark", 14)}<b>Preparación cerrada</b> · solo lectura</span>
              {!isCompletado && <button type="button" className="mini-btn" style={{ marginLeft: "auto" }} onClick={() => setEdicion(true)}>Editar el pase (avisa al equipo)</button>}
            </>
          )}
        </section>
      ) : (
        <section className="checks" aria-label="Para cerrar la preparación">
          {datosCab}
          <span className="ck-prog" title={`Hecho: ${hechos.map((x) => x.txt).join(" · ")}`}>
            <span className="progreso" aria-hidden="true"><i style={{ width: `${items.length ? Math.round((hechos.length / items.length) * 100) : 0}%` }} /></span>
            <b>{hechos.length}/{items.length}</b> checks
          </span>
          <span className="guardado" aria-live="polite">{estadoOrden === "error"
            ? <button type="button" className="mini-btn" onClick={reintentarOrden}>No se guardó el orden · Reintentar</button>
            : inflight || (estadoOrden && estadoOrden !== "ok") ? "Guardando…" : <>{ic("checkmark", 12)}Guardado</>}</span>
          <button type="button" className="btn btn-cerrar" aria-disabled={!validador?.todoCorrecto}
            onClick={() => { if (validador?.todoCorrecto) return actions.validarYAvanzarPrep(); const p0 = items.find((x) => !x.ok); if (p0) { avisar(`Aún falta: ${p0.id === "crq" ? "el CRQ" : p0.id === "inst" ? "la instalación técnica" : etiquetaCheck(p0)}`); if (p0.id === "crq") enfoca('[data-cab="crq"]'); else if (p0.id === "inst") enfoca('[data-cab="inst"]'); else irACheck(p0.id); } }}>
            Cerrar preparación{!validador?.todoCorrecto && <span className="cuantos"> · faltan {nPend}</span>}
          </button>
          {(pend.length > 0 || avisos.length > 0) && (
            <span className="falta" role="group" aria-label="Lo que falta">
              {pend.length > 0 && <span className="falta-lbl">Falta:</span>}
              {(verChecks ? pend : pend.slice(0, MAXP)).map((x) => (
                <button key={x.id} type="button" aria-pressed={filtro === x.id} title={AYUDA[x.id] || x.txt} onClick={() => irACheck(x.id)}><span className="sr">Bloquea: </span>{etiquetaCheck(x)}</button>
              ))}
              {pend.length > MAXP && <button type="button" className="ver-todo" aria-expanded={verChecks} onClick={() => setVerChecks((v) => !v)}>{verChecks ? "menos" : `+${pend.length - MAXP} más`}</button>}
              {avisos.length > 0 && <span className="falta-lbl aviso-lbl">Avisos:</span>}
              {avisos.map((a) => <button key={a.id} type="button" className="aviso-btn" aria-pressed={filtro === a.id} title="No impide cerrar" onClick={() => irACheck(a.id)}><span className="sr">Aviso: </span>{a.txt}</button>)}
              {filtro && <button type="button" className="ver-todo" onClick={() => setFiltro("")}>Quitar filtro</button>}
            </span>
          )}
        </section>
      )}

      <div className="herr" ref={herr}>
        <div className="seg" role="group" aria-label="Agrupar">
          {[["paquete", "Por paquete"], ["proyecto", "Por proyecto"], ["persona", "Por encargado"]].map(([v, t]) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => { setVista(v); setAnadir(null); }}>{t}</button>
          ))}
        </div>
        <label className="buscar">{ic("filter", 14)}<span className="sr">Buscar componente</span><input className="inp" placeholder="Buscar…" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></label>
        <span className="nota cuenta">{plural(m.dps.length, "DP", "DP")} · {plural(nComps, "componente", "componentes")}{filtro ? <> · <b>filtrado</b></> : null}</span>
        <span className="herr-der">
          {vista === "paquete" && <button type="button" className="mini-btn" disabled={filtraComp} onClick={() => setDesplegados((s) => (s.size ? new Set() : new Set(m.dps.map((d) => d.cod))))}>{desplegados.size ? "Plegar" : "Desplegar"} todo</button>}
          {editable && (
            <>
              {vista === "paquete" && <button type="button" className="mini-btn" onClick={() => setDlg({ t: "sis", texto: "" })}>{ic("add", 13)}Paso de sistema</button>}
              <button type="button" className="mini-btn" onClick={() => setDlg({ t: "dp", subida: subidas[0] || "", cod: "", enc: "" })}>{ic("add", 13)}Nuevo DP</button>
              <button type="button" className="mini-btn" onClick={() => setDlg({ t: "proy", nombre: "", feature: "", cliente: "" })}>{ic("add", 13)}Proyecto</button>
              <button type="button" className="btn" onClick={() => abrirPegar()}>{ic("copy", 16)}Pegar desde Excel <span className="kbd">Ctrl V</span></button>
            </>
          )}
          <button type="button" className="mini-btn" aria-expanded={ayuda} onClick={() => setAyuda((v) => !v)}>Atajos</button>
        </span>
        {ayuda && (
          <div className="ayuda" role="note">
            <ul>
              <li>Arrastra un componente (<span className="asa">⠿</span>) a otro paquete; si está marcado, se mueven todos los marcados. Los paquetes y los pasos se reordenan igual.</li>
              <li><span className="kbd">Mayús</span>+clic marca un tramo · la casilla de un DP marca el grupo · <span className="kbd">Ctrl A</span> marca todo lo visible.</li>
              <li><span className="kbd">Ctrl V</span> fuera de una celda pega desde Excel en el último DP o proyecto que tocaste.</li>
              <li><span className="kbd">Supr</span> quita los marcados · <span className="kbd">Esc</span> desmarca · <span className="kbd">Ctrl Z</span> deshace.</li>
              <li>El encargado de cada componente es el de su DP («Nombre · DP»); si eliges otro, sale en negrita.</li>
            </ul>
          </div>
        )}
      </div>

      {filtro === "street" && !validador?.hasStreetref && validador?.rdrRulesNoExentas > 0 && editable && (
        <p className="aviso-tabla">
          {plural(validador.rdrRulesNoExentas, "rdrRule no exenta necesita", "rdrRules no exentas necesitan")} el componente Streetref en el pase (las exentas están en el Listado Rules de Parametrizaciones).
          <button type="button" className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => setDlg({ t: "street" })}>{ic("add", 14)}Añadir Streetref</button>
        </p>
      )}

      <div className={`tabla-wrap vista-${vista} ${editable ? "" : "solo-lectura"}`}>
        <table className="t" id="tabla-pase" tabIndex={-1} aria-label="Componentes del pase"
          onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
          onClick={(e) => { const tr = e.target.closest("tr[data-dp], tr[data-proy-g], tr[data-proy]"); if (tr) destino.current = { dp: tr.dataset.dp ?? null, proy: tr.dataset.proyG || "" }; }}>
          <colgroup><col style={{ width: 32 }} /><col />{cols.map((k) => <col key={k} style={{ width: COLW[k] }} />)}</colgroup>
          <thead>
            <tr>
              <th className="sel"><input type="checkbox" className="prob" disabled={!editable} aria-label="Marcar todas las visibles" onChange={() => { const v = visibles(); marcarGrupo(v); }} checked={false} /></th>
              <th scope="col">Componente{editable && vista !== "persona" && <span className="mini" style={{ fontWeight: 400 }}> · arrastra ⠿ para mover</span>}</th>
              {cols.map((k) => <th key={k} scope="col" style={k === "rel" || k === "prob" ? { textAlign: "center" } : undefined}>{COLT[k]}</th>)}
            </tr>
          </thead>
          <tbody>{filas}</tbody>
        </table>
      </div>

      {typeof document !== "undefined" && createPortal(
        <div className="ph">
          {marcadas.size > 0 && editable && (
            <div className="lote" role="region" aria-label="Cambiar los marcados">
              <span>{plural(marcadas.size, "marcado", "marcados")}</span>
              <label>Mover a <select value="" onChange={(e) => e.target.value && moverA([...marcadas], e.target.value === "__sin" ? "" : e.target.value)}><option value="">—</option><option value="__sin">Sin paquete</option>{m.dps.map((d) => <option key={d.cod} value={d.cod}>{d.cod}{d.subida ? " · " + d.subida : ""}</option>)}</select></label>
              <button type="button" onClick={() => setDlg({ t: "dp", subida: subidas[0] || "", cod: "", enc: "", mover: true })}>{ic("add", 13)}Nuevo DP</button>
              <label>Proyecto <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; const f = [...marcadas]; setMarcadas(new Set()); lote(f.map((x) => ({ fila: x, proyecto: v })), `${plural(f.length, "componente pasa", "componentes pasan")} a ${v}`); }}><option value="">—</option>{m.proys.map((p) => <option key={p.nombre} value={p.nombre}>{p.corto}</option>)}</select></label>
              <label>Encargado <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; const f = [...marcadas]; lote(f.map((x) => { const c = m.comps.find((y) => y.fila === x); return { fila: x, resp: v === "__dp" ? dpDe(c.cod)?.enc || "" : v }; }), `Encargado ${v === "__dp" ? "del DP" : nc(v)} para ${plural(f.length, "componente", "componentes")}`); }}><option value="">—</option><option value="__dp">El del DP</option>{(E.equipo || []).map((x) => <option key={x} value={x}>{nc(x)}</option>)}</select></label>
              <label>Tipo <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; const f = [...marcadas]; lote(f.map((x) => ({ fila: x, tipo: v })), `Tipo ${v} para ${plural(f.length, "componente", "componentes")}`); }}><option value="">—</option>{tipos.map((t) => <option key={t}>{t}</option>)}</select></label>
              <button type="button" onClick={() => { const f = [...marcadas]; lote(f.map((x) => ({ fila: x, release: true })), `tech-kytl en ${plural(f.length, "componente", "componentes")}`); }}>{ic("checkmark", 13)}tech-kytl</button>
              <button type="button" onClick={() => { const f = [...marcadas]; lote(f.map((x) => ({ fila: x, probado: true })), `${plural(f.length, "componente marcado", "componentes marcados")} como probados`); }}>{ic("checkmark", 13)}Probados</button>
              <button type="button" onClick={quitarMarcadas}>Quitar <span className="kbd">Supr</span></button>
              <button type="button" className="si" style={{ marginLeft: "auto" }} onClick={() => setMarcadas(new Set())}>Desmarcar <span className="kbd">Esc</span></button>
            </div>
          )}
          {aviso && (
            <div className="ph-aviso" role="status" aria-live="polite">
              {aviso.msg}
              {aviso.deshacer && <button type="button" onClick={() => { const f = aviso.deshacer; setAviso(null); f(); }}>Deshacer</button>}
            </div>
          )}
          {dlg && (
            <Dialogo dlg={dlg} setDlg={setDlg} E={E} m={m} tipos={tipos} subidas={subidas} nc={nc} marcadas={marcadas}
              onPegar={async (items, recordar, equivNuevas) => {
                if (recordar) guardarEquiv({ ...leerEquiv(), ...equivNuevas });
                setDlg(null);
                const filas2 = await alta(items, `Añadiendo ${plural(items.length, "componente", "componentes")}…`);
                if (filas2) { setAnadir(null); avisar(`${plural(items.length, "componente añadido", "componentes añadidos")} a ${items[0].proyecto}${items[0].codigo ? " en " + items[0].codigo : " (sin paquete)"}`); }
              }}
              onNuevoDp={({ cod, subida, enc, mover }) => {
                setDlg(null);
                setDpMeta((x) => ({ ...x, [cod]: { subida, enc } }));
                setOrden(insertarAntesDeArranque([etiquetaDp(subida, cod)]), `Paquete ${cod} creado`);
                if (mover && marcadas.size) {
                  const f = [...marcadas];
                  setMarcadas(new Set());
                  lote(f.map((x) => { const c = m.comps.find((y) => y.fila === x); return { fila: x, codigo: cod, subida, resp: enc || c.resp }; }));
                }
              }}
              onSis={(texto) => { setDlg(null); setOrden(insertarAntesDeArranque([texto.toUpperCase()]), `Paso «${texto}» añadido`); }}
              onProyecto={async ({ nombre, feature, cliente, volver }) => {
                await actions.addProyecto({ nombre, feature, respBBVA: cliente });
                if (volver) setDlg({ ...volver, proy: nombre });
                else { setDlg(null); setVista("proyecto"); setAnadir({ proy: nombre }); }
              }}
              onQuitarProy={(p) => { setDlg(null); actions.delProyectoDirecto(p.nombre); }}
              onStreet={async (proyecto) => {
                setDlg(null);
                const r = m.comps.find((c) => /rdrRules\//.test(c.nombre || ""));
                const d = r ? dpDe(r.cod) : null;
                const ok = await alta([{ proyecto, nombre: "Streetref", tipo: tipoPorNombre("x.jar", tipos), subida: d?.subida || "", codigo: d?.cod || "", resp: d?.enc || "" }], "Añadiendo Streetref…");
                if (ok) { setFiltro(""); avisar(`Streetref añadido${d ? " a " + d.cod : ""}: queda pendiente de probar y de tech-kytl`); }
              }}
            />
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Alta rápida: escribe el nombre, Enter y sigue ── */
function FilaAlta({ span, dp, proyIni, proys, vista, onAlta, onCerrar, onPegarVarios }) {
  const [proy, setProy] = useState(proyIni || (proys.length === 1 ? proys[0].nombre : ""));
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <tr className="alta">
      <td className="sel" aria-hidden="true">+</td>
      <td colSpan={span}>
        <div className="alta-in">
          <input ref={ref} id="alta-nom" className="celda" placeholder="Nombre del componente · Enter añade y sigue · pega varias líneas de golpe" aria-label="Nombre del componente nuevo" autoComplete="off"
            onPaste={(e) => { const t = e.clipboardData.getData("text"); if (/\n/.test(t.trim())) { e.preventDefault(); e.stopPropagation(); onPegarVarios(t, proy); } }}
            onKeyDown={async (e) => {
              if (e.key === "Escape") return onCerrar();
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = e.currentTarget.value.trim();
              if (!v) return;
              if (!proy) return document.getElementById("alta-proy")?.focus();
              const inp = e.currentTarget;
              if (await onAlta(v, proy)) { inp.value = ""; inp.focus(); }
            }} />
          {vista !== "proyecto" && (
            <span className="sel-c" style={{ width: 170, flex: "none" }}>
              <select className="celda" id="alta-proy" value={proy} onChange={(e) => { setProy(e.target.value); ref.current?.focus(); }} aria-label="Proyecto del componente nuevo">
                <option value="">Proyecto…</option>
                {proys.map((p) => <option key={p.nombre} value={p.nombre}>{p.corto}</option>)}
              </select>
              <IconoBBVA nombre="fold" size={11} />
            </span>
          )}
          <span className="mini">El tipo se deduce del nombre{dp ? ` · va a ${dp}` : ""}</span>
          <button type="button" className="btn btn-t" style={{ padding: "2px 8px", fontSize: 12.5 }} onClick={onCerrar}>Hecho</button>
        </div>
      </td>
    </tr>
  );
}

function IdTraspaso({ p, mal, disabled, onCambio }) {
  const [v, setV] = useState(p.idTraspaso);
  useEffect(() => setV(p.idTraspaso), [p.idTraspaso]);
  return <input className={`celda ${RE_ID_TRASPASO.test(v.trim()) ? "" : "mal"}`} style={{ width: 108, borderColor: "var(--line)", paddingRight: 6 }} data-tras={p.nombre} value={v} disabled={disabled} placeholder="2026-…" aria-label={`ID de traspaso de ${p.corto}`} onChange={(e) => { setV(e.target.value); onCambio(e.target.value); }} />;
}

function EdicionCerrada({ onTerminar, onSalir }) {
  const [txt, setTxt] = useState("");
  return (
    <span className="edicion">
      <b>Editando con la preparación cerrada.</b>
      <input className="inp" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="¿Qué has cambiado? (va en el correo al equipo)" aria-label="Qué has cambiado" />
      <button type="button" className="btn" disabled={!txt.trim()} onClick={() => { onTerminar(txt.trim()); setTxt(""); }}>Terminar y avisar</button>
      <button type="button" className="mini-btn" onClick={() => { if (confirm("¿Salir de la edición sin avisar al equipo?")) onSalir(); }}>Salir sin avisar</button>
    </span>
  );
}

/* ── Diálogos ── */
function Dialogo({ dlg, setDlg, E, m, tipos, subidas, nc, marcadas, onPegar, onNuevoDp, onSis, onProyecto, onQuitarProy, onStreet }) {
  const caja = useRef(null);
  const origen = useRef(typeof document !== "undefined" ? document.activeElement : null);
  useEffect(() => {
    const el = caja.current?.querySelector("[data-foco]") || caja.current?.querySelector("input, select, textarea, button");
    el?.focus();
    const o = origen.current;
    return () => { try { o?.focus?.(); } catch {} };
  }, [dlg.t]);
  const atrapar = (e) => {
    if (e.key !== "Tab") return;
    const f = [...caja.current.querySelectorAll("button, input, select, textarea, a[href]")].filter((x) => !x.disabled);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  };
  const set = (patch) => setDlg((d) => ({ ...d, ...patch }));
  const cerrar = () => setDlg(null);
  const pie = (txt, ok, onOk, cancel = cerrar) => (
    <div className="pie"><button type="button" className="btn btn-t" onClick={cancel}>Cancelar</button><button type="button" className="btn" disabled={!ok} onClick={onOk}>{txt}</button></div>
  );
  let cuerpo = null, ancho = 560;
  if (dlg.t === "pegar") { cuerpo = <DlgPegar d={dlg} set={set} E={E} m={m} tipos={tipos} onPegar={onPegar} cerrar={cerrar} />; ancho = 980; }
  if (dlg.t === "dp") {
    const sc = (E.schemaPorSubida || {})[dlg.subida] || "";
    const cod = (dlg.cod || prefijoSchema(sc)).toUpperCase().trim();
    const reconocido = extraerCodigosDeElemento(cod).map((x) => x.toUpperCase()).join("|") === cod;
    const pre = prefijoSchema(sc);
    const okCod = cumpleSchema(cod, sc) && cod.length > pre.length && reconocido && !m.dps.some((d) => d.cod === cod);
    cuerpo = (
      <>
        <h2 id="dlg-t">Nuevo paquete</h2>
        <label className="campo"><span>Tipo de subida</span><span className="sel-wrap"><select className="inp" data-foco value={dlg.subida} onChange={(e) => set({ subida: e.target.value, cod: "" })}>{subidas.map((s) => <option key={s}>{s}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span></label>
        <label className="campo"><span>Código{sc ? ` (empieza por ${prefijoSchema(sc)})` : ""}</span><input className="inp" value={dlg.cod || prefijoSchema(sc)} onChange={(e) => set({ cod: e.target.value })} onKeyDown={(e) => e.key === "Enter" && okCod && onNuevoDp({ cod, subida: dlg.subida, enc: dlg.enc, mover: dlg.mover })} /></label>
        <label className="campo"><span>Encargado</span><span className="sel-wrap"><select className="inp" value={dlg.enc} onChange={(e) => set({ enc: e.target.value })}><option value="">Sin encargado</option>{(E.equipo || []).map((x) => <option key={x} value={x}>{nc(x)}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span></label>
        <p className="nota">Se añade antes del arranque; luego lo puedes arrastrar o mover con las flechas.{dlg.mover ? ` Se meten en él los ${plural(marcadas.size, "componente marcado", "componentes marcados")}.` : ""}</p>
        {cod && !cumpleSchema(cod, sc) && <p className="aviso">El código de un paquete {dlg.subida} debe empezar por {pre}.</p>}
        {m.dps.some((d) => d.cod === cod) && <p className="aviso">Ese paquete ya está en el pase.</p>}
        {cod.length > pre.length && cumpleSchema(cod, sc) && !reconocido && <p className="aviso">No es un código de paquete reconocible (DP-KYTL-…, REQ seguido de números, SS-…, ARQDAT-…).</p>}
        {pie("Crear paquete", okCod, () => onNuevoDp({ cod, subida: dlg.subida, enc: dlg.enc, mover: dlg.mover }))}
      </>
    );
  }
  if (dlg.t === "sis") {
    cuerpo = (
      <>
        <h2 id="dlg-t">Nuevo paso de sistema</h2>
        <div className="chips" role="group" aria-label="Pasos habituales">{["PARADA DEL SISTEMA", "ARRANQUE DEL SISTEMA", "REINICIO HANDLER", "REINICIO PREVENTIVO", "REINICIO API", "RECARGA CACHE"].map((x) => <button key={x} type="button" className="chip" onClick={() => set({ texto: x })}>{x.toLowerCase()}</button>)}</div>
        <label className="campo"><span>Nombre del paso</span><input className="inp" data-foco value={dlg.texto} onChange={(e) => set({ texto: e.target.value })} onKeyDown={(e) => e.key === "Enter" && dlg.texto.trim() && onSis(dlg.texto.trim())} placeholder="Por ejemplo: REINICIO HANDLER" /></label>
        <p className="nota">Se coloca antes del arranque; luego lo puedes arrastrar o mover con las flechas.</p>
        {pie("Añadir paso", !!dlg.texto.trim(), () => onSis(dlg.texto.trim()))}
      </>
    );
  }
  if (dlg.t === "proy") {
    const rep = (E.proyectos || []).some((p) => sinTilde(p.nombre) === sinTilde(dlg.nombre.trim()));
    const ok = !!dlg.nombre.trim() && !rep;
    const crear = () => ok && onProyecto({ nombre: dlg.nombre.trim(), feature: dlg.feature, cliente: dlg.cliente, volver: dlg.volver });
    cuerpo = (
      <>
        <h2 id="dlg-t">Nuevo proyecto en el pase</h2>
        <label className="campo"><span>Nombre del proyecto (obligatorio)</span><input className="inp" data-foco value={dlg.nombre} onChange={(e) => set({ nombre: e.target.value })} onKeyDown={(e) => e.key === "Enter" && crear()} placeholder="Por ejemplo: Golden Source · Precios" /></label>
        <div className="dos">
          <label className="campo"><span>Feature</span><input className="inp" value={dlg.feature} onChange={(e) => set({ feature: e.target.value })} placeholder="CIBRDR-…" /></label>
          <label className="campo"><span>Responsable BBVA</span><span className="sel-wrap"><select className="inp" value={dlg.cliente} onChange={(e) => set({ cliente: e.target.value })}><option value="">Elige…</option>{(E.clientes || []).map((c) => <option key={c}>{c}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span></label>
        </div>
        {rep && <p className="aviso">Ya hay un proyecto con ese nombre en este pase.</p>}
        <p className="nota">El ID de traspaso y el OK se rellenan luego en la cabecera del proyecto.{dlg.volver ? " Al crearlo vuelves al pegado con este proyecto elegido." : ""}</p>
        {pie("Crear proyecto", ok, crear, dlg.volver ? () => setDlg(dlg.volver) : cerrar)}
      </>
    );
  }
  if (dlg.t === "quitarProy") {
    const n = dlg.p.n;
    cuerpo = (
      <>
        <h2 id="dlg-t">¿Quitar el proyecto {dlg.p.corto}?</h2>
        <p style={{ margin: 0 }}>{n ? `Se quitan también sus ${plural(n, "componente", "componentes")} del pase. ` : ""}No se puede deshacer.</p>
        {pie("Quitar proyecto", true, () => onQuitarProy(dlg.p))}
      </>
    );
  }
  if (dlg.t === "street") {
    const proys = [...new Set(m.comps.filter((c) => /rdrRules\//.test(c.nombre || "")).map((c) => c.proyecto))];
    const [pr, setPr] = [dlg.proy ?? proys[0] ?? "", (v) => set({ proy: v })];
    cuerpo = (
      <>
        <h2 id="dlg-t">Añadir Streetref</h2>
        <label className="campo"><span>Proyecto</span><span className="sel-wrap"><select className="inp" data-foco value={pr} onChange={(e) => setPr(e.target.value)}>{m.proys.map((p) => <option key={p.nombre} value={p.nombre}>{p.corto}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span></label>
        <p className="nota">Va al mismo DP que las rdrRules. Quedará pendiente de probar y de tech-kytl.</p>
        {pie("Añadir Streetref", !!pr, () => onStreet(pr))}
      </>
    );
  }
  return (
    <div className="dlg" onMouseDown={(e) => { if (e.target === e.currentTarget) dlg.t === "proy" && dlg.volver ? setDlg(dlg.volver) : cerrar(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="dlg-t" ref={caja} onKeyDown={atrapar} style={{ width: `min(${ancho}px, 100%)` }}>{cuerpo}</div>
    </div>
  );
}

function DlgPegar({ d, set, E, m, tipos, onPegar, cerrar }) {
  const equiv = useMemo(() => leerEquiv(), []);
  const a = useMemo(() => analizarPegado(d.texto, { tipos, equiv, existentes: m.comps, cambiar: d.cambiar }), [d.texto, d.cambiar, tipos, equiv, m.comps]);
  const raws = [...new Set(a.filas.filter((f) => f.raw).map((f) => f.raw))];
  const tipoFinal = (f) => (f.raw ? d.over[sinTilde(f.raw)] ?? f.tipo : d.overNom[f.nombre] ?? f.tipo);
  const sinTipo = raws.filter((r) => !(d.over[sinTilde(r)] ?? a.filas.find((f) => f.raw === r).tipo));
  const elegidas = a.filas.filter((f) => f.on && !d.off.has(f.nombre));
  const n = sinTipo.length ? 0 : elegidas.length;
  const dp = d.dp ? m.dps.find((x) => x.cod === d.dp) : null;
  const proyObj = m.proys.find((p) => p.nombre === d.proy);
  const ok = () => {
    const nuevas = {};
    a.filas.forEach((f) => { if (f.raw && tipoFinal(f)) nuevas[sinTilde(f.raw)] = tipoFinal(f); });
    onPegar(elegidas.map((f) => ({ proyecto: d.proy, nombre: f.nombre, tipo: tipoFinal(f) || "", subida: dp?.subida || "", codigo: d.dp || "", resp: dp?.enc || "" })), d.recordar, nuevas);
  };
  return (
    <>
      <div className="dlg-cab"><h2 id="dlg-t">Pegar componentes desde Excel</h2><button type="button" className="btn btn-t" onClick={cerrar} aria-label="Cerrar"><IconoBBVA nombre="close" size={16} /></button></div>
      <div className="dos">
        <label className="campo"><span>Proyecto (obligatorio)</span><span className="sel-wrap"><select className="inp" value={d.proy} onChange={(e) => (e.target.value === "__nuevo" ? set({ t: "proy", nombre: "", feature: "", cliente: "", volver: d }) : set({ proy: e.target.value }))}><option value="">Elige el proyecto…</option>{m.proys.map((p) => <option key={p.nombre} value={p.nombre}>{p.nombre}</option>)}<option value="__nuevo">+ Nuevo proyecto…</option></select><IconoBBVA nombre="fold" size={14} /></span></label>
        <label className="campo"><span>Meter en</span><span className="sel-wrap"><select className="inp" value={d.dp} onChange={(e) => set({ dp: e.target.value })}><option value="">Sin paquete (decidir luego)</option>{m.dps.map((x) => <option key={x.cod} value={x.cod}>{x.cod}{x.subida ? " · " + x.subida : ""}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span></label>
      </div>
      <label className="campo"><span>Copia en el Excel las columnas del nombre y del tipo (o solo el nombre) y pégalas aquí</span><textarea className="inp" data-foco value={d.texto} onChange={(e) => set({ texto: e.target.value })} placeholder={"GS_PRICE_HISTORY\tJava\nPRC_CALC_PRICES\tStored Procedure\n…"} /></label>
      {!d.texto && <p className="nota">Se acepta la fila de cabecera y columnas separadas por tabulador (lo que copia Excel) o por «;».</p>}
      {a.filas.length > 0 && (
        <>
          <div className="lectura">
            <b>{plural(a.filas.length, "fila", "filas")}</b>{a.cabecera ? " sin la cabecera" : ""}
            <span>Nombre = columna {a.colNom + 1}</span>
            <span>{a.colTipo >= 0 ? `Tipo = columna ${a.colTipo + 1}` : "Tipo: se deduce del nombre"}</span>
            {a.colTipo >= 0 && <button type="button" className="mini-btn" onClick={() => set({ cambiar: !d.cambiar, over: {} })}>Intercambiar nombre y tipo</button>}
            {a.filas.some((f) => f.ya) && <span>{plural(a.filas.filter((f) => f.ya).length, "ya está", "ya están")} en el pase</span>}
            {a.filas.some((f) => f.rep) && <span>{plural(a.filas.filter((f) => f.rep).length, "repetido", "repetidos")} en lo pegado</span>}
          </div>
          {raws.length > 0 && (
            <div>
              <p className="lbl">Equivalencias de tipo: lo que pone el Excel → vuestro tipo</p>
              <div className="map">
                {raws.map((r) => {
                  const f = a.filas.find((x) => x.raw === r);
                  const t = d.over[sinTilde(r)] ?? f.tipo;
                  const como = d.over[sinTilde(r)] !== undefined ? "elegido" : f.como;
                  return (
                    <Fragment key={r}>
                      <span>{t ? r : <span className="dud">{r}</span>}</span><span aria-hidden="true">→</span>
                      <span className="sel-wrap"><select className="inp" style={{ padding: "4px 28px 4px 8px" }} value={t} onChange={(e) => set({ over: { ...d.over, [sinTilde(r)]: e.target.value } })} aria-label={`Tipo para ${r}`}><option value="">Elige…</option>{tipos.map((x) => <option key={x}>{x}</option>)}</select><IconoBBVA nombre="fold" size={14} /></span>
                      <span className="nota">{como === "igual" ? "igual" : como === "recordado" ? "recordado de otra vez" : como === "parecido" ? "parecido: revísalo" : como === "elegido" ? "elegido" : "sin equivalencia: elige uno"}</span>
                    </Fragment>
                  );
                })}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 8 }}><input type="checkbox" className="prob" checked={d.recordar} onChange={(e) => set({ recordar: e.target.checked })} /> Recordar estas equivalencias para la próxima vez</label>
            </div>
          )}
          <div className="prev">
            <table className="t">
              <thead><tr><th className="sel" /><th>Componente</th><th style={{ width: 190 }}>Tipo</th><th style={{ width: 230 }} /></tr></thead>
              <tbody>
                {a.filas.map((f, i) => (
                  <tr key={i} className="fila">
                    <td className="sel"><input type="checkbox" className="prob" checked={f.on && !d.off.has(f.nombre)} disabled={!!f.ya || f.rep} onChange={(e) => { const off = new Set(d.off); e.target.checked ? off.delete(f.nombre) : off.add(f.nombre); set({ off }); }} aria-label={`Añadir ${f.nombre}`} /></td>
                    <td className="nom">{f.nombre}</td>
                    <td>{f.raw ? (tipoFinal(f) || <span className="dud">sin tipo</span>) : (
                      <span className="sel-c"><select className="celda" value={tipoFinal(f)} onChange={(e) => set({ overNom: { ...d.overNom, [f.nombre]: e.target.value } })} aria-label={`Tipo de ${f.nombre}`}><option value="">—</option>{tipos.map((x) => <option key={x}>{x}</option>)}</select><IconoBBVA nombre="fold" size={11} /></span>
                    )}</td>
                    <td className="mini">{f.rep ? "Repetido en lo pegado" : f.ya ? `Ya está en el pase${f.ya.cod ? " (" + f.ya.cod + ")" : ""}` : f.raw ? `«${f.raw}» en el Excel` : "deducido del nombre"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sinTipo.length > 0 && <p className="aviso">{plural(sinTipo.length, "tipo del Excel no tiene", "tipos del Excel no tienen")} equivalencia: elígela arriba para poder añadirlos.</p>}
      <div className="pie">
        {!d.proy && a.filas.length > 0 && <span className="nota">Elige el proyecto.</span>}
        <button type="button" className="btn btn-t" onClick={cerrar}>Cancelar</button>
        <button type="button" className="btn" disabled={!n || !d.proy} onClick={ok}>Añadir {plural(n, "componente", "componentes")}{proyObj ? ` a ${proyObj.corto}` : ""}</button>
      </div>
    </>
  );
}
