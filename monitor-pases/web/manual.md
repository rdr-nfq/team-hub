# Manual de RDR Coding

## Primeros pasos {#inicio}

El RDR Coding es una app para la **VDI de BBVA**. Junta en un solo sitio lo que hoy está repartido entre GitHub BBVA y Jira:
- las ramas y los commits de vuestros repositorios;
- las releases y sus DPs;
- las historias y features de Jira;
- la preparación del pase.

### Abrir y cerrar (plugin de VS Code)
1. Instala `MonitorPases.vsix`: en VS Code, **Extensiones → ⋯ → Instalar desde VSIX…**.
2. Pulsa **RDR Coding** en la barra de estado (abajo a la izquierda) o su icono en la barra lateral: la app se abre en un panel de VS Code.
3. Todo está también en `Ctrl+Shift+P` → «RDR Coding»: *Iniciar sesión en Jira (abre Chrome)*, *Actualizar ahora*, *Abrir en el navegador*, *Probar la demo*, *Ver el registro*…

> **Consejo:** los enlaces a GitHub, Jira o Actions se abren en tu navegador, y el tema claro u oscuro sigue al de VS Code.

- **Cerrar:** cierra el panel; el motor sigue en segundo plano y se apaga al cerrar VS Code (o con *Detener el motor*).
- **Python:** el plugin usa el de la VDI (3.8 o superior). Si no lo encuentra, *Elegir Python…*.
- **Con el `.exe`** (si se puede ejecutar): doble clic y se abre en el navegador; se apaga al cerrar su última pestaña.

### Iniciar sesión
Al abrirla comprueba si ya tienes las sesiones y, si están, entra sola. Si falta alguna, pulsa **Conectar todo**: abre una tras otra las ventanas de inicio de sesión que falten y solo tienes que entrar como siempre en cada una.
1. **GitHub BBVA** (obligatoria): repositorios, commits, Actions y DPs. Se abre la ventana de GitHub; si ya tienes sesión en Git, entra sola.
2. **Jira** (obligatoria): proyectos, historias, SDATOOL y releases. Se abre Jira en Chrome (o Edge) y entras con tu usuario de BBVA (ver *Jira*).
3. **GitHub NFQ** (opcional): para publicar los DPs, los pases y compartir qué proyectos son de NFQ en `rdr-nfq/pases-datos`. Si entras sin ella, la app lo recuerda y no vuelve a esperarla.

Sin GitHub BBVA y Jira no se puede entrar. Solo se piden la primera vez: GitHub lo guarda Git (almacén de credenciales de Windows) y Jira, el perfil del navegador de la app. Si dentro de la app se pierde la sesión de Jira, arriba sale **Conectar Jira**: un clic y vuelve a entrar.

### La primera carga
La primera vez descarga la información de todos los repositorios (los de `props.uuaa:KYTL0000`). Arriba sale **«Primera carga de los repositorios»** con una barra de progreso:
- Puedes usar la app mientras tanto: los repositorios van apareciendo según se leen.
- Si GitHub dice que ya has hecho todas las consultas de esa hora, la barra se para y pone **a qué hora sigue**. Es una pausa normal, no un error, y sigue sola desde donde se quedó.
- Después de la primera carga, cada vez que abres la app ves al momento lo último guardado y se actualiza en segundo plano.

## Ramas {#ramas}

La pestaña principal: todas las ramas de proyecto y las **releases** (cada `release/x.y.z` es una subida).

### De qué proyecto es cada rama
La app lo deduce sola, en este orden:
1. El código `CIBRDR-…` del **nombre de la rama**.
2. Si el nombre no lo lleva (p. ej. `feature/carga-nocturna`), las claves `CIBRDR-…` de **sus commits**: la que más se repite.
3. Si esa clave es una **historia**, cuenta como su **feature** en Jira (*Feature Link*).

> **Consejo:** las ramas de integración (`develop`, `qa`, `uat`…) mezclan commits de muchos proyectos, así que no se asignan a ninguno. Si una rama mezcla varios sin que ninguno domine, sale en *Sin proyecto*.

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

### Qué es un proyecto
Un proyecto es una **Feature o Task de `CIBRDR`**. Su nombre es siempre **el de Jira**. Los que están en **Deployed** o **Discarded** pasan al **histórico**: no se ven de primeras, pero están a un clic.

