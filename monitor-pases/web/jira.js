// Monitor de pases · Jira integrado con GitHub: proyectos (features) con su
// SDATOOL y sus historias, releases del proyecto (RDR) con las historias de
// Jira frente a las de los commits, conexión y diagnóstico.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, ChipJira, Icono, colorDe, corto, fCorta, hace, historiasEn, issueJira, plural, uniq, urlJira } from "./comun.js";
import { Volver } from "./diffs.js";

/* ── Qué historias cita GitHub y dónde ── */
export function historiasEnGitHub(estado) {
  const out = {};  // clave -> { commits, repos:Set, ramas:Set(id), releases:Set }
  for (const r of estado.ramas) {
    if (r.esBase) continue;
    for (const c of r.commits || []) {
      for (const k of historiasEn(c.mensaje)) {
        const x = (out[k] ||= { commits: new Set(), repos: new Set(), ramas: new Set(), releases: new Set() });
        x.commits.add(r.repo + c.sha);
        x.repos.add(r.repo);
        x.ramas.add(r.id);
        if (r.release) x.releases.add(r.release);
      }
    }
  }
  return out;
}

function Progreso({ ids }) {
  const xs = ids.map((k) => issueJira(k)).filter(Boolean);
  if (!xs.length) return html`<span class="tenue">—</span>`;
  const n = (c) => xs.filter((x) => x.c === c).length;
  const hechas = n("done"), curso = n("indeterminate");
  return html`<span class="progreso-jira" title=${`${hechas} hechas · ${curso} en curso · ${xs.length - hechas - curso} pendientes`}>
    <span class="barra-jira" aria-hidden="true"><span class="b-done" style=${{ width: (100 * hechas) / xs.length + "%" }} />
      <span class="b-curso" style=${{ width: (100 * curso) / xs.length + "%" }} /></span>
    <span class="num">${hechas}/${xs.length}</span></span>`;
}

function Sdatool({ f }) {
  if (!f) return html`<span class="tenue">—</span>`;
  if (!f.sd?.length) return html`<span class="chip chip-borde" title="No se ha encontrado ningún SDATOOL en la feature (enlaces, campos, enlaces remotos ni descripción)">sin SDATOOL</span>`;
  return html`<span class="sdatools">${f.sd.map((k) => html`<a key=${k} class="chip chip-sdatool" href=${urlJira(k)} target="_blank" rel="noopener noreferrer"
    title=${"Encontrado en: " + (f.sdDonde || "")} onClick=${(e) => e.stopPropagation()}>${k}</a>`)}</span>`;
}

