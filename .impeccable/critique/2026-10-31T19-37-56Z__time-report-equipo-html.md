---
target: prototipo Time Report del equipo
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-trg/time-report-equipo.html"
target_fingerprint: "sha256:46eb85953f83dbb2f3d91d98160993e8124e3d40ff10fbb4fe994fcc35efd5dd"
target_path: /tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-trg/time-report-equipo.html
timestamp: 2026-10-31T19-37-56Z
slug: time-report-equipo-html
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Nota de salud: 25/40 (Aceptable)
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | Casillas editadas sin marcar; la tira A/C/P no señala la quincena actual |
| 2 | Lenguaje del usuario | 3 | Título de Evidencias = nombre crudo de carpeta |
| 3 | Control y libertad | 2 | Esc / abrir otro proyecto descarta lo editado; sin deshacer tras reparto o borrado |
| 4 | Consistencia | 2 | Naranja con dos significados; color de acción principal distinto por botón; pastillas "Faltan" parecen botones |
| 5 | Prevención de errores | 2 | 30→24 en silencio; horas en domingo; bloqueada elegible; reescribir quincenas pasadas = guardado normal |
| 6 | Reconocer vs recordar | 3 | Horas por persona solo en tooltip |
| 7 | Eficiencia | 2 | 544 casillas sin flechas, cabecera fija, pegar ni total por día |
| 8 | Minimalismo | 3 | 17 pastillas de bloqueadas siempre visibles |
| 9 | Recuperación de errores | 2 | "Añadir proyecto" desactivado sin decir qué falta |
| 10 | Ayuda | 3 | Buenas explicaciones en contexto |

## Especificidad
Chrome y vocabulario propios; cuerpo de panel genérico. 5 acentos con 5 significados diluyen "un color por sección".
Detector: archivo 2 avisos (dark-glow, cramped-padding) falsos positivos; navegador: overused-font (Lato, obligatoria por marca) falso positivo; skipped-heading h1→h3 con proyecto abierto, real.

## Problemas prioritarios
- [P1] Confirmar el reparto no está a la altura (vista previa sin antes→después, mismo botón que guardar, sin deshacer). harden
- [P1] Se pierde lo editado sin avisar; el foco vuelve a body tras cada acción. harden
- [P1] Bloqueadas vs elegidas contradictorio; colores sobrecargados. quieter
- [P2] Tabla de Imputación sin teclado, cabecera fija, total por día ni aviso de recorte. harden
- [P2] Marca/a11y: HEX fuera de paleta, bordes 1,5:1, borde morado sobre blanco, serif en cifras. polish

## Perfiles
Usuario avanzado, accesibilidad, coordinadora que reparte la quincena (ver chat).

## Menores
Hueco a 390 px; "SDATOOL- 48213"; A/C casi iguales; capacidad poco útil; "Faltan" debajo de entregadas.

## Preguntas
1. ¿Reparto como paso guiado "Cerrar quincena"? 2. ¿Bloqueadas dentro de la vista previa? 3. ¿Todo salvo morado y A/C/P a Electric/neutro?