En *Proyectos → En desarrollo (elegir)* salen todos los de Jira:
1. Marca los que son **de NFQ** (clic en la fila o en la casilla).
2. Si quieres, *Marcar los que tienen ramas* marca de golpe los que tienen ramas abiertas en vuestros repos.
3. Pulsa **Guardar**.

> **Importante:** la selección se **comparte con el equipo** en `pases-datos` (solo las claves, como `CIBRDR-1234`) si tienes la sesión de GitHub NFQ. Cuando otra persona abre la app, ve la misma.

Filtros: *En desarrollo* / *Histórico*, tipo (Feature, Task), marcados / sin marcar y buscador. Los tipos, los estados terminados y el proyecto se cambian en *Ajustes → Jira*.

### El histórico
Arriba de *De NFQ* y de *En desarrollo (elegir)* está el selector **En desarrollo | Histórico**. En el histórico salen los proyectos en **Deployed** y **Discarded**, con sus ramas, historias y DPs como cualquier otro.

### Proyectos de NFQ
Una fila por cada proyecto marcado como de NFQ que sigue en desarrollo (los terminados, en *Histórico*). Mientras no hay ninguno marcado, salen todos los que tienen ramas. Cada fila tiene:
- **Estado en Jira**.
- **SDATOOL**, que se busca solo en la feature: en el enlace *SDA project - Feature*, en las etiquetas (*labels*), en otros enlaces y campos, en los enlaces remotos o en la descripción. *sin SDATOOL* = no aparece en ninguno.
- **Historias hechas** (barra: verde hechas, azul en curso).
- Ramas abiertas, repos, DPs y último cambio en GitHub.

Filtros: buscador, *En desarrollo* / *Histórico* y *Solo sin SDATOOL* (para detectar las que falta pedir).

Al pulsar una feature ves su ficha:
- botones *Abrir en Jira*, *Ver sus ramas* y *Preparar pase*;
- sus **historias**, con estado, quién la tiene, release (*tech-version*) y en qué repos tiene commits. *no cuelga de la feature* = se cita en los commits de sus ramas, pero en Jira no está unida a esta feature;
- sus ramas y releases en GitHub.

### Releases de CIBRDR
Todas las releases del proyecto CIBRDR de Jira, con buscador y *Solo las que no se han publicado*. Abre una para comparar sus historias:
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

En la lista, dos avisos te dicen qué DPs mirar: **pisaría cambios de producción** (en rojo) y **producción va por delante**.

### Cómo se calcula lo que trae (frente a producción)
1. Se compara el commit del DP con **producción** (`master`), como la comparación de GitHub.
2. Se mira el **contenido**: un fichero del DP que ya es **idéntico** al de producción no cuenta. Es lo que pasa cuando entró por otro lado: una release anterior con *squash*, un *cherry-pick* o un hotfix.
3. Se mira **al revés**: lo que producción tiene y el DP no lleva (un hotfix que no se ha bajado a la release).
4. Mientras la release **no está en producción**, se recalcula cada vez que producción cambia. Cuando entra, se **congela** con el último cálculo. Si la app ve el DP por primera vez con la release ya en producción, lo compara con la release anterior.
5. Si el repositorio tiene **package descriptor** (un XML en la raíz, como en objetos-gs), el DP **solo instala lo que él nombra**. Un fichero que cambia pero no aparece en el descriptor sale marcado **no se instala** y no cuenta: ni como componente, ni en el pase, ni en `pases-datos`.

### El package descriptor
La app busca en la raíz del commit del DP un `.xml` con «descriptor» en el nombre (o que empiece por «package»), como `PackageDescriptor.xml`. Si tiene una sección de tareas (`<Tasks>`, con un `<deployGSP name=… src=…/>` por componente), solo cuenta lo de dentro: el nombre y el fichero de cada tarea. Lo demás (`<Locations>`, destinos, versiones) no nombra componentes. Un fichero del DP está en el descriptor si alguno lo nombra: por su ruta, por el final de su ruta, por su nombre (con o sin extensión) o por una carpeta suya.

