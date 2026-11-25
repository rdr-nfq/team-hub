"""Pruebas del monitor contra el GitHub simulado.

    python -m unittest discover -s pruebas      (desde monitor-pases/)
"""

import http.client
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mp import clasificar as C  # noqa: E402
from mp import pase as P  # noqa: E402


class TestReglas(unittest.TestCase):
    def test_feature_de_rama(self):
        self.assertEqual(C.feature_de_rama("feature/cibrdr-2311-algo", r"CIBRDR-\d+"), "CIBRDR-2311")
        self.assertEqual(C.feature_de_rama("hotfix/otra", r"CIBRDR-\d+"), "")
        self.assertEqual(C.feature_de_rama("x", "(roto"), "")  # expresión no válida: no revienta

    def test_buscar_dps(self):
        t = "Identificador: DP-KYTL-123\n| DP-KYTL-123 | ok |\nDP-KYTL-9_A."
        self.assertEqual(C.buscar_dps(t, r"DP-KYTL-[A-Z0-9_-]+"), ["DP-KYTL-123", "DP-KYTL-9_A"])

    def test_componentes(self):
        reglas = [{"patron": r"^\.github/", "ignorar": True},
                  {"patron": r"(?P<nombre>[^/]+)\.java$", "tipo": "Java", "subida": "Java"},
                  {"patron": r"^workstation/(?P<nombre>[^/]+)/", "tipo": "Workstation"}]
        fich = [{"ruta": "src/a/Uno.java"}, {"ruta": "workstation/alta/a.xml"}, {"ruta": "workstation/alta/b.js", "estado": "removed"},
                {"ruta": ".github/workflows/x.yml"}, {"ruta": "otra/cosa.txt"}]
        comps, ign = C.componentes(fich, reglas, subida_repo="Estáticos")
        self.assertEqual(ign, 1)
        self.assertEqual([(c["nombre"], c["tipo"], c["subida"], len(c["ficheros"])) for c in comps],
                         [("Uno", "Java", "Java", 1), ("alta", "Workstation", "Estáticos", 2), ("cosa.txt", "", "Estáticos", 1)])
        self.assertFalse(comps[1]["borrado"])

    def test_limpiar_solo_campos_permitidos(self):
        sucio = {"pase": "2026-11-28", "proyectos": [{"nombre": "P", "feature": "CIBRDR-1", "secreto": "x",
                 "componentes": [{"nom": "A", "ficheros": ["ruta/secreta.java"], "token": "t", "cod": "DP-KYTL-1"}, {"nom": ""}],
                 "dps": [{"cod": "DP-KYTL-1", "url": "https://interna", "run": 5}, {"cod": "DP-KYTL-1"}]}]}
        limpio = P.limpiar(sucio)
        self.assertEqual(set(limpio["proyectos"][0]), {"nombre", "feature", "componentes", "dps"})
        self.assertEqual(set(limpio["proyectos"][0]["componentes"][0]), set(P.CAMPOS_COMP))
        self.assertEqual(len(limpio["proyectos"][0]["componentes"]), 1)
        self.assertEqual(limpio["proyectos"][0]["dps"], [{"cod": "DP-KYTL-1", "repo": "", "rama": "", "run": 5, "fecha": ""}])
        self.assertNotIn("ruta/secreta", json.dumps(limpio))
        with self.assertRaises(ValueError):
            P.limpiar({"pase": "28/11/2026", "proyectos": []})


