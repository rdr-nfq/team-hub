// RDR Coding · ayuda: el manual (web/manual.md), que se abre en la
// sección de la pestaña en la que estás, con buscador y avisos según la
// situación, y un chat que responde con Copilot CLI leyendo ese manual.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, Icono, Markdown } from "./comun.js";

export const SECCION_DE_VISTA = {
  ramas: "ramas", proyectos: "proyectos", proyecto: "proyectos", actividad: "actividad", commits: "commits", commit: "commits",
  diff: "commits", dps: "dps", dp: "dps", repos: "repos", repo: "repos", pr: "repos", copilot: "copilot", pase: "pase", ajustes: "ajustes",
};
const SUGERENCIAS = ["¿Cómo conecto Jira?", "¿Por qué la primera carga está en pausa?", "¿Cómo preparo el .json del pase?", "¿Qué sale de la VDI?"];
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

let MANUAL = null;
function cargarManual() {
  if (!MANUAL) MANUAL = fetch("manual.md", { cache: "no-store" }).then((r) => r.text()).then((md) =>
    md.split(/\n(?=## )/).slice(1).map((trozo) => {
      const [cab, ...resto] = trozo.split("\n");
      const m = /^##\s+(.*?)\s*(?:\{#([\w-]+)\})?\s*$/.exec(cab);
      return { id: m?.[2] || sinAcentos(m?.[1]).replace(/\W+/g, "-"), titulo: m?.[1] || cab, cuerpo: resto.join("\n").trim() };
    }));
  return MANUAL;
}

/** Secciones (y el párrafo) que mejor encajan con un texto. */
function buscar(secciones, q) {
  const ws = sinAcentos(q).split(/\W+/).filter((w) => w.length > 2);
  if (!ws.length) return [];
  return secciones.map((s) => {
    const t = sinAcentos(s.titulo + "\n" + s.cuerpo);
    const puntos = ws.reduce((a, w) => a + (t.split(w).length - 1) + (sinAcentos(s.titulo).includes(w) ? 5 : 0), 0);
    const parrafos = s.cuerpo.split(/\n{2,}/);
    const mejor = parrafos.map((p) => [ws.filter((w) => sinAcentos(p).includes(w)).length, p]).sort((a, b) => b[0] - a[0])[0];
    return { s, puntos, extracto: mejor?.[0] ? mejor[1] : "" };
  }).filter((x) => x.puntos > 0).sort((a, b) => b.puntos - a.puntos).slice(0, 6);
}

/** Avisos según la situación real de la app, con la sección que lo explica. */
function avisos(estado, jira) {
  const out = [], s = estado?.sincro || {}, ses = estado?.sesion || {};
  if (s.estado === "pausada") out.push(["sincronizacion", "La sincronización está en pausa por la cuota de GitHub y sigue sola. Así funciona."]);
  else if (s.primeraCarga && s.enCurso) out.push(["inicio", "Está haciendo la primera carga: puedes usar la app mientras tanto."]);
  if (ses.bbva && ses.bbva.estado !== "iniciada") out.push(["inicio", "Falta iniciar sesión en GitHub BBVA."]);
  if (ses.nfq && ses.nfq.estado !== "iniciada") out.push(["inicio", "Sin GitHub NFQ no se publican los DPs ni los pases."]);
  if (jira?.url && (jira.sesion || ses.jira)?.estado !== "iniciada") out.push(["jira", "Jira no está conectado: así se entra, paso a paso."]);
  if (s.estado === "error") out.push(["problemas", "La última sincronización falló: mira Problemas frecuentes."]);
  return out;
}

