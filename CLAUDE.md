# CLAUDE.md — BBVA × NFQ · Presentaciones HTML

Guía para que Claude (Claude Code, claude.ai Projects o cualquier agente) trabaje con este repositorio: identidad visual de presentaciones HTML que **NFQ** produce para **BBVA**.

> ⚠️ Esto NO es el manual oficial completo de BBVA. Es un subset adaptado a presentaciones internas/de cliente. Solo presentaciones — no carteles, packaging ni publicidad.

---

## 1. Propósito del proyecto

Generar presentaciones HTML 16:9 **autocontenidas** (stand-alone) con la identidad visual de BBVA y el co-branding de NFQ, usando tokens CSS predefinidos, dos tipografías fijas y un catálogo cerrado de 171 iconos oficiales.

---

## 2. Ubicación de la información

📂 **Toda la información del proyecto está en la carpeta `./.claude-knowledge/`** (raíz del repositorio): documentación de marca, tokens, plantilla, logos, iconos y manual oficial BBVA.

Antes de hacer nada, lista su contenido:

```bash
ls -la ./.claude-knowledge/
```

Todas las rutas de este documento son relativas a esa carpeta. Por ejemplo: `./.claude-knowledge/AGENTS.md`, `./.claude-knowledge/tokens.css`, `./.claude-knowledge/ai.pdf`.

---

## 3. Inventario de ficheros y cómo leerlos

### 3.1 Documentación de marca (Markdown) — leer con `view` o `cat`

| Fichero | Contenido | Cuándo leerlo |
|---|---|---|
| `AGENTS.md` | **Punto de entrada.** Principios, reglas duras, checklist de errores y flujo de trabajo. | **Siempre, primero.** |
| `01-color.md` | Paleta completa y las 4 combinaciones de fondo permitidas (Sand, Serene, Electric, Midnight). | Siempre (innegociable). |
| `02-tipografia.md` | Source Serif 4 (titulares) + Lato (resto), jerarquía y reglas. | Siempre (innegociable). |
| `03-layout.md` | Retícula 8px, márgenes, formato 16:9. Orientativo. | Si hay dudas de composición. |
| `04-componentes.md` | Botones, cajas, listas, UI stickers reutilizables. | Al construir componentes. |
| `05-iconografia.md` | Catálogo de los 171 iconos disponibles con sus nombres. | Antes de usar cualquier icono. |
| `06-co-branding-nfq.md` | Jerarquía y combinación de logos BBVA + NFQ. | Para portadas, footers y contraportadas. |
| `07-patrones.md` | Patrones de slides (portada, índice, doble Bentō, cajas de color, bocadillos…). Inspiración, no obligatorios. | Si hay dudas de layout. |

```bash
cat ./.claude-knowledge/AGENTS.md ./.claude-knowledge/01-color.md ./.claude-knowledge/02-tipografia.md
```

### 3.2 Tokens y plantilla — leer con `view` o `cat`

| Fichero | Contenido | Uso |
|---|---|---|
| `tokens.css` | Variables CSS listas: `--bbva-*`, combos `--combo-*`, clases `.bbva-combo--*`, inversión de iconos en fondos oscuros. | **Importar/inlinar siempre. No inventar HEX nuevos.** |
| `tokens.json` | Los mismos tokens en JSON. | Para herramientas/scripts. |
| `template.html` | Esqueleto con fuentes cargadas y 3-4 slides de ejemplo (portada, cajas de color, doble Bentō, contraportada). | Punto de partida opcional. |

### 3.3 Logos (PNG) — visualizar con `view` (los muestra como imagen)

| Fichero | Uso |
|---|---|
| `BBVA_RGB.png` | BBVA azul → fondos claros (Sand, Serene). |
| `BBVA_WHITE.png` | BBVA blanco → fondos oscuros (Electric, Midnight). |
| `Nfq__Black.png` | NFQ negro + isotipo color → fondos claros. |
| `Nfq__White.png` | NFQ blanco + isotipo color → fondos oscuros. |
| `Isotipo__Nfq__Color.png` | Isotipo NFQ suelto. |
| `colors.png`, `coloresBBVA.png` | Referencias visuales de la paleta. |

