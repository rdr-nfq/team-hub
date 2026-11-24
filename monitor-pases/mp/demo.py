"""GitHub simulado para `--demo` y para las pruebas: datos inventados
(organización «equipo-demo», proyectos CIBRDR ficticios), fechas relativas a
hoy. Imita la API real en lo que usa la app: paginación con Link, ETag/304,
comparar ramas, PRs, Actions, check-runs con resumen y anotaciones, logs con
redirección a un almacén que rechaza el token, y contents (para la subida).
"""

import base64
import datetime as dt
import hashlib
import json
import random
import re
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "demo"
ORG = "equipo-demo"

PROYECTOS = {
    "CIBRDR-2311": ("cargador-terceros", "Cargador de terceros"),
    "CIBRDR-2405": ("informe-regulatorio", "Informe regulatorio mensual"),
    "CIBRDR-2442": ("migracion-operaciones", "Migración de operaciones"),
    "CIBRDR-2470": ("alertas-liquidez", "Alertas de liquidez"),
    "CIBRDR-2488": ("simulacro-usuario", None),  # sin nombre en Ajustes: se ve solo el código
}
AUTORES = ["ana-ruiz", "jmartin", "lgarrido", "pnavarro", "ctorres"]

# repo -> (cómo genera el DP, generador de rutas)
REPOS = {
    "rdr-javas": "resumen",
    "rdr-workstation": "anotacion",
    "rdr-objetos-gs": "log",
    "rdr-estaticos": "resumen",
    "rdr-datax": None,
    "rdr-cadenas": None,
    "rdr-aperiodicos": None,
}

CLASES = ["CargadorTerceros", "ValidadorOperacion", "InformeMensual", "ServicioLiquidez", "MapeoSicor", "ProcesoCierre",
          "ConversorDivisa", "ExportadorRegulatorio", "AlertaUmbral", "RepositorioPosiciones"]


def _rutas(repo, rnd, feature):
    slug = PROYECTOS[feature][0].replace("-", "_")
    if repo == "rdr-javas":
        cl = rnd.sample(CLASES, rnd.randint(2, 4))
        out = ["src/main/java/com/equipo/rdr/%s/%s.java" % (slug, c) for c in cl]
        out += ["src/test/java/com/equipo/rdr/%s/%sTest.java" % (slug, cl[0])]
        return out
    if repo == "rdr-workstation":
        m = rnd.choice(["pantalla_alta", "consulta_posiciones", "panel_alertas", "carga_manual"])
        return ["workstation/%s/%s.xml" % (m, m), "workstation/%s/eventos.js" % m, "workstation/%s/estilos.css" % m]
    if repo == "rdr-objetos-gs":
        return ["objetos/%s_%s.sql" % (rnd.choice(["T_RDR", "V_RDR", "P_RDR"]), slug.upper()[:12]) for _ in range(rnd.randint(1, 3))]
    if repo == "rdr-estaticos":
        return ["estaticos/%s/%s" % (slug, f) for f in rnd.sample(["parametros.properties", "literales_es.json", "mapeo.csv"], 2)]
    if repo == "rdr-datax":
        return ["datax/%s_%s.json" % (slug, x) for x in rnd.sample(["ingesta", "transformacion", "salida"], rnd.randint(1, 2))]
    if repo == "rdr-cadenas":
        return ["cadenas/RDR%s%02d.jcl" % (slug.upper()[:3], rnd.randint(1, 40))]
    return ["aperiodicos/%s_recarga.sh" % slug, "README.md"]


def _sha(*partes):
    return hashlib.sha1("|".join(str(p) for p in partes).encode()).hexdigest()


