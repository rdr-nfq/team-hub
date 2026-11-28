"""Diferencias bajo demanda: un commit con todos sus ficheros y sus cambios,
una rama frente a producción y un fichero completo en un commit.

Se piden al abrirlas (no en la sincronización) y se guardan en disco, en la
carpeta de datos de la VDI: lo que identifica un SHA no cambia nunca, así que
cada cosa se pide a GitHub una sola vez.
"""

import hashlib
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

from . import gsp as GSP
from .config import escribir_json, leer_json
from .ghe import ErrorGHE
from .sincro import _commit_ligero, cliente_bbva

MAX_PATCH = 600_000  # caracteres de diff por fichero
MAX_FICHERO = 3 * 1024 * 1024  # bytes de un fichero completo
RE_SHA = re.compile(r"^[0-9a-fA-F]{7,40}$")


def _ficheros(files):
    out = []
    for f in files or []:
        patch = f.get("patch")
        out.append({"ruta": f.get("filename"), "antes": f.get("previous_filename"), "estado": f.get("status"),
                    "mas": f.get("additions", 0), "menos": f.get("deletions", 0),
                    "patch": patch[:MAX_PATCH] if patch else None, "recortado": bool(patch and len(patch) > MAX_PATCH),
                    "binario": patch is None and f.get("changes", 0) == 0 and f.get("status") != "renamed"})
    return out


