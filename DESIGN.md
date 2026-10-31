---
name: Reference Data & Surveillance Hub
description: Lanzador interno del equipo RDR con identidad BBVA × NFQ; barra Electric, secciones por color de acento y todo a la vista en una pantalla de portátil.
colors:
  electric-blue: "#001391"
  midnight: "#070E46"
  sand: "#F7F8F8"
  white: "#FFFFFF"
  gray-5: "#46536D"
  serene: "#85C8FF"
  mandarin: "#FFB56B"
  lime: "#88E783"
  purple: "#9694FF"
  canary: "#FFE761"
  aqua: "#8BE1E9"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(24px, 2.2vw, 30px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(26px, 2.4vw, 32px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  brand-bar:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1
  title-lg:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.375
  body-sm:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
  nav:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1
  label:
    fontFamily: "Lato, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  row: "8px"
  plate: "8px"
  plate-lg: "10px"
  tile: "12px"
  card: "16px"
  full: "9999px"
spacing:
  unit: "8px"
  tile-gap: "8px"
  gutter: "16px"
  gutter-sm: "32px"
  row-gap: "20px"
  column-gap: "24px"
  header-bar: "56px"
  header-tabs: "45px"
  container: "1376px"
components:
  header-bar:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.sand}"
    typography: "{typography.brand-bar}"
    height: "{spacing.header-bar}"
  button-bar-pill:
    textColor: "{colors.sand}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  button-gestion:
    backgroundColor: "{colors.purple}"
    textColor: "{colors.electric-blue}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  button-gestion-active:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.electric-blue}"
  section-label:
    textColor: "{colors.electric-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "7px 12px"
  tile-large:
    rounded: "{rounded.tile}"
    typography: "{typography.title-lg}"
    padding: "12px 16px"
    height: "68px"
  tile:
    rounded: "{rounded.tile}"
    typography: "{typography.title}"
    padding: "8px 12px"
    height: "54px"
  icon-plate-large:
    textColor: "{colors.electric-blue}"
    rounded: "{rounded.plate-lg}"
    size: "44px"
  icon-plate:
    textColor: "{colors.electric-blue}"
    rounded: "{rounded.plate}"
    size: "34px"
  search-input:
    rounded: "{rounded.full}"
    padding: "0 48px 0 20px"
    height: "42px"
    width: "440px"
  section-tab:
    typography: "{typography.nav}"
    padding: "3px 12px 0"
    height: "44px"
---

# Design System: Reference Data & Surveillance Hub

## Overview

**Creative North Star: "La puerta de la oficina"**

Un lanzador estándar, compacto y bien hecho, con la marca BBVA × NFQ. Quien entra ve su saludo, el buscador y todas sus herramientas en una sola pantalla de portátil (1280×720), sin desplazarse. La marca se nota en la precisión de paleta, tipografía y logos, no en efectos: el fondo es plano, el color llega en bloques y cada sección tiene un único acento BBVA que la identifica en la portada, en las pestañas y en /gestion. El listón de acabado es el de una herramienta tipo Google Workspace: denso, legible, sin ornamento.

El sistema vive en dos temas obligatorios que comparten estructura. La barra superior es Electric en los dos; debajo, el fondo es Midnight (oscuro) o Sand (claro). El tema claro sigue la combinación Sand del manual BBVA: todo lo que sea texto, icono o línea pasa a Electric, y los acentos solo aparecen como relleno. El rechazo confirmado de este rediseño es el bento anterior de cuatro columnas iguales con cristal, tilt 3D y manchas difuminadas: en la portada y el chrome no hay vidrio, ni brillo, ni arte generativo.

Las páginas interiores (vacaciones, time report, pases, retro, recursos…) conservan una capa anterior de tarjetas de cristal que comparte tokens con este sistema pero no su forma; se describe al final como capa incumbente, no como modelo.

**Key Characteristics:**
- Barra Electric fija de 56px en los dos temas, con el logo BBVA blanco a la derecha.
- Una sección = un acento BBVA: Equipo Mandarin, Proyectos Lime, Formación Serene, Gestión Purple.
- Baldosas teñidas con el acento, borde del acento y placa de icono en acento sólido con el icono oficial BBVA en Electric.
- Source Serif 4 solo en el nombre del hub, el saludo y los títulos de página; Lato para todo lo demás.
- Plano por defecto; la elevación solo responde al estado (hover, desplegable).

## Colors

Paleta oficial BBVA sin HEX inventados: dos azules de marca como estructura, Sand/Midnight como fondo según el tema y cuatro acentos que codifican las secciones.

### Primary
- **Electric Blue** (electric-blue): la conexión de la marca. Barra superior y splash en los dos temas; en claro, además, el texto principal, los iconos, los anillos de foco, la selección de texto y los botones principales. Es siempre el color del texto y del icono sobre cualquier acento.

### Secondary
- **Serene Blue** (serene): acento natural de Sand y de Electric. Color de Formación; en oscuro, anillo de foco, placeholder del buscador y la tecla «/»; sobre la barra Electric, el correo del usuario y el anillo de foco de sus botones.

### Tertiary (acentos de sección)
- **Mandarin** (mandarin): Equipo (Time Report, Vacaciones, Guardias, Comidas, Retrospectiva).
- **Lime** (lime): Proyectos (Pases, Planificación, Repositorio, Drive).
- **Purple** (purple): Gestión, solo coordinación; también el botón Gestión de la barra.
- **Canary** (canary) y **Aqua** (aqua): no son color de sección; solo los usan las páginas interiores para estados y datos.

### Neutral
- **Midnight** (midnight): fondo dominante del tema oscuro y fondo de pestañas, buscador y desplegables. Sustituye al negro puro en todo el sistema.
- **Sand** (sand): fondo dominante del tema claro; en oscuro, el texto principal. Sobre la barra Electric es el texto en los dos temas.
- **Gray 5** (gray-5): en claro, los bordes y velos neutros que en oscuro hace el blanco translúcido.
- **White** (white): en oscuro, bordes y velos translúcidos (12–30 %); en claro, el relleno sólido de las tarjetas de las páginas interiores.

Los tokens viven en `app/globals.css` como tripletas RGB por tema (`--c-*`), con una variable por uso para cada acento: `--t-*` texto/iconos/anillos, `--cl-*` líneas, `--ct-*` tintes, `--c-*` rellenos sólidos. En oscuro valen todas el acento; en claro `--t-*` y `--cl-*` pasan a Electric. Tailwind (`tailwind.config.js`) y `lib/palette.js` las exponen; `lib/seccion.js` asigna el acento de cada sección.

### Named Rules
**The Color Block Rule.** Un acento aparece como relleno: tinte de baldosa, placa de icono, etiqueta de sección, punto. Su único trazo admitido es el borde de un bloque teñido con ese mismo acento. Nunca como texto, icono ni línea suelta sobre fondo claro; encima de un acento, el contenido va siempre en Electric.

**The Electric Bar Rule.** La barra superior es Electric en los dos temas, con texto Sand, detalles en Serene y el logo BBVA blanco. No cambia con el tema; por eso usa literales y no las variables temáticas.

**The No Pure Black Rule.** Ni `#000000` ni grises inventados: lo más oscuro es Midnight, y las sombras se tiñen de Deep (`rgb(0 5 25)`) o de Midnight.

## Typography

**Display Font:** Source Serif 4 (con Georgia, serif), pesos 600 y 700 cargados con next/font.
**Body Font:** Lato (con system-ui, sans-serif), pesos 300, 400 y 700.

**Character:** una serif editorial con peso firme para la voz de la marca, reservada a muy pocos sitios, y una sans humanista y neutra que hace todo el trabajo operativo.

### Hierarchy
- **Display** (700, clamp(24px, 2.2vw, 30px), tracking −0.015em): el saludo de la portada («Buenos días, Ángela»).
- **Headline** (700, clamp(26px, 2.4vw, 32px), tracking −0.015em): título de página, como «Gestión», acompañado de una placa de icono de 44px.
- **Brand bar** (700, 19px): el nombre del hub en la barra; por debajo de 1180px se abrevia a «RD&S Hub».
- **Title** (Lato 700, 17px en baldosa grande / 15px en pequeña): el nombre de cada acceso.
- **Body** (Lato 400, 14px / 13px): la descripción de una línea bajo el nombre de la baldosa y el texto de apoyo de página (15px).
- **Nav** (Lato 700, 14px): las pestañas de sección.
- **Label** (Lato 700, 13px, tracking 0.05em, MAYÚSCULAS): etiquetas de sección (rectángulo de 6px) y títulos de grupo en /gestion; también los botones de la barra (13px 700, sin mayúsculas).

### Named Rules
**The Serif Scarcity Rule.** Source Serif 4 solo en el nombre del hub, el saludo, los títulos de página y el splash. Nada de serif en baldosas, botones, etiquetas ni navegación.

## Layout

Contenedor centrado de 1376px como máximo, con márgenes de 16px en móvil y 32px desde `sm`. La cabecera es fija; su altura se publica en `--cabecera` (56px, o 101px cuando la página lleva pestañas de sección) y las páginas reservan el hueco con `pt-cabecera`/`top-cabecera`.

La portada es una fila (saludo serif a la izquierda, buscador de 440px a la derecha) y debajo una retícula de tres columnas en `lg`, dos en `md` y una en móvil, con 24px entre columnas y 20px entre filas. Cada columna es una sección: etiqueta arriba y baldosas apiladas con 8px de separación (la columna Gestión, en dos grupos de tres con 4px más entre ellos, como /gestion). Equipo pone sus tres accesos más usados en grande y los dos menores en pareja (de 420px hacia arriba); Proyectos lleva un selector de equipo junto a la etiqueta; la tercera columna es Gestión para coordinadores (Formación baja bajo Proyectos) o Formación para el resto. /gestion reparte sus seis accesos en dos grupos titulados de tres columnas (`md`) con 12px de separación.

El ritmo sigue la retícula de 8px del manual; los valores intermedios (12px, 20px) solo dentro de componentes.

### Named Rules
**The One Screen Rule.** La portada cabe completa en 1280×720: si un acceso nuevo la desborda, pasa a una baldosa pequeña o a /gestion, no a un segundo pliegue.

## Elevation & Depth

Plano por defecto. La profundidad la dan el color (tinte, borde de acento, la barra Electric sobre el fondo) y no la sombra. La sombra solo aparece como respuesta: al pasar el ratón por una baldosa y bajo el desplegable del buscador. Sin cristal, sin desenfoque y sin brillos de color en la portada y el chrome.

### Shadow Vocabulary
- **Hover de baldosa, oscuro** (`box-shadow: 0 8px 20px -10px rgb(0 5 25 / 0.6)`): acompaña a la subida de 1px y al tinte intensificado.
- **Hover de baldosa, claro** (`box-shadow: 0 8px 20px -10px rgb(7 14 70 / 0.25)`).
- **Desplegable** (`box-shadow: 0 18px 40px -16px rgb(0 5 25 / 0.6)`): resultados del buscador.

### Named Rules
**The Flat Until Touched Rule.** Ninguna superficie de la portada tiene sombra en reposo. Si la sombra sola no se lee (sobre Midnight), el estado se marca intensificando el tinte, no endureciendo la sombra.

## Shapes

Esquinas suaves y consistentes: baldosas de 12px, placas de icono de 10px (grande) y 8px (pequeña), filas de resultado de 8px. Todo lo que es control es píldora completa: botones de la barra, botón Gestión, buscador, selector de equipo y las marcas «Pronto» y «Otra pestaña». Las etiquetas de sección son rectángulos de 6px, para no confundirse con un botón. El tema se indica con un círculo de 36px. Los bordes son de 1px en baldosas y de 1.5px en píldoras y controles; el discontinuo se reserva para el acceso bloqueado.

## Components

### Barra superior
Electric, 56px, fija. A la izquierda el nombre del hub en serif (vuelve a la portada). A la derecha: botón Gestión (solo coordinadores), correo en Serene (desde `lg`), botón de tema circular, «Salir» y el logo BBVA blanco de 20px de alto.
- **Píldoras de la barra:** 36px de alto, borde 1.5px Sand al 55 %, texto Sand 13px 700; el borde pasa a Sand pleno al pasar el ratón. Foco: anillo de 2px Serene.
- **Botón Gestión:** relleno y borde Purple, icono oficial «digitalsignature» y texto Electric. Al pasar el ratón o estando en Gestión (`aria-current="page"`) pasa a Sand. En móvil queda solo el icono, con `aria-label`.

### Pestañas de sección
Bajo la barra, en las páginas de una sección, sobre Midnight/Sand con línea inferior blanca al 15 % (Gray 5 en claro). A la izquierda, un punto de 10px en el acento de la sección y su nombre en mayúsculas 12px al 70 %. Cada pestaña: Lato 14px 700 al 65 %, pleno al pasar el ratón; la activa, texto pleno y barra inferior de 3px: en oscuro, del acento de la sección; en claro, Electric sobre el tinte de la sección (un acento como línea fina no se lee sobre Sand). En Gestión, el nombre de la sección vuelve a /gestion. La pestaña activa se desplaza a la vista en móvil. Desplazamiento horizontal sin barra en móvil. Las páginas `soloActiva` solo aparecen como pestaña estando en ellas.

### Etiqueta de sección
Rectángulo de 6px en el acento sólido con texto Electric, Lato 13px 700, mayúsculas, tracking 0.05em, 7px × 10px. Es el `h2` de la columna.

### Baldosa (signature)
El acceso de la portada y de /gestion. Borde de 1px en el acento y fondo teñido con él (15 % en oscuro, 30 % en claro; la variante suave, 7 % y 16 %). Texto en el color principal del tema.
- **Grande:** mínimo 68px de alto, 12px × 16px, placa de 44px con icono de 28px, título 17px.
- **Pequeña:** mínimo 54px, 8px × 12px, placa de 34px con icono de 21px, título 15px.
- **Placa de icono:** el acento sólido con el icono oficial BBVA en Electric, en los dos temas.
- **Hover:** el tinte sube 12 puntos, subida de 1px y sombra de hover (160ms, `cubic-bezier(0.16, 1, 0.3, 1)`); al pulsar vuelve a su sitio.
- **Foco:** anillo de 2px Serene (Electric en claro) con separación de 2px sobre el fondo.
- **Bloqueada** (`aria-disabled`, «Pronto» o enlace sin configurar): tinte suave, borde discontinuo, sin hover; la marca «Pronto» es una píldora con borde del color del texto, 11px, mayúsculas.
- Una baldosa puede navegar, abrir en pestaña nueva o copiar un enlace; las tres comparten forma, pero lo que no navega lo dice: icono oficial «copy» a la derecha (y «Enlace copiado» en la descripción durante 2 s al pulsar) o la marca «Otra pestaña». Los gemelos personal/equipo llevan iconos distintos (p. ej. Guardias «alarm», Guardias del equipo «clientok»).

### Buscador
Campo de 42px en píldora, borde 1.5px Sand al 50 % (Electric al 50 % en claro, ≥3:1), fondo del tema, texto 15px y placeholder Serene (Electric en claro). La tecla «/» lo enfoca y se muestra como `kbd` a la derecha mientras está vacío y sin foco. Busca en todo lo que hay en la portada (nombre, descripción y palabras clave), ordena por relevancia y Enter navega, copia o abre; se cierra con Esc o con un clic fuera. Al foco, el borde pasa a Serene. Los resultados salen en un panel de 12px con borde al 25 % y la sombra de desplegable; cada fila lleva un punto del acento de su sección y el nombre de la sección a la derecha; la elegida se tiñe con su acento.

### Selector de equipo
`select` nativo en píldora con borde 1.5px y tinte del acento de Proyectos, texto 13px 700 y el icono oficial «fold» girado como flecha. Si la persona solo tiene un equipo, se muestra su nombre en texto.

### Pie de co-branding
«Hecho por» en 13px al 75 % y el logo NFQ de 18px de alto (versión Midnight en claro, blanca en oscuro), al final de cada página, siempre menor que el BBVA de la barra.

### Splash
Solo al primer inicio de sesión y una vez por sesión del navegador: Electric a pantalla completa, BBVA blanco y NFQ separados por un filete Serene, el nombre del hub en serif, y fundido a los ~900ms.

### Capa interior incumbente
Las páginas de cada herramienta no se rediseñaron. Comparten la paleta temática, las tipografías y el chrome (barra, pestañas, pie), pero conservan su propio lenguaje: tarjetas de cristal de 16px (`border` blanco al 12 %, fondo blanco al 5.5 %, `backdrop-blur-md`) que en claro pasan a blanco sólido con sombra suave, entrada por opacidad (`rdr-rise`), tilt 3D con brillo de borde en algunas tarjetas, controles segmentados en píldora y un modo ligero que quita el desenfoque y el tilt. En claro, una regla global de `globals.css` convierte los botones con relleno de acento en Electric con texto Sand. Esta capa es incumbente, no modelo: las pantallas nuevas parten de la baldosa y la barra, no de la tarjeta de cristal.

## Do's and Don'ts

### Do:
- **Do** asignar a cada sección su acento de `lib/seccion.js` y repetirlo en etiqueta, baldosas, placa y punto de pestaña.
- **Do** poner texto e iconos en Electric sobre cualquier acento, en los dos temas.
- **Do** usar solo iconos del catálogo oficial BBVA, vectorizados en `components/iconosBBVA.jsx` y rellenos con `currentColor`.
- **Do** mantener la barra Electric con el logo BBVA blanco en todas las páginas y el pie «Hecho por» con el logo NFQ de 18px en todas.
- **Do** reservar el hueco de la cabecera con `--cabecera` en lugar de alturas fijas.
- **Do** marcar el hover de una superficie sobre Midnight intensificando su tinte, y respetar `prefers-reduced-motion` y el modo ligero.

### Don't:
- **Don't** usar un acento como texto, icono o línea suelta sobre Sand; solo como relleno o como borde de su propio bloque teñido.
- **Don't** usar `#000000`, grises fuera de la paleta BBVA ni HEX nuevos.
- **Don't** volver al bento de columnas iguales con cristal, tilt 3D, manchas difuminadas o arte generativo en la portada o el chrome.
- **Don't** usar Source Serif 4 en baldosas, botones, etiquetas o navegación.
- **Don't** dar sombra en reposo a las superficies de la portada.
- **Don't** tomar las tarjetas de cristal de las páginas interiores como patrón para pantallas nuevas.
