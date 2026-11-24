"""Navegar los repositorios como en la web de GitHub: ramas y etiquetas,
árbol de ficheros en cualquier referencia, historial (de una rama o de un
fichero), pull requests con su conversación y comparar dos referencias.

Lo que identifica un SHA se cachea en disco (no cambia); lo demás se pide
con ETag (si no ha cambiado, GitHub contesta 304 y no gasta cuota).
"""

import threading
import time
import urllib.parse

from .diffs import RE_SHA, _ficheros
from .ghe import ErrorGHE
from .sincro import _commit_ligero, cliente_bbva

TTL_REFS = 120


def _q(s):
    return urllib.parse.quote(str(s), safe="")


def _usuario(u):
    return (u or {}).get("login") or ""


class Navegar:
    def __init__(self, config, monitor, diffs):
        self.cfg, self.mon, self.diffs = config, monitor, diffs
        self._c = threading.Lock()
        self._refs = {}
        self._cli = None

    def cli(self):
        # Un cliente compartido para aprovechar la caché de ETags entre peticiones.
        cfg = self.cfg.get()
        token = cfg["bbva"].get("token")
        with self._c:
            if not self._cli or self._cli.token != token:
                self._cli = cliente_bbva(cfg)
            return self._cli

    def refs(self, repo):
        self.diffs._repo_conocido(repo)
        with self._c:
            c = self._refs.get(repo)
            if c and time.time() - c[0] < TTL_REFS:
                return c[1]
        cli = self.cli()
        ramas = cli.paginar("repos/%s/branches" % repo, max_paginas=10)
        try:
            etiquetas = cli.get("repos/%s/tags" % repo, {"per_page": 100})[0] or []
        except ErrorGHE:
            etiquetas = []
        with self.mon._cerrojo:
            info = dict(self.mon.repos.get(repo) or {})
        out = {"repo": repo, "base": info.get("base"), "porDefecto": info.get("porDefecto"), "url": info.get("url"),
               "ramas": sorted(({"nombre": r["name"], "sha": r["commit"]["sha"]} for r in ramas), key=lambda r: r["nombre"]),
               "etiquetas": [{"nombre": t["name"], "sha": (t.get("commit") or {}).get("sha")} for t in etiquetas]}
        with self._c:
            self._refs[repo] = (time.time(), out)
        return out

    def resolver(self, repo, ref):
        """Rama, etiqueta o SHA -> SHA completo del commit."""
        if RE_SHA.match(ref or "") and len(ref) == 40:
            return ref.lower()
        datos = self.cli().crudo("repos/%s/commits/%s" % (repo, _q(ref)), accept="application/vnd.github.sha", limite=200)
        return datos.decode("ascii", "replace").strip()

    def arbol(self, repo, ref):
        self.diffs._repo_conocido(repo)
        sha = self.resolver(repo, ref)

        def traer():
            d = self.cli().get("repos/%s/git/trees/%s" % (repo, sha), {"recursive": 1}, etag=False)[0]
            entradas = [{"p": e["path"], "t": "d" if e["type"] == "tree" else ("m" if e["type"] == "commit" else "f"),
                         "s": e.get("size")} for e in d.get("tree") or []]
            return {"entradas": entradas, "truncado": bool(d.get("truncated"))}

        return dict(self.diffs._cache(("arbol", repo, sha), traer), repo=repo, ref=ref, sha=sha)

    def historial(self, repo, ref, ruta="", pagina=1):
        self.diffs._repo_conocido(repo)
        params = {"sha": ref, "per_page": 40, "page": max(1, int(pagina or 1))}
        if ruta:
            params["path"] = ruta
        cs = self.cli().get("repos/%s/commits" % repo, params)[0] or []
        return {"repo": repo, "ref": ref, "ruta": ruta, "pagina": params["page"], "hayMas": len(cs) == 40,
                "commits": [_commit_ligero(c) for c in cs]}

    def prs(self, repo, estado="open"):
        self.diffs._repo_conocido(repo)
        estado = estado if estado in ("open", "closed", "all") else "open"
        ps = self.cli().get("repos/%s/pulls" % repo, {"state": estado, "per_page": 60, "sort": "updated", "direction": "desc"})[0] or []
        return {"repo": repo, "estado": estado, "prs": [self._pr_ligero(p) for p in ps]}

    @staticmethod
    def _pr_ligero(p):
        return {"numero": p.get("number"), "titulo": p.get("title") or "", "estado": "mergeada" if p.get("merged_at") else
                ("abierta" if p.get("state") == "open" else "cerrada"), "borrador": bool(p.get("draft")),
                "autor": _usuario(p.get("user")), "origen": (p.get("head") or {}).get("ref"), "destino": (p.get("base") or {}).get("ref"),
                "creada": p.get("created_at"), "actualizada": p.get("updated_at"), "url": p.get("html_url")}

    def pr(self, repo, numero):
        self.diffs._repo_conocido(repo)
        n = int(numero)
        cli = self.cli()
        p = cli.get("repos/%s/pulls/%d" % (repo, n))[0]
        cab = self._pr_ligero(p)
        cab.update(cuerpo=p.get("body") or "", origenSha=(p.get("head") or {}).get("sha"), destinoSha=(p.get("base") or {}).get("sha"),
                   mas=p.get("additions"), menos=p.get("deletions"), nFicheros=p.get("changed_files"), nCommits=p.get("commits"),
                   mergeadaPor=_usuario(p.get("merged_by")), mergeada=p.get("merged_at"))

        def traer():
            files = cli.paginar("repos/%s/pulls/%d/files" % (repo, n), max_paginas=30)
            commits = cli.paginar("repos/%s/pulls/%d/commits" % (repo, n), max_paginas=3)
            coment = cli.paginar("repos/%s/issues/%d/comments" % (repo, n), max_paginas=5)
            revis = cli.paginar("repos/%s/pulls/%d/reviews" % (repo, n), max_paginas=3)
            en_codigo = cli.paginar("repos/%s/pulls/%d/comments" % (repo, n), max_paginas=5)
            hilo = [{"tipo": "comentario", "autor": _usuario(c.get("user")), "fecha": c.get("created_at"), "texto": c.get("body") or ""}
                    for c in coment]
            hilo += [{"tipo": "revision", "autor": _usuario(r.get("user")), "fecha": r.get("submitted_at"), "texto": r.get("body") or "",
                      "estado": r.get("state")} for r in revis if r.get("body") or r.get("state") in ("APPROVED", "CHANGES_REQUESTED")]
            hilo += [{"tipo": "codigo", "autor": _usuario(c.get("user")), "fecha": c.get("created_at"), "texto": c.get("body") or "",
                      "ruta": c.get("path"), "linea": c.get("line") or c.get("original_line"), "fragmento": c.get("diff_hunk") or ""}
                     for c in en_codigo]
            hilo.sort(key=lambda x: x.get("fecha") or "")
            return {"ficheros": _ficheros(files), "commits": [_commit_ligero(c) for c in commits], "hilo": hilo}

        d = self.diffs._cache(("pr", repo, str(n), p.get("updated_at") or "", cab["origenSha"] or ""), traer)
        return dict(d, **cab, repo=repo)

    def comparar(self, repo, base, head):
        self.diffs._repo_conocido(repo)
        a, b = self.resolver(repo, base), self.resolver(repo, head)
        return dict(self.diffs.comparar(repo, a, b), base=base, head=head)
