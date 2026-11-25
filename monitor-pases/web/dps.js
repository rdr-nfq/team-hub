// Monitor de pases · DPs: cada release (release/x.y.z) es una subida y su
// Action genera el DP. Qué componentes lleva cada DP y qué modificaciones.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, ChipJira, Icono, Rama, hace, fLarga, fCorta, corto, plural, colorDe, leerLS, ponerLS, uniq, jira, historiasEn, issueJira } from "./comun.js";
import { PanelRelease } from "./jira.js";
import { BarraFiltros, pasa, propsDeRepos, useFacetas } from "./filtros.js";
import { Diferencias, Cargando, Volver } from "./diffs.js";

/* Comprobación del DP: contra qué commit de producción se ha calculado, lo que ya está igual en producción,
   lo que producción tiene y el DP no lleva, y el cruce con Jira (Fix Version/s de la release). */
function Comprobacion({ d, repo, estado }) {
  const urlRepo = (estado.repos || []).find((r) => r.nombre === repo)?.url || "";
  const sp = d.soloProduccion || {};
  const iguales = (d.ficheros || []).filter((f) => f.igualProduccion).map((f) => f.ruta);
  const j = jira();
  // Jira: las historias de los commits del DP y las de la release en Jira (misma x.y.z).
  const hist = uniq((d.commits || []).flatMap((c) => historiasEn(c.mensaje)));
  const relJ = d.release && j ? (j.releases || []).find((v) => v.num === d.release) : null;
  const enJira = relJ ? (j.relHistorias?.[relJ.id] || []) : [];
  const numDe = (v) => (String(v).match(/(?<![\d.])\d+\.\d+(?:\.\d+){0,2}(?![\d])/) || [""])[0];
  const sinRelease = hist.filter((k) => {
    const x = issueJira(k);
    const nums = [...(x?.fv || []), ...String(x?.tv || "").split(",")].map(numDe);
    return x && d.release && !nums.includes(d.release) && !enJira.includes(k);
  });
  const soloJira = enJira.filter((k) => !hist.includes(k));
  const okProd = !sp.commits, okJira = !sinRelease.length;
  return html`<section class="caja comprobacion-dp" aria-labelledby="dp-compr">
    <h2 id="dp-compr">Comprobación <span class=${"chip " + (okProd && okJira ? "chip-ok" : "chip-mal")}>${okProd && okJira ? "cuadra" : "revisar"}</span></h2>
    <ul class="lista-compr">
      <li class="ok"><${Icono} n="ok" /><div><b>Frente a producción:</b> <span class="mono">${d.frente}</span> en el commit <span class="mono">${(d.frenteSha || "").slice(0, 7)}</span>
        ${d.mergeBase ? html` · se separó de producción en <span class="mono">${d.mergeBase.slice(0, 7)}</span>` : ""}
        <span class="tenue"> · ${d.congelado ? `congelado ${d.enProduccion ? "al entrar en producción " + hace(d.enProduccion) : ""}` : `calculado ${hace(d.calculado || d.detectado)}; se recalcula si producción cambia`}</span>
        ${urlRepo && d.frenteSha ? html` · <a class="lnk" href=${`${urlRepo}/compare/${d.frenteSha}...${d.sha}`} target="_blank" rel="noopener noreferrer">Ver la misma comparación en GitHub</a>` : ""}</div></li>
      ${iguales.length ? html`<li class="info"><${Icono} n="ok" /><div><b>${plural(iguales.length, "fichero ya está igual", "ficheros ya están iguales")} en producción</b>${" "}
        (entraron por otro lado: otra release, un squash o un cherry-pick). No cuentan como cambios del DP.
        <details><summary>Ver cuáles</summary><ul class="mono">${iguales.map((f) => html`<li key=${f}>${f}</li>`)}</ul></details></div></li>` : ""}
      ${d.comprobadoContenido === false ? html`<li class="aviso"><${Icono} n="mal" /><div>No se ha podido comparar el contenido con producción (repositorio muy grande): puede haber ficheros que ya estén iguales.</div></li>` : ""}
      ${sp.commits ? html`<li class=${sp.enComun?.length ? "mal" : "aviso"}><${Icono} n="mal" /><div>
        <b>Producción tiene ${plural(sp.commits, "commit", "commits")} que este DP no lleva</b>${sp.mensajes?.length ? html` (${sp.mensajes.slice(-3).join(" · ")})` : ""}.
        ${sp.enComun?.length ? html` <b>Ojo:</b> ${plural(sp.enComun.length, "fichero del DP también ha cambiado", "ficheros del DP también han cambiado")} en producción: si se despliega tal cual, esos cambios de producción se perderían. Hay que bajar producción a la release.
          <ul class="mono">${sp.enComun.map((f) => html`<li key=${f}>${f}</li>`)}</ul>` : " No tocan los ficheros del DP."}</div></li>`
        : d.frenteSha && !d.congelado ? html`<li class="ok"><${Icono} n="ok" /><div>La release lleva todo lo que hay en producción.</div></li>` : ""}
      ${d.release && j ? html`<li class=${okJira ? "ok" : "aviso"}><${Icono} n=${okJira ? "ok" : "mal"} /><div>
        <b>Jira:</b> ${plural(hist.length, "historia citada", "historias citadas")} en los commits del DP${relJ ? html`; la release <span class="mono">${relJ.nombre}</span> tiene ${plural(enJira.length, "historia", "historias")} en Jira` : " · la release aún no existe en Jira"}.
        ${sinRelease.length ? html`<div>Sin esta release en <i>Fix Version/s</i>: ${sinRelease.map((k) => html`<${ChipJira} key=${k} k=${k} />`)}</div>` : ""}
        ${soloJira.length ? html`<div class="tenue">En la release de Jira y sin commits en este DP (pueden estar en otro repositorio): ${soloJira.slice(0, 12).map((k) => html`<${ChipJira} key=${k} k=${k} />`)}${soloJira.length > 12 ? ` y ${soloJira.length - 12} más` : ""}</div>` : ""}
      </div></li>` : ""}
    </ul>
  </section>`;
}

