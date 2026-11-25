"""El .json del pase: propuesta a partir de las ramas, limpieza (solo salen
los campos permitidos), guardado local y subida al repositorio de NFQ.

Formato «monitor-pases/1». Los campos de cada componente son los mismos que
usa la hoja de pases de la web (acción agregarComponentes): nom, tipo, subida,
cod, resp, us, com; más repo, rama y commit para saber de dónde sale.
"""

import base64
import datetime as dt
import json
import re

from .clasificar import componentes
from .config import escribir_json, leer_json
from .ghe import Cliente, ErrorGHE, api_de_host, web_de_host

FORMATO = "monitor-pases/1"
CAMPOS_COMP = ("nom", "tipo", "subida", "cod", "resp", "us", "com", "repo", "rama", "commit")
CAMPOS_DP = ("cod", "repo", "rama", "run", "fecha")
RE_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def propuesta(monitor, features):
    """Para cada proyecto, los componentes de sus ramas que aún no están en
    producción, con el DP más reciente de su rama."""
    cfg = monitor.cfg.get()
    reglas, subidas, alias = cfg.get("reglas") or [], cfg.get("reposSubida") or {}, cfg.get("proyectos") or {}
    with monitor._cerrojo:
        ramas = [r for r in monitor.ramas.values() if not r.get("esBase")]
        # DPs de release que aún no están en producción: el código de la feature viaja en ellos.
        dps_rel = [dict(v) for v in monitor.dps_info.values()
                   if v.get("release") and not v.get("congelado") and v.get("conclusion") in ("success", None)]

    iguales_prod = {}  # repo -> ficheros que ya están iguales en producción (según los DPs de release)
    for d in dps_rel:
        iguales_prod.setdefault(d["repo"], set()).update(f["ruta"] for f in d.get("ficheros") or [] if f.get("igualProduccion"))

    def dp_de_release(repo, feature, rutas):
        """El DP de release más reciente de ese repo que lleva la feature y alguno de esos ficheros."""
        cands = [d for d in dps_rel if d["repo"] == repo and feature in (d.get("features") or [])
                 and set(rutas) & {f["ruta"] for f in d.get("ficheros") or [] if not f.get("igualProduccion")}]
        return max(cands, key=lambda d: d.get("fecha") or "") if cands else None
    out = []
    for f in features:
        de_f = sorted((r for r in ramas if (r.get("feature") or "") == f), key=lambda r: (r["repo"], r["rama"]))
        comps, dps, mergeadas = [], [], []
        for r in de_f:
            if r.get("mergeada"):
                mergeadas.append({"repo": r["repo"], "rama": r["rama"]})
                continue
            dps_r = monitor.dps_de_rama(r)
            for d in dps_r:
                dps.append({"cod": d["cod"], "repo": r["repo"], "rama": r["rama"], "run": d.get("run"),
                            "fecha": d.get("fecha"), "fuente": d.get("fuente"), "url": d.get("url")})
            cod = dps_r[0]["cod"] if dps_r else ""
            grupos, _ = componentes(r.get("ficheros"), reglas, subidas.get(r["repo"], ""))
            for c in grupos:
                rel = dp_de_release(r["repo"], f, c["ficheros"])
                if rel and not any(x["cod"] == rel["cod"] and x["repo"] == rel["repo"] for x in dps):
                    dps.append({"cod": rel["cod"], "repo": rel["repo"], "rama": rel["rama"], "run": rel.get("run"),
                                "fecha": rel.get("fecha"), "fuente": rel.get("fuente"), "url": rel.get("url")})
                comps.append({
                    "id": "%s:%s:%s" % (r["repo"], r["rama"], c["clave"]),
                    "nom": c["nombre"], "tipo": c["tipo"], "subida": c["subida"], "cod": rel["cod"] if rel else cod, "resp": "", "us": "",
                    "dpDe": ("release " + rel["release"]) if rel else ("rama" if cod else ""),
                    "com": "Se borra" if c["borrado"] else ("Ya está igual en producción" if set(c["ficheros"]) <= iguales_prod.get(r["repo"], set()) else ""),
                    "yaEnProduccion": set(c["ficheros"]) <= iguales_prod.get(r["repo"], set()), "repo": r["repo"], "rama": r["rama"],
                    "commit": (r.get("sha") or "")[:7], "ficheros": c["ficheros"], "dpsRama": [d["cod"] for d in dps_r],
                    "regla": c["regla"],
                })
        out.append({"feature": f, "nombre": alias.get(f, ""), "componentes": comps, "dps": dps,
                    "mergeadas": mergeadas, "ramas": len(de_f)})
    return out


def _txt(v, n=300):
    return str(v if v is not None else "").strip()[:n]


