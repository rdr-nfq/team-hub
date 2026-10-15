// Comprueba el proyecto ÚNICO de Apps Script (todas las carpetas de
// apps-script/ se pegan en el mismo proyecto). Lo ejecuta también la Action
// .github/workflows/apps-script.yml:
//   1. Sintaxis de cada .gs (se compila con el motor V8 de Node, sin ejecutarlo).
//   2. Nombres globales repetidos en CUALQUIER fichero: en Apps Script todos
//      los ficheros comparten el ámbito global, así que un `const` duplicado
//      rompe el proyecto entero y una `function` duplicada pisa a la otra sin
//      avisar.
//   3. Nombres de fichero repetidos entre carpetas: en el editor no puede
//      haber dos ficheros con el mismo nombre.
//   4. Cada app del enrutador (_comun/Hub.gs) tiene su doGet<App>/doPost<App>.
//
//   node apps-script/comprobar.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = dirname(fileURLToPath(import.meta.url));
const RE_GLOBAL = /^(?:async\s+)?(function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

let errores = 0;
let total = 0;
const globales = new Map(); // nombre -> fichero
const ficheros = new Map(); // nombre de fichero -> carpeta
let todo = "";
for (const carpeta of readdirSync(raiz).sort()) {
  const dir = join(raiz, carpeta);
  if (!statSync(dir).isDirectory()) continue;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".gs")).sort()) {
    const ruta = join(dir, f);
    const rel = relative(join(raiz, ".."), ruta);
    const src = readFileSync(ruta, "utf8");
    total++;
    todo += src + "\n";
    if (ficheros.has(f)) {
      errores++;
      console.error(`✗ ${f} está en ${ficheros.get(f)}/ y en ${carpeta}/: en el editor no puede haber dos ficheros con el mismo nombre`);
    } else ficheros.set(f, carpeta);
    try {
      new vm.Script(src, { filename: rel });
    } catch (e) {
      errores++;
      console.error(`✗ ${rel}: ${e.message}\n    ${(e.stack || "").split("\n")[0]}`);
      continue;
    }
    for (const [, , nombre] of src.matchAll(RE_GLOBAL)) {
      const previo = globales.get(nombre);
      if (previo && previo !== `${carpeta}/${f}`) {
        errores++;
        console.error(`✗ «${nombre}» está definido en ${previo} y en ${carpeta}/${f} (el proyecto es uno solo)`);
      } else {
        globales.set(nombre, `${carpeta}/${f}`);
      }
    }
  }
}

// Enrutador: cada case 'app' llama a funciones que existen.
const hub = readFileSync(join(raiz, "_comun", "Hub.gs"), "utf8");
for (const [, fn] of hub.matchAll(/return get \? (\w+)\(e\) : \w+\(e\)/g)) if (!globales.has(fn)) { errores++; console.error(`✗ Hub.gs llama a ${fn}, que no existe`); }
for (const [, fn] of hub.matchAll(/: (\w+)\(e\);/g)) if (!globales.has(fn)) { errores++; console.error(`✗ Hub.gs llama a ${fn}, que no existe`); }
for (const [, fn] of hub.matchAll(/\['[^']+', (\w+)\]/g)) if (!globales.has(fn)) { errores++; console.error(`✗ Hub.gs usa ${fn}, que no existe`); }
// Disparadores: cada newTrigger('x') apunta a una función global.
for (const [, fn] of todo.matchAll(/newTrigger\('(\w+)'\)/g)) if (!globales.has(fn)) { errores++; console.error(`✗ Un disparador apunta a ${fn}, que no existe`); }

if (errores) {
  console.error(`\n${errores} problema(s) en ${total} ficheros .gs`);
  process.exit(1);
}
console.log(`✓ ${total} ficheros .gs · un solo proyecto · sin errores de sintaxis ni nombres repetidos`);