function Chat({ secciones, vista, irA, inicial }) {
  const [msgs, setMsgs] = useState([]);
  const [texto, setTexto] = useState(inicial || "");
  const [ocupado, setOcupado] = useState(false);
  const lista = useRef(null);
  const entrada = useRef(null);
  useEffect(() => { entrada.current?.focus(); }, []);
  useEffect(() => { lista.current?.scrollTo(0, lista.current.scrollHeight); }, [msgs]);
  const poner = (i, cambios) => setMsgs((m) => m.map((x, k) => (k === i ? { ...x, ...cambios } : x)));
  const preguntar = async (q) => {
    q = String(q || "").trim();
    if (!q || ocupado) return;
    setTexto("");
    setOcupado(true);
    const historial = msgs.map((m) => ({ rol: m.rol, texto: m.texto })).slice(-6);
    const i = msgs.length + 1;  // la respuesta va detrás de la pregunta
    setMsgs([...msgs, { rol: "persona", texto: q }, { rol: "ayuda", texto: "", cargando: true }]);
    try {
      const { id } = await api("ayuda/preguntar", { pregunta: q, vista, historial });
      for (let n = 0; n < 600; n++) {
        await new Promise((r) => setTimeout(r, 700));
        const t = await api("copilot/tarea?id=" + encodeURIComponent(id));
        poner(i, { texto: limpiarSalida(t.salida || "") });
        if (!["preparando", "en curso"].includes(t.estado)) {
          if (t.estado === "error") throw new Error(t.error || "Copilot no ha podido responder.");
          break;
        }
      }
      poner(i, { cargando: false });
    } catch (e) {
      // Sin Copilot: lo que dice el manual.
      const r = buscar(secciones, q)[0];
      poner(i, { cargando: false, sinCopilot: e.message,
        texto: r ? `**${r.s.titulo}**\n\n${r.extracto || r.s.cuerpo.split(/\n{2,}/)[0]}` : "No encuentro nada en el manual sobre eso.", seccion: r?.s.id });
    } finally { setOcupado(false); setTimeout(() => entrada.current?.focus(), 0); }
  };
  return html`<div class="chat-ayuda">
    <div class="msgs-ayuda" ref=${lista} aria-live="polite">
      ${!msgs.length && html`<div class="intro-chat">
        <p>Pregunta lo que quieras sobre cómo usar la app. Responde <b>Copilot</b> leyendo este manual y la situación de tu app.</p>
        <div class="sugerencias">${SUGERENCIAS.map((s) => html`<button class="chip-filtro" key=${s} onClick=${() => preguntar(s)}>${s}</button>`)}</div>
      </div>`}
      ${msgs.map((m, k) => html`<div key=${k} class=${"msg-ayuda " + m.rol}>
        ${m.rol === "persona" ? html`<p>${m.texto}</p>` : html`
          ${m.sinCopilot ? html`<p class="nota">Copilot no está disponible ahora (${m.sinCopilot}). Esto es lo que dice el manual:</p>` : ""}
          ${m.texto ? html`<${Markdown} texto=${m.texto} />` : html`<p class="tenue"><${Icono} n="actualizar" cls="gira" /> Copilot está leyendo el manual…</p>`}
          ${m.seccion ? html`<button class="lnk enlace-ayuda" onClick=${() => irA(m.seccion)}>Abrir esa sección del manual</button>` : ""}`}
      </div>`)}
    </div>
    <form class="form-chat" onSubmit=${(e) => { e.preventDefault(); preguntar(texto); }}>
      <label class="sr" for="chat-ayuda">Tu pregunta</label>
      <textarea id="chat-ayuda" ref=${entrada} class="inp" rows="2" placeholder="Escribe tu pregunta…" value=${texto} disabled=${ocupado}
        onInput=${(e) => setTexto(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); preguntar(texto); } }} />
      <button class="btn btn-pri" type="submit" disabled=${ocupado || !texto.trim()}><${Icono} n="enviar" /> Preguntar</button>
    </form>
  </div>`;
}

/** La salida de Copilot CLI sin las líneas de uso/estadísticas del final. */
function limpiarSalida(t) {
  return t.replace(/\n(Total usage est|Total duration|Total code changes|Usage by model)[\s\S]*$/i, "").trim();
}

