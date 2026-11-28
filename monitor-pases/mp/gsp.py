"""Comparador de .gsp: cuántos de los cambios que enseña GitHub son de verdad.

La herramienta que guarda los .gsp los reescribe: cambia el orden de los
elementos, los espacios y los saltos de línea (CRLF/LF, indentación, partir o
juntar líneas) y pone ids, fechas, usuarios o versiones nuevos al guardar. El
diff de GitHub enseña todo eso como cambios. Aquí se comparan las dos versiones
normalizadas, por pasos, para separar:

  - espacios y saltos de línea,
  - ids, fechas y versiones (lo que la herramienta genera sola),
  - orden (las mismas líneas en otro sitio),
  - y los cambios reales (lo que queda).

Las extensiones y el ruido se ajustan en Ajustes («gsp»). Solo librería estándar.
"""

import difflib
import re
from collections import Counter

ALGORITMO = 1  # sube si cambia la comparación (se recalcula lo guardado)
EXTENSIONES_DEFECTO = ".gsp"
MAX_LINEAS = 60000

# (expresión, por qué se cambia). Se aplican en orden a cada línea ya sin espacios de más.
RUIDO_DEFECTO = [
    # Claves que la herramienta rellena sola: su valor no es un cambio.
    (r"(?i)\b(version|versi[oó]n|ver|timestamp|modified|modificado|created|creado|saved|guardado|updated|actualizado|"
     r"lastmodified|last_modified|savedby|saved_by|modifiedby|modified_by|createdby|created_by|author|autor|"
     r"revision|rev|build|hash|checksum|crc|md5|generated|generado)(\s*[:=]\s*)(\"[^\"]*\"|'[^']*'|[^\s,;)>]+)",
     r"\1=«valor»", "versiones"),
    # Ids generados: con clave de id y valor numérico o hexadecimal.
    (r"(?i)\b(id|uid|oid|guid|uuid|objectid|object_id|nodeid|node_id|key|ref|seq|secuencia)(\s*[:=]\s*)(\"?)[0-9a-f{}-]{3,}\3(?=[\s,;)>]|$)",
     r"\1=«id»", "ids"),
    (r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b", "«id»", "ids"),
    (r"\{?[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}?", "«id»", "ids"),
    (r"\b[0-9a-fA-F]{20,}\b", "«id»", "ids"),
    # Fechas y horas sueltas.
    (r"\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b", "«fecha»", "fechas"),
    (r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b", "«fecha»", "fechas"),
    (r"\b\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?\b", "«hora»", "fechas"),
    (r"\b1[5-9]\d{8}(?:\d{3})?\b", "«fecha»", "fechas"),  # marcas de tiempo (epoch, s o ms)
    # Versiones sueltas (x.y.z).
    (r"\bv?\d+\.\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?\b", "«versión»", "versiones"),
]


def _compilar(cfg_gsp):
    cfg_gsp = cfg_gsp or {}
    out = []
    if cfg_gsp.get("ruidoPorDefecto", True):
        out += [(re.compile(p), r, t) for p, r, t in RUIDO_DEFECTO]
    for p in cfg_gsp.get("ruido") or []:
        if not isinstance(p, str) or not p.strip():
            continue
        try:
            out.append((re.compile(p), "«ruido»", "propio"))
        except re.error:
            pass
    return out


def extensiones(cfg_gsp):
    xs = (cfg_gsp or {}).get("extensiones")
    if xs is None:
        xs = EXTENSIONES_DEFECTO
    if isinstance(xs, str):
        xs = re.split(r"[,\s]+", xs)
    return [("." + x.strip().lstrip(".")).lower() for x in xs if x and x.strip().lstrip(".")]


def es_gsp(ruta, cfg_gsp=None):
    r = (ruta or "").lower()
    return any(r.endswith(x) for x in extensiones(cfg_gsp))


_ESP = re.compile(r"\s+")
_PUNT = re.compile(r"\s*([=,;:(){}\[\]<>])\s*")


def _sin_espacios(l):
    return _PUNT.sub(r"\1", _ESP.sub(" ", l).strip())


def _lineas(texto):
    texto = (texto or "").lstrip("﻿")
    return re.split(r"\r\n|\r|\n", texto)[:MAX_LINEAS]


def _cambios(a, b):
    """Líneas añadidas + quitadas de un diff línea a línea."""
    n = 0
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=len(a) + len(b) > 4000).get_opcodes():
        if op != "equal":
            n += (i2 - i1) + (j2 - j1)
    return n


def comparar(antes, despues, cfg_gsp=None, max_real=400):
    """Compara dos versiones de un .gsp. -> resumen con los cambios reales y el ruido apartado."""
    ruido = _compilar(cfg_gsp)
    la, lb = _lineas(antes), _lineas(despues)
    if la and la[-1] == "":
        la = la[:-1]
    if lb and lb[-1] == "":
        lb = lb[:-1]
    brutas = _cambios(la, lb)

    # 1. Espacios: indentación, espacios de más o al final, CRLF/LF y las líneas vacías.
    def paso1(ls):
        out = []
        for i, l in enumerate(ls):
            s = _sin_espacios(l)
            if s:
                out.append((i + 1, l, s))
        return out
    a1, b1 = paso1(la), paso1(lb)
    tras_espacios = _cambios([x[2] for x in a1], [x[2] for x in b1])

    # 2. Ids, fechas y versiones que la herramienta genera sola.
    tipos = Counter()

    def paso2(xs, contar):
        out = []
        for n, orig, s in xs:
            v = s
            for rx, rep, tipo in ruido:
                v2 = rx.sub(rep, v)
                if v2 != v:
                    if contar:
                        tipos[tipo] += 1
                    v = v2
            out.append((n, orig, v))
        return out
    a2, b2 = paso2(a1, False), paso2(b1, False)
    # Solo cuenta lo que cambia de verdad entre las dos (no lo que es igual en ambas).
    ca, cb = Counter(x[2] for x in a1), Counter(x[2] for x in b1)
    paso2([x for x in a1 if ca[x[2]] > cb[x[2]]], True)
    paso2([x for x in b1 if cb[x[2]] > ca[x[2]]], True)
    tras_ruido = _cambios([x[2] for x in a2], [x[2] for x in b2])

    # 3. Orden: las mismas líneas en otro sitio no son cambios (se comparan como un multiconjunto).
    na, nb = Counter(x[2] for x in a2), Counter(x[2] for x in b2)
    quitadas, anadidas = [], []
    pend_a, pend_b = na - nb, nb - na
    for n, orig, v in a2:
        if pend_a.get(v):
            pend_a[v] -= 1
            quitadas.append({"n": n, "txt": orig.rstrip()[:500]})
    for n, orig, v in b2:
        if pend_b.get(v):
            pend_b[v] -= 1
            anadidas.append({"n": n, "txt": orig.rstrip()[:500]})

    # 4. Saltos de línea: lo mismo partido o juntado en otras líneas (todo junto y sin espacios, es igual).
    juntado = False
    if quitadas or anadidas:
        ja = "".join(sorted(x[2].replace(" ", "") for x in a2))
        jb = "".join(sorted(x[2].replace(" ", "") for x in b2))
        if ja != jb:
            ja = "".join(x[2].replace(" ", "") for x in a2)
            jb = "".join(x[2].replace(" ", "") for x in b2)
        juntado = ja == jb
    real = 0 if juntado else len(quitadas) + len(anadidas)
    orden = max(0, tras_ruido - real) if not juntado else 0
    return {
        "sinCambiosReales": real == 0,
        "brutas": brutas,
        "real": real,
        "ruido": {"espacios": max(0, brutas - tras_espacios) + (tras_ruido if juntado else 0),
                  "generado": max(0, tras_espacios - tras_ruido), "orden": orden, "tipos": dict(tipos)},
        "quitadas": [] if juntado else quitadas[:max_real],
        "anadidas": [] if juntado else anadidas[:max_real],
        "recortado": not juntado and (len(quitadas) > max_real or len(anadidas) > max_real),
        "lineas": [len(la), len(lb)],
    }
