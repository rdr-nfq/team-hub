"""Sincronización con GitHub BBVA y estado local.

Por cada repositorio: ramas, rama base de producción (master/main), PRs
recientes y ejecuciones de Actions de los últimos días. Por cada rama de
proyecto: qué trae que no esté en producción (commits y ficheros, con la API
de comparar) y los DPs de sus ejecuciones. Lo caro se cachea por SHA o por
ejecución, así que una sincronización sin cambios casi no gasta cuota.
"""

import datetime as dt
import fnmatch
import threading
import time
import traceback
import urllib.parse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from .clasificar import buscar_dps, componentes, feature_de_rama
from .config import escribir_json, leer_json
from .ghe import Cliente, ErrorGHE, api_de_host

POOL_REPOS = 3
POOL_RAMAS = 3
RUNS_POR_RAMA = 10


def _ahora():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _q(s):
    return urllib.parse.quote(str(s), safe="")


def _commit_ligero(c):
    info = c.get("commit") or {}
    autor = (c.get("author") or {}).get("login") or (info.get("author") or {}).get("name") or ""
    fecha = (info.get("author") or {}).get("date") or (info.get("committer") or {}).get("date") or ""
    return {"sha": c.get("sha", ""), "fecha": fecha, "autor": autor,
            "mensaje": (info.get("message") or "").split("\n")[0][:160], "url": c.get("html_url", "")}


def cliente_bbva(cfg):
    b = cfg["bbva"]
    return Cliente(b.get("api") or api_de_host(b.get("host")), b.get("token"), b.get("proxy"), b.get("ca"),
                   transporte=b.get("transporte"))