function ChipFeature({ f, alias }) {
  return html`<span class="chip chip-acento" style=${{ background: colorDe(f) }} title=${alias?.[f] || ""}>${f}</span>`;
}

function EstadoPublicado({ d, nfq }) {
  if (d.publicado) return html`<a class="chip chip-ok" href=${d.publicado.url} target="_blank" rel="noopener noreferrer"
    title=${(d.publicado.yaEstaba ? "Ya lo había publicado alguien del equipo · " : "Publicado ") + fLarga(d.publicado.fecha)}>En pases-datos</a>`;
  if (d.conclusion && d.conclusion !== "success") return html`<span class="chip chip-borde" title="Solo se publican los DPs de ejecuciones correctas">No se publica</span>`;
  return html`<span class="chip chip-borde" title=${nfq?.sesion ? "Se publica en la próxima sincronización" : "Inicia sesión en GitHub NFQ"}>Sin publicar</span>`;
}

function Componentes({ comps, max = 6 }) {
  if (!comps.length) return html`<span class="tenue">Sin componentes</span>`;
  return html`<span class="comps-dp">${comps.slice(0, max).map((c) => html`<span class="chip" key=${c.nombre + c.tipo}
      title=${`${c.tipo || "sin tipo"}${c.subida && c.subida !== c.tipo ? " · " + c.subida : ""}`}>${c.nombre}</span>`)}
    ${comps.length > max ? html`<span class="tenue">+${comps.length - max}</span>` : ""}</span>`;
}

const AGRUPAR_DPS = [["release", "Release"], ["proyecto", "Proyecto"], ["repo", "Repositorio"]];
const MAX_GRUPOS_DPS = 30;

function agruparDPs(lista, modo, alias) {
  const grupos = [], idx = {};
  const meter = (k, base, d) => {
    if (!(k in idx)) { idx[k] = grupos.length; grupos.push({ k, ...base, dps: [] }); }
    grupos[idx[k]].dps.push(d);
  };
  for (const d of lista) {
    if (modo === "proyecto") for (const f of d.features.length ? d.features : [""]) meter("p:" + f, { feature: f, nombre: alias[f] || "" }, d);
    else if (modo === "repo") meter("r:" + d.repo, { repo: d.repo, porRepo: true }, d);
    else meter(d.repo + "|" + d.rama, { repo: d.repo, rama: d.rama, release: d.release }, d);
  }
  if (modo === "proyecto") grupos.sort((a, b) => (a.feature === "") - (b.feature === "") || (b.dps[0].fecha || "").localeCompare(a.dps[0].fecha || ""));
  return grupos;
}

