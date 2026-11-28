// Empaqueta el plugin: copia el motor (monitor.py, mp/, web/, config-equipo.json) a «motor/»,
// pone la versión del motor en package.json y crea MonitorPases-<versión>.vsix con vsce.
//   node empaquetar.js            (necesita npx y acceso al registro de npm)
"use strict";
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const aqui = __dirname;
const raiz = path.join(aqui, "..");
const motor = path.join(aqui, "motor");
fs.rmSync(motor, { recursive: true, force: true });
fs.mkdirSync(motor);
const copiar = (de, a) => fs.cpSync(path.join(raiz, de), path.join(motor, a || de), {
  recursive: true, filter: (f) => !/__pycache__|\.pyc$/.test(f),
});
["monitor.py", "config-equipo.json", "mp", "web"].forEach((x) => copiar(x));

const version = /VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(raiz, "mp", "__init__.py"), "utf8"))[1];
const pkg = JSON.parse(fs.readFileSync(path.join(aqui, "package.json"), "utf8"));
pkg.version = version;
fs.writeFileSync(path.join(aqui, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

const salida = `MonitorPases-${version}.vsix`;
cp.execSync(`npx --yes @vscode/vsce@3.2.1 package --no-dependencies --allow-missing-repository --skip-license -o ${salida}`,
  { cwd: aqui, stdio: "inherit", shell: true });
fs.copyFileSync(path.join(aqui, salida), path.join(aqui, "MonitorPases.vsix"));
console.log(`Listo: ${salida} (y MonitorPases.vsix)`);
