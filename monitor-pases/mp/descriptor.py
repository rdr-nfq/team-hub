"""Package descriptor: el XML de la raíz del repositorio que dice qué se instala
en un DP. Un fichero que cambia en el DP pero no aparece en el descriptor no se
instala, así que no es un componente del DP (ni del pase, ni de pases-datos).

No sabemos de antemano cómo es el XML de cada repositorio, así que se lee
entero: cada texto y cada atributo es una «entrada» (con dónde está: la ruta de
etiquetas, p. ej. «package/components/component@name»). Un fichero del DP está
en el descriptor si alguna entrada lo nombra: su ruta, el final de su ruta, su
nombre (con o sin extensión) o una carpeta suya. Ajustes > «descriptor» permite
quedarse solo con algunas etiquetas si hiciera falta afinar.

El diagnóstico (forma) solo cuenta etiquetas, atributos y cuántas entradas
coinciden: nunca valores, para que pueda salir de la VDI.
"""

import re
import xml.etree.ElementTree as ET

ALGORITMO = 2  # sube si cambia cómo se cruzan entradas y ficheros (se recalcula todo)
LECTOR = 2  # sube si cambia cómo se lee el XML (se vuelve a pedir el descriptor de cada DP)
PATRON_DEFECTO = r"(?i)(descriptor[^/]*|^package[^/]*)\.xml$"
MAX_ENTRADAS = 20000
MAX_BYTES = 4 * 1024 * 1024
_TROCEAR = re.compile(r"[\r\n,;|]+")


def _re(patron):
    try:
        return re.compile(patron or PATRON_DEFECTO)
    except re.error:
        return re.compile(PATRON_DEFECTO)


def elegir(rutas, patron="", en_raiz=True):
    """El descriptor entre los ficheros ("" si no hay): en la raíz (o, si no, el menos profundo),
    mejor si dice «descriptor»."""
    p = _re(patron)
    cands = [r for r in rutas or [] if r and (not en_raiz or "/" not in r) and p.search(r.rsplit("/", 1)[-1])]
    cands.sort(key=lambda r: (r.count("/"), "descriptor" not in r.lower(), "package" not in r.lower(), len(r), r))
    return cands[0] if cands else ""


def _sin_ns(nombre):
    return nombre.rsplit("}", 1)[-1] if "}" in nombre else nombre


_DTD = re.compile(r"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", re.S | re.I)
_DTD_B = re.compile(rb"<!DOCTYPE[^\[>]*(\[.*?\])?\s*>", re.S | re.I)
_DECL = re.compile(r"^\s*<\?xml[^>]*\?>")
_ENTIDAD = re.compile(r"&(?!(?:amp|lt|gt|quot|apos);|#)[A-Za-z_][\w.-]*;")


def _analizar(datos):
    """El XML tal como venga: UTF-8, UTF-16 (habitual en herramientas de Windows), Latin-1/cp1252,
    con DTD o con entidades que no están definidas. -> (raíz, "") o (None, error)."""
    if isinstance(datos, str):
        datos = datos.encode("utf-8")
    datos = (datos or b"")[:MAX_BYTES]
    error = "vacío"
    # 1. Los bytes tal cual (sin DTD): el analizador respeta el BOM y la codificación que declare el XML.
    try:
        return ET.fromstring(_DTD_B.sub(b"", datos)), ""
    except ET.ParseError as e:
        error = str(e).split(":")[0]
    # 2. Como texto, probando codificaciones, sin la declaración, sin DTD y sin entidades desconocidas.
    utf16 = datos[:2] in (b"\xff\xfe", b"\xfe\xff") or b"\x00" in datos[:200]
    for cod in (["utf-16"] if utf16 else []) + ["utf-8-sig", "cp1252"]:
        try:
            t = datos.decode(cod)
        except UnicodeDecodeError:
            continue
        t = _ENTIDAD.sub(" ", _DTD.sub("", _DECL.sub("", t.lstrip("﻿"))))
        try:
            return ET.fromstring(t), ""
        except ET.ParseError as e:
            error = str(e).split(":")[0]
    return None, error


def leer(datos):
    """Bytes del XML -> {"entradas": [[donde, valor], ...], "error": ""}."""
    raiz, error = _analizar(datos)
    if raiz is None:
        return {"entradas": [], "error": "El descriptor no es un XML válido (%s)." % error}
    out = []

    def poner(donde, valor):
        for v in _TROCEAR.split(valor or ""):
            v = v.strip()
            if v and len(out) < MAX_ENTRADAS:
                out.append([donde, v[:400]])

    def visitar(el, camino):
        donde = (camino + "/" if camino else "") + _sin_ns(el.tag if isinstance(el.tag, str) else "#")
        for k, v in el.attrib.items():
            poner(donde + "@" + _sin_ns(k), v)
        poner(donde, el.text)
        for h in el:
            if isinstance(h.tag, str):
                visitar(h, donde)
            poner(donde, h.tail)  # texto suelto entre etiquetas

    visitar(raiz, "")
    return {"entradas": out, "error": ""}


def _norm(v):
    v = str(v or "").strip().strip("\"'").replace("\\", "/")
    v = re.sub(r"/{2,}", "/", v)
    while v.startswith("./"):
        v = v[2:]
    return v.strip("/").lower()


def _sin_ext(nombre):
    return nombre.rsplit(".", 1)[0] if "." in nombre.lstrip(".") else nombre


def _vale(donde, etiquetas):
    if not etiquetas:
        return True
    """¿La entrada de `donde` cuenta según Ajustes? «component» vale su texto y sus atributos;
    «component@name», solo ese atributo; «@name», ese atributo en cualquier etiqueta."""
    d = "/" + donde
    for e in etiquetas:
        e = e.strip().strip("/")
        if not e:
            continue
        if e.startswith("@"):
            if d.endswith(e):
                return True
        elif "@" in e:
            if d.endswith("/" + e):
                return True
        elif d.split("@")[0].endswith("/" + e):
            return True
    return False


