# Manual del Monitor de pases

## Primeros pasos {#inicio}

El Monitor de pases es una app para la **VDI de BBVA**. Junta en un solo sitio lo que hoy está repartido entre GitHub BBVA y Jira:
- las ramas y los commits de vuestros repositorios;
- las releases y sus DPs;
- las historias y features de Jira;
- la preparación del pase.

### Abrir y cerrar
- **Abrir:** doble clic en `MonitorPases.exe`. No se instala nada y no se abre ninguna ventana negra: la app se abre en el navegador, en `http://127.0.0.1:8765`.
- **Cerrar:** cierra la pestaña. La app se apaga sola unos segundos después de cerrar su última pestaña. Recargar la página no la cierra.
- **Volver a abrirla:** otra vez doble clic en el .exe. Si ya estaba abierta, solo abre la pestaña.

### Iniciar sesión
Al abrirla pide:
- **GitHub BBVA** (obligatorio): para leer repositorios, commits, Actions y DPs. Pulsa *Iniciar sesión* y sigue la ventana de GitHub; si ya tienes sesión en Git, entra solo.
- **GitHub NFQ**: para publicar los DPs y los pases en `rdr-nfq/pases-datos`. Sin él la app funciona, pero no publica.
- **Jira** (opcional): historias, features con su SDATOOL y releases. Mira la sección *Jira*.

Las sesiones las guarda Git (el almacén de credenciales de Windows): solo se piden la primera vez.

### La primera carga
La primera vez descarga la información de todos los repositorios (los de `props.uuaa:KYTL0000`). Arriba sale **«Primera carga de los repositorios»** con una barra de progreso:
- Puedes usar la app mientras tanto: los repositorios van apareciendo según se leen.
- Si GitHub dice que ya has hecho todas las consultas de esa hora, la barra se para y pone **a qué hora sigue**. Es una pausa normal, no un error, y sigue sola desde donde se quedó.
- Después de la primera carga, cada vez que abres la app ves al momento lo último guardado y se actualiza en segundo plano.

## Ramas {#ramas}

La pestaña principal: todas las ramas de proyecto y las **releases** (cada `release/x.y.z` es una subida).

### Qué se ve en cada rama
- **Repo** y **nombre de la rama**, con su PR si lo tiene.
- **Último commit**: mensaje, autor y cuándo. Pulsa el mensaje para ver sus cambios.
- **Fuera de producción**: cuántos commits tiene que no están en `master` y cuántos le faltan de `master`. *Ya en master* = ya está en producción.
- **Action y DP**: cómo acabó la última ejecución y el DP que generó. Pulsa el DP para ver sus componentes y cambios.
- **Comp.**: cuántos componentes toca.

### Agrupar y ordenar
- **Agrupar por** Proyecto, Repositorio o Persona.
- Cada grupo se pliega con su flecha. Enseña 8 ramas y, si hay más, «Ver N ramas más».
- *Plegar todo* deja ver solo las cabeceras.
- Con el grupo **Releases** ves de un vistazo las subidas y sus features. En cada grupo de proyecto, **Preparar pase** lleva a la pestaña Pase con ese proyecto.

### El detalle de una rama
Pulsa una fila para abrir el panel de la derecha. Tiene:
- cifras de la rama;
- sus **DPs** (y puedes añadir uno a mano);
- sus **componentes** con sus ficheros;
- **Jira**: la feature con su SDATOOL y las historias que citan sus commits;
- sus commits y sus ejecuciones de Actions.

Botones del panel:
- *Ver las diferencias con master*.
- *Código*.
- *Preguntar a Copilot* y *Modificar con Copilot*.
- *GitHub* y *PR*.

## Proyectos y releases (Jira) {#proyectos}

Une GitHub con Jira. Necesita Jira conectado (si no, la pestaña te enseña cómo).

### Proyectos (features)
Una fila por feature (las `CIBRDR-…`). Cada fila tiene:
- **Estado en Jira**.
- **SDATOOL**, que se busca solo en la feature: en enlaces, campos, enlaces remotos o la descripción. *sin SDATOOL* = no aparece en ninguno.
- **Historias hechas** (barra: verde hechas, azul en curso).
- Ramas abiertas, repos, DPs y último cambio en GitHub.