function ReleaseJira({ num }) {
  const j = jira();
  if (!j || j.sesion?.estado !== "iniciada" || !num) return null;
  const v = (j.releases || []).find((x) => x.num === num);
  if (!v) return html`<span class="chip chip-borde" title="La rama existe; la release aún no está en Jira">aún no está en Jira</span>`;
  return html`<span class=${"chip " + (v.publicada ? "chip-ok" : "chip-curso")} title=${"Release de Jira " + v.nombre}>Jira: ${v.publicada ? "publicada" : "sin publicar"}${v.fecha ? " · " + fCorta(v.fecha) : ""}</span>`;
}

function CabGrupoDP({ g, alias, ir, verHistorias, historiasAbiertas }) {
  if (g.feature !== undefined) return html`<div class="grupo-cab">
    <span class="barra" style=${{ background: colorDe(g.feature) }} />
    <h2>${g.feature ? html`<span class="mono">${g.feature}</span> ${g.nombre || html`<span class="tenue">Sin nombre</span>`}` : "Sin proyecto"}</h2>
    <span class="resumen">${plural(g.dps.length, "DP", "DPs")} · ${plural(uniq(g.dps.map((d) => d.repo)).length, "repo", "repos")}</span></div>`;
  if (g.porRepo) return html`<div class="grupo-cab">
    <span class="ico-release" aria-hidden="true"><${Icono} n="repo" /></span>
    <h2><span class="mono">${corto(g.repo)}</span></h2>
    <span class="resumen">${plural(g.dps.length, "DP", "DPs")} · ${plural(uniq(g.dps.map((d) => d.rama)).length, "rama", "ramas")}</span>
    <div class="acc"><button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo: g.repo, sub: "codigo" })}><${Icono} n="repo" /> Código</button></div></div>`;
  return html`<div class="grupo-cab">
    <span class="ico-release" aria-hidden="true"><${Icono} n=${g.release ? "paquete" : "rama"} /></span>
    <h2>${g.release ? html`Release <span class="mono">${g.release}</span>` : html`<span class="mono"><${Rama} nombre=${g.rama} /></span>`}
      <span class="tenue" style="font-weight:400">${corto(g.repo)}</span></h2>
    <span class="feats">${uniq(g.dps.flatMap((d) => d.features)).map((f) => html`<${ChipFeature} key=${f} f=${f} alias=${alias} />`)}</span>
    ${g.release ? html`<${ReleaseJira} num=${g.release} />` : ""}
    <div class="acc">
      ${g.release && jira()?.sesion?.estado === "iniciada" ? html`<button class="btn btn-s" aria-expanded=${!!historiasAbiertas} onClick=${verHistorias}><${Icono} n="marcador" /> Historias</button>` : ""}
      <button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo: g.repo, sub: "codigo", ref: g.rama })}><${Icono} n="repo" /> Ver la rama</button></div></div>`;
}

