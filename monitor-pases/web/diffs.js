// Monitor de pases · commits y diferencias: la lista de todos los commits, el
// detalle de un commit, una rama frente a producción y el visor de diffs.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { api, Icono, Rama, ChipDP, hace, fLarga, corto, plural, colorDe, leerLS, ponerLS, uniq } from "./comun.js";

const ESTADO_F = {
  added: ["A", "nuevo"], modified: ["M", "modificado"], removed: ["D", "borrado"], renamed: ["R", "renombrado"],
  copied: ["C", "copiado"], changed: ["M", "cambiado"], unchanged: ["=", "sin cambios"],
};
const GRANDE = 800; // líneas de diff a partir de las que se pliega

/* ── Parseo del diff unificado (campo `patch` de GitHub) ── */
export function parsearPatch(patch) {
  const filas = [];
  let a = 0, b = 0;
  for (const l of String(patch || "").split("\n")) {
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(l);
    if (m) { a = +m[1]; b = +m[2]; filas.push({ t: "h", txt: l }); continue; }
    if (l.startsWith("\\")) { filas.push({ t: "n", txt: l.slice(2) }); continue; }
    const c = l[0], txt = l.slice(1);
    if (c === "+") filas.push({ t: "+", b: b++, txt });
    else if (c === "-") filas.push({ t: "-", a: a++, txt });
    else if (l !== "" || filas.length) filas.push({ t: " ", a: a++, b: b++, txt });
  }
  // Empareja cada bloque de líneas quitadas con las añadidas que le siguen,
  // para resaltar dentro de la línea lo que cambia.
  for (let i = 0; i < filas.length;) {
    if (filas[i].t !== "-") { i++; continue; }
    const menos = [], mas = [];
    while (i < filas.length && filas[i].t === "-") menos.push(filas[i++]);
    while (i < filas.length && filas[i].t === "+") mas.push(filas[i++]);
    for (let k = 0; k < Math.min(menos.length, mas.length); k++) { menos[k].par = mas[k].txt; mas[k].par = menos[k].txt; }
  }
  return filas;
}

function filasLado(filas) {
  const out = [];
  for (let i = 0; i < filas.length;) {
    const f = filas[i];
    if (f.t === "h" || f.t === "n") { out.push({ h: f }); i++; continue; }
    if (f.t === " ") { out.push({ izq: f, der: f }); i++; continue; }
    const menos = [], mas = [];
    while (i < filas.length && filas[i].t === "-") menos.push(filas[i++]);
    while (i < filas.length && filas[i].t === "+") mas.push(filas[i++]);
    for (let k = 0; k < Math.max(menos.length, mas.length); k++) out.push({ izq: menos[k] || null, der: mas[k] || null });
  }
  return out;
}

/** Marca la parte de la línea que cambia respecto a su pareja. */
function resaltar(txt, otro) {
  if (otro == null || txt.length > 500 || otro.length > 500) return txt;
  const n = Math.min(txt.length, otro.length);
  let p = 0;
  while (p < n && txt[p] === otro[p]) p++;
  let s = 0;
  while (s < n - p && txt[txt.length - 1 - s] === otro[otro.length - 1 - s]) s++;
  if (p + s >= txt.length || (p === 0 && s === 0)) return txt;
  return html`${txt.slice(0, p)}<mark>${txt.slice(p, txt.length - s)}</mark>${txt.slice(txt.length - s)}`;
}

const MARCA = { "+": "+", "-": "−", " ": " " };
const CLASE = { "+": "mas", "-": "menos", " ": "" };

function TablaUnificada({ filas }) {
  return html`<table class="diff"><tbody>${filas.map((f, i) => f.t === "h" ? html`<tr class="hunk" key=${i}><td colspan="4">${f.txt}</td></tr>`
    : f.t === "n" ? html`<tr class="nota-diff" key=${i}><td colspan="2" /><td colspan="2">${f.txt}</td></tr>`
    : html`<tr class=${CLASE[f.t]} key=${i}>
        <td class="ln">${f.t !== "+" ? f.a : ""}</td><td class="ln">${f.t !== "-" ? f.b : ""}</td>
        <td class="mk" aria-hidden="true">${MARCA[f.t]}</td><td class="cd">${f.t === " " ? f.txt : resaltar(f.txt, f.par)}</td></tr>`)}</tbody></table>`;
}

