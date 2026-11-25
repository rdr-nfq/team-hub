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
const METODO = { navegador: "con tu sesión del navegador", token: "token personal", usuario: "usuario y contraseña", cookie: "sesión copiada del navegador" };

export function ConectarJira({ estado, jira, recargar, aviso, compacto, paso, etiqueta }) {
  // Iniciada gana; luego la que está en marcha (entrando/comprobando); luego la del estado (más reciente) y la de /api/jira.
  const sesJira = jira?.sesion, sesEstado = estado?.sesion?.jira;
  const ses0 = [sesJira, sesEstado].find((x) => x?.estado === "iniciada")
    || [sesEstado, sesJira].find((x) => x?.estado === "entrando" || x?.estado === "comprobando") || sesEstado || sesJira || {};
  const url = jira?.url || "";
  const [vivo, setVivo] = useState(null);  // sesión mientras se entra con el navegador
  const ses = vivo || ses0;
  const [otra, setOtra] = useState(null);  // "usuario" | "cookie" | "token"
  const [token, setToken] = useState("");
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [cookie, setCookie] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);
  const entrando = ses.estado === "entrando" || ses.estado === "comprobando";
  useEffect(() => {
    if (!entrando) return;
    const iv = setInterval(async () => {
      try {
        const s = await api("jira/sesion-estado");
        if (s.estado === "entrando") return;
        setVivo(null);
        if (s.estado === "iniciada") aviso?.("Jira conectado. Leyendo historias, features y releases…");
        recargar?.();
      } catch { /* sigue probando */ }
    }, 1500);
    return () => clearInterval(iv);
  }, [entrando]);
  if (!url) return html`<p class="suave" style="margin:0">Pon la dirección de Jira en Ajustes → Jira.</p>`;
  const host = new URL(url).host;
  const conNavegador = async () => {
    setError(null);
    try { setVivo(await api("jira/navegador", {})); } catch (err) { setError(err.message); }
  };
  const conectar = async (e) => {
    e.preventDefault();
    setOcupado(true); setError(null);
    try {
      await api("jira/conectar", otra === "usuario" ? { usuario, clave } : otra === "cookie" ? { cookie } : { token });
      setToken(""); setClave(""); setCookie("");
      aviso?.("Jira conectado. Leyendo historias, features y releases…");
      recargar?.();
    } catch (err) { setError(err.message + (err.pista ? " " + err.pista : "")); } finally { setOcupado(false); }
  };
  const desconectar = async () => { try { await api("jira/cerrar", {}); recargar?.(); } catch (err) { aviso?.(err.message, "mal"); } };
  if (ses.estado === "iniciada")
    return html`<div class="fila-sesion ok">
      <span class="ico-sesion" aria-hidden="true"><${Icono} n="ok" /></span>
      <div class="t"><b>Jira</b> <span class="mono tenue">${host}</span>
        <span>Conectado como <b>${ses.nombre || ses.usuario}</b> (${METODO[ses.metodo] || ses.metodo})${ses.guardada === false && ses.metodo !== "cookie" ? " · no se ha podido guardar en Git: habrá que conectarlo en cada arranque" : ""}</span></div>
      ${!compacto && html`<button class="btn btn-s" onClick=${desconectar}>Desconectar</button>`}
    </div>`;
  const fallo = ses.fallo === "navegador";
  const listo = otra === "usuario" ? usuario && clave : otra === "cookie" ? cookie.trim() : token.trim();
  return html`<div class="fila-sesion jira-conectar">
    <span class="ico-sesion" aria-hidden="true">${paso ? html`<b class="num-paso">${paso}</b>` : html`<${Icono} n="candado" />`}</span>
    <div class="t">
      <b>Jira</b> <span class="mono tenue">${host}</span> ${etiqueta ? html`<span class="chip chip-borde">${etiqueta}</span>` : ""}
      <span>Para ver las historias de cada commit, las features con su SDATOOL y las releases.</span>
      ${ses.estado === "comprobando" ? html`<div class="entrando-jira" role="status"><${Icono} n="actualizar" cls="gira" />
          <span>Comprobando si ya tienes la sesión de Jira…</span></div>`
        : entrando ? html`<div class="entrando-jira" role="status"><${Icono} n="actualizar" cls="gira" />
          <span><b>Se ha abierto Jira en el navegador.</b> Entra como siempre (usuario de BBVA). Cuando estés dentro, la ventana se cierra sola y esto se conecta.</span></div>`
        : html`<div class="acc-jira">
          <button class="btn btn-pri" type="button" onClick=${conNavegador}><${Icono} n="externo" /> Iniciar sesión en Jira</button>
          <span class="tenue nota-jira">Se abre Jira en Chrome (o Edge si no tienes Chrome): entras con tu usuario de BBVA y la app recoge la sesión. Solo la primera vez; después entra sola.</span>
        </div>`}
      ${ses.aviso && !entrando ? html`<span class="error-sesion" role="alert">${ses.aviso}${fallo ? " Prueba una de las otras formas de entrar." : ""}</span>` : ""}
      <details class="otras-jira" open=${fallo || !!otra}>
        <summary>Otras formas de entrar</summary>
        <div class="segmento" role="group" aria-label="Forma de entrar">
          <button type="button" aria-pressed=${otra === "usuario"} onClick=${() => { setOtra("usuario"); setError(null); }}>Usuario y contraseña</button>
          <button type="button" aria-pressed=${otra === "cookie"} onClick=${() => { setOtra("cookie"); setError(null); }}>Copiar la sesión del navegador</button>
          <button type="button" aria-pressed=${otra === "token"} onClick=${() => { setOtra("token"); setError(null); }}>Token personal</button>
        </div>
        ${otra && html`<form class="form-jira" onSubmit=${conectar}>
          ${otra === "usuario" ? html`
            <p class="que-token">Tu usuario de Jira (el de tu perfil, p. ej. <span class="mono">nombre.apellido.contractor</span>) y tu contraseña de BBVA. Se guarda en el almacén de credenciales de Windows. Si Jira no la acepta, es que solo admite el SSO: usa otra forma.</p>
            <label class="sr" for="j-usu">Usuario de Jira</label><input id="j-usu" class="inp" autocomplete="username" placeholder="Usuario" value=${usuario} onInput=${(e) => setUsuario(e.target.value)} />
            <label class="sr" for="j-cla">Contraseña</label><input id="j-cla" class="inp" type="password" autocomplete="current-password" placeholder="Contraseña" value=${clave} onInput=${(e) => setClave(e.target.value)} />`
          : otra === "cookie" ? html`
            <ol class="pasos-jira">
              <li><span>Abre Jira en tu navegador y entra como siempre.</span>
                <a class="btn btn-s" href=${url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Abrir Jira</a></li>
              <li><span>Pulsa <kbd>F12</kbd> → pestaña <b>Aplicación</b> <span class="tenue">(Application)</span> → <b>Cookies</b> → <span class="mono">${url}</span>.</span></li>
              <li><span>Busca <b class="mono">JSESSIONID</b>, haz doble clic en su <b>valor</b> y cópialo.</span></li>
              <li><span>Pégalo aquí y pulsa <b>Conectar</b>:</span>
                <label class="sr" for="j-coo">Valor de JSESSIONID</label><input id="j-coo" class="inp mono" type="password" autocomplete="off" placeholder="Valor de JSESSIONID" value=${cookie} onInput=${(e) => setCookie(e.target.value)} /></li>
            </ol>
            <p class="que-token">Dura lo que dure tu sesión de Jira (horas); cuando caduque, la app te lo pedirá otra vez. No se guarda.</p>`
          : html`
            <p class="que-token">Solo si en tu perfil de Jira aparece <b>«Tokens de acceso personal»</b> (en el vuestro puede estar desactivado): <b>Crear token</b>, cópialo y pégalo aquí.</p>
            <a class="btn btn-s" style="justify-self:start" href=${url + (jira?.pats || "")} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Abrir mi perfil de Jira</a>
            <label class="sr" for="j-tok">Token de Jira</label><input id="j-tok" class="inp mono" type="password" autocomplete="off" placeholder="Pega aquí el token" value=${token} onInput=${(e) => setToken(e.target.value)} />`}
          <div class="acc-jira"><button class="btn btn-pri btn-s" type="submit" disabled=${ocupado || !listo}>${ocupado ? "Conectando…" : "Conectar"}</button></div>
        </form>`}
      </details>
      ${error && html`<span class="error-sesion" role="alert">${error}</span>`}
      <span class="tenue" style="font-size:12px">Nada de Jira sale de la VDI.</span>
    </div>
  </div>`;
}

