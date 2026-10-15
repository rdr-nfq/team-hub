# Traspaso de la gestión del Hub

Paso a paso para que otra persona (en adelante, **la nueva responsable**) se
quede con toda la gestión del *Reference Data & Surveillance Hub*: la web, el
proyecto único de Apps Script, las hojas de datos y los correos. Hecho para
hacerse en una mañana, sin cortes en la web.

Qué está hoy a nombre de la persona responsable (Pablo) y hay que pasar:

| Pieza | Dónde | Por qué depende de una persona |
|---|---|---|
| Proyecto Apps Script único | script.google.com | Es propietario; la web app se ejecuta «como» quien la implementa |
| Disparadores (recordatorios, avisos, caché…) | Proyecto Apps Script | Son de quien los crea; cada uno solo ve y borra los suyos |
| 6 hojas de datos | «Mi unidad» de Pablo | Es propietario: Comidas_RDR, Control - RDR BBVA, Pases_Calendados_NFQ, Retrospectiva RDR, RDR Guardias (datos), RDR TimeReport Web (datos) |
| Remitente `rdr.surveillance@nfq.es` | Gmail de Pablo | El alias «Enviar como» está en su cuenta |
| Token de GitHub (`GITHUB_TOKEN`) | Propiedades del script | Lo generó su usuario de GitHub |
| Responsable del hub (pruebas y respuestas de comidas) | Propiedad `HUB_RESPONSABLE` | Por defecto, su email |

Ya son del equipo/organización y solo hay que **dar acceso**: el Excel
«Vacaciones RDR», la carpeta «HUB FORMATIVO RDR» (con Certificados_Formaciones),
«Presentación seguimiento BBVA», «02_PROPUESTAS» (ofertas), la carpeta de
evidencias del Time Report (`evidenciasDrive` en `links.json`) y el calendario
de vacaciones.

---

## 0. Antes de empezar (Pablo)

- [ ] **Gestión de equipo** (web): marcar a la nueva responsable como
      **Coordinador** y guardar. Así ve todas las páginas de coordinación.
- [ ] Pasarle la **clave de coordinación** de Gestión de equipo (propiedad
      `CLAVE_EQUIPO`), o acordar una nueva (paso 3).
- [ ] **GitHub**: invitarla a la organización `rdr-nfq` como **Owner** (o, como
      mínimo, *Admin* del repositorio `team-hub`). Settings → People → Invite.
- [ ] **Grupo de Google** `rdr.surveillance@nfq.es`: hacerla **Propietaria**
      (groups.google.com → el grupo → Miembros).
- [ ] **Calendario de vacaciones** (el de `V_CONFIG.CALENDARIO_ID`): compartirlo
      con ella con «Hacer cambios y gestionar el uso compartido».
- [ ] Darle permiso de **edición** en: el Excel «Vacaciones RDR», «HUB FORMATIVO
      RDR», «Presentación seguimiento BBVA», «02_PROPUESTAS» y la carpeta de
      evidencias del Time Report. (Si alguna es de otra persona, que se lo dé
      su propietario.)

## 1. Hojas de datos (Pablo)

Las 6 hojas de la tabla están en la «Mi unidad» de Pablo. Dos opciones:

- **Recomendada — moverlas a una unidad compartida del equipo** (Drive →
  botón derecho → Organizar → Mover → la unidad compartida). Pasan a ser de
  la organización y el próximo traspaso ya no tendrá este paso. **Los ids no
  cambian**: no hay que tocar el código.
- **O transferir la propiedad**: Compartir → la nueva responsable como
  Editor → en su rol, «Transferir propiedad». Ella tiene que **aceptar** la
  transferencia desde el aviso que le llega.

Los ids están en `HUB_HOJAS` (`apps-script/_comun/Hub.gs`); si alguna hoja se
sustituyera por otra, basta con la propiedad del script `<CLAVE>_SPREADSHEET_ID`.

## 2. Remitente de los correos (la nueva responsable)

1. Gmail → ⚙ Ver todos los ajustes → **Cuentas** → «Enviar correo como» →
   Añadir otra dirección: `rdr.surveillance@nfq.es`, con «Tratar como alias».
2. Llega un código de verificación **al grupo**. Para que no le llegue a todo
   el equipo: en el grupo, poner antes la moderación en «Moderar todos los
   mensajes» y permitir publicar a «Cualquier usuario de la Web»; el correo
   queda en *Mensajes pendientes*, se copia el código y se rechaza. Después,
   dejar el grupo como estaba.

## 3. Proyecto Apps Script

**Pablo:**

1. En Drive, buscar el proyecto («RD&S Hub · Backend» o como se llame) →
   Compartir → la nueva responsable como **Editor**. (Opcional: transferir la
   propiedad o moverlo también a la unidad compartida.)

**La nueva responsable**, en el proyecto (⚙ Configuración → Propiedades del script):

