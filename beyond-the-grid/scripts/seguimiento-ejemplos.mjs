// Genera presentaciones de ejemplo con la plantilla de Seguimiento RDR.
//
//   cd beyond-the-grid && node scripts/seguimiento-ejemplos.mjs [carpeta-salida]
//
// Usa exactamente el mismo código que el panel de coordinación
// (components/seguimiento/plantillaPptx.js); aquí los logos e iconos se leen
// de public/seguimiento/ en vez de pedirse por fetch.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import { generarPresentacion } from "../components/seguimiento/plantillaPptx.js";
import { EJEMPLO } from "../components/seguimiento/ejemplo.js";
import { nombreFichero, rutaDrive } from "../components/seguimiento/modelo.js";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = resolve(process.argv[2] || join(raiz, "..", "outbox", "seguimiento-ejemplos"));
mkdirSync(salida, { recursive: true });

const png = (f) => `image/png;base64,${readFileSync(join(raiz, "public", "seguimiento", f)).toString("base64")}`;
const assets = {
  bbvaRgb: png("bbva-rgb.png"),
  bbvaWhite: png("bbva-white.png"),
  nfqBlack: png("nfq-black.png"),
  nfqWhite: png("nfq-white.png"),
  icons: Object.fromEntries(
    ["warning", "tasks", "block", "database", "transfer", "calendar", "clock"].map((i) => [i, png(`icon-${i}.png`)]),
  ),
};

// Ejemplo 2: la reunión de la semana siguiente con cambios típicos.
const semanaSiguiente = () => {
  const d = structuredClone(EJEMPLO);
  d.fechaReunion = "2026-10-05";
  const p = (id) => d.proyectos.find((x) => x.id === id);
  const set = (t, cambios) => Object.assign(t, cambios);

  set(p("p4").tareas[2], { avance: 100 }); // Security Lending: pruebas cerradas
  set(p("p8").tareas[5], { avance: 100, estado: "en_plazo", comentarios: ["Implantación de los componentes", "Implantado el 03/10 sin incidencias"] });
  set(p("p10").tareas[2], { avance: 100 });
  set(p("p10").tareas[5], { avance: 90 });
  set(p("p10").tareas[7], { comentarios: ["Implantación", "Pendiente de ventana de BBVA: se replanifica"], fecha: "2026-10-10" });
  set(p("p2").tareas[1], { avance: 100, estado: "en_plazo" });
  set(p("p2").tareas[2], { avance: 100, estado: "en_plazo" });

  // Proyecto nuevo con muchas tareas y comentarios largos (fuerza 2 páginas).
  d.proyectos.splice(6, 0, {
    id: "p12",
    nombre: "Plan Brasil · Adaptación de contrapartidas y liquidaciones",
    nombreCorto: "Plan Brasil",
    sdatool: "SDATOOL-55461",
    traspaso: "2026-58",
    interno: "Alejandro García",
    responsable: "Chema",
    tareas: [
      { id: "n1", fase: "analisis", nombre: "Alcance funcional", inicio: "2026-08-17", fecha: "2026-08-28", asignacion: "Chema", avance: 100, estado: "en_plazo",
        comentarios: ["Reuniones con negocio de Brasil para cerrar el alcance de contrapartidas, cuentas y métodos de liquidación locales", "Inventario de interfaces afectadas"] },
      { id: "n2", fase: "analisis", nombre: "Diseño técnico", fecha: "2026-09-11", asignacion: "Chema", avance: 100, estado: "en_plazo",
        comentarios: ["Modelo de datos para entidades brasileñas (CNPJ) y validaciones asociadas"] },
      { id: "n3", fase: "desarrollo", sufijo: "Contrapartidas", nombre: "Alta y mantenimiento", fecha: "2026-10-02", asignacion: "Chema", avance: 85, estado: "en_curso",
        comentarios: ["Nuevos campos CNPJ y validación del dígito de control", "Adaptación de la ventana de contrapartidas", "Publicación en el servicio online de contrapartidas para los consumidores de Securities"] },
      { id: "n4", fase: "desarrollo", sufijo: "Liquidaciones", nombre: "Instrucciones de liquidación", fecha: "2026-10-16", asignacion: "Chema", avance: 40, estado: "en_riesgo",
        comentarios: ["Nuevos métodos de liquidación locales (SELIC, CETIP)", "Dependencia con el equipo de Murex para el mapeo de cuentas: pendiente de respuesta desde el 22/09"] },
      { id: "n5", fase: "desarrollo", sufijo: "Interfaces", nombre: "Ficheros de salida", fecha: "2026-10-16", asignacion: "Pablo", avance: 30, estado: "en_curso",
        comentarios: ["Adaptación de la extracción genérica", "Nuevo fichero diario para el regulador local"] },
      { id: "n6", fase: "pruebas", nombre: "Pruebas unitarias", fecha: "2026-10-23", asignacion: "Chema", avance: 10, estado: "en_curso", comentarios: ["Pruebas unitarias de contrapartidas y liquidaciones"] },
      { id: "n7", fase: "pruebas", nombre: "Pruebas integradas", fecha: "2026-11-06", asignacion: "Pablo", avance: 0, estado: "sin_iniciar", comentarios: ["Pruebas integradas con Calypso y Murex"] },
      { id: "n8", fase: "pruebas", nombre: "Pruebas de usuario", fecha: "2026-11-20", asignacion: "Chema", avance: 0, estado: "sin_iniciar", comentarios: ["UAT con el equipo de operaciones de São Paulo"] },
      { id: "n9", fase: "implantacion", nombre: "Implantación en producción", fecha: "Q4", asignacion: "Chema", avance: 0, estado: "sin_iniciar", comentarios: ["Implantación en producción", "Plan de marcha atrás"] },
      { id: "n10", fase: "post", nombre: "Soporte post GoLive", fecha: "Q4", asignacion: "Chema", avance: 0, estado: "sin_iniciar", comentarios: ["Soporte las dos primeras semanas tras la implantación"] },
    ],
  });

  d.incidencias.push(
    { id: "i4", tipo: "incidencia", estado: "en_riesgo", titulo: "Cargador Fondos", detalle: ["Timeout en la carga masiva de más de 5.000 fondos"], icono: "warning" },
    { id: "i5", tipo: "tarea", estado: "en_curso", titulo: "Certificados JBOSS", detalle: ["Renovación de certificados de los entornos de UAT", "Coordinar con sistemas la ventana"], icono: "tasks" },
  );
  d.traspasos.push(
    { id: "tr5", codigo: "2026-41", proyecto: "Eventos Corporativos", interno: "Pablo Rodríguez", nfq: "Pablo", pendiente: "Falta OK usuario post-implantación", tipo: "ok_usuario" },
    { id: "tr6", codigo: "2026-46", proyecto: "Automatización Emisiones RV", interno: "Alejandro García", nfq: "Pablo", pendiente: "Documentación de traspaso", tipo: "otro" },
  );
  return d;
};