class Datos:
    def __init__(self, semilla=7):
        rnd = random.Random(semilla)
        hoy = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.hoy = hoy
        self.repos = {}
        self.runs = {}  # id -> run
        self.jobs = {}  # id -> job (incluye salida y log)
        self.contenidos = {}  # (repo, ruta) -> {sha, texto}
        run_id, job_id, pr_n, dp_n = [9000], [70000], [1], [48000]

        def cuando(dias, horas=0):
            return (hoy - dt.timedelta(days=dias, hours=horas)).isoformat().replace("+00:00", "Z")

        # Qué proyectos tocan qué repos.
        tocan = {
            "CIBRDR-2311": ["rdr-javas", "rdr-workstation", "rdr-objetos-gs", "rdr-datax"],
            "CIBRDR-2405": ["rdr-javas", "rdr-estaticos", "rdr-cadenas"],
            "CIBRDR-2442": ["rdr-javas", "rdr-objetos-gs", "rdr-aperiodicos", "rdr-workstation"],
            "CIBRDR-2470": ["rdr-workstation", "rdr-estaticos"],
            "CIBRDR-2488": ["rdr-javas", "rdr-datax"],
        }
        for repo, fuente in REPOS.items():
            full = "%s/%s" % (ORG, repo)
            master_sha = _sha(full, "master", 1)
            base_commits = []
            for i in range(rnd.randint(4, 9)):
                d = rnd.randint(0, 40)
                base_commits.append({"sha": _sha(full, "base", i), "fecha": cuando(d, rnd.randint(0, 20)),
                                     "autor": rnd.choice(AUTORES), "mensaje": rnd.choice([
                                         "Merge pull request #%d from %s/hotfix" % (rnd.randint(1, 90), ORG),
                                         "Ajuste de configuración de entornos", "Actualiza versiones de dependencias"])})
            base_commits.sort(key=lambda c: c["fecha"])
            base_commits[-1]["sha"] = master_sha
            ramas = {"master": {"sha": master_sha, "commits": [], "files": [], "behind": 0, "base": True},
                     "develop": {"sha": _sha(full, "develop"), "commits": [], "files": [], "behind": 3}}
            prs, runs = [], []
            for feat, (slug, _) in PROYECTOS.items():
                if repo not in tocan[feat]:
                    continue
                nombre = "feature/%s-%s" % (feat, slug)
                mergeada = (feat == "CIBRDR-2405" and repo == "rdr-cadenas")
                n_commits = 0 if mergeada else rnd.randint(2, 7)
                inicio = rnd.randint(8, 38)
                commits = []
                for i in range(n_commits):
                    d = max(0, inicio - int((inicio / max(1, n_commits)) * i) - rnd.randint(0, 2))
                    commits.append({"sha": _sha(full, nombre, i), "fecha": cuando(d, rnd.randint(0, 9)),
                                    "autor": rnd.choice(AUTORES), "mensaje": rnd.choice([
                                        "%s: alta de componentes" % feat, "%s: corrige validación de importes" % feat,
                                        "%s: ajustes tras revisión" % feat, "%s: pruebas unitarias" % feat,
                                        "%s: renombra campos del informe" % feat, "%s: añade parámetros de entorno" % feat])})
                commits.sort(key=lambda c: c["fecha"])
                files = [] if mergeada else [{"filename": p, "status": rnd.choice(["modified", "modified", "added"]),
                                               "additions": rnd.randint(2, 180), "deletions": rnd.randint(0, 60)}
                                              for p in _rutas(repo, rnd, feat)]
                if files and rnd.random() < 0.15:
                    files[-1]["status"] = "removed"
                sha = commits[-1]["sha"] if commits else master_sha
                ramas[nombre] = {"sha": sha, "commits": commits, "files": files, "behind": rnd.randint(0, 12) if commits else 0}
                # PR
                estado_pr = "merged" if mergeada else rnd.choice(["open", "open", "none"])
                if estado_pr != "none":
                    prs.append({"number": pr_n[0], "title": "%s %s" % (feat, slug.replace("-", " ")),
                                "state": "closed" if estado_pr == "merged" else "open",
                                "merged_at": cuando(2) if estado_pr == "merged" else None, "draft": rnd.random() < 0.2,
                                "html_url": "https://demo.invalid/%s/pull/%d" % (full, pr_n[0]),
                                "head": {"ref": nombre}, "base": {"ref": "master"}, "updated_at": cuando(1)})
                    pr_n[0] += 1
                # Actions
                if fuente and commits:
                    for k in range(rnd.randint(1, 3)):
                        run_id[0] += 1
                        ok = rnd.random() > 0.2 or k == 0
                        dp = None
                        if ok:
                            dp_n[0] += rnd.randint(3, 40)
                            dp = "DP-KYTL-%d" % dp_n[0]
                        rid = run_id[0]
                        run = {"id": rid, "name": "Build y DP", "display_title": commits[-1]["mensaje"],
                               "head_branch": nombre, "head_sha": sha, "status": "completed",
                               "conclusion": "success" if ok else "failure", "run_attempt": 1, "event": "push",
                               "path": ".github/workflows/build-dp.yml",
                               "created_at": cuando(max(0, rnd.randint(0, inicio) - k), rnd.randint(0, 9)),
                               "html_url": "https://demo.invalid/%s/actions/runs/%d" % (full, rid), "_repo": full, "_jobs": []}
                        for jn in ("compilar", "empaquetar"):
                            job_id[0] += 1
                            jid = job_id[0]
                            salida = {"title": None, "summary": None, "text": None, "annotations_count": 0}
                            anns, log = [], "2026-01-01T00:00:00Z ##[group]Run %s\n... pasos de %s ...\n" % (jn, jn)
                            if jn == "empaquetar" and dp:
                                if fuente == "resumen":
                                    salida.update(title="Paquete generado", summary="### Paquete generado\n\n| DP | Estado |\n|---|---|\n| %s | OK |" % dp)
                                elif fuente == "anotacion":
                                    anns = [{"title": "DP", "message": "DP generado: %s" % dp, "annotation_level": "notice"}]
                                    salida["annotations_count"] = 1
                                elif fuente == "log":
                                    log += "2026-01-01T00:00:05Z Paquete creado correctamente\n2026-01-01T00:00:05Z Identificador: %s\n" % dp
                            self.jobs[jid] = {"id": jid, "run_id": rid, "name": jn, "status": "completed",
                                              "conclusion": run["conclusion"], "steps": [{"name": "Checkout"}, {"name": jn.capitalize()}],
                                              "_repo": full, "_salida": salida, "_anns": anns, "_log": log}
                            run["_jobs"].append(jid)
                        self.runs[rid] = run
                        runs.append(run)
            # una rama sin proyecto
            ramas["hotfix/ajuste-entornos"] = {"sha": _sha(full, "hotfix"), "commits": [
                {"sha": _sha(full, "hotfix"), "fecha": cuando(5), "autor": "jmartin", "mensaje": "Ajuste de entornos"}],
                "files": [{"filename": "config/entornos.yml", "status": "modified", "additions": 3, "deletions": 1}], "behind": 1}
            self.repos[full] = {"nombre": repo, "full": full, "ramas": ramas, "prs": prs, "runs": runs,
                                "base_commits": base_commits, "pushed_at": cuando(rnd.randint(0, 5))}