2. `GITHUB_TOKEN` → **su propio token**: GitHub → Settings → Developer settings
   → Fine-grained tokens → *Generate*: Resource owner **rdr-nfq**, solo el
   repositorio **team-hub**, permiso **Contents: Read and write**. (Si la
   organización exige aprobar tokens, aprobarlo en Settings de rdr-nfq.)
3. `HUB_RESPONSABLE` → su email (recibe las pruebas y las respuestas de comidas).
4. `PASES_BUZON_PRUEBAS` → su buzón BBVA de pruebas (solo para el modo
   depuración de pases).
5. `CLAVE_EQUIPO` → cambiarla si se quiere (y comunicar la nueva a coordinación).
6. Ejecutar **`autorizar`** y aceptar todos los permisos con su cuenta.

**Cambio de disparadores (los dos a la vez, para que no se dupliquen avisos):**

7. Pablo ejecuta **`quitarDisparadores`** con su cuenta.
8. Justo después, la nueva responsable ejecuta **`instalarDisparadores`** y
   **`diagnosticarHub`**: tienen que salir 11 disparadores (5 de
   `enviarRecordatorio`, `revisarAvisosProgramados`, `syncCertificates`,
   `enviarRecordatorioTR`, `precalentarCache` y 2 de `vacacionesAlCambiarExcel`)
   y la línea «Responsable del hub: <su email> · ejecuta el script: <su email>».
9. **`probarRemitente`**: le llega una prueba desde rdr.surveillance@nfq.es con
   emojis en el asunto.

**Implementación nueva (para que la web se ejecute con su cuenta):**

10. Implementar → **Nueva implementación** → Aplicación web: «Ejecutar como:
    Yo», «Quién tiene acceso: Cualquier usuario». Copiar la URL `/exec`.
11. Comprobar `<URL>?app=vacaciones&action=ping` → `{"ok":true,…}`.

## 4. Web (la nueva responsable)

1. En el repositorio, `beyond-the-grid/public/links/links.json` →
   `hubBackend.url` = la URL nueva. Subirlo a `main` (todo va directo a
   `main`; ver `CLAUDE.md` §9). Con eso **toda la web** pasa a su implementación.
2. Esperar a que termine la Action **Deploy Beyond the Grid** (1-2 min) y
   recargar la web con Ctrl+F5.
3. Probar: vacaciones y vacaciones-gestión, comidas, pases, guardias, Time
   Report, seguimiento, retro, formaciones (progreso del equipo), Gestión de
   equipo (guardar un cambio trivial) y capacidad/ofertas.
4. Pablo: en el proyecto, Implementar → Gestionar implementaciones →
   **Archivar** su implementación antigua.

## 5. Herramientas y conocimiento

- **Código**: todo está en el repositorio. Puntos de entrada: `CLAUDE.md`
  (reglas del repositorio), `apps-script/README.md` (backend: apps, hojas,
  propiedades, disparadores, cómo cambiar algo) y este fichero.
- **Claude Code**: para seguir trabajando igual, entrar en claude.ai/code con
  su cuenta, conectar GitHub (claude.ai/connect-github) con acceso a
  `rdr-nfq/team-hub`. `CLAUDE.md` le da a Claude las reglas del repo.
- **Cambiar un backend**: editar en `apps-script/`, `node apps-script/comprobar.mjs`,
  subir a `main`, pegar el fichero en el proyecto único y **Implementar →
  Gestionar implementaciones → editar → Nueva versión** (la URL no cambia).
- **Altas y bajas del equipo**: en Gestión de equipo (al guardar, también se
  dan de alta en el Excel de vacaciones).
- **Año nuevo de vacaciones**: en vacaciones-gestión, botón «Crear año».

## 6. Salida de Pablo (cuando todo funcione)

- [ ] GitHub → Settings → Developer settings → Fine-grained tokens: **revocar**
      su token del hub.
- [ ] Gmail: quitar el alias `rdr.surveillance@nfq.es` de «Enviar como».
- [ ] Gestión de equipo: quitarle «Coordinador» (o darle de baja).
- [ ] Grupo, organización de GitHub, calendario y carpetas: quitar sus
      permisos si deja el equipo.
- [ ] Borrar los proyectos Apps Script antiguos (los de antes del proyecto
      único) si aún existen.

## Comprobación final

- [ ] `diagnosticarHub` (ejecutado por la nueva responsable): 7 hojas OK,
      11 disparadores, remitente rdr.surveillance@nfq.es, responsable = ella.
- [ ] La web funciona con `hubBackend` apuntando a su implementación.
- [ ] Un recordatorio de comidas (lun/mar/mié) llega una sola vez y desde el grupo.
- [ ] Gestión de equipo guarda (su token de GitHub funciona).
- [ ] En vacaciones, aprobar/rechazar una solicitud de prueba envía el correo.