const ejemplos = [
  ["Ejemplo 1 (datos de la presentación original)", EJEMPLO],
  ["Ejemplo 2 (semana siguiente, con cambios)", semanaSiguiente()],
];

// Time Report del Q (bloque 04), con las columnas del resumen en PDF.
const fila = (nombre, codigo, estado, horas, imputadas, porQ) => ({ nombre, codigo, estado, horas, imputadas, porImputar: horas - imputadas, porQ });
const timeReport = {
  q: "2026Q4",
  filas: [
    fila("FCM 26Q4", "SDATOOL-49780 · CIBRDR-1190", "Análisis y diseño", 242, 44, [0, 74, 59, 59, 50, 0]),
    fila("BSI 2.0 - Repos con clientes", "SDATOOL-49629 · CIBRDR-762", "Análisis y diseño", 403, 143, [0, 173, 78, 78, 74, 0]),
    fila("Strategic Boost. Desarrollos 26Q4", "SDATOOL-42226 · CIBRDR-1206", "Codificación", 1275, 210, [0, 240, 320, 320, 395, 0]),
    fila("Institutional Clients: Onboarding 26Q4", "SDATOOL-46848 · CIBRDR-1222", "Codificación", 135, 24, [0, 54, 33, 33, 15, 0]),
    fila("Mitigación vulnerabilidades Java del Core de RDR 26Q4", "SDATOOL-43151 · CIBRDR-1207", "Codificación", 548, 90, [0, 120, 137, 137, 154, 0]),
    fila("Mitigación vulnerabilidades Java del Core de RDR 26Q4_2", "SDATOOL-43151 · CIBRDR-1215", "Codificación", 322, 60, [0, 90, 79, 79, 74, 0]),
    fila("Eventos Corporativos 26Q4", "SDATOOL-51827 · CIBRDR-1210", "Codificación", 445, 80, [0, 110, 110, 110, 115, 0]),
    fila("Sec Lending Architecture Model", "SDATOOL-49629 · CIBRDR-1221", "Análisis y diseño", 104, 20, [0, 50, 25, 25, 4, 0]),
    fila("Security Lending Undisclosed", "SDATOOL-38779 · CIBRDR-980", "Análisis y diseño", 161, 30, [0, 60, 39, 39, 23, 0]),
    fila("Gobierno Global del Fixing", "SDATOOL-56612 · CIBRDR-1226", "Análisis y diseño", 161, 24, [0, 54, 41, 41, 25, 0]),
  ],
};

for (const [desc, datos] of ejemplos) {
  const pres = generarPresentacion(PptxGenJS, datos, assets, { timeReport });
  // En Drive el nombre lleva DD/MM/YY; en disco la barra no es válida.
  const fichero = join(salida, nombreFichero(datos.fechaReunion).replaceAll("/", "-"));
  // writeFile() en Node ignora `compression` (bug de pptxgenjs 4); stream() sí comprime.
  writeFileSync(fichero, await pres.stream({ compression: true }));
  console.log(`${desc}\n  -> ${fichero}\n  Drive: ${rutaDrive(datos.fechaReunion).join("/")}/${nombreFichero(datos.fechaReunion)}`);
}
