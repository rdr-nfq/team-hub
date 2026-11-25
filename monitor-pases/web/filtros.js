// Monitor de pases · filtros comunes a Ramas, Actividad, Commits, DPs y Repos.
// Facetas con recuento (proyecto, repositorio, persona y las propiedades de
// los repos, como la UUAA), multi-selección, chips de lo que está activo,
// periodo y vistas guardadas. Pensado para 150+ repositorios.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { Icono, colorDe, corto, leerLS, ponerLS, plural, uniq } from "./comun.js";

export const FILTROS_VACIOS = { q: "", proyectos: [], repos: [], personas: [], props: {}, periodo: 0, ocultarMergeadas: true, soloDP: false, conPR: false };

export function leerFiltros() {
  try {
    const f = { ...FILTROS_VACIOS, ...JSON.parse(leerLS("mp-filtros", "{}")) };
    for (const k of ["proyectos", "repos", "personas"]) if (!Array.isArray(f[k])) f[k] = [];
    if (!f.props || typeof f.props !== "object") f.props = {};
    return f;
  } catch { return { ...FILTROS_VACIOS }; }
}
export const guardarFiltros = (f) => ponerLS("mp-filtros", JSON.stringify(f));

/* ── Propiedades de los repos (las de GitHub, como uuaa, y el lenguaje) ── */
export function propsDeRepos(repos) {
  const m = {};
  for (const r of repos || []) m[r.nombre] = { ...(r.propiedades || {}), ...(r.lenguaje ? { lenguaje: r.lenguaje } : {}) };
  return m;
}
/** Las que sirven para filtrar: con al menos dos valores distintos. */
function propsUtiles(mapa) {
  const vals = {};
  for (const p of Object.values(mapa)) for (const [k, v] of Object.entries(p)) (vals[k] ||= new Set()).add(v);
  return Object.keys(vals).filter((k) => vals[k].size > 1).sort();
}
const NOMBRE_PROP = { uuaa: "UUAA", lenguaje: "Lenguaje", tecnologia: "Tecnología" };
/** Propiedades de GitHub que casi nunca hacen falta para filtrar: van al final, plegadas y sin columna. */
export const PROP_SECUNDARIA = /^(branching[-_ ]?model|bu[-_ ]?kind|kind|stack[-_ ]?id)$/i;
export const nombreProp = (k) => NOMBRE_PROP[k] || k.charAt(0).toUpperCase() + k.slice(1).replace(/[-_]/g, " ");

/* ── Aplicar ── */
const palabras = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

/** ¿Pasa `x` los filtros? `sin` es la faceta que no se aplica (para contar sus opciones). */
export function pasa(x, f, props, sin = "") {
  if (sin !== "proyectos" && f.proyectos.length && !(x.proyectos || []).some((p) => f.proyectos.includes(p))) return false;
  if (sin !== "repos" && f.repos.length && !f.repos.includes(x.repo)) return false;
  if (sin !== "personas" && f.personas.length && !(x.personas || []).some((p) => f.personas.includes(p))) return false;
  for (const k in f.props || {}) {
    const vs = f.props[k];
    if (!vs?.length || sin === "p:" + k) continue;
    if (!vs.includes((props[x.repo] || {})[k])) return false;
  }
  if (f.periodo && (!x.fecha || Date.now() - Date.parse(x.fecha) > f.periodo * 864e5)) return false;
  const ps = palabras(f.q);
  if (ps.length) {
    const t = (x.texto || "").toLowerCase();
    if (!ps.every((w) => t.includes(w))) return false;
  }
  return true;
}

export const hayFiltros = (f) => !!(f.q.trim() || f.proyectos.length || f.repos.length || f.personas.length || f.periodo ||
  Object.values(f.props || {}).some((v) => v?.length));
export const sinFiltros = (f) => ({ ...f, q: "", proyectos: [], repos: [], personas: [], props: {}, periodo: 0 });

