"""Sincronización con GitHub BBVA y estado local.

Por cada repositorio: ramas, rama base de producción (master/main), PRs
recientes y ejecuciones de Actions de los últimos días. Por cada rama de
proyecto: qué trae que no esté en producción (commits y ficheros, con la API
de comparar) y los DPs de sus ejecuciones. Lo caro se cachea por SHA o por
ejecución, así que una sincronización sin cambios casi no gasta cuota.
"""

import datetime as dt
import fnmatch
import re
import threading
import time
import traceback
import urllib.parse
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

from .clasificar import buscar_dps, clave_version, componentes, feature_de_rama, features_en, version_release
from .config import escribir_json, leer_json
from .ghe import Cliente, ErrorCuota, ErrorGHE, api_de_host

POOL_REPOS = 6
POOL_RAMAS = 4
POOL_DETALLE = 8
RUNS_POR_RAMA = 10      # ejecuciones en las que se busca el DP en una release
RUNS_POR_FEATURE = 2    # y en una rama de feature (solo las últimas)
RESERVA_CUOTA = 300     # la sincronización para antes y deja estas llamadas para navegar


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


def cliente_bbva(cfg, reserva=0):
    b = cfg["bbva"]
    return Cliente(b.get("api") or api_de_host(b.get("host")), b.get("token"), b.get("proxy"), b.get("ca"),
                   transporte=b.get("transporte"), reserva=reserva)


def _forma(url):
    """La forma de una llamada sin servidor ni nombres: /repos/…/actions/runs/N/jobs."""
    p = urllib.parse.urlparse(url or "").path
    p = re.sub(r"/repos/[^/]+/[^/]+", "/repos/…", p)
    p = re.sub(r"/(orgs|users)/[^/]+", r"/\1/…", p)
    return re.sub(r"/[0-9a-f]{7,40}(\.\.\.[0-9a-f]{7,40})?(?=/|$)", "/SHA", re.sub(r"/\d+(?=/|$)", "/N", p)) or "?"


def _repo_de_clave(k):
    """Repositorio de una clave de caché («repo|base|sha» o «repo#run#intento»)."""
    return k.replace("#", "|").split("|")[0]


def ficheros_reales(info):
    """Los ficheros de un DP que de verdad cambian frente a producción (sin los que ya son iguales)."""
    return [f for f in info.get("ficheros") or [] if not f.get("igualProduccion")]


# Una clave de Jira (PROYECTO-123) que no sea parte de otra.
RE_CLAVE_JIRA = re.compile(r"(?<![A-Za-z0-9_-])([A-Z][A-Z0-9_]{1,15}-\d{1,7})(?![A-Za-z0-9])")