Filtros: buscador, *También sin ramas abiertas* y *Solo sin SDATOOL* (para detectar las que falta pedir).

Al pulsar una feature ves su ficha:
- botones *Abrir en Jira*, *Ver sus ramas* y *Preparar pase*;
- sus **historias**, con estado, quién la tiene, release (*tech-version*) y en qué repos tiene commits. *no cuelga de la feature* = se cita en los commits de sus ramas, pero en Jira no está unida a esta feature;
- sus ramas y releases en GitHub.

### Releases de RDR
Todas las releases del proyecto RDR de Jira, con buscador y *Solo las que no se han publicado*. Abre una para comparar sus historias:
- **En Jira**: tiene esa release en *tech-version*.
- **En la rama**: aparece en los commits de la rama `release/x.y.z`.
- Se marcan las que están en Jira sin commits y las que están en la rama sin la release en Jira.
- *aún no está en Jira*: la rama se crea antes que la release en Jira; mientras tanto ves las historias de sus commits.

## Actividad {#actividad}

Una línea de tiempo por rama de los últimos días:
- **Círculos:** commits, del color del proyecto.
- **Cuadrados:** ejecuciones de Actions (verde: correcta; naranja: fallida).
- **Rombos:** DPs generados.

Pasa el ratón por encima para ver el detalle; pulsa para abrir el commit o la rama. Usa los mismos filtros que Ramas.

## Commits {#commits}

Todos los commits de todos los repositorios, por días. En cada uno:
- su mensaje;
- las **historias de Jira** que cita (etiqueta con su estado, pulsa para abrirla en Jira);
- las ramas y si ya está en producción;
- la Action y el DP.

Al pulsar un commit ves sus **diferencias** fichero a fichero, unificadas o lado a lado, y puedes abrir el fichero entero antes o después del cambio.

*Incluir los que solo están en producción* añade los commits de `master`.

## DPs {#dps}

Los DPs detectados en las Actions, agrupados por **Release**, **Proyecto** o **Repositorio**.

### Cada DP
- Cuándo se generó y en qué commit.
- Sus **componentes** (nombre, tipo y subida) y cuántos ficheros y líneas cambia.
- Si ya está en `pases-datos`. Los DPs se publican solos en cada sincronización si tienes la sesión de NFQ; *Publicar N* fuerza la publicación.

Pulsa un DP para ver todos sus componentes (con buscador y filtro por tipo) y sus **modificaciones**: lo que trae frente a producción.

### Releases y Jira
En los grupos de release:
- La etiqueta **Jira** dice si la release está publicada o no en Jira, o *aún no está en Jira*.
- El botón **Historias** compara las historias de Jira con las de los commits de la rama (como en Proyectos → Releases).

### De dónde sale el DP
Del resumen de la Action (*Summary*), de sus anotaciones o, si no, del log. También se puede poner a mano en el detalle de la rama.

## Repos {#repos}

La tabla de todos los repositorios, que se ordena pulsando las cabeceras (ramas abiertas, releases, DPs, último cambio). Los filtros de la izquierda incluyen las propiedades de GitHub (UUAA, lenguaje…). Las menos útiles (branching model, bu kind, kind, stack id) van al final y plegadas.

Al abrir un repositorio lo navegas como en la web de GitHub:
- **Código** de cualquier rama, etiqueta o commit, con buscador de ficheros (tecla `t`) y README.
- **Commits**: historial de la rama o de un fichero.
- **Pull requests**: conversación, revisiones, comentarios en el código, commits y ficheros.
- **Comparar** dos ramas, etiquetas o commits.

## Copilot {#copilot}

Asistentes con **GitHub Copilot CLI**, con tu cuenta de Copilot de BBVA.

### Preparación
La pestaña comprueba que todo está:
- **Copilot CLI**: la app lo encuentra esté instalado como esté (`copilot.exe`, npm, winget, VS Code…). Si no, en una terminal donde `copilot` funcione ejecuta `where copilot` y pega la ruta en *Ajustes → Copilot*. Si no lo tienes, *Instalar Copilot CLI (npm)*.
- **Git**: para las copias locales de las ramas.
- **Iniciar sesión en Copilot**: abre una ventana con Copilot; escribe `/login` y sigue los pasos (cuenta de empresa, `bbva.ghe.com`).

