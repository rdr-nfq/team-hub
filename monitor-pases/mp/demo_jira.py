"""Jira simulado para `--demo` y las pruebas (datos inventados, coherentes con
el GitHub simulado de demo.py). Imita lo que usa la app de la API de Jira Data
Center: /rest/api/2/myself, serverInfo, field, search (un subconjunto de JQL),
project/{key}/versions e issue/{key}/remotelink.

- Features: las CIBRDR-… de las ramas. Su SDATOOL está en un enlace entre
  issues, en un enlace remoto o no está.
- Historias: RDR-1xxx, citadas en los mensajes de commit. Cuelgan de su
  feature por «Feature Link» y van a una release por «tech-version».
- Releases (versiones del proyecto RDR): las de las ramas release/x.y.z, salvo
  algunas que aún no existen en Jira (la rama se crea antes).
"""

import datetime as dt
import hashlib
import json
import re
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import demo

TOKEN_MALO = "mal"
CAMPO_FEATURE = "customfield_10008"
CAMPO_TV = "customfield_20500"
RESUMENES = ["Alta de operaciones desde fichero", "Validar fechas obligatorias", "Exportar a CSV", "Revisar redondeos",
             "Nuevo filtro por cartera", "Avisos por umbral", "Ajustes de rendimiento", "Pantalla de consulta",
             "Carga de parámetros", "Corrección de literales", "Conciliación de saldos", "Informe mensual"]
ESTADOS = [("Pendiente", "new"), ("En curso", "indeterminate"), ("En pruebas", "indeterminate"), ("Hecho", "done")]


def _h(*partes):
    return int(hashlib.md5("|".join(map(str, partes)).encode()).hexdigest(), 16)


class DatosJira:
    def __init__(self, datos_gh):
        hoy = dt.date.today()
        todas = {**demo.PROYECTOS, **demo.PROYECTOS_EXTRA}
        self.issues = {}
        self.remotos = {}
        # Versiones de RDR: las de las ramas release (la última de algunos repos aún no está en Jira).
        versiones = {}
        tv_de = {}  # historia -> versión (por las ramas release donde aparece)
        for full, r in datos_gh.repos.items():
            for nombre, rama in r["ramas"].items():
                m = re.match(r"release/(\d+\.\d+\.\d+)$", nombre)
                if not m:
                    continue
                v = m.group(1)
                publicada = v == r["rel"][0]
                if not publicada and _h(full) % 4 == 0:
                    continue  # rama creada, release de Jira todavía no
                versiones.setdefault(v, publicada)
                for c in rama["commits"] or []:
                    for k in re.findall(r"\bRDR-\d+\b", c["mensaje"]):
                        tv_de.setdefault(k, v)
        sab = hoy + dt.timedelta(days=(5 - hoy.weekday()) % 7 or 7)
        self.versiones = []
        for n, (v, publicada) in enumerate(sorted(versiones.items(), key=lambda x: [int(p) for p in x[0].split(".")])):
            fecha = (hoy - dt.timedelta(days=12 + n % 30)).isoformat() if publicada else sab.isoformat()
            self.versiones.append({"id": str(30000 + n), "name": v, "released": publicada, "archived": False,
                                   "releaseDate": fecha, "projectId": 900})
        id_v = {v["name"]: v for v in self.versiones}
        # Features y sus historias.
        for i, (feat, (slug, nombre)) in enumerate(sorted(todas.items())):
            enlaces = []
            if i % 5 != 4:
                sd = "SDATOOL-%d" % (50000 + _h(feat) % 9000)
                if i % 5 == 3:
                    self.remotos[feat] = [{"object": {"url": "https://jira.invalid/browse/" + sd, "title": sd}}]
                else:
                    enlaces.append({"type": {"name": "relates to"}, "outwardIssue": {"key": sd, "fields": {"summary": "Solicitud"}}})
            self.issues[feat] = self._issue(feat, nombre or slug.replace("-", " ").capitalize(), "Feature", ESTADOS[1 + i % 2], "CIBRDR",
                                            links=enlaces)
            for j, k in enumerate(demo.historias_de(feat)):
                v = tv_de.get(k)
                if v and v in id_v:
                    est = ESTADOS[3] if id_v[v]["released"] else ESTADOS[2]
                else:
                    est = ESTADOS[_h(k) % 3]
                tv = [{"id": id_v[v]["id"], "name": v}] if v in id_v and _h(k, "tv") % 9 else None  # alguna se olvida el campo
                self.issues[k] = self._issue(k, RESUMENES[_h(k) % len(RESUMENES)], "Historia", est, "RDR", feature=feat, tv=tv)
        # Una historia en la release de Jira que no está en ningún commit (para ver la diferencia).
        if self.versiones:
            v = next((x for x in self.versiones if x["name"] == "2.108.0"), None) or next(
                (x for x in self.versiones if not x["released"]), self.versiones[-1])
            self.issues["RDR-999"] = self._issue("RDR-999", "Documentación de la release", "Historia", ESTADOS[1], "RDR",
                                                 tv=[{"id": v["id"], "name": v["name"]}])

    @staticmethod
    def _issue(k, resumen, tipo, estado, proy, feature=None, tv=None, links=None):
        f = {"summary": resumen, "issuetype": {"name": tipo}, "status": {"name": estado[0], "statusCategory": {"key": estado[1]}},
             "assignee": {"displayName": ["Ana Ruiz", "J. Martín", "L. Garrido", "P. Navarro"][_h(k) % 4]},
             "fixVersions": [], "updated": "2026-11-20T10:00:00.000+0100", "project": {"key": proy},
             "issuelinks": links or [], "description": "Descripción de %s" % k}
        if feature:
            f[CAMPO_FEATURE] = feature
        if tv:
            f[CAMPO_TV] = tv
        return {"key": k, "fields": f}

    # Un subconjunto de JQL: lo que pide la app.
    def buscar(self, jql):
        jql = jql.strip()
        m = re.fullmatch(r"key in \(([^)]*)\)", jql) or re.fullmatch(r"key = (\S+)", jql)
        if m:
            claves = [c.strip() for c in m.group(1).split(",") if c.strip()]
            malas = [c for c in claves if c not in self.issues]
            if malas:
                return 400, {"errorMessages": ["An issue with key '%s' does not exist for field 'key'." % c for c in malas]}
            return 200, [self.issues[c] for c in claves]
        m = re.fullmatch(r"cf\[10008\] in \(([^)]*)\)", jql)
        if m:
            fs = {c.strip() for c in m.group(1).split(",")}
            return 200, [i for i in self.issues.values() if i["fields"].get(CAMPO_FEATURE) in fs]
        m = re.fullmatch(r"cf\[20500\] = (\d+)", jql)
        if m:
            return 200, [i for i in self.issues.values() if any(v["id"] == m.group(1) for v in i["fields"].get(CAMPO_TV) or [])]
        if re.fullmatch(r"fixVersion = \d+", jql):
            return 200, []
        return 400, {"errorMessages": ["La consulta JQL no es válida: %s" % jql]}


