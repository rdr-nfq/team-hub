# Apps Script — backends de la web RDR

Aquí vive **todo el código Apps Script** que usa la web (`beyond-the-grid/`).
El repositorio es la **fuente de verdad**: el editor de script.google.com es
solo el sitio donde se despliega.

## Estructura

Una carpeta por **proyecto** de Apps Script (= una URL `/exec` en
`beyond-the-grid/public/links/links.json`). Dentro, los ficheros tal cual se
pegan en el editor; el principal se llama siempre `Codigo_<Proyecto>.gs`.

| Carpeta | Ficheros | Tipo de proyecto | Páginas web | Clave `links.json` | Puesta en marcha (una vez) |
|---|---|---|---|---|---|
| `comidas/` | `Codigo_Comidas.gs`, `Comidas_Recordatorios.gs` | Ligado al Google Sheet de comidas | `/comidas` | `comidasBackend` | `crearTriggers()` (recordatorios) |
| `control/` | `Codigo_Control.gs`, `appsscript.json`, `README.md` | Ligado al Sheet «Control - RDR BBVA» (o independiente con `SPREADSHEET_ID`) | `/simulador`, `/capacidad` | `controlBackend` | Ver `control/README.md` (token y permisos) |
| `equipo/` | `Codigo_Equipo.gs` | Independiente | `/equipo-gestion` | `equipoBackend` | Propiedades: `GITHUB_TOKEN`, `CLAVE_EQUIPO` |
| `guardias/` | `Codigo_Guardias.gs` | Independiente (crea su propio Sheet) | `/guardias`, `/guardias-gestion` | `guardiasBackend` | `autorizar()` |
| `ofertas/` | `Codigo_Ofertas.gs` | Independiente | `/ofertas` | `ofertasBackend` | `autorizar()` |
| `pases/` | `Codigo_Pases.gs`, `Avisos_Pases.gs` | Ligado al Sheet de Pases (`pasesSheet`) | `/pases` | `pasesBackend` | `instalarTriggerAvisos()` |
| `seguimiento/` | `Codigo_Seguimiento.gs` | Independiente | `/seguimiento` | `seguimientoBackend` | `autorizar()` |
| `timereport/` | `Codigo_TimeReport.gs` | Independiente (crea su propio Sheet) | `/timereport`, `/timereport-gestion` | `timereportBackend` | Propiedad `EVIDENCIAS_FOLDER_ID`, `autorizar()`, `crearTriggerRecordatorioTR()` |
| `vacaciones/` | `Codigo_Vacaciones.gs`, `Migracion_2026.gs` | **Ligado al Excel «Vacaciones RDR Pablo»** (`V_CONFIG.EXCEL_ID`) (el único: pestañas `Vacas_<año>`, `Solicitudes`, `Festivos`, `Grupos_Festivos`) | `/vacaciones` (equipo), `/vacaciones-gestion` (coordinación) | `vacacionesV2Backend` (y `vacacionesBackend` para el Time Report, `?modo=publico`) | `autorizar()`, `migrar2026()` una vez y revisar la pestaña `Migracion_2026` |
| `vacaciones-antiguo/` | `Codigo_Vacaciones.gs`, `Index.html`, `Formulario.gs`, `Migracion.gs` | Sistema ANTERIOR (Excel auxiliar + Google Form + panel de responsables). Se retira cuando el nuevo esté desplegado | `/vacaciones` mientras `vacacionesV2Backend` esté vacío | `vacacionesBackend` | — |

**Pendientes de incorporar** (en uso, pero su código solo está en
script.google.com): `formacionesBackend` (`/formacion/equipo`) y
`retroBackend` (`/retro`). Cuando se toquen, copiar aquí su código en
`formaciones/` y `retro/`.

**En espera — remitente común de los correos.** Hoy cada script envía a su
manera y casi todos desde la cuenta personal de quien lo despliega (pases, con
`noReply` a bbva.com). Plan acordado, pendiente de que IT permita crear el
grupo `rdr-hub@nfq.es`: añadirlo como alias «Enviar como» y unificar el envío
en un módulo común `_comun/Correo.gs` (remitente en un solo sitio, plantilla de
marca, asunto con emojis vía API de Gmail, copia oculta con reintento). A
medio plazo, cuenta dedicada con un único proyecto de envío.

## Flujo para cambiar un backend

1. Editar el fichero **aquí**, en su carpeta, y subirlo a `main` como el resto
   del código (ver `CLAUDE.md` §9).
2. Pegar su contenido en el fichero correspondiente del proyecto de
   script.google.com. El nombre en el editor da igual (p. ej. allí
   `Codigo_Vacaciones.gs` puede seguir llamándose `Code.gs`), salvo los
   `.html`: `Index.html` debe llamarse `Index`.
3. Si el cambio pide permisos nuevos, ejecutar `autorizar()` (o la función
   que diga la cabecera del fichero).
4. **Implementar → Gestionar implementaciones → editar → Nueva versión.**
   Así la URL `/exec` no cambia. Si se crea una implementación nueva, la URL
   cambia y hay que actualizarla en `links.json`.
5. En la web, si algo responde HTML en vez de JSON: Ctrl+F5 (caché).

## Convenciones

- Cada fichero empieza con una cabecera que explica qué hace, cómo se despliega
  y su API (acciones, parámetros y respuesta).
- Lecturas por `GET ?action=…`; escrituras por `POST` con
  `Content-Type: text/plain;charset=utf-8` y cuerpo JSON (sin preflight CORS).
- Correo: **nunca** `noReply: true` hacia buzones del dominio (Workspace los
  retiene en silencio); enviar desde la cuenta que ejecuta el script.
- **Nunca** `Session.getEffectiveUser()` en una web app pública: pide un permiso
  extra y la respuesta pasa a ser una página HTML de «Authorization required».
- Los datos de equipo (emails, coordinadores) se leen de
  `beyond-the-grid/public/equipo/equipo.json` vía raw.githubusercontent.com.
- Nada de secretos en el código: tokens y claves en **Propiedades del script**.

## Comprobación automática

`.github/workflows/apps-script.yml` revisa la sintaxis de todos los `.gs` en
cada push que toque `apps-script/`. En local:

```bash
node apps-script/comprobar.mjs
```
