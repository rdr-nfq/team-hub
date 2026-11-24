"""Configuración y datos locales.

Todo vive FUERA del repositorio, en la carpeta del usuario de la VDI
(%USERPROFILE%\\.monitor-pases, o MONITOR_PASES_DIR): config.json (con los
tokens), estado.json (lo último sincronizado) y pases\\ (los .json generados).
"""

import copy
import json
import os
import threading
from pathlib import Path

# Reglas para convertir ficheros cambiados en componentes del pase. Se prueban
# en orden; la primera que encaja decide. (?P<nombre>…) marca el nombre del
# componente; si no lo hay, el nombre es el del fichero.
REGLAS_POR_DEFECTO = [
    {"patron": r"^\.github/", "ignorar": True},
    {"patron": r"(^|/)(README|CHANGELOG|LICENSE)[^/]*$", "ignorar": True},
    {"patron": r"(^|/)\.(gitignore|gitattributes|editorconfig)$", "ignorar": True},
    {"patron": r"(?P<nombre>[^/]+)\.java$", "tipo": "Java", "subida": "Java"},
]

POR_DEFECTO = {
    "bbva": {
        "host": "bbva.ghe.com",
        "api": "",
        "token": "",
        "organizaciones": [],
        "repos": [],
        "excluirRepos": [],
        "patronRama": r"CIBRDR-\d+",
        "soloRamasDeProyecto": True,
        "baseProduccion": "master",
        "basesRepo": {},
        "patronDP": r"DP-KYTL-[A-Z0-9_-]+",
        "workflowsDP": [],
        "leerLogs": True,
        "refrescoMin": 10,
        "diasActividad": 45,
        "proxy": "",
        "ca": "",
        "transporte": "python",
    },
    "nfq": {"host": "github.com", "api": "", "repo": "", "rama": "main", "carpeta": "pases", "token": "", "proxy": "", "ca": "",
            "transporte": "python"},
    "proyectos": {},
    "reglas": REGLAS_POR_DEFECTO,
    "reposSubida": {},
    "puerto": 8765,
}

SECRETOS = (("bbva", "token"), ("nfq", "token"))


def carpeta_datos():
    d = os.environ.get("MONITOR_PASES_DIR") or str(Path.home() / ".monitor-pases")
    p = Path(d)
    (p / "pases").mkdir(parents=True, exist_ok=True)
    return p


def _mezclar(base, nuevo):
    out = copy.deepcopy(base)
    for k, v in (nuevo or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k not in ("proyectos", "reposSubida", "basesRepo"):
            out[k] = _mezclar(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def escribir_json(ruta, datos):
    """Escritura atómica (fichero temporal + rename)."""
    ruta = Path(ruta)
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


class Config:
    def __init__(self):
        self.dir = carpeta_datos()
        self.ruta = self.dir / "config.json"
        self._cerrojo = threading.Lock()
        self.datos = _mezclar(POR_DEFECTO, leer_json(self.ruta, {}))

    def get(self):
        with self._cerrojo:
            return copy.deepcopy(self.datos)

    def publica(self):
        """La config sin tokens: lo que ve la página."""
        d = self.get()
        for seccion, clave in SECRETOS:
            t = d[seccion].get(clave) or ""
            d[seccion][clave] = ""
            d[seccion][clave + "Configurado"] = bool(t)
            d[seccion][clave + "Final"] = t[-4:] if t else ""
        return d

    def actualizar(self, cambios):
        """Mezcla `cambios` (de la página). Un token vacío NO borra el guardado;
        para borrarlo se manda {"borrarToken": true} en su sección."""
        cambios = copy.deepcopy(cambios or {})
        with self._cerrojo:
            for seccion, clave in SECRETOS:
                c = cambios.get(seccion)
                if not isinstance(c, dict):
                    continue
                for k in list(c):
                    if k.endswith("Configurado") or k.endswith("Final"):
                        del c[k]
                if c.pop("borrarToken", False):
                    c[clave] = ""
                elif not str(c.get(clave) or "").strip():
                    c.pop(clave, None)
                else:
                    c[clave] = str(c[clave]).strip()
            self.datos = _mezclar(self.datos, cambios)
            escribir_json(self.ruta, self.datos)
            try:
                os.chmod(self.ruta, 0o600)
            except OSError:
                pass
        return self.publica()

    def configurado(self):
        b = self.get()["bbva"]
        return bool(b.get("token") and (b.get("organizaciones") or b.get("repos")))
