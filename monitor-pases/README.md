# Monitor de pases

App para **la VDI de BBVA**. Te deja ver los repositorios de GitHub BBVA (`bbva.ghe.com`) como en la web de GitHub:
- **Código:** cualquier rama, etiqueta o commit.
- **Historial** de una rama o de un fichero.
- **Pull requests** con su conversación.
- **Diferencias** entre lo que quieras.

Además sigue los **DPs de cada release** (qué componentes lleva cada uno y qué modificaciones), los publica en [`rdr-nfq/pases-datos`](https://github.com/rdr-nfq/pases-datos) y prepara el **.json del pase**. Tiene dos asistentes con **Copilot CLI**: uno de consulta y otro que modifica features.

**Es un único `MonitorPases.exe`**, sin instalar nada. El código vive aquí, en `monitor-pases/`. Cada vez que cambia en `main`, GitHub Actions lo compila, lo prueba y publica el ejecutable nuevo.

## Descargar y abrir

1. Descarga **[MonitorPases.exe](https://github.com/rdr-nfq/team-hub/releases/download/monitor-pases/MonitorPases.exe)**. El enlace no cambia entre versiones; la versión se ve en la [release «monitor-pases»](https://github.com/rdr-nfq/team-hub/releases/tag/monitor-pases).
2. Ábrelo con doble clic. Se abre el navegador en `http://127.0.0.1:8765`; no hay ninguna ventana más. **La app se cierra sola unos segundos después de cerrar su última pestaña** (recargar la página no la cierra). Para volver, abre otra vez el .exe. Si algo falla al arrancar, sale un aviso de Windows y el detalle queda en `monitor.log`, en la carpeta de datos.
3. **Inicia sesión** con tu GitHub de BBVA y tu GitHub de NFQ (ver abajo).

Para verlo con datos inventados, sin red: `MonitorPases.exe --demo`. Otras opciones: `--puerto 8800`, `--sin-navegador` (no abre el navegador ni se cierra solo) y `--version`.

> **Si Windows lo bloquea:** es un ejecutable sin firma digital. SmartScreen puede pedir «Más información → Ejecutar de todas formas» y algunos antivirus corporativos frenan este tipo de ejecutables. Si pasa, hay que pedir a sistemas que lo permitan o firmarlo con un certificado de la empresa.

## Inicio de sesión

Para entrar hacen falta las cuentas de **BBVA**: **GitHub BBVA** y **Jira** (obligatorias). **GitHub NFQ** es opcional (publicar los DPs y los pases, y compartir los proyectos de NFQ). Al abrir, la app comprueba sola las sesiones guardadas; si falta alguna, **Conectar todo** abre una tras otra las ventanas de inicio de sesión que falten. Si dentro se pierde Jira, la cabecera ofrece *Conectar Jira*.

La app no tiene inicio de sesión propio. Se la pide a **Git**, que en Windows la gestiona Git Credential Manager: es la misma sesión con la que haces `git pull`.
- **Si ya tienes sesión guardada**, entra directamente.
- **Si no**, al pulsar *Iniciar sesión* se abre la ventana de GitHub en el navegador.
- **La app no guarda el token:** lo tiene en memoria mientras está abierta.

Si tienes varias cuentas en un mismo GitHub, pon tu usuario en *Ajustes → Sesiones*.

Si Git no tiene gestor de credenciales (`git config --get credential.helper` sale vacío), puedes poner un **token personal** en Ajustes. Para GitHub BBVA, de solo lectura con *Contents*, *Metadata*, *Pull requests*, *Actions* y *Checks*.

## Qué repositorios mira

Los de la organización **`free`** que cumplen **`props.uuaa:KYTL0000`**: el mismo filtro que en [la web de GHE](https://bbva.ghe.com/orgs/free/repositories?q=props.uuaa%3AKYTL0000). Va en *Ajustes → Conexión → Filtro de repositorios* y admite lo mismo que el buscador de repositorios de la organización.

La app pide a GitHub las propiedades personalizadas de esos repos (UUAA y las demás que tengan) y las usa también para filtrar. Si el GitHub de BBVA no tuviera esa API, usa la búsqueda de repositorios con la misma consulta.

## Qué se ve

| Pestaña | Para qué |
|---|---|
| **Ramas** | Las **releases** (cada una es una subida) y las ramas de cada proyecto. De cada rama: último commit, cuánto le falta para producción, PR, Action y DP. Al pulsar una rama: sus DPs, componentes, commits, ejecuciones, diferencias, código y Copilot. |
| **Actividad** | Línea de tiempo de commits, Actions y DPs. |
| **Commits** | Todos los commits de todos los repositorios, por días. Cada uno con sus diferencias (unificadas o lado a lado) y el fichero entero antes o después. |
| **DPs** | Los DPs agrupados por release. De cada uno: sus **componentes** (tipo y subida), sus features y sus **modificaciones**, es decir, lo que trae frente a producción, fichero a fichero. Y si ya está en `pases-datos`. |
| **Repos** | Como la web de GitHub. **Código:** árbol de ficheros, buscador de ficheros (tecla `t`) y README en cualquier rama, etiqueta o commit. **Commits:** historial de la rama o de un fichero. **Pull requests:** conversación, revisiones, comentarios en el código, commits y ficheros. **Comparar:** dos referencias. |
| **Copilot** | Asistente de consulta y de modificación (ver abajo). |
| **Pase** | Propone los componentes de las ramas pendientes de producción con su DP. Revisas el .json y lo guardas o lo subes. |
| **Ajustes** | Sesiones, conexión, patrones de ramas, releases y DPs, nombres de proyectos, reglas de componentes, `pases-datos` y Copilot. |

### Manual y ayuda (tecla `F1`)

El botón **?** de la cabecera (también en la entrada) abre el manual sin salir de lo que estás viendo:

- **Portada:** lo que falta ahora mismo en tu app, **recorridos guiados** («Mi primer día», «Preparar un pase», «Algo no va bien») y todas las secciones en tarjetas de color agrupadas por tema. Buscador arriba.
- **Cada sección:** cabecera con su color e icono, botón *Ir a la pestaña*, apartados plegables con índice, pasos numerados, avisos destacados y anterior / siguiente. Se abre por la sección de la pestaña en la que estás.
- **Pregúntale:** un chat que responde con **Copilot CLI** leyendo solo el manual y un resumen de la situación de la app (nunca tokens ni código). Copilot no puede escribir ficheros ni ejecutar comandos. Sin Copilot, contesta con el trozo del manual que más se parece.

El texto está en `web/manual.md` (`## Sección {#id}`, `### Apartado`, `> **Consejo:** …` para los avisos); el color, el icono, el grupo y el resumen de cada sección, en `META` de `web/ayuda.js`.

### De qué proyecto es cada rama

1. El código `CIBRDR-…` del nombre de la rama.
2. Si no lo lleva, la clave `CIBRDR-…` más citada en sus commits (por eso se leen también las ramas sin código en el nombre: primero las que tienen PR o Actions recientes, hasta `maxRamasSinCodigo` por repositorio; `soloRamasDeProyecto` lo desactiva).
3. Si esa clave es una historia, su feature en Jira (*Feature Link*). Así Ramas, Proyectos, DPs y Pase agrupan por la feature real.

Las ramas de integración (`patronIntegracion`: `develop`, `qa`, `uat`…) y las que mezclan varios proyectos sin que ninguno domine quedan *sin proyecto*.

### Filtros y navegación (pensado para 150+ repositorios)

- **Filtros en el lateral** (Ramas, Actividad, Commits, DPs y Repos): proyecto, repositorio, persona y las propiedades de los repos (UUAA, lenguaje…). Cada opción dice cuántos resultados da con el resto de filtros; se pueden marcar varias y cada lista tiene su buscador.
- **Arriba**: buscador (tecla `/`), periodo (7, 14 o 30 días), los filtros activos como chips que se quitan con un clic y **Vistas**: «Lo mío», «Esta semana» y las que guardes tú.
- **Ramas** se agrupan por proyecto, repositorio o persona; cada grupo se pliega y enseña 8 ramas con «Ver más». **DPs**, por release, proyecto o repositorio. **Repos** es una tabla ordenable.
- **Ir a…** (`Ctrl K`): escribe un trozo del nombre de un repositorio, rama, release, proyecto, DP o el SHA de un commit y ve directo.
- Los filtros se recuerdan al cerrar la app.

### DPs y releases

Las ramas `release/x.y.z` (configurable) son subidas. La Action de la release genera el DP. Cuando la app ve un DP nuevo:
1. Guarda en ese momento lo que trae frente a producción.
2. Si cuando lo ve la release ya está en producción, lo compara con la release anterior.
3. Saca las features de la release de los PRs mezclados en ella y de los mensajes de commit.

**El DP en sí** se busca en el resumen, las anotaciones y, si no, el log de la Action. También se puede poner a mano en la rama.

**En `rdr-nfq/pases-datos`** se publica `dps/<repositorio>/<DP>.json` con release, features y componentes (nombre, tipo y subida). **Sin código ni rutas.** Se hace automáticamente en cada sincronización si tienes la sesión de NFQ, o con *Publicar* en la pestaña DPs. Un DP ya publicado por otra persona del equipo no se vuelve a subir.

### Jira

La app une GitHub con vuestro Jira (`jira.globaldevtools.bbva.com`):

- **Historias de cada commit:** las claves de Jira del mensaje (`RDR-1234 …`), con su título y estado, en Commits y en el detalle de cada rama. Las de los DPs (`DP-KYTL-…`) no cuentan.
- **Proyectos**: un proyecto es una **Feature o Task de `CIBRDR`**, con el nombre de Jira. Los que están en *Deployed* o *Discarded* van al **histórico** (selector *En desarrollo | Histórico*). En *En desarrollo (elegir)* se marcan los de NFQ; la selección se guarda y, con la sesión de NFQ, se comparte en `pases-datos/equipo/proyectos-nfq.json` (solo claves). La pestaña enseña los de NFQ con su estado, **SDATOOL** (enlace *SDA project - Feature*, *labels*, otros enlaces, campos o descripción), enlace a Jira, historias hechas y qué tienen en GitHub.
- **Releases** del proyecto CIBRDR (todas, con buscador): sus historias (campo *tech-version*; en el Jira de BBVA es *Fix Version/s*, que la app encuentra sola por sus valores y consulta como `fixVersion`) frente a las de los commits de las ramas `release/x.y.z`, marcando las que están en Jira sin commits y las que están en la rama sin la release en Jira. Como la rama se crea antes que la release en Jira, mientras tanto se ve con las historias de sus commits. También en la pestaña DPs, botón *Historias* de cada release.
- El SDATOOL se busca solo en la feature: enlaces entre issues, campos, enlaces remotos y descripción.

**Conectar:** *Iniciar sesión en Jira* (en la entrada, en *Proyectos* o en *Ajustes → Jira*) abre Jira en Chrome (Edge si no hay Chrome) con un perfil propio de la app; entras con el SSO de BBVA y la app recoge la sesión por el protocolo de DevTools (solo en `127.0.0.1`) y cierra la ventana (`mp/navegador.py`). El perfil recuerda el SSO: en los siguientes arranques, y cuando la sesión caduca, entra sola sin ventana. Como alternativas: usuario y contraseña, el valor de `JSESSIONID` copiado del navegador o un token personal (en el Jira de BBVA están desactivados). Si una política impide leer la sesión del navegador, la app lo dice y ofrece esas alternativas.

**Si algo no cuadra** (un campo con otro nombre, releases con otro formato…): *Ajustes → Jira → Generar diagnóstico*. Prueba cómo está montado vuestro Jira y prepara un informe **sin contenido** (nombres de campos, cifras y formas como `9.999.9`; ni títulos, ni descripciones, ni personas). Lo revisas en pantalla y, si quieres, se envía a `pases-datos/diagnostico/` para ajustar la app. Los campos también se pueden indicar a mano en Ajustes.

### Asistentes con Copilot CLI

Usan [GitHub Copilot CLI](https://github.com/github/copilot-cli) con tu cuenta de Copilot de BBVA.

**Prepararlo** (la pestaña Copilot lo comprueba):
1. Hace falta Node.js 22 o superior.
2. La app encuentra Copilot CLI esté instalado como esté: `gh copilot` (GitHub CLI), en el PATH (`copilot.exe` o el de npm), con npm en cualquier carpeta, winget o nvm. Cada candidato se prueba con `--version` y se descarta si no es Copilot CLI (p. ej. el `copilot-debug` de VS Code). Si no lo encuentra, escribe `gh copilot` o la ruta de `where copilot` en *Ajustes → Copilot*. Si no lo tienes, el botón **Instalar** ejecuta `npm install -g @github/copilot`.
3. Si npm no conecta, suele ser el proxy: define `HTTPS_PROXY` y `HTTP_PROXY` en las variables de entorno de tu usuario o en *Ajustes → Copilot*, y `NODE_EXTRA_CA_CERTS` si hay inspección TLS.
4. **Iniciar sesión en Copilot** abre una ventana con Copilot CLI: escribe `/login`.

**Los dos modos:**
- **Consultar** sobre una rama, un DP o todo lo que ve el monitor. Copilot lee el código en una copia local, que se descarga con tu Git. No puede escribir ficheros ni ejecutar más que comandos de lectura de git.
- **Modificar una feature.** Copilot cambia el código en una copia local de la rama. No puede hacer commit ni push, y solo ejecuta comandos si lo activas en Ajustes. Ves el diff en la app y, si lo apruebas, la app hace el commit y el push a la rama con tu Git.

Las copias locales viven en `%USERPROFILE%\.monitor-pases\repos` y `copilot\`.

## Cuánto pide a GitHub

**No se clona nada para mirar los repositorios:** todo va por la API de GitHub. Solo Copilot descarga una copia, y solo de la rama sobre la que le preguntas.

GitHub da a cada persona un número de llamadas por hora (normalmente 5.000).

- **La primera sincronización es la cara.** Por cada repositorio pide sus ramas, PRs, ejecuciones de Actions y los commits de producción. Por cada rama de proyecto y cada release, lo que trae frente a producción. Y de cada ejecución correcta, su resumen, para encontrar el DP.
  - Con 150+ repositorios puede no caber en una hora. La app **para antes de gastarla entera**: deja 300 llamadas para que puedas seguir navegando. **Sigue sola cuando GitHub la recupera**, desde donde se quedó. Lo ya leído no se vuelve a pedir.
  - Los repositorios con cambios más recientes van primero.
  - Una **barra de progreso** enseña cuántos repositorios hay ya. Cada repositorio aparece en cuanto está leído, así que se puede usar la app mientras tanto. Si se acaba la cuota, la barra se para y dice a qué hora sigue: es una pausa normal, no un error.
- **Al abrir la app** se ve al momento lo último guardado (en `%USERPROFILE%\.monitor-pases\estado.json`), y se actualiza en segundo plano: solo una línea fina bajo la cabecera indica que está sincronizando. Si se cerró en pausa por la cuota, espera a que vuelva.
- **Después, cada 10 minutos** (*Ajustes → Refrescar cada*), vuelve a preguntar. Lo que no ha cambiado contesta «sin cambios» (304) y **no gasta cuota**. Solo cuesta lo nuevo: ramas o commits nuevos y ejecuciones nuevas.
- **Para gastar menos:**
  - De cada repositorio solo se siguen las **3 últimas releases**: las anteriores ya están en producción (*Ajustes → Releases que se siguen por repositorio*).
  - Solo se buscan DPs en las **ejecuciones correctas**: las 10 últimas de cada release y las 2 últimas de cada feature.
  - Los logs solo se leen en las releases, y solo si el DP no aparece en el resumen.
- **Solo cuenta la cuota general.** La búsqueda (con la que se encuentran los repos si el token no puede leer las propiedades de la organización) tiene su propia cuota de 30 por minuto. Si se acaba, la app espera unos segundos y sigue.
- **`sincro.log`**, en la carpeta de datos, apunta una línea por sincronización: cómo se encontraron los repos, cuántos quedaron al día, llamadas, cuota que queda y, si paró, en qué tipo de llamada. Sin nombres de repositorios ni código.
- **Commits, diferencias, árboles, ficheros y PRs:** se piden al abrirlos. Lo que identifica un SHA se guarda en disco y no se vuelve a pedir.

## Seguridad

- **Solo `127.0.0.1`:** el servidor solo escucha en la propia máquina.
- **Cabecera `Host` comprobada.**
- **Clave de sesión en cada llamada:** otra web abierta en el navegador no puede usar la app.
- **Nada se descarga de internet:** la interfaz va dentro.
- **Los tokens no se guardan:** los gestiona Git. Si pones uno a mano, queda en `%USERPROFILE%\.monitor-pases\config.json`.
- **Copilot CLI se ejecuta con Node directamente,** sin pasar por `cmd`, para que el texto de una pregunta no pueda colarse como comando.
- **De BBVA solo sale lo que se publica en `pases-datos`:** DPs, releases, features y nombres de componentes. Y, si lo envías tú tras revisarlo, el diagnóstico de Jira (sin contenido).

## Configuración del equipo

Lo común (organización, patrones, nombres de proyectos, reglas y `pases-datos`) va dentro del ejecutable desde [`config-equipo.json`](config-equipo.json). Para cambiarlo para todos, en *Ajustes → Ajustes del equipo* pulsa *Copiar mis ajustes para el equipo* y guarda lo copiado en ese fichero.

## Desarrollo (en este repositorio)

```bash
python -m unittest discover -s pruebas     # GitHub simulado; Copilot falso con git real (hace falta node y git)
python monitor.py --demo                   # la app con datos inventados (http://127.0.0.1:8775)
python build/compilar.py                   # el .exe (en Windows, con pip install pyinstaller)
```

- `mp/` es el backend, en Python y solo con su librería estándar:
  - `sesion.py`: Git Credential Manager.
  - `sincro.py`: sincronización, releases y DPs.
  - `publicar.py`: `pases-datos`.
  - `navegar.py`: repositorios como en GitHub.
  - `diffs.py`: commits y diferencias.
  - `asistente.py`: Copilot CLI.
  - `jira.py`: Jira (sesión, historias, features, releases y diagnóstico).
  - `ghe.py`: cliente de la API.
  - `servidor.py`: HTTP local.
  - `demo.py` y `demo_jira.py`: GitHub y Jira simulados.
- `web/` es la interfaz, con Preact + htm vendorizados y sin compilar:
  - `app.js`: pestañas y Ajustes.
  - `entrada.js`: inicio de sesión.
  - `diffs.js`: commits y visor de diferencias.
  - `dps.js`: DPs.
  - `repos.js`: repositorios y PRs.
  - `copilot.js`: asistentes.
  - `filtros.js`: filtros comunes (facetas, chips, vistas guardadas).
  - `paleta.js`: «Ir a…» (`Ctrl K`).
  - `jira.js`: Proyectos, Releases y la conexión con Jira.
- `mp/demo.py` simula unos 170 repositorios (157 con `uuaa=KYTL0000` y otros de otra UUAA que el filtro deja fuera).
- Al cambiar algo, sube `VERSION` en `mp/__init__.py`. Al subir a `main`, el workflow publica el `.exe` nuevo en el mismo enlace.
