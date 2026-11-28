// Prueba de la extensión con un VS Code simulado (sin descargar VS Code): se activa,
// registra sus comandos, «Probar la demo» arranca el motor y abre el panel con la app,
// el panel pasa los enlaces y el portapapeles a VS Code, y al desactivarse para el motor.
//   node prueba-extension.js
"use strict";
const assert = require("assert");
const Module = require("module");
const path = require("path");

const comandos = {}, abiertos = [], copiados = [], paneles = [], errores = [], ejecutados = [], proveedores = [];
let config = {};
const evento = () => { const fs = []; const f = (cb) => { fs.push(cb); return { dispose() {} }; }; f.fire = (x) => fs.forEach((cb) => cb(x)); return f; };
const vscode = {
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1 },
  ConfigurationTarget: { Global: 1 },
  Uri: { parse: (s) => ({ toString: () => s, s }), file: (f) => ({ fsPath: f, toString: () => "file://" + f }) },
  env: {
    asExternalUri: async (u) => u,
    openExternal: async (u) => { abiertos.push(u.toString()); return true; },
    clipboard: { writeText: async (t) => { copiados.push(t); } },
  },
  workspace: { getConfiguration: () => ({ get: (k) => config[k], update: async (k, v) => { config[k] = v; } }) },
  commands: {
    registerCommand: (id, fn) => { comandos[id] = fn; return { dispose() {} }; },
    executeCommand: (id, ...a) => { ejecutados.push(id); return comandos[id] && comandos[id](...a); },
  },
  window: {
    activeColorTheme: { kind: 2 },
    onDidChangeActiveColorTheme: evento(),
    createOutputChannel: () => ({ appendLine: (l) => process.env.VERBOSO && console.log("  " + l), show() {} }),
    createStatusBarItem: () => ({ show() {}, text: "", tooltip: "", command: "" }),
    showErrorMessage: async (m) => { errores.push(m); return undefined; },
    showInformationMessage: async () => undefined,
    setStatusBarMessage: () => ({ dispose() {} }),
    registerWebviewViewProvider: (id, p) => { proveedores.push(p); return { dispose() {} }; },
    createWebviewPanel: (tipo, titulo) => {
      const recibir = evento(), cerrar = evento();
      const p = { tipo, titulo, enviados: [], webview: { html: "", onDidReceiveMessage: recibir, postMessage: async (m) => p.enviados.push(m) },
        onDidDispose: cerrar, reveal() {}, dispose() { cerrar.fire(); }, recibir };
      paneles.push(p);
      return p;
    },
    showOpenDialog: async () => undefined,
  },
};
const cargar = Module._load;
Module._load = function (req, ...r) { return req === "vscode" ? vscode : cargar.call(this, req, ...r); };

(async () => {
  const ext = require("./extension");
  const subs = [];
  ext.activate({ extensionPath: __dirname, subscriptions: subs });
  for (const c of ["monitorPases.abrir", "monitorPases.abrirDemo", "monitorPases.iniciarJira", "monitorPases.sincronizar", "monitorPases.detener"])
    assert.ok(comandos[c], "comando " + c);
  await comandos["monitorPases.abrirDemo"]();
  assert.strictEqual(paneles.length, 1, "un panel");
  // Pulsar el icono de la barra de actividad abre la app directamente y recoge la barra lateral.
  const visible = evento();
  proveedores[0].resolveWebviewView({ visible: true, webview: { options: {}, html: "", onDidReceiveMessage: evento(), postMessage: async () => true },
    onDidDispose: evento(), onDidChangeVisibility: visible });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(ejecutados.includes("monitorPases.abrir") && ejecutados.includes("workbench.action.closeSidebar"), "icono -> app: " + ejecutados);
  assert.strictEqual(paneles.length, 1, "reutiliza el panel");
  const html = paneles[0].webview.html;
  const m = /<iframe id="app" src="([^"]+)"/.exec(html);
  assert.ok(m && /^http:\/\/127\.0\.0\.1:\d+\/\?vscode=1&tema=dark$/.test(m[1]), "iframe con la app: " + (m && m[1]));
  assert.ok(/frame-src [^;]*127\.0\.0\.1/.test(html) && /script-src 'nonce-/.test(html), "CSP del panel");
  // Lo que manda la app desde el panel
  paneles[0].recibir.fire({ deMonitor: true, tipo: "abrir", url: "https://bbva.ghe.com/free" });
  paneles[0].recibir.fire({ deMonitor: true, tipo: "abrir", url: "javascript:alert(1)" });  // no se abre
  paneles[0].recibir.fire({ deMonitor: true, tipo: "copiar", texto: "DP-KYTL-1" });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepStrictEqual(abiertos, ["https://bbva.ghe.com/free"]);
  assert.deepStrictEqual(copiados, ["DP-KYTL-1"]);
  // El tema de VS Code llega a la app
  vscode.window.activeColorTheme.kind = 1;
  vscode.window.onDidChangeActiveColorTheme.fire();
  assert.deepStrictEqual(paneles[0].enviados.pop(), { paraMonitor: true, tipo: "tema", tema: "light" });
  assert.deepStrictEqual(errores, [], "sin errores hasta aquí");
  // «Actualizar ahora» llama a la API del motor con su clave (la demo, sin sesiones, contesta que falta configurar)
  await comandos["monitorPases.sincronizar"]();
  assert.ok(errores.length === 0 || /configura/.test(errores[0]), "respuesta del motor: " + errores[0]);
  // Al cerrar VS Code se para el motor
  await ext.deactivate();
  console.log("OK: extensión (comandos, panel, puente, tema, API y parada)");
  setTimeout(() => process.exit(0), 200);
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