def campos():
    return [{"id": "summary", "name": "Summary", "schema": {"type": "string"}},
            {"id": "status", "name": "Status", "schema": {"type": "status"}},
            {"id": CAMPO_FEATURE, "name": "Feature Link", "custom": True,
             "schema": {"type": "any", "custom": "com.pyxis.greenhopper.jira:gh-epic-link"}},
            {"id": CAMPO_TV, "name": "tech-version", "custom": True,
             "schema": {"type": "array", "items": "version", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:multiversion"}},
            {"id": "customfield_10007", "name": "Epic Name", "custom": True, "schema": {"type": "string"}},
            {"id": "fixVersions", "name": "Fix Version/s", "schema": {"type": "array", "items": "version"}}]


class _H(BaseHTTPRequestHandler):
    datos = None

    def log_message(self, *a):
        pass

    def _json(self, estado, obj):
        b = json.dumps(obj).encode()
        self.send_response(estado)
        self.send_header("Content-Type", "application/json;charset=UTF-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _ok(self):
        a = self.headers.get("Authorization") or ""
        return a.startswith("Bearer ") and a[7:] not in ("", TOKEN_MALO) or a.startswith("Basic ")

    def do_GET(self):
        self._ruta("GET")

    def do_POST(self):
        self._ruta("POST")

    def _ruta(self, metodo):
        if not self._ok():
            return self._json(401, {"errorMessages": ["You are not authenticated."]})
        u = urllib.parse.urlparse(self.path)
        p, d = u.path, self.datos
        if p == "/rest/api/2/myself":
            return self._json(200, {"name": "usuario-demo", "key": "usuario-demo", "displayName": "Usuario demo"})
        if p == "/rest/api/2/serverInfo":
            return self._json(200, {"version": "9.12.15", "deploymentType": "Server"})
        if p == "/rest/api/2/field":
            return self._json(200, campos())
        if p == "/rest/api/2/project/RDR/versions":
            return self._json(200, d.versiones)
        m = re.fullmatch(r"/rest/api/2/issue/([A-Z]+-\d+)/remotelink", p)
        if m:
            return self._json(200, d.remotos.get(m.group(1), []))
        if p == "/rest/api/2/search" and metodo == "POST":
            n = int(self.headers.get("Content-Length") or 0)
            q = json.loads(self.rfile.read(n) or b"{}")
            estado, res = d.buscar(q.get("jql") or "")
            if estado != 200:
                return self._json(estado, res)
            ini, maxr = int(q.get("startAt") or 0), int(q.get("maxResults") or 50)
            return self._json(200, {"startAt": ini, "maxResults": maxr, "total": len(res), "issues": res[ini:ini + maxr]})
        return self._json(404, {"errorMessages": ["No existe: %s" % p]})


def arrancar(datos_gh, puerto=0):
    """Arranca el Jira simulado en 127.0.0.1. -> (servidor, url, datos)"""
    datos = DatosJira(datos_gh)
    H = type("HJ", (_H,), {"datos": datos})
    srv = ThreadingHTTPServer(("127.0.0.1", puerto), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, "http://127.0.0.1:%d" % srv.server_address[1], datos
