// RDR Coding · inicio de sesión con GitHub BBVA y GitHub NFQ (a través
// del gestor de credenciales de Git: la misma sesión que usa git pull).
import { html, useState, useEffect } from "./vendor/preact-htm.mjs";
import { api, BotonTema, Icono, Marca } from "./comun.js";
import { ConectarJira } from "./jira.js";

const NOMBRE = { bbva: "GitHub BBVA", nfq: "GitHub NFQ" };
const PARA = {
  bbva: "Para leer los repositorios, los commits, las Actions y los DPs.",
  nfq: "Para publicar los DPs y los pases en rdr-nfq/pases-datos.",
};

export function FilaSesion({ quien, s, host, onIniciar, onCerrar, paso, etiqueta }) {
  const e = s?.estado || "sin sesión";
  const iniciando = e === "iniciando";
  return html`<div class="fila-sesion ${e === "iniciada" ? "ok" : ""}">
    <span class="ico-sesion" aria-hidden="true">${e === "iniciada" ? html`<${Icono} n="ok" />` : paso ? html`<b class="num-paso">${paso}</b>` : html`<${Icono} n="candado" />`}</span>
    <div class="t">
      <b>${NOMBRE[quien]}</b> <span class="mono tenue">${host}</span> ${etiqueta ? html`<span class="chip chip-borde">${etiqueta}</span>` : ""}
      <span>${e === "iniciada" ? html`Conectado como <b>${s.usuario}</b>${s.nombre ? ` (${s.nombre})` : ""}`
        : iniciando ? (s.interactiva ? "Termina el inicio de sesión en la ventana de GitHub que se ha abierto…" : "Comprobando si ya tienes sesión…")
        : PARA[quien]}</span>
      ${e === "error" && html`<span class="error-sesion" role="alert">${s.error}${s.pista ? " " + s.pista : ""}</span>`}
    </div>
    ${e === "iniciada"
      ? onCerrar && html`<button class="btn btn-s" onClick=${onCerrar}>Cerrar sesión</button>`
      : html`<button class="btn ${quien === "bbva" ? "btn-pri" : ""}" disabled=${iniciando} onClick=${onIniciar}>
          ${iniciando ? html`<${Icono} n="actualizar" cls="gira" /> Esperando…` : "Iniciar sesión"}</button>`}
  </div>`;
}

const SIN_NFQ = "mp-entrar-sin-nfq";
const leerSinNfq = () => { try { return localStorage.getItem(SIN_NFQ) === "1"; } catch { return false; } };

