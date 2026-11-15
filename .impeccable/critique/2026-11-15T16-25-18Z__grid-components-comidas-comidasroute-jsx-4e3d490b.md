---
target: Comidas (/comidas)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/team-hub/beyond-the-grid/components/comidas/ComidasRoute.jsx"
target_fingerprint: "sha256:5b0f3103de7641d50500d80f749642099aa218471e4afdbb690add1c787fb182"
target_path: /home/user/team-hub/beyond-the-grid/components/comidas/ComidasRoute.jsx
timestamp: 2026-11-15T16-25-18Z
slug: grid-components-comidas-comidasroute-jsx-4e3d490b
---
# Crítica · Comidas (/comidas)

Evaluación A (diseño) y B (detector + navegador) en dos sub-agentes aislados, con mock (hoy 15/11/2026, 12 jueves, votos en las semanas pasadas y en la del 19/11).

## Veredicto de especificidad
Lo propio del producto es la lógica (1ª/2ª con pesos, «El que más se vote», «Faltan por votar»). Lo visual es la capa antigua: tarjetas de cristal con blur, inclinación 3D en tarjetas no pulsables, h1 de 48 px sin placa, pestañas en mayúsculas, contenedor estrecho, iconos que no son del catálogo BBVA. Frente a Guardias y Vacaciones parece otra aplicación. El modo claro solo funciona por reglas !important globales.

## Heurísticas (22/40)
| # | Heurística | Nota |
|---|---|---|
| 1 | Estado del sistema | 2 — tras votar el panel no dice «Tu voto: …»; solo un toast que tapa Resultados |
| 2 | Lenguaje real | 3 — «puntos» y «prioridad 1 vale el doble» son conceptos del sistema |
| 3 | Control | 3 — se revota, pero no se puede retirar el voto |
| 4 | Consistencia | 1 — sistema visual antiguo, iconos no oficiales, acentos distintos de Mandarin |
| 5 | Prevención de errores | 2 — «¿Quién eres?» deja votar por cualquiera; 1ª = 2ª suma 3 puntos; enviar habilitado sin jueves |
| 6 | Reconocer | 3 — info del restaurante lejos del desplegable; insignias del histórico sin texto |
| 7 | Eficiencia | 2 — botón de enviar bajo el pliegue a 1366×768; sin «lo de la semana pasada» |
| 8 | Estética y minimalismo | 2 — la galería de restaurantes es ~55–60 % de la página; las 4 fichas de resultado pesan igual |
| 9 | Recuperación de errores | 1 — si falla la carga, muestra datos de ejemplo como reales y dice «No hay jueves» |
| 10 | Ayuda | 3 — explicación siempre visible y densa |

## Medidas (B)
- Detector en el código: 0 hallazgos (no ve el render). Sobre la página con el mock: textos de 10 px en etiquetas, 11,5 px en el detalle, contraste bajo, brillo de color en el botón (oscuro), tarjeta dentro de tarjeta.
- Contraste que falla (claro): «(opcional)» 2,26:1; «Puntos…» 2,88:1; nombres de «Faltan por votar» 3,22:1; pistas 3,78:1; etiquetas 4,48:1. Oscuro: «(opcional)» 3,09; «Puntos…» 4,08. Ficha de 1ª opción 4,34 en ambos.
- 40 de 96 textos por debajo de 12 px. Serif usada también en h2, h3, nombres y cifras.
- Táctil a 390: pestañas 32 px, opciones 38 px, selects 42 px, chips 31 px.
- «Enviar mi elección» no tiene indicador de foco (la sombra en línea anula el anillo).
- Sin <form>: Intro no envía; las 3 opciones son botones aria-pressed, no radios; validación solo con toast.
- Fallo de carga: toast de 2,5 s y luego nada; el GET se hace dos veces por carga.
- Sin desbordes, sin errores de página, doble envío protegido.

## Lo que funciona
1. El modelo de voto está pensado: flexible deshabilitado hasta que alguien vota, 2ª oculta si eres flexible, sin preselección, desempate determinista.
2. Resultados transparentes y sociales: quién va a dónde, flexibles y quién falta.
3. Fontanería correcta: nombre y semana prerrellenos, voto anterior cargado, actualización tras el POST, doble envío bloqueado.

## Problemas prioritarios
1. [P1] Un fallo de carga se disfraza de «no hay jueves» con datos de ejemplo. Arreglo: error con Reintentar, formulario deshabilitado, enviar deshabilitado sin jueves.
2. [P1] Sistema visual de otra época. Arreglo: tokens .vacu, placa con el icono oficial coffeeshop, panel Mandarin, pestañas .mg-pest, sin cristal ni inclinación, 13 px mínimo, Serif solo en h1.
3. [P1] La página no dice lo que importa: dónde vamos, cuántos somos, quién falta y si ya has votado. Arreglo: una línea de decisión arriba y «Tu voto: Goiko, luego Thai» en el panel.
4. [P2] Integridad del voto: se puede votar por otra persona (el backend no comprueba el email) y 1ª = 2ª. Arreglo: votar como la persona autenticada, excluir la 1ª de la 2ª, «Me da igual» como opción visible, retirar voto.
5. [P2] La galería de restaurantes ahoga la tarea (10 bloques iguales con una inicial). Arreglo: lista compacta o que los restaurantes sean la papeleta.

## Personas
- Quien vota cada semana: tiene que bajar para enviar y no ve confirmado su voto en el panel.
- Recién llegado: se le pregunta quién es estando identificado; la regla de puntos es lectura obligatoria.
- Accesibilidad: etiquetas de 10 px, contraste bajo, aria-live que relee 23 nombres.
- Quien reserva el jueves: recibe puntos, no un número de comensales; no hay hora de cierre.

## Observaciones menores
Fecha repetida en el desplegable; histórico sin día de la semana ni detalle; emoji en el toast; esqueleto con el diseño antiguo; foto enlazada de terceros en el respaldo; «No estoy» en Sand es lo más brillante en oscuro.

## Preguntas
1. Si arriba pusiera «Jueves 19: Goiko · 7 personas · faltan 14», ¿harían falta las fichas y los puntos?
2. ¿Por qué hay que decir quién eres estando identificado?
3. ¿Los restaurantes deberían ser la papeleta en vez de una galería aparte?
