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
2. Ábrelo con doble clic. Se abre una ventana negra (déjala abierta mientras lo uses) y el navegador en `http://127.0.0.1:8765`. Para salir, cierra la ventana.
3. **Inicia sesión** con tu GitHub de BBVA y tu GitHub de NFQ (ver abajo).

Para verlo con datos inventados, sin red: `MonitorPases.exe --demo`. Otras opciones: `--puerto 8800`, `--sin-navegador` y `--version`.

> **Si Windows lo bloquea:** es un ejecutable sin firma digital. SmartScreen puede pedir «Más información → Ejecutar de todas formas» y algunos antivirus corporativos frenan este tipo de ejecutables. Si pasa, hay que pedir a sistemas que lo permitan o firmarlo con un certificado de la empresa.

## Inicio de sesión

Al abrir la app hay que iniciar sesión en **GitHub BBVA** (obligatorio) y en **GitHub NFQ** (para publicar los DPs y los pases).

La app no tiene inicio de sesión propio. Se la pide a **Git**, que en Windows la gestiona Git Credential Manager: es la misma sesión con la que haces `git pull`.
- **Si ya tienes sesión guardada**, entra directamente.
- **Si no**, al pulsar *Iniciar sesión* se abre la ventana de GitHub en el navegador.
- **La app no guarda el token:** lo tiene en memoria mientras está abierta.

Si tienes varias cuentas en un mismo GitHub, pon tu usuario en *Ajustes → Sesiones*.

Si Git no tiene gestor de credenciales (`git config --get credential.helper` sale vacío), puedes poner un **token personal** en Ajustes. Para GitHub BBVA, de solo lectura con *Contents*, *Metadata*, *Pull requests*, *Actions* y *Checks*.

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

### DPs y releases

Las ramas `release/x.y.z` (configurable) son subidas. La Action de la release genera el DP. Cuando la app ve un DP nuevo:
1. Guarda en ese momento lo que trae frente a producción.
2. Si cuando lo ve la release ya está en producción, lo compara con la release anterior.
3. Saca las features de la release de los PRs mezclados en ella y de los mensajes de commit.

**El DP en sí** se busca en el resumen, las anotaciones y, si no, el log de la Action. También se puede poner a mano en la rama.

**En `rdr-nfq/pases-datos`** se publica `dps/<repositorio>/<DP>.json` con release, features y componentes (nombre, tipo y subida). **Sin código ni rutas.** Se hace automáticamente en cada sincronización si tienes la sesión de NFQ, o con *Publicar* en la pestaña DPs. Un DP ya publicado por otra persona del equipo no se vuelve a subir.

### Asistentes con Copilot CLI

Usan [GitHub Copilot CLI](https://github.com/github/copilot-cli) con tu cuenta de Copilot de BBVA.

**Prepararlo** (la pestaña Copilot lo comprueba):
1. Hace falta Node.js 22 o superior.
2. Si no tienes Copilot CLI, el botón **Instalar** ejecuta `npm install -g @github/copilot`.
3. Si npm no conecta, suele ser el proxy: define `HTTPS_PROXY` y `HTTP_PROXY` en las variables de entorno de tu usuario o en *Ajustes → Copilot*, y `NODE_EXTRA_CA_CERTS` si hay inspección TLS.
4. **Iniciar sesión en Copilot** abre una ventana con Copilot CLI: escribe `/login`.

**Los dos modos:**
- **Consultar** sobre una rama, un DP o todo lo que ve el monitor. Copilot lee el código en una copia local, que se descarga con tu Git. No puede escribir ficheros ni ejecutar más que comandos de lectura de git.
- **Modificar una feature.** Copilot cambia el código en una copia local de la rama. No puede hacer commit ni push, y solo ejecuta comandos si lo activas en Ajustes. Ves el diff en la app y, si lo apruebas, la app hace el commit y el push a la rama con tu Git.

Las copias locales viven en `%USERPROFILE%\.monitor-pases\repos` y `copilot\`.

## Cuánto pide a GitHub

- **Sincronización:** cada pocos minutos. Lo que no ha cambiado contesta 304 y no gasta cuota.
- **Commits, diferencias, árboles, ficheros y PRs:** se piden al abrirlos. Lo que identifica un SHA se guarda en disco y no se vuelve a pedir.

## Seguridad

- **Solo `127.0.0.1`:** el servidor solo escucha en la propia máquina.
- **Cabecera `Host` comprobada.**
- **Clave de sesión en cada llamada:** otra web abierta en el navegador no puede usar la app.
- **Nada se descarga de internet:** la interfaz va dentro.
- **Los tokens no se guardan:** los gestiona Git. Si pones uno a mano, queda en `%USERPROFILE%\.monitor-pases\config.json`.
- **Copilot CLI se ejecuta con Node directamente,** sin pasar por `cmd`, para que el texto de una pregunta no pueda colarse como comando.
- **De BBVA solo sale lo que se publica en `pases-datos`:** DPs, releases, features y nombres de componentes.

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
  - `ghe.py`: cliente de la API.
  - `servidor.py`: HTTP local.
  - `demo.py`: GitHub simulado.
- `web/` es la interfaz, con Preact + htm vendorizados y sin compilar:
  - `app.js`: pestañas y Ajustes.
  - `entrada.js`: inicio de sesión.
  - `diffs.js`: commits y visor de diferencias.
  - `dps.js`: DPs.
  - `repos.js`: repositorios y PRs.
  - `copilot.js`: asistentes.
- Al cambiar algo, sube `VERSION` en `mp/__init__.py`. Al subir a `main`, el workflow publica el `.exe` nuevo en el mismo enlace.
