---
target: Vacaciones del equipo (Gestión)
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/vacaciones/GestionVacacionesRoute.jsx"
target_fingerprint: "sha256:419810418137cbc6a36f44b5f3d437babaed2d1c994a37e636f604b7c6fd5335"
target_path: /home/user/team-hub/beyond-the-grid/components/vacaciones/GestionVacacionesRoute.jsx
timestamp: 2026-11-01T09-36-51Z
slug: nts-vacaciones-gestionvacacionesroute-jsx-e4d36cb8
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Nota de salud: 18/40 (Pobre)
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad | 2 | Tras aprobar el panel desaparece y el aviso sale ~1.100 px arriba |
| 2 | Lenguaje | 2 | VA/FO/ES, «Pend.», «Quedarían», «Pend. −1» en cancelación; «Apellidos, Nombre» |
| 3 | Control | 1 | Aprobar sin deshacer; Del año/Grupo se guardan al salir; Rehacer año en cabecera |
| 4 | Consistencia | 1 | Mapa de calor Electric en claro / Mandarin en oscuro; años = pestañas; serif y emojis |
| 5 | Prevención | 2 | Crear año usa el año actual; quitar festivo sin confirmar |
| 6 | Reconocer | 2 | El calendario solo da números, no quién |
| 7 | Eficiencia | 1 | Sin aprobar en bloque, sin siguiente automática, sin atajos ni filtros |
| 8 | Minimalismo | 2 | KPI de adorno, manchas, panel Equipo de 60 px por persona |
| 9 | Recuperación | 2 | Error del backend tal cual; bien el «Aprobar igualmente» |
| 10 | Ayuda | 3 | Textos de ayuda concretos |

## Especificidad
Detalle de solicitud muy de dominio; el resto, plantilla de admin (4 KPI, píldoras, cristal, manchas). Calendario de calor con números, distinto del de /vacaciones (trimestres con nombres).
Detector CLI: 7 ficheros limpios. Overlay navegador: 81 hallazgos en Calendario con selección (undersized-ui-text 65, low-contrast 18); 88 nodos bajo AA en claro (text-sand/45–50 → lavanda 2,6–3,8:1), 26 en oscuro. Falsos positivos: rayas de festivo, códigos de 10 px en pastilla.

## Problemas prioritarios
- [P1] Aprobación de una en una sin cola (6 pasos, 8–30 Tab, botón a 1.100 px en móvil). Fix: confirmar en el panel y pasar a la siguiente, agrupar por campaña/semana, vista «Revisar Navidad» por semana con cobertura, atajos. /impeccable shape
- [P1] Calendario sin «quién» y color dependiente del tema; rojos fuera de paleta. Fix: calendario por trimestres de /vacaciones con nombres, pendiente discontinuo con nombre, alerta Canary. /impeccable shape → colorize
- [P1] «Rehacer 2027 desde cero» en cabecera. Fix: sección de configuración del año; crear año desde el elegido. /impeccable harden
- [P2] Resumen sin foco, peor en móvil. Fix: cola arriba, «Próximo laborable: N fuera», sin KPI de adorno. /impeccable distill → adapt
- [P2] Deriva de marca y lectura (48 px, serif, emojis, HEX inventados, 10 px poco contraste). /impeccable typeset → polish

## Personas
Coordinadora con 10 de Navidad; usuario experto sin teclado; coordinadora en móvil desde el correo.

## Menores
«Domingo 1 De Noviembre», «Mexico», fecha mm/dd/yyyy, botones sin nombre (+, ×), Baja en rojo con nombre, Borrar = Editar, Q1–Q3 pasados delante, selección solo por color.

## Preguntas
¿Mismo calendario que /vacaciones con capa pendiente? ¿Unidad de decisión semana/campaña? ¿Configuración aparte para lo poco frecuente?