class Monitor:
    def __init__(self, config):
        self.cfg = config
        self.ruta = config.dir / "estado.json"
        e = leer_json(self.ruta, {}) or {}
        self.repos = e.get("repos", {})
        self.ramas = e.get("ramas", {})
        self.cache_compare = e.get("cacheCompare", {})
        self.cache_runs = e.get("cacheRuns", {})
        self.manuales = e.get("dpsManuales", {})
        self.borradores = e.get("borradores", {})
        self.etags = e.get("etags", {})
        self.sincro = e.get("sincro") or {"estado": "nunca"}
        if self.sincro.get("estado") == "en curso":  # la app se cerró a medias
            self.sincro["estado"] = "interrumpida"
        self.cuota = {}
        self._cerrojo = threading.RLock()
        self._despertar = threading.Event()
        self._en_curso = False

    # ── persistencia ────────────────────────────────────────────────────────
    def guardar(self):
        with self._cerrojo:
            escribir_json(self.ruta, {
                "repos": self.repos, "ramas": self.ramas, "cacheCompare": self.cache_compare,
                "cacheRuns": self.cache_runs, "dpsManuales": self.manuales, "borradores": self.borradores,
                "etags": self.etags, "sincro": self.sincro,
            })

    # ── bucle en segundo plano ──────────────────────────────────────────────
    def arrancar(self):
        threading.Thread(target=self._bucle, name="sincro", daemon=True).start()

    def _bucle(self):
        while True:
            if self.cfg.configurado():
                try:
                    self.sincronizar()
                except Exception:  # nunca tumbar el hilo
                    traceback.print_exc()
            minutos = max(2, int(self.cfg.get()["bbva"].get("refrescoMin") or 10))
            self._despertar.wait(minutos * 60)
            self._despertar.clear()

    def pedir_sincro(self):
        if self._en_curso:
            return False
        self._despertar.set()
        return True

    # ── sincronización ──────────────────────────────────────────────────────
    def _progreso(self, **kw):
        with self._cerrojo:
            self.sincro.update(kw)

    def sincronizar(self):
        cfg = self.cfg.get()
        b = cfg["bbva"]
        self._en_curso = True
        inicio = time.time()
        self._progreso(estado="en curso", inicio=_ahora(), fase="Buscando repositorios", repos=[0, 0], errores=[])
        cli = cliente_bbva(cfg)
        cli.etags = self.etags
        try:
            repos = self._descubrir(cli, b)
            self._progreso(fase="Leyendo ramas y ejecuciones", repos=[0, len(repos)])
            nuevos_repos, nuevas_ramas, errores = {}, {}, []
            usadas_compare, usadas_runs = set(), set()
            hechos = [0]

            def un_repo(r):
                try:
                    info, ramas, uc, ur = self._repo(cli, cfg, r)
                except ErrorGHE as e:
                    info, ramas, uc, ur = ({"nombre": r["full_name"], "url": r.get("html_url", ""),
                                            "error": e.como_dict()}, {}, set(), set())
                    previas = {k: v for k, v in self.ramas.items() if v.get("repo") == r["full_name"]}
                    ramas = previas  # se conservan los datos anteriores del repo que falla
                    errores.append({"repo": r["full_name"], **e.como_dict()})
                with self._cerrojo:
                    nuevos_repos[r["full_name"]] = info
                    nuevas_ramas.update(ramas)
                    usadas_compare.update(uc)
                    usadas_runs.update(ur)
                    hechos[0] += 1
                    self.sincro["repos"] = [hechos[0], len(repos)]
                    self.cuota = cli.estado_cuota()

            with ThreadPoolExecutor(POOL_REPOS) as ex:
                list(ex.map(un_repo, repos))

            with self._cerrojo:
                self.repos = nuevos_repos
                self.ramas = nuevas_ramas
                self.cache_compare = {k: v for k, v in self.cache_compare.items() if k in usadas_compare}
                self.cache_runs = {k: v for k, v in self.cache_runs.items() if k in usadas_runs}
                self.etags = {k: v for k, v in cli.etags.items() if k in cli.usadas}
                self.cuota = cli.estado_cuota()
                self.sincro = {"estado": "ok" if not errores else "con errores", "fin": _ahora(),
                               "inicio": self.sincro.get("inicio"), "segundos": round(time.time() - inicio, 1),
                               "repos": [len(repos), len(repos)], "ramas": len(nuevas_ramas), "errores": errores,
                               "llamadas": cli.llamadas, "ahorradas": cli.ahorradas}
        except ErrorGHE as e:
            with self._cerrojo:
                self.sincro = {"estado": "error", "fin": _ahora(), "error": e.como_dict(),
                               "segundos": round(time.time() - inicio, 1)}
                self.cuota = cli.estado_cuota()
        finally:
            self._en_curso = False
            self.guardar()

    def _descubrir(self, cli, b):
        vistos = {}
        yo = None
        for org in b.get("organizaciones") or []:
            org = str(org).strip().strip("/")
            if not org:
                continue
            try:
                lista = cli.paginar("orgs/%s/repos" % _q(org), {"type": "all"}, max_paginas=30)
            except ErrorGHE as e:
                if e.estado != 404:
                    raise
                # No es una organización: es una cuenta de usuario.
                if yo is None:
                    yo = (cli.get("user")[0] or {}).get("login", "")
                if yo.lower() == org.lower():
                    lista = cli.paginar("user/repos", {"affiliation": "owner"}, max_paginas=30)
                else:
                    lista = cli.paginar("users/%s/repos" % _q(org), {"type": "all"}, max_paginas=30)
            for r in lista:
                vistos[r["full_name"]] = r
        for full in b.get("repos") or []:
            full = str(full).strip().strip("/")
            if full and full not in vistos:
                vistos[full] = cli.get("repos/" + full)[0]
        excluir = [str(x).strip().lower() for x in b.get("excluirRepos") or [] if str(x).strip()]
        out = []
        for full, r in sorted(vistos.items(), key=lambda x: x[0].lower()):
            if r.get("archived") or r.get("disabled"):
                continue
            if any(fnmatch.fnmatch(full.lower(), p) or fnmatch.fnmatch(full.split("/")[-1].lower(), p) for p in excluir):
                continue
            out.append(r)
        return out

    def _repo(self, cli, cfg, r):
        b = cfg["bbva"]
        full = r["full_name"]
        dias = int(b.get("diasActividad") or 45)
        desde = (dt.date.today() - dt.timedelta(days=dias)).isoformat()
        url_repo = r.get("html_url", "")
        info = {"nombre": full, "url": url_repo, "porDefecto": r.get("default_branch"), "empujado": r.get("pushed_at"),
                "error": None}

        lista = cli.paginar("repos/%s/branches" % full, max_paginas=30)
        shas = {x["name"]: x["commit"]["sha"] for x in lista}
        candidatas = [(b.get("basesRepo") or {}).get(full), b.get("baseProduccion"), "master", "main", r.get("default_branch")]
        base = next((c for c in candidatas if c and c in shas), None)
        base_sha = shas.get(base)
        info["base"] = base
        info["nRamas"] = len(shas)

        solo = b.get("soloRamasDeProyecto", True)
        patron = b.get("patronRama")
        elegidas = [n for n in shas if n != base and (not solo or feature_de_rama(n, patron))]

        # PRs recientes (una página): la más reciente por rama.
        pr_de = {}
        try:
            prs = cli.get("repos/%s/pulls" % full, {"state": "all", "per_page": 100, "sort": "updated", "direction": "desc"})[0]
        except ErrorGHE:
            prs = []
        for p in prs or []:
            ref = (p.get("head") or {}).get("ref")
            if ref and ref not in pr_de:
                estado = "mergeada" if p.get("merged_at") else ("abierta" if p.get("state") == "open" else "cerrada")
                pr_de[ref] = {"numero": p.get("number"), "estado": estado, "url": p.get("html_url"),
                              "titulo": (p.get("title") or "")[:160], "borrador": bool(p.get("draft")),
                              "destino": (p.get("base") or {}).get("ref")}

        # Ejecuciones de Actions del periodo, agrupadas por rama.
        try:
            runs = cli.paginar("repos/%s/actions/runs" % full, {"created": ">=" + desde}, max_paginas=5, clave="workflow_runs")
        except ErrorGHE as e:
            if e.estado in (403, 404):
                runs = []  # Actions desactivadas o sin permiso
                info["avisoActions"] = str(e)
            else:
                raise
        runs_de = defaultdict(list)
        for x in runs:
            runs_de[x.get("head_branch")].append(x)

        usadas_compare, usadas_runs = set(), set()
        salida = {}

        # La rama base, para ver en Actividad lo que entra en producción.
        if base:
            try:
                cs = cli.get("repos/%s/commits" % full, {"sha": base, "since": desde + "T00:00:00Z", "per_page": 60})[0]
            except ErrorGHE:
                cs = []
            commits = [_commit_ligero(c) for c in cs or []][::-1]
            rid = "%s:%s" % (full, base)
            salida[rid] = {
                "id": rid, "repo": full, "rama": base, "feature": "", "esBase": True, "sha": base_sha, "base": base, "baseSha": base_sha,
                "ahead": 0, "behind": 0, "mergeada": False, "commits": commits,
                "cabeza": commits[-1] if commits else None, "ficheros": [], "truncado": False, "pr": None,
                "runs": self._runs(cli, cfg, full, base, runs_de.get(base, []), usadas_runs),
                "url": "%s/tree/%s" % (url_repo, urllib.parse.quote(base)), "comparar": "",
            }

        def una_rama(n):
            return self._rama(cli, cfg, full, url_repo, n, shas[n], base, base_sha, pr_de.get(n),
                              runs_de.get(n, []), usadas_compare, usadas_runs)

        with ThreadPoolExecutor(POOL_RAMAS) as ex:
            for x in ex.map(una_rama, elegidas):
                salida[x["id"]] = x
        return info, salida, usadas_compare, usadas_runs

    def _rama(self, cli, cfg, full, url_repo, n, sha, base, base_sha, pr, runs, usadas_compare, usadas_runs):
        b = cfg["bbva"]
        rid = "%s:%s" % (full, n)
        out = {"id": rid, "repo": full, "rama": n, "feature": feature_de_rama(n, b.get("patronRama")), "esBase": False,
               "sha": sha, "base": base, "baseSha": base_sha, "pr": pr, "error": None,
               "url": "%s/tree/%s" % (url_repo, urllib.parse.quote(n)),
               "comparar": "%s/compare/%s...%s" % (url_repo, urllib.parse.quote(base or ""), urllib.parse.quote(n)) if base else ""}
        clave = "%s|%s|%s" % (full, base_sha, sha)
        usadas_compare.add(clave)
        comp = self.cache_compare.get(clave)
        try:
            if comp is None:
                if base_sha:
                    d = cli.get("repos/%s/compare/%s...%s" % (full, base_sha, sha), etag=False)[0]
                    ficheros = [{"ruta": f.get("filename"), "estado": f.get("status"), "mas": f.get("additions", 0),
                                 "menos": f.get("deletions", 0), "antes": f.get("previous_filename")}
                                for f in d.get("files") or []]
                    commits = [_commit_ligero(c) for c in d.get("commits") or []]
                    comp = {"ahead": d.get("ahead_by", 0), "behind": d.get("behind_by", 0), "commits": commits[-150:],
                            "ficheros": ficheros,
                            "truncado": len(ficheros) >= 300 or (d.get("total_commits") or 0) > len(commits)}
                else:
                    comp = {"ahead": None, "behind": None, "commits": [], "ficheros": [], "truncado": False}
                if comp["commits"]:
                    comp["cabeza"] = comp["commits"][-1]
                else:
                    comp["cabeza"] = _commit_ligero(cli.get("repos/%s/commits/%s" % (full, sha))[0])
                with self._cerrojo:
                    self.cache_compare[clave] = comp
        except ErrorGHE as e:
            prev = self.ramas.get(rid) or {}
            comp = {k: prev.get(k) for k in ("ahead", "behind", "commits", "ficheros", "truncado", "cabeza")}
            out["error"] = e.como_dict()
        out.update(comp)
        out["commits"] = out.get("commits") or []
        out["ficheros"] = out.get("ficheros") or []
        out["mergeada"] = out.get("ahead") == 0 and bool(base_sha)
        out["runs"] = self._runs(cli, cfg, full, n, runs, usadas_runs)
        return out

    def _runs(self, cli, cfg, full, rama, runs, usadas_runs):
        runs = sorted(runs, key=lambda x: x.get("created_at") or "", reverse=True)
        out = []
        for i, x in enumerate(runs[:25]):
            res = {"dps": [], "fuente": ""}
            if i < RUNS_POR_RAMA:
                clave = "%s#%s#%s" % (full, x.get("id"), x.get("run_attempt") or 1)
                usadas_runs.add(clave)
                res = self.cache_runs.get(clave)
                if res is None:
                    res = self._dps_run(cli, cfg, full, x)
                    if res.get("final"):
                        with self._cerrojo:
                            self.cache_runs[clave] = res
            out.append({"id": x.get("id"), "nombre": x.get("name") or "", "titulo": (x.get("display_title") or "")[:160],
                        "estado": x.get("status"), "conclusion": x.get("conclusion"), "fecha": x.get("created_at"),
                        "url": x.get("html_url"), "sha": x.get("head_sha"), "evento": x.get("event"),
                        "dps": res.get("dps") or [], "fuenteDP": res.get("fuente") or "", "errorDP": res.get("error")})
        return out

    def _dps_run(self, cli, cfg, full, run):
        """DPs de una ejecución: nombres de pasos, resumen y anotaciones de cada
        job (lo que GitHub enseña en Summary) y, si no aparece, sus logs."""
        b = cfg["bbva"]
        if run.get("status") != "completed":
            return {"dps": [], "fuente": "", "final": False}
        filtro = [str(w).strip().lower() for w in b.get("workflowsDP") or [] if str(w).strip()]
        donde = ((run.get("name") or "") + " " + (run.get("path") or "")).lower()
        if filtro and not any(w in donde for w in filtro):
            return {"dps": [], "fuente": "", "final": True, "omitido": True}
        patron = b.get("patronDP")
        encontrados, fuente = [], ""

        def anadir(lista, f):
            nonlocal fuente
            for d in lista:
                if d not in encontrados:
                    encontrados.append(d)
                    fuente = fuente or f

        try:
            jobs = (cli.get("repos/%s/actions/runs/%s/jobs" % (full, run["id"]), {"per_page": 100})[0] or {}).get("jobs", [])
            for j in jobs:
                anadir(buscar_dps("\n".join([j.get("name") or ""] + [s.get("name") or "" for s in j.get("steps") or []]), patron), "pasos")
                cr = j.get("check_run_url") or ("repos/%s/check-runs/%s" % (full, j["id"]))
                try:
                    chk = cli.get(cr, etag=False)[0] or {}
                except ErrorGHE:
                    chk = {}
                o = chk.get("output") or {}
                anadir(buscar_dps("\n".join([o.get("title") or "", o.get("summary") or "", o.get("text") or ""]), patron), "resumen")
                if o.get("annotations_count"):
                    try:
                        anns = cli.get(cr.rstrip("/") + "/annotations", {"per_page": 100}, etag=False)[0] or []
                    except ErrorGHE:
                        anns = []
                    anadir(buscar_dps("\n".join("%s %s" % (a.get("title") or "", a.get("message") or "") for a in anns), patron), "anotación")
            if not encontrados and b.get("leerLogs", True):
                for j in jobs:
                    if j.get("status") != "completed":
                        continue
                    try:
                        anadir(buscar_dps(cli.texto("repos/%s/actions/jobs/%s/logs" % (full, j["id"])), patron), "log")
                    except ErrorGHE as e:
                        if e.estado not in (404, 410):  # 404/410: log caducado, no hay nada que leer
                            raise
            return {"dps": encontrados, "fuente": fuente, "final": True}
        except ErrorGHE as e:
            return {"dps": [], "fuente": "", "final": False, "error": str(e)}

    # ── vistas para la página ───────────────────────────────────────────────
    def dps_de_rama(self, r):
        out, vistos = [], set()
        for cod in self.manuales.get(r["id"], []):
            if cod not in vistos:
                vistos.add(cod)
                out.append({"cod": cod, "fuente": "manual"})
        for x in r.get("runs") or []:
            for cod in x.get("dps") or []:
                if cod not in vistos:
                    vistos.add(cod)
                    out.append({"cod": cod, "fuente": x.get("fuenteDP"), "run": x.get("id"), "fecha": x.get("fecha"),
                                "url": x.get("url"), "conclusion": x.get("conclusion"), "flujo": x.get("nombre")})
        return out

    def resumen(self):
        cfg = self.cfg.get()
        reglas, subidas, alias = cfg.get("reglas") or [], cfg.get("reposSubida") or {}, cfg.get("proyectos") or {}
        with self._cerrojo:
            ramas_src = list(self.ramas.values())
            repos = list(self.repos.values())
            sincro = dict(self.sincro, enCurso=self._en_curso)
            cuota = dict(self.cuota)
        ramas, proys = [], {}
        for r in ramas_src:
            comps, _ = componentes(r.get("ficheros"), reglas, subidas.get(r["repo"], ""))
            x = {k: v for k, v in r.items() if k != "ficheros"}
            x["nComp"], x["nFich"] = len(comps), len(r.get("ficheros") or [])
            x["dps"] = self.dps_de_rama(r)
            ramas.append(x)
            if r.get("esBase"):
                continue
            f = r.get("feature") or ""
            p = proys.setdefault(f, {"feature": f, "nombre": alias.get(f, ""), "ramas": 0, "abiertas": 0, "repos": set(),
                                     "dps": 0, "ultima": ""})
            p["ramas"] += 1
            p["abiertas"] += 0 if r.get("mergeada") else 1
            p["repos"].add(r["repo"])
            p["dps"] += len(x["dps"])
            fecha = (r.get("cabeza") or {}).get("fecha") or ""
            p["ultima"] = max(p["ultima"], fecha)
        # Lo más reciente primero; las ramas sin proyecto, al final.
        proyectos = sorted(({**p, "repos": sorted(p["repos"])} for p in proys.values()),
                           key=lambda p: p["ultima"], reverse=True)
        proyectos.sort(key=lambda p: p["feature"] == "")
        return {"sincro": sincro, "cuota": cuota, "repos": sorted(repos, key=lambda x: x["nombre"].lower()),
                "ramas": ramas, "proyectos": proyectos, "configurado": self.cfg.configurado()}

    def detalle(self, rid):
        cfg = self.cfg.get()
        with self._cerrojo:
            r = self.ramas.get(rid)
        if not r:
            return None
        comps, ignorados = componentes(r.get("ficheros"), cfg.get("reglas") or [], (cfg.get("reposSubida") or {}).get(r["repo"], ""))
        return dict(r, componentes=comps, ignorados=ignorados, dps=self.dps_de_rama(r),
                    manuales=self.manuales.get(rid, []))

    def poner_manuales(self, rid, dps, patron):
        limpios = []
        for d in dps or []:
            d = str(d).strip().upper()
            if d and d not in limpios:
                limpios.append(d[:80])
        with self._cerrojo:
            if limpios:
                self.manuales[rid] = limpios
            else:
                self.manuales.pop(rid, None)
        self.guardar()
        return limpios

    def commits(self):
        """Todos los commits que conoce el monitor (los que traen las ramas y los
        recientes de producción), sin repetir, con sus ramas y DPs."""
        cfg = self.cfg.get()
        alias = cfg.get("proyectos") or {}
        with self._cerrojo:
            ramas = list(self.ramas.values())
        por_sha = {}
        runs_de = {}
        for r in ramas:
            for x in r.get("runs") or []:
                if x.get("sha"):
                    runs_de.setdefault((r["repo"], x["sha"]), []).append(x)
        for r in ramas:
            for c in r.get("commits") or []:
                k = (r["repo"], c["sha"])
                e = por_sha.get(k)
                if not e:
                    runs = runs_de.get(k, [])
                    e = por_sha[k] = dict(c, repo=r["repo"], ramas=[], features=[], produccion=False,
                                          dps=sorted({d for x in runs for d in x.get("dps") or []}),
                                          actions=[{"conclusion": x.get("conclusion"), "estado": x.get("estado"), "nombre": x.get("nombre"),
                                                    "url": x.get("url")} for x in runs[:3]])
                if r.get("esBase"):
                    e["produccion"] = True
                if r["rama"] not in e["ramas"]:
                    e["ramas"].append(r["rama"])
                if r.get("feature") and r["feature"] not in e["features"]:
                    e["features"].append(r["feature"])
        out = sorted(por_sha.values(), key=lambda c: c.get("fecha") or "", reverse=True)
        return {"commits": out, "proyectos": alias}

    def rutas_de_muestra(self, limite=400):
        """Ficheros cambiados reales (para probar las reglas en Ajustes)."""
        out = []
        with self._cerrojo:
            for r in self.ramas.values():
                for f in r.get("ficheros") or []:
                    out.append({"ruta": f.get("ruta"), "repo": r["repo"]})
                    if len(out) >= limite:
                        return out
        return out
