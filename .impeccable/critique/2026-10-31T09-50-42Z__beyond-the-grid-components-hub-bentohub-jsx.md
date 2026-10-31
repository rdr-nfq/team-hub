---
target: portada del hub
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/hub/BentoHub.jsx"
target_fingerprint: "sha256:1413d11146c0c7fd4807560567a861d4e365949764dc8b3311ad8494e438ff2b"
target_path: /home/user/team-hub/beyond-the-grid/components/hub/BentoHub.jsx
timestamp: 2026-10-31T09-50-42Z
slug: beyond-the-grid-components-hub-bentohub-jsx
---
# Crítica: portada del hub (BentoHub.jsx + chrome)
Method: dual-agent (A: design review · B: detector + browser via CDP)

## Nielsen (23/40, Aceptable)
1 Estado 2 — portada sin estado (time report, votación, pendientes); toast sin aria-live
2 Lenguaje 3 — descripciones truncadas a media palabra
3 Control 3
4 Consistencia 2 — copiar/navegar/abrir iguales; Time Report/Guardias/Vacaciones duplicados; IconShield x4; alturas 104–226px
5 Prevención 3
6 Reconocimiento 3 — selector de equipo disfrazado de título
7 Flexibilidad 1 — sin búsqueda, atajos, favoritos ni recientes
8 Estética 2 — sin jerarquía, tarjetas estiradas, ornamento (tilt, órbita, numeración)
9 Errores 2 — "revisa links.json" visible; "En progreso" solo en title
10 Ayuda 2

## Especificidad
Marca disciplinada, estructura intercambiable (bento de 4 columnas iguales). No usa rituales ni estado del equipo.
Detector: CLI JSX limpio (regex, infraconteo). CDP: side-tab x4 (BentoHub.jsx:249), nested-cards x1 (BentoHub.jsx:190, patrón en todas), low-contrast 4.4:1 solo claro (AppFrame.jsx:42).
Nota: 4 núcleos => rdr-lite siempre (useLowPower.js:20).

## Prioridades
- [P1] Portada sin estado; tarea diaria enterrada; HUB Formativo destacado sin motivo. Fix: banda "Hoy / esta quincena" (≤3), pendientes de coordinación. shape → layout
- [P1] A11y: foco claro 2.13:1 (globals.css:316), aria-label borra descripciones, select dentro de h2, toast no anunciado, "En progreso" no enfocable. audit → harden
- [P2] Geometría: lg:flex-1 estira a 218px y truncate corta. Altura natural, line-clamp-2. layout
- [P2] Acciones ambiguas, duplicados, iconos no oficiales (icons.jsx vs catálogo BBVA). clarify → polish
- [P2] Movimiento gratuito, splash 1.5s por pestaña, blobs montados. quieter + optimize

## Personas
Alex: sin búsqueda/⌘K, 22 tabs, splash no saltable. Sam: foco claro invisible, descripciones mudas, h2 corrupto, zoom 200% pie tapa Welcome Packs. Marta (4 núcleos, día 15): splash, 13–19 tarjetas iguales, sin saber si ya imputó, Time Report duplicado.

## Menores
Pie NFQ solo isotipo; etiquetas serif en mayúscula (Lato 700 según guía); rgb(24,31,82) y #1D7CF4 fuera de paleta; login/splash sin logos y Google en inglés; móvil: pie tapa Retrospectiva; "Inicio" span con aspecto de botón.

## Preguntas
¿Estado o enlace? ¿Coordinación como columna o franja densa? ¿Alguien echaría de menos el ornamento?