function TablaLado({ filas }) {
  const lado = useMemo(() => filasLado(filas), [filas]);
  const celda = (f, cual) => !f ? html`<td class="ln vacia" /><td class="cd vacia" />`
    : html`<td class="ln ${f.t === " " ? "" : CLASE[f.t]}">${cual === "izq" ? f.a : f.b}</td>
      <td class="cd ${f.t === " " ? "" : CLASE[f.t]}">${f.t !== " " ? html`<span class="sr">${f.t === "+" ? "añadida: " : "quitada: "}</span>` : ""}${f.t === " " ? f.txt : resaltar(f.txt, f.par)}</td>`;
  return html`<table class="diff lado"><colgroup><col class="c-ln" /><col /><col class="c-ln" /><col /></colgroup><tbody>
    ${lado.map((r, i) => r.h ? html`<tr class=${r.h.t === "h" ? "hunk" : "nota-diff"} key=${i}><td colspan="4">${r.h.txt}</td></tr>`
      : html`<tr key=${i}>${celda(r.izq, "izq")}${celda(r.der, "der")}</tr>`)}</tbody></table>`;
}

function partirRuta(ruta) {
  const i = String(ruta || "").lastIndexOf("/");
  return i < 0 ? ["", ruta] : [ruta.slice(0, i + 1), ruta.slice(i + 1)];
}

function DiffFichero({ f, idx, modo, abierto, alternar, verFichero }) {
  const [forzar, setForzar] = useState(false);
  const filas = useMemo(() => (abierto && f.patch ? parsearPatch(f.patch) : []), [abierto, f.patch]);
  const [dir, nombre] = partirRuta(f.ruta);
  const [letra, texto] = ESTADO_F[f.estado] || ["?", f.estado];
  const grande = filas.length > GRANDE && !forzar;
  let cuerpo = null;
  if (abierto) {
    if (!f.patch) cuerpo = html`<p class="df-nota">${f.estado === "renamed" && !f.mas && !f.menos ? "Solo se ha renombrado; el contenido es el mismo."
      : f.binario ? "Fichero binario: no tiene diferencias de texto." : "GitHub no envía el diff de este fichero (es demasiado grande). Ábrelo completo con «Ver fichero»."}</p>`;
    else if (grande) cuerpo = html`<p class="df-nota">Diff grande: ${plural(filas.length, "línea", "líneas")}. <button class="btn btn-s" onClick=${() => setForzar(true)}>Mostrarlo</button></p>`;
    else cuerpo = html`<div class="df-cuerpo">${modo === "lado" ? html`<${TablaLado} filas=${filas} />` : html`<${TablaUnificada} filas=${filas} />`}</div>
      ${f.recortado ? html`<p class="df-nota">El diff de este fichero es muy largo y se ha cortado. Míralo completo en GitHub.</p>` : ""}`;
  }
  return html`<section class="df" id=${"df-" + idx} aria-label=${f.ruta}>
    <header class="df-cab">
      <button class="btn btn-t btn-s df-plegar" aria-expanded=${abierto} onClick=${alternar} aria-label=${(abierto ? "Plegar " : "Desplegar ") + f.ruta}>
        <${Icono} n=${abierto ? "desplegado" : "plegado"} /></button>
      <span class="ef ef-${f.estado}" title=${texto}>${letra}</span>
      <span class="df-ruta mono">${f.antes && f.antes !== f.ruta ? html`<span class="tenue">${f.antes} → </span>` : ""}<span class="tenue">${dir}</span><b>${nombre}</b></span>
      <span class="df-cifras num"><span class="c-mas">+${f.mas}</span> <span class="c-menos">−${f.menos}</span></span>
      ${verFichero ? html`<button class="btn btn-s" onClick=${() => verFichero(f)}><${Icono} n="fichero" /> Ver fichero</button>` : ""}
    </header>
    ${cuerpo}
  </section>`;
}