export function PantallaEntrada({ estado, entrar, tema, cambiarTema, jira, recargarJira, abrirAyuda }) {
  const [ses, setSes] = useState(estado.sesion);
  const [hosts, setHosts] = useState({ bbva: "bbva.ghe.com", nfq: "github.com" });
  const [cadena, setCadena] = useState(false);  // «Conectar todo»: una tras otra
  const [hechos, setHechos] = useState([]);     // pasos ya lanzados por la cadena (no se repiten si fallan)
  useEffect(() => { api("config").then((c) => setHosts({ bbva: c.bbva.host, nfq: c.nfq.host || "github.com" }), () => {}); }, []);
  const ej = ses?.jira?.estado;
  const conJira = !!jira?.url;
  const ocupado = Object.values(ses || {}).some((s) => s?.estado === "iniciando") || ej === "entrando" || ej === "comprobando";
  useEffect(() => {
    const t = setTimeout(() => api("sesion").then(setSes, () => {}), ocupado || cadena ? 800 : 3000);
    return () => clearTimeout(t);
  }, [ses]);
  const bbva = ses?.bbva?.estado === "iniciada", nfq = ses?.nfq?.estado === "iniciada";
  const jiraOk = !conJira || ej === "iniciada";
  const obligatorias = bbva && jiraOk;
  const comprobando = ses?.bbva?.estado === "iniciando" && !ses?.bbva?.interactiva || ej === "comprobando";
  // Dentro solo con las de BBVA (GitHub y Jira); la de NFQ, si la hay o si la persona ya eligió entrar sin ella.
  useEffect(() => { if (obligatorias && (nfq || (leerSinNfq() && ses?.nfq?.estado !== "iniciando"))) entrar(); }, [obligatorias, nfq, ses?.nfq?.estado]);
  const iniciar = (quien) => api("sesion/iniciar", { quien }).then(() => api("sesion").then(setSes), () => {});
  const iniciarJira = () => api("jira/navegador", {}).then(() => api("sesion").then(setSes), () => {});
  // «Conectar todo»: GitHub BBVA → Jira → GitHub NFQ, esperando a que acabe cada una.
  useEffect(() => {
    if (!cadena || ocupado) return;
    const sig = !bbva ? "bbva" : !jiraOk ? "jira" : !nfq ? "nfq" : null;
    if (!sig || hechos.includes(sig)) { setCadena(false); return; }
    setHechos((h) => [...h, sig]);
    if (sig === "jira") iniciarJira(); else iniciar(sig);
  }, [cadena, ses]);
  const faltan = [!bbva, conJira && !jiraOk, !nfq].filter(Boolean).length;
  const entrarSinNfq = () => { try { localStorage.setItem(SIN_NFQ, "1"); } catch { /* sin almacenamiento */ } entrar(); };
  return html`<div class="entrada">
    <div class="caja-entrada">
      <div class="cab-entrada"><div class="marca grande"><${Marca} /> RDR Coding ${estado.demo ? html`<small>Demo</small>` : html`<small>by NFQ</small>`}</div>
        <span class="acc-entrada"><button class="btn-tema" onClick=${abrirAyuda} title="Manual y ayuda (F1)" aria-label="Abrir el manual y la ayuda (F1)"><${Icono} n="ayuda" /></button>
        <${BotonTema} tema=${tema} cambiar=${cambiarTema} /></span></div>
      <h1>Inicia sesión</h1>
      <p class="suave">Hacen falta tus cuentas de <b>BBVA</b>: GitHub BBVA y Jira. La de GitHub NFQ es para publicar los DPs y los pases.
        Se hace una vez: después la app entra sola.</p>
      ${faltan > 0 && html`<div class="todo-entrada">
        <button class="btn btn-pri" onClick=${() => { setHechos([]); setCadena(true); }} disabled=${cadena || comprobando}>
          ${cadena ? html`<${Icono} n="actualizar" cls="gira" /> Conectando…` : comprobando ? html`<${Icono} n="actualizar" cls="gira" /> Comprobando tus sesiones…` : html`<${Icono} n="ok" /> Conectar todo`}</button>
        <span class="tenue">${cadena ? "Sigue las ventanas que se abren, una tras otra." : "Abre, una tras otra, las ventanas de inicio de sesión que falten. Entras como siempre."}</span>
      </div>`}
      <${FilaSesion} quien="bbva" paso="1" etiqueta="obligatoria" s=${ses?.bbva} host=${hosts.bbva} onIniciar=${() => iniciar("bbva")} />
      ${conJira ? html`<${ConectarJira} estado=${{ sesion: ses }} jira=${jira} paso="2" etiqueta="obligatoria" recargar=${() => { recargarJira(); api("sesion").then(setSes, () => {}); }} compacto />` : ""}
      <${FilaSesion} quien="nfq" paso=${conJira ? "3" : "2"} etiqueta="opcional" s=${ses?.nfq} host=${hosts.nfq} onIniciar=${() => iniciar("nfq")} />
      <div class="pie-entrada">
        <button class="btn btn-pri" disabled=${!obligatorias} onClick=${nfq ? entrar : entrarSinNfq}>${nfq || !obligatorias ? "Entrar" : "Entrar sin GitHub NFQ"}</button>
        ${!obligatorias ? html`<span class="tenue">Para entrar hacen falta ${[!bbva && "GitHub BBVA", conJira && !jiraOk && "Jira"].filter(Boolean).join(" y ")}.</span>`
          : !nfq ? html`<span class="tenue">Sin NFQ no se publican los DPs ni los pases. Puedes conectarla luego en Ajustes.</span>` : ""}
      </div>
      <p class="nota-entrada">GitHub va con Git (Git Credential Manager): la misma sesión con la que haces <span class="mono">git pull</span>.
        Jira, con tu sesión del navegador. La app no guarda contraseñas ni tokens en disco.</p>
    </div>
  </div>`;
}