/* ── Conectar Jira (entrada y Ajustes) ── */
export function ConectarJira({ estado, jira, recargar, aviso, compacto }) {
  // La más reciente: la de /api/jira se vuelve a pedir justo al conectar; la del estado general, cada 30 s.
  const ses = [jira?.sesion, estado?.sesion?.jira].find((x) => x?.estado === "iniciada") || jira?.sesion || estado?.sesion?.jira || {};
  const url = jira?.url || "";
  const [token, setToken] = useState("");
  const [conUsuario, setConUsuario] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  if (!url) return html`<p class="suave" style="margin:0">Pon la dirección de Jira en Ajustes → Jira.</p>`;
  const conectar = async (e) => {
    e.preventDefault();
    setOcupado(true); setError(null);
    try {
      await api("jira/conectar", conUsuario ? { usuario, clave } : { token });
      setToken(""); setClave("");
      aviso?.("Jira conectado. Leyendo historias, features y releases…");
      recargar?.();
    } catch (err) { setError(err.message + (err.pista ? " " + err.pista : "")); } finally { setOcupado(false); }
  };
  const desconectar = async () => { try { await api("jira/cerrar", {}); recargar?.(); } catch (err) { aviso?.(err.message, "mal"); } };
  if (ses.estado === "iniciada")
    return html`<div class="fila-sesion ok">
      <span class="ico-sesion" aria-hidden="true"><${Icono} n="ok" /></span>
      <div class="t"><b>Jira</b> <span class="mono tenue">${new URL(url).host}</span>
        <span>Conectado como <b>${ses.nombre || ses.usuario}</b> (${ses.metodo === "token" ? "token personal" : "usuario y contraseña"})${ses.guardada === false ? " · no se ha podido guardar en Git: habrá que conectarlo en cada arranque" : ""}</span></div>
      ${!compacto && html`<button class="btn btn-s" onClick=${desconectar}>Desconectar</button>`}
    </div>`;
  return html`<div class="fila-sesion jira-conectar">
    <span class="ico-sesion" aria-hidden="true"><${Icono} n="candado" /></span>
    <div class="t">
      <b>Jira</b> <span class="mono tenue">${new URL(url).host}</span> ${compacto ? html`<span class="chip chip-borde">opcional</span>` : ""}
      <span>Para ver las historias de cada commit, las features con su SDATOOL y las releases.</span>
      ${ses.aviso ? html`<span class="error-sesion">${ses.aviso}</span>` : ""}
      <form class="form-jira" onSubmit=${conectar}>
        ${conUsuario ? html`
          <label class="sr" for="j-usu">Usuario de Jira</label><input id="j-usu" class="inp" autocomplete="username" placeholder="Usuario" value=${usuario} onInput=${(e) => setUsuario(e.target.value)} />
          <label class="sr" for="j-cla">Contraseña de Jira</label><input id="j-cla" class="inp" type="password" autocomplete="current-password" placeholder="Contraseña" value=${clave} onInput=${(e) => setClave(e.target.value)} />`
        : html`<div class="guia-token">
            <p class="que-token">Hace falta un <b>token</b>: una contraseña especial que te da Jira para que esta app pueda <b>leer</b> Jira por ti.
              Se crea una sola vez y se tarda un par de minutos.</p>
            <ol class="pasos-jira">
              <li><span><b>Abre tu perfil de Jira.</b> Si te pide entrar, hazlo con tu usuario de BBVA, como siempre.</span>
                <a class="btn btn-s" href=${url + (jira?.pats || "")} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Abrir Jira</a></li>
              <li><span>Entra en la pestaña <b>«Tokens de acceso personal»</b> <span class="tenue">(Personal Access Tokens)</span>. Si no la ves: arriba a la derecha, tu foto → <b>Perfil</b> → <b>Tokens de acceso personal</b>.</span></li>
              <li><span>Pulsa <b>«Crear token»</b>. Como nombre pon <b>Monitor de pases</b>; en caducidad, la más larga que te deje. Pulsa <b>«Crear»</b>.</span></li>
              <li><span>Jira enseña el token <b>una sola vez</b>: pulsa <b>«Copiar»</b> (o selecciónalo y <kbd>Ctrl</kbd>+<kbd>C</kbd>).</span></li>
              <li><span>Pégalo aquí y pulsa <b>Conectar</b>:</span>
                <label class="sr" for="j-tok">Token de Jira</label><input id="j-tok" class="inp mono" type="password" autocomplete="off" placeholder="Pega aquí el token" value=${token} onInput=${(e) => setToken(e.target.value)} /></li>
            </ol>
            <details class="dudas-token"><summary>Dudas frecuentes</summary>
              <ul>
                <li><b>¿Qué hace la app con él?</b> Solo leer historias, features y releases. Se guarda en el almacén de credenciales de Windows (como las sesiones de Git) y no sale de tu equipo.</li>
                <li><b>¿Y cuando caduque?</b> La app te avisará y te pedirá uno nuevo: repite estos pasos.</li>
                <li><b>No aparece «Tokens de acceso personal».</b> Vuestro Jira puede tenerlos desactivados: usa <b>«Prefiero usuario y contraseña»</b>.</li>
                <li><b>Dice que el token no vale.</b> Comprueba que lo has copiado entero, sin espacios, o crea otro.</li>
                <li><b>Si dejas de usar la app</b>, puedes borrarlo en esa misma página de Jira (Revocar).</li>
              </ul></details>
          </div>`}
        <div class="acc-jira">
          <button class="btn btn-pri btn-s" type="submit" disabled=${ocupado || (conUsuario ? !(usuario && clave) : !token.trim())}>${ocupado ? "Conectando…" : "Conectar"}</button>
          <button class="btn btn-t btn-s" type="button" onClick=${() => { setConUsuario(!conUsuario); setError(null); }}>${conUsuario ? "Usar un token (recomendado)" : "Prefiero usuario y contraseña"}</button>
        </div>
      </form>
      ${error && html`<span class="error-sesion" role="alert">${error}</span>`}
      <span class="tenue" style="font-size:12px">Se guarda como las sesiones de Git (almacén de credenciales de Windows): solo se pide una vez. Nada de Jira sale de la VDI.</span>
    </div>
  </div>`;
}

