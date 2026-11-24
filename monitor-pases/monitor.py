#!/usr/bin/env python3
"""Monitor de pases · arranca la app local y abre el navegador.

    python monitor.py            # la app real (configúrala en Ajustes)
    python monitor.py --demo     # con un GitHub simulado, sin red ni token
    python monitor.py --puerto 8800 --sin-navegador
"""

import argparse
import os
import sys
import tempfile
import time
import webbrowser

if sys.version_info < (3, 8):
    sys.exit("El monitor necesita Python 3.8 o superior (tienes %s)." % sys.version.split()[0])

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mp import VERSION  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Monitor de pases (GitHub BBVA → .json del pase)")
    ap.add_argument("--puerto", type=int, default=None, help="puerto local (por defecto 8765)")
    ap.add_argument("--sin-navegador", action="store_true", help="no abrir el navegador")
    ap.add_argument("--demo", action="store_true", help="datos inventados con un GitHub simulado")
    a = ap.parse_args()

    if a.demo:
        from mp import demo
        os.environ["MONITOR_PASES_DIR"] = os.path.join(tempfile.gettempdir(), "monitor-pases-demo")
        _, puerto_ghe, _ = demo.arrancar()
        from mp.config import Config
        cfg = Config()
        cfg.actualizar(demo.config_demo(puerto_ghe))
    else:
        from mp.config import Config
        cfg = Config()

    from mp.servidor import App
    from mp.sincro import Monitor

    mon = Monitor(cfg)
    puerto = a.puerto or int(cfg.get().get("puerto") or 8765)
    srv = None
    for p in range(puerto, puerto + 15):
        try:
            app = App(cfg, mon, p, demo=a.demo)
            srv = app.servir()
            break
        except OSError:
            continue
    if not srv:
        sys.exit("No hay ningún puerto libre entre %d y %d." % (puerto, puerto + 14))
    mon.arrancar()
    url = "http://127.0.0.1:%d/" % app.puerto
    print("Monitor de pases %s%s" % (VERSION, " · DEMO" if a.demo else ""))
    print("  Abierto en  %s" % url)
    print("  Datos en    %s" % cfg.dir)
    print("  Para salir: cierra esta ventana o pulsa Ctrl+C")
    if not a.sin_navegador:
        webbrowser.open(url)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nHasta luego.")
        srv.shutdown()


if __name__ == "__main__":
    main()
