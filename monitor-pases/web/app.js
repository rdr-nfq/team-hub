// Monitor de pases · interfaz. Preact + htm vendorizados: nada se descarga de internet.
import { html, render, useState, useEffect, useMemo, useRef, useCallback } from "./vendor/preact-htm.mjs";
import {
  BotonTema, ChipDP, ESTADO_PR, EstadoRun, FUENTE, Icono, Marca, Rama, api, clonar, colorDe, corto, fCorta, fLarga, hace, leerLS, plural, ponerColores, ponerIr, ponerLS, proximoSabado, uniq,
} from "./comun.js";
import { VistaCommits, VistaCommit, VistaDiffRama } from "./diffs.js";
import { PantallaEntrada, FilaSesion } from "./entrada.js";
import { VistaDPs, VistaDP } from "./dps.js";
import { VistaRepos, VistaRepo, VistaPR } from "./repos.js";
import { VistaCopilot } from "./copilot.js";
import { BarraFiltros, LateralFiltros, guardarFiltros, leerFiltros, pasa, propsDeRepos, useFacetas } from "./filtros.js";
import { Paleta } from "./paleta.js";

/* ── Cabecera ── */
function EstadoSincro({ s, cuota }) {
  if (!s) return null;
  if (s.enCurso || s.estado === "en curso")
    return html`<span class="sincro"><${Icono} n="actualizar" cls="gira" /> Sincronizando · <b class="num">${s.repos?.[0] || 0}/${s.repos?.[1] || "…"}</b> repos</span>`;
  if (s.estado === "nunca") return html`<span class="sincro">Sin sincronizar todavía</span>`;
  if (s.estado === "interrumpida") return html`<span class="sincro">La última sincronización no terminó</span>`;
  const titulo = `${s.llamadas ?? 0} llamadas a GitHub (${s.ahorradas ?? 0} sin coste de cuota) en ${s.segundos ?? "?"} s` +
    (cuota?.restante != null ? ` · quedan ${cuota.restante} llamadas de cuota` : "");
  if (s.estado === "error") return html`<span class="sincro"><span class="chip chip-mal">No se pudo sincronizar</span></span>`;
  if (s.estado === "pausada") return html`<span class="sincro" title=${titulo}><span class="chip chip-borde">En pausa hasta las ${hora(s.reanuda)}</span></span>`;
  return html`<span class="sincro" title=${titulo}>
    ${s.estado === "con errores" ? html`<span class="chip chip-mal">${plural(s.errores.length, "repo con error", "repos con error")}</span>` : ""}
    <span class="sincro-etq">Actualizado </span><b>${hace(s.fin)}</b>
  </span>`;
}

const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "");

const VISTAS = ["ramas", "actividad", "commits", "dps", "repos", "copilot", "pase", "ajustes"];

function Cabecera({ estado, vista, setVista, onSync, tema, cambiarTema, abrirPaleta }) {
  const vistas = [["ramas", "Ramas"], ["actividad", "Actividad"], ["commits", "Commits"], ["dps", "DPs"], ["repos", "Repos"],
    ["copilot", "Copilot"], ["pase", "Pase"], ["ajustes", "Ajustes"]];
  const ses = estado?.sesion || {};
  const enCurso = estado?.sincro?.enCurso;
  return html`<header class="cab">
    <div class="marca"><${Marca} /> Monitor de pases ${estado?.demo ? html`<small>Demo</small>` : html`<small>BBVA × NFQ</small>`}</div>
    <nav class="pestanas" aria-label="Secciones">
      ${vistas.map(([id, t]) => html`<button key=${id} aria-current=${vista === id ? "page" : undefined} onClick=${() => setVista(id)}>${t}</button>`)}
    </nav>
    <div class="cab-der">
      <button class="btn-ir" onClick=${abrirPaleta} title="Ir a un repositorio, rama, proyecto, DP o commit"><${Icono} n="buscar" /> <span>Ir a…</span> <kbd>Ctrl K</kbd></button>
      <span aria-live="polite"><${EstadoSincro} s=${estado?.sincro} cuota=${estado?.cuota} /></span>
      <button class="chip-sesion" onClick=${() => setVista("ajustes")} title="Sesiones de GitHub">
        <${Icono} n="usuario" /> <span>${ses.bbva?.usuario || "sin BBVA"}${ses.nfq?.estado === "iniciada" ? "" : " · sin NFQ"}</span></button>
      <button class="btn btn-s" onClick=${onSync} disabled=${!estado?.configurado || enCurso}><${Icono} n="actualizar" cls=${enCurso ? "gira" : ""} /> Actualizar</button>
      <${BotonTema} tema=${tema} cambiar=${cambiarTema} />
    </div>
  </header>`;
}

function Avisos({ estado, setVista }) {
  const s = estado?.sincro;
  if (!s) return null;
  if (s.estado === "pausada")
    return html`<div class="aviso aviso-cuota" role="status"><div>
      <b>Sincronización en pausa por la cuota de GitHub BBVA</b> (cada persona tiene un número de llamadas por hora).
      ${s.repos?.[1] ? html` Ya están al día <b class="num">${s.repos[0]} de ${s.repos[1]}</b> repositorios;` : ""} sigue sola a las <b>${hora(s.reanuda)}</b> desde donde se quedó.
      <div class="tenue">La primera carga es la que más gasta: después, lo que no ha cambiado no consume cuota. Mientras, los repositorios pendientes se ven con los datos que hubiera.</div></div></div>`;
  if (s.estado === "error" && s.error)
    return html`<div class="aviso" role="alert"><div><b>${s.error.mensaje}</b>${s.error.pista ? html` ${s.error.pista}` : ""}</div><button class="btn" onClick=${() => setVista("ajustes")}>Ir a Ajustes</button></div>`;
  if (s.estado === "con errores" && s.errores?.length)
    return html`<div class="aviso" role="status"><div>${s.errores.slice(0, 3).map((e) => html`<div><b>${corto(e.repo)}:</b> ${e.mensaje}${e.pista ? " " + e.pista : ""}</div>`)}
      ${s.errores.length > 3 ? html`<div>…y ${s.errores.length - 3} más.</div>` : ""}<div class="tenue">De esos repos se muestran los datos de la sincronización anterior.</div></div></div>`;
  return null;
}

/* ── Filtros de ramas ── */
// Cada rama como la entienden los filtros comunes (filtros.js).
export function itemsRamas(estado, f) {
  return estado.ramas.filter((r) => !r.esBase && (!f.ocultarMergeadas || !r.mergeada) && (!f.soloDP || r.dps.length) && (!f.conPR || r.pr))
    .map((r) => ({
      o: r, repo: r.repo, fecha: r.cabeza?.fecha,
      proyectos: r.release ? (r.features?.length ? r.features : [""]) : [r.feature || ""],
      personas: uniq([r.cabeza?.autor, ...(r.commits || []).map((c) => c.autor)].filter(Boolean)),
      texto: [r.repo, r.rama, r.release, r.cabeza?.mensaje, r.pr?.titulo, ...r.dps.map((d) => d.cod), ...(r.features || []), ...(r.commits || []).map((c) => c.autor)].join(" "),
    }));
}

function InterruptoresRamas({ f, setF }) {
  return html`<span class="interruptores">
    <label class="interruptor"><input type="checkbox" checked=${f.ocultarMergeadas} onChange=${(e) => setF({ ...f, ocultarMergeadas: e.target.checked })} /> Ocultar las ya mergeadas</label>
    <label class="interruptor"><input type="checkbox" checked=${f.soloDP} onChange=${(e) => setF({ ...f, soloDP: e.target.checked })} /> Con DP</label>
    <label class="interruptor"><input type="checkbox" checked=${f.conPR} onChange=${(e) => setF({ ...f, conPR: e.target.checked })} /> Con PR</label>
  </span>`;
}

/* ── Ramas ── */
function Bienvenida({ setVista, demo }) {
  return html`<div class="vacio">
    <h2>Conecta el monitor con GitHub BBVA</h2>
    <p>La app lee los repositorios desde esta VDI con tu token y no envía nada fuera salvo el .json del pase, y solo cuando tú lo subes.</p>
    <ol>
      <li>En <b>bbva.ghe.com</b> crea un token personal <b>de solo lectura</b> (Settings → Developer settings → Personal access tokens). Si la organización usa SSO, autorízalo.</li>
      <li>En <b>Ajustes</b> pégalo y escribe tu organización o la lista de repositorios.</li>
      <li>Pulsa <b>Probar conexión</b> y después <b>Actualizar</b>.</li>
    </ol>
    <button class="btn btn-pri" onClick=${() => setVista("ajustes")}>Ir a Ajustes</button>
    ${!demo && html`<p style="margin-top:16px">¿Quieres verla antes con datos inventados? Ciérrala y ábrela con <span class="mono">python monitor.py --demo</span>.</p>`}
  </div>`;
}

