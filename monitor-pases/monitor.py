#!/usr/bin/env python3
"""Monitor de pases · arranca la app local y abre el navegador.

    MonitorPases.exe                  (o: python monitor.py)
    MonitorPases.exe --demo           datos inventados, sin red ni token
    MonitorPases.exe --puerto 8800 --sin-navegador

El .exe no abre ninguna ventana: vive mientras haya una pestaña de la app
abierta y se cierra solo al cerrar la última. Lo que antes salía en la
consola va a monitor.log, en la carpeta de datos.
"""

import argparse
import json
import os
import sys
import tempfile
import time
import urllib.request
import webbrowser

if sys.version_info < (3, 8):
    sys.exit("El monitor necesita Python 3.8 o superior (tienes %s)." % sys.version.split()[0])

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mp import VERSION  # noqa: E402

CONGELADO = getattr(sys, "frozen", False)  # dentro del .exe
SIN_CONSOLA = sys.stdout is None  # .exe sin ventana: no hay dónde escribir


def _log_a_fichero():
    """Sin consola, lo que se escribiría en ella va a monitor.log (en la carpeta de datos)."""
    try:
        from mp.config import carpeta_datos
        ruta = carpeta_datos() / "monitor.log"
        if ruta.exists() and ruta.stat().st_size > 1_000_000:
            ruta.replace(ruta.with_name("monitor.log.1"))
        f = open(ruta, "a", encoding="utf-8", buffering=1)
        f.write("\n--- %s · Monitor de pases %s ---\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), VERSION))
        sys.stdout = sys.stderr = f
    except OSError:
        sys.stdout = sys.stderr = open(os.devnull, "w")


def _avisar(texto):
    """Un aviso que se ve aunque no haya consola (un cuadro de Windows)."""
    print(texto)
    if SIN_CONSOLA and os.name == "nt":
        try:
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, str(texto), "Monitor de pases", 0x40)
        except Exception:
            pass


def _titulo(texto):
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleTitleW(texto)
        except Exception:
            pass


def _ya_abierta(puerto):
    """¿Hay ya un monitor escuchando en ese puerto?"""
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/ping" % puerto, timeout=1.5) as r:
            return json.loads(r.read().decode()).get("app") == "monitor-pases"
    except Exception:
        return False


def _listo(url, puerto, propio):
    """Línea que espera el plugin de VS Code para mostrar la app."""
    print("MONITOR_LISTO " + json.dumps({"url": url, "puerto": puerto, "version": VERSION, "propio": propio}), flush=True)


def _vivo(pid):
    if os.name == "nt":
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x00100000, False, pid)  # SYNCHRONIZE
        if not h:
            return False
        try:
            return k.WaitForSingleObject(h, 0) == 0x102  # WAIT_TIMEOUT: sigue vivo
        finally:
            k.CloseHandle(h)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _vigilar_padre(pid, mon):
    """Si VS Code se cierra (o se cae) sin parar el motor, el motor guarda y se cierra solo."""
    import threading

    def bucle():
        while _vivo(pid):
            time.sleep(5)
        h = threading.Thread(target=mon.guardar, daemon=True)
        h.start()
        h.join(10)
        os._exit(0)

    threading.Thread(target=bucle, name="padre", daemon=True).start()


def main():
    ap = argparse.ArgumentParser(description="Monitor de pases (GitHub BBVA → .json del pase)")
    ap.add_argument("--puerto", type=int, default=None, help="puerto local (por defecto 8765)")
    ap.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    ap.add_argument("--demo", action="store_true", help="datos inventados con un GitHub simulado")
    ap.add_argument("--vscode", action="store_true", help="lo arranca el plugin de VS Code (sin navegador; avisa al estar listo)")
    ap.add_argument("--padre", type=int, default=0, help="se cierra solo si termina este proceso (el de VS Code)")
    ap.add_argument("--version", action="version", version="Monitor de pases " + VERSION)
    a = ap.parse_args()
    if a.vscode:
        a.sin_navegador = True
    _titulo("Monitor de pases" + (" (demo)" if a.demo else ""))

    from mp.config import Config
    if a.demo:
        from mp import demo
        os.environ["MONITOR_PASES_DIR"] = os.path.join(tempfile.gettempdir(), "monitor-pases-demo")
        _, puerto_ghe, datos_gh = demo.arrancar()
        from mp import demo_jira
        _, url_jira, _ = demo_jira.arrancar(datos_gh)
        cfg = Config()
        cfg.actualizar(demo.config_demo(puerto_ghe, url_jira))
    else:
        cfg = Config()

    from mp.servidor import App
    from mp.sincro import Monitor

    puerto = a.puerto or (8775 if a.demo else int(cfg.get().get("puerto") or 8765))
    if _ya_abierta(puerto):
        url = "http://127.0.0.1:%d/" % puerto
        if a.vscode:  # otra ventana de VS Code ya lo tiene abierto: se usa ese
            _listo(url, puerto, propio=False)
            return
        print("El monitor ya está abierto en %s: lo abro en el navegador." % url)
        if not a.sin_navegador:
            webbrowser.open(url)
        return

    from mp.sesion import Sesiones
    ses = Sesiones(cfg, demo=a.demo)
    cfg.sesiones = ses
    mon = Monitor(cfg)
    srv = None
    for p in range(puerto, puerto + 15):
        try:
            app = App(cfg, mon, p, demo=a.demo, sesiones=ses)
            srv = app.servir()
            break
        except OSError:
            continue
    if not srv:
        raise SystemExit("No hay ningún puerto libre entre %d y %d." % (puerto, puerto + 14))
    # Sesión guardada en Git (si la hay): sin abrir ventanas. Si no, la página pide iniciarla.
    for quien in ("bbva", "nfq"):
        ses.iniciar_en_segundo_plano(quien, interactiva=False, despues=app.tras_iniciar)
    import threading
    threading.Thread(target=lambda: app.jira.iniciar_guardada() and app.jira.sincronizar(), name="jira", daemon=True).start()
    mon.arrancar()
    url = "http://127.0.0.1:%d/" % app.puerto
    print("Monitor de pases %s%s" % (VERSION, " · DEMO con datos inventados" if a.demo else ""))
    print()
    print("  Abierto en  %s" % url)
    print("  Datos en    %s" % cfg.dir)
    print()
    if a.vscode:
        if a.padre:
            _vigilar_padre(a.padre, mon)
        _listo(url, app.puerto, propio=True)
    elif a.sin_navegador:
        print("  Para salir, cierra esta ventana o pulsa Ctrl+C.")
    else:
        print("  Se cierra solo al cerrar la última pestaña de la app.")

        def salir():
            print("Última pestaña cerrada: guardando y saliendo.")
            import threading
            h = threading.Thread(target=mon.guardar, daemon=True)
            h.start()
            h.join(10)  # guarda lo que haya; si una sincronización lo retrasa, sale igual
            os._exit(0)

        app.vigilar(salir)
        webbrowser.open(url)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nHasta luego.")
        srv.shutdown()


if __name__ == "__main__":
    if SIN_CONSOLA:
        _log_a_fichero()
    try:
        main()
    except SystemExit as e:
        if CONGELADO and e.code not in (0, None) and isinstance(e.code, str):
            _avisar(e.code)
        raise
    except Exception as e:  # en el .exe, que el error se vea (no hay consola)
        if not CONGELADO:
            raise
        import traceback
        traceback.print_exc()
        _avisar("El monitor no ha podido arrancar: %s\n\nEl detalle está en monitor.log, en la carpeta .monitor-pases de tu usuario." % e)
        sys.exit(1)