En la presentación final los logos van **embebidos en base64**:

```bash
base64 -w0 ./.claude-knowledge/BBVA_RGB.png   # → src="data:image/png;base64,..."
```

### 3.4 Iconos (PDFs individuales, ~171) — extraer/convertir, no usar directamente

Cada PDF de nombre corto (`ai.pdf`, `bizum.pdf`, `chat.pdf`, `favorite.pdf`, `dollar.pdf`…) es **un icono oficial BBVA**. El catálogo completo con nombres está en `05-iconografia.md`.

Para usarlos en HTML, convertirlos a SVG/PNG e inlinarlos:

```bash
# Opción A: PDF → SVG (preferida, permite fill="#001391")
pip install pdf2svg 2>/dev/null || sudo apt-get install -y pdf2svg
pdf2svg ./.claude-knowledge/ai.pdf /home/claude/icons/ai.svg

# Opción B: PDF → PNG de alta resolución
pip install pdf2image --break-system-packages
python3 -c "from pdf2image import convert_from_path; convert_from_path('./.claude-knowledge/ai.pdf', dpi=300)[0].save('/home/claude/icons/ai.png')"
```

Reglas: iconos **siempre en Electric Blue `#001391`** sobre fondos claros; sobre Electric/Midnight se invierten a blanco (`filter: brightness(0) invert(1)`, ya incluido en `tokens.css`). Nunca mezclar con otras librerías de iconos.

### 3.5 Manual oficial BBVA (PDFs grandes) — consulta puntual

| Ficheros | Cómo leerlos |
|---|---|
| `BBVA_MANUAL_ES_2025_v02_parte01.pdf` … `parte12.pdf` | Manual de marca completo en 12 partes. **No leerlos enteros**: extraer solo las páginas relevantes. |
| `Plantilla_BBVA_16_9.pdf` | Plantilla oficial de presentaciones — referencia de layouts. |

```bash
# Extraer texto de páginas concretas
pip install pypdf --break-system-packages
python3 -c "from pypdf import PdfReader; r=PdfReader('./.claude-knowledge/BBVA_MANUAL_ES_2025_v02_parte01.pdf'); print(r.pages[0].extract_text())"

# Rasterizar una página para inspección visual
python3 -c "from pdf2image import convert_from_path; convert_from_path('./.claude-knowledge/Plantilla_BBVA_16_9.pdf', dpi=150, first_page=5, last_page=5)[0].save('/home/claude/p5.png')"
```

En claude.ai con Project Knowledge activo, **buscar primero con `project_knowledge_search`** antes de procesar los PDFs manualmente.

---

## 4. Reglas duras (no negociables)

1. **Negro puro `#000000` prohibido** → usar Midnight `#070E46`.
2. **Fondos dominantes**: solo Sand `#F7F8F8`, Serene `#85C8FF`, Electric `#001391` o Midnight `#070E46`.
3. **Tipografía**: Source Serif 4 (titulares) + Lato (resto), vía Google Fonts.
4. **Logo BBVA** en todas las slides interiores (RGB en claros, WHITE en oscuros).
5. **Logo NFQ en todas las slides**: prominente en portada/contraportada ("Hecho por"), pequeño en footer (`height: 18–24px`) en el resto. Siempre menor que el de BBVA.
6. **Iconos**: solo del catálogo oficial (`05-iconografia.md`), en Electric Blue sobre claros.
7. **Sobre fotografía**: nunca opacity/velado — caja sólida encima (patrón Doble Bentō).
8. **Stand-alone**: el HTML final inlinea `tokens.css` en `<style>`, logos en base64, iconos como `<svg>` inline. Google Fonts puede quedar vía CDN con fallbacks.
9. **Texto sobre acentos** (Canary, Lime, Aqua/Ice, Purple, Mandarin, Serene): **siempre Electric Blue**. Nunca blanco, Sand ni Midnight.
10. **Texto sobre fondos claros**: Electric Blue o Midnight. Nunca `var(--bbva-sand)` sobre Sand (invisible).
11. **`:nth-child`**: si hay N tarjetas, definir explícitamente las N reglas. Ningún item sin fondo.

