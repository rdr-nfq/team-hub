"""Asistentes de Copilot con un repositorio git real (origen local) y un
Copilot CLI falso (un script de node que imita `copilot -p`)."""

import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

COPILOT_FALSO = r"""
const fs = require("fs");
const args = process.argv.slice(2);
const prompt = args[args.indexOf("-p") + 1] || "";
const escribe = args.includes("write") && args[args.indexOf("write") - 1] === "--allow-tool";
console.log("ARGS " + JSON.stringify(args.filter((a) => a !== prompt)));
const ctx = (prompt.match(/en (\S+contexto-monitor\.md)/) || [])[1];
if (ctx) console.log("CONTEXTO " + fs.readFileSync(ctx, "utf8").split("\n")[2]);
if (escribe) {
  fs.appendFileSync("Uno.java", "// cambio hecho por copilot\n");
  fs.writeFileSync("Nuevo.java", "class Nuevo {}\n");
  console.log("He cambiado Uno.java y creado Nuevo.java");
} else {
  console.log("La rama cambia Uno.java");
}
"""


def git(*a, cwd=None):
    r = subprocess.run(["git"] + list(a), cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


@unittest.skipUnless(shutil.which("node") and shutil.which("git"), "hace falta node y git")
class TestAsistente(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="mp-cop-"))
        os.environ["MONITOR_PASES_DIR"] = str(cls.tmp / "datos")
        origen = cls.tmp / "origen" / "equipo-demo" / "rdr-javas.git"
        origen.parent.mkdir(parents=True)
        git("init", "--bare", "-q", str(origen))
        trabajo = cls.tmp / "trabajo"
        git("clone", "-q", str(origen), str(trabajo))
        for k, v in (("user.email", "p@e.es"), ("user.name", "Prueba")):
            git("config", k, v, cwd=trabajo)
        (trabajo / "Uno.java").write_text("class Uno {}\n")
        git("add", "-A", cwd=trabajo)
        git("commit", "-q", "-m", "inicial", cwd=trabajo)
        git("push", "-q", "origin", "HEAD:refs/heads/master", cwd=trabajo)
        git("checkout", "-q", "-b", "feature/CIBRDR-1-prueba", cwd=trabajo)
        (trabajo / "Uno.java").write_text("class Uno { int x; }\n")
        git("commit", "-q", "-am", "CIBRDR-1: x", cwd=trabajo)
        git("push", "-q", "origin", "feature/CIBRDR-1-prueba", cwd=trabajo)
        cls.origen = origen
        falso = cls.tmp / "copilot-falso.js"
        falso.write_text(COPILOT_FALSO)

        from mp.asistente import Asistente
        from mp.config import Config
        from mp.sesion import Sesiones
        from mp.sincro import Monitor
        cfg = Config()
        cfg.actualizar({"bbva": {"host": "demo.invalid"},
                        "copilot": {"entrada": str(falso), "urlRepo": (cls.tmp / "origen").as_uri() + "/{repo}.git"}})
        ses = Sesiones(cfg)
        cfg.sesiones = ses
        cls.mon = Monitor(cfg)
        cls.rid = "equipo-demo/rdr-javas:feature/CIBRDR-1-prueba"
        cls.mon.ramas = {cls.rid: {"id": cls.rid, "repo": "equipo-demo/rdr-javas", "rama": "feature/CIBRDR-1-prueba",
                                   "feature": "CIBRDR-1", "base": "master", "ahead": 1, "commits": [], "ficheros": [], "runs": []}}
        cls.cop = Asistente(cfg, cls.mon, ses)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def esperar(self, tid):
        for _ in range(300):
            t = self.cop.tarea(tid)
            if t["estado"] not in ("preparando", "en curso"):
                return t
            time.sleep(0.1)
        self.fail("La tarea no termina")

    def test_estado(self):
        e = self.cop.estado()
        self.assertTrue(e["copilot"] and e["git"])

    def test_consulta_en_solo_lectura(self):
        t = self.esperar(self.cop.preguntar({"tipo": "rama", "id": self.rid}, "¿Qué cambia?", "consultar"))
        self.assertEqual(t["estado"], "terminada", t["salida"])
        self.assertIn('"--deny-tool","write"', t["salida"])
        self.assertIn("La rama cambia Uno.java", t["salida"])
        self.assertIn("CONTEXTO Repositorio: equipo-demo/rdr-javas", t["salida"])
        self.assertIsNone(t["cambios"])

    def test_modificar_revisar_y_subir(self):
        t = self.esperar(self.cop.preguntar({"tipo": "rama", "id": self.rid}, "Añade un comentario", "modificar"))
        self.assertEqual(t["estado"], "terminada", t["salida"])
        self.assertIn('"--deny-tool","shell(git push)"', t["salida"])
        rutas = {f["ruta"]: f for f in t["cambios"]}
        self.assertEqual(rutas["Uno.java"]["estado"], "modified")
        self.assertIn("+// cambio hecho por copilot", rutas["Uno.java"]["patch"])
        self.assertEqual(rutas["Nuevo.java"]["estado"], "added")
        # Nada se ha subido todavía.
        self.assertEqual(git("--git-dir", str(self.origen), "log", "-1", "--format=%s", "feature/CIBRDR-1-prueba"), "CIBRDR-1: x")
        r = self.cop.aplicar(t["id"], "CIBRDR-1: comentario con Copilot")
        self.assertEqual(git("--git-dir", str(self.origen), "log", "-1", "--format=%s", "feature/CIBRDR-1-prueba"),
                         "CIBRDR-1: comentario con Copilot")
        self.assertEqual(git("--git-dir", str(self.origen), "rev-parse", "feature/CIBRDR-1-prueba"), r["sha"])
        with self.assertRaises(ValueError):
            self.cop.aplicar(t["id"], "otra vez")

    def test_modificar_exige_rama(self):
        with self.assertRaises(ValueError):
            self.cop.preguntar(None, "Cambia algo", "modificar")


if __name__ == "__main__":
    unittest.main()
