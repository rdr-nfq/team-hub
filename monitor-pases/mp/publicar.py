"""Publica cada DP nuevo en el repositorio de NFQ (rdr-nfq/pases-datos):
dps/<repositorio>/<DP>.json con release, features y componentes. Sin código
ni rutas de ficheros: solo lo que usa la web (ver el README de pases-datos).
"""

import base64
import datetime as dt
import json
import re
import threading
import time

from . import VERSION
from .clasificar import componentes
from .ghe import ErrorGHE
from .descriptor import LECTOR as DESC_LECTOR
from .pase import cliente_nfq

_cerrojo = threading.Lock()


def _ahora():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


# 2: los componentes salen del package descriptor (si el repositorio tiene uno). Un DP publicado con un
# cálculo anterior se vuelve a publicar una vez (antes salían ficheros que el DP no instala).
CALCULO = 4  # 3: el descriptor se lee en UTF-16/cp1252, con DTD o entidades; 4: solo cuenta su sección <Tasks>


def documento(info, cfg, usuario):
    from .sincro import ficheros_reales
    comps, _ = componentes(ficheros_reales(info), cfg.get("reglas") or [], (cfg.get("reposSubida") or {}).get(info["repo"], ""))
    return {
        "formato": "monitor-pases/dp-1",
        "cod": info["cod"], "repo": info["repo"], "release": info.get("release") or "", "rama": info.get("rama") or "",
        "commit": (info.get("sha") or "")[:7], "run": info.get("run"), "fecha": info.get("fecha"),
        "features": info.get("features") or [],
        "componentes": [{"nom": c["nombre"], "tipo": c["tipo"], "subida": c["subida"]} for c in comps],
        "calculo": CALCULO,
        "publicado": {"por": usuario or "", "fecha": _ahora(), "app": VERSION},
    }


def ruta_dp(info):
    repo = re.sub(r"[^A-Za-z0-9._-]", "_", info["repo"].split("/")[-1])
    cod = re.sub(r"[^A-Za-z0-9._-]", "_", info["cod"])
    return "dps/%s/%s.json" % (repo, cod)


def publicar_dps(monitor, config, usuario="", forzar=False):
    """Sube los DPs que aún no están en pases-datos. -> {publicados, yaEstaban, errores, motivo}"""
    cfg = config.get()
    n = cfg["nfq"]
    if not forzar and not n.get("publicarDPs", True):
        return {"publicados": 0, "motivo": "La publicación automática está desactivada en Ajustes."}
    if not n.get("token") or not n.get("repo"):
        return {"publicados": 0, "motivo": "Inicia sesión en GitHub NFQ para publicar los DPs."}
    with _cerrojo:  # una publicación a la vez
        monitor.descriptores_al_dia()
        with monitor._cerrojo:
            pendientes = [(k, dict(v)) for k, v in monitor.dps_info.items()
                          if (not v.get("publicado") or (v["publicado"].get("calculo") or 1) < CALCULO)
                          and v.get("conclusion") in ("success", None)
                          # Aún sin mirar su package descriptor: se publica cuando se sepa qué instala.
                          and not (v.get("ficheros") and (v.get("descriptor") is None
                                                           or (v["descriptor"].get("v") or 1) < DESC_LECTOR))]
        if not pendientes:
            return {"publicados": 0, "yaEstaban": 0, "errores": []}
        cli = cliente_nfq(cfg)
        rama = n.get("rama") or "main"
        hechos, ya, errores = 0, 0, []
        for clave, info in pendientes:
            ruta = ruta_dp(info)
            try:
                try:
                    actual = cli.get("repos/%s/contents/%s" % (n["repo"], ruta), {"ref": rama}, etag=False)[0]
                except ErrorGHE as e:
                    if e.estado != 404:
                        raise
                    actual = None
                doc = documento(info, cfg, usuario)
                if actual:  # ya lo publicó alguien del equipo: un DP no cambia, salvo si se calculó a la antigua
                    try:
                        suyo = json.loads(base64.b64decode(actual.get("content") or "").decode("utf-8") or "{}")
                    except ValueError:
                        suyo = {}
                    if (suyo.get("calculo") or 1) >= CALCULO or suyo.get("componentes") == doc["componentes"] or not actual.get("content"):
                        monitor.marcar_publicado(clave, {"fecha": _ahora(), "url": actual.get("html_url"), "yaEstaba": True, "calculo": CALCULO})
                        ya += 1
                        continue
                texto = json.dumps(doc, ensure_ascii=False, indent=1) + "\n"
                quien = info.get("release") and "release/" + info["release"] or info.get("rama")
                cuerpo = {"message": "DP %s · %s %s%s" % (info["cod"], info["repo"].split("/")[-1], quien,
                                                          " (componentes según el package descriptor)" if actual else ""),
                          "content": base64.b64encode(texto.encode("utf-8")).decode("ascii"), "branch": rama}
                if actual:
                    cuerpo["sha"] = actual.get("sha")
                r = cli.escribir("PUT", "repos/%s/contents/%s" % (n["repo"], ruta), cuerpo)
                monitor.marcar_publicado(clave, {"fecha": _ahora(), "url": ((r or {}).get("content") or {}).get("html_url"), "calculo": CALCULO})
                hechos += 1
            except ErrorGHE as e:
                errores.append({"cod": info["cod"], "error": str(e), "pista": e.pista})
                if e.estado in (401, 403, 404):
                    break  # sin permiso o sin repositorio: no tiene sentido seguir
        monitor.guardar()
        return {"publicados": hechos, "yaEstaban": ya, "errores": errores}


def enviar_diagnostico(cfg, nombre, informe, demo=False):
    """Sube un diagnóstico SIN contenido (solo formas y cifras) a pases-datos/diagnostico/."""
    if demo:
        return {"ok": True, "fichero": "(en la demo no se envía)"}
    n = cfg["nfq"]
    if not n.get("token") or not n.get("repo"):
        raise ValueError("Inicia sesión en GitHub NFQ para enviar el diagnóstico.")
    destino = "diagnostico/%s-%s.json" % (nombre, time.strftime("%Y%m%d-%H%M%S"))
    texto = json.dumps(dict(informe, app=VERSION, fecha=_ahora()), ensure_ascii=False, indent=1) + "\n"
    r = cliente_nfq(cfg).escribir("PUT", "repos/%s/contents/%s" % (n["repo"], destino), {
        "message": "Diagnóstico (%s) · monitor-pases %s" % (nombre, VERSION), "branch": n.get("rama") or "main",
        "content": base64.b64encode(texto.encode("utf-8")).decode("ascii")})
    return {"ok": True, "fichero": ((r or {}).get("content") or {}).get("html_url") or destino}
