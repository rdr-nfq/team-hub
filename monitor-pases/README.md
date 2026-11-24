# Monitor de pases

App para **la VDI de BBVA** que enseña todo lo que pasa en los repositorios de GitHub BBVA (`bbva.ghe.com`):
- **Ramas** de cada proyecto.
- **Commits**, cada uno con sus cambios.
- **Diferencias** de cada rama frente a producción.
- **Actions** y los **DPs** que generan.

Con todo eso prepara el **.json del pase** y lo sube a un repositorio privado de NFQ.

**Es un único `MonitorPases.exe`.** Lleva dentro Python, la app y la interfaz, así que no hay que instalar nada. El código vive aquí, en `monitor-pases/`, y cada vez que cambia en `main` GitHub Actions compila, prueba y publica el ejecutable nuevo.

## Descargar y abrir

1. Descarga **[MonitorPases.exe](https://github.com/rdr-nfq/team-hub/releases/download/monitor-pases/MonitorPases.exe)**. El enlace no cambia entre versiones; la versión y el commit se ven en la [release «monitor-pases»](https://github.com/rdr-nfq/team-hub/releases/tag/monitor-pases).
2. Ábrelo con doble clic. Se abre una ventana negra (déjala abierta mientras lo uses) y el navegador en `http://127.0.0.1:8765`. Para salir, cierra la ventana.
3. Si lo abres otra vez estando ya abierto, no arranca otra copia: te lleva a la que ya está.

Para verlo con datos inventados, sin red ni token: `MonitorPases.exe --demo`. Otras opciones: `--puerto 8800`, `--sin-navegador` y `--version`.

> **Si Windows lo bloquea:** es un ejecutable sin firma digital. SmartScreen puede pedir «Más información → Ejecutar de todas formas» y algunos antivirus corporativos frenan este tipo de ejecutables. Si la VDI no lo deja abrir, hay que pedir a sistemas que lo permitan o firmarlo con un certificado de la empresa. El código está entero en este repositorio para que lo revisen.

## Configurar (pestaña Ajustes)

Cada persona solo pone **su token**. Lo común (organización, patrones, nombres de proyectos y reglas) viene dentro del ejecutable desde [`config-equipo.json`](config-equipo.json). Para cambiarlo para todos:
1. Ajústalo en la app.
2. Pulsa *Copiar mis ajustes para el equipo*.
3. Guarda lo copiado en ese fichero y sube el cambio. El siguiente `.exe` ya lo trae.

### Token de GitHub BBVA (solo lectura, uno por persona)

En `bbva.ghe.com`: *Settings → Developer settings → Personal access tokens*.

- **Fine-grained (recomendado):** el propietario es la organización. Elige los repositorios y estos permisos, todos en **Read-only**: *Contents*, *Metadata*, *Pull requests*, *Actions* y *Checks*.
- **Clásico:** alcance `repo`. Ojo: ese alcance también permite escribir. La app no escribe nunca en BBVA, pero un token de solo lectura es más seguro.
- Si la organización usa SSO, el token hay que **autorizarlo**. Si falta, la app lo dice y da el enlace.

Pulsa **Probar conexión** y después **Actualizar**.

### Repositorio de NFQ (adonde se sube el .json)

Un repositorio **privado** de tu GitHub de NFQ (p. ej. `pases-datos`) y un token fine-grained que solo tenga **Contents: Read and write** sobre él. Cada pase se guarda como `pases/pase-AAAA-MM-DD.json`; si lo vuelves a subir, se actualiza.

## Qué se ve

| Pestaña | Para qué |
|---|---|
| **Ramas** | Las ramas de cada proyecto (el código `CIBRDR-1234` sale del nombre de la rama). Para cada una: último commit, cuántos commits no están en producción y cuántos le faltan, PR, última Action y DP. Al pulsar una rama: sus DPs, componentes, commits y ejecuciones, y el botón **Ver las diferencias con master**. |
| **Actividad** | Línea de tiempo de commits, Actions correctas o fallidas y DPs. Cada punto abre su commit. |
| **Commits** | Todos los commits de todos los repositorios, por días y filtrables por proyecto, repositorio, autor, SHA, rama o DP. Cada uno abre su detalle. |
| **Commit / diferencias** | El mensaje completo, el autor, los commits anteriores y la lista de ficheros cambiados con sus diferencias, en vista **unificada** o **lado a lado**, con lo que cambia dentro de cada línea resaltado. **Ver fichero** abre el fichero entero tal como queda en ese commit (o como estaba, si se borra). Lo mismo para una rama entera frente a producción. |
| **Pase** | Fecha y proyectos. La app propone los componentes de sus ramas que no están en producción, con el DP de cada rama. Lo puedes corregir todo y añadir componentes a mano. Revisas el .json exacto y lo guardas o lo subes. |
| **Ajustes** | Conexión, patrones de ramas y DPs, nombres de proyectos, reglas de ficheros a componentes (con probador sobre ficheros reales) y el repositorio de NFQ. |

**«En producción»** significa que la rama ya está entera en `master`. Si un repositorio no tiene `master`, se usa `main` y, si tampoco, su rama por defecto.

### Cuánto pide a GitHub

- **Sincronización:** cada pocos minutos lee ramas, PRs y Actions. Lo que no ha cambiado contesta 304 y no gasta cuota.
- **Commits, diferencias y ficheros:** se piden **al abrirlos** y se guardan en disco. Lo que identifica un SHA no cambia, así que cada uno se pide una sola vez.

### Dónde busca el DP

En cada ejecución terminada de las Actions de una rama (las 10 más recientes), por este orden:

1. Nombres de jobs y pasos.
2. **Resumen** del check del job.
3. **Anotaciones**, como los `::notice::` que salen en *Summary*.
4. Si no aparece, el **log** del job.

El Markdown del *job summary* (`$GITHUB_STEP_SUMMARY`) no se puede leer por la API. Si el DP solo está ahí, se encuentra en el log siempre que el paso lo imprima. Si no aparece en ningún sitio, se puede poner **a mano** en la rama.

### De ficheros a componentes

Reglas en orden: una expresión regular sobre la ruta, más el tipo y la subida. `(?P<nombre>…)` marca el nombre del componente; si no está, se usa el nombre del fichero. Los ficheros con la misma regla y el mismo nombre forman un solo componente.

## El .json del pase

```json
{
  "formato": "monitor-pases/1",
  "pase": "2026-11-28",
  "generado": "2026-11-24T09:00:00Z",
  "proyectos": [{
    "nombre": "Cargador de terceros",
    "feature": "CIBRDR-2311",
    "componentes": [{ "nom": "CargadorTerceros", "tipo": "Java", "subida": "Java", "cod": "DP-KYTL-48031",
                      "resp": "", "us": "", "com": "", "repo": "org/rdr-javas",
                      "rama": "feature/CIBRDR-2311-cargador-terceros", "commit": "d02d8f6" }],
    "dps": [{ "cod": "DP-KYTL-48031", "repo": "org/rdr-javas", "rama": "feature/CIBRDR-2311-cargador-terceros", "run": 9001, "fecha": "…" }]
  }]
}
```

- Los campos de componente (`nom`, `tipo`, `subida`, `cod`, `resp`, `us`, `com`) son los de la hoja de pases de la web.
- Solo salen esos campos: ni código, ni diferencias, ni rutas, ni mensajes de commit.

## Seguridad

- **Solo `127.0.0.1`:** el servidor solo escucha en la propia máquina.
- **Cabecera `Host` comprobada:** evita el *DNS rebinding*.
- **Clave de sesión en cada llamada:** otra web abierta en el navegador no puede usar la app.
- **Nada se descarga de internet:** las fuentes y la interfaz van dentro.
- **Los tokens no salen de la VDI:** viven en `%USERPROFILE%\.monitor-pases\config.json` y nunca llegan a la página.
- **Los logs se descargan sin el token.**
- **No escribe nada en GitHub BBVA.**

En `%USERPROFILE%\.monitor-pases\` están:
- `estado.json`: la última sincronización.
- `diffs\`: la caché de commits y ficheros. Se puede borrar sin problema.
- `pases\`: los .json generados.

Borrar la carpeta deja la app como recién instalada.

## Si no conecta

La app usa el proxy y los certificados de Windows. **Probar conexión** dice el motivo:

- **Certificado no válido:** pon el `.pem` de la empresa en *Ajustes → Conexión*. Suele ser el que usa git: `git config --get http.sslcainfo`.
- **Tiempo agotado:** pon el proxy, que suele ser el de git: `git config --get http.proxy`.
- **El proxy pide usuario (407):** elige el transporte **curl**, que usa tu sesión de Windows.
- **SSO:** autoriza el token con el enlace del error.
- **Cuota agotada:** sube el intervalo de refresco o excluye repositorios.

## Desarrollo (en este repositorio)

```bash
python -m unittest discover -s pruebas     # pruebas contra el GitHub simulado
python monitor.py --demo                   # la app con datos inventados (http://127.0.0.1:8775)
python build/compilar.py                   # el .exe (en Windows, con pip install pyinstaller)
```

- `mp/` es el backend, en Python y solo con su librería estándar:
  - `ghe.py`: cliente de la API.
  - `sincro.py`: sincronización.
  - `diffs.py`: commits, diferencias y ficheros.
  - `clasificar.py`: reglas.
  - `pase.py`: el .json.
  - `servidor.py`: HTTP local.
  - `demo.py`: GitHub simulado, con ficheros y cambios inventados.
- `web/` es la interfaz: Preact + htm vendorizados, sin compilar.
  - `app.js`: pestañas.
  - `diffs.js`: commits y visor de diferencias.
  - `comun.js`: piezas comunes.
- `build/` tiene el icono y el script de compilación. El workflow es `.github/workflows/monitor-pases.yml`.
- Al cambiar algo, sube `VERSION` en `mp/__init__.py`. Al subir a `main`, el workflow publica el `.exe` nuevo en el mismo enlace.