/* Cada sección: color (acentos BBVA, texto Electric encima), icono, grupo y la pestaña de la app que explica. */
const META = {
  inicio: { color: "serene", icono: "ir", grupo: "empezar", vista: null, corto: "Abrir y cerrar la app, conectar las cuentas y la primera carga." },
  jira: { color: "aqua", icono: "externo", grupo: "empezar", vista: "proyectos", corto: "Entrar con tu usuario de BBVA y qué lee la app de Jira." },
  ajustes: { color: "canary", icono: "filtro", grupo: "empezar", vista: "ajustes", corto: "Sesiones, patrones de ramas y DPs, reglas de componentes y Jira." },
  ramas: { color: "lime", icono: "rama", grupo: "dia", vista: "ramas", corto: "Todas las ramas y releases, de qué proyecto es cada una y su estado." },
  proyectos: { color: "serene", icono: "marcador", grupo: "dia", vista: "proyectos", corto: "Los proyectos de NFQ, el histórico y las releases de CIBRDR." },
  actividad: { color: "canary", icono: "historial", grupo: "dia", vista: "actividad", corto: "Una línea de tiempo con commits, Actions y DPs." },
  commits: { color: "purple", icono: "commit", grupo: "dia", vista: "commits", corto: "Todos los commits por días, con sus cambios." },
  dps: { color: "mandarin", icono: "paquete", grupo: "dia", vista: "dps", corto: "Los DPs por release, sus componentes y lo que traen." },
  repos: { color: "aqua", icono: "repo", grupo: "dia", vista: "repos", corto: "Navegar los repositorios como en la web de GitHub." },
  filtros: { color: "lime", icono: "buscar", grupo: "dia", vista: null, corto: "Filtros del lateral, vistas guardadas e «Ir a…» (Ctrl+K)." },
  pase: { color: "lime", icono: "subir", grupo: "pase", vista: "pase", corto: "Elegir proyectos y generar el .json del pase." },
  copilot: { color: "purple", icono: "chispa", grupo: "pase", vista: "copilot", corto: "Preguntar sobre el código o modificar una feature con Copilot." },
  sincronizacion: { color: "aqua", icono: "actualizar", grupo: "ayuda", vista: null, corto: "Cada cuánto se actualiza y por qué a veces hace una pausa." },
  problemas: { color: "mandarin", icono: "ayuda", grupo: "ayuda", vista: null, corto: "Lo que suele fallar y cómo arreglarlo." },
  seguridad: { color: "serene", icono: "candado", grupo: "ayuda", vista: null, corto: "Qué sale de la VDI y qué no sale nunca." },
  atajos: { color: "canary", icono: "columnas", grupo: "ayuda", vista: null, corto: "Las teclas que ahorran clics." },
};
const GRUPOS = [["empezar", "Para empezar"], ["dia", "El día a día"], ["pase", "Preparar el pase"], ["ayuda", "Cuando algo no va"]];
const RECORRIDOS = [
  { id: "primer-dia", titulo: "Mi primer día", texto: "Abrir la app, conectar las cuentas y marcar los proyectos de NFQ.", color: "serene", icono: "ir",
    pasos: ["inicio", "jira", "proyectos"] },
  { id: "pase", titulo: "Preparar un pase", texto: "De las ramas y sus DPs al .json del pase.", color: "lime", icono: "subir", pasos: ["ramas", "dps", "pase"] },
  { id: "algo-falla", titulo: "Algo no va bien", texto: "Pausas por la cuota, errores típicos y qué sale de la VDI.", color: "mandarin", icono: "ayuda",
    pasos: ["sincronizacion", "problemas", "seguridad"] },
];
const NOMBRE_VISTA = { ramas: "Ramas", proyectos: "Proyectos", actividad: "Actividad", commits: "Commits", dps: "DPs", repos: "Repos",
  copilot: "Copilot", pase: "Pase", ajustes: "Ajustes" };