class Monitor:
    def __init__(self, config):
        self.cfg = config
        self.ruta = config.dir / "estado.json"
        e = leer_json(self.ruta, {}) or {}
        self.repos = e.get("repos", {})
        self.ramas = e.get("ramas", {})
        self.cache_compare = e.get("cacheCompare", {})
        self.cache_runs = e.get("cacheRuns", {})
        self.dps_info = e.get("dpsInfo", {})  # "repo|DP" -> DP con sus ficheros, congelado al detectarlo
        self.manuales = e.get("dpsManuales", {})
        self.borradores = e.get("borradores", {})
        self.etags = e.get("etags", {})
        # Jira: clave citada (historia) -> su feature (Feature Link). Con ella, la feature de una rama sale de las
        # claves de su nombre o de sus commits aunque sean historias.
        self.mapa_feature = e.get("mapaFeature", {})
        self.sincro = e.get("sincro") or {"estado": "nunca"}
        self.ultima_completa = e.get("ultimaCompleta")  # None: la primera carga todavía no ha terminado
        if self.sincro.get("estado") == "en curso":  # la app se cerró a medias
            self.sincro["estado"] = "interrumpida"
        self.cuota = {}
        self._cerrojo = threading.RLock()
        self._despertar = threading.Event()
        self._en_curso = False
        self.despues_de_sincronizar = None  # p. ej. publicar los DPs nuevos en pases-datos

    def _anotar(self, texto):
        """Una línea en sincro.log (carpeta de datos), para ver qué ha pasado sin depurar.
        Solo cifras y tipos de llamada: ni nombres de repositorios ni código."""
        try:
            ruta = self.cfg.dir / "sincro.log"
            if ruta.exists() and ruta.stat().st_size > 200_000:
                ruta.replace(ruta.with_name("sincro.log.1"))
            with open(ruta, "a", encoding="utf-8") as f:
                f.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), texto))
        except OSError:
            pass

    # ── persistencia ────────────────────────────────────────────────────────
    def guardar(self):
        with self._cerrojo:
            escribir_json(self.ruta, {
                "repos": dict(self.repos), "ramas": dict(self.ramas), "cacheCompare": dict(self.cache_compare),
                "cacheRuns": dict(self.cache_runs), "dpsInfo": self.dps_info, "dpsManuales": self.manuales, "borradores": self.borradores,
                # Copia: los hilos de la sincronización añaden ETags sin el cerrojo (dict() copia de una vez).
                "etags": dict(self.etags), "sincro": dict(self.sincro), "ultimaCompleta": self.ultima_completa,
                "mapaFeature": dict(self.mapa_feature),
            })

    # ── bucle en segundo plano ──────────────────────────────────────────────
    def arrancar(self):
        threading.Thread(target=self._bucle, name="sincro", daemon=True).start()

    def _bucle(self):
        # Si se cerró en pausa por la cuota, al abrir espera a que vuelva (salvo que se pulse Actualizar).
        if self.sincro.get("estado") == "pausada" and (self.sincro.get("reanudaEpoch") or 0) > time.time():
            self._despertar.wait(self.sincro["reanudaEpoch"] - time.time() + 30)
            self._despertar.clear()
        while True:
            if self.cfg.configurado():
                try:
                    self.sincronizar()
                except Exception:  # nunca tumbar el hilo
                    traceback.print_exc()
            espera = max(2, int(self.cfg.get()["bbva"].get("refrescoMin") or 10)) * 60
            if self.sincro.get("estado") == "pausada" and self.sincro.get("reanudaEpoch"):
                espera = max(60, self.sincro["reanudaEpoch"] - time.time() + 30)  # sigue en cuanto vuelve la cuota
            self._despertar.wait(espera)
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
        cli = cliente_bbva(cfg, RESERVA_CUOTA)
        cli.etags = self.etags
        try:
            self._via = "organización"
            repos = self._descubrir(cli, b)
            self._anotar("inicio: %d repositorios (vía %s); cuota restante %s" % (len(repos), self._via, cli.restante))
            # Los que tienen cambios más recientes, primero: si se acaba la cuota, lo que queda es lo que menos se mueve.
            repos.sort(key=lambda r: r.get("pushed_at") or "", reverse=True)
            self._progreso(fase="Leyendo ramas y ejecuciones", repos=[0, len(repos)])
            nuevos_repos, nuevas_ramas, errores = {}, {}, []
            usadas_compare, usadas_runs, al_dia = set(), set(), set()
            hechos = [0]
            parar = threading.Event()
            cuota = [None]

            def anteriores(r, error=None):
                """Lo de la sincronización anterior (si la hay) de un repo que no se ha podido leer ahora."""
                full = r["full_name"]
                info = dict(self.repos.get(full) or {"nombre": full, "url": r.get("html_url", ""),
                                                     "propiedades": r.get("_propiedades") or {}, "lenguaje": r.get("language") or "",
                                                     "temas": r.get("topics") or [], "descripcion": (r.get("description") or "")[:200]})
                info["error"] = error
                info["pendiente"] = error is None
                return info, {k: v for k, v in self.ramas.items() if v.get("repo") == full}

            def un_repo(r):
                full = r["full_name"]
                if parar.is_set():  # sin cuota: se queda como estaba y se lee en la próxima
                    info, ramas = anteriores(r)
                    uc = ur = set()
                else:
                    try:
                        info, ramas, uc, ur = self._repo(cli, cfg, r)
                        with self._cerrojo:
                            al_dia.add(full)
                    except ErrorCuota as e:
                        parar.set()
                        if cuota[0] is None:
                            cuota[0] = e
                        info, ramas = anteriores(r)
                        uc = ur = set()
                    except ErrorGHE as e:
                        info, ramas = anteriores(r, e.como_dict())
                        uc = ur = set()
                        errores.append({"repo": full, **e.como_dict()})
                with self._cerrojo:
                    nuevos_repos[full] = info
                    nuevas_ramas.update(ramas)
                    usadas_compare.update(uc)
                    usadas_runs.update(ur)
                    hechos[0] += 1
                    self.sincro["repos"] = [len(al_dia), len(repos)]
                    self.cuota = cli.estado_cuota()
                    if full in al_dia:  # se ve en cuanto está leído, sin esperar al resto
                        self.repos[full] = info
                        self.ramas = {k: v for k, v in self.ramas.items() if v.get("repo") != full}
                        self.ramas.update(ramas)

            with ThreadPoolExecutor(POOL_REPOS) as ex:
                list(ex.map(un_repo, repos))

            completa = not parar.is_set()
            self._progreso(fase="Buscando DPs nuevos")
            self._actualizar_dps(cli, cfg, nuevas_ramas if completa else {k: v for k, v in nuevas_ramas.items() if v.get("repo") in al_dia})
            with self._cerrojo:
                self.repos = nuevos_repos
                self.ramas = nuevas_ramas
                # Lo de los repos que no se han leído ahora se guarda: es lo que ya está pagado.
                self.cache_compare = {k: v for k, v in self.cache_compare.items() if k in usadas_compare or _repo_de_clave(k) not in al_dia}
                self.cache_runs = {k: v for k, v in self.cache_runs.items() if k in usadas_runs or _repo_de_clave(k) not in al_dia}
                if completa:
                    self.etags = {k: v for k, v in cli.etags.items() if k in cli.usadas}
                    self.ultima_completa = _ahora()
                else:
                    self.etags = cli.etags
                self.cuota = cli.estado_cuota()
                self.sincro = {"estado": "ok" if not errores else "con errores", "fin": _ahora(),
                               "inicio": self.sincro.get("inicio"), "segundos": round(time.time() - inicio, 1),
                               "repos": [len(al_dia), len(repos)], "ramas": len(nuevas_ramas), "errores": errores,
                               "llamadas": cli.llamadas, "ahorradas": cli.ahorradas}
                if not completa:
                    reinicio = cuota[0].reinicio or int(time.time()) + 3600
                    self.sincro["pausaPor"] = _forma(cuota[0].url)
                    self.sincro.update(estado="pausada", reanudaEpoch=reinicio,
                                       reanuda=dt.datetime.fromtimestamp(reinicio, dt.timezone.utc).isoformat().replace("+00:00", "Z"))
        except ErrorCuota as e:  # ni siquiera se ha podido ver la lista de repositorios
            with self._cerrojo:
                reinicio = e.reinicio or int(time.time()) + 3600
                self.sincro = {"estado": "pausada", "fin": _ahora(), "segundos": round(time.time() - inicio, 1), "pausaPor": _forma(e.url),
                               "repos": [0, len(self.repos)], "errores": [], "reanudaEpoch": reinicio,
                               "reanuda": dt.datetime.fromtimestamp(reinicio, dt.timezone.utc).isoformat().replace("+00:00", "Z")}
                self.cuota = cli.estado_cuota()
        except ErrorGHE as e:
            with self._cerrojo:
                self.sincro = {"estado": "error", "fin": _ahora(), "error": e.como_dict(),
                               "segundos": round(time.time() - inicio, 1)}
                self.cuota = cli.estado_cuota()
        finally:
            self._en_curso = False
            self.guardar()
            sc = self.sincro
            self._anotar("fin: %s; al día %s; %s llamadas (%s sin coste); cuota restante %s%s%s%s" % (
                sc.get("estado"), "/".join(str(x) for x in sc.get("repos") or []), cli.llamadas, cli.ahorradas, cli.restante,
                "; sigue a las " + time.strftime("%H:%M", time.localtime(sc["reanudaEpoch"])) if sc.get("reanudaEpoch") else "",
                "; paró en " + sc["pausaPor"] if sc.get("pausaPor") else "",
                "; error: " + (sc.get("error") or {}).get("mensaje", "") if sc.get("estado") == "error" else
                "; %d repos con error" % len(sc.get("errores") or []) if sc.get("errores") else ""))
        if self.despues_de_sincronizar:
            try:
                self.despues_de_sincronizar()
            except Exception:
                traceback.print_exc()

    def _propiedades_org(self, cli, org, filtro):
        """Propiedades personalizadas de los repos de la organización que cumplen
        `filtro` (la misma búsqueda que en la web: props.uuaa:KYTL0000).
        -> {repo: {propiedad: valor}}, o None si este GitHub no tiene esa API."""
        try:
            lista = cli.paginar("orgs/%s/properties/values" % _q(org), {"repository_query": filtro} if filtro else {},
                                max_paginas=50)
        except ErrorCuota:
            raise
        except ErrorGHE as e:
            if e.estado in (403, 404, 410, 422):
                return None
            raise
        out = {}
        for x in lista or []:
            props = {}
            for pr in x.get("properties") or []:
                v = pr.get("value")
                if isinstance(v, list):
                    v = ", ".join(str(y) for y in v)
                if v not in (None, "") and pr.get("property_name"):
                    props[pr["property_name"]] = str(v)
            if x.get("repository_full_name"):
                out[x["repository_full_name"]] = props
        return out

    def _repos_con_filtro(self, cli, org, filtro):
        """Repos de `org` que cumplen `filtro`, con sus propiedades."""
        props = self._propiedades_org(cli, org, filtro)
        self._via = "propiedades" if props is not None else "búsqueda"
        if props is not None:
            def detalle(full):
                try:
                    return cli.get("repos/" + full)[0]
                except ErrorCuota:
                    raise
                except ErrorGHE as e:
                    if e.estado in (403, 404):
                        return None  # sin acceso a ese repo
                    raise
            with ThreadPoolExecutor(POOL_DETALLE) as ex:
                lista = [r for r in ex.map(detalle, sorted(props)) if r]
            for r in lista:
                r["_propiedades"] = props.get(r["full_name"], {})
            return lista
        # GitHub sin la API de propiedades: la búsqueda de repositorios entiende la misma consulta.
        try:
            lista = cli.paginar("search/repositories", {"q": "org:%s %s" % (org, filtro)}, max_paginas=10, clave="items")
        except ErrorGHE as e:
            if e.estado == 422:
                raise ErrorGHE("GitHub BBVA no entiende el filtro de repositorios «%s»." % filtro, e.estado, e.url,
                               "Revísalo en Ajustes → Conexión: es lo mismo que se escribe en el buscador de repositorios de la organización.")
            raise
        return lista

    def _descubrir(self, cli, b):
        vistos = {}
        yo = None
        filtro = str(b.get("filtroRepos") or "").strip()
        for org in b.get("organizaciones") or []:
            org = str(org).strip().strip("/")
            if not org:
                continue
            if filtro:
                for r in self._repos_con_filtro(cli, org, filtro):
                    vistos[r["full_name"]] = r
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
                "error": None, "propiedades": r.get("_propiedades") or {}, "lenguaje": r.get("language") or "",
                "temas": r.get("topics") or [], "descripcion": (r.get("description") or "")[:200]}

        lista = cli.paginar("repos/%s/branches" % full, max_paginas=30)
        shas = {x["name"]: x["commit"]["sha"] for x in lista}
        candidatas = [(b.get("basesRepo") or {}).get(full), b.get("baseProduccion"), "master", "main", r.get("default_branch")]
        base = next((c for c in candidatas if c and c in shas), None)
        base_sha = shas.get(base)
        info["base"] = base
        info["nRamas"] = len(shas)

        solo = b.get("soloRamasDeProyecto", True)
        patron = b.get("patronRama")
        p_rel = b.get("patronRelease")
        elegidas = [n for n in shas if n != base and (feature_de_rama(n, patron) or version_release(n, p_rel))]
        # De las releases, solo las más recientes: las antiguas ya están en producción y leerlas gasta cuota.
        n_rel = int(b.get("releasesPorRepo") or 3)
        rels = sorted((n for n in elegidas if version_release(n, p_rel)), key=lambda n: clave_version(version_release(n, p_rel)), reverse=True)
        viejas = set(rels[n_rel:])
        elegidas = [n for n in elegidas if n not in viejas]

        # PRs recientes (una página): la más reciente por rama.
        pr_de = {}
        pr_hacia = defaultdict(list)  # rama destino -> ramas que se han mezclado en ella por PR
        try:
            prs = cli.get("repos/%s/pulls" % full, {"state": "all", "per_page": 100, "sort": "updated", "direction": "desc"})[0]
        except ErrorCuota:
            raise
        except ErrorGHE:
            prs = []
        for p in prs or []:
            ref = (p.get("head") or {}).get("ref")
            if ref and p.get("merged_at"):
                pr_hacia[(p.get("base") or {}).get("ref")].append(ref)
            if ref and ref not in pr_de:
                estado = "mergeada" if p.get("merged_at") else ("abierta" if p.get("state") == "open" else "cerrada")
                pr_de[ref] = {"numero": p.get("number"), "estado": estado, "url": p.get("html_url"),
                              "titulo": (p.get("title") or "")[:160], "borrador": bool(p.get("draft")),
                              "destino": (p.get("base") or {}).get("ref")}

        # Ejecuciones de Actions del periodo, agrupadas por rama.
        try:
            runs = cli.paginar("repos/%s/actions/runs" % full, {"created": ">=" + desde}, max_paginas=5, clave="workflow_runs")
        except ErrorCuota:
            raise
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
            except ErrorCuota:
                raise
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
            x = self._rama(cli, cfg, full, url_repo, n, shas[n], base, base_sha, pr_de.get(n),
                           runs_de.get(n, []), usadas_compare, usadas_runs)
            v = version_release(n, p_rel)
            x["release"] = v
            if v:  # una release es una subida: qué features lleva (ramas mezcladas y mensajes de commit)
                x["featuresRaw"] = features_en(pr_hacia.get(n, []) + [c.get("mensaje") for c in x["commits"]], patron)
            self._resolver_feature(x)
            return x

        if not solo:
            # También las ramas sin el código del proyecto en el nombre (su proyecto sale de los commits): primero
            # las que tienen PR o ejecuciones recientes, con un tope por repositorio para no gastar cuota.
            ya = set(elegidas) | viejas
            resto = [n for n in shas if n != base and n not in ya]
            resto.sort(key=lambda n: (0 if n in pr_de else 1 if n in runs_de else 2, n))
            elegidas = elegidas + resto[:int(b.get("maxRamasSinCodigo") or 40)]

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
        except ErrorCuota:
            raise
        except ErrorGHE as e:
            prev = self.ramas.get(rid) or {}
            comp = {k: prev.get(k) for k in ("ahead", "behind", "commits", "ficheros", "truncado", "cabeza")}
            out["error"] = e.como_dict()
        out.update(comp)
        out["commits"] = out.get("commits") or []
        out["featureRama"] = out["feature"]
        # Claves de Jira de los mensajes (sin los DPs): features o historias; Jira dice de qué feature es cada historia.
        p_dp = b.get("patronDP") or ""
        cuenta = Counter(k for c in out["commits"]
                         for k in set(RE_CLAVE_JIRA.findall(re.sub(p_dp, " ", c.get("mensaje") or "") if p_dp else c.get("mensaje") or "")))
        out["clavesCommits"] = [[k, n] for k, n in cuenta.most_common(12)]
        out["ficheros"] = out.get("ficheros") or []
        out["mergeada"] = out.get("ahead") == 0 and bool(base_sha)
        out["runs"] = self._runs(cli, cfg, full, n, runs, usadas_runs, es_release=bool(version_release(n, b.get("patronRelease"))))
        return out

    def _runs(self, cli, cfg, full, rama, runs, usadas_runs, es_release=False):
        runs = sorted(runs, key=lambda x: x.get("created_at") or "", reverse=True)
        out = []
        cuantas = RUNS_POR_RAMA if es_release else RUNS_POR_FEATURE
        for i, x in enumerate(runs[:25]):
            res = {"dps": [], "fuente": ""}
            if i < cuantas:
                clave = "%s#%s#%s" % (full, x.get("id"), x.get("run_attempt") or 1)
                usadas_runs.add(clave)
                res = self.cache_runs.get(clave)
                if res is None and x.get("status") == "completed" and x.get("conclusion") not in ("success", None):
                    res = {"dps": [], "fuente": "", "final": True}  # una ejecución fallida no genera DP: no se lee
                    with self._cerrojo:
                        self.cache_runs[clave] = res
                if res is None:
                    res = self._dps_run(cli, cfg, full, x, logs=es_release)
                    if res.get("final"):
                        with self._cerrojo:
                            self.cache_runs[clave] = res
            out.append({"id": x.get("id"), "nombre": x.get("name") or "", "titulo": (x.get("display_title") or "")[:160],
                        "estado": x.get("status"), "conclusion": x.get("conclusion"), "fecha": x.get("created_at"),
                        "url": x.get("html_url"), "sha": x.get("head_sha"), "evento": x.get("event"),
                        "dps": res.get("dps") or [], "fuenteDP": res.get("fuente") or "", "errorDP": res.get("error")})
        return out

    def _dps_run(self, cli, cfg, full, run, logs=True):
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

        def leer_check(chk, url):
            o = chk.get("output") or {}
            anadir(buscar_dps("\n".join([chk.get("name") or "", o.get("title") or "", o.get("summary") or "", o.get("text") or ""]), patron), "resumen")
            if o.get("annotations_count") and url:
                try:
                    anns = cli.get(url.rstrip("/") + "/annotations", {"per_page": 100}, etag=False)[0] or []
                except ErrorCuota:
                    raise
                except ErrorGHE:
                    anns = []
                anadir(buscar_dps("\n".join("%s %s" % (a.get("title") or "", a.get("message") or "") for a in anns), patron), "anotación")

        def pedir_jobs():
            return (cli.get("repos/%s/actions/runs/%s/jobs" % (full, run["id"]), {"per_page": 100})[0] or {}).get("jobs", [])

        try:
            # Una sola llamada: todos los check-runs de la ejecución, con su resumen (lo que se ve en Summary).
            chks, jobs = None, None
            if run.get("check_suite_id"):
                try:
                    chks = (cli.get("repos/%s/check-suites/%s/check-runs" % (full, run["check_suite_id"]), {"per_page": 100},
                                    etag=False)[0] or {}).get("check_runs")
                except ErrorCuota:
                    raise
                except ErrorGHE:
                    chks = None
            if chks is not None:
                for chk in chks:
                    leer_check(chk, chk.get("url") or ("repos/%s/check-runs/%s" % (full, chk.get("id"))))
            else:  # sin check suite: job a job (pasos, resumen y anotaciones)
                jobs = pedir_jobs()
                for jb in jobs:
                    anadir(buscar_dps("\n".join([jb.get("name") or ""] + [x.get("name") or "" for x in jb.get("steps") or []]), patron), "pasos")
                    cr = jb.get("check_run_url") or ("repos/%s/check-runs/%s" % (full, jb["id"]))
                    try:
                        chk = cli.get(cr, etag=False)[0] or {}
                    except ErrorCuota:
                        raise
                    except ErrorGHE:
                        chk = {}
                    leer_check(chk, cr)
            if not encontrados and logs and b.get("leerLogs", True) and jobs is None:
                jobs = pedir_jobs()
                for jb in jobs:
                    anadir(buscar_dps("\n".join([jb.get("name") or ""] + [x.get("name") or "" for x in jb.get("steps") or []]), patron), "pasos")
            if not encontrados and logs and b.get("leerLogs", True):
                for jb in jobs or []:
                    if jb.get("status") != "completed":
                        continue
                    try:
                        anadir(buscar_dps(cli.texto("repos/%s/actions/jobs/%s/logs" % (full, jb["id"])), patron), "log")
                    except ErrorGHE as e:
                        if e.estado not in (404, 410):  # 404/410: log caducado, no hay nada que leer
                            raise
            return {"dps": encontrados, "fuente": fuente, "final": True}
        except ErrorCuota:
            raise
        except ErrorGHE as e:
            return {"dps": [], "fuente": "", "final": False, "error": str(e)}

    # ── DPs ─────────────────────────────────────────────────────────────────
    def _comparar_dp(self, cli, repo, frente_sha, dp_sha, arboles):
        """Lo que trae el código del DP frente a producción (frente_sha), comprobado de tres formas:
        - la comparación de GitHub (frente...DP), que parte del ancestro común;
        - el contenido: un fichero del DP idéntico al de producción no es un cambio (squash, cherry-pick,
          una release anterior ya desplegada con otros commits);
        - al revés (DP...frente): lo que producción tiene y el DP no lleva (un hotfix sin bajar a la release)."""
        d = cli.get("repos/%s/compare/%s...%s" % (repo, frente_sha, dp_sha), etag=False)[0] or {}
        ficheros = [{"ruta": f.get("filename"), "estado": f.get("status"), "mas": f.get("additions", 0),
                     "menos": f.get("deletions", 0), "antes": f.get("previous_filename"), "blob": f.get("sha")}
                    for f in d.get("files") or []]
        out = {"ahead": d.get("ahead_by") or 0, "behind": d.get("behind_by") or 0, "estadoGH": d.get("status") or "",
               "mergeBase": ((d.get("merge_base_commit") or {}).get("sha") or "")[:40],
               "ficheros": ficheros, "commits": [_commit_ligero(c) for c in d.get("commits") or []][-150:],
               "truncado": len(ficheros) >= 300 or (d.get("total_commits") or 0) > len(d.get("commits") or [])}
        if not out["ahead"]:
            return out
        # Contenido: el árbol de producción (una llamada por commit de producción, compartida por todos sus DPs).
        if frente_sha not in arboles:
            try:
                t = cli.get("repos/%s/git/trees/%s" % (repo, frente_sha), {"recursive": "1"}, etag=False)[0] or {}
                arboles[frente_sha] = None if t.get("truncated") else {x["path"]: x.get("sha") for x in t.get("tree") or [] if x.get("type") == "blob"}
            except ErrorCuota:
                raise
            except ErrorGHE:
                arboles[frente_sha] = None
        arbol = arboles[frente_sha]
        out["comprobadoContenido"] = arbol is not None
        if arbol is not None:
            for f in ficheros:
                en_prod = arbol.get(f["ruta"])
                igual = en_prod is None if f["estado"] == "removed" else bool(f.get("blob")) and en_prod == f["blob"]
                if igual:
                    f["igualProduccion"] = True
        # Al revés: lo que está en producción y el DP no lleva.
        if out["behind"]:
            try:
                r = cli.get("repos/%s/compare/%s...%s" % (repo, dp_sha, frente_sha), etag=False)[0] or {}
                propios = {f["ruta"] for f in ficheros if not f.get("igualProduccion")}
                rutas = [f.get("filename") for f in r.get("files") or []]
                out["soloProduccion"] = {"commits": r.get("ahead_by") or 0, "ficheros": rutas[:300],
                                         "enComun": sorted(propios & set(rutas))[:100],
                                         "mensajes": [(c.get("commit") or {}).get("message", "").split("\n")[0][:140]
                                                      for c in (r.get("commits") or [])[-10:]]}
            except ErrorCuota:
                raise
            except ErrorGHE:
                pass
        return out

    def _features_dp(self, commits, rama):
        """Las features que lleva el DP según sus propios commits (no según cómo esté la release hoy)."""
        if not rama.get("release"):
            return [rama["feature"]] if rama.get("feature") else []
        patron = self.cfg.get()["bbva"].get("patronRama") or ""
        mapa, out = self.mapa_feature, []
        for c in commits or []:
            for k in RE_CLAVE_JIRA.findall(c.get("mensaje") or ""):
                if k in mapa or (patron and re.fullmatch(patron, k)):
                    f = mapa.get(k, k)
                    if f not in out:
                        out.append(f)
        return out

    def _actualizar_dps(self, cli, cfg, ramas):
        """DPs: lo que trae cada uno frente a producción. Mientras su código no está en producción se recalcula
        cada vez que producción cambia (así no se cuela nada que ya esté desplegado); cuando entra en
        producción se congela con lo último calculado (después ya no se vería)."""
        releases = defaultdict(list)
        base_de = {}
        for r in ramas.values():
            if r.get("release"):
                releases[r["repo"]].append(r)
            if r.get("baseSha"):
                base_de[r["repo"]] = (r.get("base"), r["baseSha"])
        trabajo, vistos = [], set()
        for r in ramas.values():
            for x in r.get("runs") or []:
                for cod in x.get("dps") or []:
                    k = "%s|%s" % (r["repo"], cod)
                    if k in vistos or not x.get("sha"):
                        continue
                    vistos.add(k)
                    prev = self.dps_info.get(k)
                    base = base_de.get(r["repo"])
                    if prev is None or (not prev.get("congelado") and base and prev.get("frenteSha") != base[1]
                                        and prev.get("frente") == base[0]):
                        trabajo.append((k, r, x, cod, prev))
        arboles = {}

        def calcular(t):
            k, r, x, cod, prev = t
            base, base_sha = base_de.get(r["repo"], (r.get("base"), r.get("baseSha")))
            info = dict(prev) if prev else {
                "cod": cod, "repo": r["repo"], "rama": r["rama"], "release": r.get("release") or "",
                "sha": x["sha"], "run": x.get("id"), "fecha": x.get("fecha"), "url": x.get("url"),
                "conclusion": x.get("conclusion"), "fuente": x.get("fuenteDP"), "flujo": x.get("nombre"), "detectado": _ahora()}
            try:
                d = self._comparar_dp(cli, r["repo"], base_sha, x["sha"], arboles) if base_sha else None
                if d and d["ahead"]:
                    info.update(d, frente=base, frenteSha=base_sha, calculado=_ahora(), congelado=False, yaEnProduccion=False)
                    info.pop("ahead", None)
                elif prev is not None and prev.get("ficheros") is not None and prev.get("frente") == base:
                    # Ya está en producción: se queda con lo último calculado antes de entrar.
                    info.update(congelado=True, enProduccion=_ahora(), yaEnProduccion=not prev.get("ficheros"))
                else:
                    # Ya estaba en producción la primera vez que se vio: frente a la release anterior.
                    info.update(frente=base, frenteSha=base_sha, ficheros=[], commits=[], truncado=False, congelado=True)
                    previas = sorted((o for o in releases[r["repo"]] if r.get("release") and clave_version(o["release"]) < clave_version(r["release"])),
                                     key=lambda o: clave_version(o["release"]))
                    if previas:
                        ant = previas[-1]
                        d = self._comparar_dp(cli, r["repo"], ant["sha"], x["sha"], arboles)
                        info.update({k2: v for k2, v in d.items() if k2 != "ahead"}, frente=ant["rama"], frenteSha=ant["sha"])
                    info["yaEnProduccion"] = not info.get("ficheros")
                    info["calculado"] = _ahora()
            except ErrorGHE:  # también la cuota: se reintenta en la próxima sincronización
                return None
            return k, info

        with ThreadPoolExecutor(POOL_RAMAS) as ex:
            for res in ex.map(calcular, trabajo):
                if res:
                    with self._cerrojo:
                        self.dps_info[res[0]] = res[1]
        with self._cerrojo:
            for info in self.dps_info.values():
                r = ramas.get("%s:%s" % (info["repo"], info["rama"])) or {"feature": "", "release": info.get("release")}
                info["features"] = self._features_dp(info.get("commits"), r) or info.get("features") or []

    def dps(self):
        """Todos los DPs conocidos, con sus componentes según las reglas actuales."""
        cfg = self.cfg.get()
        reglas, subidas = cfg.get("reglas") or [], cfg.get("reposSubida") or {}
        with self._cerrojo:
            infos = [dict(v) for v in self.dps_info.values()]
        out = []
        for i in infos:
            comps, _ = componentes(ficheros_reales(i), reglas, subidas.get(i["repo"], ""))
            i["nIguales"] = len([f for f in i.get("ficheros") or [] if f.get("igualProduccion")])
            i["componentes"] = [{"nombre": c["nombre"], "tipo": c["tipo"], "subida": c["subida"], "borrado": c["borrado"],
                                 "nFich": len(c["ficheros"])} for c in comps]
            i["nFich"] = len(ficheros_reales(i))
            i["mas"] = sum(f.get("mas") or 0 for f in ficheros_reales(i))
            i["menos"] = sum(f.get("menos") or 0 for f in ficheros_reales(i))
            sp = i.pop("soloProduccion", None) or {}
            i["soloProd"] = {"commits": sp.get("commits") or 0, "enComun": len(sp.get("enComun") or [])}
            i.pop("ficheros", None)
            i.pop("commits", None)
            out.append(i)
        out.sort(key=lambda x: x.get("fecha") or "", reverse=True)
        return out

    def dp(self, repo, cod):
        with self._cerrojo:
            i = self.dps_info.get("%s|%s" % (repo, cod))
            i = dict(i) if i else None
        if not i:
            return None
        cfg = self.cfg.get()
        comps, ign = componentes(ficheros_reales(i), cfg.get("reglas") or [], (cfg.get("reposSubida") or {}).get(repo, ""))
        i["componentes"], i["ignorados"] = comps, ign
        return i

    def marcar_publicado(self, clave, info):
        with self._cerrojo:
            if clave in self.dps_info:
                self.dps_info[clave]["publicado"] = info

    # ── feature de cada rama ────────────────────────────────────────────────
    def _resolver_feature(self, r):
        """La feature de la rama: la clave de su nombre o, si no tiene, la más citada en sus commits; si esa clave
        es una historia, su feature (mapa de Jira). En una release, las features que lleva."""
        if r.get("esBase"):
            return r
        mapa = self.mapa_feature
        if "featureRama" not in r:  # datos guardados por una versión anterior
            r["featureRama"] = r.get("feature") or ""
        f = r["featureRama"]
        f = mapa.get(f, f) if f else ""
        integracion = self.cfg.get()["bbva"].get("patronIntegracion") or ""
        if not f and not r.get("release") and not (integracion and re.search(integracion, r.get("rama") or "", re.I)):
            cuenta = Counter()
            patron = self.cfg.get()["bbva"].get("patronRama") or ""
            for k, n in r.get("clavesCommits") or []:
                if k in mapa or (patron and re.fullmatch(patron, k)):
                    cuenta[mapa.get(k, k)] += n
            if cuenta:
                top, n = cuenta.most_common(1)[0]
                # Solo si una feature domina: una rama que mezcla muchas (de integración) no es de ningún proyecto.
                f = top if n >= 0.6 * sum(cuenta.values()) else ""
        r["feature"] = f
        if r.get("release"):
            if "featuresRaw" not in r:
                r["featuresRaw"] = list(r.get("features") or [])
            r["features"] = list(dict.fromkeys(mapa.get(k, k) for k in r["featuresRaw"]))
        return r

    def aplicar_mapa_feature(self, mapa):
        """Jira ha leído qué historia cuelga de qué feature: se recalcula la feature de todas las ramas."""
        with self._cerrojo:
            if mapa == self.mapa_feature:
                return False
            self.mapa_feature = dict(mapa)
            for r in self.ramas.values():
                self._resolver_feature(r)
        self.guardar()
        return True

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
            sincro = dict(self.sincro, enCurso=self._en_curso, primeraCarga=not self.ultima_completa)
            cuota = dict(self.cuota)
        ramas, proys = [], {}
        for r in ramas_src:
            comps, _ = componentes(r.get("ficheros"), reglas, subidas.get(r["repo"], ""))
            x = {k: v for k, v in r.items() if k != "ficheros"}
            x["nComp"], x["nFich"] = len(comps), len(r.get("ficheros") or [])
            x["dps"] = self.dps_de_rama(r)
            ramas.append(x)
            if r.get("esBase") or r.get("release"):
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
