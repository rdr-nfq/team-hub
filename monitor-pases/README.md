# Monitor de pases

App local para **la VDI de BBVA**. Lee los repositorios de GitHub BBVA (`bbva.ghe.com`): ramas, commits, PRs y GitHub Actions. Con eso enseña lo que hay pendiente de producción en cada proyecto, encuentra los DPs que generan las Actions y prepara el **.json del pase**. Ese .json se puede subir a un repositorio privado de tu cuenta de NFQ.

- **Sin instalar nada:** solo Python 3.8 o superior, con su librería estándar. No hay `pip install`.
- **No descarga nada de internet:** las fuentes y la librería de la interfaz van dentro de la carpeta.
- **La información no sale de la VDI.** La app solo habla con `bbva.ghe.com` y, cuando tú pulsas «Subir», con GitHub NFQ. Lo único que sale es el .json del pase. Antes de guardarlo o subirlo, la app te enseña su contenido exacto.

## Arrancar

1. Copia la carpeta `monitor-pases` a la VDI. Puedes clonar el repositorio `team-hub` o descargar el zip.
2. Haz doble clic en **`Iniciar monitor.bat`**, o ejecuta `python monitor.py`. Se abre el navegador en `http://127.0.0.1:8765`.
3. Para verla antes con datos inventados (sin red ni token): **`Probar la demo.bat`** o `python monitor.py --demo`.

Para pararla, cierra la ventana negra. Opciones: `--puerto 8800` y `--sin-navegador`.

## Configurar (pestaña Ajustes)

### Token de GitHub BBVA (solo lectura)

En `bbva.ghe.com`: *Settings → Developer settings → Personal access tokens*.

- **Fine-grained (recomendado):** el propietario es la organización. Elige los repositorios y estos permisos, todos en **Read-only**: *Contents*, *Metadata*, *Pull requests*, *Actions* y *Checks*.
- **Clásico:** alcance `repo`. Ojo: ese alcance también permite escribir. La app no escribe nunca en BBVA, pero un token fine-grained de solo lectura es más seguro.
- Si la organización usa SSO, el token hay que **autorizarlo** (*Configure SSO*). Si falta, la app lo dice y da el enlace.

En Ajustes pon también la **organización** (o tu usuario) y, si hace falta, repositorios sueltos o los que no quieras mirar. Pulsa **Probar conexión** y después **Actualizar**.

### Repositorio de NFQ (adonde se sube el .json)

Crea en tu GitHub de NFQ un repositorio **privado** (p. ej. `pases-datos`) y un token fine-grained que solo tenga **Contents: Read and write** sobre ese repositorio. Cada pase se guarda como `pases/pase-AAAA-MM-DD.json`; si lo vuelves a subir, se actualiza.

## Qué hace

| Vista | Para qué |
|---|---|
| **Ramas** | Ramas de cada proyecto (el código `CIBRDR-1234` sale del nombre de la rama). Para cada una: último commit, commits que no están en producción y los que le faltan, PR, última Action y DP. Pulsa una rama para ver sus DPs, componentes, commits y ejecuciones. |
| **Actividad** | Línea de tiempo de los últimos días: commits (color del proyecto), Actions correctas o fallidas y DPs generados. Abajo, lo que ha entrado en producción. |
| **Pase** | Eliges la fecha y los proyectos. La app propone los componentes de sus ramas que aún no están en producción, con el DP de cada rama. Lo puedes corregir todo, añadir componentes a mano, revisar el .json y guardarlo o subirlo. Los cambios se guardan solos como borrador. |
| **Ajustes** | Conexión, patrones de ramas y DPs, nombres de proyectos, reglas para pasar de ficheros a componentes (con un probador sobre ficheros reales) y el repositorio de NFQ. |

**«En producción»** significa que la rama ya está entera en `master`. Si un repositorio no tiene `master`, se usa `main` y, si tampoco, su rama por defecto. Se puede cambiar en Ajustes.

### Dónde busca el DP

