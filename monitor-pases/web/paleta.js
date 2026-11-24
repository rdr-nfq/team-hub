// Monitor de pases · «Ir a…» (Ctrl+K): salta a cualquier repositorio, rama,
// proyecto, DP o commit escribiendo un trozo de su nombre.
import { html, useState, useEffect, useMemo, useRef } from "./vendor/preact-htm.mjs";
import { Icono, Rama, colorDe, corto, hace } from "./comun.js";
import { propsDeRepos } from "./filtros.js";

const PESTANAS = [["ramas", "Ramas"], ["actividad", "Actividad"], ["commits", "Commits"], ["dps", "DPs"], ["repos", "Repos"],
  ["copilot", "Copilot"], ["pase", "Pase"], ["ajustes", "Ajustes"]];
const TIPO = { repo: "Repositorio", rama: "Rama", release: "Release", proyecto: "Proyecto", dp: "DP", commit: "Commit", vista: "Pestaña" };
const ICONO = { repo: "repo", rama: "rama", release: "paquete", proyecto: "marcador", dp: "paquete", commit: "commit", vista: "ir" };
const ORDEN = { proyecto: 0, repo: 1, release: 2, rama: 3, dp: 4, commit: 5, vista: 6 };

function indice(estado) {
  const props = propsDeRepos(estado.repos);
  const out = PESTANAS.map(([v, t]) => ({ tipo: "vista", titulo: t, texto: t, accion: { vista: v } }));
  for (const p of estado.proyectos) if (p.feature)
    out.push({ tipo: "proyecto", titulo: p.feature, sub: p.nombre || "", color: colorDe(p.feature), texto: `${p.feature} ${p.nombre || ""}`, accion: { proyecto: p.feature } });
  for (const r of estado.repos)
    out.push({ tipo: "repo", titulo: corto(r.nombre), sub: Object.values(props[r.nombre] || {}).join(" · "), texto: `${r.nombre} ${r.descripcion || ""} ${Object.values(props[r.nombre] || {}).join(" ")}`,
      accion: { vista: "repo", repo: r.nombre, sub: "codigo" } });
  const dps = new Set();
  const commits = new Map();
  for (const r of estado.ramas) {
    if (!r.esBase) out.push({ tipo: r.release ? "release" : "rama", titulo: r.rama, sub: corto(r.repo), fecha: r.cabeza?.fecha, texto: `${r.rama} ${r.repo} ${r.feature || ""}`, rama: true, accion: { abrir: r.id } });
    for (const d of r.dps || []) {
      const k = r.repo + "|" + d.cod;
      if (dps.has(k) || d.fuente === "manual") continue;
      dps.add(k);
      out.push({ tipo: "dp", titulo: d.cod, sub: `${corto(r.repo)} · ${r.rama}`, fecha: d.fecha, texto: `${d.cod} ${r.repo} ${r.rama}`, accion: { vista: "dp", repo: r.repo, cod: d.cod } });
    }
    for (const c of r.commits || []) if (!commits.has(r.repo + c.sha)) commits.set(r.repo + c.sha, { c, repo: r.repo });
  }
  return { items: out, commits: [...commits.values()] };
}

function buscar(idx, q) {
  const ws = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!ws.length) return idx.items.filter((x) => x.tipo === "vista" || x.tipo === "proyecto").slice(0, 30);
  const res = [];
  for (const x of idx.items) {
    const t = x.texto.toLowerCase();
    if (!ws.every((w) => t.includes(w))) continue;
    const tit = x.titulo.toLowerCase();
    const puntos = (tit === ws[0] ? 0 : tit.startsWith(ws[0]) ? 1 : tit.includes(ws[0]) ? 2 : 3) * 10 + ORDEN[x.tipo];
    res.push([puntos, x]);
  }
  // Un SHA (o su principio): commits.
  if (ws.length === 1 && /^[0-9a-f]{5,40}$/.test(ws[0]))
    for (const { c, repo } of idx.commits) if (c.sha.startsWith(ws[0]))
      res.push([5, { tipo: "commit", titulo: c.mensaje, sub: `${corto(repo)} · ${c.sha.slice(0, 7)} · ${c.autor}`, fecha: c.fecha, accion: { vista: "commit", repo, sha: c.sha } }]);
  res.sort((a, b) => a[0] - b[0] || (b[1].fecha || "").localeCompare(a[1].fecha || ""));
  return res.slice(0, 60).map((x) => x[1]);
}

export function Paleta({ estado, cerrar, ir, abrirRama, filtrarProyecto }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef(null);
  const lista = useRef(null);
  const idx = useMemo(() => indice(estado), [estado]);
  const res = useMemo(() => buscar(idx, q), [idx, q]);
  useEffect(() => { setI(0); }, [q]);
  useEffect(() => {
    const previo = document.activeElement;
    ref.current?.focus();
    return () => previo?.focus?.();
  }, []);
  useEffect(() => { lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [i, res]);
  const elegir = (x) => {
    if (!x) return;
    cerrar();
    const a = x.accion;
    if (a.abrir) abrirRama(a.abrir);
    else if (a.proyecto) filtrarProyecto(a.proyecto);
    else ir(a);
  };
  const tecla = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(res.length - 1, n + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(res[i]); }
    else if (e.key === "Escape") { e.preventDefault(); cerrar(); }
  };
  return html`<div class="dialogo-velo velo-paleta" onMouseDown=${(e) => e.target === e.currentTarget && cerrar()}>
    <div class="paleta" role="dialog" aria-modal="true" aria-label="Ir a…">
      <label class="buscar buscar-paleta"><span class="sr">Ir a</span><${Icono} n="buscar" />
        <input ref=${ref} class="inp" placeholder="Repositorio, rama, proyecto, DP o SHA de un commit" value=${q}
          onInput=${(e) => setQ(e.target.value)} onKeyDown=${tecla} role="combobox" aria-expanded="true" aria-controls="res-paleta"
          aria-activedescendant=${res.length ? "op-paleta-" + i : undefined} autocomplete="off" spellcheck=${false} /></label>
      <ul class="res-paleta" id="res-paleta" role="listbox" ref=${lista}>
        ${res.map((x, k) => html`<li key=${x.tipo + x.titulo + (x.sub || "") + k} id=${"op-paleta-" + k} role="option" aria-selected=${k === i}
            onMouseMove=${() => k !== i && setI(k)} onClick=${() => elegir(x)}>
          ${x.color ? html`<span class="punto" style=${{ background: x.color }} />` : html`<${Icono} n=${ICONO[x.tipo]} />`}
          <span class="t"><b class=${x.tipo === "commit" || x.tipo === "vista" ? "" : "mono"}>${x.rama ? html`<${Rama} nombre=${x.titulo} />` : x.titulo}</b>${x.sub ? html`<span>${x.sub}</span>` : ""}</span>
          <span class="tipo-paleta">${TIPO[x.tipo]}${x.fecha ? " · " + hace(x.fecha) : ""}</span></li>`)}
        ${!res.length && html`<li class="vacio-paleta">Nada con «${q}». Prueba con otro trozo del nombre.</li>`}
      </ul>
      <div class="pie-paleta"><span><kbd>↑</kbd> <kbd>↓</kbd> moverse</span><span><kbd>Intro</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span></div>
    </div>
  </div>`;
}
