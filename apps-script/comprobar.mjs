// Comprueba los Apps Script de esta carpeta (lo ejecuta también la Action
// .github/workflows/apps-script.yml):
//   1. Sintaxis de cada .gs (se compila con el motor V8 de Node, sin ejecutarlo).
//   2. Nombres globales repetidos dentro de un mismo proyecto (carpeta): en
//      Apps Script todos los ficheros comparten ámbito global, así que un
//      `const` duplicado rompe el proyecto entero y una `function` duplicada
//      pisa a la otra sin avisar.
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
for (const carpeta of readdirSync(raiz).sort()) {
  const dir = join(raiz, carpeta);
  if (!statSync(dir).isDirectory()) continue;
  const globales = new Map(); // nombre -> fichero
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".gs")).sort()) {
    const ruta = join(dir, f);
    const rel = relative(join(raiz, ".."), ruta);
    const src = readFileSync(ruta, "utf8");
    total++;
    try {
      new vm.Script(src, { filename: rel });
    } catch (e) {
      errores++;
      const pos = (e.stack || "").split("\n")[0];
      console.error(`✗ ${rel}: ${e.message}\n    ${pos}`);
      continue;
    }
    for (const [, , nombre] of src.matchAll(RE_GLOBAL)) {
      const previo = globales.get(nombre);
      if (previo && previo !== f) {
        errores++;
        console.error(`✗ ${carpeta}/: «${nombre}» está definido en ${previo} y en ${f} (mismo proyecto Apps Script)`);
      } else {
        globales.set(nombre, f);
      }
    }
  }
}

if (errores) {
  console.error(`\n${errores} problema(s) en ${total} ficheros .gs`);
  process.exit(1);
}
console.log(`✓ ${total} ficheros .gs sin errores de sintaxis ni globales duplicados`);
