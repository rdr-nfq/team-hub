# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Las ~24 personas del equipo RDR (Reference Data & Surveillance Hub): consultores de NFQ trabajando para BBVA, repartidos en los equipos Reference Data, Market Abuse y Comms Surveillance. Entran desde su puesto de trabajo, con Google Sign-In, para resolver tareas del día a día: pedir y consultar vacaciones, imputar el time report de la quincena, solicitar guardias, votar el restaurante de los jueves, participar en retros, consultar pases a producción y seguir su ruta de formación.

Los coordinadores usan además las páginas de coordinación: gestión del equipo, control económico, ofertas, capacidad, simulador, time report, guardias y vacaciones en modo gestión.

## Product Purpose

Un único punto de entrada para todo lo operativo del equipo RDR: sustituye hojas sueltas, correos y enlaces dispersos por una web con sus propios flujos (cada uno con su backend en Apps Script). El éxito es que cada persona haga su gestión en pocos clics sin preguntar a nadie dónde está algo, y que la coordinación tenga la foto del equipo al día.

## Positioning

Es la herramienta interna del equipo, no un escaparate: no se diseña para impresionar a BBVA ni a candidatos, sino para el uso diario de quienes ya están dentro.

## Operating Context

- Portátiles corporativos, a menudo con poca potencia; existe un modo ligero (`html.rdr-lite`, `hooks/useLowPower.js`).
- Acceso restringido a la lista de `public/equipo/equipo.json` (Google Sign-In); el rol de coordinador desbloquea páginas adicionales.
- Datos en hojas de Google detrás de un único proyecto Apps Script (`apps-script/`, URL `/exec` en `links.json`); correos desde `rdr.surveillance@nfq.es`.
- Rituales: comida de los jueves, time report quincenal, retrospectivas, pases calendados por entorno, calendario anual de vacaciones.

## Capabilities and Constraints

- Next.js 14 (App Router, export estático) desplegado en GitHub Pages en cada push a `main`; Tailwind, Framer Motion, React Three Fiber.
- Estructura de la portada que se conserva: secciones Formación / Equipo / Proyectos (por equipo) / Coordinación.
- Modo claro y oscuro obligatorios, con la preferencia recordada por cuenta (`lib/theme.js`).
- El rendimiento en equipos lentos es un requisito: todo efecto debe degradar con el modo ligero.
- Visuales 3D y animaciones (torre de partículas de Formación, splash) no son compromiso: pueden simplificarse o quitarse.

## Brand Commitments

- Identidad BBVA × NFQ obligatoria, según `.claude-knowledge/` (`AGENTS.md`, `01-color.md`, `02-tipografia.md`, `06-co-branding-nfq.md`, `tokens.css`): paleta BBVA sin HEX inventados y sin negro puro (Midnight `#070E46`), Source Serif 4 para titulares y Lato para el resto, logo BBVA en su versión por fondo y logo NFQ siempre presente y menor que el de BBVA.
- Texto sobre acentos siempre en Electric Blue; sobre claro, ningún acento como texto, icono o línea (norma ya aplicada en el modo claro).
- Iconografía: solo el catálogo oficial BBVA (`05-iconografia.md`).
- Idioma de la interfaz: español.

## Evidence on Hand

- Logos BBVA y NFQ en `.claude-knowledge/` y `beyond-the-grid/public/logos/`.
- Catálogo de formaciones (`lib/formaciones.js`), recursos (`lib/recursos.js`, `public/recursos/`), datos reales de cada backend.
- No hay testimonios, métricas de uso ni capturas de referencia aprobadas: no inventarlos.

## Product Principles

1. La tarea primero: cada página existe para que alguien termine algo; lo decorativo nunca retrasa ni tapa la acción.
2. Una sola puerta: todo lo del equipo se encuentra desde la portada, con la misma estructura de secciones.
3. Funciona en cualquier portátil del equipo: el rendimiento y el modo ligero no son opcionales.
4. Marca BBVA × NFQ con disciplina: la identidad se nota en la precisión de paleta, tipografía y logos, no en efectos.
5. Lo de coordinación es más denso; lo personal, más directo.
