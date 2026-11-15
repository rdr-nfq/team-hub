"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";
import { mismoEmail } from "@/lib/email";
import { esActivo } from "@/lib/equipos";
import IconoBBVA from "../iconosBBVA";
import { FLEX, PESO, norm, parseDMY, semanasVotables, semanasPasadas } from "./logic";

/* Comidas · cada jueves de oficina el equipo vota dónde comer.
   Votas solo como tú (el nombre sale de tu email). Tu voto va primero: un
   estado (Como fuera · Me da igual · Taper / Glovo · No estoy) y, si comes
   fuera, los restaurantes son la papeleta: el primero que pulsas es tu 1ª
   (2 puntos) y el siguiente tu 2ª (1 punto). Al lado, «Cómo va»: quién va
   ganando, cuántos comen fuera y quién falta. No hay hora de cierre.
   Backend: apps-script/comidas/Codigo_Comidas.gs (clave comidasBackend). */

const EQUIPO_URL = "/team-hub/equipo/equipo.json";
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fCorta = (s) => { const d = parseDMY(s); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };
const fLarga = (s) => { const d = parseDMY(s); return `${DIAS_L[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };
const fDia = (s) => { const d = parseDMY(s); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const clave = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/* Voto del Sheet → { e: 'fuera'|'flex'|'taper'|'no', p1, p2 } */
function deFila(x) {
  if (norm(x.noEstoy)) return { e: "no", p1: "", p2: "" };
  if (norm(x.taperGlovo)) return { e: "taper", p1: "", p2: "" };
  const e1 = String(x.eleccion1 || "").trim(), e2 = String(x.eleccion2 || "").trim();
  if (!e1 || e1 === FLEX) return { e: "flex", p1: "", p2: "" };
  return { e: "fuera", p1: e1, p2: e2 && e2 !== FLEX && e2 !== e1 ? e2 : "" };
}
const igual = (a, b) => !!a && !!b && a.e === b.e && (a.e !== "fuera" || (a.p1 === b.p1 && (a.p2 || "") === (b.p2 || "")));
const textoVoto = (v) => (v.e === "flex" ? "me da igual, voy a lo más votado" : v.e === "taper" ? "taper o Glovo" : v.e === "no" ? "no estoy" : v.p2 ? `${v.p1}, y si no, ${v.p2}` : v.p1);

/* Recuento de un jueves: la 1ª vale 2 puntos y la 2ª, 1; empate: más 1ªs y luego alfabético. */
function recuento(votos, semana, restaurantes) {
  const vs = votos.filter((x) => x.semana === semana).map((x) => ({ quien: x.companero, ...deFila(x) }));
  const pts = {};
  restaurantes.forEach((r) => { pts[r.nombre] = { p: 0, n1: [], n2: [] }; });
  vs.filter((v) => v.e === "fuera").forEach((v) => {
    const a = (pts[v.p1] = pts[v.p1] || { p: 0, n1: [], n2: [] }); a.p += PESO.p1; a.n1.push(v.quien);
    if (v.p2) { const b = (pts[v.p2] = pts[v.p2] || { p: 0, n1: [], n2: [] }); b.p += PESO.p2; b.n2.push(v.quien); }
  });
  const rank = Object.entries(pts).filter(([, x]) => x.p).sort((a, b) => b[1].p - a[1].p || b[1].n1.length - a[1].n1.length || a[0].localeCompare(b[0], "es"));
  const de = (e) => vs.filter((v) => v.e === e).map((v) => v.quien);
  return { vs, rank, pts, fuera: de("fuera"), flex: de("flex"), taper: de("taper"), no: de("no"), n: vs.length };
}

function Esqueleto() {
  return (
    <div className="cm-rej" aria-busy="true" aria-label="Cargando las votaciones">
      <div className="mg-esq" style={{ height: 520 }} />
      <div className="mg-esq" style={{ height: 340 }} />
    </div>
  );
}

export default function ComidasRoute() {
  const { getUrl, error: linksError } = useLinks();
  const { email } = useAuth();

  /* ── Datos ── */
  const [team, setTeam] = useState(null);
  const [datos, setDatos] = useState(null); // { restaurantes, semanas, votos } | { error } | { sinBackend }
  const urlRef = useRef(null);
  useEffect(() => {
    let vivo = true;
    fetch(EQUIPO_URL).then((r) => r.json()).then((eq) => vivo && setTeam(eq.team || [])).catch(() => vivo && setTeam([]));
    return () => { vivo = false; };
  }, []);
  const cargar = useCallback(async () => {
    const url = urlRef.current;
    if (!url) { setDatos({ sinBackend: true }); return; }
    setDatos(null);
    try {
      const d = await fetch(url, { cache: "no-store" }).then((r) => r.json());
      if (!d || !Array.isArray(d.semanas)) throw new Error("respuesta inesperada");
      setDatos({ restaurantes: d.restaurantes || [], semanas: d.semanas || [], votos: d.votos || [] });
    } catch (e) {
      setDatos({ error: String(e.message || e) });
    }
  }, []);
  const empezado = useRef(false);
  useEffect(() => {
    if (empezado.current) return;
    const url = getUrl && getUrl("comidasBackend");
    const ir = (u) => { if (empezado.current) return; empezado.current = true; urlRef.current = u; cargar(); };
    if (url) { ir(url); return; }
    if (linksError) { ir(null); return; }
    const t = setTimeout(() => ir(null), 8000); // links.json aún cargando
    return () => clearTimeout(t);
  }, [getUrl, linksError, cargar]);

  const yo = useMemo(() => (team || []).find((p) => mismoEmail(p.email, email) || mismoEmail(p.emailBBVA, email)) || null, [team, email]);
  const equipo = useMemo(() => (team || []).filter(esActivo).map((p) => p.nombre), [team]);
  const esYo = (n) => !!yo && clave(n) === clave(yo.nombre);
  const quienTxt = (n) => (esYo(n) ? "tú" : n.split(" ").length > 2 && /^(Juan|José|Luis|David)$/.test(n.split(" ")[0]) ? n.split(" ").slice(0, 2).join(" ") : n.split(" ")[0]);

  const restaurantes = datos?.restaurantes || [];
  const votos = datos?.votos || [];
  const votables = useMemo(() => (datos?.semanas ? semanasVotables(datos.semanas) : []), [datos]);
  const pasadas = useMemo(() => (datos?.semanas ? semanasPasadas(datos.semanas).filter((s) => votos.some((v) => v.semana === s.fecha)) : []), [datos, votos]);
  // Última vez que el equipo fue a cada sitio (el ganador de cada jueves pasado).
  const ultima = useMemo(() => {
    const o = {};
    pasadas.forEach((s) => { const g = recuento(votos, s.fecha, []).rank[0]; if (g && !o[g[0]]) o[g[0]] = fDia(s.fecha); });
    return o;
  }, [pasadas, votos]);

  /* ── Estado de la pantalla ── */
  const [vista, setVista] = useState("curso");
  const [sem, setSem] = useState("");
  useEffect(() => { if (votables.length && !votables.some((x) => x.fecha === sem)) setSem(votables[0].fecha); }, [votables, sem]);
  const [borr, setBorr] = useState({}); // borrador por jueves
  const [guardando, setGuardando] = useState(false);
  const [errGuardar, setErrGuardar] = useState("");
  const [aviso, setAviso] = useState(null); // { texto, error, deshacer }
  const [anuncio, setAnuncio] = useState({ t: "", urgente: false });

  const foco = useRef(null);
  const [, repintar] = useState(0);
  const enfocar = (sel) => { foco.current = sel; repintar((t) => t + 1); };
  useEffect(() => {
    if (!foco.current) return;
    const el = document.querySelector(foco.current); foco.current = null;
    el?.focus({ preventScroll: true });
  });
  const anunciar = (t, urgente = false) => { setAnuncio({ t: "", urgente }); setTimeout(() => setAnuncio({ t, urgente }), 30); };

  // Aviso de abajo: uno a la vez; el de Deshacer dura 10 s y se para mientras se mira.
  const avisoT = useRef(null);
  const programarAviso = (ms) => { clearTimeout(avisoT.current); avisoT.current = setTimeout(() => setAviso(null), ms); };
  const mostrarAviso = (texto, o = {}) => { setAviso({ texto, ...o }); anunciar(texto, !!o.error); programarAviso(o.deshacer ? 10000 : o.error ? 9000 : 4000); };
  useEffect(() => () => clearTimeout(avisoT.current), []);

  const votoDe = useCallback((f) => {
    if (!yo) return null;
    const x = votos.find((v) => v.semana === f && clave(v.companero) === clave(yo.nombre));
    return x ? deFila(x) : null;
  }, [votos, yo]);
  const borrador = (f = sem) => borr[f] || (() => { const v = votoDe(f); return v ? { ...v } : { e: "fuera", p1: "", p2: "" }; })();
  const sinGuardar = (f = sem) => !!borr[f] && !igual(borr[f], votoDe(f));

  /* ── Enviar al Apps Script (POST text/plain, sin preflight) ── */
  const enviar = async (cuerpo) => {
    const res = await fetch(urlRef.current, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ ...cuerpo, email }) }).then((r) => r.json());
    if (!res || res.status !== "success") throw new Error((res && res.message) || "error del servidor");
    return res;
  };
  const aFila = (f, b) => ({
    semana: f, companero: yo.nombre,
    eleccion1: b.e === "fuera" ? b.p1 : b.e === "flex" ? FLEX : "", eleccion2: b.e === "fuera" ? b.p2 : "",
    taperGlovo: b.e === "taper", noEstoy: b.e === "no",
  });
  const ponerVotoLocal = (f, fila) => setDatos((d) => ({ ...d, votos: [...d.votos.filter((v) => !(v.semana === f && clave(v.companero) === clave(yo.nombre))), ...(fila ? [fila] : [])] }));

  const guardar = async () => {
    const f = sem, b = borrador(f);
    if (guardando || (b.e === "fuera" && !b.p1) || !yo) return;
    setGuardando(true); setErrGuardar("");
    try {
      const fila = aFila(f, b);
      await enviar({ semana: f, eleccion1: fila.eleccion1, eleccion2: fila.eleccion2, taperGlovo: fila.taperGlovo, noEstoy: fila.noEstoy });
      ponerVotoLocal(f, fila);
      setBorr((o) => { const n = { ...o }; delete n[f]; return n; });
      mostrarAviso(`Voto guardado: ${textoVoto(b)}`);
      enfocar("#voto-tit");
    } catch (e) {
      const t = `No se pudo guardar tu voto (${e.message || e}). Lo que has elegido sigue marcado: vuelve a intentarlo.`;
      setErrGuardar(t); anunciar(t, true); enfocar("#guardar");
    } finally {
      setGuardando(false);
    }
  };
  const retirar = async () => {
    const f = sem, v = votoDe(f);
    if (!v || guardando) return;
    const filaAntes = aFila(f, v);
    setGuardando(true); setErrGuardar("");
    try {
      await enviar({ accion: "retirar", semana: f });
      ponerVotoLocal(f, null);
      setBorr((o) => { const n = { ...o }; delete n[f]; return n; });
      mostrarAviso("Has retirado tu voto", {
        deshacer: async () => {
          setAviso(null);
          try { await enviar({ semana: f, eleccion1: filaAntes.eleccion1, eleccion2: filaAntes.eleccion2, taperGlovo: filaAntes.taperGlovo, noEstoy: filaAntes.noEstoy }); ponerVotoLocal(f, filaAntes); anunciar("Voto recuperado"); enfocar("#voto-tit"); }
          catch (e) { mostrarAviso(`No se pudo recuperar tu voto: ${e.message || e}`, { error: true }); }
        },
      });
      enfocar("#cm-deshacer");
    } catch (e) {
      const t = `No se pudo retirar tu voto (${e.message || e}).`;
      setErrGuardar(t); anunciar(t, true);
    } finally {
      setGuardando(false);
    }
  };

  const elegirRest = (n) => {
    if (guardando) return;
    const b = { ...borrador() };
    if (b.p1 === n) { b.p1 = b.p2; b.p2 = ""; }
    else if (b.p2 === n) b.p2 = "";
    else if (!b.p1) b.p1 = n;
    else b.p2 = n; // con las dos elegidas, cambia la 2ª
    setBorr((o) => ({ ...o, [sem]: b })); setErrGuardar("");
    anunciar(b.p1 ? `1ª: ${b.p1}${b.p2 ? `; 2ª: ${b.p2}` : ""}` : "Sin opción elegida");
  };
  const ponerEstado = (e, conFoco) => {
    if (guardando) return;
    setBorr((o) => ({ ...o, [sem]: { ...borrador(), e } })); setErrGuardar("");
    if (conFoco) enfocar(`[data-e="${e}"]`);
  };
  const ESTADOS = [["fuera", "Como fuera"], ["flex", "Me da igual"], ["taper", "Taper / Glovo"], ["no", "No estoy"]];
  const teclaEstado = (e, k) => {
    const ks = ESTADOS.map((x) => x[0]), i = ks.indexOf(k);
    const n = { Home: ks[0], End: ks[3], ArrowLeft: ks[(i + 3) % 4], ArrowUp: ks[(i + 3) % 4], ArrowRight: ks[(i + 1) % 4], ArrowDown: ks[(i + 1) % 4] }[e.key];
    if (!n) return;
    e.preventDefault(); ponerEstado(n, true);
  };
  const teclaTab = (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const n = e.key === "Home" ? "curso" : e.key === "End" ? "hist" : vista === "curso" ? "hist" : "curso";
    setVista(n); enfocar(`#cm-tab-${n}`);
  };

  /* ── Pintar ── */
  const cab = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex items-center gap-3.5">
        <span className="hub-placa hub-eq grid h-11 w-11 shrink-0 place-items-center rounded-[10px]"><IconoBBVA nombre="coffeeshop" size={28} /></span>
        <h1 className="font-display text-[clamp(26px,2.4vw,32px)] font-bold tracking-[-0.015em] text-sand">Comidas</h1>
      </div>
      <div className="mg-pest" role="tablist" aria-label="Comidas">
        {[["curso", "Próximos jueves"], ["hist", "Histórico"]].map(([k, t]) => (
          <button key={k} type="button" role="tab" id={`cm-tab-${k}`} aria-selected={vista === k} aria-controls="cm-panel" tabIndex={vista === k ? 0 : -1}
            onClick={() => setVista(k)} onKeyDown={teclaTab}>{t}</button>
        ))}
      </div>
    </div>
  );

  let cuerpo;
  if (!datos || team === null) cuerpo = <Esqueleto />;
  else if (datos.sinBackend) cuerpo = <p className="mg-vacio" role="alert">Falta configurar el backend de Comidas (clave «comidasBackend» de links.json).</p>;
  else if (datos.error) cuerpo = (
    <div className="mg-vacio flex flex-wrap items-center gap-3" role="alert">
      <span>No se pudieron cargar las votaciones. Comprueba la conexión y vuelve a intentarlo.</span>
      <button type="button" className="v-btn v-btn-l cm-44" onClick={() => { cargar(); enfocar("#cm-tab-curso"); }}>Reintentar</button>
    </div>
  );
  else if (vista === "hist") cuerpo = (
    <section className="cm-hist" aria-labelledby="cm-h-tit">
      <h2 id="cm-h-tit" tabIndex={-1} className="text-[18px] font-bold outline-none">Jueves anteriores</h2>
      {!pasadas.length ? <p className="mg-vacio">Aún no hay jueves pasados con votos.</p> : (
        <ul className="cm-hl">
          {pasadas.map((s) => {
            const c = recuento(votos, s.fecha, []);
            const g = c.rank[0];
            const mio = yo && c.vs.find((v) => esYo(v.quien));
            return (
              <li key={s.fecha}>
                <details>
                  <summary>
                    <b>{fCorta(s.fecha)}</b>
                    <span>{g ? <>Se fue a <b>{g[0]}</b></> : "Nadie eligió restaurante"}</span>
                    <span className="cm-r">{plural(c.fuera.length + c.flex.length, "comió fuera", "comieron fuera")}</span>
                    <span className="cm-flecha"><IconoBBVA nombre="fold" size={14} /></span>
                  </summary>
                  <div className="cm-det">
                    <span>Tú: {mio ? (mio.e === "fuera" ? `${mio.p1} (1ª)${mio.p2 ? `, ${mio.p2} (2ª)` : ""}` : textoVoto(mio)) : "no votaste"}</span>
                    {c.rank.length > 0 && <span>{c.rank.slice(0, 3).map(([n, x], i) => <span key={n}>{i ? " · " : ""}<b>{n}</b> {x.p} pts</span>)}</span>}
                    <span>{c.flex.length} se {c.flex.length === 1 ? "unió" : "unieron"} a lo más votado · {c.taper.length} taper o Glovo · {c.no.length} no {c.no.length === 1 ? "estaba" : "estaban"}</span>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
  else if (!votables.length || !sem) cuerpo = (
    <div className="mg-vacio flex flex-wrap items-center gap-3">
      <span>No hay jueves de oficina próximos. Cuando coordinación marque el siguiente, podrás votar aquí.</span>
      <button type="button" className="v-btn v-btn-l cm-44" onClick={() => { setVista("hist"); enfocar("#cm-h-tit"); }}>Ver el histórico</button>
    </div>
  );
  else {
    const c = recuento(votos, sem, restaurantes);
    const v = votoDe(sem), b = borrador();
    const listo = b.e !== "fuera" || !!b.p1;
    const cambiado = !igual(b, v) && (!!borr[sem] || !v);
    const mesa = c.fuera.length + c.flex.length;
    const votaron = new Set(c.vs.map((x) => clave(x.quien)));
    const faltan = equipo.filter((p) => !votaron.has(clave(p)));
    const emp = c.rank[1] && c.rank[1][1].p === c.rank[0][1].p && c.rank[1][1].n1.length === c.rank[0][1].n1.length;
    const frase = !c.n ? "Aún no ha votado nadie." : !c.rank.length
      ? `Nadie ha elegido restaurante todavía · ${c.taper.length} taper · ${c.no.length} no ${c.no.length === 1 ? "está" : "están"}`
      : <>{emp ? "Empate entre" : "Va ganando"} <b>{emp ? `${c.rank[0][0]} y ${c.rank[1][0]}` : c.rank[0][0]}</b> · <b>{mesa}</b> comen fuera{c.flex.length ? ` (${c.flex.length} ${c.flex.length === 1 ? "se une" : "se unen"} a lo más votado)` : ""}</>;
    const max = c.rank.length ? c.rank[0][1].p : 1;
    const bloq = guardando ? { "aria-disabled": true } : {};
    const sinYo = !yo;

    cuerpo = (
      <>
        <div className="cm-jueves" role="group" aria-label="Jueves de oficina">
          <span>Jueves</span>
          {votables.map((s) => {
            const n = votos.filter((x) => x.semana === s.fecha).length;
            return (
              <button key={s.fecha} type="button" className="v-chip cm-chip" aria-pressed={sem === s.fecha} onClick={() => { setSem(s.fecha); setErrGuardar(""); }}>
                {fCorta(s.fecha)}<small>{n ? ` · ${plural(n, "voto", "votos")}` : ""}{sinGuardar(s.fecha) ? " · sin guardar" : votoDe(s.fecha) ? " · ya votaste" : ""}</small>
              </button>
            );
          })}
        </div>
        <p className="cm-movil"><span>{frase}</span> <a href="#cm-va-tit">Ver cómo va</a></p>

        <div className="cm-rej">
          {/* ── Tu voto ── */}
          <section className="cm-voto" aria-labelledby="voto-tit" aria-busy={guardando || undefined}>
            <div className="mg-cab">
              <h2 id="voto-tit" tabIndex={-1} className="outline-none">Tu voto · {fLarga(sem)}</h2>
              <div className="cm-seg" role="radiogroup" aria-label="¿Qué vas a hacer?">
                {ESTADOS.map(([k, t]) => (
                  <button key={k} type="button" role="radio" data-e={k} aria-checked={b.e === k} tabIndex={b.e === k ? 0 : -1} {...bloq}
                    onClick={() => ponerEstado(k)} onKeyDown={(e) => teclaEstado(e, k)}>{t}</button>
                ))}
              </div>
            </div>
            {sinYo ? (
              <p className="mg-error">No te encuentro en el equipo con {email}: pide a coordinación que te den de alta para poder votar.</p>
            ) : v ? (
              <div className="cm-estado"><IconoBBVA nombre="checkmark" size={18} /><span><b>Ya has votado:</b> {textoVoto(v)}</span>{sinGuardar() ? <span className="cm-cambios">Tienes cambios sin guardar</span> : <span className="v-nota">Puedes cambiarlo cuando quieras.</span>}</div>
            ) : (
              <div className="cm-estado cm-sin"><span><b>Aún no has votado</b> para el {fLarga(sem)}.</span>{borr[sem] && listo ? <span className="cm-cambios">Elige y guarda tu voto</span> : null}</div>
            )}
            {b.e === "fuera" ? (
              <>
                <p className="cm-lbl" id="cm-rest-lbl">{!b.p1 ? "Pulsa tu 1ª opción" : !b.p2 ? "Ahora, si quieres, tu 2ª opción" : "Pulsa otro para cambiar la 2ª, o uno marcado para quitarlo"}</p>
                <div className="cm-rests" role="group" aria-labelledby="cm-rest-lbl">
                  {restaurantes.map((r) => {
                    const k = b.p1 === r.nombre ? "1ª" : b.p2 === r.nombre ? "2ª" : "";
                    const x = c.pts[r.nombre] || { p: 0, n1: [], n2: [] }, nv = x.n1.length + x.n2.length;
                    return (
                      <div key={r.nombre} className={`cm-rc${k ? " cm-sel" : ""}`}>
                        <button type="button" aria-pressed={!!k} {...bloq} disabled={sinYo}
                          aria-label={`${r.nombre}${r.descCorta ? `, ${r.descCorta}` : ""}${k ? `, tu ${k} opción` : ""}${x.p ? `, ${x.p} puntos` : ""}`}
                          onClick={() => elegirRest(r.nombre)}>
                          <span className="cm-nom"><b>{r.nombre}</b>{k && <span className={`cm-marca ${k === "1ª" ? "cm-m1" : "cm-m2"}`}>{k}</span>}</span>
                          {r.descCorta && <span className="cm-coc">{r.descCorta}</span>}
                          <span className="cm-dato">{x.p ? <><b>{x.p}</b> pts · {plural(nv, "voto", "votos")}</> : ultima[r.nombre] ? `Última vez: ${ultima[r.nombre]}` : ""}</span>
                        </button>
                        {r.carta && <a className="cm-carta" href={r.carta} target="_blank" rel="noopener noreferrer" aria-label={`Carta de ${r.nombre} (se abre en otra pestaña)`}>Carta</a>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="cm-otra">
                {b.e === "flex"
                  ? <>Te unes a lo que más se vote{c.rank[0] ? <>: ahora mismo, <b>{c.rank[0][0]}</b></> : ". Aún no ha votado nadie un restaurante."}</>
                  : b.e === "taper" ? "Comes en la oficina (taper o Glovo): cuentas en el recuento, pero no en la mesa." : "Ese jueves no estás: no cuentas para la reserva."}
              </p>
            )}
            {errGuardar && <p className="mg-error" id="cm-err" role="alert">{errGuardar}</p>}
            {(cambiado || guardando || v) && !sinYo && (
              <div className="cm-acc">
                {(cambiado || guardando) && (
                  <>
                    <button type="button" id="guardar" className="v-btn v-btn-p mg-enviar" {...bloq}
                      aria-disabled={!listo || guardando || undefined} aria-describedby={!listo ? "cm-pista" : undefined}
                      onClick={() => { if (listo && !guardando) guardar(); }}>
                      <IconoBBVA nombre="checkmark" size={18} />{guardando ? "Guardando…" : v ? "Guardar el cambio" : "Guardar mi voto"}
                    </button>
                    {!listo && <span className="v-nota" id="cm-pista">Elige tu 1ª opción para guardar.</span>}
                  </>
                )}
                {v && <button type="button" className="v-btn v-btn-t cm-44" {...bloq} onClick={() => { if (!guardando) retirar(); }}>Retirar mi voto</button>}
                {v && sinGuardar() && <button type="button" className="v-btn v-btn-t cm-44" {...bloq} onClick={() => { setBorr((o) => { const n = { ...o }; delete n[sem]; return n; }); anunciar("Cambios descartados"); enfocar("#voto-tit"); }}>Descartar cambios</button>}
              </div>
            )}
          </section>

          {/* ── Cómo va ── */}
          <section className="cm-va" aria-labelledby="cm-va-tit">
            <h2 id="cm-va-tit" tabIndex={-1} className="outline-none">Cómo va el {fLarga(sem)}</h2>
            <p className="cm-lider">{frase}</p>
            <p className="v-nota"><b>{c.n}</b> de {equipo.length} han votado.</p>
            {c.rank.length > 0 && (
              <>
                <ol className="cm-rank" aria-label="Restaurantes por puntos">
                  {c.rank.slice(0, 5).map(([n, x]) => (
                    <li key={n}>
                      <b>{n}</b>
                      <span className="cm-barra" aria-hidden="true"><i style={{ width: `${(x.p / max) * 100}%` }} /></span>
                      <span className="cm-pts"><b>{x.p}</b> pts</span>
                      <span className="cm-quien">{lista(x.n1.map(quienTxt))}{x.n2.length ? `${x.n1.length ? " · " : ""}2ª: ${lista(x.n2.map(quienTxt))}` : ""}</span>
                    </li>
                  ))}
                </ol>
                <p className="v-nota">La 1ª opción cuenta 2 puntos y la 2ª, 1. Si empatan, gana el que tiene más 1ªs.</p>
              </>
            )}
            {(c.flex.length + c.taper.length + c.no.length) > 0 && (
              <ul className="cm-grupos">
                {[[c.flex, c.flex.length === 1 ? "se une a lo más votado" : "se unen a lo más votado"], [c.taper, "taper o Glovo"], [c.no, c.no.length === 1 ? "no está" : "no están"]].filter(([g]) => g.length).map(([g, t]) => (
                  <li key={t}><b>{g.length}</b> {t} <span>· {lista(g.map(quienTxt))}</span></li>
                ))}
              </ul>
            )}
            {faltan.length ? (
              <details open={faltan.length <= 15}>
                <summary>Faltan por votar ({faltan.length})</summary>
                <p>{lista(faltan.map(quienTxt))}</p>
              </details>
            ) : <p className="v-nota">Ya ha votado todo el equipo.</p>}
          </section>
        </div>
      </>
    );
  }

  return (
    <main className="vacu gu mg cm mx-auto flex w-full max-w-[1376px] flex-col gap-4 px-4 pb-10 pt-cabecera sm:px-8">
      {cab}
      <div id="cm-panel" role="tabpanel" aria-labelledby={`cm-tab-${vista}`} className="flex flex-col gap-4">{cuerpo}</div>
      <div className="gu-envios" aria-live="off">
        {aviso && (
          <div className={`gu-envio${aviso.error ? " gu-envio-error" : ""}`}
            onMouseEnter={() => aviso.deshacer && clearTimeout(avisoT.current)} onMouseLeave={() => aviso.deshacer && programarAviso(10000)}
            onFocus={() => aviso.deshacer && clearTimeout(avisoT.current)} onBlur={() => aviso.deshacer && programarAviso(10000)}>
            <span>{aviso.texto}</span>
            {aviso.deshacer && <button type="button" id="cm-deshacer" onClick={aviso.deshacer}>Deshacer</button>}
          </div>
        )}
      </div>
      <div className="sr" role="status" aria-live="polite" aria-atomic="true">{!anuncio.urgente ? anuncio.t : ""}</div>
      <div className="sr" role="alert" aria-atomic="true">{anuncio.urgente ? anuncio.t : ""}</div>
    </main>
  );
}