/* ── Proyectos ── */
export function VistaProyectos({ estado, jira, ir, preparar, recargarJira, aviso }) {
  const [sub, setSub] = useState("proyectos");
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>${sub === "proyectos" ? "Proyectos de NFQ" : sub === "desarrollo" ? "Proyectos en desarrollo" : "Releases"}</h1>
      <div class="segmento" role="group" aria-label="Ver">
        <button aria-pressed=${sub === "proyectos"} onClick=${() => setSub("proyectos")}>De NFQ${jira?.nfq?.claves?.length ? ` (${jira.nfq.claves.length})` : ""}</button>
        <button aria-pressed=${sub === "desarrollo"} onClick=${() => setSub("desarrollo")}>En desarrollo (elegir)</button>
        <button aria-pressed=${sub === "releases"} onClick=${() => setSub("releases")}>Releases${jira?.proyectoReleases ? " de " + jira.proyectoReleases : ""}</button>
      </div>
      ${jira?.sincro?.enCurso ? html`<span class="tenue"><${Icono} n="actualizar" cls="gira" /> Leyendo Jira…</span>` : jira?.sincro?.fin ? html`<span class="tenue" title="Última lectura de Jira">Jira: ${hace(jira.sincro.fin)}</span>` : ""}
    </div>
    ${jira?.sesion?.estado !== "iniciada" ? html`<section class="caja" style="margin-bottom:16px"><${ConectarJira} estado=${estado} jira=${jira} recargar=${recargarJira} aviso=${aviso} /></section>` : ""}
    ${jira?.sincro?.estado === "error" ? html`<p class="nota" role="alert">No se ha podido leer Jira: ${jira.sincro.error?.mensaje}${jira.sincro.error?.pista ? " " + jira.sincro.error.pista : ""}</p>` : ""}
    ${sub === "proyectos" ? html`<${ListaProyectos} estado=${estado} jira=${jira} ir=${ir} preparar=${preparar} elegir=${() => setSub("desarrollo")} />`
      : sub === "desarrollo" ? html`<${ElegirNFQ} estado=${estado} jira=${jira} ir=${ir} recargar=${recargarJira} aviso=${aviso} />`
      : html`<${ListaReleases} estado=${estado} jira=${jira} />`}
  </div>`;
}

function ListaProyectos({ estado, jira, ir, preparar, elegir }) {
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);  // sin marcas: también sin ramas abiertas; con marcas: también los desplegados
  const [sinSd, setSinSd] = useState(false);
  const nfq = jira?.nfq?.claves || [];
  const enDes = useMemo(() => new Set((jira?.desarrollo || []).map((x) => x.k)), [jira]);
  const filas = useMemo(() => {
    const gh = Object.fromEntries(estado.proyectos.filter((p) => p.feature).map((p) => [p.feature, p]));
    const des = Object.fromEntries((jira?.desarrollo || []).map((x) => [x.k, x]));
    // Con proyectos marcados: solo los de NFQ. Sin marcar todavía: los de las ramas y las features de Jira, como antes.
    const claves = nfq.length ? nfq : uniq([...Object.keys(gh), ...Object.keys(jira?.features || {})]);
    return claves.map((k) => ({ k, gh: gh[k], f: jira?.features?.[k] || des[k] })).sort((a, b) =>
      (b.gh?.ultima || "").localeCompare(a.gh?.ultima || "") || a.k.localeCompare(b.k, "es", { numeric: true }));
  }, [estado, jira]);
  const pq = q.trim().toLowerCase();
  const desplegado = (x) => enDes.size && !enDes.has(x.k);
  const visibles = filas.filter((x) => (nfq.length ? todos || !desplegado(x) : todos || x.gh?.abiertas) && (!sinSd || (x.f && !x.f.sd?.length)) &&
    (!pq || [x.k, x.f?.s, x.gh?.nombre, ...(x.f?.sd || []), ...(x.gh?.repos || [])].join(" ").toLowerCase().includes(pq)));
  return html`<div>
    ${!nfq.length ? html`<p class="nota nota-nfq"><${Icono} n="marcador" /> <span>Aún no habéis marcado qué proyectos son de NFQ: ahora se ven todos los que tienen ramas.</span>
      <button class="btn btn-s btn-pri" onClick=${elegir}>Elegir los proyectos de NFQ</button></p>` : ""}
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar proyecto</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="Código, nombre, SDATOOL o repositorio" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
      <label class="interruptor"><input type="checkbox" checked=${todos} onChange=${(e) => setTodos(e.target.checked)} /> ${nfq.length ? "También los ya desplegados" : "También sin ramas abiertas"}</label>
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

/* ── Proyectos en desarrollo (Features y Tasks no desplegadas): se marcan los de NFQ ── */
function ElegirNFQ({ estado, jira, ir, recargar, aviso }) {
  const guardadas = jira?.nfq?.claves || [];
  const [sel, setSel] = useState(() => new Set(guardadas));
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [ver, setVer] = useState("todos");  // todos | marcados | sin
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setSel(new Set(jira?.nfq?.claves || [])); }, [jira?.nfq?.fecha]);
  const info = jira?.desarrolloInfo || {};
  const gh = useMemo(() => Object.fromEntries(estado.proyectos.filter((p) => p.feature).map((p) => [p.feature, p])), [estado]);
  const lista = jira?.desarrollo || [];
  const tipos = uniq(lista.map((x) => x.t)).sort();
  const pq = q.trim().toLowerCase();
  const visibles = lista.filter((x) => (!tipo || x.t === tipo) && (ver === "todos" || (ver === "marcados") === sel.has(x.k)) &&
    (!pq || [x.k, x.s, x.e, x.a].join(" ").toLowerCase().includes(pq)));
  const cambiado = sel.size !== guardadas.length || guardadas.some((k) => !sel.has(k));
  const alternar = (k) => setSel((s0) => { const s1 = new Set(s0); s1.has(k) ? s1.delete(k) : s1.add(k); return s1; });
  const conRamas = lista.filter((x) => gh[x.k]?.abiertas).map((x) => x.k);
  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api("jira/nfq", { claves: [...sel] });
      const n = plural(r.claves.length, "proyecto", "proyectos");
      aviso?.(r.motivo || `Guardado: ${n} de NFQ.${r.compartido ? " Compartido con el equipo." : ""}`, r.motivo ? "mal" : undefined);
      recargar?.();
    } catch (e) { aviso?.(e.message, "mal"); } finally { setGuardando(false); }
  };
  if (jira?.sesion?.estado !== "iniciada" && !lista.length) return html`<div class="vacio-mini">Conecta Jira para ver los proyectos en desarrollo.</div>`;
  return html`<div>
    <p class="suave" style="margin:0 0 12px;max-width:820px">Las <b>${(info.tipos || ["Feature", "Task"]).join(" y ")}</b> de <b class="mono">${info.proyecto || "CIBRDR"}</b>${" "}que no están en <b>${info.fin || "Deployed"}</b>. Marca las que son de NFQ: son las que se ven en <i>Proyectos</i>
      ${jira?.nfq?.compartido ? html`· <span class="tenue">la selección se comparte con el equipo (pases-datos${jira.nfq.por ? ", último cambio de " + jira.nfq.por : ""}${jira.nfq.fecha ? " " + hace(jira.nfq.fecha) : ""})</span>` : ""}.</p>
    ${info.error && !lista.length ? html`<p class="nota" role="alert">Jira no acepta la consulta de proyectos: ${info.error}</p>` : ""}
    ${info.consulta && info.consulta !== "completa" ? html`<p class="nota">Jira no reconoce ${info.consulta === "sin el estado" ? `el estado «${info.fin}»: se quitan los terminados` : "los tipos ni el estado"}. Revisa los nombres en Ajustes → Jira.</p>` : ""}
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="Código, nombre, estado o responsable" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
      <div class="segmento" role="group" aria-label="Tipo">
        <button aria-pressed=${!tipo} onClick=${() => setTipo("")}>Todos</button>
        ${tipos.map((t) => html`<button key=${t} aria-pressed=${tipo === t} onClick=${() => setTipo(t)}>${t}</button>`)}
      </div>
      <div class="segmento" role="group" aria-label="Marcados">
        <button aria-pressed=${ver === "todos"} onClick=${() => setVer("todos")}>Todos</button>
        <button aria-pressed=${ver === "marcados"} onClick=${() => setVer("marcados")}>De NFQ (${sel.size})</button>
        <button aria-pressed=${ver === "sin"} onClick=${() => setVer("sin")}>Sin marcar</button>
      </div>
      <span class="tenue">${plural(visibles.length, "proyecto", "proyectos")}</span>
    </div>
    <div class="barra-nfq">
      <button class="btn btn-pri" disabled=${!cambiado || guardando} onClick=${guardar}>${guardando ? "Guardando…" : `Guardar (${sel.size} de NFQ)`}</button>
      ${cambiado ? html`<button class="btn btn-t btn-s" onClick=${() => setSel(new Set(guardadas))}>Deshacer cambios</button>` : ""}
      ${conRamas.some((k) => !sel.has(k)) ? html`<button class="btn btn-s" onClick=${() => setSel((s0) => new Set([...s0, ...conRamas]))}
        title="Marca los que tienen ramas abiertas en vuestros repositorios"><${Icono} n="rama" /> Marcar los que tienen ramas (${conRamas.filter((k) => !sel.has(k)).length})</button>` : ""}
      ${jira?.sincro?.enCurso ? html`<span class="tenue"><${Icono} n="actualizar" cls="gira" /> Leyendo Jira…</span>` : info.fecha ? html`<span class="tenue">Leído de Jira ${hace(info.fecha)}</span>` : ""}
    </div>
    ${visibles.length ? html`<div class="grupo"><div style="overflow-x:auto"><table class="tabla tabla-nfq">
      <thead><tr><th scope="col" class="c-sel"><span class="sr">De NFQ</span></th><th scope="col">Proyecto</th><th scope="col">Tipo</th><th scope="col">Estado</th>
        <th scope="col">Responsable</th><th scope="col" class="c-num">Ramas</th><th scope="col">Actualizado</th></tr></thead>
      <tbody>${visibles.map((x) => html`<tr key=${x.k} class=${"fila" + (sel.has(x.k) ? " marcada" : "")} onClick=${() => alternar(x.k)}>
        <td class="c-sel"><input type="checkbox" checked=${sel.has(x.k)} aria-label=${"De NFQ: " + x.k} onClick=${(e) => e.stopPropagation()} onChange=${() => alternar(x.k)} /></td>
        <td class="c-proy"><span class="barra-proy" style=${{ background: colorDe(x.k) }} />
          <span><a class="lnk mono" href=${urlJira(x.k)} target="_blank" rel="noopener noreferrer" onClick=${(e) => e.stopPropagation()}><b>${x.k}</b></a>
          <span class="nombre-proy">${x.s}</span></span></td>
        <td>${x.t}</td>
        <td><span class=${"chip-jira cat-" + x.c}><span class="punto-cat" />${x.e}</span></td>
        <td class="tenue">${x.a || "—"}</td>
        <td class="c-num num">${gh[x.k]?.abiertas ? html`<button class="lnk" onClick=${(e) => { e.stopPropagation(); ir({ vista: "proyecto", feature: x.k }); }}>${gh[x.k].abiertas}</button>` : html`<span class="tenue">0</span>`}</td>
        <td class="tenue">${x.u ? hace(x.u) : "—"}</td>
      </tr>`)}</tbody></table></div></div>`
      : html`<div class="vacio-mini">${lista.length ? "Ninguno con estos filtros." : jira?.sincro?.enCurso ? "Leyendo los proyectos de Jira…" : "Jira no ha devuelto proyectos en desarrollo. Pulsa «Leer Jira ahora» en Ajustes → Jira."}</div>`}
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
