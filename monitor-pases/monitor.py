#!/usr/bin/env python3
"""Monitor de pases · arranca la app local y abre el navegador.

    MonitorPases.exe                  (o: python monitor.py)
    MonitorPases.exe --demo           datos inventados, sin red ni token
    MonitorPases.exe --puerto 8800 --sin-navegador
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


def main():
    ap = argparse.ArgumentParser(description="Monitor de pases (GitHub BBVA → .json del pase)")
    ap.add_argument("--puerto", type=int, default=None, help="puerto local (por defecto 8765)")
    ap.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    ap.add_argument("--demo", action="store_true", help="datos inventados con un GitHub simulado")
    ap.add_argument("--version", action="version", version="Monitor de pases " + VERSION)
    a = ap.parse_args()
    _titulo("Monitor de pases" + (" (demo)" if a.demo else ""))

    from mp.config import Config
    if a.demo:
        from mp import demo
        os.environ["MONITOR_PASES_DIR"] = os.path.join(tempfile.gettempdir(), "monitor-pases-demo")
        _, puerto_ghe, _ = demo.arrancar()
        cfg = Config()
        cfg.actualizar(demo.config_demo(puerto_ghe))
    else:
        cfg = Config()

    from mp.servidor import App
    from mp.sincro import Monitor

    puerto = a.puerto or (8775 if a.demo else int(cfg.get().get("puerto") or 8765))
    if _ya_abierta(puerto):
        url = "http://127.0.0.1:%d/" % puerto
        print("El monitor ya está abierto en %s: lo abro en el navegador." % url)
        if not a.sin_navegador:
            webbrowser.open(url)
        time.sleep(2)
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
    mon.arrancar()
    url = "http://127.0.0.1:%d/" % app.puerto
    print("Monitor de pases %s%s" % (VERSION, " · DEMO con datos inventados" if a.demo else ""))
    print()
    print("  Abierto en  %s" % url)
    print("  Datos en    %s" % cfg.dir)
    print()
    print("  Deja esta ventana abierta mientras lo uses. Para salir, ciérrala.")
    if not a.sin_navegador:
        webbrowser.open(url)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nHasta luego.")
        srv.shutdown()


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        if CONGELADO and e.code not in (0, None):
            print(e.code if isinstance(e.code, str) else "")
            input("\nPulsa Intro para cerrar.")
        raise
    except Exception as e:  # en el .exe, que no se cierre la ventana sin dejar leer el error
        if not CONGELADO:
            raise
        import traceback
        traceback.print_exc()
        print("\nEl monitor no ha podido arrancar: %s" % e)
        input("Pulsa Intro para cerrar.")
        sys.exit(1)