def limpiar(pase):
    """Solo los campos permitidos: es exactamente lo que sale de la VDI."""
    fecha = _txt(pase.get("pase"), 10)
    if not RE_FECHA.match(fecha):
        raise ValueError("La fecha del pase debe ser AAAA-MM-DD.")
    out = {"formato": FORMATO, "pase": fecha,
           "generado": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
           "proyectos": []}
    for p in pase.get("proyectos") or []:
        comps = []
        for c in p.get("componentes") or []:
            x = {k: _txt(c.get(k)) for k in CAMPOS_COMP}
            if x["nom"]:
                comps.append(x)
        dps, vistos = [], set()
        for d in p.get("dps") or []:
            x = {k: (d.get(k) if k == "run" and isinstance(d.get(k), int) else _txt(d.get(k), 120)) for k in CAMPOS_DP}
            if x["cod"] and x["cod"] not in vistos:
                vistos.add(x["cod"])
                dps.append(x)
        nombre, feature = _txt(p.get("nombre"), 200), _txt(p.get("feature"), 60)
        if nombre or feature or comps:
            out["proyectos"].append({"nombre": nombre, "feature": feature, "componentes": comps, "dps": dps})
    if not out["proyectos"]:
        raise ValueError("El pase no tiene ningún proyecto.")
    return out


def nombre_fichero(fecha):
    return "pase-%s.json" % fecha


def guardar(dir_datos, pase):
    limpio = limpiar(pase)
    ruta = dir_datos / "pases" / nombre_fichero(limpio["pase"])
    escribir_json(ruta, limpio)
    return limpio, ruta


def listar(dir_datos):
    out = []
    for f in sorted((dir_datos / "pases").glob("pase-*.json"), reverse=True):
        d = leer_json(f, {}) or {}
        out.append({"fichero": f.name, "ruta": str(f), "pase": d.get("pase"), "generado": d.get("generado"),
                    "proyectos": len(d.get("proyectos") or []),
                    "componentes": sum(len(p.get("componentes") or []) for p in d.get("proyectos") or []),
                    "subido": d.get("_subido")})
    return out


def cliente_nfq(cfg):
    n = cfg["nfq"]
    if not n.get("token") or not n.get("repo"):
        raise ErrorGHE("Falta el repositorio o el token de GitHub NFQ.", pista="Rellénalos en Ajustes → GitHub NFQ.")
    return Cliente(n.get("api") or api_de_host(n.get("host") or "github.com"), n["token"], n.get("proxy"), n.get("ca"),
                   transporte=n.get("transporte"))


def subir(cfg, dir_datos, fecha):
    """Sube pases/pase-<fecha>.json al repositorio de NFQ (crea o actualiza)."""
    ruta = dir_datos / "pases" / nombre_fichero(fecha)
    limpio = leer_json(ruta)
    if not limpio:
        raise ValueError("Primero guarda el pase.")
    # Se vuelve a limpiar por si el fichero se ha tocado a mano: solo salen los campos permitidos.
    generado = limpio.get("generado")
    limpio = limpiar(limpio)
    if generado:
        limpio["generado"] = generado
    n = cfg["nfq"]
    cli = cliente_nfq(cfg)
    carpeta = str(n.get("carpeta") or "").strip("/")
    destino = (carpeta + "/" if carpeta else "") + nombre_fichero(fecha)
    rama = n.get("rama") or "main"
    sha = None
    try:
        actual = cli.get("repos/%s/contents/%s" % (n["repo"], destino), {"ref": rama}, etag=False)[0]
        sha = (actual or {}).get("sha")
    except ErrorGHE as e:
        if e.estado != 404:
            raise
    contenido = json.dumps(limpio, ensure_ascii=False, indent=1) + "\n"
    n_comp = sum(len(p["componentes"]) for p in limpio["proyectos"])
    cuerpo = {"message": "Pase %s: %d proyectos, %d componentes" % (fecha, len(limpio["proyectos"]), n_comp),
              "content": base64.b64encode(contenido.encode("utf-8")).decode("ascii"), "branch": rama}
    if sha:
        cuerpo["sha"] = sha
    r = cli.escribir("PUT", "repos/%s/contents/%s" % (n["repo"], destino), cuerpo)
    info = {"fecha": dt.datetime.now().isoformat(timespec="seconds"), "commit": ((r or {}).get("commit") or {}).get("html_url"),
            "fichero": ((r or {}).get("content") or {}).get("html_url") or "%s/%s/blob/%s/%s" % (
                web_de_host(n.get("host") or "github.com"), n["repo"], rama, destino)}
    guardado = dict(limpio, _subido=info)
    escribir_json(ruta, guardado)
    return info