const selDe = (f, clave) => (clave.startsWith("p:") ? (f.props || {})[clave.slice(2)] || [] : f[clave] || []);
function conSel(f, clave, lista) {
  if (clave.startsWith("p:")) {
    const props = { ...(f.props || {}) };
    if (lista.length) props[clave.slice(2)] = lista; else delete props[clave.slice(2)];
    return { ...f, props };
  }
  return { ...f, [clave]: lista };
}
export const alternar = (f, clave, v) => {
  const sel = selDe(f, clave);
  return conSel(f, clave, sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
};

/* ── Facetas ── */
function contar(items, f, props, sin, valores) {
  const n = {};
  for (const x of items) if (pasa(x, f, props, sin)) for (const v of uniq(valores(x))) n[v] = (n[v] || 0) + 1;
  return n;
}

/**
 * Facetas para la vista. `items`: [{repo, proyectos, personas, fecha, texto}]
 * ya filtrados por los interruptores propios de la vista. `claves`: qué
 * facetas enseñar ("proyectos", "repos", "personas", "props").
 */
export function construirFacetas(items, f, estado, claves = ["proyectos", "repos", "personas", "props"]) {
  const props = propsDeRepos(estado.repos);
  const alias = Object.fromEntries(estado.proyectos.map((p) => [p.feature, p.nombre]));
  const out = [], secundarias = [];
  const opcion = (v, n, extra) => ({ v, n: n[v] || 0, ...extra });
  for (const c of claves) {
    if (c === "proyectos") {
      const n = contar(items, f, props, "proyectos", (x) => x.proyectos || []);
      const vals = uniq([...estado.proyectos.map((p) => p.feature), ...Object.keys(n), ...f.proyectos]);
      out.push({ clave: c, titulo: "Proyectos", uno: "Proyecto", opciones: vals.map((v) => opcion(v, n, { etiqueta: v || "Sin proyecto", sub: v ? alias[v] || "" : "", color: colorDe(v), mono: !!v })) });
    } else if (c === "repos") {
      const n = contar(items, f, props, "repos", (x) => [x.repo]);
      const vals = uniq([...estado.repos.map((r) => r.nombre), ...f.repos]);
      const err = Object.fromEntries(estado.repos.filter((r) => r.error).map((r) => [r.nombre, r.error.mensaje]));
      out.push({ clave: c, titulo: "Repositorios", uno: "Repositorio", buscarEn: "repositorio", opciones: vals.map((v) => opcion(v, n, { etiqueta: corto(v), sub: err[v] ? "Error: " + err[v] : "", aviso: !!err[v] })) });
    } else if (c === "personas") {
      const n = contar(items, f, props, "personas", (x) => x.personas || []);
      const vals = uniq([...Object.keys(n), ...f.personas]).filter(Boolean);
      if (vals.length) out.push({ clave: c, titulo: "Personas", uno: "Persona", buscarEn: "persona", opciones: vals.map((v) => opcion(v, n, { etiqueta: v })) });
    } else if (c === "props") {
      for (const k of propsUtiles(props)) {
        const clave = "p:" + k;
        const n = contar(items, f, props, clave, (x) => [(props[x.repo] || {})[k]].filter(Boolean));
        const vals = uniq([...Object.values(props).map((p) => p[k]).filter(Boolean), ...selDe(f, clave)]);
        const fa = { clave, titulo: nombreProp(k), opciones: vals.map((v) => opcion(v, n, { etiqueta: v, mono: k === "uuaa" })) };
        if (PROP_SECUNDARIA.test(k)) secundarias.push({ ...fa, secundaria: true }); else out.push(fa);
      }
    }
  }
  return [...out, ...secundarias];
}

/** Facetas de la vista: se calculan aquí y las pinta el lateral de App. */
export function useFacetas(setFacetas, items, f, estado, claves) {
  const facetas = useMemo(() => construirFacetas(items, f, estado, claves), [items, f, estado]);
  useEffect(() => { setFacetas(facetas); }, [facetas]);
  useEffect(() => () => setFacetas(null), []);
  return facetas;
}

/* ── Lateral ── */
const MAX_OPCIONES = 8;

function Faceta({ fa, f, setF }) {
  const [abierta, setAbierta] = useState(() => leerLS("mp-faceta-" + fa.clave, fa.secundaria ? "0" : "1") === "1");
  const [buscar, setBuscar] = useState("");
  const [todas, setTodas] = useState(false);
  const sel = selDe(f, fa.clave);
  const q = buscar.trim().toLowerCase();
  const ops = fa.opciones
    .filter((o) => sel.includes(o.v) || (q ? (o.etiqueta + " " + (o.sub || "") + " " + o.v).toLowerCase().includes(q) : o.n > 0))
    .sort((a, b) => (sel.includes(b.v) - sel.includes(a.v)) || b.n - a.n || a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
  const conDatos = fa.opciones.filter((o) => o.n > 0).length;
  const limite = Math.max(MAX_OPCIONES, sel.length);
  const visibles = todas || q ? ops : ops.slice(0, limite);
  const plegar = () => { ponerLS("mp-faceta-" + fa.clave, abierta ? "0" : "1"); setAbierta(!abierta); };
  const id = "fa-" + fa.clave.replace(/[^a-z0-9]/gi, "");
  return html`<section class="faceta" aria-labelledby=${id}>
    <div class="lat-tit">
      <button class="plegar" id=${id} aria-expanded=${abierta} onClick=${plegar}>
        <${Icono} n=${abierta ? "desplegado" : "plegado"} /> ${fa.titulo}${sel.length ? html` <span class="n-sel">${sel.length}</span>` : ""}</button>
      ${sel.length ? html`<button class="limpiar" onClick=${() => setF(conSel(f, fa.clave, []))}>Quitar</button>`
        : html`<span class="n-tot" title=${`${conDatos} con resultados`}>${conDatos}</span>`}
    </div>
    ${abierta && html`<div>
      ${fa.opciones.length > MAX_OPCIONES && html`<label class="buscar buscar-faceta"><span class="sr">Buscar ${fa.buscarEn || fa.titulo.toLowerCase()}</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder=${"Buscar " + (fa.buscarEn || fa.titulo.toLowerCase())} value=${buscar} onInput=${(e) => setBuscar(e.target.value)} /></label>`}
      <ul class="lista-lat">
        ${visibles.map((o) => {
          const activo = sel.includes(o.v);
          return html`<li key=${o.v}><button class="item-lat ${o.n ? "" : "cero"}" aria-pressed=${activo} onClick=${() => setF(alternar(f, fa.clave, o.v))} title=${o.sub || o.etiqueta}>
            ${o.color ? html`<span class="punto" style=${{ background: o.color }} />` : html`<span class="casilla">${activo ? html`<${Icono} n="ok" />` : ""}</span>`}
            <span class="t"><b class=${o.mono ? "mono" : ""}>${o.etiqueta}</b>${o.sub ? html`<span class=${o.aviso ? "aviso-lat" : ""}>${o.sub}</span>` : ""}</span>
            <span class="n">${o.n}</span></button></li>`;
        })}
        ${!visibles.length && html`<li class="tenue vacio-faceta">${q ? "Nada con ese texto" : "Ninguno con estos filtros"}</li>`}
      </ul>
      ${!q && ops.length > limite && html`<button class="ver-mas-lat" onClick=${() => setTodas(!todas)}>${todas ? "Ver menos" : `Ver los ${ops.length}`}</button>`}
    </div>`}
  </section>`;
}

export function LateralFiltros({ facetas, f, setF }) {
  if (!facetas) return html`<nav class="lateral" aria-label="Filtros" />`;
  return html`<nav class="lateral" aria-label="Filtros">
    <button class="btn btn-pri btn-s solo-movil cerrar-lat" onClick=${() => document.body.classList.remove("ver-filtros")}>Ver resultados</button>
    ${facetas.map((fa) => html`<${Faceta} key=${fa.clave} fa=${fa} f=${f} setF=${setF} />`)}
    <p class="ayuda-lat">Marca varias opciones para sumarlas. Para ir a cualquier repo, rama o DP: <kbd>Ctrl K</kbd></p>
  </nav>`;
}

/* ── Barra de filtros: buscador, periodo, vistas guardadas y lo activo ── */
const PERIODOS = [[0, "Todo"], [7, "7 días"], [14, "14 días"], [30, "30 días"]];

function MenuVistas({ f, setF, usuario }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [vistas, setVistas] = useState(() => { try { return JSON.parse(leerLS("mp-vistas", "[]")); } catch { return []; } });
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  const guardar = (lista) => { setVistas(lista); ponerLS("mp-vistas", JSON.stringify(lista)); };
  const aplicar = (v) => { setF({ ...sinFiltros(f), ...v }); setAbierto(false); };
  const actual = { q: f.q, proyectos: f.proyectos, repos: f.repos, personas: f.personas, props: f.props, periodo: f.periodo };
  return html`<div class="menu-vistas" ref=${ref}>
    <button class="btn btn-s" aria-expanded=${abierto} aria-haspopup="true" onClick=${() => setAbierto(!abierto)}><${Icono} n="marcador" /> Vistas</button>
    ${abierto && html`<div class="pop-vistas" role="menu">
      ${usuario && html`<button role="menuitem" class="op-vista" onClick=${() => aplicar({ personas: [usuario] })}><b>Lo mío</b><span>Donde has hecho commits (${usuario})</span></button>`}
      <button role="menuitem" class="op-vista" onClick=${() => aplicar({ periodo: 7 })}><b>Esta semana</b><span>Con cambios en los últimos 7 días</span></button>
      ${vistas.length ? html`<div class="sep-vistas">Guardadas</div>` : ""}
      ${vistas.map((v, i) => html`<div class="op-vista-g" key=${v.nombre + i}>
        <button role="menuitem" class="op-vista" onClick=${() => aplicar(v.f)}><b>${v.nombre}</b><span>${resumenFiltros(v.f)}</span></button>
        <button class="btn btn-t btn-s" aria-label=${"Borrar la vista " + v.nombre} onClick=${() => guardar(vistas.filter((_, j) => j !== i))}><${Icono} n="cerrar" /></button></div>`)}
      <form class="guardar-vista" onSubmit=${(e) => { e.preventDefault(); const n = nombre.trim(); if (n) { guardar([...vistas.filter((v) => v.nombre !== n), { nombre: n, f: actual }]); setNombre(""); } }}>
        <label class="sr" for="nombre-vista">Nombre de la vista</label>
        <input id="nombre-vista" class="inp" placeholder="Guardar estos filtros como…" value=${nombre} onInput=${(e) => setNombre(e.target.value)} disabled=${!hayFiltros(f)} />
        <button class="btn btn-s" type="submit" disabled=${!nombre.trim() || !hayFiltros(f)}>Guardar</button>
      </form>
    </div>`}
  </div>`;
}

export function resumenFiltros(v) {
  const partes = [];
  if (v.proyectos?.length) partes.push(v.proyectos.map((p) => p || "sin proyecto").join(", "));
  if (v.repos?.length) partes.push(plural(v.repos.length, "repo", "repos"));
  if (v.personas?.length) partes.push(v.personas.join(", "));
  for (const k in v.props || {}) if (v.props[k]?.length) partes.push(`${nombreProp(k)}: ${v.props[k].join(", ")}`);
  if (v.periodo) partes.push(`últimos ${v.periodo} días`);
  if (v.q) partes.push(`«${v.q}»`);
  return partes.join(" · ") || "Sin filtros";
}

function Activos({ f, setF, facetas }) {
  const chips = [];
  const titulo = Object.fromEntries((facetas || []).map((fa) => [fa.clave, fa]));
  const etiqueta = (clave, v) => (titulo[clave]?.opciones.find((o) => o.v === v)?.etiqueta) ?? (v || "Sin proyecto");
  for (const clave of ["proyectos", "repos", "personas", ...Object.keys(f.props || {}).map((k) => "p:" + k)]) {
    for (const v of selDe(f, clave)) {
      const nombre = titulo[clave]?.uno || titulo[clave]?.titulo || (clave.startsWith("p:") ? nombreProp(clave.slice(2)) : clave);
      chips.push(html`<button class="chip-filtro" key=${clave + v} onClick=${() => setF(alternar(f, clave, v))} aria-label=${`Quitar ${nombre}: ${etiqueta(clave, v)}`}>
        <span class="tenue">${nombre}</span> <b class=${clave === "proyectos" && v ? "mono" : ""}>${etiqueta(clave, v)}</b> <${Icono} n="cerrar" /></button>`);
    }
  }
  if (f.periodo) chips.push(html`<button class="chip-filtro" key="periodo" onClick=${() => setF({ ...f, periodo: 0 })} aria-label="Quitar el periodo">
    <span class="tenue">Periodo</span> <b>últimos ${f.periodo} días</b> <${Icono} n="cerrar" /></button>`);
  if (f.q.trim()) chips.push(html`<button class="chip-filtro" key="q" onClick=${() => setF({ ...f, q: "" })} aria-label="Quitar la búsqueda">
    <span class="tenue">Texto</span> <b>${f.q.trim()}</b> <${Icono} n="cerrar" /></button>`);
  if (!chips.length) return null;
  return html`<div class="activos" aria-label="Filtros activos">${chips}
    ${chips.length > 1 ? html`<button class="btn btn-t btn-s" onClick=${() => setF(sinFiltros(f))}>Quitar todos</button>` : ""}</div>`;
}

export function BarraFiltros({ f, setF, placeholder, facetas, usuario, total, children }) {
  const nActivos = (facetas || []).reduce((a, fa) => a + selDe(f, fa.clave).length, 0);
  return html`<div class="barra-filtros">
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar</span><${Icono} n="buscar" />
        <input id="buscar-filtros" class="inp" type="search" placeholder=${placeholder} value=${f.q} onInput=${(e) => setF({ ...f, q: e.target.value })} />
        <kbd class="atajo" aria-hidden="true">/</kbd></label>
      <div class="segmento seg-periodo" role="group" aria-label="Periodo">
        ${PERIODOS.map(([d, t]) => html`<button key=${d} aria-pressed=${f.periodo === d} onClick=${() => setF({ ...f, periodo: d })}>${t}</button>`)}
      </div>
      ${children}
      <span class="filtros-der">
        <button class="btn btn-s solo-movil" onClick=${() => document.body.classList.toggle("ver-filtros")}><${Icono} n="filtro" /> Filtros${nActivos ? ` (${nActivos})` : ""}</button>
        <${MenuVistas} f=${f} setF=${setF} usuario=${usuario} />
      </span>
    </div>
    <${Activos} f=${f} setF=${setF} facetas=${facetas} />
    ${total != null && hayFiltros(f) && !total ? html`<div class="vacio-mini">Nada con estos filtros. <button class="lnk" onClick=${() => setF(sinFiltros(f))}>Quitar los filtros</button></div>` : ""}
  </div>`;
}