function FilaRama({ r, abierta, setAbierta, ir }) {
  const run = r.runs?.[0];
  const abrir = () => setAbierta(r.id);
  return html`<tr class="fila ${abierta === r.id ? "abierta" : ""} ${r.mergeada ? "merg" : ""}" onClick=${abrir}>
    <td class="c-repo">${corto(r.repo)}</td>
    <td class="c-rama"><button onClick=${(e) => { e.stopPropagation(); abrir(); }} aria-label=${`Ver ${r.rama} en ${corto(r.repo)}`}><${Rama} nombre=${r.rama} /></button>
      ${r.release && r.features?.length ? html`<div class="pr">${r.features.map((f) => html`<span class="chip chip-acento" key=${f} style=${{ background: colorDe(f) }}>${f}</span>`)}</div>` : ""}
      ${r.pr ? html`<div class="pr"><a class="chip chip-pr" href=${r.pr.url} target="_blank" rel="noopener noreferrer" onClick=${(e) => e.stopPropagation()} title=${r.pr.titulo}>PR #${r.pr.numero} ${ESTADO_PR[r.pr.estado] || r.pr.estado}${r.pr.borrador ? " · borrador" : ""}</a></div>` : ""}</td>
    <td class="c-commit">${r.cabeza ? html`<button class="lnk msg" title=${"Ver el commit: " + r.cabeza.mensaje} onClick=${(e) => { e.stopPropagation(); ir({ vista: "commit", repo: r.repo, sha: r.cabeza.sha }); }}>${r.cabeza.mensaje}</button><span class="meta">${r.cabeza.autor} · ${hace(r.cabeza.fecha)}</span>` : html`<span class="tenue">—</span>`}</td>
    <td class="c-prod">${r.mergeada ? html`<span class="chip chip-merg">Ya en ${r.base}</span>` : r.ahead == null ? html`<span class="tenue">—</span>` :
      html`<span class="adel num" title=${`${plural(r.ahead, "commit", "commits")} que no están en ${r.base}`}>${plural(r.ahead, "commit", "commits")}</span>${r.behind ? html`<br /><span class="detras num" title=${`${r.base} tiene ${r.behind} commits que esta rama no tiene`}>${r.behind} por detrás</span>` : ""}`}</td>
    <td class="c-ci"><div class="ci">
      ${run ? html`<${EstadoRun} run=${run} corto />` : ""}
      ${r.dps.length ? html`<${ChipDP} d=${r.dps[0]} repo=${r.repo} />` : run ? html`<span class="tenue">Sin DP</span>` : html`<span class="tenue">Sin ejecuciones</span>`}
      ${r.dps.length > 1 ? html`<span class="tenue" title=${r.dps.slice(1).map((d) => d.cod).join(", ")}>+${r.dps.length - 1}</span>` : ""}
    </div></td>
    <td class="c-n">${r.nComp}</td>
  </tr>`;
}

const POR_GRUPO = 8;
const MAX_GRUPOS = 25;
const AGRUPAR = [["proyecto", "Proyecto"], ["repo", "Repositorio"], ["persona", "Persona"]];

function agrupar(visibles, modo, estado) {
  const porFecha = (a, b) => (b.cabeza?.fecha || "").localeCompare(a.cabeza?.fecha || "");
  const ramas = visibles.map((x) => x.o);
  if (modo === "repo" || modo === "persona") {
    const m = new Map();
    for (const r of ramas) {
      const k = modo === "repo" ? r.repo : r.cabeza?.autor || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].map(([k, rs]) => ({ k: modo + ":" + k, modo, valor: k, ramas: rs.sort(porFecha) }))
      .sort((a, b) => (b.ramas[0].cabeza?.fecha || "").localeCompare(a.ramas[0].cabeza?.fecha || ""));
  }
  const grupos = estado.proyectos.map((p) => ({ k: "p:" + p.feature, modo, p, ramas: ramas.filter((r) => !r.release && (r.feature || "") === p.feature).sort(porFecha) }))
    .filter((g) => g.ramas.length);
  const releases = ramas.filter((r) => r.release).sort((a, b) => b.release.localeCompare(a.release, "es", { numeric: true }) || a.repo.localeCompare(b.repo));
  if (releases.length) grupos.unshift({ k: "releases", modo, releases: true, ramas: releases });
  return grupos;
}

function CabGrupo({ g, plegado, plegar, preparar, ir, setF, f }) {
  const repos = uniq(g.ramas.map((r) => r.repo)).length;
  let titulo, barra = "var(--line-2)", acciones = null;
  if (g.releases) {
    titulo = html`Releases <span class="tenue" style="font-weight:400">cada una es una subida</span>`;
    barra = "var(--electric)";
    acciones = html`<button class="btn btn-s" onClick=${() => ir({ vista: "dps" })}><${Icono} n="paquete" /> Ver los DPs</button>`;
  } else if (g.p) {
    titulo = g.p.feature ? html`<span class="mono">${g.p.feature}</span> ${g.p.nombre || html`<span class="tenue">Sin nombre</span>`}` : "Sin proyecto";
    barra = colorDe(g.p.feature);
    if (g.p.feature) acciones = html`<button class="btn btn-s" onClick=${() => preparar([g.p.feature])}>Preparar pase</button>`;
  } else if (g.modo === "repo") {
    titulo = html`<span class="mono">${corto(g.valor)}</span>`;
    acciones = html`<button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo: g.valor, sub: "codigo" })}><${Icono} n="repo" /> Código</button>
      ${!f.repos.includes(g.valor) && html`<button class="btn btn-s" onClick=${() => setF({ ...f, repos: [...f.repos, g.valor] })} title="Ver solo este repositorio"><${Icono} n="filtro" /> Solo este</button>`}`;
  } else {
    titulo = g.valor ? html`<${Icono} n="usuario" /> ${g.valor}` : "Sin autor";
  }
  const id = "g-" + g.k.replace(/[^a-z0-9]/gi, "-");
  return html`<div class="grupo-cab">
    <span class="barra" style=${{ background: barra }} />
    <button class="plegar-grupo" aria-expanded=${!plegado} aria-controls=${id + "-t"} onClick=${plegar} aria-label=${plegado ? "Desplegar" : "Plegar"}><${Icono} n=${plegado ? "plegado" : "desplegado"} /></button>
    <h2 id=${id}>${titulo}</h2>
    <span class="resumen">${plural(g.ramas.length, "rama", "ramas")}${g.modo !== "repo" ? ` · ${plural(repos, "repo", "repos")}` : ""}</span>
    ${acciones && html`<div class="acc">${acciones}</div>`}
  </div>`;
}

function TablaRamas({ ramas, abierta, setAbierta, ir, id }) {
  return html`<div style="overflow-x:auto" id=${id}><table class="tabla">
    <thead><tr><th scope="col">Repo</th><th scope="col">Rama y PR</th><th scope="col">Último commit</th><th scope="col" class="c-prod">Fuera de producción</th><th scope="col">Action y DP</th><th scope="col" class="c-n" title="Componentes">Comp.</th></tr></thead>
    <tbody>${ramas.map((r) => html`<${FilaRama} key=${r.id} r=${r} abierta=${abierta} setAbierta=${setAbierta} ir=${ir} />`)}</tbody>
  </table></div>`;
}

function VistaRamas({ estado, f, setF, setFacetas, abierta, setAbierta, preparar, setVista, ir }) {
  const [modo, setModo] = useState(() => leerLS("mp-agrupar", "proyecto"));
  const [plegados, setPlegados] = useState(() => new Set());
  const [abiertos, setAbiertos] = useState(() => new Set());  // grupos con todas sus ramas a la vista
  const [nGrupos, setNGrupos] = useState(MAX_GRUPOS);
  const items = useMemo(() => itemsRamas(estado, f), [estado, f.ocultarMergeadas, f.soloDP, f.conPR]);
  const facetas = useFacetas(setFacetas, items, f, estado);
  const props = useMemo(() => propsDeRepos(estado.repos), [estado]);
  const visibles = useMemo(() => items.filter((x) => pasa(x, f, props)), [items, f, props]);
  const grupos = useMemo(() => agrupar(visibles, modo, estado), [visibles, modo, estado]);
  useEffect(() => { setNGrupos(MAX_GRUPOS); }, [f, modo]);
  if (!estado.configurado && !estado.ramas.length) return html`<div class="contenido"><${Bienvenida} setVista=${setVista} demo=${estado.demo} /></div>`;
  const cambiarModo = (m) => { setModo(m); ponerLS("mp-agrupar", m); setPlegados(new Set()); setAbiertos(new Set()); };
  const alternarSet = (set, setSet, k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setSet(n); };
  const todosPlegados = grupos.length > 0 && grupos.every((g) => plegados.has(g.k));
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>Ramas</h1><p>${plural(visibles.length, "rama", "ramas")} de ${plural(uniq(visibles.map((x) => x.repo)).length, "repositorio", "repositorios")}</p></div>
    <${BarraFiltros} f=${f} setF=${setF} facetas=${facetas} usuario=${estado.sesion?.bbva?.usuario} total=${visibles.length} placeholder="Rama, repo, autor, DP, commit…">
      <${InterruptoresRamas} f=${f} setF=${setF} />
    </${BarraFiltros}>
    <div class="barra-grupos">
      <span class="etq-seg">Agrupar por</span>
      <div class="segmento" role="group" aria-label="Agrupar por">${AGRUPAR.map(([m, t]) => html`<button key=${m} aria-pressed=${modo === m} onClick=${() => cambiarModo(m)}>${t}</button>`)}</div>
      ${grupos.length > 1 && html`<button class="btn btn-t btn-s" onClick=${() => setPlegados(todosPlegados ? new Set() : new Set(grupos.map((g) => g.k)))}>${todosPlegados ? "Desplegar todo" : "Plegar todo"}</button>`}
      <span class="tenue">${plural(grupos.length, "grupo", "grupos")}</span>
    </div>
    ${!grupos.length && !visibles.length && !items.length ? html`<div class="vacio-mini">${estado.sincro?.estado === "nunca" ? "Todavía no se ha sincronizado. Pulsa Actualizar." : "Ninguna rama con estos filtros."}</div>` : ""}
    ${grupos.slice(0, nGrupos).map((g) => {
      const plegado = plegados.has(g.k), todas = abiertos.has(g.k);
      const id = "g-" + g.k.replace(/[^a-z0-9]/gi, "-") + "-t";
      return html`<section class="grupo ${plegado ? "plegado" : ""}" key=${g.k} aria-labelledby=${"g-" + g.k.replace(/[^a-z0-9]/gi, "-")}>
        <${CabGrupo} g=${g} plegado=${plegado} plegar=${() => alternarSet(plegados, setPlegados, g.k)} preparar=${preparar} ir=${ir} f=${f} setF=${setF} />
        ${!plegado && html`<${TablaRamas} id=${id} ramas=${todas ? g.ramas : g.ramas.slice(0, POR_GRUPO)} abierta=${abierta} setAbierta=${setAbierta} ir=${ir} />
          ${g.ramas.length > POR_GRUPO && html`<button class="ver-mas-grupo" onClick=${() => alternarSet(abiertos, setAbiertos, g.k)}>
            ${todas ? "Ver menos" : `Ver ${plural(g.ramas.length - POR_GRUPO, "rama más", "ramas más")}`}</button>`}`}
      </section>`;
    })}
    ${grupos.length > nGrupos && html`<button class="btn" onClick=${() => setNGrupos(nGrupos + MAX_GRUPOS)}>Ver ${Math.min(MAX_GRUPOS, grupos.length - nGrupos)} grupos más (quedan ${grupos.length - nGrupos})</button>`}
  </div>`;
}

