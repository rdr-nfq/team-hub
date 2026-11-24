"""Configuración y datos locales.

Todo vive FUERA del repositorio, en la carpeta del usuario de la VDI
(%USERPROFILE%\\.monitor-pases, o MONITOR_PASES_DIR): config.json (con los
tokens), estado.json (lo último sincronizado) y pases\\ (los .json generados).
"""

import copy
import json
import os
import sys
import threading
import time
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
        "filtroRepos": "",
        "repos": [],
        "excluirRepos": [],
        "patronRama": r"CIBRDR-\d+",
        "soloRamasDeProyecto": True,
        "baseProduccion": "master",
        "basesRepo": {},
        "patronRelease": r"^release/v?(?P<version>\d+(?:\.\d+)+)",
        "patronDP": r"DP-KYTL-[A-Z0-9_-]+",
        "usuario": "",
        "workflowsDP": [],
        "leerLogs": True,
        "refrescoMin": 10,
        "diasActividad": 45,
        "proxy": "",
        "ca": "",
        "transporte": "python",
    },
    "nfq": {"host": "github.com", "api": "", "repo": "rdr-nfq/pases-datos", "rama": "main", "carpeta": "pases", "token": "",
            "proxy": "", "ca": "", "transporte": "python", "usuario": "", "publicarDPs": True},
    "copilot": {"entrada": "", "modelo": "", "opciones": "", "permitirComandos": False, "urlRepo": "https://{host}/{repo}.git"},
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
    """Escritura atómica (fichero temporal + rename). En Windows el rename
    falla si otro hilo tiene el fichero abierto en ese momento: se reintenta."""
    ruta = Path(ruta)
    tmp = ruta.with_suffix(ruta.suffix + ".%d.tmp" % threading.get_ident())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    for intento in range(20):
        try:
            os.replace(tmp, ruta)
            return
        except PermissionError:
            if intento == 19:
                raise
            time.sleep(0.05)


def leer_json(ruta, defecto=None):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def recurso(nombre):
    """Fichero que va dentro de la app (en el .exe, en la carpeta temporal de PyInstaller)."""
    base = getattr(sys, "_MEIPASS", None) or Path(__file__).resolve().parent.parent
    return Path(base) / nombre


# Lo que se comparte con el equipo (config-equipo.json): todo menos tokens,
# proxy, certificados y transporte, que son de cada equipo.
CAMPOS_EQUIPO = {
    "bbva": ("host", "organizaciones", "filtroRepos", "repos", "excluirRepos", "patronRama", "patronRelease", "soloRamasDeProyecto",
             "baseProduccion", "basesRepo", "patronDP", "workflowsDP", "leerLogs", "refrescoMin", "diasActividad"),
    "nfq": ("host", "repo", "rama", "carpeta", "publicarDPs"),
}


def _diferencia(datos, base):
    """Solo lo que cambia respecto a `base` (así lo que mejore el equipo en
    config-equipo.json llega a todos los que no lo han tocado)."""
    out = {}
    for k, v in datos.items():
        b = base.get(k) if isinstance(base, dict) else None
        if isinstance(v, dict) and isinstance(b, dict) and k not in ("proyectos", "reposSubida", "basesRepo"):
            d = _diferencia(v, b)
            if d:
                out[k] = d
        elif v != b:
            out[k] = copy.deepcopy(v)
    return out


class Config:
    def __init__(self):
        self.dir = carpeta_datos()
        self.ruta = self.dir / "config.json"
        self._cerrojo = threading.Lock()
        self.equipo = leer_json(recurso("config-equipo.json"), {}) or {}
        self.base = _mezclar(POR_DEFECTO, self.equipo)
        self.propia = leer_json(self.ruta, {}) or {}
        self.datos = _mezclar(self.base, self.propia)
        self.sesiones = None  # lo pone la app (mp.sesion.Sesiones)

    def get(self):
        """La config para trabajar: con el token de la sesión iniciada, si la hay."""
        with self._cerrojo:
            d = copy.deepcopy(self.datos)
        if self.sesiones:
            for q in ("bbva", "nfq"):
                t = self.sesiones.token(q)
                if t:
                    d[q]["token"] = t
        return d

    def publica(self):
        """La config sin tokens: lo que ve la página."""
        with self._cerrojo:
            d = copy.deepcopy(self.datos)
        for seccion, clave in SECRETOS:
            t = d[seccion].get(clave) or ""
            d[seccion][clave] = ""
            d[seccion][clave + "Configurado"] = bool(t)
            d[seccion][clave + "Final"] = t[-4:] if t else ""
        with self._cerrojo:
            d["reglasPropias"] = "reglas" in self.propia and bool(self.equipo.get("reglas"))
            d["hayEquipo"] = bool(self.equipo)
        return d

    def para_equipo(self):
        """Ajustes para config-equipo.json: sin tokens ni nada de este equipo."""
        d = self.get()
        out = {s: {k: d[s][k] for k in campos if k in d[s]} for s, campos in CAMPOS_EQUIPO.items()}
        out.update({k: d[k] for k in ("proyectos", "reglas", "reposSubida")})
        return out

    def _guardar(self):
        self.propia = _diferencia(self.datos, self.base)
        escribir_json(self.ruta, self.propia)
        try:
            os.chmod(self.ruta, 0o600)
        except OSError:
            pass

    def restablecer(self, clave):
        """Vuelve a lo que diga el equipo para una clave de primer nivel (p. ej. "reglas")."""
        with self._cerrojo:
            self.datos[clave] = copy.deepcopy(self.base.get(clave))
            self._guardar()
        return self.publica()

    def actualizar(self, cambios):
        """Mezcla `cambios` (de la página). Un token vacío NO borra el guardado;
        para borrarlo se manda {"borrarToken": true} en su sección."""
        cambios = copy.deepcopy(cambios or {})
        for k in ("reglasPropias", "hayEquipo"):
            cambios.pop(k, None)
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
            self._guardar()
        return self.publica()

    def configurado(self):
        b = self.get()["bbva"]
        return bool(b.get("token") and (b.get("organizaciones") or b.get("repos")))