class Diffs:
    def __init__(self, config, monitor):
        self.cfg, self.mon = config, monitor
        self.dir = config.dir / "diffs"
        self.dir.mkdir(parents=True, exist_ok=True)

    def _cache(self, clave, traer):
        ruta = self.dir / (hashlib.sha1("|".join(clave).encode("utf-8")).hexdigest() + ".json")
        d = leer_json(ruta)
        if d is None:
            d = traer()
            escribir_json(ruta, d)
        return d

    def _gsp(self):
        return self.cfg.get().get("gsp") or {}

    def _marcar(self, d):
        """Señala los ficheros que tienen comparador propio (.gsp), para que la página lo ofrezca."""
        cg = self._gsp()
        for f in d.get("ficheros") or []:
            if GSP.es_gsp(f.get("ruta"), cg) or GSP.es_gsp(f.get("antes"), cg):
                f["gsp"] = True
        return d

    def _repo_conocido(self, repo):
        with self.mon._cerrojo:
            if repo not in self.mon.repos:
                raise ValueError("Ese repositorio no está entre los que mira el monitor.")

    def commit(self, repo, sha):
        self._repo_conocido(repo)
        if not RE_SHA.match(sha or ""):
            raise ValueError("SHA de commit no válido.")

        def traer():
            cli = cliente_bbva(self.cfg.get())
            d, cab = cli.get("repos/%s/commits/%s" % (repo, sha), etag=False)
            files = list(d.get("files") or [])
            # Más de 300 ficheros: GitHub pagina el resto (hasta 3000).
            pag = 2
            while 'rel="next"' in cab.get("link", "") and pag <= 10:
                d2, cab = cli.get("repos/%s/commits/%s" % (repo, sha), {"page": pag}, etag=False)
                files.extend(d2.get("files") or [])
                pag += 1
            info = d.get("commit") or {}
            lig = _commit_ligero(d)
            return {"repo": repo, "sha": d.get("sha"), "mensaje": info.get("message") or "", "autor": lig["autor"],
                    "autorNombre": (info.get("author") or {}).get("name") or "", "fecha": lig["fecha"],
                    "integrador": (info.get("committer") or {}).get("name") or "",
                    "padres": [p.get("sha") for p in d.get("parents") or []], "url": d.get("html_url"),
                    "stats": d.get("stats") or {}, "ficheros": _ficheros(files)}

        return self._marcar(self._cache(("commit", repo, sha.lower()), traer))

    def rama(self, rid):
        with self.mon._cerrojo:
            r = self.mon.ramas.get(rid)
        if not r:
            raise KeyError("Esa rama ya no está en la última sincronización.")
        if r.get("esBase") or not r.get("baseSha"):
            raise ValueError("Esta rama no tiene una rama de producción con la que compararla.")
        repo, base_sha, sha = r["repo"], r["baseSha"], r["sha"]

        def traer():
            cli = cliente_bbva(self.cfg.get())
            d = cli.get("repos/%s/compare/%s...%s" % (repo, base_sha, sha), etag=False)[0]
            files = d.get("files") or []
            return {"ahead": d.get("ahead_by", 0), "behind": d.get("behind_by", 0),
                    "commits": [_commit_ligero(c) for c in d.get("commits") or []],
                    "ficheros": _ficheros(files), "truncado": len(files) >= 300}

        d = self._marcar(self._cache(("rama", repo, base_sha, sha), traer))
        return dict(d, id=rid, repo=repo, rama=r["rama"], base=r.get("base"), baseSha=base_sha, sha=sha,
                    feature=r.get("feature"), url=r.get("comparar"))

    def comparar(self, repo, base_sha, sha):
        """Diferencias entre dos commits (con el contenido de cada cambio)."""
        self._repo_conocido(repo)
        if not (RE_SHA.match(base_sha or "") and RE_SHA.match(sha or "")):
            raise ValueError("Referencias no válidas.")

        def traer():
            cli = cliente_bbva(self.cfg.get())
            d = cli.get("repos/%s/compare/%s...%s" % (repo, base_sha, sha), etag=False)[0]
            files = d.get("files") or []
            return {"ahead": d.get("ahead_by", 0), "behind": d.get("behind_by", 0),
                    "commits": [_commit_ligero(c) for c in d.get("commits") or []],
                    "ficheros": _ficheros(files), "truncado": len(files) >= 300}

        return self._marcar(dict(self._cache(("comparar", repo, base_sha, sha), traer), repo=repo, baseSha=base_sha, sha=sha))

    def dp(self, repo, cod):
        """Las modificaciones de un DP: lo que trae frente a producción (o a la
        release anterior) en el commit del que se generó."""
        info = self.mon.dp(repo, cod)
        if not info:
            raise KeyError("Ese DP no está entre los detectados.")
        if not info.get("frenteSha"):
            raise ValueError("No hay con qué comparar este DP.")
        d = self.comparar(repo, info["frenteSha"], info["sha"])
        # Los ficheros que ya son iguales en producción no son modificaciones del DP: se apartan.
        iguales = {f["ruta"] for f in info.get("ficheros") or [] if f.get("igualProduccion")}
        # Los que no están en el package descriptor no se instalan: se enseñan, pero marcados.
        fuera = {f["ruta"] for f in info.get("ficheros") or [] if f.get("fueraDescriptor")}
        fs = [dict(f, fueraDescriptor=True) if f.get("ruta") in fuera else f
              for f in d.get("ficheros") or [] if (f.get("ruta") or f.get("filename")) not in iguales]
        fs.sort(key=lambda f: bool(f.get("fueraDescriptor")))
        return dict(d, ficheros=fs, iguales=sorted(iguales), fuera=len(fuera), cod=cod, frente=info.get("frente"),
                    rama=info.get("rama"), release=info.get("release"))

    # ── comparador de .gsp ──────────────────────────────────────────────────
    def _texto(self, repo, ref, ruta):
        if not ref or not ruta:
            return ""
        d = self.fichero(repo, ref, ruta)
        if not d.get("existe") or d.get("binario"):
            return ""
        return d.get("texto") or ""

    def gsp(self, repo, antes, despues, ruta, ruta_antes=""):
        """Compara un .gsp entre dos commits apartando el ruido (orden, espacios, ids, fechas, versiones)."""
        self._repo_conocido(repo)
        if (antes and not RE_SHA.match(antes)) or not RE_SHA.match(despues or ""):
            raise ValueError("Referencias no válidas.")
        cg = self._gsp()
        clave = ("gsp", str(GSP.ALGORITMO), repo, (antes or "").lower(), despues.lower(), ruta, ruta_antes or "",
                 hashlib.sha1(repr(sorted(cg.items())).encode()).hexdigest()[:10])

        def traer():
            a = self._texto(repo, antes, ruta_antes or ruta)
            b = self._texto(repo, despues, ruta)
            return GSP.comparar(a, b, cg)
        return dict(self._cache(clave, traer), repo=repo, ruta=ruta, antes=antes, despues=despues)

    def gsp_dp(self, repo, cod):
        """Resumen del comparador para los .gsp de un DP: cuántos cambios reales tiene cada uno."""
        info = self.mon.dp(repo, cod)
        if not info:
            raise KeyError("Ese DP no está entre los detectados.")
        if not info.get("frenteSha"):
            return {"ficheros": []}
        cg = self._gsp()
        fs = [f for f in info.get("ficheros") or [] if not f.get("igualProduccion") and f.get("estado") != "removed"
              and GSP.es_gsp(f.get("ruta"), cg)][:120]

        def uno(f):
            try:
                r = self.gsp(repo, info["frenteSha"] if f.get("estado") != "added" else "", info["sha"], f["ruta"], f.get("antes") or "")
                return {"ruta": f["ruta"], "brutas": r["brutas"], "real": r["real"], "sinCambiosReales": r["sinCambiosReales"],
                        "ruido": r["ruido"]}
            except (ErrorGHE, ValueError) as e:
                return {"ruta": f["ruta"], "error": str(e)}
        with ThreadPoolExecutor(4) as ex:
            return {"ficheros": list(ex.map(uno, fs))}

    def fichero(self, repo, ref, ruta):
        self._repo_conocido(repo)
        if not RE_SHA.match(ref or ""):
            raise ValueError("Referencia no válida.")
        if not ruta or ".." in ruta.split("/"):
            raise ValueError("Ruta no válida.")

        def traer():
            cli = cliente_bbva(self.cfg.get())
            try:
                datos = cli.crudo("repos/%s/contents/%s" % (repo, urllib.parse.quote(ruta, safe="/")), {"ref": ref},
                                  limite=MAX_FICHERO)
            except ErrorGHE as e:
                if e.estado == 404:
                    return {"existe": False}
                raise
            recortado = len(datos) > MAX_FICHERO
            datos = datos[:MAX_FICHERO]
            if b"\x00" in datos[:8000]:
                return {"existe": True, "binario": True, "tamano": len(datos)}
            return {"existe": True, "binario": False, "tamano": len(datos), "recortado": recortado,
                    "texto": datos.decode("utf-8", "replace")}

        d = self._cache(("fichero", repo, ref.lower(), ruta), traer)
        return dict(d, repo=repo, ref=ref, ruta=ruta)