export function VistaDPs({ estado, f, setF, setFacetas, ir, aviso }) {
  const [datos, setDatos] = useState(null);
  const [err, setErr] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [soloReleases, setSoloReleases] = useState(false);
  const [modo, setModo] = useState(() => leerLS("mp-agrupar-dps", "release"));
  const [nGrupos, setNGrupos] = useState(MAX_GRUPOS_DPS);
  const [conHistorias, setConHistorias] = useState(() => new Set());
  const cargar = () => api("dps").then(setDatos, (e) => setErr(e.message));
  useEffect(() => { cargar(); }, [estado.sincro?.fin]);
  const alias = useMemo(() => Object.fromEntries(estado.proyectos.map((p) => [p.feature, p.nombre])), [estado]);
  const items = useMemo(() => (datos?.dps || []).filter((d) => !soloReleases || d.release).map((d) => ({
    o: d, repo: d.repo, fecha: d.fecha, proyectos: d.features.length ? d.features : [""], personas: [],
    texto: [d.cod, d.rama, d.release, d.repo, ...d.features, ...d.componentes.map((c) => c.nombre)].join(" "),
  })), [datos, soloReleases]);
  const facetas = useFacetas(setFacetas, items, f, estado, ["proyectos", "repos", "props"]);
  const props = useMemo(() => propsDeRepos(estado.repos), [estado]);
  const lista = useMemo(() => items.filter((x) => pasa(x, f, props)).map((x) => x.o), [items, f, props]);
  const grupos = useMemo(() => agruparDPs(lista, modo, alias), [lista, modo, alias]);
  useEffect(() => { setNGrupos(MAX_GRUPOS_DPS); }, [f, modo]);
  if (!datos) return html`<${Cargando} err=${err} texto="Cargando los DPs…" />`;
  const publicar = async () => {
    setPublicando(true);
    try {
      const r = await api("dps/publicar", {});
      aviso(r.motivo || `${plural(r.publicados || 0, "DP publicado", "DPs publicados")}${r.yaEstaban ? `, ${r.yaEstaban} ya estaban` : ""}${r.errores?.length ? `; ${r.errores.length} con error: ${r.errores[0].error}` : ""}.`,
        r.errores?.length ? "mal" : "ok");
      cargar();
    } catch (e) { aviso(e.message, "mal"); } finally { setPublicando(false); }
  };
  const sinPublicar = lista.filter((d) => !d.publicado && d.conclusion === "success").length;
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>DPs</h1><p>${plural(lista.length, "DP", "DPs")} de ${plural(uniq(lista.map((d) => d.repo)).length, "repositorio", "repositorios")}. Cada release es una subida.</p></div>
    <${BarraFiltros} f=${f} setF=${setF} facetas=${facetas} total=${lista.length} placeholder="DP, release, feature o componente">
      <label class="interruptor"><input type="checkbox" checked=${soloReleases} onChange=${(e) => setSoloReleases(e.target.checked)} /> Solo los de releases</label>
    </${BarraFiltros}>
    <div class="barra-grupos">
      <span class="etq-seg">Agrupar por</span>
      <div class="segmento" role="group" aria-label="Agrupar por">${AGRUPAR_DPS.map(([m, t]) => html`<button key=${m} aria-pressed=${modo === m} onClick=${() => { setModo(m); ponerLS("mp-agrupar-dps", m); }}>${t}</button>`)}</div>
      <span class="publicar-dps">
        <span class="tenue">${datos.nfq?.sesion ? `Se publican en ${datos.nfq.repo}` : "Inicia sesión en GitHub NFQ para publicarlos"}</span>
        <button class="btn btn-s" disabled=${publicando || !datos.nfq?.sesion || !sinPublicar} onClick=${publicar}>
          <${Icono} n=${publicando ? "actualizar" : "subir"} cls=${publicando ? "gira" : ""} /> ${sinPublicar ? `Publicar ${sinPublicar}` : "Todo publicado"}</button>
      </span>
    </div>
    ${!(datos.dps || []).length ? html`<div class="vacio-mini">Todavía no se ha detectado ningún DP en las Actions.</div>` : ""}
    ${grupos.slice(0, nGrupos).map((g) => html`<section class="grupo" key=${g.k}>
      <${CabGrupoDP} g=${g} alias=${alias} ir=${ir} historiasAbiertas=${conHistorias.has(g.k)}
        verHistorias=${() => setConHistorias((x) => { const n = new Set(x); n.has(g.k) ? n.delete(g.k) : n.add(g.k); return n; })} />
      ${g.release && conHistorias.has(g.k) ? html`<${PanelRelease} num=${g.release} estado=${estado} jira=${jira()} soloRepo=${g.repo} />` : ""}
      <ul class="lista-dps">${g.dps.map((d) => html`<li key=${d.cod}>
        <span class="cod-dp-c"><button class="cod-dp" onClick=${() => ir({ vista: "dp", repo: d.repo, cod: d.cod })}>${d.cod}</button>
          ${modo !== "release" ? html`<span class="donde-dp" title=${d.repo + " · " + d.rama}>${g.porRepo ? "" : corto(d.repo) + " · "}${d.release ? "release " + d.release : d.rama}</span>` : ""}</span>
        <span class="meta-dp"><span class=${d.conclusion === "success" ? "ico-ok" : "ico-mal"} title=${d.flujo || ""}><${Icono} n=${d.conclusion === "success" ? "ok" : "mal"} /></span>
          ${hace(d.fecha)} · <span class="mono">${(d.sha || "").slice(0, 7)}</span></span>
        <span class="comps-linea">${d.yaEnProduccion ? html`<span class="tenue">Ya estaba en producción al detectarlo</span>` : html`<b>${plural(d.componentes.length, "componente", "componentes")}</b>
          <span class="num tenue">(<span class="c-mas">+${d.mas}</span> <span class="c-menos">−${d.menos}</span> en ${plural(d.nFich, "fichero", "ficheros")})</span>
          <${Componentes} comps=${d.componentes} />`}
          ${d.soloProd?.enComun ? html` <span class="chip chip-mal" title="Producción ha cambiado ficheros que este DP también cambia: revisa la comprobación del DP">pisaría cambios de producción</span>`
            : d.soloProd?.commits ? html` <span class="chip chip-borde" title="Producción tiene commits que este DP no lleva (no tocan sus ficheros)">producción va por delante</span>` : ""}
          ${d.nIguales ? html` <span class="chip chip-borde" title="Ficheros que ya están iguales en producción: no cuentan">${d.nIguales} ya en producción</span>` : ""}</span>
        <${EstadoPublicado} d=${d} nfq=${datos.nfq} />
      </li>`)}</ul>
    </section>`)}
    ${grupos.length > nGrupos && html`<button class="btn" onClick=${() => setNGrupos(nGrupos + MAX_GRUPOS_DPS)}>Ver ${Math.min(MAX_GRUPOS_DPS, grupos.length - nGrupos)} grupos más (quedan ${grupos.length - nGrupos})</button>`}
  </div>`;
}

export function VistaDP({ repo, cod, volver, ir, estado }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [dif, setDif] = useState(null);
  const [errDif, setErrDif] = useState(null);
  const [foco, setFoco] = useState(null);
  const [verCommits, setVerCommits] = useState(false);
  const [qComp, setQComp] = useState("");
  const [tipoComp, setTipoComp] = useState(null);
  const refMods = useRef(null);
  useEffect(() => {
    api(`dp?repo=${encodeURIComponent(repo)}&cod=${encodeURIComponent(cod)}`).then(setD, (e) => setErr(e.message));
    api(`dp/diff?repo=${encodeURIComponent(repo)}&cod=${encodeURIComponent(cod)}`).then(setDif, (e) => setErrDif(e.message));
  }, [repo, cod]);
  if (!d) return html`<div><div class="contenido" style="padding-bottom:0"><${Volver} volver=${volver} /></div><${Cargando} err=${err} texto="Cargando el DP…" /></div>`;
  const alias = Object.fromEntries(estado.proyectos.map((p) => [p.feature, p.nombre]));
  const nTipo = {};
  d.componentes.forEach((c) => { nTipo[c.tipo || ""] = (nTipo[c.tipo || ""] || 0) + 1; });
  const tipos = Object.entries(nTipo).sort((a, b) => b[1] - a[1]);
  const pq = qComp.trim().toLowerCase();
  const comps = d.componentes.filter((c) => (tipoComp === null || (c.tipo || "") === tipoComp) &&
    (!pq || [c.nombre, c.tipo, c.subida, ...c.ficheros].join(" ").toLowerCase().includes(pq)));
  const irFichero = (f) => { setFoco(f + "#" + Date.now()); refMods.current?.scrollIntoView({ block: "start" }); };
  return html`<div class="contenido">
    <${Volver} volver=${volver} />
    <header class="cab-commit">
      <p class="eyebrow"><${Icono} n="paquete" /> ${corto(repo)} · ${d.release ? html`release <span class="mono">${d.release}</span>` : html`<span class="mono">${d.rama}</span>`}</p>
      <h1 class="mono h-dp">${d.cod}</h1>
      <p class="suave" style="margin:6px 0 0">Generado ${fLarga(d.fecha)} por «${d.flujo || "Action"}» en el commit${" "}<button class="lnk mono" onClick=${() => ir({ vista: "commit", repo, sha: d.sha })}>${d.sha.slice(0, 7)}</button>.
        ${d.yaEnProduccion ? " Cuando se detectó, la release ya estaba entera en producción: no se pudieron calcular sus cambios."
          : html` Lo que trae frente a <b>${d.frente}</b>.`}</p>
      <div class="meta-commit">
        ${(d.features || []).map((f) => html`<${ChipFeature} key=${f} f=${f} alias=${alias} />`)}
        ${d.publicado ? html`<a class="chip chip-ok" href=${d.publicado.url} target="_blank" rel="noopener noreferrer">En pases-datos</a>` : html`<span class="chip chip-borde">Sin publicar</span>`}
        ${d.url ? html`<a class="btn btn-s" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Ejecución</a>` : ""}
        <button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo, sub: "codigo", ref: d.rama })}><${Icono} n="repo" /> Código de la rama</button>
        <button class="btn btn-s" onClick=${() => ir({ vista: "copilot", contexto: { tipo: "dp", repo, cod } })}><${Icono} n="chispa" /> Preguntar a Copilot</button>
        ${d.commits?.length ? html`<button class="btn btn-s" aria-expanded=${verCommits} onClick=${() => setVerCommits(!verCommits)}><${Icono} n="commit" /> ${plural(d.commits.length, "commit", "commits")}</button>` : ""}
      </div>
      ${verCommits ? html`<ul class="lista-commits">${[...d.commits].reverse().map((c) => html`<li key=${c.sha}>
        <button onClick=${() => ir({ vista: "commit", repo, sha: c.sha })}><span class="mono tenue">${c.sha.slice(0, 7)}</span> ${c.mensaje}</button>
        <span class="tenue">${c.autor} · ${hace(c.fecha)}</span></li>`)}</ul>` : ""}
    </header>

    <${Comprobacion} d=${d} repo=${repo} estado=${estado} />

    <section class="caja" aria-labelledby="dp-comp" style="margin-bottom:16px">
      <h2 id="dp-comp">Componentes <span class="chip">${d.componentes.length}</span></h2>
      ${tipos.length > 1 || d.componentes.length > 8 ? html`<div class="filtros filtros-comp">
        ${d.componentes.length > 8 && html`<label class="buscar"><span class="sr">Buscar componente o fichero</span><${Icono} n="buscar" />
          <input class="inp" type="search" placeholder="Componente o fichero" value=${qComp} onInput=${(e) => setQComp(e.target.value)} /></label>`}
        ${tipos.length > 1 && html`<div class="segmento" role="group" aria-label="Tipo de componente">
          <button aria-pressed=${tipoComp === null} onClick=${() => setTipoComp(null)}>Todos <span class="tenue">${d.componentes.length}</span></button>
          ${tipos.map(([t, n]) => html`<button key=${t} aria-pressed=${tipoComp === t} onClick=${() => setTipoComp(tipoComp === t ? null : t)}>${t || "Sin regla"} <span class="tenue">${n}</span></button>`)}</div>`}
      </div>` : ""}
      ${comps.length ? html`<div style="overflow-x:auto"><table class="tabla tabla-comp-dp">
        <thead><tr><th scope="col">Componente</th><th scope="col">Tipo</th><th scope="col">Subida</th><th scope="col">Ficheros</th></tr></thead>
        <tbody>${comps.map((c) => html`<tr key=${c.clave}>
          <td><b>${c.nombre}</b>${c.borrado ? html` <span class="chip chip-mal">se borra</span>` : ""}</td>
          <td>${c.tipo || html`<span class="chip chip-borde">sin regla</span>`}</td><td>${c.subida || "—"}</td>
          <td class="ficheros-comp">${c.ficheros.map((f) => html`<button class="lnk mono" key=${f} onClick=${() => irFichero(f)} title="Ver sus cambios">${f}</button>`)}</td>
        </tr>`)}</tbody></table></div>` : html`<p class="suave" style="margin:0">${d.componentes.length ? "Ningún componente con ese filtro." : "Sin componentes."}</p>`}
      ${d.ignorados ? html`<p class="nota">${plural(d.ignorados, "fichero ignorado", "ficheros ignorados")} por las reglas de Ajustes.</p>` : ""}
    </section>

    <div ref=${refMods}>
      <h2 class="h-seccion">Modificaciones</h2>
      ${dif ? html`<${Diferencias} key=${foco || "x"} ficheros=${dif.ficheros} repo=${repo} despues=${d.sha} antes=${d.frenteSha} foco=${foco ? foco.split("#")[0] : null} />`
        : html`<${Cargando} err=${errDif} texto="Cargando las modificaciones…" />`}
    </div>
  </div>`;
}