/* ── Proyectos ── */
export function VistaProyectos({ estado, jira, ir, preparar, recargarJira, aviso }) {
  const [sub, setSub] = useState("proyectos");
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>${sub === "proyectos" ? "Proyectos" : "Releases"}</h1>
      <div class="segmento" role="group" aria-label="Ver">
        <button aria-pressed=${sub === "proyectos"} onClick=${() => setSub("proyectos")}>Proyectos (features)</button>
        <button aria-pressed=${sub === "releases"} onClick=${() => setSub("releases")}>Releases${jira?.proyectoReleases ? " de " + jira.proyectoReleases : ""}</button>
      </div>
      ${jira?.sincro?.enCurso ? html`<span class="tenue"><${Icono} n="actualizar" cls="gira" /> Leyendo Jira…</span>` : jira?.sincro?.fin ? html`<span class="tenue" title="Última lectura de Jira">Jira: ${hace(jira.sincro.fin)}</span>` : ""}
    </div>
    ${jira?.sesion?.estado !== "iniciada" ? html`<section class="caja" style="margin-bottom:16px"><${ConectarJira} estado=${estado} jira=${jira} recargar=${recargarJira} aviso=${aviso} /></section>` : ""}
    ${jira?.sincro?.estado === "error" ? html`<p class="nota" role="alert">No se ha podido leer Jira: ${jira.sincro.error?.mensaje}${jira.sincro.error?.pista ? " " + jira.sincro.error.pista : ""}</p>` : ""}
    ${sub === "proyectos" ? html`<${ListaProyectos} estado=${estado} jira=${jira} ir=${ir} preparar=${preparar} />` : html`<${ListaReleases} estado=${estado} jira=${jira} />`}
  </div>`;
}

function ListaProyectos({ estado, jira, ir, preparar }) {
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [sinSd, setSinSd] = useState(false);
  const filas = useMemo(() => {
    const gh = Object.fromEntries(estado.proyectos.filter((p) => p.feature).map((p) => [p.feature, p]));
    const claves = uniq([...Object.keys(gh), ...Object.keys(jira?.features || {})]);
    return claves.map((k) => ({ k, gh: gh[k], f: jira?.features?.[k] })).sort((a, b) =>
      (b.gh?.ultima || "").localeCompare(a.gh?.ultima || "") || a.k.localeCompare(b.k, "es", { numeric: true }));
  }, [estado, jira]);
  const pq = q.trim().toLowerCase();
  const visibles = filas.filter((x) => (todos || x.gh?.abiertas) && (!sinSd || (x.f && !x.f.sd?.length)) &&
    (!pq || [x.k, x.f?.s, x.gh?.nombre, ...(x.f?.sd || []), ...(x.gh?.repos || [])].join(" ").toLowerCase().includes(pq)));
  return html`<div>
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar proyecto</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="Código, nombre, SDATOOL o repositorio" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
      <label class="interruptor"><input type="checkbox" checked=${todos} onChange=${(e) => setTodos(e.target.checked)} /> También sin ramas abiertas</label>
      <label class="interruptor"><input type="checkbox" checked=${sinSd} onChange=${(e) => setSinSd(e.target.checked)} /> Solo sin SDATOOL</label>
      <span class="tenue">${plural(visibles.length, "proyecto", "proyectos")}</span>
    </div>
    ${visibles.length ? html`<div class="grupo"><div style="overflow-x:auto"><table class="tabla tabla-proyectos">
      <thead><tr><th scope="col">Proyecto</th><th scope="col">Estado en Jira</th><th scope="col">SDATOOL</th><th scope="col">Historias hechas</th>
        <th scope="col" class="c-num">Ramas abiertas</th><th scope="col" class="c-num">Repos</th><th scope="col" class="c-num">DPs</th><th scope="col">Último cambio</th></tr></thead>
      <tbody>${visibles.map(({ k, gh, f }) => html`<tr class="fila" key=${k} onClick=${() => ir({ vista: "proyecto", feature: k })}>
        <td class="c-proy"><span class="barra-proy" style=${{ background: colorDe(k) }} />
          <span><button class="lnk mono" onClick=${(e) => { e.stopPropagation(); ir({ vista: "proyecto", feature: k }); }}><b>${k}</b></button>
          <span class="nombre-proy">${f?.s || gh?.nombre || html`<span class="tenue">Sin nombre</span>`}</span></span></td>
        <td>${f ? html`<span class=${"chip-jira cat-" + f.c}><span class="punto-cat" />${f.e}</span>` : html`<span class="tenue">—</span>`}</td>
        <td><${Sdatool} f=${f} /></td>
        <td><${Progreso} ids=${f?.h || []} /></td>
        <td class="c-num num">${gh?.abiertas || html`<span class="tenue">0</span>`}</td>
        <td class="c-num num">${gh?.repos?.length || html`<span class="tenue">0</span>`}</td>
        <td class="c-num num">${gh?.dps || html`<span class="tenue">0</span>`}</td>
        <td class="tenue">${gh?.ultima ? hace(gh.ultima) : "—"}</td>
      </tr>`)}</tbody></table></div></div>` : html`<div class="vacio-mini">${filas.length ? "Ningún proyecto con estos filtros." : "Todavía no hay proyectos: aparecen con las ramas de GitHub y las features de Jira."}</div>`}
  </div>`;
}

export function VistaProyecto({ feature, estado, jira, ir, volver, preparar, setF, f: filtros, setAbierta }) {
  const fj = jira?.features?.[feature];
  const gh = estado.proyectos.find((p) => p.feature === feature);
  const enGH = useMemo(() => historiasEnGitHub(estado), [estado, jira]);
  const ramas = estado.ramas.filter((r) => !r.esBase && ((r.feature || "") === feature || (r.release && (r.features || []).includes(feature))));
  const hijas = fj?.h || [];
  // Historias citadas en las ramas del proyecto que en Jira no cuelgan de esta feature.
  const citadas = uniq(ramas.filter((r) => !r.release).flatMap((r) => (r.commits || []).flatMap((c) => historiasEn(c.mensaje))));
  const sueltas = citadas.filter((k) => !hijas.includes(k));
  const filasHist = [...hijas, ...sueltas];
  const dps = uniq(ramas.flatMap((r) => r.dps.map((d) => r.repo + "|" + d.cod))).map((x) => x.split("|"));
  const xs = hijas.map((k) => issueJira(k)).filter(Boolean);
  return html`<div class="contenido">
    <${Volver} volver=${volver} />
    <header class="cab-proyecto">
      <p class="eyebrow"><span class="punto" style=${{ background: colorDe(feature) }} /> Proyecto · <span class="mono">${feature}</span>
        ${fj ? html` · <span class=${"chip-jira cat-" + fj.c}><span class="punto-cat" />${fj.e}</span>` : ""}</p>
      <h1>${fj?.s || gh?.nombre || feature}</h1>
      <div class="meta-commit">
        <${Sdatool} f=${fj} />
        ${urlJira(feature) ? html`<a class="btn btn-s" href=${urlJira(feature)} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Abrir en Jira</a>` : ""}
        <button class="btn btn-s" onClick=${() => { setF({ ...filtros, proyectos: [feature] }); ir({ vista: "ramas" }); }}><${Icono} n="rama" /> Ver sus ramas</button>
        ${gh ? html`<button class="btn btn-s" onClick=${() => preparar([feature])}>Preparar pase</button>` : ""}
      </div>
      <div class="datos datos-proy">
        <div class="dato"><b>${xs.length}</b><span>historias en Jira</span></div>
        <div class="dato"><b>${xs.filter((x) => x.c === "done").length}</b><span>hechas</span></div>
        <div class="dato"><b>${xs.filter((x) => x.c === "indeterminate").length}</b><span>en curso</span></div>
        <div class="dato"><b>${gh?.abiertas || 0}</b><span>ramas abiertas en ${plural(gh?.repos?.length || 0, "repo", "repos")}</span></div>
        <div class="dato"><b>${dps.length}</b><span>DPs</span></div>
      </div>
    </header>

    <section class="caja" aria-labelledby="pr-h" style="margin-bottom:16px">
      <h2 id="pr-h">Historias <span class="chip">${filasHist.length}</span></h2>
      ${!jira?.campos?.feature ? html`<p class="nota">No se ha encontrado en Jira el campo que une historias y features (Feature/Epic Link). Puedes indicarlo en Ajustes → Jira.</p>` : ""}
      ${filasHist.length ? html`<div style="overflow-x:auto"><table class="tabla tabla-historias">
        <thead><tr><th scope="col">Historia</th><th scope="col">Estado</th><th scope="col">Asignada</th><th scope="col">Release (tech-version)</th><th scope="col">En GitHub</th></tr></thead>
        <tbody>${filasHist.map((k) => {
          const x = issueJira(k), g = enGH[k];
          return html`<tr key=${k}>
            <td><${ChipJira} k=${k} /> <span class="tit-historia">${x?.s || ""}</span>${sueltas.includes(k) ? html` <span class="chip chip-borde" title="Se cita en los commits de las ramas del proyecto, pero en Jira no cuelga de esta feature">no cuelga de la feature</span>` : ""}</td>
            <td>${x ? html`<span class=${"chip-jira cat-" + x.c}><span class="punto-cat" />${x.e}</span>` : "—"}</td>
            <td class="tenue">${x?.a || "—"}</td>
            <td>${x?.tv ? html`<span class="mono">${x.tv}</span>` : html`<span class="tenue">—</span>`}</td>
            <td>${g ? html`<span title=${[...g.repos].join(", ")}>${plural(g.commits.size, "commit", "commits")} en ${[...g.repos].map(corto).join(", ")}</span>` : html`<span class="tenue">sin commits</span>`}</td>
          </tr>`;
        })}</tbody></table></div>` : html`<p class="suave" style="margin:0">${jira?.sesion?.estado === "iniciada" ? "Jira no tiene historias de esta feature." : "Conecta Jira para ver sus historias."}</p>`}
    </section>

    <section class="caja" aria-labelledby="pr-r">
      <h2 id="pr-r">Ramas y releases en GitHub <span class="chip">${ramas.length}</span></h2>
      ${ramas.length ? html`<ul class="lista">${ramas.map((r) => html`<li key=${r.id}>
        <span class="l1"><button class="lnk" onClick=${() => setAbierta(r.id)}><b>${corto(r.repo)}</b> <span class="mono">${r.rama}</span></button>
          ${r.mergeada ? html`<span class="chip chip-merg">ya en ${r.base}</span>` : r.ahead != null ? html`<span class="tenue">${plural(r.ahead, "commit", "commits")} fuera de producción</span>` : ""}
          ${r.dps.slice(0, 3).map((d) => html`<span class="dp" key=${d.cod}>${d.cod}</span>`)}</span>
        <span class="l2">${r.cabeza ? `${r.cabeza.autor} · ${hace(r.cabeza.fecha)}` : ""}</span></li>`)}</ul>`
        : html`<p class="suave" style="margin:0">Sin ramas en GitHub.</p>`}
    </section>
  </div>`;
}

/* ── Releases (RDR) ── */
function ListaReleases({ estado, jira }) {
  const [q, setQ] = useState("");
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [soloPend, setSoloPend] = useState(true);
  const ramasRel = useMemo(() => {
    const m = {};
    estado.ramas.filter((r) => r.release).forEach((r) => { (m[r.release] ||= []).push(r); });
    return m;
  }, [estado]);
  const rels = jira?.releases || [];
  const enJira = new Set(rels.map((v) => v.num).filter(Boolean));
  // Releases de GitHub que aún no existen en Jira (la rama se crea antes).
  const soloGH = Object.keys(ramasRel).filter((v) => !enJira.has(v)).map((v) => ({ id: "gh:" + v, nombre: v, num: v, soloGitHub: true }));
  const pq = q.trim().toLowerCase();
  const filas = [...soloGH, ...rels].filter((v) => (!soloPend || !v.publicada) && (!pq || [v.nombre, v.num, ...(ramasRel[v.num] || []).map((r) => r.repo)].join(" ").toLowerCase().includes(pq)));
  const alternar = (id) => setAbiertas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return html`<div>
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar release</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="Versión o repositorio" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
      <label class="interruptor"><input type="checkbox" checked=${soloPend} onChange=${(e) => setSoloPend(e.target.checked)} /> Solo las que no se han publicado</label>
      <span class="tenue">${plural(filas.length, "release", "releases")}</span>
    </div>
    ${filas.map((v) => {
      const ids = v.soloGitHub ? [] : jira?.relHistorias?.[v.id] || [];
      const rs = ramasRel[v.num] || [];
      const abierta = abiertas.has(v.id);
      return html`<section class="grupo ${abierta ? "" : "plegado"}" key=${v.id}>
        <div class="grupo-cab">
          <button class="plegar-grupo" aria-expanded=${abierta} onClick=${() => alternar(v.id)} aria-label=${abierta ? "Plegar" : "Ver sus historias"}><${Icono} n=${abierta ? "desplegado" : "plegado"} /></button>
          <span class="ico-release" aria-hidden="true"><${Icono} n="paquete" /></span>
          <h2><button class="lnk" onClick=${() => alternar(v.id)}>Release <span class="mono">${v.nombre}</span></button></h2>
          ${v.soloGitHub ? html`<span class="chip chip-borde" title="Hay rama release en GitHub, pero la release aún no está en Jira">aún no está en Jira</span>`
            : html`<span class=${"chip " + (v.publicada ? "chip-ok" : "chip-curso")}>${v.publicada ? "Publicada" : "Sin publicar"}</span>${v.fecha ? html`<span class="tenue">${fCorta(v.fecha)}</span>` : ""}`}
          <span class="resumen">${ids.length ? html`${plural(ids.length, "historia", "historias")} · <${Progreso} ids=${ids} />` : ""}
            ${rs.length ? ` · rama en ${plural(rs.length, "repo", "repos")}` : ""}</span>
        </div>
        ${abierta && html`<${PanelRelease} num=${v.num} version=${v.soloGitHub ? null : v} estado=${estado} jira=${jira} />`}
      </section>`;
    })}
    ${!filas.length ? html`<div class="vacio-mini">${rels.length || soloGH.length ? "Ninguna release con estos filtros." : "Sin releases todavía."}</div>` : ""}
  </div>`;
}

/** Historias de una release: las de Jira (tech-version) frente a las de los commits de sus ramas release. */
export function PanelRelease({ num, version, estado, jira, soloRepo }) {
  const v = version !== undefined ? version : (jira?.releases || []).find((x) => x.num === num) || null;
  const enJira = v ? jira?.relHistorias?.[v.id] || [] : [];
  const porRama = {};
  estado.ramas.filter((r) => r.release === num && (!soloRepo || r.repo === soloRepo)).forEach((r) => {
    (r.commits || []).forEach((c) => historiasEn(c.mensaje).forEach((k) => { (porRama[k] ||= new Set()).add(r.repo); }));
  });
  const claves = uniq([...enJira, ...Object.keys(porRama)]).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  if (!jira || jira.sesion?.estado !== "iniciada") return html`<p class="suave panel-rel">Conecta Jira para ver las historias de la release.</p>`;
  const soloJ = claves.filter((k) => enJira.includes(k) && !porRama[k]).length;
  const soloR = claves.filter((k) => !enJira.includes(k) && porRama[k]).length;
  return html`<div class="panel-rel">
    ${!v ? html`<p class="nota">Esta release aún no existe en Jira (la rama se crea antes). Historias según los commits de la rama:</p>`
      : (soloJ || soloR) ? html`<p class="nota">${soloJ ? html`<b>${soloJ}</b> en Jira sin commits en la rama` : ""}${soloJ && soloR ? " · " : ""}${soloR ? html`<b>${soloR}</b> en la rama sin la release en Jira (tech-version)` : ""}.</p>` : ""}
    ${claves.length ? html`<div style="overflow-x:auto"><table class="tabla tabla-historias">
      <thead><tr><th scope="col">Historia</th><th scope="col">Estado</th><th scope="col">Feature</th><th scope="col">En Jira</th><th scope="col">En la rama</th></tr></thead>
      <tbody>${claves.map((k) => { const x = issueJira(k); return html`<tr key=${k}>
        <td><${ChipJira} k=${k} /> <span class="tit-historia">${x?.s || ""}</span></td>
        <td>${x ? html`<span class=${"chip-jira cat-" + x.c}><span class="punto-cat" />${x.e}</span>` : "—"}</td>
        <td>${x?.f ? html`<${ChipJira} k=${x.f} />` : html`<span class="tenue">—</span>`}</td>
        <td>${enJira.includes(k) ? html`<span class="ico-ok" title="Tiene esta release en tech-version"><${Icono} n="ok" /></span>` : html`<span class="chip chip-borde">sin tech-version</span>`}</td>
        <td>${porRama[k] ? html`<span class="ico-ok" title=${[...porRama[k]].join(", ")}><${Icono} n="ok" /></span> <span class="tenue">${[...porRama[k]].map(corto).join(", ")}</span>` : html`<span class="chip chip-borde">sin commits</span>`}</td>
      </tr>`; })}</tbody></table></div>` : html`<p class="suave" style="margin:0">Sin historias.</p>`}
  </div>`;
}

/* ── En el detalle de una rama ── */
export function SeccionJiraRama({ d, jira }) {
  if (!jira || jira.sesion?.estado !== "iniciada") return null;
  const hs = uniq((d.commits || []).flatMap((c) => historiasEn(c.mensaje)));
  const feats = d.release ? d.features || [] : d.feature ? [d.feature] : [];
  if (!hs.length && !feats.length) return null;
  return html`<section class="seccion" aria-labelledby="s-jira">
    <h3 id="s-jira">Jira</h3>
    ${feats.map((k) => { const f = jira.features?.[k]; return html`<div class="feat-rama" key=${k}><${ChipJira} k=${k} conTitulo /> <${Sdatool} f=${f} /></div>`; })}
    ${hs.length ? html`<ul class="lista">${hs.map((k) => { const x = issueJira(k); return html`<li key=${k}><span class="l1"><${ChipJira} k=${k} /> ${x?.s || ""}</span>
      <span class="l2">${x ? `${x.e}${x.a ? " · " + x.a : ""}${x.tv ? " · release " + x.tv : ""}` : ""}</span></li>`; })}</ul>`
      : html`<p class="suave" style="margin:0">Los commits de esta rama no citan historias de Jira.</p>`}
  </section>`;
}

/* ── Diagnóstico (lo revisa la persona antes de enviarlo) ── */
export function DiagnosticoJira({ aviso, nfq }) {
  const [d, setD] = useState(null);
  const [ocupado, setOcupado] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (d) ref.current?.focus(); }, [d]);
  const generar = async () => {
    setOcupado("generar");
    try { setD(await api("jira/diagnostico", {})); } catch (e) { aviso(e.message, "mal"); } finally { setOcupado(""); }
  };
  const enviar = async () => {
    setOcupado("enviar");
    try { const r = await api("jira/diagnostico/enviar", { id: d.id }); aviso("Diagnóstico enviado.", "ok", String(r.fichero).startsWith("http") ? r.fichero : null); setD(null); }
    catch (e) { aviso(e.message + (e.pista ? " " + e.pista : ""), "mal"); } finally { setOcupado(""); }
  };
  return html`<div>
    <p class="suave" style="margin:0 0 8px">Prueba cómo está montado vuestro Jira (campos, releases, dónde está el SDATOOL…) y prepara un informe <b>sin contenido</b>:
      nombres de campos, cifras y formas como «9.999.9». Ni títulos, ni descripciones, ni personas. Lo revisas aquí antes de enviarlo a
      <span class="mono">${nfq?.repo || "pases-datos"}/diagnostico/</span>, para ajustar la app.</p>
    <button class="btn" onClick=${generar} disabled=${!!ocupado}><${Icono} n=${ocupado === "generar" ? "actualizar" : "chispa"} cls=${ocupado === "generar" ? "gira" : ""} /> Generar diagnóstico</button>
    ${d && html`<div class="dialogo-velo" onMouseDown=${(e) => e.target === e.currentTarget && !ocupado && setD(null)}>
      <div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dj-t">
        <div class="dialogo-cab"><h2 id="dj-t" tabindex="-1" ref=${ref}>Esto es lo que se enviaría</h2>
          <button class="btn btn-t btn-s" onClick=${() => setD(null)} disabled=${!!ocupado} aria-label="Cerrar"><${Icono} n="cerrar" /></button></div>
        <div class="dialogo-cuerpo">
          <p>Se guarda en <span class="mono">${nfq?.repo || "pases-datos"}/diagnostico/</span> tal cual lo ves. Revísalo: si algo te parece sensible, no lo envíes.</p>
          <pre class="json" tabindex="0" aria-label="Contenido del diagnóstico">${JSON.stringify(d.informe, null, 1)}</pre>
        </div>
        <div class="dialogo-pie">
          <button class="btn" onClick=${() => setD(null)} disabled=${!!ocupado}>No enviar</button>
          <button class="btn btn-pri" onClick=${enviar} disabled=${!!ocupado}>${ocupado === "enviar" ? "Enviando…" : "Enviar a pases-datos"}</button>
        </div>
      </div>
    </div>`}
  </div>`;
}
