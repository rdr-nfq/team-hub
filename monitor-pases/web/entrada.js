// Monitor de pases · inicio de sesión con GitHub BBVA y GitHub NFQ (a través
// del gestor de credenciales de Git: la misma sesión que usa git pull).
import { html, useState, useEffect } from "./vendor/preact-htm.mjs";
import { api, BotonTema, Icono, Marca } from "./comun.js";

const NOMBRE = { bbva: "GitHub BBVA", nfq: "GitHub NFQ" };
const PARA = {
  bbva: "Para leer los repositorios, los commits, las Actions y los DPs.",
  nfq: "Para publicar los DPs y los pases en rdr-nfq/pases-datos.",
};

export function FilaSesion({ quien, s, host, onIniciar, onCerrar }) {
  const e = s?.estado || "sin sesión";
  const iniciando = e === "iniciando";
  return html`<div class="fila-sesion ${e === "iniciada" ? "ok" : ""}">
    <span class="ico-sesion" aria-hidden="true"><${Icono} n=${e === "iniciada" ? "ok" : "candado"} /></span>
    <div class="t">
      <b>${NOMBRE[quien]}</b> <span class="mono tenue">${host}</span>
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

export function PantallaEntrada({ estado, entrar, tema, cambiarTema }) {
  const [ses, setSes] = useState(estado.sesion);
  const [hosts, setHosts] = useState({ bbva: "bbva.ghe.com", nfq: "github.com" });
  useEffect(() => { api("config").then((c) => setHosts({ bbva: c.bbva.host, nfq: c.nfq.host || "github.com" }), () => {}); }, []);
  const ocupado = Object.values(ses || {}).some((s) => s.estado === "iniciando");
  useEffect(() => {
    const t = setTimeout(() => api("sesion").then(setSes, () => {}), ocupado ? 800 : 3000);
    return () => clearTimeout(t);
  }, [ses]);
  const bbva = ses?.bbva?.estado === "iniciada", nfq = ses?.nfq?.estado === "iniciada";
  useEffect(() => { if (bbva && nfq) entrar(); }, [bbva, nfq]);
  const iniciar = (quien) => api("sesion/iniciar", { quien }).then(() => api("sesion").then(setSes), () => {});
  return html`<div class="entrada">
    <div class="caja-entrada">
      <div class="cab-entrada"><div class="marca grande"><${Marca} /> Monitor de pases ${estado.demo ? html`<small>Demo</small>` : ""}</div>
        <${BotonTema} tema=${tema} cambiar=${cambiarTema} /></div>
      <h1>Inicia sesión</h1>
      <p class="suave">Con tus cuentas de GitHub de BBVA y de NFQ. Se abre la ventana de inicio de sesión de GitHub, como con Copilot;
        si ya la tienes iniciada en Git, entra directamente.</p>
      <${FilaSesion} quien="bbva" s=${ses?.bbva} host=${hosts.bbva} onIniciar=${() => iniciar("bbva")} />
      <${FilaSesion} quien="nfq" s=${ses?.nfq} host=${hosts.nfq} onIniciar=${() => iniciar("nfq")} />
      <div class="pie-entrada">
        <button class="btn btn-pri" disabled=${!bbva} onClick=${entrar}>${nfq || !bbva ? "Entrar" : "Entrar sin GitHub NFQ"}</button>
        ${bbva && !nfq ? html`<span class="tenue">Sin NFQ no se publican los DPs ni los pases.</span>` : ""}
      </div>
      <p class="nota-entrada">La sesión la gestiona Git (Git Credential Manager): es la misma con la que haces <span class="mono">git pull</span>.
        La app no guarda tu token. Si no puedes iniciar sesión así, pon un token personal en Ajustes.</p>
    </div>
  </div>`;
}
