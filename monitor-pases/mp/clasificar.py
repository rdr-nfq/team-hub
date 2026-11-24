"""Reglas: rama -> proyecto (feature), ficheros -> componentes, texto -> DPs."""

import re


def _re(patron, flags=re.I):
    try:
        return re.compile(patron or r"(?!x)x", flags)
    except re.error:
        return re.compile(r"(?!x)x")


def feature_de_rama(rama, patron):
    m = _re(patron).search(rama or "")
    return m.group(0).upper() if m else ""


def version_release(rama, patron):
    """«release/2.108.0» -> «2.108.0» ("" si la rama no es una release)."""
    m = _re(patron).search(rama or "")
    if not m:
        return ""
    return (m.groupdict().get("version") or m.group(0)).strip()


def clave_version(v):
    """Para ordenar versiones: «2.108.0» > «2.99.3»."""
    return tuple(int(x) if x.isdigit() else 0 for x in re.split(r"[.\-]", v or ""))


def features_en(textos, patron):
    vistos = []
    for t in textos:
        for m in _re(patron).finditer(t or ""):
            f = m.group(0).upper()
            if f not in vistos:
                vistos.append(f)
    return vistos


def buscar_dps(texto, patron):
    """Códigos DP en un texto, sin repetir y en orden de aparición."""
    vistos, out = set(), []
    for m in _re(patron).finditer(texto or ""):
        cod = m.group(0).strip().upper().rstrip("-_.")
        if cod and cod not in vistos:
            vistos.add(cod)
            out.append(cod)
    return out


def nombre_fichero(ruta):
    return (ruta or "").rstrip("/").split("/")[-1]


def clasificar(ruta, reglas, subida_repo=""):
    """-> None si la regla dice ignorar; si no {nombre, tipo, subida, regla}."""
    for i, r in enumerate(reglas or []):
        m = _re(r.get("patron")).search(ruta or "")
        if not m:
            continue
        if r.get("ignorar"):
            return None
        nombre = m.groupdict().get("nombre") or nombre_fichero(ruta)
        return {"nombre": nombre, "tipo": r.get("tipo") or "", "subida": r.get("subida") or subida_repo or "", "regla": i}
    return {"nombre": nombre_fichero(ruta), "tipo": "", "subida": subida_repo or "", "regla": None}


def componentes(ficheros, reglas, subida_repo=""):
    """Agrupa los ficheros cambiados de una rama en componentes.
    ficheros: [{ruta, estado, mas, menos}] -> [{clave, nombre, tipo, subida, regla, ficheros, borrado}]"""
    grupos, orden, ignorados = {}, [], 0
    for f in ficheros or []:
        c = clasificar(f.get("ruta"), reglas, subida_repo)
        if c is None:
            ignorados += 1
            continue
        clave = "%s|%s|%s" % (c["tipo"], c["subida"], c["nombre"])
        g = grupos.get(clave)
        if not g:
            g = grupos[clave] = dict(c, clave=clave, ficheros=[], borrado=True)
            orden.append(clave)
        g["ficheros"].append(f.get("ruta"))
        if f.get("estado") != "removed":
            g["borrado"] = False
    return [grupos[k] for k in orden], ignorados
