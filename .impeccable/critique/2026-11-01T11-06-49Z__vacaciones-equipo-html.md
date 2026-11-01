---
target: prototipo Vacaciones del equipo (Gestión)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-vg/vacaciones-equipo.html"
target_fingerprint: "sha256:33067e72fe2997f3736f864a28e38bd53799369fc5397106f6315fa3b81ac6ec"
target_path: /tmp/claude-0/-home-user-team-hub/cf63d55b-049d-52b8-8095-dcd50b5fef13/scratchpad/prototipo-vg/vacaciones-equipo.html
timestamp: 2026-11-01T11-06-49Z
slug: vacaciones-equipo-html
---
Method: dual-agent (A: revisión de diseño · B: detector + navegador)

## Nota de salud: 28/40 (Buena) · página actual 18/40
| # | Heurística | Nota | Problema clave |
|---|---|---|---|
| 1 | Visibilidad | 3 | Tras aprobar el nombre se pierde en «+17 más»; sin cuenta atrás visible |
| 2 | Lenguaje | 3 | «Quedarían 3» cuenta las otras pendientes sin decirlo; «(4)» sin explicar |
| 3 | Control | 3 | Deshacer solo de la última decisión |
| 4 | Consistencia | 2 | Pestañas = años = filtros (misma píldora) |
| 5 | Prevención | 3 | A-A pierde el primer deshacer |
| 6 | Reconocer | 3 | Días pico: 3 nombres + «+17 más» |
| 7 | Eficiencia | 3 | Sin atajo de deshacer |
| 8 | Minimalismo | 3 | Leyenda de 9; 14 «Sin responder» |
| 9 | Recuperación | 2 | Sin estados: otro coordinador ya decidió, falla el correo |
| 10 | Ayuda | 3 | Ayuda en contexto |

## Especificidad
Panel de decisión y calendario con nombres, propios del dominio. Falta cobertura por equipo.
Detector CLI: 1 hallazgo (cramped-padding en .bar-azul, falso positivo); la UI se pinta en JS. Overlay: nested-cards ×2 y line-length 104 en Configuración; overused-font, repeated-container-text y gray-on-color de placeholder (8,6:1) son falsos positivos. Contraste de grises: todo AA. Sin scroll interno, panel sticky, 29 Tab hasta Aprobar, táctiles 42 px.

## Problemas prioritarios
- [P1] Deshacer solo cubre la última decisión (A-A pierde la primera). Fix: lista «Enviando» con cuenta atrás y deshacer por decisión, atajo Z. /impeccable harden
- [P1] Cifras de Navidad contradictorias (calendario 18 fuera vs tabla 5) y «Quedarían» igual en las 3 solicitudes. Fix: una definición de fuera, «si apruebas solo esta / todas», fecha de petición en la cola. /impeccable clarify
- [P2] Pestañas indistinguibles de años y filtros. Fix: pestañas subrayadas, filtros pegados a la cola. /impeccable layout
- [P2] Móvil: Aprobar a 1.168 px, nombres cortados. Fix: panel primero, cola plegada, lista de días; 44 px. /impeccable adapt
- [P3] Pulido: fecha dd/mm, «(4)» explicado, tarjetas anidadas, línea larga, error «ya resuelta». /impeccable polish
(El emoji 🎄 se mantiene por decisión del usuario.)

## Personas
Coordinadora de Navidad (comparar, fecha de petición, cifras); experto de teclado (deshacer); móvil desde el correo.

## Menores
Calendario no baja a la solicitud al cargar; próximo laborable solo Madrid; hoja sin agrupar por equipo; vacíos vs ceros en Personas.