/* ── Detalle de una rama ── */
function Detalle({ id, onCerrar, aviso, recargar, ir }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [nuevoDP, setNuevoDP] = useState("");
  const cerrarRef = useRef(null);
  useEffect(() => {
    setD(null); setErr(null);
    api("rama?id=" + encodeURIComponent(id)).then(setD, (e) => setErr(e.message));
  }, [id]);
  useEffect(() => {
    const previo = document.activeElement;
    cerrarRef.current?.focus();
    const tecla = (e) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("keydown", tecla); previo?.focus?.(); };
  }, []);
  const guardarDPs = async (lista) => {
    try {
      const r = await api("dps", { id, dps: lista });
      setD((x) => ({ ...x, manuales: r.dps, dps: [...r.dps.map((cod) => ({ cod, fuente: "manual" })), ...x.dps.filter((y) => y.fuente !== "manual" && !r.dps.includes(y.cod))] }));
      recargar();
    } catch (e) { aviso(e.message, "mal"); }
  };
  const copiar = (t) => navigator.clipboard?.writeText(t).then(() => aviso(`${t} copiado`), () => {});
  return html`<div class="velo" onMouseDown=${(e) => e.target === e.currentTarget && onCerrar()}>
    <aside class="panel" role="dialog" aria-modal="true" aria-labelledby="det-t">
      <div class="panel-cab">
        <div class="fila1">
          <h2 id="det-t">${d ? d.rama : "Cargando…"}</h2>
          <button ref=${cerrarRef} class="btn btn-t btn-s" onClick=${onCerrar} aria-label="Cerrar"><${Icono} n="cerrar" /></button>
        </div>
        ${d && html`<div class="repo">${d.repo}${d.feature ? html` · <span class="chip chip-acento" style=${{ background: colorDe(d.feature) }}>${d.feature}</span>` : ""}</div>`}
        ${d && html`<div class="enlaces">
          ${!d.esBase && d.baseSha && !d.mergeada && html`<button class="btn btn-s btn-pri" onClick=${() => ir({ vista: "diff", id })}>Ver las diferencias con ${d.base}</button>`}
          <button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo: d.repo, sub: "codigo", ref: d.rama })}><${Icono} n="repo" /> Código</button>
          <button class="btn btn-s" onClick=${() => ir({ vista: "copilot", contexto: { tipo: "rama", id }, modo: "consultar" })}><${Icono} n="chispa" /> Preguntar a Copilot</button>
          ${!d.esBase && html`<button class="btn btn-s" onClick=${() => ir({ vista: "copilot", contexto: { tipo: "rama", id }, modo: "modificar" })}><${Icono} n="chispa" /> Modificar con Copilot</button>`}
          <a class="btn btn-s" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> GitHub</a>
          ${d.pr && html`<a class="btn btn-s" href=${d.pr.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> PR #${d.pr.numero}</a>`}
        </div>`}
      </div>
      <div class="panel-cuerpo">
        ${err && html`<p class="nota" role="alert">${err}</p>`}
        ${d && html`
          ${d.error && html`<p class="nota" role="alert">No se pudo actualizar esta rama: ${d.error.mensaje}. Se muestran los datos anteriores.</p>`}
          <section class="seccion"><div class="datos">
            <div class="dato"><b>${d.esBase ? "—" : d.ahead ?? "—"}</b><span>${d.mergeada ? `todo está ya en ${d.base}` : `commits que no están en ${d.base || "producción"}`}</span></div>
            <div class="dato"><b>${d.behind ?? "—"}</b><span>commits de ${d.base || "producción"} que le faltan</span></div>
            <div class="dato"><b>${d.componentes.length}</b><span>${d.componentes.length === 1 ? "componente" : "componentes"} de ${plural(d.ficheros.length, "fichero", "ficheros")}${d.ignorados ? ` (${d.ignorados} ${d.ignorados === 1 ? "ignorado" : "ignorados"})` : ""}</span></div>
          </div>
          ${d.truncado && html`<p class="nota">GitHub solo devuelve los primeros 300 ficheros y 250 commits de una comparación: la lista puede estar incompleta. Mírala completa en GitHub.</p>`}
          </section>

          <section class="seccion" aria-labelledby="s-dps">
            <h3 id="s-dps">DPs</h3>
            ${d.dps.length ? html`<ul class="lista">${d.dps.map((x) => html`<li key=${x.cod}>
              <span class="l1"><${ChipDP} d=${x} repo=${d.repo} />
                <button class="btn btn-t btn-s" onClick=${() => copiar(x.cod)} aria-label=${"Copiar " + x.cod}><${Icono} n="copiar" /></button>
                ${x.fuente === "manual" && html`<button class="btn btn-t btn-s" onClick=${() => guardarDPs(d.manuales.filter((c) => c !== x.cod))}>Quitar</button>`}
              </span>
              <span class="l2">${FUENTE[x.fuente] || ""}${x.flujo ? ` «${x.flujo}»` : ""}${x.fecha ? ` · ${fLarga(x.fecha)}` : ""}${x.url ? html` · <a href=${x.url} target="_blank" rel="noopener noreferrer">ver ejecución</a>` : ""}</span>
            </li>`)}</ul>` : html`<p class="suave" style="margin:0">No se ha encontrado ningún DP en las Actions de esta rama.</p>`}
            <form class="anadir-dp" onSubmit=${(e) => { e.preventDefault(); const v = nuevoDP.trim(); if (v) { guardarDPs(uniq([...(d.manuales || []), v.toUpperCase()])); setNuevoDP(""); } }}>
              <label class="sr" for="dp-nuevo">DP a mano</label>
              <input id="dp-nuevo" class="inp mono" placeholder="DP-KYTL-…" value=${nuevoDP} onInput=${(e) => setNuevoDP(e.target.value)} />
              <button class="btn btn-s" type="submit" disabled=${!nuevoDP.trim()}>Añadir a mano</button>
            </form>
          </section>

          ${!d.esBase && html`<section class="seccion" aria-labelledby="s-comp">
            <h3 id="s-comp">Componentes <span class="chip">${d.componentes.length}</span></h3>
            ${d.componentes.length ? html`<div class="lista" style="display:grid;gap:8px">${d.componentes.map((c) => html`<details class="comp" key=${c.clave}>
              <summary><span class="nom">${c.nombre}</span>
                ${c.tipo ? html`<span class="chip">${c.tipo}</span>` : html`<span class="chip chip-borde" title="Ninguna regla de Ajustes encaja con estos ficheros">sin regla</span>`}
                ${c.subida && c.subida !== c.tipo ? html`<span class="chip">${c.subida}</span>` : ""}
                ${c.borrado ? html`<span class="chip chip-mal">se borra</span>` : ""}
                <span class="n">${plural(c.ficheros.length, "fichero", "ficheros")}</span></summary>
              <ul>${c.ficheros.map((f) => html`<li key=${f}><button class="lnk" onClick=${() => ir({ vista: "diff", id, foco: f })} title="Ver sus diferencias">${f}</button></li>`)}</ul>
            </details>`)}</div>` : html`<p class="suave" style="margin:0">${d.mergeada ? "La rama ya está en producción: no trae cambios." : "No hay ficheros cambiados (o todos los ignoran las reglas)."}</p>`}
          </section>`}

          <section class="seccion" aria-labelledby="s-com">
            <h3 id="s-com">${d.esBase ? "Commits recientes" : `Commits que no están en ${d.base}`} <span class="chip">${d.commits.length}</span></h3>
            <ul class="lista">${[...d.commits].reverse().slice(0, 60).map((c) => html`<li key=${c.sha}><div class="commit"><span class="linea"><i /></span><div>
              <div><button class="lnk" onClick=${() => ir({ vista: "commit", repo: d.repo, sha: c.sha })}>${c.mensaje}</button></div>
              <div class="l2">${c.autor} · ${fLarga(c.fecha)} · ${c.url ? html`<a class="mono" href=${c.url} target="_blank" rel="noopener noreferrer">${c.sha.slice(0, 7)}</a>` : html`<span class="mono">${c.sha.slice(0, 7)}</span>`}</div>
            </div></div></li>`)}</ul>
          </section>

          <section class="seccion" aria-labelledby="s-run">
            <h3 id="s-run">Ejecuciones de Actions <span class="chip">${d.runs.length}</span></h3>
            ${d.runs.length ? html`<ul class="lista">${d.runs.map((x) => html`<li key=${x.id}>
              <span class="l1"><${EstadoRun} run=${x} /> ${x.dps.map((c) => html`<span class="dp" key=${c}>${c}</span>`)}</span>
              <span class="l2">${x.titulo} · ${fLarga(x.fecha)}${x.url ? html` · <a href=${x.url} target="_blank" rel="noopener noreferrer">abrir</a>` : ""}${x.errorDP ? ` · no se pudo leer el DP: ${x.errorDP}` : ""}</span>
            </li>`)}</ul>` : html`<p class="suave" style="margin:0">Sin ejecuciones en el periodo.</p>`}
          </section>`}
      </div>
    </aside>
  </div>`;
}

/* ── Actividad ── */
const MAX_FILAS_ACT = 80;