class TestConGitHubSimulado(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(prefix="mp-test-")
        os.environ["MONITOR_PASES_DIR"] = cls.dir
        from mp import demo
        from mp.config import Config
        from mp.servidor import App
        from mp.sincro import Monitor
        cls.pedidas = []
        cls.srv_ghe, puerto, cls.datos = demo.arrancar(pedidas=cls.pedidas)
        from mp import demo_jira
        cls.srv_jira, url_jira, cls.datos_jira = demo_jira.arrancar(cls.datos)
        cfg = Config()
        c = demo.config_demo(puerto, url_jira)
        c["bbva"]["token"] = "demo"
        c["nfq"] = {"api": "http://127.0.0.1:%d" % puerto, "repo": "rdr-nfq/pases-datos", "token": "demo", "rama": "main", "carpeta": "pases"}
        cfg.actualizar(c)
        cls.cfg, cls.mon = cfg, Monitor(cfg)
        cls.mon.sincronizar()
        cls.app = App(cfg, cls.mon, 0)
        cls.app.puerto = 0
        cls.http = App(cfg, cls.mon, 0)
        cls.srv = cls.http.servir()
        cls.http.puerto = cls.srv.server_address[1]
        cls.srv.RequestHandlerClass = cls.http.manejador()  # con el puerto real para la comprobación de Host

    @classmethod
    def tearDownClass(cls):
        for srv in (cls.srv, cls.srv_ghe, cls.srv_jira):
            srv.shutdown()
            srv.server_close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def test_sincronizacion(self):
        s = self.mon.sincro
        self.assertEqual(s["estado"], "ok")
        r = self.mon.resumen()
        feats = {p["feature"] for p in r["proyectos"]}
        self.assertTrue({"CIBRDR-2311", "CIBRDR-2405", "CIBRDR-2442", "CIBRDR-2470", "CIBRDR-2488"} <= feats)
        merg = [x for x in r["ramas"] if x["mergeada"] and not x.get("release")]
        self.assertEqual([x["id"] for x in merg], ["equipo-demo/rdr-cadenas:feature/CIBRDR-2405-informe-regulatorio"])

    def test_repos_filtrados_por_propiedad(self):
        from mp.sincro import cliente_bbva
        repos = self.mon.resumen()["repos"]
        todos = [r for r in self.datos.repos.values()]
        del_equipo = {r["full"] for r in todos if r["props"]["uuaa"] == "KYTL0000"}
        self.assertLess(len(del_equipo), len(todos))  # hay repos de otras UUAA en la organización
        self.assertEqual({r["nombre"] for r in repos}, del_equipo)
        self.assertTrue(all(r["propiedades"].get("uuaa") == "KYTL0000" for r in repos))
        self.assertTrue(any(r["lenguaje"] for r in repos))
        # Un GitHub sin la API de propiedades: la búsqueda de repositorios entiende la misma consulta.
        self.datos.sin_propiedades = True
        try:
            cli = cliente_bbva(self.cfg.get())
            vistos = self.mon._descubrir(cli, self.cfg.get()["bbva"])
        finally:
            self.datos.sin_propiedades = False
        self.assertEqual({r["full_name"] for r in vistos}, del_equipo)
        self.assertTrue(any("/search/repositories" in p for m, p, h in self.pedidas))

    def test_sincroniza_entera_aunque_busque_los_repos_con_la_busqueda(self):
        # Sin la API de propiedades (p. ej. el token no tiene read:org) los repos se buscan con la búsqueda,
        # que tiene su propia cuota de 30 por minuto: no es la cuota general y no debe pausar la sincronización.
        from mp.config import Config
        from mp.sincro import Monitor
        dir_ = tempfile.mkdtemp(prefix="mp-busqueda-")
        antes_env = os.environ["MONITOR_PASES_DIR"]
        os.environ["MONITOR_PASES_DIR"] = dir_
        self.datos.sin_propiedades = True
        try:
            cfg = Config()
            cfg.actualizar(self.cfg.get())
            mon = Monitor(cfg)
            mon.sincronizar()
            self.assertEqual(mon.sincro["estado"], "ok", mon.sincro)
            self.assertEqual(mon.sincro["repos"][0], len(self.mon.repos))
        finally:
            self.datos.sin_propiedades = False
            os.environ["MONITOR_PASES_DIR"] = antes_env
            shutil.rmtree(dir_, ignore_errors=True)

    def test_jira_historias_features_y_releases(self):
        from mp.ghe import ErrorGHE
        from mp.demo_jira import RESUMENES
        j = self.app.jira
        with self.assertRaises(ErrorGHE):
            j.conectar(token="mal")
        j.conectar(token="un-token")
        for _ in range(200):  # conectar sincroniza en segundo plano
            if j.sincro.get("estado") in ("ok", "error") and not j._en_curso:
                break
            time.sleep(0.1)
        self.assertEqual(j.sincro["estado"], "ok", j.sincro)
        self.assertEqual(j.campos["feature"]["nombre"], "Feature Link")
        self.assertEqual(j.campos["techVersion"]["nombre"], "tech-version")
        v = j.vista()
        # Historias citadas en los commits, con su feature.
        _, historias = j.claves_de_github()
        self.assertTrue(historias and all(k.startswith("RDR-") for k in historias))  # sin las de los DPs (DP-KYTL-…)
        self.assertTrue(all(k in v["issues"] for k in historias))
        self.assertEqual(v["issues"]["RDR-1000"]["f"], "CIBRDR-2311")
        # Features: nombre, historias y SDATOOL (en un enlace, en un enlace remoto o ninguno).
        f = v["features"]["CIBRDR-2311"]
        self.assertTrue(f["s"] and f["h"])
        donde = {x.get("sdDonde") or "" for x in v["features"].values()}
        self.assertIn("enlace «relates to»", donde)
        self.assertIn("enlace remoto", donde)
        self.assertIn("", donde)
        self.assertTrue(all(x["sd"][0].startswith("SDATOOL-") for x in v["features"].values() if x.get("sd")))
        # Releases de RDR con sus historias por tech-version (y la que no tiene commits).
        r = next(x for x in v["releases"] if x["nombre"] == "2.108.0")
        self.assertFalse(r["publicada"])
        self.assertIn("RDR-999", v["relHistorias"][r["id"]])
        # Una clave que no existe en Jira se apunta y no rompe la consulta del resto.
        res = j._por_claves(j._cliente(), ["RDR-1000", "XYZ-1"], ["summary"])
        self.assertEqual([i["key"] for i in res], ["RDR-1000"])
        self.assertIn("XYZ-1", j.no_existen)
        # El diagnóstico no lleva contenido de Jira: ni títulos ni descripciones.
        d = j.diagnostico()
        texto = json.dumps(d["informe"], ensure_ascii=False)
        self.assertFalse([x for x in RESUMENES if x in texto])
        self.assertNotIn("Descripción de", texto)
        self.assertNotIn("Usuario demo", texto)
        self.assertEqual(d["informe"]["releases"]["proyecto"], "RDR")
        self.assertGreater(d["informe"]["sdatool"]["conSdatool"], 0)

    def test_se_cierra_al_cerrar_la_ultima_pestana(self):
        import threading
        from mp.servidor import App
        app = App(self.cfg, self.mon, 0)
        cerrada = threading.Event()
        app.vigilar(cerrada.set, gracia=1, perdida=600, sin_abrir=600)
        app.latido("a")
        app.latido("b")
        app.adios("a")
        self.assertFalse(cerrada.wait(3.5))  # queda otra pestaña
        app.adios("b")
        app.latido("b2")  # recarga: vuelve antes de la gracia
        self.assertFalse(cerrada.wait(3.5))
        app.adios("b2")
        self.assertTrue(cerrada.wait(6))
        # Una pestaña que deja de dar señales (el navegador se cerró de golpe) también cuenta como cerrada.
        app2 = App(self.cfg, self.mon, 0)
        cerrada2 = threading.Event()
        app2.vigilar(cerrada2.set, gracia=0, perdida=1, sin_abrir=600)
        app2.latido("x")
        self.assertTrue(cerrada2.wait(8))

    def test_adios_por_http_lleva_la_clave_en_la_url(self):
        host = "127.0.0.1:%d" % self.http.puerto
        self.http.latido("p1")
        c = http.client.HTTPConnection("127.0.0.1", self.http.puerto, timeout=5)
        c.request("POST", "/api/adios?clave=mala", body='{"id":"p1"}', headers={"Host": host})
        self.assertEqual(c.getresponse().status, 403)
        c = http.client.HTTPConnection("127.0.0.1", self.http.puerto, timeout=5)
        c.request("POST", "/api/adios?clave=" + self.http.clave, body='{"id":"p1"}', headers={"Host": host})
        self.assertEqual(c.getresponse().status, 200)
        self.assertNotIn("p1", self.http.pestanas)

    def test_cuota_pausa_y_sigue_donde_lo_dejo(self):
        from mp.config import Config
        from mp.sincro import Monitor, RESERVA_CUOTA
        dir_ = tempfile.mkdtemp(prefix="mp-cuota-")
        antes_env = os.environ["MONITOR_PASES_DIR"]
        os.environ["MONITOR_PASES_DIR"] = dir_
        try:
            cfg = Config()
            cfg.actualizar(self.cfg.get())
            mon = Monitor(cfg)
            total = len(self.mon.repos)
            caras = lambda desde: sum(1 for m, p, h in self.pedidas[desde:] if any(x in p for x in ("/compare/", "/check-suites/", "/logs", "/jobs")))
            self.datos.cuota = RESERVA_CUOTA + 400  # da para unos cuantos repos, no para todos
            n0 = len(self.pedidas)
            mon.sincronizar()
            primera = caras(n0)
            s = mon.sincro
            self.assertEqual(s["estado"], "pausada")
            self.assertTrue(s.get("reanuda") and s["errores"] == [])  # la cuota no es un error de cada repo
            self.assertTrue(0 < s["repos"][0] < total, s["repos"])
            self.assertGreaterEqual(self.datos.cuota, 0)
            self.assertLessEqual(self.datos.cuota, RESERVA_CUOTA + 10)  # para en la reserva, no la gasta
            hechos = s["repos"][0]
            self.assertTrue(mon.resumen()["sincro"]["primeraCarga"])
            self.assertTrue(any(r["repo"] in {k for k, v in mon.repos.items() if not v.get("pendiente")} for r in mon.ramas.values()))
            self.assertEqual(len(mon.repos), total)  # los pendientes se ven igual (marcados como pendientes)
            self.assertEqual(sum(1 for r in mon.repos.values() if r.get("pendiente")), total - hechos)
            # Al volver la cuota sigue y termina; lo ya leído no se vuelve a pagar.
            self.datos.cuota = None
            n0 = len(self.pedidas)
            mon.sincronizar()
            self.assertEqual(mon.sincro["estado"], "ok")
            self.assertEqual(mon.sincro["repos"], [total, total])
            self.assertFalse(any(r.get("pendiente") for r in mon.repos.values()))
            self.assertFalse(mon.resumen()["sincro"]["primeraCarga"])
            segunda = caras(n0)
            # Desde cero (otra carpeta) cuesta lo mismo que las dos juntas: nada se ha pagado dos veces.
            dir2 = tempfile.mkdtemp(prefix="mp-cuota2-")
            os.environ["MONITOR_PASES_DIR"] = dir2
            cfg2 = Config()
            cfg2.actualizar(self.cfg.get())
            n0 = len(self.pedidas)
            Monitor(cfg2).sincronizar()
            shutil.rmtree(dir2, ignore_errors=True)
            self.assertGreater(primera, 0)
            # Solo se repite lo que estaban leyendo los repos en marcha cuando se acabó la cuota (POOL_REPOS a la vez).
            from mp.sincro import POOL_REPOS
            self.assertLessEqual(primera + segunda, caras(n0) + POOL_REPOS * 6)
        finally:
            self.datos.cuota = None
            os.environ["MONITOR_PASES_DIR"] = antes_env
            shutil.rmtree(dir_, ignore_errors=True)

    def test_dps_de_las_tres_fuentes(self):
        fuentes = {d["fuente"] for x in self.mon.resumen()["ramas"] for d in x["dps"]}
        self.assertEqual(fuentes, {"resumen", "anotación", "log"})

    def test_token_no_va_al_almacen_de_logs(self):
        blobs = [h for m, p, h in self.pedidas if p.startswith("/blob/")]
        self.assertTrue(blobs)
        self.assertFalse([h for h in blobs if h.get("Authorization")])

    def test_segunda_sincronizacion_usa_etag(self):
        antes = len(self.pedidas)
        self.mon.sincronizar()
        self.assertEqual(self.mon.sincro["estado"], "ok")
        a_bbva = [p for m, p, h in self.pedidas[antes:] if "/contents/" not in p]  # sin la publicación en pases-datos
        self.assertEqual(self.mon.sincro["ahorradas"], len(a_bbva))  # todo 304
        # Las listas de varias páginas siguen enteras aunque GitHub conteste 304 (sin cabecera Link).
        self.assertEqual(len(self.mon.repos), sum(1 for r in self.datos.repos.values() if r["props"]["uuaa"] == "KYTL0000"))

    def test_propuesta_guardar_y_subir(self):
        prop = self.app.rutas("POST", "/api/propuesta", {}, {"features": ["CIBRDR-2311"]})["proyectos"][0]
        self.assertTrue(prop["componentes"])
        java = [c for c in prop["componentes"] if c["tipo"] == "Java"]
        self.assertTrue(java and all(c["cod"].startswith("DP-KYTL-") for c in java))
        g = self.app.rutas("POST", "/api/pase/guardar", {}, {"pase": {"pase": "2026-12-05", "proyectos": [prop]}})
        self.assertTrue(os.path.exists(g["ruta"]))
        r1 = self.app.rutas("POST", "/api/pase/subir", {}, {"fecha": "2026-12-05"})
        r2 = self.app.rutas("POST", "/api/pase/subir", {}, {"fecha": "2026-12-05"})  # actualiza (con sha)
        self.assertIn("pases/pase-2026-12-05.json", r2["fichero"])
        subido = json.loads(self.datos.contenidos[("rdr-nfq/pases-datos", "pases/pase-2026-12-05.json")]["texto"])
        self.assertEqual(subido["formato"], "monitor-pases/1")
        self.assertNotIn("ficheros", json.dumps(subido))
        self.assertTrue(r1["commit"])

    def test_commits_y_diferencias(self):
        cs = self.app.rutas("GET", "/api/commits", {}, {})["commits"]
        self.assertTrue(cs and all(c["sha"] and c["repo"] for c in cs))
        c = next(x for x in cs if x["features"] and x["dps"])
        d = self.app.rutas("GET", "/api/commit", {"repo": c["repo"], "sha": c["sha"]}, {})
        self.assertTrue(d["ficheros"])
        f = d["ficheros"][0]
        self.assertTrue(f["patch"].startswith("@@"))
        self.assertEqual(d["stats"]["additions"], sum(x["mas"] for x in d["ficheros"]))
        # La segunda vez sale de la caché en disco: no se pide a GitHub.
        antes = len(self.pedidas)
        self.app.rutas("GET", "/api/commit", {"repo": c["repo"], "sha": c["sha"]}, {})
        self.assertEqual(len(self.pedidas), antes)
        # Rama frente a producción y fichero completo antes y después.
        rid = next(r["id"] for r in self.mon.ramas.values() if r["repo"].endswith("rdr-javas") and not r["esBase"] and not r["mergeada"])
        dr = self.app.rutas("GET", "/api/diff-rama", {"id": rid}, {})
        self.assertTrue(dr["ficheros"] and dr["baseSha"])
        mod = next(x for x in dr["ficheros"] if x["estado"] == "modified")
        despues = self.app.rutas("GET", "/api/fichero", {"repo": dr["repo"], "ref": dr["sha"], "ruta": mod["ruta"]}, {})
        antes_f = self.app.rutas("GET", "/api/fichero", {"repo": dr["repo"], "ref": dr["baseSha"], "ruta": mod["ruta"]}, {})
        self.assertTrue(despues["existe"] and antes_f["existe"])
        self.assertNotEqual(despues["texto"], antes_f["texto"])
        with self.assertRaises(ValueError):
            self.app.rutas("GET", "/api/commit", {"repo": "otra/repo", "sha": c["sha"]}, {})
        with self.assertRaises(ValueError):
            self.app.rutas("GET", "/api/fichero", {"repo": dr["repo"], "ref": dr["sha"], "ruta": "../secreto"}, {})

    def test_config_del_equipo(self):
        eq = self.app.rutas("GET", "/api/config/equipo", {}, {})["equipo"]
        self.assertNotIn("token", json.dumps(eq))
        self.assertIn("reglas", eq)
        # Lo propio se guarda como diferencia respecto a lo del equipo.
        with open(os.path.join(self.dir, "config.json"), encoding="utf-8") as f:
            propia = json.load(f)
        self.assertNotIn("patronDP", propia.get("bbva", {}))

    def test_releases_y_dps(self):
        dps = self.app.rutas("GET", "/api/dps", {}, {})["dps"]
        rel = [d for d in dps if d["release"] == "2.108.0"]
        self.assertTrue(rel)
        for d in rel:
            self.assertTrue(d["features"] and d["componentes"])
            self.assertFalse(d.get("yaEnProduccion"))
        viejos = [d for d in dps if d["release"] == "2.107.0"]
        self.assertTrue(viejos and all(d["yaEnProduccion"] for d in viejos))
        dd = self.app.rutas("GET", "/api/dp/diff", {"repo": rel[0]["repo"], "cod": rel[0]["cod"]}, {})
        self.assertEqual(len(dd["ficheros"]), rel[0]["nFich"])
        self.assertTrue(all(f["patch"] for f in dd["ficheros"] if f["estado"] != "removed"))

    def test_publicacion_en_pases_datos(self):
        self.app.publicar(forzar=True)
        subidos = {r: json.loads(v["texto"]) for (repo, r), v in self.datos.contenidos.items() if r.startswith("dps/")}
        self.assertTrue(subidos)
        doc = next(iter(subidos.values()))
        self.assertEqual(doc["formato"], "monitor-pases/dp-1")
        self.assertEqual(set(doc["componentes"][0]) if doc["componentes"] else {"nom", "tipo", "subida"}, {"nom", "tipo", "subida"})
        texto = json.dumps(list(subidos.values()))
        self.assertNotIn("src/main/java", texto)  # ni rutas ni código
        self.assertNotIn("patch", texto)
        n = len(subidos)
        self.assertEqual(self.app.publicar(forzar=True)["publicados"], 0)  # ya estaban
        self.assertEqual(len([r for (_, r) in self.datos.contenidos if r.startswith("dps/")]), n)

    def test_navegar_como_github(self):
        repo = "equipo-demo/rdr-javas"
        refs = self.app.rutas("GET", "/api/repo/refs", {"repo": repo}, {})
        self.assertIn("release/2.108.0", [r["nombre"] for r in refs["ramas"]])
        arb = self.app.rutas("GET", "/api/repo/arbol", {"repo": repo, "ref": "release/2.108.0"}, {})
        fichero = next(e["p"] for e in arb["entradas"] if e["t"] == "f" and e["p"].endswith(".java"))
        f = self.app.rutas("GET", "/api/fichero", {"repo": repo, "ref": arb["sha"], "ruta": fichero}, {})
        self.assertTrue(f["texto"].startswith("package "))
        h = self.app.rutas("GET", "/api/repo/historial", {"repo": repo, "ref": "release/2.108.0", "ruta": fichero}, {})
        self.assertTrue(h["commits"])
        prs = self.app.rutas("GET", "/api/repo/prs", {"repo": repo, "estado": "all"}, {})["prs"]
        pr = self.app.rutas("GET", "/api/repo/pr", {"repo": repo, "n": prs[0]["numero"]}, {})
        self.assertTrue(pr["ficheros"] and pr["hilo"])
        cmp_ = self.app.rutas("GET", "/api/repo/comparar", {"repo": repo, "base": "master", "head": "release/2.108.0"}, {})
        self.assertTrue(cmp_["ficheros"])

    def test_tokens_no_llegan_a_la_pagina(self):
        txt = json.dumps(self.app.rutas("GET", "/api/config", {}, {}))
        self.assertNotIn('"token": "demo"', txt)
        self.assertIn('"tokenConfigurado": true', txt)

    def _pedir(self, ruta, cabeceras):
        req = urllib.request.Request("http://127.0.0.1:%d%s" % (self.http.puerto, ruta), headers=cabeceras)
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_seguridad_http(self):
        host = "127.0.0.1:%d" % self.http.puerto
        self.assertEqual(self._pedir("/api/estado", {"Host": host})[0], 403)  # sin clave
        self.assertEqual(self._pedir("/api/estado", {"Host": host, "X-Monitor-Clave": self.http.clave})[0], 200)
        self.assertEqual(self._pedir("/api/estado", {"Host": "malo.example:80", "X-Monitor-Clave": self.http.clave})[0], 403)
        self.assertEqual(self._pedir("/api/estado", {"Host": host, "X-Monitor-Clave": self.http.clave, "Origin": "https://malo.example"})[0], 403)
        estado, cuerpo = self._pedir("/", {"Host": host})
        self.assertEqual(estado, 200)
        self.assertIn(self.http.clave.encode(), cuerpo)
        self.assertEqual(self._pedir("/../mp/config.py", {"Host": host})[0], 404)


if __name__ == "__main__":
    unittest.main()
