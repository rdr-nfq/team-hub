// Monitor de pases · DPs: cada release (release/x.y.z) es una subida y su
// Action genera el DP. Qué componentes lleva cada DP y qué modificaciones.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, Icono, Rama, hace, fLarga, corto, plural, colorDe, uniq } from "./comun.js";
import { Diferencias, Cargando, Volver } from "./diffs.js";

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

export function VistaDPs({ estado, filtros, setFiltros, ir, aviso }) {
  const [datos, setDatos] = useState(null);
  const [err, setErr] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [soloReleases, setSoloReleases] = useState(false);
  const cargar = () => api("dps").then(setDatos, (e) => setErr(e.message));
  useEffect(() => { cargar(); }, [estado.sincro?.fin]);
  const alias = useMemo(() => Object.fromEntries(estado.proyectos.map((p) => [p.feature, p.nombre])), [estado]);
  const q = filtros.q.trim().toLowerCase();
  const lista = useMemo(() => (datos?.dps || []).filter((d) =>
    (filtros.proyecto === null || (filtros.proyecto === "" ? !d.features.length : d.features.includes(filtros.proyecto))) &&
    (!filtros.repo || d.repo === filtros.repo) && (!soloReleases || d.release) &&
    (!q || [d.cod, d.rama, d.release, d.repo, ...d.features, ...d.componentes.map((c) => c.nombre)].join(" ").toLowerCase().includes(q))),
  [datos, filtros, soloReleases, q]);
  if (!datos) return html`<${Cargando} err=${err} texto="Cargando los DPs…" />`;
  // Agrupados por subida: repositorio + rama (la release).
  const grupos = [];
  const idx = {};
  lista.forEach((d) => {
    const k = d.repo + "|" + d.rama;
    if (!(k in idx)) { idx[k] = grupos.length; grupos.push({ k, repo: d.repo, rama: d.rama, release: d.release, dps: [] }); }
    grupos[idx[k]].dps.push(d);
  });
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
    <div class="titulo-vista"><h1>DPs</h1><p>${plural(lista.length, "DP", "DPs")} en ${plural(grupos.length, "subida", "subidas")}. Cada release es una subida.</p></div>
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="DP, release, feature o componente" value=${filtros.q} onInput=${(e) => setFiltros({ ...filtros, q: e.target.value })} /></label>
      <label class="interruptor"><input type="checkbox" checked=${soloReleases} onChange=${(e) => setSoloReleases(e.target.checked)} /> Solo los de releases</label>
      <span class="publicar-dps">
        <span class="tenue">${datos.nfq?.sesion ? `Se publican en ${datos.nfq.repo}` : "Inicia sesión en GitHub NFQ para publicarlos"}</span>
        <button class="btn btn-s" disabled=${publicando || !datos.nfq?.sesion || !sinPublicar} onClick=${publicar}>
          <${Icono} n=${publicando ? "actualizar" : "subir"} cls=${publicando ? "gira" : ""} /> ${sinPublicar ? `Publicar ${sinPublicar}` : "Todo publicado"}</button>
      </span>
    </div>
    ${!grupos.length ? html`<div class="vacio-mini">${(datos.dps || []).length ? "Ningún DP con estos filtros." : "Todavía no se ha detectado ningún DP en las Actions."}</div>` : ""}
    ${grupos.map((g) => html`<section class="grupo" key=${g.k}>
      <div class="grupo-cab">
        <span class="ico-release" aria-hidden="true"><${Icono} n=${g.release ? "paquete" : "rama"} /></span>
        <h2>${g.release ? html`Release <span class="mono">${g.release}</span>` : html`<span class="mono"><${Rama} nombre=${g.rama} /></span>`}
          <span class="tenue" style="font-weight:400">${corto(g.repo)}</span></h2>
        <span class="feats">${uniq(g.dps.flatMap((d) => d.features)).map((f) => html`<${ChipFeature} key=${f} f=${f} alias=${alias} />`)}</span>
        <div class="acc"><button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo: g.repo, sub: "codigo", ref: g.rama })}><${Icono} n="repo" /> Ver la rama</button></div>
      </div>
      <ul class="lista-dps">${g.dps.map((d) => html`<li key=${d.cod}>
        <button class="cod-dp" onClick=${() => ir({ vista: "dp", repo: d.repo, cod: d.cod })}>${d.cod}</button>
        <span class="meta-dp"><span class=${d.conclusion === "success" ? "ico-ok" : "ico-mal"} title=${d.flujo || ""}><${Icono} n=${d.conclusion === "success" ? "ok" : "mal"} /></span>
          ${hace(d.fecha)} · <span class="mono">${(d.sha || "").slice(0, 7)}</span></span>
        <span class="comps-linea">${d.yaEnProduccion ? html`<span class="tenue">Ya estaba en producción al detectarlo</span>` : html`<b>${plural(d.componentes.length, "componente", "componentes")}</b>
          <span class="num tenue">(<span class="c-mas">+${d.mas}</span> <span class="c-menos">−${d.menos}</span> en ${plural(d.nFich, "fichero", "ficheros")})</span>
          <${Componentes} comps=${d.componentes} />`}</span>
        <${EstadoPublicado} d=${d} nfq=${datos.nfq} />
      </li>`)}</ul>
    </section>`)}
  </div>`;
}

export function VistaDP({ repo, cod, volver, ir, estado }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [dif, setDif] = useState(null);
  const [errDif, setErrDif] = useState(null);
  const [foco, setFoco] = useState(null);
  const [verCommits, setVerCommits] = useState(false);
  const refMods = useRef(null);
  useEffect(() => {
    api(`dp?repo=${encodeURIComponent(repo)}&cod=${encodeURIComponent(cod)}`).then(setD, (e) => setErr(e.message));
    api(`dp/diff?repo=${encodeURIComponent(repo)}&cod=${encodeURIComponent(cod)}`).then(setDif, (e) => setErrDif(e.message));
  }, [repo, cod]);
  if (!d) return html`<div><div class="contenido" style="padding-bottom:0"><${Volver} volver=${volver} /></div><${Cargando} err=${err} texto="Cargando el DP…" /></div>`;
  const alias = Object.fromEntries(estado.proyectos.map((p) => [p.feature, p.nombre]));
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

    <section class="caja" aria-labelledby="dp-comp" style="margin-bottom:16px">
      <h2 id="dp-comp">Componentes <span class="chip">${d.componentes.length}</span></h2>
      ${d.componentes.length ? html`<div style="overflow-x:auto"><table class="tabla tabla-comp-dp">
        <thead><tr><th scope="col">Componente</th><th scope="col">Tipo</th><th scope="col">Subida</th><th scope="col">Ficheros</th></tr></thead>
        <tbody>${d.componentes.map((c) => html`<tr key=${c.clave}>
          <td><b>${c.nombre}</b>${c.borrado ? html` <span class="chip chip-mal">se borra</span>` : ""}</td>
          <td>${c.tipo || html`<span class="chip chip-borde">sin regla</span>`}</td><td>${c.subida || "—"}</td>
          <td class="ficheros-comp">${c.ficheros.map((f) => html`<button class="lnk mono" key=${f} onClick=${() => irFichero(f)} title="Ver sus cambios">${f}</button>`)}</td>
        </tr>`)}</tbody></table></div>` : html`<p class="suave" style="margin:0">Sin componentes.</p>`}
      ${d.ignorados ? html`<p class="nota">${plural(d.ignorados, "fichero ignorado", "ficheros ignorados")} por las reglas de Ajustes.</p>` : ""}
    </section>

    <div ref=${refMods}>
      <h2 class="h-seccion">Modificaciones</h2>
      ${dif ? html`<${Diferencias} key=${foco || "x"} ficheros=${dif.ficheros} repo=${repo} despues=${d.sha} antes=${d.frenteSha} foco=${foco ? foco.split("#")[0] : null} />`
        : html`<${Cargando} err=${errDif} texto="Cargando las modificaciones…" />`}
    </div>
  </div>`;
}