- En la lista de DPs, **N fuera del descriptor** dice cuántos ficheros cambian sin instalarse.
- Si el descriptor no nombra **ninguno** de los ficheros del DP, la app no lo entiende y no aparta nada (la comprobación lo avisa).
- **Ver el diagnóstico del descriptor** enseña su forma: los nombres de las etiquetas y atributos, cuántas entradas tiene cada uno y cuántos ficheros casan. **Ningún valor, ruta ni nombre de componente.** Con *Enviar a NFQ* se manda tal cual para ajustar cómo se lee.
- En **Ajustes → Package descriptor y .gsp** se puede cambiar el nombre del fichero, limitarlo a algunos repositorios o quedarse solo con algunas etiquetas.

### Comparar .gsp sin ruido
La herramienta que guarda los `.gsp` los reescribe al guardar: cambia el **orden** de los elementos, los **espacios y saltos de línea** y pone **ids, fechas y versiones** nuevos. GitHub enseña todo eso como cambios. En cada `.gsp`, **Cambios reales** (al lado de *Diff de GitHub*) compara las dos versiones sin ese ruido:

- Una barra reparte las líneas que enseña GitHub entre **cambio real**, **orden**, **ids, fechas y versiones** y **espacios y saltos de línea**.
- Debajo, solo las líneas que cambian de verdad, con su número en la versión de antes (−) o en la de después (+).
- En los componentes del DP y en su comprobación, cada `.gsp` dice **N cambios reales** o **solo ruido**.

Funciona en los DPs, en los commits y en las ramas. Si la herramienta mete otro ruido (por ejemplo, un id de sesión), añádelo en **Ajustes → Package descriptor y .gsp** como expresión regular.

> **Importante:** si un DP sale con **pisaría cambios de producción**, hay ficheros que producción ha cambiado y que el DP también trae. Si se despliega tal cual, esos cambios de producción se perderían: hay que bajar producción a la release antes.

### La comprobación de cada DP
Arriba de los componentes, la caja **Comprobación** dice si todo **cuadra** o hay que **revisar**:
- Contra qué commit de producción se ha calculado, desde dónde se separó y cuándo. **Ver la misma comparación en GitHub** abre exactamente esa comparación en GitHub para contrastarla.
- Qué ficheros ya estaban iguales en producción.
- El **package descriptor**: cuántos ficheros del DP nombra y cuáles cambian sin instalarse.
- Los **.gsp**: cuántas líneas enseña GitHub y cuántas cambian de verdad.
- Qué tiene producción que el DP no lleva, y si toca ficheros del DP.
- **Jira:** las historias citadas en los commits del DP, las que no tienen esta release en *Fix Version/s*, y las que están en la release de Jira sin commits en este DP (pueden estar en otro repositorio).

Las **features** de un DP salen de **sus propios commits**, no de cómo esté la release hoy.

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
- **Copilot CLI**: la app lo encuentra esté instalado como esté: `gh copilot` (con GitHub CLI), `copilot.exe`, npm, winget… Antes de usarlo comprueba que responde de verdad (`--version`), así que no confunde con otros programas que se llaman parecido. Si no lo encuentra, escribe `gh copilot` o la ruta de `where copilot` en *Ajustes → Copilot → Ruta de Copilot CLI*. Si no lo tienes, *Instalar Copilot CLI (npm)*.
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

### Package descriptor y .gsp
- Usar o no el package descriptor, cómo se llama, en qué repositorios y qué etiquetas nombran componentes (vacío: todas).
- Qué extensiones se comparan sin ruido (por defecto `.gsp`) y qué más ruido apartar.

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

### Conectar (iniciar sesión)
1. En la entrada (o con **Conectar todo**), en Proyectos o en *Ajustes → Jira*, pulsa **Iniciar sesión en Jira**.
2. Se abre Jira en **Chrome** (en **Edge** si no tienes Chrome). Entra como siempre, con tu usuario de BBVA.
3. En cuanto estás dentro, la ventana **se cierra sola** y la app queda conectada.

Esa ventana usa un perfil de Chrome propio de la app: tu Chrome de siempre, con sus pestañas, no se toca (la app no puede leer la sesión de tu perfil normal, por eso es una ventana aparte). Ese perfil recuerda el inicio de sesión: al abrir la app no se comprueba nada (no se pierde tiempo) y, al pulsar *Iniciar sesión en Jira*, la ventana suele entrar sola y cerrarse en unos segundos. Si la sesión caduca mientras trabajas, la app te avisa y vuelves a pulsar el botón.

