// Monitor de pases · plugin de VS Code. Arranca el motor (Python, en «motor/»)
// con el Python de la VDI y enseña la app en un panel de VS Code. El inicio de
// sesión en Jira abre Chrome (o Edge) desde el motor, como en la app de siempre.
"use strict";

const vscode = require("vscode");
const path = require("path");
const crypto = require("crypto");
const M = require("./motor");

let ctx = null;
let salida = null;      // canal «Monitor de pases» (registro del motor)
let barra = null;       // botón de la barra de estado
let motor = null;       // { proc, url, puerto, version, propio, demo }
let arrancando = null;  // promesa del arranque en curso
let clave = null;
let panel = null;       // panel con la app
let lateral = null;     // vista de la barra lateral

const conf = () => vscode.workspace.getConfiguration("monitorPases");
const temaVS = () => ([vscode.ColorThemeKind.Light, vscode.ColorThemeKind.HighContrastLight].includes(vscode.window.activeColorTheme.kind) ? "light" : "dark");
const log = (l) => salida && salida.appendLine(l);

function estadoBarra(texto, tooltip) {
  barra.text = texto;
  barra.tooltip = tooltip;
  if (lateral) lateral.webview.postMessage({ tipo: "estado", motor: motor && { url: motor.url, version: motor.version, demo: motor.demo }, texto: tooltip });
}

/* ── Motor ── */
async function asegurarMotor({ demo = false } = {}) {
  if (motor && motor.demo === demo && await M.vivo(motor.url)) return motor;
  if (motor && motor.demo !== demo) await detener();
  if (arrancando) return arrancando;
  arrancando = (async () => {
    estadoBarra("$(sync~spin) Monitor de pases", "Arrancando el motor…");
    const propio = String(conf().get("python") || "").trim();
    let python;
    try {
      python = await M.buscarPython(propio ? [[propio]] : []);
    } catch (e) {
      const elegir = "Elegir Python…";
      vscode.window.showErrorMessage(`Monitor de pases: ${e.message} Indica la ruta de python.exe en Ajustes (monitorPases.python).`, elegir, "Abrir Ajustes")
        .then((r) => {
          if (r === elegir) elegirPython();
          else if (r) vscode.commands.executeCommand("workbench.action.openSettings", "monitorPases.python");
        });
      throw e;
    }
    log(`Python ${python.version}: ${python.ruta}`);
    const m = await M.arrancarMotor({
      dir: path.join(ctx.extensionPath, "motor"), python, demo, puerto: Number(conf().get("puerto")) || 0, log,
    });
    motor = m;
    clave = null;
    if (m.proc) m.proc.on("exit", () => { if (motor === m) { motor = null; estadoBarra("$(circle-slash) Monitor de pases", "Motor parado: pulsa para abrirlo"); } });
    estadoBarra(`$(git-pull-request) Monitor de pases${demo ? " (demo)" : ""}`, `Motor ${m.version} en ${m.url}${m.propio ? "" : " (abierto por otra ventana)"}`);
    return m;
  })();
  try { return await arrancando; } finally { arrancando = null; }
}

async function detener() {
  const m = motor;
  motor = null;
  clave = null;
  if (m && m.proc && m.proc.exitCode == null) {
    try { m.proc.kill(); } catch { /* ya terminado */ }
  }
  if (barra) estadoBarra("$(circle-slash) Monitor de pases", "Motor parado: pulsa para abrirlo");
}

async function llamar(ruta, cuerpo) {
  const m = await asegurarMotor({ demo: !!(motor && motor.demo) });
  if (!clave) clave = await M.leerClave(m.url);
  try {
    return await M.api(m.url, clave, ruta, cuerpo);
  } catch (e) {
    if (/Clave/.test(e.message)) { clave = await M.leerClave(m.url); return M.api(m.url, clave, ruta, cuerpo); }
    throw e;
  }
}

