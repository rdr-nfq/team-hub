"""Servidor local de la app (solo 127.0.0.1).

Seguridad: escucha solo en la máquina, comprueba la cabecera Host (contra
DNS rebinding) y cada llamada a /api lleva una clave aleatoria que solo
conoce la página servida en esta sesión. Los tokens no salen nunca hacia la
página.
"""

import json
import mimetypes
import os
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import VERSION
from . import pase as P
from .clasificar import clasificar
from .config import recurso
from .asistente import Asistente
from .jira import Jira
from .diffs import Diffs
from .ghe import ErrorGHE, api_de_host
from .navegar import Navegar
from .publicar import publicar_dps
from .sesion import Sesiones
from .sincro import cliente_bbva

WEB = recurso("web").resolve()
MAX_CUERPO = 4 * 1024 * 1024
mimetypes.add_type("text/javascript", ".mjs")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("text/markdown", ".md")


def _git(*args):
    try:
        r = subprocess.run(["git", "config", "--get"] + list(args), capture_output=True, text=True, timeout=5,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return r.stdout.strip()
    except Exception:
        return ""


def pistas_git(host):
    """Proxy y certificados que usa git (que en la VDI ya funciona con BBVA)."""
    return {"proxy": _git("http.https://%s.proxy" % host) or _git("http.proxy") or _git("https.proxy"),
            "ca": _git("http.sslcainfo"), "backend": _git("http.sslbackend")}


class App:
    def __init__(self, config, monitor, puerto, demo=False, sesiones=None):
        self.cfg, self.mon, self.puerto, self.demo = config, monitor, puerto, demo
        self.clave = secrets.token_urlsafe(24)
        self.ses = sesiones or config.sesiones or Sesiones(config, demo)
        config.sesiones = self.ses
        self.diffs = Diffs(config, monitor)
        self.nav = Navegar(config, monitor, self.diffs)
        self.copilot = Asistente(config, monitor, self.ses, demo)
        self.jira = Jira(config, monitor, demo)
        monitor.despues_de_sincronizar = self.tras_sincronizar
        self.pestanas = {}  # id de cada pestaña abierta -> último latido
        self.tuvo_pestana = False
        self.vacia_desde = None
        self._c_pestanas = threading.Lock()

    # ── la app vive mientras haya una pestaña abierta ──────────────────────────
    def latido(self, pid):
        with self._c_pestanas:
            self.pestanas[str(pid)[:64]] = time.time()
            self.tuvo_pestana = True
            self.vacia_desde = None

    def adios(self, pid):
        with self._c_pestanas:
            self.pestanas.pop(str(pid)[:64], None)
            if not self.pestanas and self.vacia_desde is None:
                self.vacia_desde = time.time()

    def vigilar(self, salir, gracia=8, perdida=180, sin_abrir=300):
        """Llama a `salir` cuando se cierra la última pestaña (con unos segundos por si es una recarga),
        si las pestañas dejan de dar señales (navegador cerrado de golpe) o si nunca llega a abrirse ninguna."""
        inicio = time.time()

        def bucle():
            while True:
                time.sleep(2)
                ahora = time.time()
                with self._c_pestanas:
                    for k in [k for k, t in self.pestanas.items() if ahora - t > perdida]:
                        del self.pestanas[k]  # una pestaña que ya no da señales (p. ej. el navegador se cerró)
                        if not self.pestanas and self.vacia_desde is None:
                            self.vacia_desde = ahora
                    if self.tuvo_pestana:
                        fin = not self.pestanas and self.vacia_desde is not None and ahora - self.vacia_desde >= gracia
                    else:
                        fin = ahora - inicio > sin_abrir
                if fin:
                    salir()
                    return

        threading.Thread(target=bucle, name="vigilar-pestanas", daemon=True).start()

    def _situacion(self, vista):
        """Resumen de la situación para el chat de ayuda (sin tokens ni contenido de repos)."""
        ses = self.ses.publica()
        sj = self.jira.publica()
        sc = dict(self.mon.sincro)
        lineas = ["- Versión de la app: %s%s" % (VERSION, " (demo)" if self.demo else ""),
                  "- Pestaña abierta: %s" % (vista or "?"),
                  "- GitHub BBVA: %s; GitHub NFQ: %s; Jira: %s" % ((ses.get("bbva") or {}).get("estado"), (ses.get("nfq") or {}).get("estado"), sj.get("estado")),
                  "- Sincronización: %s; repositorios al día: %s%s" % (sc.get("estado"), "/".join(str(x) for x in sc.get("repos") or []),
                                                                       " · sigue a las %s" % sc.get("reanuda") if sc.get("estado") == "pausada" else ""),
                  "- Primera carga terminada: %s" % ("sí" if self.mon.ultima_completa else "no"),
                  "- Repositorios: %d; ramas: %d" % (len(self.mon.repos), len(self.mon.ramas))]
        return "\n".join(lineas)

    def tras_sincronizar(self):
        try:
            self.publicar()
        finally:
            self.jira.sincronizar()  # con lo nuevo de GitHub (claves de los commits, features, releases)

    def publicar(self, forzar=False):
        if self.demo:
            return {"publicados": 0, "motivo": "En la demo no se publica nada."}
        usuario = (self.ses.publica().get("nfq") or {}).get("usuario") or ""
        return publicar_dps(self.mon, self.cfg, usuario, forzar=forzar)

    def tras_iniciar(self, quien):
        if quien == "bbva":
            self.mon.pedir_sincro()
        else:
            threading.Thread(target=self.publicar, daemon=True).start()

    # ── acciones ────────────────────────────────────────────────────────────
    def probar(self, destino):
        cfg = self.cfg.get()
        if destino == "nfq":
            cli = P.cliente_nfq(cfg)
            repo, cab = cli.get("repos/" + cfg["nfq"]["repo"], etag=False)
            permisos = repo.get("permissions") or {}
            return {"ok": True, "texto": "Acceso a %s (%s)%s." % (
                repo.get("full_name"), "privado" if repo.get("private") else "PÚBLICO: el .json del pase sería visible para cualquiera",
                "" if permisos.get("push", True) else "; tu usuario no puede escribir en él"),
                "publico": not repo.get("private")}
        b = cfg["bbva"]
        if not b.get("token"):
            raise ErrorGHE("Falta el token de GitHub BBVA.", pista="Pégalo en Ajustes → Conexión.")
        cli = cliente_bbva(cfg)
        yo, cab = cli.get("user", etag=False)
        alcances = cab.get("x-oauth-scopes")
        return {"ok": True, "texto": "Conectado como %s en %s." % (yo.get("login"), b.get("api") or api_de_host(b.get("host"))),
                "alcances": alcances, "cuota": cli.estado_cuota(), "git": pistas_git(b.get("host"))}

    def probar_reglas(self, reglas):
        cfg = self.cfg.get()
        subidas = cfg.get("reposSubida") or {}
        out = []
        for f in self.mon.rutas_de_muestra():
            c = clasificar(f["ruta"], reglas, subidas.get(f["repo"], ""))
            out.append({"ruta": f["ruta"], "repo": f["repo"], "res": c})
        return out

    def abrir_carpeta(self):
        ruta = str(self.cfg.dir / "pases")
        if self.demo:
            return {"ruta": ruta}
        try:
            if os.name == "nt":
                os.startfile(ruta)  # noqa
            elif sys.platform == "darwin":
                subprocess.Popen(["open", ruta])
            else:
                subprocess.Popen(["xdg-open", ruta])
        except Exception:
            pass
        return {"ruta": ruta}

    def rutas(self, metodo, ruta, q, cuerpo):
        if metodo == "GET" and ruta == "/api/jira":
            return self.jira.vista()
        if metodo == "POST" and ruta == "/api/jira/conectar":
            return self.jira.conectar(cuerpo.get("token"), cuerpo.get("usuario"), cuerpo.get("clave"), cuerpo.get("cookie"))
        if metodo == "GET" and ruta == "/api/jira/sesion-estado":
            return self.jira.publica()
        if metodo == "POST" and ruta == "/api/jira/nfq":
            # Quién: el usuario de GitHub NFQ (lo que se comparte en pases-datos no lleva datos de BBVA).
            return self.jira.guardar_nfq(cuerpo.get("claves") or [], (self.ses.publica().get("nfq") or {}).get("usuario") or "")
        if metodo == "POST" and ruta == "/api/jira/navegador":
            return self.jira.conectar_navegador()
        if metodo == "POST" and ruta == "/api/jira/cerrar":
            return self.jira.cerrar()
        if metodo == "POST" and ruta == "/api/jira/sincronizar":
            threading.Thread(target=self.jira.sincronizar, kwargs={"completa": True}, name="jira", daemon=True).start()
            return {"pedida": True}
        if metodo == "POST" and ruta == "/api/jira/diagnostico":
            return self.jira.diagnostico()
        if metodo == "POST" and ruta == "/api/jira/diagnostico/enviar":
            return self.jira.enviar_diagnostico(cuerpo.get("id") or "")
        if metodo == "POST" and ruta == "/api/ayuda/preguntar":
            return {"id": self.copilot.ayuda(cuerpo.get("pregunta"), self._situacion(cuerpo.get("vista") or ""), cuerpo.get("historial"))}
        if metodo == "POST" and ruta == "/api/latido":
            self.latido(cuerpo.get("id") or "")
            return {"ok": True}
        if metodo == "GET" and ruta == "/api/estado":
            c = self.cfg.get()
            n = c["nfq"]
            return dict(self.mon.resumen(), version=VERSION, demo=self.demo, carpeta=str(self.cfg.dir), sesion=dict(self.ses.publica(), jira=self.jira.publica()),
                        dias=int(c["bbva"].get("diasActividad") or 45), filtroRepos=c["bbva"].get("filtroRepos") or "",
                        nfq={"repo": n.get("repo"), "rama": n.get("rama") or "main", "carpeta": n.get("carpeta") or "",
                             "listo": bool(n.get("repo") and n.get("token")) and not self.demo},
                        tipos=sorted({r.get("tipo") for r in c.get("reglas") or [] if r.get("tipo")}),
                        subidas=sorted({r.get("subida") for r in c.get("reglas") or [] if r.get("subida")}
                                       | {v for v in (c.get("reposSubida") or {}).values() if v}))
        if metodo == "GET" and ruta == "/api/rama":
            d = self.mon.detalle(q.get("id", ""))
            if d is None:
                raise KeyError("Esa rama ya no está en la última sincronización.")
            return d
        # Sesiones (Git Credential Manager)
        if metodo == "GET" and ruta == "/api/sesion":
            return dict(self.ses.publica(), jira=self.jira.publica())
        if metodo == "POST" and ruta == "/api/sesion/iniciar":
            self.ses.iniciar_en_segundo_plano(cuerpo.get("quien"), True, self.tras_iniciar)
            return {"ok": True}
        if metodo == "POST" and ruta == "/api/sesion/cerrar":
            self.ses.cerrar(cuerpo.get("quien"), bool(cuerpo.get("olvidar")))
            return self.ses.publica()
        # DPs
        if metodo == "GET" and ruta == "/api/dps":
            return {"dps": self.mon.dps(), "nfq": {"repo": self.cfg.get()["nfq"].get("repo"),
                                                   "sesion": (self.ses.publica().get("nfq") or {}).get("estado") == "iniciada"}}
        if metodo == "GET" and ruta == "/api/dp":
            d = self.mon.dp(q.get("repo", ""), q.get("cod", ""))
            if d is None:
                raise KeyError("Ese DP no está entre los detectados.")
            return d
        if metodo == "GET" and ruta == "/api/dp/diff":
            return self.diffs.dp(q.get("repo", ""), q.get("cod", ""))
        if metodo == "GET" and ruta == "/api/dp/gsp":
            return self.diffs.gsp_dp(q.get("repo", ""), q.get("cod", ""))
        if metodo == "GET" and ruta == "/api/dp/descriptor":
            return self.mon.forma_descriptor(q.get("repo", ""), q.get("cod", ""))
        if metodo == "POST" and ruta == "/api/dp/descriptor/enviar":
            from .publicar import enviar_diagnostico
            informe = self.mon.forma_descriptor(cuerpo.get("repo") or "", cuerpo.get("cod") or "")
            return enviar_diagnostico(self.cfg.get(), "descriptor", informe, demo=self.demo)
        if metodo == "GET" and ruta == "/api/gsp":
            return self.diffs.gsp(q.get("repo", ""), q.get("antes", ""), q.get("despues", ""), q.get("ruta", ""), q.get("rutaAntes", ""))
        if metodo == "POST" and ruta == "/api/dps/publicar":
            return self.publicar(forzar=True)
        # Repositorios (como la web de GitHub)
        if metodo == "GET" and ruta == "/api/repo/refs":
            return self.nav.refs(q.get("repo", ""))
        if metodo == "GET" and ruta == "/api/repo/arbol":
            return self.nav.arbol(q.get("repo", ""), q.get("ref", ""))
        if metodo == "GET" and ruta == "/api/repo/historial":
            return self.nav.historial(q.get("repo", ""), q.get("ref", ""), q.get("ruta", ""), q.get("pagina", 1))
        if metodo == "GET" and ruta == "/api/repo/prs":
            return self.nav.prs(q.get("repo", ""), q.get("estado", "open"))
        if metodo == "GET" and ruta == "/api/repo/pr":
            return self.nav.pr(q.get("repo", ""), q.get("n", 0))
        if metodo == "GET" and ruta == "/api/repo/comparar":
            return self.nav.comparar(q.get("repo", ""), q.get("base", ""), q.get("head", ""))
        # Copilot CLI
        if metodo == "GET" and ruta == "/api/copilot/estado":
            return self.copilot.estado()
        if metodo == "POST" and ruta == "/api/copilot/instalar":
            return {"id": self.copilot.instalar()}
        if metodo == "POST" and ruta == "/api/copilot/sesion":
            return self.copilot.abrir_sesion_copilot()
        if metodo == "POST" and ruta == "/api/copilot/preguntar":
            return {"id": self.copilot.preguntar(cuerpo.get("contexto"), cuerpo.get("pregunta"), cuerpo.get("modo"))}
        if metodo == "GET" and ruta == "/api/copilot/tareas":
            return {"tareas": self.copilot.lista()}
        if metodo == "GET" and ruta == "/api/copilot/tarea":
            return self.copilot.tarea(q.get("id", ""))
        if metodo == "POST" and ruta == "/api/copilot/cancelar":
            return self.copilot.cancelar(cuerpo.get("id"))
        if metodo == "POST" and ruta == "/api/copilot/aplicar":
            return self.copilot.aplicar(cuerpo.get("id"), cuerpo.get("mensaje"))
        if metodo == "POST" and ruta == "/api/copilot/descartar":
            return self.copilot.descartar(cuerpo.get("id"))
        if metodo == "GET" and ruta == "/api/commits":
            return self.mon.commits()
        if metodo == "GET" and ruta == "/api/commit":
            return self.diffs.commit(q.get("repo", ""), q.get("sha", ""))
        if metodo == "GET" and ruta == "/api/diff-rama":
            return self.diffs.rama(q.get("id", ""))
        if metodo == "GET" and ruta == "/api/fichero":
            return self.diffs.fichero(q.get("repo", ""), q.get("ref", ""), q.get("ruta", ""))
        if metodo == "GET" and ruta == "/api/config":
            return self.cfg.publica()
        if metodo == "GET" and ruta == "/api/config/equipo":
            return {"equipo": self.cfg.para_equipo()}
        if metodo == "POST" and ruta == "/api/config/restablecer":
            if cuerpo.get("clave") not in ("reglas", "proyectos", "reposSubida"):
                raise ValueError("Eso no se puede restablecer.")
            return self.cfg.restablecer(cuerpo["clave"])
        if metodo == "POST" and ruta == "/api/config":
            antes = self.cfg.get()
            nueva = self.cfg.actualizar(cuerpo.get("cambios") or {})
            if self.cfg.get()["bbva"] != antes["bbva"]:
                self.mon.pedir_sincro()
            return nueva
        if metodo == "POST" and ruta == "/api/sincronizar":
            if not self.cfg.configurado():
                raise ValueError("Primero configura el token y las organizaciones o repositorios en Ajustes.")
            return {"pedida": self.mon.pedir_sincro()}
        if metodo == "POST" and ruta == "/api/probar":
            return self.probar(cuerpo.get("destino"))
        if metodo == "POST" and ruta == "/api/dps":
            return {"dps": self.mon.poner_manuales(cuerpo.get("id"), cuerpo.get("dps"), None)}
        if metodo == "POST" and ruta == "/api/propuesta":
            return {"proyectos": P.propuesta(self.mon, [str(f) for f in cuerpo.get("features") or []])}
        if metodo == "GET" and ruta == "/api/borrador":
            return {"borrador": self.mon.borradores.get(q.get("fecha", ""))}
        if metodo == "POST" and ruta == "/api/borrador":
            f = str(cuerpo.get("fecha") or "")
            if not P.RE_FECHA.match(f):
                raise ValueError("Fecha no válida.")
            with self.mon._cerrojo:
                if cuerpo.get("datos") is None:
                    self.mon.borradores.pop(f, None)
                else:
                    self.mon.borradores[f] = cuerpo.get("datos")
            self.mon.guardar()
            return {"ok": True}
        if metodo == "POST" and ruta == "/api/pase/vista":
            return {"pase": P.limpiar(cuerpo.get("pase") or {})}
        if metodo == "POST" and ruta == "/api/pase/guardar":
            limpio, destino = P.guardar(self.cfg.dir, cuerpo.get("pase") or {})
            return {"pase": limpio, "ruta": str(destino)}
        if metodo == "POST" and ruta == "/api/pase/subir":
            if self.demo:
                raise ValueError("En la demo no se sube nada: configura tu repositorio de NFQ en la app real.")
            return P.subir(self.cfg.get(), self.cfg.dir, str(cuerpo.get("fecha") or ""))
        if metodo == "GET" and ruta == "/api/pases":
            return {"pases": P.listar(self.cfg.dir), "carpeta": str(self.cfg.dir / "pases")}
        if metodo == "POST" and ruta == "/api/reglas/probar":
            return {"muestras": self.probar_reglas(cuerpo.get("reglas") or [])}
        if metodo == "POST" and ruta == "/api/abrir-carpeta":
            return self.abrir_carpeta()
        raise LookupError("No existe " + ruta)

    # ── HTTP ────────────────────────────────────────────────────────────────
    def manejador(self):
        app = self
        hosts = {"127.0.0.1:%d" % self.puerto, "localhost:%d" % self.puerto}

        class H(BaseHTTPRequestHandler):
            server_version = "monitor-pases/" + VERSION

            def log_message(self, fmt, *args):  # silencio: nada de ruido en la consola
                pass

            def _enviar(self, estado, cuerpo, tipo="application/json; charset=utf-8", extra=None):
                if isinstance(cuerpo, (dict, list)):
                    cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
                elif isinstance(cuerpo, str):
                    cuerpo = cuerpo.encode("utf-8")
                self.send_response(estado)
                self.send_header("Content-Type", tipo)
                self.send_header("Content-Length", str(len(cuerpo)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                if self.command != "HEAD":
                    self.wfile.write(cuerpo)

            def _host_ok(self):
                return (self.headers.get("Host") or "") in hosts

            def _estatico(self):
                ruta = urllib.parse.urlparse(self.path).path
                if ruta in ("/", ""):
                    ruta = "/index.html"
                destino = (WEB / ruta.lstrip("/")).resolve()
                if WEB not in destino.parents or not destino.is_file():
                    return self._enviar(404, {"error": "No encontrado"})
                datos = destino.read_bytes()
                tipo = mimetypes.guess_type(str(destino))[0] or "application/octet-stream"
                if destino.name == "index.html":
                    datos = datos.replace(b"__CLAVE__", app.clave.encode())
                    tipo = "text/html; charset=utf-8"
                csp = ("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
                       "font-src 'self'; connect-src 'self'; frame-ancestors 'self' vscode-webview: vscode-file:; base-uri 'none'")
                # frame-ancestors: solo la propia app y el panel del plugin de VS Code pueden mostrarla dentro.
                self._enviar(200, datos, tipo, {"Content-Security-Policy": csp})

            def _api(self, metodo):
                if self.headers.get("X-Monitor-Clave") != app.clave:
                    return self._enviar(403, {"error": "Clave de sesión incorrecta. Recarga la página."})
                origen = self.headers.get("Origin")
                if origen and urllib.parse.urlparse(origen).netloc not in hosts:
                    return self._enviar(403, {"error": "Origen no permitido."})
                u = urllib.parse.urlparse(self.path)
                q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
                cuerpo = {}
                if metodo == "POST":
                    n = int(self.headers.get("Content-Length") or 0)
                    if n > MAX_CUERPO:
                        return self._enviar(413, {"error": "Demasiado grande."})
                    try:
                        cuerpo = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
                    except ValueError:
                        return self._enviar(400, {"error": "JSON no válido."})
                try:
                    return self._enviar(200, app.rutas(metodo, u.path, q, cuerpo))
                except ErrorGHE as e:
                    return self._enviar(502, {"error": str(e), "pista": e.pista, "estado": e.estado})
                except (ValueError, KeyError, RuntimeError) as e:
                    return self._enviar(400, {"error": str(e).strip("'\"")})
                except LookupError as e:
                    return self._enviar(404, {"error": str(e)})
                except Exception as e:  # noqa
                    return self._enviar(500, {"error": "Error interno: %s" % e})

            def do_GET(self):
                if not self._host_ok():
                    return self._enviar(403, {"error": "Host no permitido."})
                if self.path == "/ping":  # para saber si la app ya está abierta (sin datos)
                    return self._enviar(200, {"app": "monitor-pases", "version": VERSION})
                if self.path.startswith("/api/"):
                    return self._api("GET")
                return self._estatico()

            do_HEAD = do_GET

            def do_POST(self):
                if not self._host_ok():
                    return self._enviar(403, {"error": "Host no permitido."})
                u = urllib.parse.urlparse(self.path)
                if u.path == "/api/adios":  # sendBeacon al cerrar la pestaña: no puede llevar cabeceras, la clave va en la URL
                    q = urllib.parse.parse_qs(u.query)
                    origen = self.headers.get("Origin")
                    if (q.get("clave") or [""])[0] != app.clave or (origen and urllib.parse.urlparse(origen).netloc not in hosts):
                        return self._enviar(403, {"error": "No permitido."})
                    n = min(int(self.headers.get("Content-Length") or 0), 1024)
                    try:
                        pid = json.loads(self.rfile.read(n).decode("utf-8") or "{}").get("id") or ""
                    except ValueError:
                        pid = ""
                    app.adios(pid)
                    return self._enviar(200, {"ok": True})
                if not self.path.startswith("/api/"):
                    return self._enviar(404, {"error": "No encontrado"})
                return self._api("POST")

        return H

    def servir(self):
        srv = ThreadingHTTPServer(("127.0.0.1", self.puerto), self.manejador())
        srv.daemon_threads = True
        hilo = threading.Thread(target=srv.serve_forever, name="http", daemon=True)
        hilo.start()
        return srv
