# Apps Script — backend único de la web

Aquí vive **todo el código Apps Script** que usa la web (`beyond-the-grid/`).
El repositorio es la **fuente de verdad**: el editor de script.google.com es
solo el sitio donde se despliega.

## Un solo proyecto

Todas las carpetas forman **un único proyecto** de Apps Script con **una sola
implementación** (una URL `/exec`). La web llama a esa URL con `?app=<app>` y
`_comun/Hub.gs` lo reparte al backend que toca. En `links.json` solo hay que
mantener `hubBackend`; cada clave `*Backend` lleva su `"app"` y la web compone
la URL (`lib/links.js`).

| Carpeta | Ficheros | `?app=` | Páginas web | Clave(s) `links.json` |
|---|---|---|---|---|
| `_comun/` | `Hub.gs` (reparto, ids de las hojas, `autorizar`, `instalarDisparadores`, `diagnosticarHub`), `Correo.gs` (envío de correos) | — | — | `hubBackend` |
| `comidas/` | `Codigo_Comidas.gs`, `Comidas_Recordatorios.gs` | `comidas` | `/comidas` | `comidasBackend` |
| `control/` | `Codigo_Control.gs` (ver `control/README.md`) | `control` | `/simulador`, `/capacidad` | `controlBackend` |
| `equipo/` | `Codigo_Equipo.gs` | `equipo` | `/equipo-gestion` | `equipoBackend` |
| `formaciones/` | `Codigo_Formaciones.gs` (certificados de Drive → hoja → progreso) | `formaciones` | `/formacion/equipo`, progreso de cada uno | `formacionesBackend` |
| `guardias/` | `Codigo_Guardias.gs` | `guardias` | `/guardias`, `/guardias-gestion` | `guardiasBackend` |
| `ofertas/` | `Codigo_Ofertas.gs` | `ofertas` | `/ofertas` | `ofertasBackend` |
| `pases/` | `Codigo_Pases.gs`, `Avisos_Pases.gs` | `pases` | `/pases` | `pasesBackend` |
| `retrospectiva/` | `Codigo_Retrospectiva.gs` | `retro` | `/retro` | `retroBackend` |
| `seguimiento/` | `Codigo_Seguimiento.gs` | `seguimiento` | `/seguimiento` | `seguimientoBackend` |
| `timereport/` | `Codigo_TimeReport.gs` | `timereport` | `/timereport`, `/timereport-gestion` | `timereportBackend` |
| `vacaciones/` | `Codigo_Vacaciones.gs`, `Migracion_2026.gs` | `vacaciones` | `/vacaciones`, `/vacaciones-gestion` | `vacacionesV2Backend`, `vacacionesBackend` |

`appsscript.json` es el manifiesto del proyecto (zona horaria, V8, web app
«Ejecutar como: yo» · «Cualquier usuario», servicio avanzado Gmail).

### Hojas de cálculo

Ningún backend va ligado a su hoja: cada uno la abre por id. Los ids están en
`HUB_HOJAS` (`_comun/Hub.gs`) y se pueden cambiar sin tocar el código con la
propiedad del script `<CLAVE>_SPREADSHEET_ID`:

| Clave | Hoja |
|---|---|
| `COMIDAS` | Comidas_RDR |
| `CONTROL` | Control - RDR BBVA |
| `FORMACIONES` | Certificados_Formaciones (pestaña Certificados; los PDFs, en la carpeta `FORM_CARPETA_ID`) |
| `PASES` | Pases_Calendados_NFQ |
| `RETRO` | Retrospectiva RDR |
| `GUARDIAS` | RDR Guardias (datos) |
| `TIMEREPORT` | RDR TimeReport Web (datos) |
| (vacaciones) | «Vacaciones RDR», en `V_CONFIG.EXCEL_ID` |

Seguimiento, ofertas y timereport (evidencias) trabajan con carpetas de Drive
(ids en su `CONFIG` o en `links.json`).

### Propiedades del script

| Propiedad | App | |
|---|---|---|
| `GITHUB_TOKEN`, `CLAVE_EQUIPO` | equipo | **Obligatorias** para guardar en Gestión de equipo (token fine-grained de rdr-nfq/team-hub, Contents: Read and write) |
| `vac:campanas` | vacaciones | Formularios de Navidad/Verano (los gestiona la web; se copian del proyecto antiguo) |
| `FIRMANTES_LATAM` | ofertas | Firmantes añadidos desde la web |
| `EVIDENCIAS_FOLDER_ID` | timereport | Opcional (último recurso; normalmente sale de `links.json`) |
| `CONTROL_API_TOKEN` | control | Opcional: sin ella, las escrituras genéricas al Excel de control quedan deshabilitadas |
| `MODO_DEBUG` | pases | Opcional |
| `CORREO_REMITENTE` | todas | Opcional: cambia el remitente de `Correo.gs` |
| `<CLAVE>_SPREADSHEET_ID` | todas | Opcional: cambia la hoja de una app |