/* ── Panel con la app ── */
function htmlPanel(webview, url) {
  const nonce = crypto.randomBytes(16).toString("base64");
  const src = `${url}${url.includes("?") ? "&" : "?"}vscode=1&tema=${temaVS()}`;
  const origen = new URL(url).origin;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origen} http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;overflow:hidden;background:var(--vscode-editor-background)}</style>
</head><body><iframe id="app" src="${src}" title="Monitor de pases" allow="clipboard-read; clipboard-write"></iframe>
<script nonce="${nonce}">
  const vs = acquireVsCodeApi();
  const app = document.getElementById("app");
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (e.source === app.contentWindow && d.deMonitor) vs.postMessage(d);      // de la app a VS Code
    else if (e.source !== app.contentWindow && d.paraMonitor) app.contentWindow.postMessage(d, "*");  // de VS Code a la app
  });
</script></body></html>`;
}

async function abrirPanel({ demo = false } = {}) {
  let m;
  try { m = await asegurarMotor({ demo }); } catch (e) {
    vscode.window.showErrorMessage("Monitor de pases: " + e.message, "Ver el registro").then((r) => r && salida.show());
    return;
  }
  const externa = (await vscode.env.asExternalUri(vscode.Uri.parse(m.url))).toString();
  if (panel) {
    if (panel.mpUrl !== externa) { panel.webview.html = htmlPanel(panel.webview, externa); panel.mpUrl = externa; }
    panel.reveal();
    return;
  }
  panel = vscode.window.createWebviewPanel("monitorPases", "Monitor de pases", vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true });
  panel.iconPath = vscode.Uri.file(path.join(ctx.extensionPath, "media", "icono.png"));
  panel.mpUrl = externa;
  panel.webview.html = htmlPanel(panel.webview, externa);
  panel.webview.onDidReceiveMessage((d) => {
    if (d.tipo === "abrir" && /^https?:\/\//i.test(String(d.url || ""))) vscode.env.openExternal(vscode.Uri.parse(d.url));
    else if (d.tipo === "copiar" && typeof d.texto === "string") vscode.env.clipboard.writeText(d.texto).then(() => vscode.window.setStatusBarMessage("Copiado", 2000));
  });
  panel.onDidDispose(() => { panel = null; });
}

/* ── Barra lateral: estado y accesos ── */
class Lateral {
  resolveWebviewView(view) {
    lateral = view;
    view.webview.options = { enableScripts: true };
    const nonce = crypto.randomBytes(16).toString("base64");
    view.webview.html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:4px 2px}
  button{display:flex;align-items:center;gap:6px;width:100%;margin:0 0 6px;padding:6px 10px;border:0;border-radius:2px;cursor:pointer;
    background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);font:inherit;text-align:left}
  button:hover{background:var(--vscode-button-secondaryHoverBackground)}
  button.pri{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  button.pri:hover{background:var(--vscode-button-hoverBackground)}
  p{margin:0 0 10px;opacity:.85;line-height:1.4}
  .estado{font-size:12px;opacity:.75;margin-top:10px}
</style></head><body>
  <p>GitHub BBVA, Jira, DPs y el pase, sin salir de VS Code.</p>
  <button class="pri" data-c="monitorPases.abrir">Abrir el monitor</button>
  <button data-c="monitorPases.iniciarJira">Iniciar sesión en Jira (abre Chrome)</button>
  <button data-c="monitorPases.sincronizar">Actualizar ahora</button>
  <button data-c="monitorPases.abrirNavegador">Abrir en el navegador</button>
  <button data-c="monitorPases.verRegistro">Ver el registro</button>
  <button data-c="monitorPases.abrirDemo">Probar la demo (datos inventados)</button>
  <div class="estado" id="estado">Motor parado.</div>
<script nonce="${nonce}">
  const vs = acquireVsCodeApi();
  document.querySelectorAll("button[data-c]").forEach((b) => b.addEventListener("click", () => vs.postMessage({ comando: b.dataset.c })));
  window.addEventListener("message", (e) => { if (e.data && e.data.tipo === "estado") document.getElementById("estado").textContent = e.data.texto || ""; });
</script></body></html>`;
    view.webview.onDidReceiveMessage((d) => d && d.comando && vscode.commands.executeCommand(d.comando));
    view.onDidDispose(() => { lateral = null; });
    // Al pulsar el icono de la barra de actividad se abre la app directamente (y se recoge la barra lateral).
    const alVer = () => {
      if (!view.visible || conf().get("abrirAlPulsarIcono") === false) return;
      vscode.commands.executeCommand("monitorPases.abrir");
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    };
    if (view.onDidChangeVisibility) view.onDidChangeVisibility(alVer);
    alVer();
    estadoBarra(barra.text, barra.tooltip);
  }
}