const meta = (id) => META[id] || { color: "serene", icono: "fichero", grupo: "ayuda" };
const textoPlano = (md) => String(md || "").replace(/`([^`]*)`/g, "$1").replace(/\*\*?|_|\[|\]\([^)]*\)|^[>#\-*\d.)\s]+/gm, "").trim();
/** La primera frase de la sección, para la tarjeta. */
const resumen = (s) => META[s.id]?.corto || resumenDe(s);
const resumenDe = (s) => {
  const p = (s.cuerpo.split(/\n(?=###)/)[0].split(/\n{2,}/).find((x) => x.trim() && !/^[-*\d|#>]/.test(x.trim())) || "");
  const t = textoPlano(p).replace(/\s+/g, " ");
  const f = t.split(/(?<=[.:])\s/)[0];
  return f.length > 150 ? f.slice(0, 147) + "…" : f;
};
/** La sección partida en introducción y apartados (### …). */
const partes = (s) => {
  const [intro, ...subs] = s.cuerpo.split(/\n(?=### )/);
  const lista = subs.map((t) => { const [cab, ...r] = t.split("\n"); return { titulo: cab.replace(/^###\s*/, ""), cuerpo: r.join("\n").trim() }; });
  return /^###\s/.test(intro) ? { intro: "", subs: [{ titulo: intro.split("\n")[0].replace(/^###\s*/, ""), cuerpo: intro.split("\n").slice(1).join("\n").trim() }, ...lista] }
    : { intro: intro.trim(), subs: lista };
};

function Portada({ secciones, ahora, irA, empezar }) {
  return html`<div class="portada-ayuda">
    ${ahora.length ? html`<section class="ahora-ayuda" aria-label="Ahora mismo">
      <p class="eyebrow-ayuda">Ahora mismo, en tu app</p>
      <ul>${ahora.map(([id, t]) => html`<li key=${t}><${Icono} n="reloj" /><span>${t}</span>
        <button class="btn btn-s" onClick=${() => irA(id)}>Leer más <${Icono} n="ir" /></button></li>`)}</ul>
    </section>` : ""}
    <section aria-labelledby="ay-rec">
      <h3 class="tit-grupo" id="ay-rec">Recorridos guiados</h3>
      <div class="recorridos">${RECORRIDOS.map((r) => html`<button key=${r.id} class=${"recorrido acento-" + r.color} onClick=${() => empezar(r)}>
        <span class="ico-rec"><${Icono} n=${r.icono} /></span>
        <b>${r.titulo}</b><span>${r.texto}</span>
        <span class="pasos-rec">${r.pasos.map((id, k) => html`<i key=${id}>${k + 1}</i>`)} <span>${r.pasos.length} pasos</span></span>
      </button>`)}</div>
    </section>
    ${GRUPOS.map(([g, t]) => {
      const xs = secciones.filter((s) => meta(s.id).grupo === g);
      return xs.length ? html`<section key=${g} aria-label=${t}>
        <h3 class="tit-grupo">${t}</h3>
        <div class="tarjetas-ayuda">${xs.map((s) => html`<button key=${s.id} class=${"tarjeta-ayuda borde-" + meta(s.id).color} onClick=${() => irA(s.id)}>
          <span class=${"ico-tarjeta acento-" + meta(s.id).color}><${Icono} n=${meta(s.id).icono} /></span>
          <span class="t"><b>${s.titulo}</b><span>${resumen(s)}</span></span>
        </button>`)}</div>
      </section>` : "";
    })}
  </div>`;
}

function Seccion({ sec, secciones, irA, irVista, recorrido, setRecorrido, preguntar }) {
  const m = meta(sec.id);
  const { intro, subs } = useMemo(() => partes(sec), [sec]);
  const n = secciones.findIndex((s) => s.id === sec.id);
  const ant = secciones[n - 1], sig = secciones[n + 1];
  const paso = recorrido ? recorrido.pasos.indexOf(sec.id) : -1;
  const cuerpo = useRef(null);
  const saltar = (k) => cuerpo.current?.querySelector("#sub-" + k)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return html`<article class="seccion-ayuda" aria-labelledby="ay-sec" ref=${cuerpo}>
    ${recorrido && paso >= 0 ? html`<div class=${"barra-recorrido acento-" + recorrido.color}>
      <span><b>${recorrido.titulo}</b> · paso ${paso + 1} de ${recorrido.pasos.length}</span>
      <span class="puntos-rec">${recorrido.pasos.map((id, k) => html`<button key=${id} aria-label=${"Paso " + (k + 1)} aria-current=${k === paso ? "step" : undefined}
        class=${k <= paso ? "hecho" : ""} onClick=${() => irA(id)} />`)}</span>
      <button class="btn btn-t btn-s" onClick=${() => setRecorrido(null)}>Salir</button>
    </div>` : ""}
    <header class=${"cab-seccion acento-" + m.color}>
      <span class="ico-seccion"><${Icono} n=${m.icono} /></span>
      <div class="t">
        <p class="eyebrow-ayuda">${(GRUPOS.find((g) => g[0] === m.grupo) || [])[1] || "Manual"} · ${n + 1} de ${secciones.length}</p>
        <h3 id="ay-sec">${sec.titulo}</h3>
        <p>${resumen(sec)}</p>
      </div>
      ${m.vista && irVista ? html`<button class="btn btn-s btn-sobre-acento" onClick=${() => irVista(m.vista)}>Ir a ${NOMBRE_VISTA[m.vista]} <${Icono} n="ir" /></button>` : ""}
    </header>
    ${subs.length > 1 ? html`<nav class="mini-indice" aria-label="En esta sección">${subs.map((x, k) => html`<button key=${k} class="chip-filtro" onClick=${() => saltar(k)}>${x.titulo}</button>`)}</nav>` : ""}
    ${intro ? html`<div class="intro-seccion"><${Markdown} texto=${intro} /></div>` : ""}
    ${subs.map((x, k) => html`<details key=${sec.id + k} id=${"sub-" + k} class=${"sub-ayuda borde-" + m.color} open=${subs.length <= 6 || k === 0}>
      <summary><span class=${"num-sub acento-" + m.color}>${k + 1}</span>${x.titulo}<${Icono} n="desplegado" cls="flecha-sub" /></summary>
      <div class="cuerpo-sub"><${Markdown} texto=${x.cuerpo} /></div>
    </details>`)}
    ${recorrido && paso >= 0 ? html`<div class="fin-recorrido">
      ${paso < recorrido.pasos.length - 1
        ? html`<button class="btn btn-pri" onClick=${() => irA(recorrido.pasos[paso + 1])}>Siguiente paso: ${secciones.find((s) => s.id === recorrido.pasos[paso + 1])?.titulo} <${Icono} n="ir" /></button>`
        : html`<p><${Icono} n="ok" /> <b>Recorrido terminado.</b></p><button class="btn" onClick=${() => { setRecorrido(null); irA("portada"); }}>Volver a la portada</button>`}
    </div>` : html`<nav class="ant-sig" aria-label="Más del manual">
      ${ant ? html`<button class="ant" onClick=${() => irA(ant.id)}><span>Anterior</span><b>${ant.titulo}</b></button>` : html`<span />`}
      ${sig ? html`<button class="sig" onClick=${() => irA(sig.id)}><span>Siguiente</span><b>${sig.titulo}</b></button>` : ""}
    </nav>`}
    <p class="pie-ayuda"><${Icono} n="chispa" /> ¿No lo encuentras? <button class="lnk enlace-ayuda" onClick=${preguntar}>Pregúntaselo a Copilot</button></p>
  </article>`;
}

export function Ayuda({ cerrar, vista, estado, jira, irVista }) {
  const [secciones, setSecciones] = useState(null);
  const [err, setErr] = useState(null);
  const [pestana, setPestana] = useState("manual");
  const [actual, setActual] = useState(SECCION_DE_VISTA[vista] || "portada");
  const [recorrido, setRecorrido] = useState(null);
  const [q, setQ] = useState("");
  const cuerpo = useRef(null);
  const caja = useRef(null);
  useEffect(() => { cargarManual().then(setSecciones, (e) => setErr(e.message)); }, []);
  useEffect(() => {
    const previo = document.activeElement;
    caja.current?.focus();
    const t = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("keydown", t, true);
    return () => { document.removeEventListener("keydown", t, true); previo?.focus?.(); };
  }, []);
  const irA = (id) => { setActual(id); setQ(""); setPestana("manual"); setTimeout(() => cuerpo.current?.scrollTo(0, 0), 0); };
  const empezar = (r) => { setRecorrido(r); irA(r.pasos[0]); };
  const resultados = useMemo(() => (secciones && q.trim() ? buscar(secciones, q) : []), [secciones, q]);
  const sec = actual === "portada" ? null : secciones?.find((s) => s.id === actual);
  const ahora = avisos(estado, jira);
  return html`<div class="velo velo-ayuda" onMouseDown=${(e) => e.target === e.currentTarget && cerrar()}>
    <aside class="panel panel-ayuda" role="dialog" aria-modal="true" aria-labelledby="ay-t">
      <div class="panel-cab cab-ayuda">
        <div class="fila1">
          <h2 id="ay-t" tabindex="-1" ref=${caja}><span class="marca-ayuda"><${Icono} n="ayuda" /></span> Manual de RDR Coding</h2>
          <button class="btn btn-t btn-s" onClick=${cerrar} aria-label="Cerrar la ayuda"><${Icono} n="cerrar" /></button>
        </div>
        <div class="fila2">
          <div class="segmento" role="tablist" aria-label="Ayuda">
            <button role="tab" aria-selected=${pestana === "manual"} aria-pressed=${pestana === "manual"} onClick=${() => setPestana("manual")}><${Icono} n="fichero" /> Manual</button>
            <button role="tab" aria-selected=${pestana === "chat"} aria-pressed=${pestana === "chat"} onClick=${() => setPestana("chat")}><${Icono} n="chispa" /> Pregúntale</button>
          </div>
          ${pestana === "manual" ? html`<label class="buscar buscar-ayuda"><span class="sr">Buscar en el manual</span><${Icono} n="buscar" />
            <input class="inp" type="search" placeholder="Buscar: token, pase, cuota…" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>` : ""}
        </div>
      </div>
      <div hidden=${pestana !== "chat"} class="caja-chat"><${Chat} secciones=${secciones || []} vista=${vista} irA=${irA} /></div>
      ${pestana === "chat" ? "" : html`<div class="panel-cuerpo cuerpo-ayuda" ref=${cuerpo}>
        ${err && html`<p class="nota">No se ha podido cargar el manual: ${err}</p>`}
        ${!secciones && !err ? html`<p class="tenue">Cargando el manual…</p>` : ""}
        ${secciones && (q.trim() ? html`<div class="resultados-ayuda">
            ${resultados.length ? resultados.map((r) => html`<button class=${"res-ayuda borde-" + meta(r.s.id).color} key=${r.s.id} onClick=${() => irA(r.s.id)}>
              <span class=${"ico-tarjeta acento-" + meta(r.s.id).color}><${Icono} n=${meta(r.s.id).icono} /></span>
              <span class="t"><b>${r.s.titulo}</b>${r.extracto ? html`<span>${textoPlano(r.extracto).slice(0, 180)}…</span>` : ""}</span></button>`)
              : html`<p class="suave">Nada en el manual con «${q}». <button class="lnk enlace-ayuda" onClick=${() => setPestana("chat")}>Pregúntaselo a Copilot</button></p>`}
          </div>`
          : sec ? html`
            <button class="lnk volver-ayuda" onClick=${() => { setRecorrido(null); irA("portada"); }}><${Icono} n="atras" /> Portada del manual</button>
            <${Seccion} sec=${sec} secciones=${secciones} irA=${irA} irVista=${irVista && ((v) => { cerrar(); irVista(v); })}
              recorrido=${recorrido} setRecorrido=${setRecorrido} preguntar=${() => setPestana("chat")} />`
          : html`<${Portada} secciones=${secciones} ahora=${ahora} irA=${irA} empezar=${empezar} />`)}
      </div>`}
    </aside>
  </div>`;
}