Si npm o Copilot no conectan, casi siempre es el proxy: define `HTTPS_PROXY` y `HTTP_PROXY` en tus variables de entorno o en *Ajustes → Copilot*.

### Consultar
Elige una rama, un DP o «todo» y pregunta. Copilot lee el código en una copia local y **no puede cambiar nada**.

### Modificar una feature
Elige una rama de feature y pide el cambio. Copilot lo hace en una copia local y no puede hacer commit ni push. Ves el diff en la app y:
- si te convence, **Hacer commit y subir** (con tu Git);
- si no, *Descartar*.

## Pase {#pase}

Prepara el `.json` del pase.

1. Elige la fecha y los proyectos (o llega desde *Preparar pase* de un proyecto).
2. La app propone los componentes de las ramas pendientes de producción, con su DP, tipo y subida.
3. Revisa y ajusta: quita componentes, cambia nombres, añade alguno a mano.
4. **Guardar** lo deja en tu equipo; **Subir** lo manda a `rdr-nfq/pases-datos`. Antes de subir ves exactamente lo que sale.

## Ajustes {#ajustes}

### Sesiones y conexión
- **Sesiones:** GitHub BBVA, GitHub NFQ y Jira.
- **Conexión:**
  - organización y **filtro de repositorios** (`props.uuaa:KYTL0000`, lo mismo que en el buscador de GitHub);
  - repositorios sueltos o excluidos;
  - proxy y certificados si la red lo pide.

### Ramas, releases y DPs
- Patrones de ramas de proyecto, de release y del DP.
- Cada cuánto refresca (por defecto 10 minutos).
- Días de actividad.
- Cuántas **releases se siguen por repositorio** (las 3 últimas: las anteriores ya están en producción y leerlas gasta cuota).

### Reglas de componentes
Convierten ficheros cambiados en componentes (nombre, tipo y subida). *Probar con ficheros reales* enseña cómo quedan.

### Jira
- Dirección.
- Proyecto de las releases (RDR).
- Campos que unen historia y feature y la historia con su release. Se detectan solos; solo hay que tocarlos si el diagnóstico lo pide.
- *Leer Jira ahora*.
- *Generar diagnóstico*.

### Copilot
Ruta de Copilot CLI, modelo, opciones y variables de entorno (proxy).

### Ajustes del equipo
*Copiar mis ajustes para el equipo* prepara `config-equipo.json`, que va dentro del .exe para todos.

## Jira {#jira}

### Conectar con un token
La app lee Jira con un **token personal**, una contraseña especial que te da Jira. Se crea una vez:
1. En la entrada, en Proyectos o en *Ajustes → Jira*, pulsa **Abrir Jira**. Entra con tu usuario de BBVA si te lo pide.
2. Abre la pestaña **«Tokens de acceso personal»**. Si no la ves: arriba a la derecha, tu foto → *Perfil* → *Tokens de acceso personal*.
3. **Crear token**, con nombre *Monitor de pases* y la caducidad más larga que te deje. Pulsa **Crear**.
4. Jira lo enseña **una sola vez**: pulsa **Copiar**.
5. Pégalo en la app y pulsa **Conectar**.

Queda guardado en el almacén de credenciales de Windows. Cuando caduque, la app te pedirá otro. Si vuestro Jira no tiene tokens, usa *Prefiero usuario y contraseña*.

### Qué saca de Jira
- **Historias de los commits**: las claves de Jira de cada mensaje (`RDR-1234 …`). Las de los DPs (`DP-KYTL-…`) no cuentan.
- **Features**: nombre, estado, SDATOOL y sus historias (campo *Feature Link* / *Epic Link*).
- **Releases** del proyecto RDR y sus historias (campo *tech-version*).

### Diagnóstico
Si algo no cuadra (un campo con otro nombre, releases con otro formato…), usa *Ajustes → Jira → Generar diagnóstico*:
- Prueba cómo está montado vuestro Jira y prepara un informe **sin contenido**: nombres de campos, cifras y formas como `9.999.9`. Ni títulos, ni descripciones, ni personas.
- Lo revisas en pantalla y, si quieres, lo envías a `pases-datos/diagnostico/` para ajustar la app.

## Filtros, vistas e «Ir a…» {#filtros}

