// RDR Coding · asistentes con GitHub Copilot CLI: consulta (solo lee el
// código) y modificación de features (los cambios se revisan aquí y se suben
// solo cuando la persona lo confirma).
import { html, useState, useEffect, useRef } from "./vendor/preact-htm.mjs";
import { api, Icono, Markdown, Rama, corto, plural, uniq } from "./comun.js";
import { Diferencias } from "./diffs.js";

const EN_MARCHA = ["preparando", "en curso"];

function Comprobacion({ ok, texto, detalle }) {
  return html`<li class=${ok ? "ok" : "falta"}><span class=${ok ? "ico-ok" : "ico-mal"}><${Icono} n=${ok ? "ok" : "mal"} /></span>
    <span><b>${texto}</b>${detalle ? html` <span class="tenue">${detalle}</span>` : ""}</span></li>`;
}

function Preparacion({ est, recargar, seguir, aviso }) {
  const [abierta, setAbierta] = useState(false);
  const instalar = async () => {
    try { const r = await api("copilot/instalar", {}); seguir(r.id); aviso("Instalando Copilot CLI con npm…"); } catch (e) { aviso(e.message, "mal"); }
  };
  const sesion = async () => {
    try { await api("copilot/sesion", {}); setAbierta(true); } catch (e) { aviso(e.message, "mal"); }
  };
  return html`<section class="caja preparacion" aria-labelledby="cop-prep">
    <h2 id="cop-prep">Copilot CLI ${est.listo ? html`<span class="chip chip-ok">Listo</span>` : html`<span class="chip chip-mal">Falta preparar</span>`}</h2>
    <ul class="comprobaciones">
      <${Comprobacion} ok=${!!est.copilot} texto="Copilot CLI"
        detalle=${est.copilot ? `${est.copilot}${est.donde ? " · encontrado en " + est.donde : ""}` : est.instalado ? "encontrado, pero no arranca" : "no encontrado"} />
      ${est.usaNode || !est.instalado ? html`<${Comprobacion} ok=${!!est.node && !est.problemas.some((p) => p.includes("Node"))} texto="Node.js 22 o superior" detalle=${est.node || "no encontrado"} />` : ""}
      <${Comprobacion} ok=${!!est.git} texto="Git" detalle=${est.git || "no encontrado"} />
    </ul>
    ${est.problemas.map((p) => html`<p class="nota">${p}</p>`)}
    ${est.ruta && est.copilot ? html`<p class="tenue mono" style="margin:6px 0 0;font-size:12px;overflow-wrap:anywhere">${est.ruta}</p>` : ""}
    <div class="prueba">
      ${!est.copilot && est.npm ? html`<button class="btn btn-pri" onClick=${instalar}>Instalar Copilot CLI (npm)</button>` : ""}
      ${est.copilot ? html`<button class="btn" onClick=${sesion}><${Icono} n="usuario" /> Iniciar sesión en Copilot</button>` : ""}
      <button class="btn" onClick=${recargar}><${Icono} n="actualizar" /> Comprobar de nuevo</button>
    </div>
    ${abierta ? html`<p class="nota">Se ha abierto una ventana con Copilot CLI. Escribe <span class="mono">/login</span> y sigue los pasos en el navegador
      (si te pregunta, elige tu GitHub de empresa e indica <span class="mono">bbva.ghe.com</span>). Después cierra esa ventana.</p>` : ""}
    <p class="tenue" style="margin:10px 0 0;font-size:12px">Si npm o Copilot no conectan, casi siempre es el proxy: define HTTPS_PROXY y HTTP_PROXY en las variables de entorno de tu usuario o en Ajustes → Copilot.</p>
  </section>`;
}

