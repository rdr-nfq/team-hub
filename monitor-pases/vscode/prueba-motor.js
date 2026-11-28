// Prueba del plugin sin VS Code: encuentra Python, arranca el motor como lo hace el
// plugin (demo), comprueba que se deja enseñar en el panel (CSP frame-ancestors) y
// que la API responde con la clave; después lo para.   node prueba-motor.js [carpeta-del-motor]
"use strict";
const path = require("path");
const assert = require("assert");
const M = require("./motor");

(async () => {
  const dir = process.argv[2] || path.join(__dirname, "motor");
  const py = await M.buscarPython(process.env.PYTHON ? [[process.env.PYTHON]] : []);
  console.log("Python", py.version, py.ruta);
  const m = await M.arrancarMotor({ dir, python: py, demo: true, log: (l) => process.env.VERBOSO && console.log("  " + l) });
  try {
    assert.ok(m.propio && m.url.startsWith("http://127.0.0.1:"), "url del motor");
    assert.ok(await M.vivo(m.url), "ping");
    const r = await M.pedir(m.url);
    const csp = r.cabeceras["content-security-policy"] || "";
    assert.ok(/frame-ancestors[^;]*vscode-webview:/.test(csp), "la app se deja enseñar en el panel de VS Code: " + csp);
    const clave = await M.leerClave(m.url);
    const e = await M.api(m.url, clave, "estado");
    assert.ok(e && e.demo === true, "estado de la demo");
    await assert.rejects(M.api(m.url, "mala", "estado"), /Clave/, "sin la clave no hay API");
    console.log("OK: motor", m.version, "en", m.url);
  } finally {
    m.proc.kill();
  }
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
