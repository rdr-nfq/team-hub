// Monitor de pases · repositorios como en la web de GitHub: código (árbol y
// ficheros en cualquier rama, etiqueta o commit), historial, pull requests con
// su conversación y comparar dos referencias.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, Icono, Markdown, hace, fLarga, corto, plural, colorDe } from "./comun.js";
import { Diferencias, Cargando, Volver } from "./diffs.js";

const ESTADO_PR = { abierta: "chip-pr", mergeada: "chip-merg", cerrada: "chip-borde" };
const enc = encodeURIComponent;

export function VistaRepos({ estado, ir }) {
  const porRepo = {};
  estado.ramas.forEach((r) => {
    const x = (porRepo[r.repo] ||= { feats: 0, releases: 0, abiertas: 0 });
    if (r.release) x.releases++;
    else if (!r.esBase) { x.feats++; if (!r.mergeada) x.abiertas++; }
  });
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>Repositorios</h1><p>${plural(estado.repos.length, "repositorio", "repositorios")} de GitHub BBVA</p></div>
    <div class="rejilla-repos">${estado.repos.map((r) => {
      const x = porRepo[r.nombre] || {};
      return html`<button class="tarjeta-repo" key=${r.nombre} onClick=${() => ir({ vista: "repo", repo: r.nombre, sub: "codigo" })}>
        <span class="t"><${Icono} n="repo" /> <b>${corto(r.nombre)}</b></span>
        <span class="tenue mono">${r.nombre}</span>
        <span class="cifras-repo">${plural(x.abiertas || 0, "rama abierta", "ramas abiertas")} · ${plural(x.releases || 0, "release", "releases")}
          ${r.base ? html` · producción: <span class="mono">${r.base}</span>` : ""}</span>
        ${r.empujado ? html`<span class="tenue">Último cambio ${hace(r.empujado)}</span>` : ""}
        ${r.error ? html`<span class="chip chip-mal">${r.error.mensaje}</span>` : ""}
      </button>`;
    })}</div>
  </div>`;
}

function SelectorRef({ refs, valor, onCambio, etiqueta = "Rama o etiqueta" }) {
  if (!refs) return html`<span class="tenue">Cargando ramas…</span>`;
  const conocida = refs.ramas.some((r) => r.nombre === valor) || refs.etiquetas.some((t) => t.nombre === valor);
  return html`<label class="sel-ref"><span class="sr">${etiqueta}</span><${Icono} n="rama" />
    <select class="inp mono" value=${valor} onChange=${(e) => onCambio(e.target.value)}>
      ${!conocida ? html`<option value=${valor}>${valor.length === 40 ? valor.slice(0, 7) : valor}</option>` : ""}
      <optgroup label="Ramas">${refs.ramas.map((r) => html`<option value=${r.nombre} key=${r.nombre}>${r.nombre}</option>`)}</optgroup>
      ${refs.etiquetas.length ? html`<optgroup label="Etiquetas">${refs.etiquetas.map((t) => html`<option value=${t.nombre} key=${"t" + t.nombre}>${t.nombre}</option>`)}</optgroup>` : ""}
    </select></label>`;
}

/* ── Código ── */
function construirArbol(entradas) {
  const hijos = { "": [] };
  for (const e of entradas) {
    const i = e.p.lastIndexOf("/");
    const padre = i < 0 ? "" : e.p.slice(0, i);
    (hijos[padre] ||= []).push(e);
    if (e.t === "d") hijos[e.p] ||= [];
  }
  for (const k in hijos) hijos[k].sort((a, b) => (a.t === "d") !== (b.t === "d") ? (a.t === "d" ? -1 : 1) : a.p.localeCompare(b.p));
  return hijos;
}
const nombre = (p) => p.slice(p.lastIndexOf("/") + 1);

function Arbol({ hijos, ruta, abiertos, alternar, abrir }) {
  const nivel = (dir, prof) => (hijos[dir] || []).map((e) => html`<li key=${e.p}>
    <button class="nodo ${e.p === ruta ? "actual" : ""}" style=${{ paddingLeft: 8 + prof * 14 + "px" }}
      aria-expanded=${e.t === "d" ? abiertos.has(e.p) : undefined}
      onClick=${() => (e.t === "d" ? alternar(e.p) : abrir(e.p))}>
      <${Icono} n=${e.t === "d" ? (abiertos.has(e.p) ? "carpetaAbierta" : "carpeta") : "fichero"} /> <span>${nombre(e.p)}</span></button>
    ${e.t === "d" && abiertos.has(e.p) ? html`<ul>${nivel(e.p, prof + 1)}</ul>` : ""}
  </li>`);
  return html`<ul class="arbol">${nivel("", 0)}</ul>`;
}

function Codigo({ repo, refs, refName, ruta, ir }) {
  const [arbol, setArbol] = useState(null);
  const [err, setErr] = useState(null);
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [buscar, setBuscar] = useState("");
  const [fich, setFich] = useState(null);
  const buscador = useRef(null);
  useEffect(() => { setArbol(null); setErr(null); api(`repo/arbol?repo=${enc(repo)}&ref=${enc(refName)}`).then(setArbol, (e) => setErr(e.message)); }, [repo, refName]);
  const hijos = useMemo(() => (arbol ? construirArbol(arbol.entradas) : {}), [arbol]);
  const tipo = arbol && ruta ? (arbol.entradas.find((e) => e.p === ruta) || {}).t : "d";
  useEffect(() => {  // abre las carpetas hasta la ruta actual
    if (!ruta) return;
    const partes = ruta.split("/");
    setAbiertos((a) => { const n = new Set(a); for (let i = 1; i <= partes.length; i++) n.add(partes.slice(0, i).join("/")); return n; });
  }, [ruta]);
  useEffect(() => {
    setFich(null);
    if (arbol && ruta && tipo === "f") api(`fichero?repo=${enc(repo)}&ref=${arbol.sha}&ruta=${enc(ruta)}`).then(setFich, (e) => setFich({ error: e.message }));
  }, [arbol, ruta, tipo]);
  useEffect(() => {  // «t» abre el buscador de ficheros, como en GitHub
    const f = (e) => { if (e.key === "t" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); buscador.current?.focus(); } };
    document.addEventListener("keydown", f);
    return () => document.removeEventListener("keydown", f);
  }, []);
  if (!arbol) return html`<${Cargando} err=${err} texto="Cargando los ficheros…" />`;
  const abrir = (p) => { setBuscar(""); ir({ vista: "repo", repo, sub: "codigo", ref: refName, ruta: p }); };
  const encontrados = buscar.trim() ? arbol.entradas.filter((e) => e.t === "f" && e.p.toLowerCase().includes(buscar.trim().toLowerCase())).slice(0, 60) : [];
  const dir = tipo === "d" ? ruta || "" : ruta.slice(0, Math.max(0, ruta.lastIndexOf("/")));
  const readme = (hijos[dir] || []).find((e) => e.t === "f" && /^readme(\.md)?$/i.test(nombre(e.p)));
  const migas = (ruta || "").split("/").filter(Boolean);
  const urlGit = refs?.url ? `${refs.url}/${tipo === "f" ? "blob" : "tree"}/${enc(refName)}/${ruta || ""}` : null;
  return html`<div class="nav-codigo">
    <aside class="panel-arbol">
      <label class="buscar"><span class="sr">Ir a un fichero</span><${Icono} n="buscar" />
        <input ref=${buscador} class="inp" type="search" placeholder="Ir a fichero (t)" value=${buscar} onInput=${(e) => setBuscar(e.target.value)}
          onKeyDown=${(e) => { if (e.key === "Enter" && encontrados[0]) abrir(encontrados[0].p); }} /></label>
      ${buscar.trim() ? html`<ul class="encontrados">${encontrados.map((e) => html`<li key=${e.p}><button onClick=${() => abrir(e.p)}>
          <b>${nombre(e.p)}</b><span class="mono tenue">${e.p}</span></button></li>`)}
          ${!encontrados.length ? html`<li class="tenue" style="padding:8px">Ningún fichero.</li>` : ""}</ul>`
        : html`<${Arbol} hijos=${hijos} ruta=${ruta} abiertos=${abiertos} abrir=${abrir}
            alternar=${(p) => setAbiertos((a) => { const n = new Set(a); n.has(p) ? n.delete(p) : n.add(p); return n; })} />`}
      ${arbol.truncado ? html`<p class="nota">El repositorio es muy grande: GitHub no ha devuelto todos los ficheros.</p>` : ""}
    </aside>
    <div class="panel-fichero">
      <div class="migas">
        <button class="lnk" onClick=${() => abrir("")}><b>${corto(repo)}</b></button>
        ${migas.map((m, i) => html`<span key=${i}> / ${i === migas.length - 1 ? html`<b>${m}</b>` : html`<button class="lnk" onClick=${() => abrir(migas.slice(0, i + 1).join("/"))}>${m}</button>`}</span>`)}
        <span class="acc">
          ${ruta ? html`<button class="btn btn-s" onClick=${() => ir({ vista: "repo", repo, sub: "commits", ref: refName, ruta })}><${Icono} n="historial" /> Historial</button>` : ""}
          ${urlGit ? html`<a class="btn btn-s" href=${urlGit} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> GitHub</a>` : ""}
        </span>
      </div>
      ${tipo === "f" ? (!fich ? html`<p class="suave">Cargando…</p>` : fich.error ? html`<p class="nota">${fich.error}</p>`
          : fich.binario ? html`<p class="nota">Fichero binario (${Math.round(fich.tamano / 1024)} KB).</p>`
          : !fich.existe ? html`<p class="nota">El fichero no existe en esta referencia.</p>`
          : html`<div class="df"><div class="df-cab"><span class="mono">${plural(fich.texto.replace(/\n$/, "").split("\n").length, "línea", "líneas")}</span>
              <span class="tenue">· ${Math.max(1, Math.round(fich.tamano / 1024))} KB · <span class="mono">${arbol.sha.slice(0, 7)}</span></span></div>
              <div class="df-cuerpo"><table class="diff"><tbody>${fich.texto.replace(/\n$/, "").split("\n").map((l, i) => html`<tr key=${i}><td class="ln">${i + 1}</td><td class="cd">${l}</td></tr>`)}</tbody></table></div></div>`)
        : html`<div class="df"><table class="tabla lista-dir"><tbody>
            ${dir ? html`<tr class="fila" onClick=${() => abrir(dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "")}><td colspan="2"><${Icono} n="carpeta" /> ..</td></tr>` : ""}
            ${(hijos[dir] || []).map((e) => html`<tr class="fila" key=${e.p} onClick=${() => (e.t === "d" ? abrir(e.p) : abrir(e.p))}>
              <td><${Icono} n=${e.t === "d" ? "carpeta" : "fichero"} /> ${nombre(e.p)}</td><td class="tenue num" style="text-align:right">${e.t === "f" && e.s != null ? `${Math.max(1, Math.round(e.s / 1024))} KB` : ""}</td></tr>`)}
          </tbody></table></div>
          ${readme ? html`<${Readme} repo=${repo} sha=${arbol.sha} ruta=${readme.p} />` : ""}`}
    </div>
  </div>`;
}

function Readme({ repo, sha, ruta }) {
  const [t, setT] = useState(null);
  useEffect(() => { api(`fichero?repo=${enc(repo)}&ref=${sha}&ruta=${enc(ruta)}`).then((f) => setT(f.texto || ""), () => setT("")); }, [ruta, sha]);
  return t ? html`<div class="df readme"><div class="df-cab"><${Icono} n="fichero" /> <b>${nombre(ruta)}</b></div><div class="readme-cuerpo"><${Markdown} texto=${t} /></div></div>` : null;
}

/* ── Historial ── */
function Historial({ repo, refName, ruta, ir }) {
  const [paginas, setPaginas] = useState([]);
  const [err, setErr] = useState(null);
  const [cargando, setCargando] = useState(false);
  const cargar = (n) => {
    setCargando(true);
    api(`repo/historial?repo=${enc(repo)}&ref=${enc(refName)}&ruta=${enc(ruta || "")}&pagina=${n}`)
      .then((d) => setPaginas((p) => [...p.slice(0, n - 1), d]), (e) => setErr(e.message)).finally(() => setCargando(false));
  };
  useEffect(() => { setPaginas([]); cargar(1); }, [repo, refName, ruta]);
  const commits = paginas.flatMap((p) => p.commits);
  if (!paginas.length) return html`<${Cargando} err=${err} texto="Cargando el historial…" />`;
  return html`<div>
    ${ruta ? html`<p class="filtro-ruta">Solo los commits que tocan <span class="mono">${ruta}</span>
      <button class="btn btn-t btn-s" onClick=${() => ir({ vista: "repo", repo, sub: "commits", ref: refName })}>Quitar el filtro</button></p>` : ""}
    <div class="grupo"><table class="tabla tabla-commits"><tbody>${commits.map((c) => html`<tr class="fila" key=${c.sha} onClick=${() => ir({ vista: "commit", repo, sha: c.sha })}>
      <td class="c-msg"><button class="lnk" onClick=${(e) => { e.stopPropagation(); ir({ vista: "commit", repo, sha: c.sha }); }}>${c.mensaje}</button></td>
      <td class="c-autor">${c.autor}</td><td class="c-autor" title=${fLarga(c.fecha)}>${hace(c.fecha)}</td><td class="c-sha mono tenue">${c.sha.slice(0, 7)}</td>
    </tr>`)}</tbody></table></div>
    ${paginas[paginas.length - 1].hayMas ? html`<button class="btn" disabled=${cargando} onClick=${() => cargar(paginas.length + 1)}>${cargando ? "Cargando…" : "Commits más antiguos"}</button>` : ""}
  </div>`;
}

/* ── Pull requests ── */
function ListaPRs({ repo, ir }) {
  const [estadoPR, setEstadoPR] = useState("open");
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { setD(null); api(`repo/prs?repo=${enc(repo)}&estado=${estadoPR}`).then(setD, (e) => setErr(e.message)); }, [repo, estadoPR]);
  return html`<div>
    <div class="segmento" role="group" aria-label="Estado" style="margin:0 0 12px">
      ${[["open", "Abiertas"], ["closed", "Cerradas"], ["all", "Todas"]].map(([k, t]) => html`<button key=${k} aria-pressed=${estadoPR === k} onClick=${() => setEstadoPR(k)}>${t}</button>`)}
    </div>
    ${!d ? html`<${Cargando} err=${err} />` : !d.prs.length ? html`<div class="vacio-mini">No hay pull requests.</div>`
      : html`<div class="grupo"><ul class="lista-prs">${d.prs.map((p) => html`<li key=${p.numero}><button onClick=${() => ir({ vista: "pr", repo, n: p.numero })}>
          <span class="t"><${Icono} n="pr" /> <b>${p.titulo}</b> <span class="chip ${ESTADO_PR[p.estado]}">${p.estado}${p.borrador ? " · borrador" : ""}</span></span>
          <span class="tenue">#${p.numero} · ${p.autor} · <span class="mono">${p.origen}</span> → <span class="mono">${p.destino}</span> · actualizada ${hace(p.actualizada)}</span>
        </button></li>`)}</ul></div>`}
  </div>`;
}

export function VistaPR({ repo, n, volver, ir, estado }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [pest, setPest] = useState("conversacion");
  useEffect(() => { setD(null); api(`repo/pr?repo=${enc(repo)}&n=${n}`).then(setD, (e) => setErr(e.message)); }, [repo, n]);
  if (!d) return html`<div><div class="contenido" style="padding-bottom:0"><${Volver} volver=${volver} /></div><${Cargando} err=${err} texto="Cargando el pull request…" /></div>`;
  const rid = `${repo}:${d.origen}`;
  const conocida = estado.ramas.some((r) => r.id === rid);
  return html`<div class="contenido">
    <${Volver} volver=${volver} />
    <header class="cab-commit">
      <p class="eyebrow">${corto(repo)} · pull request #${d.numero}</p>
      <h1>${d.titulo}</h1>
      <div class="meta-commit">
        <span class="chip ${ESTADO_PR[d.estado]}">${d.estado}${d.borrador ? " · borrador" : ""}</span>
        <span><b>${d.autor}</b> quiere mezclar ${plural(d.nCommits || 0, "commit", "commits")} de <span class="mono">${d.origen}</span> en <span class="mono">${d.destino}</span></span>
        <span class="num"><span class="c-mas">+${d.mas || 0}</span> <span class="c-menos">−${d.menos || 0}</span></span>
        ${d.mergeada ? html`<span class="tenue">Mezclada ${hace(d.mergeada)}${d.mergeadaPor ? ` por ${d.mergeadaPor}` : ""}</span>` : ""}
        ${d.url ? html`<a class="btn btn-s" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> GitHub</a>` : ""}
        ${conocida ? html`<button class="btn btn-s" onClick=${() => ir({ vista: "copilot", contexto: { tipo: "rama", id: rid } })}><${Icono} n="chispa" /> Preguntar a Copilot</button>` : ""}
      </div>
    </header>
    <nav class="subpestanas" aria-label="Partes del pull request">
      ${[["conversacion", "Conversación", d.hilo.length + 1], ["commits", "Commits", d.commits.length], ["ficheros", "Ficheros", d.ficheros.length]].map(([k, t, c]) => html`
        <button key=${k} aria-current=${pest === k ? "page" : undefined} onClick=${() => setPest(k)}>${t} <span class="chip">${c}</span></button>`)}
    </nav>
    ${pest === "conversacion" ? html`<ol class="hilo">
        <li class="mensaje"><div class="cab-msg"><b>${d.autor}</b> <span class="tenue">abrió el pull request ${hace(d.creada)}</span></div>
          <div class="cuerpo-msg">${d.cuerpo ? html`<${Markdown} texto=${d.cuerpo} />` : html`<span class="tenue">Sin descripción.</span>`}</div></li>
        ${d.hilo.map((m, i) => html`<li class="mensaje ${m.tipo}" key=${i}>
          <div class="cab-msg"><b>${m.autor}</b> <span class="tenue">${m.tipo === "revision" ? (m.estado === "APPROVED" ? "aprobó los cambios" : m.estado === "CHANGES_REQUESTED" ? "pidió cambios" : "revisó")
            : m.tipo === "codigo" ? "comentó en el código" : "comentó"} ${hace(m.fecha)}</span>
            ${m.tipo === "revision" && m.estado === "APPROVED" ? html`<span class="chip chip-ok">Aprobado</span>` : ""}
            ${m.tipo === "revision" && m.estado === "CHANGES_REQUESTED" ? html`<span class="chip chip-mal">Cambios pedidos</span>` : ""}</div>
          ${m.tipo === "codigo" ? html`<div class="frag"><div class="mono tenue">${m.ruta}${m.linea ? `:${m.linea}` : ""}</div><pre>${m.fragmento}</pre></div>` : ""}
          ${m.texto ? html`<div class="cuerpo-msg"><${Markdown} texto=${m.texto} /></div>` : ""}
        </li>`)}
      </ol>`
    : pest === "commits" ? html`<div class="grupo"><table class="tabla tabla-commits"><tbody>${d.commits.map((c) => html`<tr class="fila" key=${c.sha} onClick=${() => ir({ vista: "commit", repo, sha: c.sha })}>
        <td class="c-msg"><button class="lnk" onClick=${(e) => { e.stopPropagation(); ir({ vista: "commit", repo, sha: c.sha }); }}>${c.mensaje}</button></td>
        <td class="c-autor">${c.autor}</td><td class="c-autor">${hace(c.fecha)}</td><td class="c-sha mono tenue">${c.sha.slice(0, 7)}</td></tr>`)}</tbody></table></div>`
    : html`<${Diferencias} ficheros=${d.ficheros} repo=${repo} despues=${d.origenSha} antes=${d.destinoSha} />`}
  </div>`;
}

/* ── Comparar ── */
function Comparar({ repo, refs, base0, head0 }) {
  const [base, setBase] = useState(base0);
  const [head, setHead] = useState(head0);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const comparar = () => { setD(null); setErr(null); api(`repo/comparar?repo=${enc(repo)}&base=${enc(base)}&head=${enc(head)}`).then(setD, (e) => setErr(e.message)); };
  useEffect(() => { if (base && head && base !== head) comparar(); }, []);
  return html`<div>
    <div class="barra-comparar">
      <${SelectorRef} refs=${refs} valor=${base} onCambio=${setBase} etiqueta="Base" />
      <span aria-hidden="true">←</span>
      <${SelectorRef} refs=${refs} valor=${head} onCambio=${setHead} etiqueta="Con los cambios de" />
      <button class="btn btn-pri" disabled=${!base || !head || base === head} onClick=${comparar}>Comparar</button>
    </div>
    ${err ? html`<p class="nota" role="alert">${err}</p>` : ""}
    ${d ? html`<p class="suave">${plural(d.ahead, "commit", "commits")} de <span class="mono">${d.head}</span> que no están en <span class="mono">${d.base}</span>${d.behind ? `; le faltan ${d.behind}` : ""}.</p>
      <${Diferencias} ficheros=${d.ficheros} repo=${repo} despues=${d.sha} antes=${d.baseSha} />` : ""}
  </div>`;
}

/* ── Un repositorio ── */
export function VistaRepo({ repo, sub = "codigo", refName, ruta, ir, volver }) {
  const [refs, setRefs] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`repo/refs?repo=${enc(repo)}`).then(setRefs, (e) => setErr(e.message)); }, [repo]);
  if (!refs) return html`<${Cargando} err=${err} texto="Abriendo el repositorio…" />`;
  const ref = refName || refs.base || refs.porDefecto || (refs.ramas[0] || {}).nombre;
  const ir2 = (cambio) => ir({ vista: "repo", repo, sub, ref, ...cambio });
  return html`<div class="contenido">
    <div class="cab-repo">
      <button class="btn btn-t btn-s" onClick=${() => ir({ vista: "repos" })}><${Icono} n="atras" /> Repositorios</button>
      <h1><${Icono} n="repo" /> <span class="tenue">${repo.split("/")[0]} /</span> ${corto(repo)}</h1>
      ${sub !== "prs" && sub !== "comparar" ? html`<${SelectorRef} refs=${refs} valor=${ref} onCambio=${(v) => ir2({ ref: v, ruta: sub === "commits" ? ruta : "" })} />` : ""}
    </div>
    <nav class="subpestanas" aria-label="Partes del repositorio">
      ${[["codigo", "Código", "fichero"], ["commits", "Commits", "commit"], ["prs", "Pull requests", "pr"], ["comparar", "Comparar", "columnas"]].map(([k, t, i]) => html`
        <button key=${k} aria-current=${sub === k ? "page" : undefined} onClick=${() => ir({ vista: "repo", repo, sub: k, ref })}><${Icono} n=${i} /> ${t}</button>`)}
    </nav>
    ${sub === "codigo" ? html`<${Codigo} key=${ref} repo=${repo} refs=${refs} refName=${ref} ruta=${ruta || ""} ir=${ir} />`
      : sub === "commits" ? html`<${Historial} repo=${repo} refName=${ref} ruta=${ruta} ir=${ir} />`
      : sub === "prs" ? html`<${ListaPRs} repo=${repo} ir=${ir} />`
      : html`<${Comparar} repo=${repo} refs=${refs} base0=${refs.base || ref} head0=${ref !== refs.base ? ref : ""} />`}
  </div>`;
}