def _commit_json(full, c):
    return {"sha": c["sha"], "html_url": "https://demo.invalid/%s/commit/%s" % (full, c["sha"]),
            "author": {"login": c["autor"]},
            "commit": {"message": c["mensaje"] + "\n\nDetalle del cambio.", "author": {"name": c["autor"], "date": c["fecha"]}}}


def _repo_json(r):
    return {"full_name": r["full"], "name": r["nombre"], "html_url": "https://demo.invalid/" + r["full"],
            "default_branch": "develop", "pushed_at": r["pushed_at"], "archived": False, "private": True,
            "permissions": {"push": True}}


class _H(BaseHTTPRequestHandler):
    datos = None
    puerto = 0
    pedidas = None

    def log_message(self, *a):
        pass

    def _json(self, estado, obj, extra=None):
        cuerpo = json.dumps(obj).encode()
        etag = '"%s"' % hashlib.md5(cuerpo).hexdigest()
        if estado == 200 and self.command == "GET" and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        self.send_response(estado)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("ETag", etag)
        self.send_header("X-RateLimit-Remaining", "4321")
        self.send_header("X-RateLimit-Reset", "1999999999")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def _paginar(self, lista, q, base):
        pp = int(q.get("per_page", 30))
        pg = int(q.get("page", 1))
        trozo = lista[(pg - 1) * pp: pg * pp]
        extra = {}
        if pg * pp < len(lista):
            q2 = dict(q, page=str(pg + 1))
            extra["Link"] = '<http://127.0.0.1:%d%s?%s>; rel="next"' % (self.puerto, base, urllib.parse.urlencode(q2))
        return trozo, extra

    def do_GET(self):
        self._ruta("GET")

    def do_PUT(self):
        self._ruta("PUT")

    def _ruta(self, metodo):
        d = self.datos
        u = urllib.parse.urlparse(self.path)
        p, q = u.path, {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if self.pedidas is not None:
            self.pedidas.append((metodo, p, dict(self.headers)))
        if p.startswith("/blob/"):
            if self.headers.get("Authorization"):
                return self._json(400, {"message": "El almacén no acepta la cabecera Authorization"})
            texto = d.jobs[int(p.rsplit("/", 1)[-1])]["_log"].encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(texto)))
            self.end_headers()
            self.wfile.write(texto)
            return
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self._json(401, {"message": "Bad credentials"})
        if p == "/user":
            return self._json(200, {"login": "usuario-demo"}, {"X-OAuth-Scopes": "repo"})
        m = re.match(r"^/orgs/([^/]+)/repos$", p)
        if m:
            if m.group(1) != ORG:
                return self._json(404, {"message": "Not Found"})
            lista = [_repo_json(r) for r in d.repos.values()]
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, trozo, extra)
        m = re.match(r"^/repos/([^/]+/[^/]+)(/.*)?$", p)
        if not m:
            return self._json(404, {"message": "Not Found"})
        full, resto = m.group(1), m.group(2) or ""
        if metodo == "PUT" or resto.startswith("/contents/"):
            return self._contenidos(metodo, full, resto, q)
        r = d.repos.get(full)
        if not r and resto == "" and full.startswith("rdr-nfq/"):  # repo de NFQ para la subida
            return self._json(200, {"full_name": full, "private": True, "permissions": {"push": True}})
        if not r:
            return self._json(404, {"message": "Not Found"})
        if resto == "":
            return self._json(200, _repo_json(r))
        if resto == "/branches":
            lista = [{"name": n, "commit": {"sha": b["sha"]}} for n, b in r["ramas"].items()]
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, trozo, extra)
        if resto == "/pulls":
            return self._json(200, r["prs"])
        if resto == "/actions/runs":
            lista = [{k: v for k, v in x.items() if not k.startswith("_")} for x in r["runs"]]
            lista.sort(key=lambda x: x["created_at"], reverse=True)
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, {"total_count": len(lista), "workflow_runs": trozo}, extra)
        if resto == "/commits":
            cs = r["base_commits"] if q.get("sha") == "master" else []
            return self._json(200, [_commit_json(full, c) for c in reversed(cs)])
        m = re.match(r"^/commits/([0-9a-f]+)$", resto)
        if m:
            for b in r["ramas"].values():
                for c in b["commits"] + r["base_commits"]:
                    if c["sha"] == m.group(1):
                        return self._json(200, _commit_json(full, c))
            return self._json(200, _commit_json(full, {"sha": m.group(1), "fecha": d.hoy.isoformat(), "autor": "ana-ruiz",
                                                        "mensaje": "Commit"}))
        m = re.match(r"^/compare/([0-9a-f]+)\.\.\.([0-9a-f]+)$", resto)
        if m:
            rama = next((b for b in r["ramas"].values() if b["sha"] == m.group(2)), None)
            if rama is None:
                return self._json(404, {"message": "Not Found"})
            return self._json(200, {"ahead_by": len(rama["commits"]), "behind_by": rama["behind"],
                                    "total_commits": len(rama["commits"]),
                                    "commits": [_commit_json(full, c) for c in rama["commits"]], "files": rama["files"]})
        m = re.match(r"^/actions/runs/(\d+)/jobs$", resto)
        if m:
            run = d.runs[int(m.group(1))]
            jobs = [{"id": j, "name": d.jobs[j]["name"], "status": "completed", "conclusion": d.jobs[j]["conclusion"],
                     "steps": d.jobs[j]["steps"],
                     "check_run_url": "http://127.0.0.1:%d/repos/%s/check-runs/%d" % (self.puerto, full, j)}
                    for j in run["_jobs"]]
            return self._json(200, {"total_count": len(jobs), "jobs": jobs})
        m = re.match(r"^/check-runs/(\d+)(/annotations)?$", resto)
        if m:
            j = d.jobs[int(m.group(1))]
            if m.group(2):
                return self._json(200, j["_anns"])
            return self._json(200, {"id": j["id"], "output": j["_salida"]})
        m = re.match(r"^/actions/jobs/(\d+)/logs$", resto)
        if m:
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:%d/blob/log/%s" % (self.puerto, m.group(1)))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        return self._json(404, {"message": "Not Found"})

    def _contenidos(self, metodo, full, resto, q):
        ruta = urllib.parse.unquote(resto[len("/contents/"):])
        clave = (full, ruta)
        actual = self.datos.contenidos.get(clave)
        if metodo == "GET":
            if not actual:
                return self._json(404, {"message": "Not Found"})
            return self._json(200, {"sha": actual["sha"], "path": ruta})
        n = int(self.headers.get("Content-Length") or 0)
        cuerpo = json.loads(self.rfile.read(n) or b"{}")
        if actual and cuerpo.get("sha") != actual["sha"]:
            return self._json(409, {"message": "sha does not match"})
        texto = base64.b64decode(cuerpo["content"]).decode()
        nuevo = {"sha": _sha(ruta, texto), "texto": texto, "mensaje": cuerpo.get("message")}
        self.datos.contenidos[clave] = nuevo
        url = "https://demo.invalid/%s/blob/%s/%s" % (full, cuerpo.get("branch"), ruta)
        return self._json(201 if not actual else 200, {"content": {"html_url": url, "sha": nuevo["sha"]},
                                                         "commit": {"html_url": "https://demo.invalid/%s/commit/%s" % (full, nuevo["sha"])}})