### Disparadores

`instalarDisparadores()` (se puede repetir: no duplica) crea todos:
recordatorios de comidas (`enviarRecordatorio`), recordatorio de evidencias
del Time Report (`enviarRecordatorioTR`), avisos de pases
(`revisarAvisosProgramados`), certificados de formaciones cada 5 min
(`syncCertificates`), y en vacaciones la invalidación de caché al
editar el Excel (`vacacionesAlCambiarExcel`) y la caché precalentada
(`precalentarCache`).

## Puesta en marcha desde cero

1. **Proyecto nuevo** en script.google.com (independiente, no desde una hoja).
2. **Configuración del proyecto** → marcar «Mostrar el archivo de manifiesto
   appsscript.json» y pegar `appsscript.json`.
3. **Pegar todos los `.gs`**: un fichero del editor por cada `.gs` de cada
   carpeta (16), con el mismo nombre. El orden da igual.
4. **Propiedades del script** (Configuración del proyecto): copiar desde los
   proyectos antiguos `GITHUB_TOKEN`, `CLAVE_EQUIPO`, `vac:campanas` y
   `FIRMANTES_LATAM` (y las opcionales que se usen).
5. Ejecutar **`autorizar()`** (acepta los permisos) y luego
   **`instalarDisparadores()`**. `diagnosticarHub()` resume lo configurado.
6. **Implementar → Nueva implementación → Aplicación web** («Ejecutar como:
   yo», «Quién tiene acceso: cualquier usuario»). Pegar la URL `/exec` en
   `links.json` → `hubBackend.url` y subirlo a `main`.
7. **Apagar los proyectos antiguos**: borrar sus **activadores** (si no,
   los recordatorios y avisos saldrían dos veces) y archivar sus
   implementaciones.
8. Alias «Enviar como» del grupo y correos: ver `_comun/Correo.gs`.

## Flujo para cambiar un backend

1. Editar el fichero **aquí** y subirlo a `main` (ver `CLAUDE.md` §9).
2. Antes de subir: `node apps-script/comprobar.mjs` (sintaxis, nombres
   globales repetidos en todo el proyecto, ficheros repetidos, reparto y
   disparadores que apuntan a funciones que existen).
3. Pegar el fichero en el proyecto único de script.google.com.
4. Si pide permisos nuevos: `autorizar()`.
5. **Implementar → Gestionar implementaciones → editar → Nueva versión.**
   Así la URL `/exec` no cambia. Si se crea una implementación nueva, cambiar
   `hubBackend` en `links.json`.
6. En la web, si algo responde HTML en vez de JSON: Ctrl+F5 (caché).

## Convenciones

- **Todos los ficheros comparten el ámbito global.** Un nombre global nuevo
  no puede repetirse en otra carpeta (`comprobar.mjs` lo para). Las funciones
  internas llevan el nombre de su app cuando es genérico (`_serveGuardias`,
  `_ssTR`, `doGetPases`…); vacaciones conserva los suyos.
- Cada app tiene su `doGet<App>(e)` / `doPost<App>(e)`; el `doGet`/`doPost`
  de verdad solo está en `Hub.gs`. Una app nueva = una carpeta + un `case` en
  `_hubRepartir` + su clave en `links.json` con `"app"`.
- Claves de caché (`CacheService`) y propiedades con prefijo de app cuando
  sean genéricas (`seg:equipo`, `vac:campanas`): la caché es una sola.
- Lecturas por `GET ?app=…&action=…`; escrituras por `POST` con
  `Content-Type: text/plain;charset=utf-8` y cuerpo JSON (sin preflight CORS).
- Correo: con `_correoEnviar` (`_comun/Correo.gs`). **Nunca** `noReply: true`
  hacia buzones del dominio (Workspace los retiene en silencio).
- **Nunca** `Session.getEffectiveUser()` en una web app pública: pide un permiso
  extra y la respuesta pasa a ser una página HTML de «Authorization required».
- Los datos de equipo (emails, coordinadores) se leen de
  `beyond-the-grid/public/equipo/equipo.json` vía raw.githubusercontent.com.
- Nada de secretos en el código: tokens y claves en **Propiedades del script**.

## Comprobación automática

`.github/workflows/apps-script.yml` ejecuta `comprobar.mjs` en cada push que
toque `apps-script/`. En local:

```bash
node apps-script/comprobar.mjs
```
