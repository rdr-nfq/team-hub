---
target: prototipo Vacaciones por trimestres
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-vac/vacaciones.html"
target_fingerprint: "sha256:6d29d487168a27247bf0ccc5c8e993b8124dc2606d66c8238ed104b172948778"
target_path: /tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-vac/vacaciones.html
timestamp: 2026-10-31T22-05-56Z
slug: vacaciones-html
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Nota de salud: 26/40 (Aceptable) · página actual 23/40
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad | 3 | Rango en trimestre oculto invisible; gráficos ignoran el filtro |
| 2 | Lenguaje | 3 | Nombres de pila repetidos; fechas mm/dd sin lang=es; semanas nombradas distinto |
| 3 | Control | 2 | Retirar sin deshacer; semana de Navidad pendiente no se retira desde su pestaña |
| 4 | Consistencia | 3 | Mandarin/Canary/discontinuo con varios significados |
| 5 | Prevención | 2 | Fechas pasadas aceptadas; escribir fecha con teclado roto |
| 6 | Reconocer | 3 | Leyenda de 9; nombres truncados |
| 7 | Eficiencia | 2 | Sin elegir en calendario; filtro solo exacto; 106 tabs hasta el formulario |
| 8 | Minimalismo | 3 | Fines de semana anchos; gráficos y «204 días» aportan poco |
| 9 | Recuperación | 3 | Avisos accionables; filtro borra sin avisar |
| 10 | Ayuda | 2 | Sin flujo de aprobación ni reglas de Navidad |

## Detector
CLI 1 (cramped-padding, falso positivo). Navegador: .fest 10,5 px truncado; placeholders en oscuro 3,6:1; stragglers; Lato (obligatoria). Sondas: 0 sin nombre, contraste OK salvo desactivados, sin scroll horizontal, foco retenido en la ficha; pestañas de cabecera ocultas en móvil.

## Problemas prioritarios
- [P1] Pedir días: teclado roto, fechas pasadas, rango en trimestre oculto (harden)
- [P1] Sin señal de cobertura en Pedir días ni en semanas de Navidad (clarify)
- [P2] Nombres ambiguos/truncados; quitar «arriba»; fines de semana estrechos (layout)
- [P2] Teclado/lector: orden DOM, flechas, pestañas, nombres en aria-label, lang=es (audit)
- [P2] Colores sobrecargados (colorize)

## Preguntas
1. ¿Pedir desde el calendario? 2. ¿Demanda por semana de Navidad visible? 3. ¿Gráficos o «semana más cargada»?