---

## 5. Flujo de trabajo al generar una presentación

1. Leer `AGENTS.md`, `01-color.md` y `02-tipografia.md`.
2. Importar `tokens.css` y usar solo esas variables.
3. Partir de `template.html` o de cero con los tokens.
4. Consultar `07-patrones.md` para inspiración de layouts; `04-componentes.md` para componentes.
5. Buscar los iconos necesarios en `05-iconografia.md` y convertirlos desde sus PDFs.
6. Ejecutar el **checklist final** de `AGENTS.md` (contrastes, nth-child completos, NFQ en todas las slides, versión correcta del logo BBVA por fondo).
7. Convertir a **stand-alone**: inlinar tokens.css, logos base64, SVGs con `fill="#001391"` (referencia: `scripts/make-standalone.mjs`).
8. Entregar un único `.html` que abra en cualquier equipo sin el repositorio.

---

## 6. Checklist final antes de entregar

- [ ] Slides oscuros (Midnight, Electric): texto en Sand o Serene. Sin blanco hardcodeado.
- [ ] Slides claros (Sand, Serene): texto en Electric Blue o Midnight.
- [ ] Cajas con fondo de acento → texto Electric Blue, nunca blanco.
- [ ] N tarjetas con `:nth-child` → N reglas definidas, ninguna sin fondo.
- [ ] Logo NFQ en footer de **todas** las slides.
- [ ] Logo BBVA en header de todas las slides interiores, versión correcta por fondo.
- [ ] Iconos inline SVG con `fill="#001391"` (o invertidos en fondos azules).
- [ ] HTML autocontenido: sin rutas relativas al repositorio.

---

## 7. Libertad creativa

El layout concreto de cada slide, las proporciones dentro de la retícula 8px, el ritmo de combinaciones de color, el uso de acentos para KPIs, la estructura semántica HTML y las animaciones/navegación son decisiones libres. La consistencia viene de la paleta, la tipografía y los radios — no de copiar un layout fijo.
---

## 8. Apps Script (backends de la web)

Todo el código Apps Script vive en **`apps-script/`**, una carpeta por proyecto (`pases/`, `guardias/`, `timereport/`…), con el fichero principal `Codigo_<Proyecto>.gs`. El índice (qué carpeta va con qué página y qué clave de `links.json`, y cómo se despliega) está en `apps-script/README.md`.

- Un backend nuevo o un cambio en uno existente se hace **ahí**, nunca en `inbox/`/`outbox/` ni solo en script.google.com.
- Antes de subir: `node apps-script/comprobar.mjs` (sintaxis + globales duplicados por proyecto; también lo pasa la Action `apps-script.yml`).
- Tras el push, recordar al usuario que lo pegue en su proyecto y haga **Nueva versión** de la implementación existente (la URL `/exec` no cambia).

---

## 9. Flujo de git (todo el repositorio)

**Todo se sube SIEMPRE directamente a `main`**, en cada cambio, sin pull requests (decisión del equipo). Si la sesión trabaja en otra rama, se pushea igualmente a `main` (`git push origin <rama>:main`) y también a esa rama.

- Antes de subir: `git fetch origin main`. Si `main` ha avanzado (p. ej. los commits "Equipo: actualización desde la web" que hace `/equipo-gestion`), se integra con merge o rebase de los commits propios — nunca `push --force` a `main`.
- Si el commit añade dependencias, `package.json` y `package-lock.json` deben ir juntos y cuadrar (el deploy de GitHub Pages compila en cada push a `main`).
- Tras subir, si el deploy falla, revisar el log de Actions: un fallo de `next/font` descargando Google Fonts suele ser puntual de Google y se arregla relanzando el job.