def arrancar(puerto=0, semilla=7, pedidas=None):
    """Arranca el GitHub simulado en 127.0.0.1. -> (servidor, puerto, datos)"""
    datos = Datos(semilla)
    H = type("H", (_H,), {"datos": datos, "pedidas": pedidas})
    srv = ThreadingHTTPServer(("127.0.0.1", puerto), H)
    H.puerto = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, H.puerto, datos


REGLAS_DEMO = [
    {"patron": r"^\.github/", "ignorar": True},
    {"patron": r"(^|/)(README|CHANGELOG)[^/]*$", "ignorar": True},
    {"patron": r"(^|/)src/test/", "ignorar": True},
    {"patron": r"(?P<nombre>[^/]+)\.java$", "tipo": "Java", "subida": "Java"},
    {"patron": r"^workstation/(?P<nombre>[^/]+)/", "tipo": "Workstation", "subida": "Workstation"},
    {"patron": r"^objetos/(?P<nombre>[^/]+)\.(sql|ddl)$", "tipo": "Objeto GS", "subida": "Paquete Custom"},
    {"patron": r"^estaticos/", "tipo": "Estático", "subida": "Estáticos"},
    {"patron": r"^datax/(?P<nombre>[^/]+)\.json$", "tipo": "DataX", "subida": "DataX"},
    {"patron": r"^cadenas/(?P<nombre>[^/.]+)", "tipo": "Cadena", "subida": "Cadenas"},
    {"patron": r"^aperiodicos/(?P<nombre>[^/.]+)", "tipo": "Aperiódico", "subida": "Aperiódicos"},
]


def config_demo(puerto_ghe):
    return {
        "bbva": {"host": "demo.invalid", "api": "http://127.0.0.1:%d" % puerto_ghe, "token": TOKEN,
                 "organizaciones": [ORG], "refrescoMin": 60, "proxy": "", "ca": ""},
        "nfq": {"host": "github.com", "repo": "", "token": ""},
        "proyectos": {k: v for k, (_, v) in PROYECTOS.items() if v},
        "reglas": REGLAS_DEMO,
    }