Hay tres botones:
- **Iniciar sesión en Jira**: abre Jira en el **último navegador con el que entraste** (la primera vez, Chrome; Edge si no hay Chrome).
- **Copiar enlace**: copia la dirección de entrada de Jira. La sesión solo se puede recoger de la ventana que abre la app, así que sirve para pegarla en esa ventana si se ha quedado en blanco o en otra página.
- **Abrir un navegador nuevo**: cierra la ventana de Jira de la app, si hay una, y abre otra. Úsalo si la ventana se ha quedado colgada o no aparece.

*Desconectar* (en *Ajustes → Jira*) borra la sesión guardada en ese perfil.

### Qué saca de Jira
- **Historias de los commits**: las claves de Jira de cada mensaje (`CIBRDR-1234 …`). Las de los DPs (`DP-KYTL-…`) no cuentan.
- **Proyectos**: las Features y Tasks de CIBRDR con su nombre, estado, SDATOOL y sus historias (campo *Feature Link*).
- **Releases** de CIBRDR (`tech-kytl-…`) y sus historias. En vuestro Jira la release de una historia está en **Fix Version/s**; la app lo encuentra sola por sus valores.

> **Consejo:** la app no escribe nada en Jira: solo lee.

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
- Los tokens y contraseñas los guarda Git (almacén de credenciales de Windows); la sesión de Jira vive en el perfil de Chrome (o Edge) de la app, cifrada por el propio navegador. La app no escribe secretos en disco.
- **Solo sale de la VDI** lo que se publica en `rdr-nfq/pases-datos`:
  - los DPs: release, features y nombres de componentes, nunca código;
  - los pases que subes tú;
  - los diagnósticos de Jira y del package descriptor, si los envías tú tras revisarlos (solo formas y cifras, sin contenido).
- El chat de ayuda usa Copilot, igual que la pestaña Copilot.
- Los datos locales viven en `%USERPROFILE%\.monitor-pases`.

## Problemas frecuentes {#problemas}

Pulsa cada problema para ver cómo se arregla.

### «Primera carga en pausa»
Es normal. GitHub limita las consultas por hora y la app sigue sola a la hora indicada.

### No me deja iniciar sesión en GitHub
Comprueba que Git tiene el gestor de credenciales (`git config --get credential.helper`). Si no, pon un token personal en *Ajustes*.

### No encuentra Copilot CLI
Si en una terminal te funciona `gh copilot`, escribe `gh copilot` en *Ajustes → Copilot → Ruta de Copilot CLI*; si te funciona `copilot`, pega ahí la ruta de `where copilot`. La pestaña Copilot dice qué ha encontrado y por qué lo ha descartado.

### Copilot o npm no conectan
Casi siempre es el proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `NODE_EXTRA_CA_CERTS`).

### No se abre la ventana de Jira o no conecta
Pulsa **Abrir un navegador nuevo**. Si la ventana se abre pero no carga Jira, pulsa **Copiar enlace** y pégalo en ella. Si aun así no conecta, puede que una política de la empresa no deje a la app leer la sesión del navegador: avísanos.

Si al pulsar otra vez ya hay una ventana de Jira de la app abierta, se usa esa: se trae al frente su pestaña, no se abren más. Si se te queda una ventana colgada, ciérrala y vuelve a pulsar *Iniciar sesión en Jira*.

### «La sesión de Jira ha caducado»
Pulsa otra vez *Iniciar sesión en Jira*.

### Un proyecto sale «sin SDATOOL»
La feature de Jira no lo tiene en enlaces, campos ni descripción. Añádelo en Jira.

### Una historia sale «sin release»
Está en la rama de release, pero en Jira no tiene esa release en *Fix Version/s*. Revísalo en Jira.

### Windows bloquea el .exe
Es un ejecutable sin firma digital. SmartScreen pide «Más información → Ejecutar de todas formas»; si lo frena el antivirus, hay que pedir a sistemas que lo permita.

### La app se ha cerrado sola
Se cierra al cerrar su última pestaña. Vuelve a abrir el .exe.

## Atajos de teclado {#atajos}

| Tecla | Qué hace |
|---|---|
| `Ctrl` + `K` | «Ir a…» cualquier repositorio, rama, proyecto, historia o DP |
| `/` | Ir al buscador de la vista |
| `F1` o `?` | Abrir este manual |
| `t` | Buscar un fichero (en el código de un repositorio) |
| `Esc` | Cerrar el panel o el diálogo abierto |
