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
| `comidas/` | `Codigo_Comidas.gs`, `Comidas_Recordatorios.gs`, `Correo.gs` | Ligado al Google Sheet de comidas | `/comidas` | `comidasBackend` | `crearTriggers()` (recordatorios) |
| `control/` | `Codigo_Control.gs`, `appsscript.json`, `README.md` | Ligado al Sheet «Control - RDR BBVA» (o independiente con `SPREADSHEET_ID`) | `/simulador`, `/capacidad` | `controlBackend` | Ver `control/README.md` (token y permisos) |
| `equipo/` | `Codigo_Equipo.gs` | Independiente | `/equipo-gestion` | `equipoBackend` | Propiedades: `GITHUB_TOKEN`, `CLAVE_EQUIPO` |
| `guardias/` | `Codigo_Guardias.gs` | Independiente (crea su propio Sheet) | `/guardias`, `/guardias-gestion` | `guardiasBackend` | `autorizar()` |
| `ofertas/` | `Codigo_Ofertas.gs` | Independiente | `/ofertas` | `ofertasBackend` | `autorizar()` |
| `pases/` | `Codigo_Pases.gs`, `Avisos_Pases.gs` | Ligado al Sheet de Pases (`pasesSheet`) | `/pases` | `pasesBackend` | `instalarTriggerAvisos()` |
| `seguimiento/` | `Codigo_Seguimiento.gs` | Independiente (datos por semana y coordinador en `<raíz>/_datos_web/`; lee los .pptx antiguos de la carpeta para copiarlos) | `/seguimiento` | `seguimientoBackend` | `autorizar()` |
| `timereport/` | `Codigo_TimeReport.gs` | Independiente (crea su propio Sheet) | `/timereport`, `/timereport-gestion` | `timereportBackend` | Propiedad `EVIDENCIAS_FOLDER_ID`, `autorizar()`, `crearTriggerRecordatorioTR()` |
| `vacaciones/` | `Codigo_Vacaciones.gs`, `Migracion_2026.gs`, `Correo.gs` | Independiente; abre el Excel «Vacaciones RDR» por su id (`V_CONFIG.EXCEL_ID`) (el único: por año `Vacas_<año>`, `Festivos_<año>` —grupos y festivos— y `Solicitudes_<año>`) | `/vacaciones` (equipo), `/vacaciones-gestion` (coordinación) | `vacacionesV2Backend` (y `vacacionesBackend` para el Time Report, `?modo=publico`) | `autorizar()`, `instalarDisparadoresVacaciones()` y `empezarDeCero()` (migración completa; revisar la pestaña `Migracion_2026`). Opcional: `instalarPrecalentado()`. Desde el editor: `aplicarFormatoVacas`, `verMesActual`, `ocultarMesesPasados`, `mostrarTodosLosMeses`; `revisarMezclas2026` / `repararMezclas2026` (arreglo de personas que la migración juntó en una fila). Altas: se hacen en Gestión de equipo; al guardar, la web llama a `sincronizarEquipo` y quien falte se añade a Vacas_<año> (y al siguiente si existe). También desde Vacaciones → Personas → «Sincronizar con Gestión de equipo» |
| `vacaciones-antiguo/` | `Codigo_Vacaciones.gs`, `Index.html`, `Formulario.gs`, `Migracion.gs` | Sistema ANTERIOR (Excel auxiliar + Google Form + panel de responsables). Se retira cuando el nuevo esté desplegado | `/vacaciones` mientras `vacacionesV2Backend` esté vacío | `vacacionesBackend` | — |

**Pendientes de incorporar** (en uso, pero su código solo está en
script.google.com): `formacionesBackend` (`/formacion/equipo`) y
`retroBackend` (`/retro`). Cuando se toquen, copiar aquí su código en
`formaciones/` y `retro/`.

**Remitente común de los correos (`Correo.gs`).** Vacaciones y comidas ya
envían con él; el resto de proyectos lo irán usando. Es el MISMO fichero en
cada carpeta (`comprobar.mjs` falla si las copias no son idénticas):

- **Un correo individual por persona** (sin copias ocultas), con reintento por
  persona; las direcciones que siguen fallando quedan en el registro.
- Remitente: el grupo de `CORREO_REMITENTE` (constante al principio del
  fichero, o la propiedad del script del mismo nombre, que manda). Tiene que
  ser alias «Enviar como» de la cuenta que ejecuta el script: Gmail → Ver
  todos los ajustes → Cuentas → «Enviar correo como» → Añadir otra dirección
  → la del grupo, «Tratar como alias»; el código de verificación llega al
  grupo. Si no lo es, sale desde la cuenta, como antes: nunca se pierde un aviso.
- Asunto con emojis: servicio avanzado **Gmail API** (editor → Servicios + →
  Gmail API, identificador `Gmail`). Sin él sale igual desde el grupo, pero
  con el asunto sin emojis.
- `probarRemitente()` dice qué remitente se usa y manda una prueba a quien lo
  ejecuta.

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
