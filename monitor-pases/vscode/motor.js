// RDR Coding · el motor (Python, en la carpeta «motor» del plugin): encontrar
// Python, arrancarlo y hablar con él. Sin dependencias de VS Code: lo usa la
// extensión y también la prueba de la CI (node prueba-motor.js).
"use strict";

const cp = require("child_process");
const http = require("http");
const path = require("path");
const os = require("os");

const MINIMO = [3, 8];

/** Ejecuta un Python candidato y devuelve { cmd, version, ruta } si vale (3.8 o superior). */
function probarPython(cmd) {
  return new Promise((resolve) => {
    const args = [...cmd.slice(1), "-c", "import sys;print('%d.%d.%d' % sys.version_info[:3]);print(sys.executable)"];
    cp.execFile(cmd[0], args, { timeout: 20000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const [version, ruta] = String(stdout).trim().split(/\r?\n/);
      const [a, b] = (version || "").split(".").map(Number);
      if (!(a > MINIMO[0] || (a === MINIMO[0] && b >= MINIMO[1]))) return resolve(null);
      resolve({ cmd, version, ruta: ruta || cmd[0] });
    });
  });
}

/** El primer Python que funcione: el de Ajustes, el del lanzador de Windows (py -3) y los del PATH. */
async function buscarPython(preferidos = []) {
  const cands = [...preferidos.filter((c) => c && c[0])];
  if (process.platform === "win32") cands.push(["py", "-3"], ["python"], ["python3"]);
  else cands.push(["python3"], ["python"]);
  const probados = [];
  for (const c of cands) {
    probados.push(c.join(" "));
    const r = await probarPython(c);
    if (r) return r;
  }
  const e = new Error("No se encuentra Python 3.8 o superior (probado: " + probados.join(", ") + ").");
  e.probados = probados;
  throw e;
}

/** Arranca el motor y espera a que avise («MONITOR_LISTO {...}»). -> { proc, url, puerto, version, propio } */
function arrancarMotor({ dir, python, demo = false, puerto = 0, padre = process.pid, log = () => {}, espera = 90000 }) {
  return new Promise((resolve, reject) => {
    const args = [...python.cmd.slice(1), "-u", path.join(dir, "monitor.py"), "--vscode", "--padre", String(padre)];
    if (demo) args.push("--demo");
    if (puerto) args.push("--puerto", String(puerto));
    const env = { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" };
    log(`> ${python.cmd[0]} ${args.join(" ")}`);
    const proc = cp.spawn(python.cmd[0], args, { cwd: dir, windowsHide: true, env });
    let listo = false, resto = "", ultimas = [];
    const reloj = setTimeout(() => {
      if (listo) return;
      try { proc.kill(); } catch { /* ya terminado */ }
      reject(new Error("El motor no ha arrancado en " + Math.round(espera / 1000) + " s. Mira «RDR Coding: ver el registro»."));
    }, espera);
    const linea = (l) => {
      log(l);
      ultimas = [...ultimas.slice(-12), l];
      if (!listo && l.startsWith("MONITOR_LISTO ")) {
        listo = true;
        clearTimeout(reloj);
        try {
          const d = JSON.parse(l.slice("MONITOR_LISTO ".length));
          resolve({ proc: d.propio ? proc : null, url: d.url, puerto: d.puerto, version: d.version, propio: d.propio, demo });
        } catch (e) { reject(e); }
      }
    };
    proc.stdout.on("data", (b) => {
      resto += b.toString("utf8");
      const ls = resto.split(/\r?\n/);
      resto = ls.pop();
      ls.forEach(linea);
    });
    proc.stderr.on("data", (b) => b.toString("utf8").split(/\r?\n/).filter(Boolean).forEach((l) => { log(l); ultimas = [...ultimas.slice(-12), l]; }));
    proc.on("error", (e) => { if (!listo) { clearTimeout(reloj); reject(e); } });
    proc.on("exit", (code) => {
      log(`El motor ha terminado (código ${code}).`);
      if (!listo) {
        clearTimeout(reloj);
        const e = new Error("El motor se ha cerrado al arrancar." + (ultimas.length ? " " + ultimas.slice(-3).join(" · ") : ""));
        reject(e);
      }
    });
  });
}

function pedir(url, { metodo = "GET", cabeceras = {}, cuerpo = null, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo == null ? null : Buffer.from(JSON.stringify(cuerpo));
    const req = http.request(url, { method: metodo, timeout, headers: { ...cabeceras, ...(datos ? { "Content-Type": "application/json", "Content-Length": datos.length } : {}) } }, (res) => {
      const trozos = [];
      res.on("data", (c) => trozos.push(c));
      res.on("end", () => resolve({ estado: res.statusCode, cabeceras: res.headers, texto: Buffer.concat(trozos).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("Sin respuesta del motor")));
    req.on("error", reject);
    if (datos) req.write(datos);
    req.end();
  });
}

/** ¿Hay un motor escuchando en esa URL? */
async function vivo(url) {
  try {
    const r = await pedir(url.replace(/\/$/, "") + "/ping", { timeout: 2000 });
    return r.estado === 200 && JSON.parse(r.texto).app === "monitor-pases";
  } catch { return false; }
}

/** La clave de sesión de la API (va en la página, como para el navegador). */
async function leerClave(url) {
  const r = await pedir(url);
  const m = /<meta name="clave" content="([^"]+)">/.exec(r.texto);
  if (!m) throw new Error("El motor no ha dado la clave de sesión.");
  return m[1];
}

/** Llama a la API del motor (/api/...). */
async function api(url, clave, ruta, cuerpo) {
  const r = await pedir(url.replace(/\/$/, "") + "/api/" + ruta.replace(/^\//, ""), {
    metodo: cuerpo === undefined ? "GET" : "POST", cabeceras: { "X-Monitor-Clave": clave }, cuerpo: cuerpo === undefined ? null : cuerpo,
  });
  let d = null;
  try { d = JSON.parse(r.texto); } catch { /* no es JSON */ }
  if (r.estado >= 400) throw new Error((d && d.error) || "El motor ha contestado " + r.estado);
  return d;
}

const carpetaDatos = () => process.env.MONITOR_PASES_DIR || path.join(os.homedir(), ".monitor-pases");

module.exports = { buscarPython, probarPython, arrancarMotor, vivo, leerClave, api, pedir, carpetaDatos };