### Filtros del lateral
En Ramas, Actividad, Commits, DPs y Repos: proyecto, repositorio, persona y propiedades de los repos.
- Cada opción dice cuántos resultados da con el resto de filtros.
- Puedes marcar varias, y cada lista tiene su buscador.
- *Quitar* limpia esa lista.

### Arriba de cada vista
- **Buscador** (tecla `/`): busca palabras sueltas en todo.
- **Periodo**: todo, 7, 14 o 30 días.
- **Filtros activos**: aparecen como etiquetas; quítalos con su ×, o todos con *Quitar todos*.
- **Vistas**: *Lo mío* (donde has hecho commits), *Esta semana* y las que guardes tú con un nombre.

Los filtros se recuerdan al cerrar la app.

### «Ir a…» (Ctrl+K)
Escribe un trozo del nombre de un repositorio, una rama, una release, un proyecto, un SDATOOL, una historia de Jira o el SHA de un commit, y ve directo. Muévete con las flechas y abre con Intro.

## Sincronización y cuota de GitHub {#sincronizacion}

- Cada 10 minutos (y con *Actualizar*) la app pregunta a GitHub qué ha cambiado.
- Lo que no ha cambiado no gasta cuota, así que solo cuesta lo nuevo.
- GitHub deja hacer unas 5.000 consultas por hora a cada persona. La primera carga puede necesitar más. Entonces la app para antes de gastarla entera (deja margen para seguir navegando) y **sigue sola** cuando se renueva, sin repetir lo ya hecho.
- En la cabecera, «Sigue a las …» indica una pausa así. Mientras sincroniza, una línea fina bajo la cabecera enseña el avance.
- `sincro.log`, en la carpeta de datos, apunta una línea por sincronización: cuántos repositorios, cuántas consultas y, si paró, dónde. No guarda nombres ni código, así que se puede compartir para revisar problemas.

## Seguridad: qué sale de la VDI {#seguridad}

- La app solo escucha en tu propio equipo (`127.0.0.1`) y cada llamada lleva una clave de sesión.
- Los tokens los guarda Git (almacén de credenciales de Windows); la app no los escribe en disco.
- **Solo sale de la VDI** lo que se publica en `rdr-nfq/pases-datos`:
  - los DPs: release, features y nombres de componentes, nunca código;
  - los pases que subes tú;
  - el diagnóstico de Jira, si lo envías tú tras revisarlo.
- El chat de ayuda usa Copilot, igual que la pestaña Copilot.
- Los datos locales viven en `%USERPROFILE%\.monitor-pases`.

## Problemas frecuentes {#problemas}

- **«Primera carga en pausa»**: normal. GitHub limita las consultas por hora y la app sigue sola a la hora indicada.
- **No me deja iniciar sesión en GitHub**: comprueba que Git tiene el gestor de credenciales (`git config --get credential.helper`). Si no, pon un token personal en *Ajustes*.
- **No encuentra Copilot CLI**: en una terminal donde funcione, `where copilot`, y pega la ruta en *Ajustes → Copilot*.
- **Copilot o npm no conectan**: casi siempre es el proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `NODE_EXTRA_CA_CERTS`).
- **Jira dice que el token no vale**: puede haber caducado o estar mal copiado. Crea otro (sección *Jira*).
- **Un proyecto sale *sin SDATOOL***: la feature de Jira no lo tiene en enlaces, campos ni descripción. Añádelo en Jira.
- **Una historia sale *sin tech-version***: está en la rama de release, pero en Jira no tiene esa release. Revísalo en Jira.
- **Windows bloquea el .exe**: es un ejecutable sin firma digital. SmartScreen pide «Más información → Ejecutar de todas formas»; si lo frena el antivirus, hay que pedir a sistemas que lo permita.
- **La app se ha cerrado sola**: se cierra al cerrar su última pestaña. Vuelve a abrir el .exe.

## Atajos de teclado {#atajos}

| Tecla | Qué hace |
|---|---|
| `Ctrl` + `K` | «Ir a…» cualquier repositorio, rama, proyecto, historia o DP |
| `/` | Ir al buscador de la vista |
| `F1` o `?` | Abrir este manual |
| `t` | Buscar un fichero (en el código de un repositorio) |
| `Esc` | Cerrar el panel o el diálogo abierto |
