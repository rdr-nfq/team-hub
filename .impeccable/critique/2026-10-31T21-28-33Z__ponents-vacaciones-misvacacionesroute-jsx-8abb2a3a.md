---
target: /vacaciones (vista de usuario)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/vacaciones/MisVacacionesRoute.jsx"
target_fingerprint: "sha256:d6410ea053896706907f12682b114e0fb6588d3ff2ff909d54f2eaae1e7c946f"
target_path: /home/user/team-hub/beyond-the-grid/components/vacaciones/MisVacacionesRoute.jsx
timestamp: 2026-10-31T21-28-33Z
slug: ponents-vacaciones-misvacacionesroute-jsx-8abb2a3a
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Nota de salud: 23/40 (Aceptable)
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | «0 fuera hoy» en sábado; hoy queda fuera de pantalla |
| 2 | Lenguaje | 3 | «4 De Noviembre»; dos formatos de fecha; «VP» crudo; «Alerta: <10 disponibles» |
| 3 | Control | 2 | Retirar con confirm() sin deshacer; foco perdido al cerrar la ficha |
| 4 | Consistencia | 2 | Capa antigua (cristal, glow, lift); 3 colores de acción; Lime = tú y persona; estados iguales en claro |
| 5 | Prevención | 2 | Acepta solapes con tus pendientes; sin aviso de cobertura |
| 6 | Reconocer | 2 | El rango pedido no se pinta en el calendario; escala sin leyenda |
| 7 | Eficiencia | 2 | Sin elegir días en el calendario; pestañas sin flechas |
| 8 | Minimalismo | 2 | 24 chips, leyenda de 6, 3 barras de trimestres, cristal |
| 9 | Recuperación | 3 | Buenos mensajes; rechazada sin siguiente paso |
| 10 | Ayuda | 2 | No explica aprobación ni la alerta |

## Especificidad
Lógica muy específica (campaña Navidad, festivos por grupo, cruce de año, pendientes); capa visual antigua y genérica, no encaja con el rediseño.
Detector: código 0; navegador ~36/vista → contraste en claro (text-sand/45–60), placeholder 2,4:1, etiquetas 9,5–10 px, glow del mes actual. Falsos positivos: rayado de festivos, botones desactivados, stragglers del mock.

## Problemas prioritarios
- [P1] No responde «¿quién falta la semana que viene?» (layout)
- [P1] Pedir días sin prevención de solapes con pendientes ni contexto de cobertura (harden)
- [P1] Desentona con el hub rediseñado (quieter)
- [P2] Colores que chocan: Lime tú/persona, escala sin leyenda, estados iguales en claro (colorize)
- [P2] Teclado y lector: foco de la ficha, pestañas, recorrido largo, días vacíos (audit)

## Menores
Ficha del día redundante en escritorio; «EQUIPO» cortado en móvil; emojis como iconos; rojos fuera de paleta; serif en 5 sitios; hover naranja en claro.

## Preguntas
1. ¿Empezar por mis próximas dos semanas y las del equipo? 2. ¿Ver cuántos han pedido cada semana de Navidad? 3. ¿«Baja» con nombre para todo el equipo?