/* ── Fichero completo ── */
export function VerFichero({ repo, sha, ruta, titulo, onCerrar }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const ref0 = useRef(null);
  useEffect(() => { api(`fichero?repo=${encodeURIComponent(repo)}&ref=${sha}&ruta=${encodeURIComponent(ruta)}`).then(setD, (e) => setErr(e.message)); }, []);
  useEffect(() => {
    const previo = document.activeElement;
    ref0.current?.focus();
    const t = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCerrar(); } };
    document.addEventListener("keydown", t, true);
    return () => { document.removeEventListener("keydown", t, true); previo?.focus?.(); };
  }, []);
  const lineas = d?.texto != null ? d.texto.replace(/\n$/, "").split("\n") : [];
  return html`<div class="dialogo-velo" onMouseDown=${(e) => e.target === e.currentTarget && onCerrar()}>
    <div class="dialogo dialogo-ancho" role="dialog" aria-modal="true" aria-labelledby="vf-t">
      <div class="dialogo-cab"><h2 id="vf-t" class="mono" style="font-size:14px;font-family:var(--f-mono)" tabindex="-1" ref=${ref0}>${ruta}</h2>
        <button class="btn btn-t btn-s" onClick=${onCerrar} aria-label="Cerrar"><${Icono} n="cerrar" /></button></div>
      <div class="dialogo-cuerpo">
        <p>${titulo} · <span class="mono">${sha.slice(0, 7)}</span>${d?.texto != null ? ` · ${plural(lineas.length, "línea", "líneas")}` : ""}</p>
        ${err ? html`<p class="nota" role="alert">${err}</p>` : !d ? html`<p>Cargando…</p>`
          : !d.existe ? html`<p class="nota">El fichero no existe en ese commit.</p>`
          : d.binario ? html`<p class="nota">Es un fichero binario (${Math.round(d.tamano / 1024)} KB).</p>`
          : html`<div class="df-cuerpo fichero-entero"><table class="diff"><tbody>${lineas.map((l, i) => html`<tr key=${i}><td class="ln">${i + 1}</td><td class="cd">${l}</td></tr>`)}</tbody></table></div>
            ${d.recortado ? html`<p class="nota">El fichero es muy grande y se ha cortado.</p>` : ""}`}
      </div>
    </div>
  </div>`;
}

