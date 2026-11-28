# Monitor de pases (VS Code)

GitHub BBVA, Jira, los DPs y el `.json` del pase, dentro de VS Code.

## Empezar
1. Pulsa **Monitor de pases** en la barra de estado (abajo a la izquierda) o el icono de la barra lateral.
2. La primera vez, **Conectar todo**: GitHub BBVA, Jira y GitHub NFQ, una ventana tras otra.
3. **Jira** se abre en **Chrome** (o Edge si no hay Chrome): entras con tu usuario de BBVA y la ventana se cierra sola.

Todo lo de la app está en su manual: botón **?** o `F1` dentro del panel.

## Comandos (`Ctrl+Shift+P` → «Monitor de pases»)
- **Abrir el monitor** · **Iniciar sesión en Jira (abre Chrome)** · **Actualizar ahora**
- **Abrir en el navegador** · **Probar la demo** · **Reiniciar / Detener el motor**
- **Ver el registro** · **Abrir la carpeta de datos** · **Elegir Python…**

## Requisitos
- **Python 3.8 o superior** (el de la VDI). Si no lo encuentra solo, **Elegir Python…** o el ajuste `monitorPases.python`.
- Git con Git Credential Manager (como para `git pull`).

Los datos y las sesiones están en `%USERPROFILE%\.monitor-pases`, los mismos que usaba el `.exe`.
