// Monitor de pases · ayuda: el manual (web/manual.md), que se abre en la
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
  if (jira?.url && (jira.sesion || ses.jira)?.estado !== "iniciada") out.push(["jira", "Jira no está conectado: así se crea el token, paso a paso."]);
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

export function Ayuda({ cerrar, vista, estado, jira }) {
  const [secciones, setSecciones] = useState(null);
  const [err, setErr] = useState(null);
  const [pestana, setPestana] = useState("manual");
  const [actual, setActual] = useState(SECCION_DE_VISTA[vista] || "inicio");
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
  const resultados = useMemo(() => (secciones && q.trim() ? buscar(secciones, q) : []), [secciones, q]);
  const sec = secciones?.find((s) => s.id === actual) || secciones?.[0];
  const ahora = avisos(estado, jira);
  return html`<div class="velo velo-ayuda" onMouseDown=${(e) => e.target === e.currentTarget && cerrar()}>
    <aside class="panel panel-ayuda" role="dialog" aria-modal="true" aria-labelledby="ay-t">
      <div class="panel-cab">
        <div class="fila1">
          <h2 id="ay-t" tabindex="-1" ref=${caja}><${Icono} n="ayuda" /> Ayuda</h2>
          <button class="btn btn-t btn-s" onClick=${cerrar} aria-label="Cerrar la ayuda"><${Icono} n="cerrar" /></button>
        </div>
        <div class="segmento" role="tablist" aria-label="Ayuda">
          <button role="tab" aria-selected=${pestana === "manual"} aria-pressed=${pestana === "manual"} onClick=${() => setPestana("manual")}><${Icono} n="fichero" /> Manual</button>
          <button role="tab" aria-selected=${pestana === "chat"} aria-pressed=${pestana === "chat"} onClick=${() => setPestana("chat")}><${Icono} n="chispa" /> Pregúntale</button>
        </div>
      </div>
      <div hidden=${pestana !== "chat"} class="caja-chat"><${Chat} secciones=${secciones || []} vista=${vista} irA=${irA} /></div>
      ${pestana === "chat" ? "" : html`<div class="panel-cuerpo cuerpo-ayuda" ref=${cuerpo}>
        <label class="buscar"><span class="sr">Buscar en el manual</span><${Icono} n="buscar" />
          <input class="inp" type="search" placeholder="Buscar en el manual" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
        ${err && html`<p class="nota">No se ha podido cargar el manual: ${err}</p>`}
        ${q.trim() ? html`<div class="resultados-ayuda">
            ${resultados.length ? resultados.map((r) => html`<button class="res-ayuda" key=${r.s.id} onClick=${() => irA(r.s.id)}>
              <b>${r.s.titulo}</b>${r.extracto ? html`<span>${r.extracto.replace(/[*`#>|]/g, "").slice(0, 180)}…</span>` : ""}</button>`)
              : html`<p class="suave">Nada en el manual con «${q}». <button class="lnk enlace-ayuda" onClick=${() => setPestana("chat")}>Pregúntaselo a Copilot</button></p>`}
          </div>`
        : html`
          ${ahora.length ? html`<section class="ahora-ayuda" aria-label="Ahora mismo"><b>Ahora mismo</b>
            <ul>${ahora.map(([id, t]) => html`<li key=${t}><button class="lnk" onClick=${() => irA(id)}>${t}</button></li>`)}</ul></section>` : ""}
          <nav class="indice-ayuda" aria-label="Índice del manual">${(secciones || []).map((s) => html`<button key=${s.id} aria-current=${s.id === sec?.id ? "true" : undefined} onClick=${() => irA(s.id)}>${s.titulo}</button>`)}</nav>
          ${sec ? html`<article class="seccion-ayuda" aria-labelledby="ay-sec"><h3 id="ay-sec">${sec.titulo}</h3><${Markdown} texto=${sec.cuerpo} />
            <p class="pie-ayuda">¿No lo encuentras? <button class="lnk enlace-ayuda" onClick=${() => setPestana("chat")}>Pregúntaselo a Copilot</button></p></article>` : !err ? html`<p class="tenue">Cargando el manual…</p>` : ""}`}
      </div>`}
    </aside>
  </div>`;
}
