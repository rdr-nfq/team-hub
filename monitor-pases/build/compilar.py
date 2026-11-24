"""Compila MonitorPases.exe: un único ejecutable con Python, la app y la
interfaz dentro (no hay que instalar nada para usarlo).

Lo usa el workflow .github/workflows/monitor-pases.yml (en Windows). A mano,
en un Windows con Python:  pip install pyinstaller  y  python build/compilar.py
El resultado queda en monitor-pases/dist/MonitorPases.exe.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TMP = RAIZ / "build" / "tmp"


def version():
    return re.search(r'VERSION = "([^"]+)"', (RAIZ / "mp" / "__init__.py").read_text(encoding="utf-8")).group(1)


def fichero_version(v):
    """Datos que Windows enseña en Propiedades → Detalles del .exe."""
    n = tuple((list(map(int, v.split("."))) + [0, 0, 0, 0])[:4])
    texto = """VSVersionInfo(
  ffi=FixedFileInfo(filevers=%(n)s, prodvers=%(n)s, mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),
  kids=[
    StringFileInfo([StringTable('0C0A04B0', [
      StringStruct('CompanyName', 'NFQ Advisory Services'),
      StringStruct('FileDescription', 'Monitor de pases'),
      StringStruct('FileVersion', '%(v)s'),
      StringStruct('InternalName', 'MonitorPases'),
      StringStruct('LegalCopyright', 'NFQ Advisory Services'),
      StringStruct('OriginalFilename', 'MonitorPases.exe'),
      StringStruct('ProductName', 'Monitor de pases'),
      StringStruct('ProductVersion', '%(v)s')])]),
    VarFileInfo([VarStruct('Translation', [3082, 1200])])
  ]
)
""" % {"n": n, "v": v}
    TMP.mkdir(parents=True, exist_ok=True)
    ruta = TMP / "version.txt"
    ruta.write_text(texto, encoding="utf-8")
    return ruta


def main():
    v = version()
    sep = ";" if os.name == "nt" else ":"
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--console",
           "--name", "MonitorPases",
           "--icon", str(RAIZ / "build" / "icono.ico"),
           "--version-file", str(fichero_version(v)),
           "--add-data", "%s%sweb" % (RAIZ / "web", sep),
           "--add-data", "%s%s." % (RAIZ / "config-equipo.json", sep),
           "--collect-submodules", "mp",
           "--paths", str(RAIZ),
           "--distpath", str(RAIZ / "dist"), "--workpath", str(TMP / "obra"), "--specpath", str(TMP),
           str(RAIZ / "monitor.py")]
    print("Compilando Monitor de pases", v)
    subprocess.run(cmd, check=True, cwd=RAIZ)
    if os.environ.get("GITHUB_ENV"):
        with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
            f.write("VERSION=%s\n" % v)
    print("Listo:", RAIZ / "dist" / ("MonitorPases.exe" if os.name == "nt" else "MonitorPases"))


if __name__ == "__main__":
    main()