En cada ejecución terminada de las Actions de una rama (las 10 más recientes), por este orden:

1. Nombres de los jobs y de sus pasos.
2. **Resumen** del check del job: título, resumen y texto.
3. **Anotaciones** del job, como los `::notice::` que se ven en *Summary*.
4. Si no aparece y está activado «Buscar el DP en los logs», el **log** de cada job.

Avisos:
- El texto en Markdown del *job summary* (`$GITHUB_STEP_SUMMARY`) no se puede leer por la API de GitHub. Si el DP solo está ahí, la app lo encuentra en el log siempre que el paso también lo imprima.
- GitHub borra los logs pasado su plazo de retención (90 días por defecto).
- Si no lo encuentra, puedes poner el DP **a mano** en el detalle de la rama.

El formato del DP (`DP-KYTL-…`) y los workflows en los que buscarlo se configuran en Ajustes.

### De ficheros a componentes

Se usan las reglas de Ajustes, en orden: una expresión regular sobre la ruta, más el tipo y la subida. `(?P<nombre>…)` marca el nombre del componente; si no está, se usa el nombre del fichero. Los ficheros de una misma regla y nombre forman un solo componente. Por ejemplo, `^workstation/(?P<nombre>[^/]+)/` junta todos los ficheros de una pantalla. Ajusta las reglas a la estructura real de los repositorios con el botón **Probar con ficheros reales**.

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

- Los campos de cada componente (`nom`, `tipo`, `subida`, `cod`, `resp`, `us`, `com`) son los mismos que usa la hoja de pases de la web.
- Solo salen esos campos: ni código, ni rutas de ficheros, ni mensajes de commit. El servidor los filtra otra vez antes de guardar o subir.

## Seguridad

- **El servidor solo escucha en `127.0.0.1`:** ningún otro equipo puede conectarse.
- **Comprueba la cabecera `Host`:** así evita el *DNS rebinding*.
- **Clave de sesión aleatoria:** cada llamada a la API la lleva. Otra web abierta en el navegador no puede usar la app.
- **Los tokens no salen de la VDI:** viven en `%USERPROFILE%\.monitor-pases\config.json`, fuera del repositorio, y nunca se envían a la página.
- **Los logs se descargan sin el token:** GitHub los sirve desde su almacenamiento, al que no se le manda.
- **La app no escribe nada en GitHub BBVA.**

En `%USERPROFILE%\.monitor-pases\` están también `estado.json` (la última sincronización, para abrir rápido) y `pases\` (los .json generados). Borrar esa carpeta deja la app como recién instalada.

## Si no conecta

La app usa el proxy y los certificados del sistema, igual que el navegador. En **Probar conexión** verás el motivo y qué hacer:

- **Certificado no válido:** la red inspecciona el tráfico. Pon en *Ajustes → Conexión → Certificado raíz* el `.pem` de la empresa. Suele ser el que usa git: `git config --get http.sslcainfo`.
- **Tiempo agotado:** la VDI navega con proxy. Pon su dirección, que suele ser la de git: `git config --get http.proxy`.
- **El proxy pide usuario (407):** elige el transporte **curl**, que usa tu sesión de Windows.
- **SSO:** autoriza el token con el enlace que da el error.
- **Cuota de la API agotada:** sube el intervalo de refresco o excluye repositorios. Cada sincronización solo gasta llamadas en lo que ha cambiado; lo demás contesta 304 y no gasta cuota.

## Desarrollo

```bash
python -m unittest discover -s pruebas     # pruebas contra el GitHub simulado
python monitor.py --demo                   # la app con datos inventados
```

- `mp/` es el backend:
  - `ghe.py`: cliente de la API.
  - `sincro.py`: sincronización y estado.
  - `clasificar.py`: reglas.
  - `pase.py`: el .json.
  - `servidor.py`: HTTP local.
  - `demo.py`: GitHub simulado.
- `web/` es la interfaz: Preact + htm vendorizados, sin compilar.
