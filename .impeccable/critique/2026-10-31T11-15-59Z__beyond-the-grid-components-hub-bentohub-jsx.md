---
target: portada rediseñada
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/hub/BentoHub.jsx"
target_fingerprint: "sha256:60a27224d561fdebcb7c39a27bdd047691664d8dfe5187fee51721a94b865739"
target_path: /home/user/team-hub/beyond-the-grid/components/hub/BentoHub.jsx
timestamp: 2026-10-31T11-15-59Z
slug: beyond-the-grid-components-hub-bentohub-jsx
---
# Crítica nº 2: portada rediseñada (BentoHub.jsx + cabecera/pestañas + /gestion)
Method: dual-agent (A: design review · B: detector CLI + CDP en claro/oscuro, coordinadora y miembro, + overlay)

## Nielsen (24/40, Aceptable alto)
1 Estado 2 — ubicación bien (pestañas, Gestión activo); la portada no muestra estado; el panel de búsqueda no se cierra al perder el foco
2 Lenguaje 3 — «Ver todo» promete más de lo que hay en /gestion
3 Control 3
4 Consistencia 2 — Gestión ×3; etiquetas de sección parecen botones; Planificación abre (RDR) o copia (MA); pestaña ≠ H1 («Vacaciones» → «Vacaciones del equipo»)
5 Prevención 2 — gemelos personal/equipo con el mismo icono; copiar = navegar en forma
6 Reconocimiento 3 — Recursos/Simulador/Capacidad solo por URL
7 Flexibilidad 2 — buscador solo con nombres de páginas internas, sin ranking, Enter no copia
8 Estética 3 — 17 baldosas iguales en 4 colores, Gestión ×3, correo repetido
9 Errores 2 — «revisa links.json»; «Pronto» solo en title
10 Ayuda 2

## Especificidad
Marca propia y disciplinada; estructura de lanzador genérico; falta estado (quincena, comida del jueves calculables en cliente).
Detector: 0 hallazgos (CLI 12 ficheros; CDP portada claro/oscuro, /gestion, miembro; overlay sin hallazgos; sanidad comprobada con antipatrones plantados). Primera crítica: 5–6.

## Prioridades
- [P1] Gestión ×3 y gemelos con el mismo icono. Fix: /gestion como superconjunto (Simulador, Capacidad, Recursos) o quitar «Ver todo»; columna en 3+3; distinguir gemelos. distill
- [P1] Buscador corto: no indexa Proyectos ni descripciones ni ocultas; «repo»→Time Report; sin ranking; Enter no copia; panel abierto tras blur. harden
- [P2] Copiar/abrir/navegar con la misma forma; toast lejano y sin role=status. clarify
- [P2] En claro, acentos como línea (pestaña activa ≈1,6:1, subrayado «Ver todo»). polish
- [P2] Portada sin estado (decisión previa del usuario: lanzador sin datos). shape

## Personas
Alex: «drive/planif/repo» fallan; panel no se cierra. Sam: toast mudo; borde buscador 1,6:1 claro / 2,5:1 oscuro (<3:1); pestaña activa 1,6:1 en claro; a 390px la pestaña activa puede quedar fuera; etiquetas parecen botones. Lucía (4 núcleos, imputar): no sabe si la quincena está abierta; «imputar» no encuentra; framer-motion en el chrome; página interior con estilo antiguo.

## Menores
Comidas en 2 líneas; «/» visible al escribir; iconos reutilizados (directory, wikimetrics, bookstore); «● GESTIÓN» no enlaza; bordes izquierdos distintos en páginas interiores; hueco en pantallas altas; comentario obsoleto en app/page.jsx; correo repetido.

## Preguntas
¿Para qué /gestion si la portada ya muestra todo? ¿Baldosas que respondan? ¿Una baldosa por herramienta con vista de coordinación dentro?