function TareaCopilot({ t, ir, aviso, actualizar }) {
  const [mensaje, setMensaje] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (t.modo === "modificar" && !mensaje) setMensaje(t.pregunta.slice(0, 72)); }, [t.id]);
  const enMarcha = EN_MARCHA.includes(t.estado);
  const dur = Math.round(((t.fin || Date.now() / 1000) - t.inicio));
  const aplicar = async () => {
    setOcupado(true);
    try { const r = await api("copilot/aplicar", { id: t.id, mensaje }); aviso(`Subido a ${r.rama}: commit ${r.sha.slice(0, 7)}.`); actualizar(t.id); }
    catch (e) { aviso(e.message, "mal"); } finally { setOcupado(false); setConfirmar(false); }
  };
  const descartar = async () => { try { await api("copilot/descartar", { id: t.id }); actualizar(t.id); } catch (e) { aviso(e.message, "mal"); } };
  const ctx = t.contexto || {};
  const etiqueta = t.modo === "instalar" ? "Instalación" : ctx.tipo === "rama" ? ctx.id.split(":").slice(1).join(":") : ctx.tipo === "dp" ? ctx.cod : "Sin contexto";
  return html`<li class="tarea-cop ${t.modo}">
    <div class="cab-tarea">
      <span class="chip ${t.modo === "modificar" ? "chip-merg" : t.modo === "instalar" ? "" : "chip-pr"}">${t.modo === "modificar" ? "Modificar" : t.modo === "instalar" ? "npm" : "Consulta"}</span>
      <span class="mono tenue">${etiqueta}</span>
      <span class="tenue">${enMarcha ? html`<${Icono} n="actualizar" cls="gira" /> ${t.estado === "preparando" ? "Preparando la copia local…" : "Copilot está trabajando…"}` : `${t.estado} · ${dur} s`}</span>
      ${enMarcha ? html`<button class="btn btn-t btn-s" onClick=${() => api("copilot/cancelar", { id: t.id })}>Cancelar</button>` : ""}
    </div>
    <p class="pregunta">${t.pregunta}</p>
    ${t.salida ? (enMarcha || t.modo === "instalar" ? html`<pre class="salida-cop">${t.salida}</pre>` : html`<div class="respuesta"><${Markdown} texto=${t.salida} /></div>`) : ""}
    ${t.error ? html`<p class="nota" role="alert">${t.error}</p>` : ""}
    ${t.aviso ? html`<p class="aviso-proxy" role="alert"><${Icono} n="mal" /> ${t.aviso}</p>` : ""}
    ${t.modo === "modificar" && t.estado === "terminada" ? (t.aplicado ? html`<p class="hecho">Subido a <span class="mono">${t.aplicado.rama}</span>: commit${" "}<button class="lnk mono" onClick=${() => ir({ vista: "commit", repo: t.aplicado.repo || t.repo, sha: t.aplicado.sha })}>${t.aplicado.sha.slice(0, 7)}</button>.</p>`
        : t.descartada ? html`<p class="tenue">Cambios descartados.</p>`
        : !t.cambios?.length ? html`<p class="nota">Copilot no ha cambiado ningún fichero.</p>`
        : html`<div class="cambios-cop">
            <h3>Cambios propuestos en <span class="mono"><${Rama} nombre=${t.rama} /></span> · revísalos antes de subirlos</h3>
            <${Diferencias} ficheros=${t.cambios} repo=${t.repo} despues=${null} antes=${null} />
            <div class="subir-cop">
              <label class="campo"><span>Mensaje del commit</span><input class="inp" value=${mensaje} onInput=${(e) => setMensaje(e.target.value)} /></label>
              ${confirmar ? html`<button class="btn btn-pri" disabled=${ocupado || !mensaje.trim()} onClick=${aplicar}>${ocupado ? "Subiendo…" : `Sí, subir a ${t.rama}`}</button>
                  <button class="btn" onClick=${() => setConfirmar(false)}>No</button>`
                : html`<button class="btn btn-pri" disabled=${!mensaje.trim()} onClick=${() => setConfirmar(true)}><${Icono} n="subir" /> Hacer commit y subir</button>
                  <button class="btn" onClick=${descartar}>Descartar</button>`}
            </div>
          </div>`) : ""}
  </li>`;
}