# Secciones que listan lo que se instala (p. ej. <Tasks> con un <deployGSP name=… src=…/> por componente).
# Si el descriptor tiene una, solo cuenta lo de dentro: el resto (<Locations>, rutas de destino, versiones…)
# nombra carpetas y datos del paquete, no componentes, y hacía casar casi todos los ficheros.
SECCIONES = ("tasks", "components", "componentes", "items", "deploy", "deployments", "artifacts")
ATRIBUTOS = {"name", "nombre", "src", "source", "file", "filename", "fichero", "path", "ruta", "component", "componente"}


def seccion(entradas):
    """-> (nombre de la sección, ruta de etiquetas hasta ella) si el descriptor tiene una; si no, ("", "")."""
    for sec in SECCIONES:
        for donde, _ in entradas or []:
            partes = donde.split("@")[0].split("/")
            for i, p in enumerate(partes[:-1]):  # con algo dentro: la sección no es la última etiqueta
                if p.lower() == sec:
                    return sec, "/".join(partes[:i + 1])
    return "", ""


def _en_seccion(donde, raiz):
    """¿La entrada es de un elemento dentro de la sección, y es su nombre, su fichero o su texto?"""
    elem, _, attr = donde.partition("@")
    if not elem.startswith(raiz + "/"):
        return False
    return (attr.lower() in ATRIBUTOS) if attr else True


class Indice:
    """Las entradas de un descriptor, listas para preguntar si un fichero está."""

    def __init__(self, entradas, etiquetas=None):
        self.rutas, self.nombres, self.raices = {}, {}, {}
        etiquetas = [e for e in (etiquetas or []) if e and e.strip()]
        self.n = 0
        # Sin etiquetas en Ajustes: si hay una sección de tareas o componentes, solo cuenta lo de dentro.
        self.seccion, raiz = ("", "") if etiquetas else seccion(entradas)
        for donde, valor in entradas or []:
            if not _vale(donde, etiquetas):
                continue
            if raiz and not _en_seccion(donde, raiz):
                continue
            v = _norm(valor)
            if not v or len(v) < 2:
                continue
            self.n += 1
            # El valor entero (hay nombres con espacios) y, si es una frase, cada trozo que parezca un fichero o una ruta.
            for x in [v] + ([t.strip("\"'()[]") for t in v.split() if "/" in t or re.search(r"\.\w{1,6}$", t)] if " " in v else []):
                self._poner(x, donde)

    def _poner(self, v, donde):
        if len(v) < 2:
            return
        partes = v.split("/")
        # Cada final de la ruta de la entrada (una ruta de instalación acaba en la del repositorio).
        for i in range(len(partes)):
            self.rutas.setdefault("/".join(partes[i:]), donde)
        base = partes[-1]
        if len(_sin_ext(base)) >= 3:
            self.raices.setdefault(_sin_ext(base), donde)
        self.nombres.setdefault(base, donde)

    def buscar(self, ruta):
        """-> (cómo, dónde) si el fichero está en el descriptor; None si no."""
        p = _norm(ruta)
        if not p:
            return None
        partes = p.split("/")
        if p in self.rutas:
            return ("ruta", self.rutas[p])
        for i in range(1, len(partes)):
            s = "/".join(partes[i:])
            if s in self.rutas and "/" in s:
                return ("final de la ruta", self.rutas[s])
        base = partes[-1]
        if base in self.rutas:
            return ("nombre", self.rutas[base])
        if len(_sin_ext(base)) >= 3 and _sin_ext(base) in self.raices:
            return ("nombre sin extensión", self.raices[_sin_ext(base)])
        # Una carpeta suya (no la primera de todas a solas: «objetos» no nombra a todos sus ficheros).
        dirs = partes[:-1]
        for j in range(len(dirs), 0, -1):
            for i in range(0, j):
                if i == 0 and j == 1:
                    continue
                s = "/".join(dirs[i:j])
                if s in self.rutas:
                    return ("carpeta", self.rutas[s])
        return None


def forma(entradas, ficheros=None, etiquetas=None):
    """Forma del descriptor SIN valores: etiquetas y atributos, cuántas entradas tiene cada uno, cómo son
    (con «/», con extensión, numéricas) y cuántos ficheros del DP casan con cada uno."""
    por = {}
    for donde, valor in entradas or []:
        x = por.setdefault(donde, {"donde": donde, "n": 0, "conBarra": 0, "conExtension": 0, "numericas": 0, "largoMedio": 0, "casan": 0})
        x["n"] += 1
        v = str(valor)
        x["conBarra"] += "/" in v or "\\" in v
        x["conExtension"] += bool(re.search(r"\.[A-Za-z0-9]{1,6}$", v))
        x["numericas"] += bool(re.fullmatch(r"[\d.\-:T Z]+", v))
        x["largoMedio"] += len(v)
    for x in por.values():
        x["largoMedio"] = round(x["largoMedio"] / max(1, x["n"]))
    como = {}
    if ficheros is not None:
        ind = Indice(entradas, etiquetas)
        for f in ficheros:
            r = ind.buscar(f)
            if r:
                como[r[0]] = como.get(r[0], 0) + 1
                if r[1] in por:
                    por[r[1]]["casan"] += 1
    return {"etiquetas": sorted(por.values(), key=lambda x: -x["n"])[:200], "nEntradas": len(entradas or []),
            "seccion": seccion(entradas)[0] if not etiquetas else "",
            "casanPor": como, "nFicheros": len(ficheros or []), "nCasan": sum(como.values())}