async function elegirPython() {
  const r = await vscode.window.showOpenDialog({ canSelectMany: false, title: "Elige python.exe (3.8 o superior)",
    filters: process.platform === "win32" ? { Python: ["exe"] } : undefined });
  if (!r || !r[0]) return;
  const ok = await M.probarPython([r[0].fsPath]);
  if (!ok) { vscode.window.showErrorMessage("Ese Python no vale: hace falta la versión 3.8 o superior."); return; }
  await conf().update("python", r[0].fsPath, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`Monitor de pases usará Python ${ok.version}.`);
}

function activate(context) {
  ctx = context;
  salida = vscode.window.createOutputChannel("Monitor de pases");
  barra = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  barra.command = "monitorPases.abrir";
  estadoBarra("$(git-pull-request) Monitor de pases", "Abrir el Monitor de pases");
  barra.show();
  const cmd = (id, fn) => context.subscriptions.push(vscode.commands.registerCommand(id, async (...a) => {
    try { await fn(...a); } catch (e) { vscode.window.showErrorMessage("Monitor de pases: " + e.message, "Ver el registro").then((r) => r && salida.show()); }
  }));
  cmd("monitorPases.abrir", () => abrirPanel({ demo: false }));
  cmd("monitorPases.abrirDemo", () => abrirPanel({ demo: true }));
  cmd("monitorPases.iniciarJira", async () => {
    await abrirPanel({ demo: !!(motor && motor.demo) });
    await llamar("jira/navegador", {});
    vscode.window.showInformationMessage("Se ha abierto Jira en Chrome (o Edge): entra como siempre. La ventana se cierra sola al terminar.");
  });
  cmd("monitorPases.sincronizar", async () => {
    const r = await llamar("sincronizar", {});
    vscode.window.setStatusBarMessage(r && r.pedida === false ? "Ya hay una sincronización en marcha" : "Actualizando el Monitor de pases…", 4000);
  });
  cmd("monitorPases.abrirNavegador", async () => {
    const m = await asegurarMotor({ demo: !!(motor && motor.demo) });
    vscode.env.openExternal(vscode.Uri.parse(m.url));
  });
  cmd("monitorPases.verRegistro", () => salida.show());
  cmd("monitorPases.carpetaDatos", () => vscode.env.openExternal(vscode.Uri.file(M.carpetaDatos())));
  cmd("monitorPases.elegirPython", elegirPython);
  cmd("monitorPases.reiniciar", async () => { const demo = !!(motor && motor.demo); await detener(); await abrirPanel({ demo }); });
  cmd("monitorPases.detener", async () => { await detener(); if (panel) panel.dispose(); });
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("monitorPases.inicio", new Lateral()));
  context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
    if (panel) panel.webview.postMessage({ paraMonitor: true, tipo: "tema", tema: temaVS() });
  }));
  context.subscriptions.push({ dispose: () => { detener(); } });
  if (conf().get("abrirAlIniciar")) abrirPanel({ demo: false });
}

function deactivate() { return detener(); }

module.exports = { activate, deactivate };