/* ── Visor de diferencias (lista de ficheros + diffs) ── */
export function Diferencias({ ficheros, repo, despues, antes, foco }) {
  const [modo, setModoRaw] = useState(() => leerLS("mp-diff-modo", "unificado"));
  const [filtro, setFiltro] = useState("");
  const [plegados, setPlegados] = useState(() => new Set());
  const [ver, setVer] = useState(null);
  const setModo = (m) => { setModoRaw(m); ponerLS("mp-diff-modo", m); };
  const visibles = ficheros.map((f, i) => ({ f, i })).filter(({ f }) => !filtro || f.ruta.toLowerCase().includes(filtro.toLowerCase()));
  const ir = (i) => {
    setPlegados((p) => { const n = new Set(p); n.delete(i); return n; });
    requestAnimationFrame(() => document.getElementById("df-" + i)?.scrollIntoView({ block: "start" }));
  };
  useEffect(() => {
    if (!foco) return;
    const i = ficheros.findIndex((f) => f.ruta === foco);
    if (i >= 0) setTimeout(() => ir(i), 60);
  }, [foco, ficheros]);
  const alternar = (i) => setPlegados((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const mas = ficheros.reduce((a, f) => a + f.mas, 0), menos = ficheros.reduce((a, f) => a + f.menos, 0);
  return html`<div class="dif">
    <div class="dif-barra">
      <span class="num"><b>${plural(ficheros.length, "fichero", "ficheros")}</b> · <span class="c-mas">+${mas}</span> <span class="c-menos">−${menos}</span></span>
      <div class="segmento" role="group" aria-label="Cómo ver las diferencias">
        <button aria-pressed=${modo === "unificado"} onClick=${() => setModo("unificado")}><${Icono} n="lineas" /> Unificado</button>
        <button aria-pressed=${modo === "lado"} onClick=${() => setModo("lado")}><${Icono} n="columnas" /> Lado a lado</button>
      </div>
      <button class="btn btn-s" onClick=${() => setPlegados(plegados.size ? new Set() : new Set(ficheros.map((_, i) => i)))}>${plegados.size ? "Desplegar todo" : "Plegar todo"}</button>
    </div>
    <div class="dif-cuerpo">
      <nav class="dif-lista" aria-label="Ficheros cambiados">
        <label class="buscar"><span class="sr">Filtrar ficheros</span><${Icono} n="buscar" />
          <input class="inp" type="search" placeholder="Filtrar ficheros" value=${filtro} onInput=${(e) => setFiltro(e.target.value)} /></label>
        <ul>${visibles.map(({ f, i }) => {
          const [dir, nombre] = partirRuta(f.ruta);
          const [letra, texto] = ESTADO_F[f.estado] || ["?", f.estado];
          return html`<li key=${i}><button onClick=${() => ir(i)} title=${f.ruta}>
            <span class="ef ef-${f.estado}" title=${texto}>${letra}</span>
            <span class="t"><b>${nombre}</b><span>${dir}</span></span>
            <span class="num n"><span class="c-mas">+${f.mas}</span> <span class="c-menos">−${f.menos}</span></span></button></li>`;
        })}</ul>
      </nav>
      <div class="dif-ficheros">
        ${!ficheros.length ? html`<div class="vacio-mini">No hay ficheros cambiados.</div>` : ""}
        ${visibles.map(({ f, i }) => html`<${DiffFichero} key=${i} f=${f} idx=${i} modo=${modo} abierto=${!plegados.has(i)} alternar=${() => alternar(i)}
          verFichero=${despues || antes ? (x) => setVer(x.estado === "removed" ? { ruta: x.antes || x.ruta, sha: antes, titulo: "Antes del cambio (ya no existe)" } : { ruta: x.ruta, sha: despues, titulo: "Después del cambio" }) : null} />`)}
      </div>
    </div>
    ${ver && ver.sha && html`<${VerFichero} repo=${repo} sha=${ver.sha} ruta=${ver.ruta} titulo=${ver.titulo} onCerrar=${() => setVer(null)} />`}
  </div>`;
}

export function Cargando({ err, texto = "Cargando…" }) {
  return err ? html`<div class="contenido"><p class="nota" role="alert">${err}</p></div>` : html`<div class="contenido"><p class="suave">${texto}</p></div>`;
}

export function Volver({ volver }) {
  return html`<button class="btn btn-t btn-s volver" onClick=${volver}><${Icono} n="atras" /> Volver</button>`;
}

function copiar(t, aviso) {
  try { navigator.clipboard.writeText(t).then(() => aviso?.("Copiado: " + t.slice(0, 12)), () => {}); } catch {}
}

/* ── Un commit ── */
export function VistaCommit({ repo, sha, volver, ir, aviso }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [commits, setCommits] = useState(null);
  useEffect(() => { setD(null); setErr(null); api(`commit?repo=${encodeURIComponent(repo)}&sha=${sha}`).then(setD, (e) => setErr(e.message)); }, [repo, sha]);
  useEffect(() => { api("commits").then((r) => setCommits(r.commits), () => {}); }, []);
  if (!d) return html`<div><div class="contenido" style="padding-bottom:0"><${Volver} volver=${volver} /></div><${Cargando} err=${err} texto="Cargando el commit…" /></div>`;
  const [titulo, ...cuerpo] = d.mensaje.split("\n");
  const info = (commits || []).find((c) => c.repo === repo && c.sha === d.sha);
  return html`<div class="contenido">
    <${Volver} volver=${volver} />
    <header class="cab-commit">
      <h1>${titulo}</h1>
      ${cuerpo.join("\n").trim() ? html`<pre class="cuerpo-commit">${cuerpo.join("\n").trim()}</pre>` : ""}
      <div class="meta-commit">
        <span><b>${d.autorNombre || d.autor}</b>${d.autor && d.autor !== d.autorNombre ? html` <span class="tenue">(${d.autor})</span>` : ""} · ${fLarga(d.fecha)}</span>
        <span>${corto(repo)}</span>
        <button class="btn btn-t btn-s mono" onClick=${() => copiar(d.sha, aviso)} title="Copiar el SHA completo"><${Icono} n="copiar" /> ${d.sha.slice(0, 7)}</button>
        ${d.padres.map((p) => html`<button class="btn btn-t btn-s mono" key=${p} onClick=${() => ir({ vista: "commit", repo, sha: p })} title="Ir al commit anterior">anterior ${p.slice(0, 7)}</button>`)}
        ${d.url ? html`<a class="btn btn-s" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Ver en GitHub</a>` : ""}
      </div>
      ${info ? html`<div class="meta-commit">
        ${info.ramas.map((r) => html`<span class="chip" key=${r}><${Rama} nombre=${r} /></span>`)}
        ${info.produccion ? html`<span class="chip chip-merg">En producción</span>` : ""}
        ${info.dps.map((c) => html`<${ChipDP} key=${c} d=${{ cod: c }} repo=${repo} />`)}
      </div>` : ""}
    </header>
    <${Diferencias} ficheros=${d.ficheros} repo=${repo} despues=${d.sha} antes=${d.padres[0]} />
  </div>`;
}

/* ── Una rama frente a producción ── */
export function VistaDiffRama({ id, foco, volver, ir }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [verCommits, setVerCommits] = useState(false);
  useEffect(() => { setD(null); setErr(null); api("diff-rama?id=" + encodeURIComponent(id)).then(setD, (e) => setErr(e.message)); }, [id]);
  if (!d) return html`<div><div class="contenido" style="padding-bottom:0"><${Volver} volver=${volver} /></div><${Cargando} err=${err} texto="Comparando con producción…" /></div>`;
  return html`<div class="contenido">
    <${Volver} volver=${volver} />
    <header class="cab-commit">
      <p class="eyebrow">${corto(d.repo)}${d.feature ? html` · <span class="chip chip-acento" style=${{ background: colorDe(d.feature) }}>${d.feature}</span>` : ""}</p>
      <h1 class="mono h-rama"><${Rama} nombre=${d.rama} /></h1>
      <p class="suave" style="margin:4px 0 0">Lo que trae frente a <b>${d.base}</b>: ${plural(d.ahead, "commit", "commits")} que no están en producción${d.behind ? `; le faltan ${d.behind} de ${d.base}` : ""}.</p>
      <div class="meta-commit">
        <button class="btn btn-s" aria-expanded=${verCommits} onClick=${() => setVerCommits(!verCommits)}><${Icono} n="commit" /> ${verCommits ? "Ocultar" : "Ver"} los commits</button>
        ${d.url ? html`<a class="btn btn-s" href=${d.url} target="_blank" rel="noopener noreferrer"><${Icono} n="externo" /> Comparar en GitHub</a>` : ""}
      </div>
      ${verCommits ? html`<ul class="lista-commits">${[...d.commits].reverse().map((c) => html`<li key=${c.sha}>
        <button onClick=${() => ir({ vista: "commit", repo: d.repo, sha: c.sha })}><span class="mono tenue">${c.sha.slice(0, 7)}</span> ${c.mensaje}</button>
        <span class="tenue">${c.autor} · ${hace(c.fecha)}</span></li>`)}</ul>` : ""}
      ${d.truncado ? html`<p class="nota">GitHub solo da los primeros 300 ficheros de una comparación: puede faltar alguno. Míralo completo en GitHub.</p>` : ""}
    </header>
    <${Diferencias} ficheros=${d.ficheros} repo=${d.repo} despues=${d.sha} antes=${d.baseSha} foco=${foco} />
  </div>`;
}

/* ── Todos los commits ── */
function diaDe(iso) {
  const d = new Date(iso), hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  const mismo = (x, y) => x.toDateString() === y.toDateString();
  if (mismo(d, hoy)) return "Hoy";
  if (mismo(d, ayer)) return "Ayer";
  const t = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return t[0].toUpperCase() + t.slice(1);
}

export function VistaCommits({ estado, filtros, setFiltros, ir }) {
  const [datos, setDatos] = useState(null);
  const [err, setErr] = useState(null);
  const [limite, setLimite] = useState(200);
  const [conProd, setConProd] = useState(true);
  useEffect(() => { api("commits").then(setDatos, (e) => setErr(e.message)); }, [estado.sincro?.fin]);
  const q = filtros.q.trim().toLowerCase();
  const lista = useMemo(() => (datos?.commits || []).filter((c) =>
    (filtros.proyecto === null || (filtros.proyecto === "" ? !c.features.length && !c.produccion : c.features.includes(filtros.proyecto))) &&
    (!filtros.repo || c.repo === filtros.repo) && (conProd || !c.produccion || c.features.length) &&
    (!q || [c.mensaje, c.autor, c.sha, c.repo, ...c.ramas, ...c.dps].join(" ").toLowerCase().includes(q))), [datos, filtros, conProd, q]);
  if (!datos) return html`<${Cargando} err=${err} texto="Cargando los commits…" />`;
  const dias = [];
  lista.slice(0, limite).forEach((c) => {
    const d = diaDe(c.fecha);
    if (!dias.length || dias[dias.length - 1].d !== d) dias.push({ d, cs: [] });
    dias[dias.length - 1].cs.push(c);
  });
  const autores = uniq(lista.map((c) => c.autor)).length;
  return html`<div class="contenido">
    <div class="titulo-vista"><h1>Commits</h1><p>${plural(lista.length, "commit", "commits")} de ${plural(autores, "persona", "personas")} en los últimos ${estado.dias} días</p></div>
    <div class="filtros">
      <label class="buscar"><span class="sr">Buscar</span><${Icono} n="buscar" />
        <input class="inp" type="search" placeholder="Mensaje, autor, SHA, rama o DP" value=${filtros.q} onInput=${(e) => setFiltros({ ...filtros, q: e.target.value })} /></label>
      <label class="interruptor"><input type="checkbox" checked=${conProd} onChange=${(e) => setConProd(e.target.checked)} /> Incluir los que solo están en producción</label>
    </div>
    ${!lista.length ? html`<div class="vacio-mini">Ningún commit con estos filtros.</div>` : ""}
    ${dias.map(({ d, cs }) => html`<section class="grupo" key=${d}>
      <div class="grupo-cab"><h2>${d}</h2><span class="resumen">${plural(cs.length, "commit", "commits")}</span></div>
      <div style="overflow-x:auto"><table class="tabla tabla-commits"><tbody>${cs.map((c) => html`<tr class="fila" key=${c.repo + c.sha} onClick=${() => ir({ vista: "commit", repo: c.repo, sha: c.sha })}>
        <td class="c-hora num">${new Date(c.fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</td>
        <td class="c-repo">${corto(c.repo)}</td>
        <td class="c-msg"><button class="lnk" onClick=${(e) => { e.stopPropagation(); ir({ vista: "commit", repo: c.repo, sha: c.sha }); }}>${c.mensaje}</button>
          <div class="ramas-c">${c.features.map((f) => html`<span class="punto" key=${f} style=${{ background: colorDe(f), borderRadius: "3px" }} title=${f} />`)}
            ${c.ramas.slice(0, 2).map((r) => html`<span class="mono tenue" key=${r}>${r}</span>`)}${c.ramas.length > 2 ? html`<span class="tenue">+${c.ramas.length - 2}</span>` : ""}
            ${c.produccion ? html`<span class="chip chip-merg">producción</span>` : ""}</div></td>
        <td class="c-autor">${c.autor}</td>
        <td class="c-ci"><div class="ci">${c.actions[0] ? html`<span class=${c.actions[0].conclusion === "success" ? "ico-ok" : c.actions[0].estado !== "completed" ? "ico-curso" : "ico-mal"}
            title=${c.actions[0].nombre}><${Icono} n=${c.actions[0].conclusion === "success" ? "ok" : c.actions[0].estado !== "completed" ? "curso" : "mal"} /></span>` : ""}
          ${c.dps.map((x) => html`<${ChipDP} key=${x} d=${{ cod: x }} repo=${c.repo} />`)}</div></td>
        <td class="c-sha mono tenue">${c.sha.slice(0, 7)}</td>
      </tr>`)}</tbody></table></div>
    </section>`)}
    ${lista.length > limite ? html`<button class="btn" onClick=${() => setLimite(limite + 300)}>Ver ${Math.min(300, lista.length - limite)} más</button>` : ""}
  </div>`;
}