function VistaActividad({ estado, f, setF, setFacetas, setAbierta, ir }) {
  const [globo, setGlobo] = useState(null);
  const [limite, setLimite] = useState(MAX_FILAS_ACT);
  const t1 = Date.now(), t0 = t1 - estado.dias * 864e5;
  const pos = (iso) => ((Date.parse(iso) - t0) / (t1 - t0)) * 100;
  const items = useMemo(() => itemsRamas(estado, f), [estado, f.ocultarMergeadas, f.soloDP, f.conPR]);
  const facetas = useFacetas(setFacetas, items, f, estado);
  const props = useMemo(() => propsDeRepos(estado.repos), [estado]);
  const visibles = useMemo(() => items.filter((x) => pasa(x, f, props)).map((x) => x.o).filter((r) => !r.release), [items, f, props]);
  let quedan = limite;
  const grupos = estado.proyectos.map((p) => ({ p, ramas: visibles.filter((r) => (r.feature || "") === p.feature).sort((a, b) => (b.cabeza?.fecha || "").localeCompare(a.cabeza?.fecha || "")) }))
    .filter((g) => g.ramas.length).map((g) => { const ramas = g.ramas.slice(0, Math.max(0, quedan)); quedan -= ramas.length; return { ...g, ramas }; }).filter((g) => g.ramas.length);
  const sinFiltroDeRama = !f.proyectos.length && !f.personas.length && !f.q.trim();
  const bases = sinFiltroDeRama ? estado.ramas.filter((r) => r.esBase && (!f.repos.length || f.repos.includes(r.repo)) && pasa({ repo: r.repo, proyectos: [""], personas: [], fecha: r.cabeza?.fecha, texto: "" }, f, props)).slice(0, 30) : [];
  const ticks = [];
  const d = new Date(t0); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  for (; d.getTime() < t1; d.setDate(d.getDate() + 7)) ticks.push(d.toISOString());
  const mostrar = (e, titulo, lineas) => {
    const b = e.currentTarget.getBoundingClientRect();
    setGlobo({ x: Math.min(b.left, innerWidth - 360), y: b.bottom + 8 > innerHeight - 90 ? b.top - 70 : b.bottom + 8, titulo, lineas });
  };
  const ocultar = () => setGlobo(null);
  const pista = (r, color) => html`<div class="act-pista">
    ${ticks.map((t) => html`<span class="tick" key=${t} style=${{ left: pos(t) + "%" }} />`)}
    ${r.commits.filter((c) => pos(c.fecha) >= 0).map((c) => html`<button class="marca-c" key=${c.sha} tabindex="-1" style=${{ left: pos(c.fecha) + "%", background: color }}
      aria-label=${`Commit ${c.mensaje}`} onMouseEnter=${(e) => mostrar(e, c.mensaje, [`${c.autor} · ${fLarga(c.fecha)}`, `${c.sha.slice(0, 7)} · pulsa para ver los cambios`])} onMouseLeave=${ocultar} onClick=${() => { ocultar(); ir({ vista: "commit", repo: r.repo, sha: c.sha }); }} />`)}
    ${r.runs.filter((x) => pos(x.fecha) >= 0).map((x) => html`<button class="marca-r ${x.conclusion === "success" ? "ok" : "mal"}" key=${"r" + x.id} tabindex="-1" style=${{ left: pos(x.fecha) + "%" }}
      aria-label=${`Ejecución ${x.nombre}`} onMouseEnter=${(e) => mostrar(e, `${x.nombre} · ${x.conclusion === "success" ? "correcta" : x.estado !== "completed" ? "en curso" : "fallida"}`, [fLarga(x.fecha), x.dps.length ? "DP: " + x.dps.join(", ") : "Sin DP"])}
      onMouseLeave=${ocultar} onClick=${() => setAbierta(r.id)} />`)}
    ${r.runs.filter((x) => x.dps.length && pos(x.fecha) >= 0).map((x) => html`<button class="marca-dp" key=${"d" + x.id} tabindex="-1" style=${{ left: pos(x.fecha) + "%" }}
      aria-label=${"DP " + x.dps.join(", ")} onMouseEnter=${(e) => mostrar(e, x.dps.join(", "), [`Generado ${fLarga(x.fecha)}`, x.nombre])} onMouseLeave=${ocultar} onClick=${() => setAbierta(r.id)} />`)}
  </div>`;
  const fila = (r, color) => html`<div class="act-fila" key=${r.id}>
    <div class="act-et"><button onClick=${() => setAbierta(r.id)} title=${r.rama}><b>${corto(r.repo)}</b><span>${r.rama}</span></button></div>
    ${pista(r, color)}
  </div>`;
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>Actividad</h1><p>${plural(visibles.length, "rama", "ramas")} · últimos ${estado.dias} días</p></div>
    <${BarraFiltros} f=${f} setF=${setF} facetas=${facetas} usuario=${estado.sesion?.bbva?.usuario} total=${visibles.length} placeholder="Rama, repo, autor, DP, commit…">
      <${InterruptoresRamas} f=${f} setF=${setF} />
    </${BarraFiltros}>
    <p class="leyenda">
      <span><i class="punto" style="background:var(--serene);box-shadow:0 0 0 1px rgb(7 14 70 / .35)"></i>Commit (color del proyecto)</span>
      <span><i style="width:8px;height:8px;border-radius:2px;background:#3a9a35"></i>Action correcta</span>
      <span><i style="width:8px;height:8px;border-radius:2px;background:#c96a10"></i>Action fallida</span>
      <span><i style="width:9px;height:9px;transform:rotate(45deg);background:var(--brand)"></i>DP generado</span>
    </p>
    <div class="act" onMouseLeave=${ocultar}>
      <div class="act-fila cab-eje"><div class="act-et"><span class="etq">Rama</span></div><div class="act-pista">
        ${ticks.map((t) => html`<span key=${t}><span class="tick" style=${{ left: pos(t) + "%" }} />${pos(t) < 93 ? html`<span class="tick-et" style=${{ left: pos(t) + "%" }}>${fCorta(t)}</span>` : ""}</span>`)}
        <span class="tick-et" style="right:8px;left:auto;transform:none;font-weight:700">Hoy</span>
      </div></div>
      ${grupos.map(({ p, ramas }) => html`<div key=${p.feature}>
        <div class="act-fila grupo-act"><div class="act-et"><span class="punto" style=${{ background: colorDe(p.feature), borderRadius: "3px" }} /><b class=${p.feature ? "mono" : ""}>${p.feature || "Sin proyecto"}</b><span style="font-family:inherit">${p.nombre}</span></div><div /></div>
        ${ramas.map((r) => fila(r, colorDe(p.feature)))}
      </div>`)}
      ${bases.length ? html`<div class="act-fila grupo-act"><div class="act-et"><b>Producción</b><span style="font-family:inherit">lo que entra en ${uniq(bases.map((r) => r.rama)).join(" / ")}</span></div><div /></div>${bases.map((r) => fila(r, "var(--gray-3)"))}` : ""}
      ${!grupos.length && !bases.length ? html`<div class="vacio-mini">Ninguna rama con estos filtros.</div>` : ""}
    </div>
    ${visibles.length > limite && html`<button class="btn" style="margin-top:12px" onClick=${() => setLimite(limite + MAX_FILAS_ACT)}>Ver ${Math.min(MAX_FILAS_ACT, visibles.length - limite)} ramas más (quedan ${visibles.length - limite})</button>`}
    ${globo && html`<div class="globo" style=${{ left: globo.x + "px", top: globo.y + "px" }} role="tooltip"><b>${globo.titulo}</b>${globo.lineas.map((l) => html`<div>${l}</div>`)}</div>`}
  </div>`;
}

/* ── Pase ── */
const VACIO_BORR = { features: [], nombres: {}, comps: {}, extra: {} };

function construirPase(fecha, prop, borr) {
  return {
    pase: fecha,
    proyectos: prop.map((p) => ({
      feature: p.feature,
      nombre: borr.nombres[p.feature] ?? p.nombre,
      componentes: [...p.componentes, ...(borr.extra[p.feature] || [])].map((c) => ({ ...c, ...(borr.comps[c.id] || {}) }))
        .filter((c) => c.incluir !== false && String(c.nom || "").trim()),
      dps: p.dps,
    })),
  };
}

function DialogoExportar({ pase, nfq, onCerrar, aviso, alGuardar }) {
  const [vista, setVista] = useState(null);
  const [err, setErr] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const ref = useRef(null);
  useEffect(() => { api("pase/vista", { pase }).then((r) => setVista(r.pase), (e) => setErr(e.message)); }, []);
  useEffect(() => {
    const previo = document.activeElement;
    ref.current?.focus();
    return () => previo?.focus?.();
  }, []);
  useEffect(() => {
    const t = (e) => { if (e.key === "Escape" && !ocupado) onCerrar(); };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [ocupado]);
  const guardar = async (subir) => {
    setOcupado(subir ? "subir" : "guardar"); setErr(null);
    try {
      const g = await api("pase/guardar", { pase });
      if (subir) {
        const s = await api("pase/subir", { fecha: pase.pase });
        aviso("Pase subido a GitHub NFQ.", "ok", s.fichero);
      } else aviso("Guardado en " + g.ruta);
      alGuardar();
      onCerrar();
    } catch (e) { setErr(e.message + (e.pista ? " " + e.pista : "")); setOcupado(""); }
  };
  const n = vista ? vista.proyectos.reduce((a, p) => a + p.componentes.length, 0) : 0;
  const destino = `${nfq.repo}/${nfq.carpeta ? nfq.carpeta + "/" : ""}pase-${pase.pase}.json`;
  return html`<div class="dialogo-velo" onMouseDown=${(e) => e.target === e.currentTarget && !ocupado && onCerrar()}>
    <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="exp-t">
      <div class="dialogo-cab"><h2 id="exp-t" tabindex="-1" ref=${ref}>Esto es lo que sale de la VDI</h2>
        <button class="btn btn-t btn-s" onClick=${onCerrar} disabled=${!!ocupado} aria-label="Cerrar"><${Icono} n="cerrar" /></button></div>
      <div class="dialogo-cuerpo">
        <p>El fichero solo lleva estos campos: proyectos, componentes (nombre, tipo, subida, DP, responsable, repo, rama y commit) y DPs. Ni código, ni rutas de ficheros, ni mensajes de commit.</p>
        ${vista ? html`<p><b>${plural(vista.proyectos.length, "proyecto", "proyectos")}</b>, <b>${plural(n, "componente", "componentes")}</b>.
          ${nfq.listo ? html` Se sube a <span class="mono">${destino}</span> (rama ${nfq.rama}).` : " Para subirlo, configura el repositorio de NFQ en Ajustes."}</p>
          <pre class="json" tabindex="0" aria-label="Contenido del fichero">${JSON.stringify(vista, null, 1)}</pre>` : !err ? html`<p>Preparando…</p>` : ""}
        ${err && html`<p class="nota" role="alert">${err}</p>`}
      </div>
      <div class="dialogo-pie">
        <button class="btn" onClick=${() => guardar(false)} disabled=${!vista || !!ocupado}><${Icono} n="guardar" /> ${ocupado === "guardar" ? "Guardando…" : "Guardar en la VDI"}</button>
        <button class="btn btn-pri" onClick=${() => guardar(true)} disabled=${!vista || !!ocupado || !nfq.listo}><${Icono} n="subir" /> ${ocupado === "subir" ? "Subiendo…" : "Guardar y subir a GitHub NFQ"}</button>
      </div>
    </div>
  </div>`;
}

function VistaPase({ estado, aviso, preseleccion, limpiarPreseleccion }) {
  const [fecha, setFechaRaw] = useState(() => leerLS("mp-fecha-pase", "") || proximoSabado());
  const [borr, setBorr] = useState(null);
  const [prop, setProp] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [exportar, setExportar] = useState(false);
  const [pases, setPases] = useState(null);
  const setFecha = (f) => { setFechaRaw(f); ponerLS("mp-fecha-pase", f); };
  const cargarPases = () => api("pases").then(setPases, () => {});
  useEffect(() => { cargarPases(); }, []);
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    setBorr(null);
    api("borrador?fecha=" + fecha).then((r) => setBorr({ ...VACIO_BORR, ...(r.borrador || {}) }), () => setBorr(clonar(VACIO_BORR)));
  }, [fecha]);
  useEffect(() => {
    if (preseleccion && borr) { setBorr((b) => ({ ...b, features: uniq([...b.features, ...preseleccion]) })); limpiarPreseleccion(); }
  }, [preseleccion, !!borr]);
  const clave = borr ? borr.features.join("|") : null;
  useEffect(() => {
    if (!borr) return;
    if (!borr.features.length) { setProp([]); return; }
    setCargando(true);
    api("propuesta", { features: borr.features }).then((r) => setProp(r.proyectos), (e) => aviso(e.message, "mal")).finally(() => setCargando(false));
  }, [clave, estado.sincro?.fin]);
  const primera = useRef(true);
  useEffect(() => {
    if (!borr) return;
    if (primera.current) { primera.current = false; return; }
    const t = setTimeout(() => api("borrador", { fecha, datos: borr }).catch(() => {}), 500);
    return () => clearTimeout(t);
  }, [borr]);

  if (!borr) return html`<div class="contenido"><p class="suave">Cargando…</p></div>`;
  const cambiarComp = (id, cambio) => setBorr((b) => ({ ...b, comps: { ...b.comps, [id]: { ...(b.comps[id] || {}), ...cambio } } }));
  const cambiarExtra = (f, id, cambio) => setBorr((b) => ({ ...b, extra: { ...b.extra, [f]: (b.extra[f] || []).map((c) => (c.id === id ? { ...c, ...cambio } : c)) } }));
  const quitarExtra = (f, id) => setBorr((b) => ({ ...b, extra: { ...b.extra, [f]: (b.extra[f] || []).filter((c) => c.id !== id) } }));
  const anadirExtra = (f) => setBorr((b) => ({ ...b, extra: { ...b.extra, [f]: [...(b.extra[f] || []), { id: "m-" + Date.now(), nom: "", tipo: "", subida: "", cod: "", resp: "", us: "", com: "", repo: "", rama: "", commit: "", manual: true }] } }));
  const toggleFeature = (f, on) => setBorr((b) => ({ ...b, features: on ? uniq([...b.features, f]) : b.features.filter((x) => x !== f) }));
  const pase = construirPase(fecha, prop, borr);
  const nComp = pase.proyectos.reduce((a, p) => a + p.componentes.length, 0);
  const proyectos = estado.proyectos.filter((p) => p.feature);

  const filaComp = (p, c, manual) => {
    const v = manual ? c : { ...c, ...(borr.comps[c.id] || {}) };
    const set = (k) => (e) => (manual ? cambiarExtra(p.feature, c.id, { [k]: e.target.value }) : cambiarComp(c.id, { [k]: e.target.value }));
    const fuera = v.incluir === false;
    return html`<tr key=${c.id} class=${fuera ? "fuera" : ""}>
      <td>${manual ? html`<button class="btn btn-t btn-s" onClick=${() => quitarExtra(p.feature, c.id)} aria-label="Quitar componente"><${Icono} n="papelera" /></button>` :
        html`<input type="checkbox" checked=${!fuera} onChange=${(e) => cambiarComp(c.id, { incluir: e.target.checked })} aria-label=${"Incluir " + v.nom} />`}</td>
      <td><input class="inp" value=${v.nom} onInput=${set("nom")} aria-label="Componente" placeholder="Nombre" style="min-width:210px" title=${v.nom} /></td>
      <td><input class="inp" value=${v.tipo} onInput=${set("tipo")} list="dl-tipos" aria-label="Tipo" style="width:120px" /></td>
      <td><input class="inp" value=${v.subida} onInput=${set("subida")} list="dl-subidas" aria-label="Tipo de subida" style="width:140px" /></td>
      <td><input class="inp mono" value=${v.cod} onInput=${set("cod")} list=${"dl-dp-" + p.feature} aria-label="DP" placeholder="DP-KYTL-…" style="width:150px" /></td>
      <td><input class="inp" value=${v.resp} onInput=${set("resp")} aria-label="Responsable" style="width:120px" /></td>
      <td class="origen">${manual ? html`<span class="tenue">A mano</span>` : html`<b>${corto(c.repo)}</b><br /><span class="mono" title=${(c.ficheros || []).join("\n")}><${Rama} nombre=${c.rama} /></span>${c.com ? html`<br /><span class="chip chip-mal">${c.com}</span>` : ""}`}</td>
    </tr>`;
  };

  return html`<div class="contenido">
    <div class="titulo-vista"><h1>Pase</h1><p>Elige los proyectos; el monitor propone los componentes de sus ramas que aún no están en producción, con el DP de cada rama.</p></div>
    <datalist id="dl-tipos">${uniq([...(estado.tipos || []), ...prop.flatMap((p) => p.componentes.map((c) => c.tipo))]).filter(Boolean).map((t) => html`<option value=${t} />`)}</datalist>
    <datalist id="dl-subidas">${uniq([...(estado.subidas || []), ...prop.flatMap((p) => p.componentes.map((c) => c.subida))]).filter(Boolean).map((t) => html`<option value=${t} />`)}</datalist>
    <div class="pase">
      <div style="display:grid;gap:16px">
        <div class="caja">
          <label class="campo"><span>Fecha del pase</span><input class="inp" type="date" value=${fecha} onChange=${(e) => e.target.value && setFecha(e.target.value)} /></label>
          <div class="etq" style="margin-top:14px">Proyectos</div>
          ${proyectos.length ? html`<ul class="sel-proy">${proyectos.map((p) => html`<li key=${p.feature}><label>
            <input type="checkbox" checked=${borr.features.includes(p.feature)} onChange=${(e) => toggleFeature(p.feature, e.target.checked)} />
            <span class="punto" style=${{ background: colorDe(p.feature), borderRadius: "3px", width: "12px", height: "12px" }} />
            <span class="t"><b class="mono">${p.feature}</b><span>${p.nombre || "Sin nombre"} · ${plural(p.abiertas, "rama abierta", "ramas abiertas")}</span></span>
          </label></li>`)}</ul>` : html`<p class="suave">Aún no hay proyectos: sincroniza primero.</p>`}
        </div>
        <div class="caja">
          <h2>Pases guardados</h2>
          ${pases?.pases?.length ? html`<ul class="historial">${pases.pases.slice(0, 8).map((x) => html`<li key=${x.fichero}>
            <span><button class="btn btn-t btn-s" style="padding:0;height:auto;font-weight:700" onClick=${() => setFecha(x.pase)}>Pase del ${fCorta(x.pase + "T12:00:00")}</button> · ${plural(x.componentes, "componente", "componentes")}</span>
            <span class="l2">${x.subido ? html`Subido ${hace(x.subido.fecha)} · <a href=${x.subido.fichero} target="_blank" rel="noopener noreferrer">ver en GitHub</a>` : "Solo en la VDI"}</span>
          </li>`)}</ul>` : html`<p class="suave" style="margin:0">Ninguno todavía.</p>`}
          <button class="btn btn-s" style="margin-top:12px" onClick=${() => api("abrir-carpeta", {}).then((r) => aviso("Carpeta: " + r.ruta), (e) => aviso(e.message, "mal"))}><${Icono} n="carpeta" /> Abrir la carpeta</button>
        </div>
      </div>

      <div>
        ${!borr.features.length ? html`<div class="caja vacio-mini">Marca a la izquierda los proyectos que entran en el pase.</div>` : ""}
        ${cargando && !prop.length ? html`<p class="suave">Preparando la propuesta…</p>` : ""}
        ${prop.map((p) => html`<section class="caja proy-pase" key=${p.feature}>
          <div class="grupo-cab">
            <span class="barra" style=${{ background: colorDe(p.feature) }} />
            <span class="mono" style="font-weight:700">${p.feature}</span>
            <label class="sr" for=${"np-" + p.feature}>Nombre del proyecto en el pase</label>
            <input id=${"np-" + p.feature} class="inp nombre-proy" value=${borr.nombres[p.feature] ?? p.nombre} placeholder="Nombre del proyecto"
              onInput=${(e) => setBorr((b) => ({ ...b, nombres: { ...b.nombres, [p.feature]: e.target.value } }))} />
            <span class="resumen">${plural(p.componentes.length, "componente propuesto", "componentes propuestos")}</span>
            <div class="acc"><button class="btn btn-s" onClick=${() => anadirExtra(p.feature)}><${Icono} n="mas" /> Componente a mano</button></div>
          </div>
          <datalist id=${"dl-dp-" + p.feature}>${uniq(p.dps.map((d) => d.cod)).map((c) => html`<option value=${c} />`)}</datalist>
          ${p.componentes.length || (borr.extra[p.feature] || []).length ? html`<div style="overflow-x:auto"><table class="tabla tabla-pase">
            <thead><tr><th scope="col"><span class="sr">Incluir</span></th><th scope="col">Componente</th><th scope="col">Tipo</th><th scope="col">Subida</th><th scope="col">DP</th><th scope="col">Responsable</th><th scope="col">Origen</th></tr></thead>
            <tbody>${p.componentes.map((c) => filaComp(p, c, false))}${(borr.extra[p.feature] || []).map((c) => filaComp(p, c, true))}</tbody>
          </table></div>` : html`<div class="vacio-mini">Ninguna rama de este proyecto trae cambios pendientes de producción.</div>`}
          ${p.mergeadas.length ? html`<div class="mergeadas">Ya en producción (no entran): ${p.mergeadas.map((m) => `${corto(m.repo)} · ${m.rama}`).join(", ")}</div>` : ""}
        </section>`)}
        ${borr.features.length ? html`<div class="pie-pase">
          <span class="cuenta">${plural(nComp, "componente", "componentes")} en ${plural(pase.proyectos.length, "proyecto", "proyectos")}</span>
          <span class="suave">Los cambios se guardan solos como borrador.</span>
          <div class="acc"><button class="btn btn-pri" disabled=${!nComp} onClick=${() => setExportar(true)}>Revisar y exportar…</button></div>
        </div>` : ""}
      </div>
    </div>
    ${exportar && html`<${DialogoExportar} pase=${pase} nfq=${estado.nfq} onCerrar=${() => setExportar(false)} aviso=${aviso} alGuardar=${cargarPases} />`}
  </div>`;
}

/* ── Ajustes ── */
const lineas = (v) => String(v || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/* Lista editable (una por línea o separadas por comas): guarda el texto tal
   cual mientras se escribe y entrega la lista limpia. */
function CampoLista({ valor, onCambio, multilinea, ...resto }) {
  const sep = multilinea ? "\n" : ", ";
  const [raw, setRaw] = useState((valor || []).join(sep));
  const cambio = (e) => { setRaw(e.target.value); onCambio(lineas(e.target.value)); };
  return multilinea
    ? html`<textarea class="inp" rows="2" value=${raw} onInput=${cambio} ...${resto} />`
    : html`<input class="inp mono" value=${raw} onInput=${cambio} ...${resto} />`;
}

function Resultado({ r }) {
  if (!r) return null;
  if (r.cargando) return html`<div class="resultado" role="status">Probando…</div>`;
  return html`<div class="resultado ${r.ok ? "ok" : "mal"}" role="status">${r.texto}${r.pista ? html`<small>${r.pista}</small>` : ""}${r.extra ? html`<small>${r.extra}</small>` : ""}</div>`;
}

function VistaAjustes({ estado, aviso, recargar }) {
  const [cfg, setCfg] = useState(null);
  const [orig, setOrig] = useState("");
  const [res, setRes] = useState({});
  const [muestras, setMuestras] = useState(null);
  const [soloSin, setSoloSin] = useState(false);
  const [version, setVersion] = useState(0); // al descartar, los campos de lista vuelven a leer su valor
  useEffect(() => { api("config").then((c) => { setCfg(c); setOrig(JSON.stringify(c)); }, (e) => aviso(e.message, "mal")); }, []);
  if (!cfg) return html`<div class="contenido"><p class="suave">Cargando…</p></div>`;
  const sucio = JSON.stringify(cfg) !== orig;
  const set = (ruta, valor) => setCfg((c) => { const n = clonar(c); let o = n; ruta.slice(0, -1).forEach((k) => { o = o[k]; }); o[ruta[ruta.length - 1]] = valor; return n; });
  const guardar = async () => {
    try {
      const nuevo = await api("config", { cambios: cfg });
      setCfg(nuevo); setOrig(JSON.stringify(nuevo));
      aviso("Ajustes guardados."); recargar();
      return true;
    } catch (e) { aviso(e.message, "mal"); return false; }
  };
  const probar = async (destino) => {
    if (sucio && !(await guardar())) return;
    setRes((r) => ({ ...r, [destino]: { cargando: true } }));
    try {
      const r = await api("probar", { destino });
      const g = r.git || {};
      const extra = destino === "bbva" ? [r.alcances ? "Permisos del token: " + r.alcances : "", g.proxy ? "git usa el proxy " + g.proxy : "", g.ca ? "git usa el certificado " + g.ca : ""].filter(Boolean).join(" · ") : "";
      setRes((x) => ({ ...x, [destino]: { ok: !r.publico, texto: r.texto, extra } }));
    } catch (e) { setRes((x) => ({ ...x, [destino]: { ok: false, texto: e.message, pista: e.pista } })); }
  };
  const probarReglas = async () => {
    try { setMuestras((await api("reglas/probar", { reglas: cfg.reglas })).muestras); } catch (e) { aviso(e.message, "mal"); }
  };
  const restablecerReglas = async () => {
    try {
      const nuevo = await api("config/restablecer", { clave: "reglas" });
      setCfg(nuevo); setOrig(JSON.stringify(nuevo)); setVersion((v) => v + 1);
      aviso("Vuelves a usar las reglas del equipo."); recargar();
    } catch (e) { aviso(e.message, "mal"); }
  };
  const copiarEquipo = async () => {
    try {
      const r = await api("config/equipo");
      const t = JSON.stringify(r.equipo, null, 1);
      await navigator.clipboard.writeText(t);
      aviso("Copiado. Pásalo para guardarlo en monitor-pases/config-equipo.json del repositorio.");
    } catch (e) { aviso("No se pudo copiar: " + e.message, "mal"); }
  };
  const sesion = async (accion, quien) => {
    try { await api("sesion/" + accion, { quien }); setTimeout(recargar, 300); setTimeout(recargar, 2500); } catch (e) { aviso(e.message, "mal"); }
  };
  const b = cfg.bbva, n = cfg.nfq, cp = cfg.copilot || {};
  const regla = (i, k, v) => set(["reglas", i, k], v);
  const mover = (i, d) => setCfg((c) => { const x = clonar(c); const [r] = x.reglas.splice(i, 1); x.reglas.splice(i + d, 0, r); return x; });
  const features = uniq([...estado.proyectos.map((p) => p.feature).filter(Boolean), ...Object.keys(cfg.proyectos || {})]).sort();
  const tokenPh = (s) => (s.tokenConfigurado ? `Guardado (…${s.tokenFinal}). Escribe otro para cambiarlo` : "Pega aquí el token");
  const conRegla = (muestras || []).filter((m) => !soloSin || (m.res && m.res.regla == null));

  return html`<div class="contenido"><div class="ajustes" key=${version}>
    <div class="titulo-vista"><h1>Ajustes</h1><p>Se guardan en <span class="mono">${estado.carpeta}</span>, fuera del repositorio.</p></div>

    <section class="caja" aria-labelledby="aj-ses">
      <h2 id="aj-ses">Sesiones</h2>
      <p>Se piden a Git (Git Credential Manager): la misma sesión con la que haces git pull. Si tienes varias cuentas en un mismo GitHub, indica el usuario.</p>
      <${FilaSesion} quien="bbva" s=${estado.sesion?.bbva} host=${b.host} onIniciar=${() => sesion("iniciar", "bbva")} onCerrar=${() => sesion("cerrar", "bbva")} />
      <${FilaSesion} quien="nfq" s=${estado.sesion?.nfq} host=${n.host || "github.com"} onIniciar=${() => sesion("iniciar", "nfq")} onCerrar=${() => sesion("cerrar", "nfq")} />
      <div class="rejilla" style="margin-top:12px">
        <label class="campo"><span>Usuario de GitHub BBVA (opcional)</span><input class="inp mono" value=${b.usuario || ""} onInput=${(e) => set(["bbva", "usuario"], e.target.value)} /></label>
        <label class="campo"><span>Usuario de GitHub NFQ (opcional)</span><input class="inp mono" value=${n.usuario || ""} onInput=${(e) => set(["nfq", "usuario"], e.target.value)} /></label>
      </div>
    </section>

    <section class="caja" aria-labelledby="aj-bbva">
      <h2 id="aj-bbva">Conexión con GitHub BBVA</h2>
      <p>Token personal de solo lectura (contenido, metadatos, pull requests, Actions y checks). No sale de esta VDI.</p>
      <div class="rejilla">
        <label class="campo"><span>Servidor</span><input class="inp mono" value=${b.host} onInput=${(e) => set(["bbva", "host"], e.target.value)} placeholder="bbva.ghe.com" /></label>
        <label class="campo"><span>Token (solo si no puedes iniciar sesión con Git)</span><input class="inp mono" type="password" autocomplete="off" value=${b.token} onInput=${(e) => set(["bbva", "token"], e.target.value)} placeholder=${tokenPh(b)} />
          ${b.tokenConfigurado && (b.borrarToken ? html`<small>Se quitará al guardar.</small>` : html`<small><button class="btn btn-t btn-s" style="padding:0;height:auto" onClick=${() => set(["bbva", "borrarToken"], true)}>Quitar el token guardado</button></small>`)}</label>
        <label class="campo"><span>Organizaciones o usuarios</span><${CampoLista} multilinea valor=${b.organizaciones} onCambio=${(v) => set(["bbva", "organizaciones"], v)} /><small>Uno por línea. Se leen sus repositorios (los que cumplan el filtro de al lado).</small></label>
        <label class="campo"><span>Filtro de repositorios</span><input class="inp mono" value=${b.filtroRepos} onInput=${(e) => set(["bbva", "filtroRepos"], e.target.value)} placeholder="props.uuaa:KYTL0000" />
          <small>Lo mismo que escribes en el buscador de repositorios de la organización en GitHub. Vacío = todos.</small></label>
        <label class="campo"><span>Repositorios sueltos</span><${CampoLista} multilinea valor=${b.repos} onCambio=${(v) => set(["bbva", "repos"], v)} /><small>organización/repositorio, uno por línea.</small></label>
        <label class="campo ancho"><span>Repositorios que no se miran</span><${CampoLista} valor=${b.excluirRepos} onCambio=${(v) => set(["bbva", "excluirRepos"], v)} placeholder="*-archivo, pruebas-*" /><small>Admite comodines (*), separados por comas.</small></label>
      </div>
      <details style="margin-top:12px"><summary class="etq" style="cursor:pointer">Proxy, certificados y transporte (si la conexión falla)</summary>
        <div class="rejilla" style="margin-top:12px">
          <label class="campo"><span>Proxy</span><input class="inp mono" value=${b.proxy} onInput=${(e) => set(["bbva", "proxy"], e.target.value)} placeholder="http://proxy:8080 (vacío = el del sistema)" /></label>
          <label class="campo"><span>Certificado raíz (.pem/.crt)</span><input class="inp mono" value=${b.ca} onInput=${(e) => set(["bbva", "ca"], e.target.value)} placeholder="vacío = los del sistema" /></label>
          <label class="campo"><span>Transporte</span><select class="inp" value=${b.transporte} onChange=${(e) => set(["bbva", "transporte"], e.target.value)}>
            <option value="python">Python (por defecto)</option><option value="curl">curl (proxy con usuario de Windows)</option></select></label>
          <label class="campo"><span>URL de la API</span><input class="inp mono" value=${b.api} onInput=${(e) => set(["bbva", "api"], e.target.value)} placeholder="vacío = se deduce del servidor" /></label>
        </div>
      </details>
      <div class="prueba"><button class="btn" onClick=${() => probar("bbva")}>Probar conexión</button><${Resultado} r=${res.bbva} /></div>
    </section>

    <section class="caja" aria-labelledby="aj-ramas">
      <h2 id="aj-ramas">Ramas, producción y DPs</h2>
      <div class="rejilla">
        <label class="campo"><span>Código de proyecto en la rama (expresión regular)</span><input class="inp mono" value=${b.patronRama} onInput=${(e) => set(["bbva", "patronRama"], e.target.value)} /><small>feature/CIBRDR-1234-algo → CIBRDR-1234</small></label>
        <label class="campo"><span>Rama de producción</span><input class="inp mono" value=${b.baseProduccion} onInput=${(e) => set(["bbva", "baseProduccion"], e.target.value)} /><small>Si un repo no la tiene: main y luego su rama por defecto.</small></label>
        <label class="campo"><span>Ramas de release (expresión regular)</span><input class="inp mono" value=${b.patronRelease} onInput=${(e) => set(["bbva", "patronRelease"], e.target.value)} /><small>release/2.108.0 → versión 2.108.0. Cada release es una subida.</small></label>
        <label class="campo"><span>Código de DP (expresión regular)</span><input class="inp mono" value=${b.patronDP} onInput=${(e) => set(["bbva", "patronDP"], e.target.value)} /></label>
        <label class="campo"><span>Workflows que generan DPs</span><${CampoLista} valor=${b.workflowsDP} onCambio=${(v) => set(["bbva", "workflowsDP"], v)} placeholder="Vacío = todos" /><small>Parte del nombre o del fichero .yml, separados por comas.</small></label>
        <label class="campo"><span>Refrescar cada (minutos)</span><input class="inp" type="number" min="2" value=${b.refrescoMin} onInput=${(e) => set(["bbva", "refrescoMin"], Number(e.target.value) || 10)} /></label>
        <label class="campo"><span>Días de actividad</span><input class="inp" type="number" min="7" max="180" value=${b.diasActividad} onInput=${(e) => set(["bbva", "diasActividad"], Number(e.target.value) || 45)} /></label>
        <label class="campo"><span>Releases que se siguen por repositorio</span><input class="inp" type="number" min="1" max="20" value=${b.releasesPorRepo ?? 3} onInput=${(e) => set(["bbva", "releasesPorRepo"], Number(e.target.value) || 3)} />
          <small>Las más recientes. Las anteriores ya están en producción y leerlas gasta cuota de GitHub.</small></label>
        <label class="interruptor"><input type="checkbox" checked=${b.soloRamasDeProyecto} onChange=${(e) => set(["bbva", "soloRamasDeProyecto"], e.target.checked)} /> Solo ramas con código de proyecto</label>
        <label class="interruptor"><input type="checkbox" checked=${b.leerLogs} onChange=${(e) => set(["bbva", "leerLogs"], e.target.checked)} /> Buscar el DP en los logs si no está en el resumen</label>
      </div>
    </section>

    <section class="caja" aria-labelledby="aj-proy">
      <h2 id="aj-proy">Nombres de los proyectos</h2>
      <p>Como aparecen en la hoja de pases. Los códigos salen de las ramas.</p>
      ${features.length ? html`<table class="tabla-mini"><tbody>${features.map((f) => html`<tr key=${f}><td class="mono" style="width:160px"><span class="punto" style=${{ background: colorDe(f), borderRadius: "3px", marginRight: "8px" }} />${f}</td>
        <td><input class="inp" aria-label=${"Nombre de " + f} value=${(cfg.proyectos || {})[f] || ""} onInput=${(e) => set(["proyectos", f], e.target.value)} /></td></tr>`)}</tbody></table>` : html`<p class="suave" style="margin:0">Aparecerán al sincronizar.</p>`}
    </section>

    <section class="caja" aria-labelledby="aj-reglas">
      <h2 id="aj-reglas">De ficheros a componentes</h2>
      <p>Se prueban en orden y manda la primera que encaja con la ruta del fichero. <span class="mono">(?P&lt;nombre&gt;…)</span> marca el nombre del componente; si no está, se usa el nombre del fichero.</p>
      <div style="overflow-x:auto"><table class="tabla-mini reglas">
        <thead><tr><th>Ruta (expresión regular)</th><th>Tipo</th><th>Subida</th><th>Ignorar</th><th><span class="sr">Orden</span></th></tr></thead>
        <tbody>${(cfg.reglas || []).map((r, i) => html`<tr key=${i}>
          <td style="min-width:260px"><input class="inp mono" value=${r.patron} onInput=${(e) => regla(i, "patron", e.target.value)} aria-label="Ruta" /></td>
          <td><input class="inp" value=${r.tipo || ""} disabled=${r.ignorar} onInput=${(e) => regla(i, "tipo", e.target.value)} aria-label="Tipo" /></td>
          <td><input class="inp" value=${r.subida || ""} disabled=${r.ignorar} onInput=${(e) => regla(i, "subida", e.target.value)} aria-label="Subida" /></td>
          <td><input type="checkbox" checked=${!!r.ignorar} onChange=${(e) => regla(i, "ignorar", e.target.checked)} aria-label="Ignorar estos ficheros" /></td>
          <td class="mover">
            <button class="btn btn-t btn-s" disabled=${i === 0} onClick=${() => mover(i, -1)} aria-label="Subir"><${Icono} n="arriba" /></button>
            <button class="btn btn-t btn-s" disabled=${i === cfg.reglas.length - 1} onClick=${() => mover(i, 1)} aria-label="Bajar"><${Icono} n="abajo" /></button>
            <button class="btn btn-t btn-s" onClick=${() => setCfg((c) => ({ ...c, reglas: c.reglas.filter((_, k) => k !== i) }))} aria-label="Borrar regla"><${Icono} n="papelera" /></button>
          </td></tr>`)}</tbody>
      </table></div>
      <div class="prueba">
        <button class="btn btn-s" onClick=${() => setCfg((c) => ({ ...c, reglas: [...c.reglas, { patron: "", tipo: "", subida: "" }] }))}><${Icono} n="mas" /> Añadir regla</button>
        <button class="btn btn-s" onClick=${probarReglas}>Probar con ficheros reales</button>
        ${cfg.reglasPropias && html`<button class="btn btn-s" onClick=${restablecerReglas}>Volver a las reglas del equipo</button>`}
        ${muestras && html`<label class="interruptor"><input type="checkbox" checked=${soloSin} onChange=${(e) => setSoloSin(e.target.checked)} /> Solo los que no encajan</label>`}
      </div>
      ${muestras && html`<div style="max-height:320px;overflow:auto;margin-top:10px"><table class="tabla-mini"><thead><tr><th>Fichero</th><th>Resultado</th></tr></thead><tbody>
        ${conRegla.slice(0, 300).map((m, i) => html`<tr key=${i}><td class="mono">${m.ruta} <span class="tenue">${corto(m.repo)}</span></td>
          <td>${m.res == null ? html`<span class="tenue">ignorado</span>` : html`<b>${m.res.nombre}</b> ${m.res.tipo ? html`<span class="chip">${m.res.tipo}</span>` : html`<span class="chip chip-borde">sin regla</span>`} ${m.res.subida ? html`<span class="chip">${m.res.subida}</span>` : ""}`}</td></tr>`)}
        ${!conRegla.length ? html`<tr><td colspan="2" class="tenue">${muestras.length ? "Todos encajan con alguna regla." : "Aún no hay ficheros: sincroniza primero."}</td></tr>` : ""}
      </tbody></table></div>`}
      ${estado.repos.length ? html`<details style="margin-top:14px"><summary class="etq" style="cursor:pointer">Subida por defecto de cada repositorio (si ninguna regla la pone)</summary>
        <table class="tabla-mini" style="margin-top:8px"><tbody>${estado.repos.map((r) => html`<tr key=${r.nombre}><td style="width:45%">${r.nombre}</td>
          <td><input class="inp" list="dl-sub-aj" aria-label=${"Subida de " + r.nombre} value=${(cfg.reposSubida || {})[r.nombre] || ""} onInput=${(e) => set(["reposSubida", r.nombre], e.target.value)} /></td></tr>`)}</tbody></table>
        <datalist id="dl-sub-aj">${(estado.subidas || []).map((s) => html`<option value=${s} />`)}</datalist></details>` : ""}
    </section>

    <section class="caja" aria-labelledby="aj-cop">
      <h2 id="aj-cop">Copilot CLI</h2>
      <p>Lo usan los asistentes de la pestaña Copilot. Se instala y se inicia sesión desde esa pestaña.</p>
      <div class="rejilla">
        <label class="campo"><span>Modelo (opcional)</span><input class="inp mono" value=${cp.modelo || ""} onInput=${(e) => set(["copilot", "modelo"], e.target.value)} placeholder="el que tenga Copilot por defecto" /></label>
        <label class="campo"><span>Opciones extra de copilot</span><input class="inp mono" value=${cp.opciones || ""} onInput=${(e) => set(["copilot", "opciones"], e.target.value)} placeholder="--log-level debug" /></label>
        <label class="campo ancho"><span>Variables de entorno para npm y Copilot (una por línea)</span>
          <textarea class="inp" rows="3" value=${cp.entorno || ""} onInput=${(e) => set(["copilot", "entorno"], e.target.value)} placeholder=${"HTTPS_PROXY=http://proxy:8080\nHTTP_PROXY=http://proxy:8080\nNODE_EXTRA_CA_CERTS=C:\\certs\\empresa.pem"} /></label>
        <label class="interruptor ancho"><input type="checkbox" checked=${!!cp.permitirComandos} onChange=${(e) => set(["copilot", "permitirComandos"], e.target.checked)} />
          Al modificar, dejar que Copilot ejecute comandos (compilar, probar). Nunca puede hacer commit ni push.</label>
      </div>
    </section>

    <section class="caja" aria-labelledby="aj-equipo">
      <h2 id="aj-equipo">Ajustes del equipo</h2>
      <p>La organización, los patrones, los nombres de los proyectos y las reglas que vienen dentro del ejecutable salen de <span class="mono">monitor-pases/config-equipo.json</span>, en el repositorio. Cada persona solo pone su token. Lo que cambies aquí vale solo para ti${cfg.hayEquipo ? "" : " (este ejecutable no trae ajustes del equipo)"}.</p>
      <button class="btn btn-s" onClick=${copiarEquipo}><${Icono} n="copiar" /> Copiar mis ajustes para el equipo (sin tokens)</button>
    </section>

    <section class="caja" aria-labelledby="aj-nfq">
      <h2 id="aj-nfq">GitHub NFQ (pases-datos)</h2>
      <p>Adonde se publican los DPs (dps/…) y los pases (pases/…). Solo DPs, releases, features y componentes: nada de código.</p>
      <label class="interruptor" style="margin-bottom:12px"><input type="checkbox" checked=${n.publicarDPs !== false} onChange=${(e) => set(["nfq", "publicarDPs"], e.target.checked)} /> Publicar los DPs nuevos automáticamente</label>
      <div class="rejilla">
        <label class="campo"><span>Repositorio</span><input class="inp mono" value=${n.repo} onInput=${(e) => set(["nfq", "repo"], e.target.value)} placeholder="rdr-nfq/pases-datos" /></label>
        <label class="campo"><span>Token (solo si no puedes iniciar sesión con Git)</span><input class="inp mono" type="password" autocomplete="off" value=${n.token} onInput=${(e) => set(["nfq", "token"], e.target.value)} placeholder=${tokenPh(n)} />
          ${n.tokenConfigurado && (n.borrarToken ? html`<small>Se quitará al guardar.</small>` : html`<small><button class="btn btn-t btn-s" style="padding:0;height:auto" onClick=${() => set(["nfq", "borrarToken"], true)}>Quitar el token guardado</button></small>`)}</label>
        <label class="campo"><span>Rama</span><input class="inp mono" value=${n.rama} onInput=${(e) => set(["nfq", "rama"], e.target.value)} /></label>
        <label class="campo"><span>Carpeta</span><input class="inp mono" value=${n.carpeta} onInput=${(e) => set(["nfq", "carpeta"], e.target.value)} placeholder="pases" /></label>
      </div>
      <details style="margin-top:12px"><summary class="etq" style="cursor:pointer">Proxy y certificados para github.com</summary>
        <div class="rejilla" style="margin-top:12px">
          <label class="campo"><span>Proxy</span><input class="inp mono" value=${n.proxy} onInput=${(e) => set(["nfq", "proxy"], e.target.value)} placeholder="vacío = el del sistema" /></label>
          <label class="campo"><span>Certificado raíz</span><input class="inp mono" value=${n.ca} onInput=${(e) => set(["nfq", "ca"], e.target.value)} placeholder="vacío = los del sistema" /></label>
          <label class="campo"><span>Transporte</span><select class="inp" value=${n.transporte} onChange=${(e) => set(["nfq", "transporte"], e.target.value)}>
            <option value="python">Python (por defecto)</option><option value="curl">curl</option></select></label>
        </div>
      </details>
      <div class="prueba"><button class="btn" onClick=${() => probar("nfq")} disabled=${estado.demo}>Probar conexión</button><${Resultado} r=${res.nfq} /></div>
    </section>

    <p class="tenue" style="margin:0;font-size:12px">Monitor de pases ${estado.version}</p>

    ${sucio && html`<div class="barra-guardar" role="status"><span>Hay cambios sin guardar.</span>
      <button class="btn" onClick=${guardar}>Guardar</button>
      <button class="btn" onClick=${() => { setCfg(JSON.parse(orig)); setVersion((v) => v + 1); }}>Descartar</button></div>`}
  </div></div>`;
}

/* ── App ── */
function App() {
  const [estado, setEstado] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const leerHash = () => { const v = location.hash.slice(1); return { vista: VISTAS.includes(v) ? v : "ramas" }; };
  const [ruta, setRuta] = useState(leerHash);
  const pila = useRef([]);
  const conHistorial = useRef(false);
  const [filtros, setFiltrosBase] = useState(leerFiltros);
  const setFiltros = useCallback((f) => { setFiltrosBase(f); guardarFiltros(f); }, []);
  const [facetas, setFacetas] = useState(null);
  const [paleta, setPaleta] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [tostadas, setTostadas] = useState([]);
  const [presel, setPresel] = useState(null);
  const [, setTic] = useState(0);
  const [dentro, setDentro] = useState(false);
  const [tema, setTema] = useState(() => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  // Navegación: commits y diferencias son pantallas dentro de la pestaña de
  // la que se viene; «Volver» y el botón Atrás del navegador deshacen el paso.
  const ir = (r) => {
    const destino = { ...r, desde: r.desde || (VISTAS.includes(ruta.vista) ? ruta.vista : ruta.desde) };
    pila.current.push(ruta);
    setRuta(destino);
    setAbierta(null);
    try { history.pushState({ mp: true }, "", "#" + (VISTAS.includes(destino.vista) ? destino.vista : destino.desde)); conHistorial.current = true; } catch {}
    document.getElementById("principal")?.scrollTo(0, 0);
  };
  const atras = () => { setRuta(pila.current.pop() || { vista: "ramas" }); };
  const volver = () => { if (conHistorial.current) history.back(); else atras(); };
  useEffect(() => {
    const f = () => atras();
    addEventListener("popstate", f);
    return () => removeEventListener("popstate", f);
  }, []);
  const vista = ruta.vista;
  const setVista = (v) => ir({ vista: v });
  ponerIr(ir);
  const aviso = useCallback((texto, tipo = "ok", enlace) => {
    const id = Math.random();
    setTostadas((t) => [...t.slice(-3), { id, texto, tipo, enlace }]);
    setTimeout(() => setTostadas((t) => t.filter((x) => x.id !== id)), tipo === "mal" ? 9000 : 6000);
  }, []);
  const cargar = useCallback(async () => {
    try { setEstado(await api("estado")); setErrorCarga(null); } catch (e) { setErrorCarga(e.message); }
  }, []);
  useEffect(() => { cargar(); const t = setInterval(() => setTic((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const t = setTimeout(cargar, estado?.sincro?.enCurso ? 2000 : 30000);
    return () => clearTimeout(t);
  }, [estado, cargar]);
  if (estado) ponerColores(estado.proyectos.map((p) => p.feature));

  const sincronizar = async () => {
    try {
      const r = await api("sincronizar", {});
      if (!r.pedida) aviso("Ya hay una sincronización en marcha.");
      setTimeout(cargar, 500);
    } catch (e) { aviso(e.message, "mal"); }
  };
  const cambiarTema = () => {
    const t = tema === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    ponerLS("mp-tema", t);
    setTema(t);
  };
  const preparar = (features) => { setPresel(features); setVista("pase"); };
  // Atajos: Ctrl+K (o ⌘K) «Ir a…»; «/» al buscador de la vista.
  useEffect(() => {
    const t = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaleta(true); return; }
      const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (e.key === "/" && !escribiendo && !e.ctrlKey && !e.metaKey) {
        const b = document.getElementById("buscar-filtros");
        if (b) { e.preventDefault(); b.focus(); b.select(); }
      }
    };
    addEventListener("keydown", t);
    return () => removeEventListener("keydown", t);
  }, []);

  if (!estado) return html`<p class="arranque" role=${errorCarga ? "alert" : "status"}>${errorCarga ? "No se puede hablar con la app: " + errorCarga : "Cargando el monitor…"}</p>`;
  if (!dentro) return html`<${PantallaEntrada} estado=${estado} tema=${tema} cambiarTema=${cambiarTema} entrar=${() => { setDentro(true); cargar(); }} />`;
  const conLateral = ["ramas", "actividad", "commits", "dps", "repos"].includes(vista);
  const comun = { estado, f: filtros, setF: setFiltros, setFacetas, ir };
  return html`<div class="marco">
    <${Cabecera} estado=${estado} vista=${VISTAS.includes(vista) ? vista : ruta.desde} setVista=${setVista} onSync=${sincronizar} tema=${tema} cambiarTema=${cambiarTema} abrirPaleta=${() => setPaleta(true)} />
    <${Avisos} estado=${estado} setVista=${setVista} />
    <div class="cuerpo ${conLateral ? "" : "ancho"}">
      ${conLateral && html`<${LateralFiltros} facetas=${facetas} f=${filtros} setF=${setFiltros} />`}
      <main class="principal" id="principal">
        ${vista === "ramas" && html`<${VistaRamas} ...${comun} abierta=${abierta} setAbierta=${setAbierta} preparar=${preparar} setVista=${setVista} />`}
        ${vista === "actividad" && html`<${VistaActividad} ...${comun} setAbierta=${setAbierta} />`}
        ${vista === "commits" && html`<${VistaCommits} ...${comun} />`}
        ${vista === "dps" && html`<${VistaDPs} ...${comun} aviso=${aviso} />`}
        ${vista === "dp" && html`<${VistaDP} key=${ruta.repo + ruta.cod} repo=${ruta.repo} cod=${ruta.cod} volver=${volver} ir=${ir} estado=${estado} />`}
        ${vista === "repos" && html`<${VistaRepos} ...${comun} />`}
        ${vista === "repo" && html`<${VistaRepo} key=${ruta.repo} repo=${ruta.repo} sub=${ruta.sub} refName=${ruta.ref} ruta=${ruta.ruta} ir=${ir} volver=${volver} />`}
        ${vista === "pr" && html`<${VistaPR} key=${ruta.repo + ruta.n} repo=${ruta.repo} n=${ruta.n} volver=${volver} ir=${ir} estado=${estado} />`}
        ${vista === "copilot" && html`<${VistaCopilot} key=${JSON.stringify(ruta.contexto || {}) + (ruta.modo || "")} estado=${estado} contexto0=${ruta.contexto} modo0=${ruta.modo} ir=${ir} aviso=${aviso} />`}
        ${vista === "commit" && html`<${VistaCommit} key=${ruta.repo + ruta.sha} repo=${ruta.repo} sha=${ruta.sha} volver=${volver} ir=${ir} aviso=${aviso} />`}
        ${vista === "diff" && html`<${VistaDiffRama} key=${ruta.id} id=${ruta.id} foco=${ruta.foco} volver=${volver} ir=${ir} />`}
        ${vista === "pase" && html`<${VistaPase} estado=${estado} aviso=${aviso} preseleccion=${presel} limpiarPreseleccion=${() => setPresel(null)} />`}
        ${vista === "ajustes" && html`<${VistaAjustes} estado=${estado} aviso=${aviso} recargar=${cargar} />`}
      </main>
    </div>
    ${paleta && html`<${Paleta} estado=${estado} cerrar=${() => setPaleta(false)} ir=${ir} abrirRama=${(id) => setAbierta(id)}
      filtrarProyecto=${(p) => { setFiltros({ ...filtros, proyectos: [p] }); if (!["ramas", "actividad", "commits", "dps"].includes(vista)) ir({ vista: "ramas" }); }} />`}
    ${abierta && html`<${Detalle} id=${abierta} onCerrar=${() => setAbierta(null)} aviso=${aviso} recargar=${cargar} ir=${ir} />`}
    <div class="tostadas" aria-live="polite">${tostadas.map((t) => html`<div class="tostada ${t.tipo === "mal" ? "mal" : ""}" key=${t.id} role=${t.tipo === "mal" ? "alert" : "status"}>
      <span>${t.texto}${t.enlace ? html` <a href=${t.enlace} target="_blank" rel="noopener noreferrer">Abrir</a>` : ""}</span></div>`)}</div>
  </div>`;
}

render(html`<${App} />`, document.getElementById("app"));