export function VistaCopilot({ estado, contexto0, modo0, ir, aviso }) {
  const [est, setEst] = useState(null);
  const [tareas, setTareas] = useState([]);
  const [tipo, setTipo] = useState(contexto0?.tipo || "rama");
  const [rid, setRid] = useState(contexto0?.tipo === "rama" ? contexto0.id : "");
  const [dp, setDp] = useState(contexto0?.tipo === "dp" ? `${contexto0.repo}|${contexto0.cod}` : "");
  const [dps, setDps] = useState([]);
  const [modo, setModo] = useState(modo0 || "consultar");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const caja = useRef(null);
  const cargarEstado = () => api("copilot/estado").then(setEst, (e) => setEst({ problemas: [e.message] }));
  const cargarTarea = (id) => api("copilot/tarea?id=" + id).then((t) => setTareas((ts) => {
    const i = ts.findIndex((x) => x.id === id);
    return i < 0 ? [t, ...ts] : ts.map((x) => (x.id === id ? t : x));
  }), () => {});
  useEffect(() => {
    cargarEstado();
    api("copilot/tareas").then((r) => Promise.all(r.tareas.map((t) => api("copilot/tarea?id=" + t.id))).then(setTareas), () => {});
    api("dps").then((r) => setDps(r.dps), () => {});
    caja.current?.focus();
  }, []);
  const vivas = tareas.filter((t) => EN_MARCHA.includes(t.estado)).map((t) => t.id).join(",");
  useEffect(() => {
    if (!vivas) return;
    const iv = setInterval(() => vivas.split(",").forEach(cargarTarea), 1000);
    return () => clearInterval(iv);
  }, [vivas]);
  useEffect(() => { if (!vivas && tareas.some((t) => t.modo === "instalar")) cargarEstado(); }, [vivas]);
  const ramas = estado.ramas.filter((r) => !r.esBase && (modo === "consultar" || (!r.release && !r.mergeada))).sort((a, b) => (a.feature || "~").localeCompare(b.feature || "~") || a.repo.localeCompare(b.repo));
  const contexto = tipo === "rama" && rid ? { tipo: "rama", id: rid } : tipo === "dp" && dp ? { tipo: "dp", repo: dp.split("|")[0], cod: dp.split("|")[1] } : null;
  const listo = est?.listo;
  const puede = listo && texto.trim() && !enviando && (modo === "consultar" || contexto);
  const enviar = async () => {
    if (!puede) return;
    setEnviando(true);
    try { const r = await api("copilot/preguntar", { contexto, pregunta: texto.trim(), modo }); setTexto(""); cargarTarea(r.id); }
    catch (e) { aviso(e.message, "mal"); } finally { setEnviando(false); }
  };
  return html`<div class="contenido copilot">
    <div class="titulo-vista"><h1>Copilot</h1><p>Pregunta sobre el código de una rama o de un DP, o pide un cambio en una feature.</p></div>
    ${est && !est.listo ? html`<${Preparacion} est=${est} recargar=${cargarEstado} seguir=${cargarTarea} aviso=${aviso} />` : ""}
    <section class="caja composer" aria-labelledby="cop-preg">
      <h2 id="cop-preg" class="sr">Nueva petición</h2>
      <div class="fila-composer">
        <div class="segmento" role="group" aria-label="Qué quieres hacer">
          <button aria-pressed=${modo === "consultar"} onClick=${() => setModo("consultar")}><${Icono} n="buscar" /> Consultar</button>
          <button aria-pressed=${modo === "modificar"} onClick=${() => { setModo("modificar"); setTipo("rama"); }}><${Icono} n="chispa" /> Modificar una feature</button>
        </div>
        ${modo === "consultar" ? html`<div class="segmento" role="group" aria-label="Sobre qué">
          ${[["rama", "Una rama"], ["dp", "Un DP"], ["nada", "Todo el monitor"]].map(([k, t]) => html`<button key=${k} aria-pressed=${tipo === k} onClick=${() => setTipo(k)}>${t}</button>`)}
        </div>` : ""}
        ${tipo === "rama" ? html`<label class="campo-ctx"><span class="sr">Rama</span><select class="inp mono" value=${rid} onChange=${(e) => setRid(e.target.value)}>
            <option value="">Elige la rama…</option>
            ${uniq(ramas.map((r) => r.feature || (r.release ? "Releases" : "Sin proyecto"))).map((g) => html`<optgroup key=${g} label=${g}>
              ${ramas.filter((r) => (r.feature || (r.release ? "Releases" : "Sin proyecto")) === g).map((r) => html`<option key=${r.id} value=${r.id}>${corto(r.repo)} · ${r.rama}</option>`)}
            </optgroup>`)}
          </select></label>`
        : tipo === "dp" ? html`<label class="campo-ctx"><span class="sr">DP</span><select class="inp mono" value=${dp} onChange=${(e) => setDp(e.target.value)}>
            <option value="">Elige el DP…</option>
            ${dps.map((d) => html`<option key=${d.repo + d.cod} value=${d.repo + "|" + d.cod}>${d.cod} · ${corto(d.repo)} · ${d.rama}</option>`)}
          </select></label>` : ""}
      </div>
      <label class="campo"><span class="sr">${modo === "consultar" ? "Pregunta" : "Cambio que quieres"}</span>
        <textarea ref=${caja} class="inp texto-cop" rows="3" value=${texto} onInput=${(e) => setTexto(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
          placeholder=${modo === "consultar" ? "¿Qué cambia esta rama en el cálculo de importes? ¿Qué componentes del DP tocan la tabla de operaciones?"
            : "Añade la validación de fecha obligatoria en CargadorTerceros y su prueba unitaria"} /></label>
      <div class="pie-composer">
        <span class="tenue">${modo === "consultar" ? "Copilot lee el código en una copia local y no cambia nada."
          : "Copilot cambia el código en una copia local de la rama. No se sube nada hasta que revises los cambios y lo confirmes."}</span>
        <button class="btn btn-pri" disabled=${!puede} onClick=${enviar}><${Icono} n="enviar" /> ${modo === "consultar" ? "Preguntar" : "Pedir el cambio"}</button>
      </div>
      ${!listo && est ? html`<p class="nota">Prepara Copilot CLI arriba para poder usarlo.</p>` : ""}
      ${modo === "modificar" && !contexto ? html`<p class="nota">Elige la rama de la feature que quieres modificar.</p>` : ""}
    </section>
    ${tareas.length ? html`<ol class="tareas-cop">${tareas.map((t) => html`<${TareaCopilot} key=${t.id} t=${t} ir=${ir} aviso=${aviso} actualizar=${cargarTarea} />`)}</ol>`
      : html`<p class="tenue">Las respuestas aparecerán aquí.</p>`}
  </div>`;
}
