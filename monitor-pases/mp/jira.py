"""Jira (Data Center, p. ej. jira.globaldevtools.bbva.com) integrado con GitHub:

- Historias de usuario de cada commit: las claves de Jira de su mensaje.
- Features (las CIBRDR-… de las ramas): su nombre, estado, SDATOOL y las
  historias que cuelgan de ellas (campo Feature/Epic Link).
- Releases del proyecto (RDR por defecto): sus versiones y las historias de
  cada una (campo tech-version). La rama release/x.y.z suele existir antes que
  la release en Jira: entonces se ve con las historias de sus commits.

Sesión: con el navegador (se abre Chrome, o Edge, con un perfil de la app, la persona
entra con el SSO de siempre y la app recoge la sesión: ver navegador.py), con
un token personal o con usuario y contraseña. Los dos últimos se guardan con
Git (Git Credential Manager → almacén de credenciales de Windows), como las de
GitHub; la del navegador vive en ese perfil. La app no escribe secretos en
disco. Todo lo de Jira se queda en la VDI; solo sale el diagnóstico que la
persona revisa y envía, que lleva estructura (nombres de campos, cifras y
formas como «9.999.9»), nunca títulos, descripciones ni personas.
"""

import base64
import collections
import datetime as dt
import json
import re
import ssl
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request

from . import VERSION
from .config import escribir_json, leer_json
from .ghe import ErrorGHE, _diagnostico
from .sesion import _git_credencial
from . import navegador

# Clave de Jira (PROYECTO-123) que no sea parte de otra (DP-KYTL-123 no da KYTL-123).
RE_CLAVE = re.compile(r"(?<![A-Za-z0-9_-])([A-Z][A-Z0-9_]{1,15}-\d{1,7})(?![A-Za-z0-9])")
RE_SDATOOL = re.compile(r"\bSDATOOL-\d{2,7}\b", re.I)
RE_ENLACE_SDA = re.compile(r"\bsda\b|sdatool", re.I)  # p. ej. «SDA project - Feature»
RE_VERSION = re.compile(r"(?<![\d.])(\d+\.\d+(?:\.\d+){0,2})(?![\d])")
MARCA_TOKEN = "token-monitor-pases"  # «usuario» con el que se guarda un token en Git
CAMPOS_BASE = ["summary", "status", "issuetype", "assignee", "fixVersions", "updated", "project"]
TROZO = 80          # claves por consulta (key in (...))
REFRESCO_MIN = 30   # cada cuánto se vuelven a pedir las ya conocidas
PAGINA_PATS = "/secure/ViewProfile.jspa?selectedTab=com.atlassian.pats.pats-plugin:jira-user-personal-access-tokens"


def _ahora():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def claves_en(texto):
    return RE_CLAVE.findall(texto or "")


def forma(valor):
    """La forma de un valor sin el valor: los dígitos pasan a 9 (2.108.0 → 9.999.9)."""
    return re.sub(r"\d", "9", str(valor))[:60]


def _texto_valor(v):
    """Un valor de campo de Jira como texto (cadena, opción, versión, lista…)."""
    if v is None:
        return ""
    if isinstance(v, list):
        return ", ".join(t for t in (_texto_valor(x) for x in v) if t)
    if isinstance(v, dict):
        return str(v.get("name") or v.get("value") or v.get("key") or v.get("displayName") or "")
    return str(v)


def _resumen_campo(f):
    if not f:
        return None
    sch = f.get("schema") or {}
    fid = str(f.get("id", ""))
    # En JQL, los campos propios van por id (cf[123]); los de Jira, por su cláusula (fixVersion, no «Fix Version/s»).
    clausula = next((c for c in f.get("clauseNames") or [] if not str(c).startswith("cf[")), None) or SISTEMA_JQL.get(fid)
    return {"id": f.get("id"), "nombre": f.get("name"), "tipo": sch.get("type"), "items": sch.get("items"),
            "custom": (sch.get("custom") or "").split(":")[-1],
            "jql": "cf[%s]" % fid.split("_")[-1] if fid.startswith("customfield_") else clausula or '"%s"' % f.get("name")}


SISTEMA_JQL = {"fixVersions": "fixVersion", "versions": "affectedVersion", "issuelinks": "issueLink", "labels": "labels",
               "components": "component", "parent": "parent"}


def _tipo_valor(v):
    if isinstance(v, list):
        return "lista de " + (_tipo_valor(v[0]) if v else "nada")
    if isinstance(v, dict):
        return "objeto(" + ",".join(k for k in ("id", "key", "name", "value") if k in v) + ")"
    return type(v).__name__


class ClienteJira:
    """REST de Jira Data Center (/rest/api/2) con la sesión de la persona."""

    def __init__(self, url, auth, proxy="", ca="", timeout=30, renovar=None):
        self.url = str(url or "").rstrip("/")
        self.auth = auth  # ("token", token), ("usuario", usuario, clave) o ("cookie", cabecera Cookie)
        self.renovar = renovar  # con cookie: vuelve a sacar la sesión del navegador si caduca (-> auth nueva o None)
        self.timeout = timeout
        ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
        manejadores = [urllib.request.HTTPSHandler(context=ctx)]
        if proxy:
            manejadores.append(urllib.request.ProxyHandler({"https": proxy, "http": proxy}))
        self._abrir = urllib.request.build_opener(*manejadores)
        self.llamadas = 0
        self.registro = []  # (método, forma de la ruta, estado, ms): para el diagnóstico

    def _cabeceras(self):
        h = {"Accept": "application/json", "User-Agent": "monitor-pases/" + VERSION, "X-Atlassian-Token": "no-check"}
        if self.auth and self.auth[0] == "token":
            h["Authorization"] = "Bearer " + self.auth[1]
        elif self.auth and self.auth[0] == "usuario":
            h["Authorization"] = "Basic " + base64.b64encode(("%s:%s" % (self.auth[1], self.auth[2])).encode()).decode()
        elif self.auth and self.auth[0] == "cookie":
            h["Cookie"] = self.auth[1]
        return h

    def pedir(self, metodo, ruta, params=None, cuerpo=None):
        try:
            return self._pedir(metodo, ruta, params, cuerpo)
        except ErrorGHE as e:
            if e.estado != 401 or not self.renovar or not self.auth or self.auth[0] != "cookie":
                raise
            nueva, self.renovar = self.renovar(), None  # una vez
            if not nueva:
                raise
            self.auth = nueva
            return self._pedir(metodo, ruta, params, cuerpo)

    def _pedir(self, metodo, ruta, params=None, cuerpo=None):
        u = self.url + "/" + ruta.lstrip("/")
        if params:
            u += "?" + urllib.parse.urlencode(params)
        h = self._cabeceras()
        datos = None
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode("utf-8")
            h["Content-Type"] = "application/json"
        req = urllib.request.Request(u, data=datos, headers=h, method=metodo)
        t0 = time.time()
        try:
            with self._abrir.open(req, timeout=self.timeout) as r:
                estado, cab, b = r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
        except urllib.error.HTTPError as e:
            estado, cab = e.code, {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}
            try:
                b = e.read()
            except Exception:
                b = b""
        except (urllib.error.URLError, OSError, ssl.SSLError) as e:
            msg, pista = _diagnostico(e)
            raise ErrorGHE(msg.replace("GitHub", "Jira"), url=u, pista=pista)
        self.llamadas += 1
        self.registro.append((metodo, re.sub(r"[A-Z][A-Z0-9_]+-\d+|\d{3,}", "N", ruta.split("?")[0]), estado, int((time.time() - t0) * 1000)))
        if "text/html" in cab.get("content-type", "") and estado < 300:
            # Una página de inicio de sesión (SSO) en lugar de datos: la sesión no vale para la API.
            raise ErrorGHE("Jira ha contestado con una página de inicio de sesión en vez de datos.", 401, u,
                           "Vuelve a entrar con «Iniciar sesión en Jira».")
        if estado >= 300:
            raise self._error(estado, cab, b, u)
        return json.loads(b.decode("utf-8") or "null") if b else None

    def _error(self, estado, cab, b, u):
        try:
            d = json.loads(b.decode("utf-8") or "{}")
            msgs = list(d.get("errorMessages") or []) + ["%s: %s" % kv for kv in (d.get("errors") or {}).items()]
        except Exception:
            msgs = []
        motivo = cab.get("x-authentication-denied-reason", "")
        if estado == 401:
            if self.auth and self.auth[0] == "cookie":
                return ErrorGHE("La sesión de Jira ha caducado.", 401, u, "Vuelve a entrar con «Iniciar sesión en Jira».")
            return ErrorGHE("Jira no acepta la sesión (token o contraseña caducados o incorrectos).", 401, u,
                            "Vuelve a conectar Jira.")
        if estado == 403 and "CAPTCHA" in motivo.upper():
            return ErrorGHE("Jira pide un CAPTCHA por demasiados intentos fallidos.", 403, u,
                            "Entra una vez en la web de Jira con tu usuario y vuelve a probar.")
        if estado == 403:
            return ErrorGHE("Jira no te deja ver eso (sin permiso).", 403, u, None)
        if estado == 404:
            return ErrorGHE("No existe en Jira.", 404, u, None)
        e = ErrorGHE("Jira ha contestado %s%s" % (estado, (": " + "; ".join(msgs)[:400]) if msgs else ""), estado, u, None)
        e.mensajes = msgs
        return e

    def get(self, ruta, params=None):
        return self.pedir("GET", ruta, params)

    def buscar(self, jql, campos, maximo=1000):
        """Issues de una JQL (paginando)."""
        out, inicio = [], 0
        while inicio < maximo:
            d = self.pedir("POST", "rest/api/2/search", cuerpo={"jql": jql, "startAt": inicio, "maxResults": min(100, maximo - inicio),
                                                                 "fields": campos}) or {}
            lote = d.get("issues") or []
            out += lote
            inicio += len(lote)
            if not lote or inicio >= (d.get("total") or 0):
                break
        return out


def _nombre_nav(exe):
    """«Chrome», «Edge» o el nombre del ejecutable (sin la ruta: no hace falta en la página)."""
    if not exe:
        return ""
    if navegador.es_edge(exe):
        return "Edge"
    b = exe.replace("\\", "/").rsplit("/", 1)[-1].lower()
    return "Chrome" if "chrome" in b else "Chromium" if "chromium" in b else b.rsplit(".", 1)[0]


class Jira:
    def __init__(self, config, monitor, demo=False):
        self.cfg, self.mon, self.demo = config, monitor, demo
        self.ruta = config.dir / "jira.json"
        d = leer_json(self.ruta, {}) or {}
        self.issues = d.get("issues", {})       # clave -> issue (compacto)
        self.features = d.get("features", {})   # clave -> feature (compacto, con SDATOOL e historias)
        self.releases = d.get("releases", [])   # versiones del proyecto de releases
        self.rel_historias = d.get("relHistorias", {})  # id de versión -> claves de historias (tech-version)
        self.campos = d.get("campos", {})       # feature / techVersion / sdatool detectados
        # Hasta la 1.6.0 un error de la consulta marcaba todas las claves como inexistentes: se olvidan.
        self.no_existen = set(d.get("noExisten", [])) if d.get("noExistenV") == 2 else set()
        self.ultima_completa = d.get("ultimaCompleta", 0)
        self.sincro = d.get("sincro") or {"estado": "nunca"}
        self.metodo = d.get("metodo") or ""  # "navegador" si la última sesión fue con el navegador (sin secretos)
        self.nav_ultimo = d.get("navegador") or ""  # ruta del último navegador con el que se entró (se abre ese primero)
        self.desarrollo = d.get("desarrollo", [])  # proyectos en desarrollo: Features/Tasks no desplegadas (compactos)
        self.desarrollo_info = d.get("desarrolloInfo") or {}
        self.nfq = d.get("nfq") or {"claves": [], "por": "", "fecha": ""}  # los proyectos que son de NFQ
        if self.sincro.get("estado") == "en curso":
            self.sincro["estado"] = "interrumpida"
        self.sesion = {"estado": "sin sesión"}
        self._auth = None
        self._c = threading.RLock()
        self._en_curso = False
        self._informes = {}
        self._entrando = False
        self._intento = 0  # cada «Iniciar sesión» o «Navegador nuevo» es un intento; el último manda
        self._en_ventana = False  # hay un hilo con la ventana de Jira abierta
        self._cancelar = threading.Event()  # puesto = deja el intento con ventana (se va a abrir uno nuevo)
        self._silencioso = threading.Event()  # puesto = no hay un intento sin ventana en marcha
        self._silencioso.set()
        self._parar_silencioso = threading.Event()  # puesto = deja el intento sin ventana (la persona va a entrar)
        self.perfil = config.dir / "navegador-jira"

    # ── sesión ──────────────────────────────────────────────────────────────
    def _host(self):
        return urllib.parse.urlparse(self.cfg.get()["jira"].get("url") or "").netloc

    def _cliente(self, auth=None, renovable=True):
        j = self.cfg.get()["jira"]
        b = self.cfg.get()["bbva"]
        auth = auth or self._auth
        renovar = self._renovar if renovable and auth and auth[0] == "cookie" and self.metodo == "navegador" else None
        return ClienteJira(j.get("url"), auth, j.get("proxy") or b.get("proxy"), j.get("ca") or b.get("ca"), renovar=renovar)

    # Con el navegador: se abre Chrome o Edge (perfil de la app), la persona entra con su SSO y se recogen las cookies de Jira.
    def _url_entrar(self):
        return (self.cfg.get()["jira"].get("url") or "").rstrip("/") + "/secure/ViewProfile.jspa"

    def _por_navegador(self, visible, espera=300, nuevo=False, usado=None):
        j = self.cfg.get()["jira"]
        url = (j.get("url") or "").rstrip("/")
        # Sin ventana, se deja en cuanto alguien pulsa «Iniciar sesión en Jira»; con ventana, si pide una nueva.
        parar = self._cancelar.is_set if visible else self._parar_silencioso.is_set
        return navegador.iniciar_sesion(self.perfil, self._url_entrar(), url + "/rest/api/2/myself",
                                        lambda cab: self._probar(("cookie", cab)), visible=visible, espera=espera,
                                        ruta_nav=j.get("navegador") or "", parar=parar, preferido=self.nav_ultimo,
                                        nuevo=nuevo, usado=usado)

    def _renovar(self):
        """La cookie ha caducado. No se comprueba nada por detrás (sin ventana se perdía mucho tiempo): se avisa
        y la persona pulsa «Iniciar sesión en Jira»; con el SSO recordado en el perfil, la ventana entra y se cierra sola.
        -> None (la llamada que ha fallado no se repite)."""
        with self._c:
            if self._auth and self._auth[0] == "cookie":
                self._auth = None
                self.sesion = {"estado": "sin sesión", "aviso": "La sesión de Jira ha caducado: pulsa «Iniciar sesión en Jira»."}
        return None

    def conectar_navegador(self, nuevo=False):
        """Abre la ventana para entrar en Jira y vuelve enseguida; la página pregunta cómo va (sesion.estado).
        Se abre en el último navegador con el que se entró. `nuevo`: deja el intento que haya en marcha, cierra
        los navegadores de la app que sigan abiertos y abre uno nuevo."""
        if not (self.cfg.get()["jira"].get("url")):
            raise ValueError("Pon la dirección de Jira en Ajustes → Jira.")
        with self._c:
            if self._entrando and not nuevo:
                return self.publica()
            self._intento += 1
            intento = self._intento
            if self._entrando:
                self._cancelar.set()
            self._entrando = True
            self.sesion = {"estado": "entrando", "mensaje": "Se ha abierto una ventana de Jira: entra como siempre. Se cerrará sola."}
            self._parar_silencioso.set()  # si se estaba comprobando sin ventana, se deja ya

        def trabajo():
            fin = time.time() + 20
            while self._en_ventana and time.time() < fin:  # que acabe (y cierre su ventana) el intento anterior
                time.sleep(0.2)
            with self._c:
                if intento != self._intento or self.sesion.get("estado") == "iniciada":
                    return
                self._en_ventana = True
                self._cancelar.clear()
            usado = {}
            try:
                self._silencioso.wait(15)  # lo que tarde en soltar el perfil una comprobación sin ventana
                cab, yo = self._por_navegador(True, nuevo=nuevo, usado=usado)
                self._iniciada(("cookie", cab), yo)
                with self._c:
                    self.metodo = "navegador"
                    self.nav_ultimo = usado.get("exe") or self.nav_ultimo
                self.guardar()
                threading.Thread(target=self.sincronizar, name="jira", daemon=True).start()
            except Exception as e:
                with self._c:
                    if intento == self._intento and self.sesion.get("estado") != "iniciada":
                        self.sesion = {"estado": "sin sesión", "aviso": str(e), "fallo": "navegador"}
            finally:
                with self._c:
                    self._en_ventana = False
                    if intento == self._intento:
                        self._entrando = False

        threading.Thread(target=trabajo, name="jira-navegador", daemon=True).start()
        return self.publica()

    def publica(self):
        with self._c:
            return dict(self.sesion)

    def _probar(self, auth):
        # Sin renovar: probar una cookie nunca debe abrir otro navegador (eso abría pestañas sin fin).
        return self._cliente(auth, renovable=False).get("rest/api/2/myself") or {}

    def _iniciada(self, auth, yo):
        with self._c:
            self._auth = auth
            self.sesion = {"estado": "iniciada", "usuario": yo.get("name") or yo.get("key") or "", "nombre": yo.get("displayName") or "",
                           "metodo": "navegador" if auth[0] == "cookie" else auth[0], "desde": time.strftime("%H:%M")}

    def iniciar_guardada(self):
        """Al arrancar: la sesión guardada en Git (si la hay), sin abrir nada."""
        j = self.cfg.get()["jira"]
        if not j.get("url"):
            return False
        if self.demo and not j.get("token"):
            return False  # en la demo se enseña cómo se conecta
        with self._c:
            self.sesion = {"estado": "comprobando"}
        try:
            return self._iniciar_guardada(j)
        finally:
            with self._c:
                if self.sesion.get("estado") == "comprobando":
                    self.sesion = {"estado": "sin sesión"}

    def _iniciar_guardada(self, j):
        try:
            if j.get("token"):
                auth = ("token", j["token"])
            elif self.metodo == "navegador":
                # Sin comprobar nada (sin ventana se perdía mucho tiempo): el botón abre el navegador de primeras
                # y, con el SSO recordado en su perfil, entra y se cierra solo.
                with self._c:
                    self.sesion = {"estado": "sin sesión"}
                return False
            else:
                d = _git_credencial("fill", self._host(), None, interactiva=False, timeout=30)
                auth = ("token", d["password"]) if d.get("username") == MARCA_TOKEN else ("usuario", d.get("username", ""), d["password"])
            self._iniciada(auth, self._probar(auth))
            return True
        except ErrorGHE as e:
            with self._c:
                self.sesion = {"estado": "sin sesión", "aviso": str(e) if e.estado == 401 else ""}
            return False

    def conectar(self, token=None, usuario=None, clave=None, cookie=None):
        """Con un token personal, usuario y contraseña (se guardan con Git si se puede) o la cookie de sesión
        copiada del navegador (no se guarda: dura lo que la sesión)."""
        token = str(token or "").strip()
        cookie = re.sub(r"^\s*cookie:\s*", "", str(cookie or "").strip(), flags=re.I)
        if cookie:
            cab = cookie if "=" in cookie else "JSESSIONID=" + cookie
            yo = self._probar(("cookie", cab))
            with self._c:
                self.metodo = ""
            self._iniciada(("cookie", cab), yo)
            with self._c:
                self.sesion.update(metodo="cookie", guardada=False)
            threading.Thread(target=self.sincronizar, name="jira", daemon=True).start()
            return self.publica()
        if token:
            auth = ("token", token)
        elif usuario and clave:
            auth = ("usuario", str(usuario).strip(), str(clave))
        else:
            raise ValueError("Pega el token de Jira (o pon usuario y contraseña).")
        yo = self._probar(auth)
        guardado = False
        if not self.demo:
            try:
                _git_credencial("approve", self._host(), MARCA_TOKEN if auth[0] == "token" else auth[1], auth[-1], timeout=30)
                guardado = True
            except ErrorGHE:
                guardado = False
        self._iniciada(auth, yo)
        with self._c:
            self.sesion["guardada"] = guardado or self.demo
            self.metodo = ""
        threading.Thread(target=self.sincronizar, name="jira", daemon=True).start()
        return self.publica()

    def cerrar(self):
        with self._c:
            auth, self._auth = self._auth, None
            self.sesion = {"estado": "sin sesión"}
            self.metodo = ""
        self.guardar()
        if auth and auth[0] == "cookie":
            import shutil
            shutil.rmtree(self.perfil, ignore_errors=True)  # se borra la sesión del navegador de la app
            shutil.rmtree(str(self.perfil) + "-edge", ignore_errors=True)
            return self.publica()
        if auth and not self.demo:
            try:
                _git_credencial("reject", self._host(), MARCA_TOKEN if auth[0] == "token" else auth[1], auth[-1], timeout=30)
            except ErrorGHE:
                pass
        return self.publica()

    # ── campos ──────────────────────────────────────────────────────────────
    def _detectar_campos(self, cli, forzar=False):
        j = self.cfg.get()["jira"]
        if self.campos.get("_fecha", 0) > time.time() - 86400 and not forzar and \
                self.campos.get("_config") == [j.get("campoFeature"), j.get("campoTechVersion")]:
            return self.campos
        todos = cli.get("rest/api/2/field") or []

        def buscar(propio, patrones):
            if propio:
                for f in todos:
                    if propio.lower() in (str(f.get("id")).lower(), str(f.get("name")).lower()):
                        return f
            for pat in patrones:
                for f in todos:
                    if re.fullmatch(pat, str(f.get("name") or ""), re.I):
                        return f
            return None

        resumen = _resumen_campo

        campos = {
            "feature": resumen(buscar(j.get("campoFeature"), [r"feature[ _-]?link", r"epic[ _-]?link", r"parent[ _-]?link", r"feature"])),
            "techVersion": resumen(buscar(j.get("campoTechVersion"), [r"tech[ _-]?version", r"technical[ _-]?version", r"tech.*version"])),
            "sdatool": [resumen(f) for f in todos if re.search(r"sdatool", str(f.get("name") or ""), re.I)],
            "_fecha": time.time(), "_config": [j.get("campoFeature"), j.get("campoTechVersion")],
            "_interesantes": [resumen(f) for f in todos if re.search(
                r"feature|epic|tech|version|sdatool|release|deploy|parent|traspaso|link", str(f.get("name") or ""), re.I)][:60],
        }
        with self._c:
            self.campos = campos
        return campos

    def _versiones_github(self):
        with self.mon._cerrojo:
            return {r.get("release") for r in self.mon.ramas.values() if r.get("release")}

    def _detectar_tv_por_valores(self, cli, forzar=False):
        """Si ningún campo se llama tech-version: el campo cuyos valores coinciden con las releases de GitHub
        (x.y.z de las ramas release/…) en las historias de los commits de esas ramas."""
        if self.campos.get("techVersion") or self.cfg.get()["jira"].get("campoTechVersion"):
            return self.campos.get("techVersion")
        if self.campos.get("_tvProbado", 0) > time.time() - 86400 and not forzar:
            return None
        versiones = self._versiones_github()
        with self.mon._cerrojo:
            ramas = [r for r in self.mon.ramas.values() if r.get("release")]
        claves = []
        for r in ramas:
            for c in r.get("commits") or []:
                claves += [k for k in claves_en(c.get("mensaje")) if k in self.issues and k not in claves]
        puntos, ejemplo = collections.Counter(), {}
        if claves and versiones:
            for i in self._por_claves(cli, claves[:60], ["*all"]):
                for fid, v in (i.get("fields") or {}).items():
                    if fid in ("summary", "description", "comment", "issuelinks", "status") or v in (None, "", [], {}):
                        continue
                    if set(RE_VERSION.findall(_texto_valor(v))) & versiones:
                        puntos[fid] += 1
                        ejemplo[fid] = v
        res = None
        if puntos:
            fid, n = puntos.most_common(1)[0]
            if n >= 2:
                todos = {f.get("id"): f for f in cli.get("rest/api/2/field") or []}
                res = _resumen_campo(todos.get(fid) or {"id": fid, "name": fid})
                res.update(detectado="por valores", aciertos=n, muestra=len(claves[:60]))
        with self._c:
            self.campos["techVersion"] = res
            self.campos["_tvProbado"] = time.time()
            self.campos["_tvPuntos"] = [{"id": k, "aciertos": n} for k, n in puntos.most_common(5)]
        return res

    def _proyecto_releases(self, cli):
        """-> (clave del proyecto, versiones). El de Ajustes; si no existe, el proyecto de Jira cuyas versiones
        coinciden con las releases de GitHub entre los que se parecen (contienen su nombre o son los de las features)."""
        j = self.cfg.get()["jira"]
        proy = str(j.get("proyectoReleases") or "").strip().upper()
        probados = []

        def versiones(k):
            try:
                vs = cli.get("rest/api/2/project/%s/versions" % urllib.parse.quote(k)) or []
            except ErrorGHE as e:
                if e.estado not in (400, 403, 404):
                    raise
                vs = None
            nums = {(RE_VERSION.findall(v.get("name") or "") or [""])[0] for v in vs or []}
            probados.append({"proyecto": k, "existe": vs is not None, "versiones": len(vs or []),
                             "coinciden": len(nums & self._versiones_github())})
            return vs

        vs = versiones(proy) if proy else None
        elegido = proy if vs else ""
        if not vs:
            feats, _ = self.claves_de_github()
            cands = collections.Counter(k.split("-")[0] for k in feats)
            try:
                for p in cli.get("rest/api/2/project") or []:
                    k = str(p.get("key") or "")
                    if proy and proy in k:
                        cands[k] += 1
            except ErrorGHE:
                pass
            mejor = None
            for k, _n in cands.most_common(8):
                if k == proy:
                    continue
                v2 = versiones(k)
                if v2 and (not mejor or probados[-1]["coinciden"] > mejor[2]):
                    mejor = (k, v2, probados[-1]["coinciden"])
            if mejor:
                elegido, vs = mejor[0], mejor[1]
        with self._c:
            self.campos["_proyRel"] = {"proyecto": elegido, "configurado": proy, "probados": probados}
        return elegido, vs or []

    # ── proyectos en desarrollo y los de NFQ ────────────────────────────────
    def _proyecto_de_proyectos(self):
        j = self.cfg.get()["jira"]
        return (str(j.get("proyectoProyectos") or "").strip() or (self.campos.get("_proyRel") or {}).get("proyecto")
                or str(j.get("proyectoReleases") or "").strip())

    def _proyectos_en_desarrollo(self, cli):
        """Features y Tasks del proyecto que no están desplegadas (estado Deployed)."""
        j = self.cfg.get()["jira"]
        proy = self._proyecto_de_proyectos()
        if not proy:
            return []
        tipos = [t.strip() for t in str(j.get("tiposProyecto") or "Feature, Task").split(",") if t.strip()]
        fines = [t.strip() for t in str(j.get("estadoFin") or "Deployed, Discarded").split(",") if t.strip()]
        fin = ", ".join(fines)
        campos = list(CAMPOS_BASE) + ([self.campos["feature"]["id"]] if self.campos.get("feature") else [])
        lista_tipos = ", ".join('"%s"' % t.replace('"', "") for t in tipos)
        # Todos (también los terminados, para el histórico): de la consulta más precisa a la más general.
        consultas = [
            ('project = "%s" AND issuetype in (%s) ORDER BY updated DESC' % (proy, lista_tipos), "completa"),
            ('project = "%s" ORDER BY updated DESC' % proy, "sin tipos"),
        ]
        res, usada, error = None, "", ""
        for jql, nombre in consultas:
            try:
                res = cli.buscar(jql, campos, maximo=2000)
                usada = nombre
                break
            except ErrorGHE as e:
                if e.estado != 400:
                    raise
                error = str(e)[:200]
        if res is None:
            with self._c:
                self.desarrollo_info = {"proyecto": proy, "error": error, "fecha": _ahora()}
            return []
        tl, fl = {t.lower() for t in tipos}, {x.lower() for x in fines}
        out = []
        for i in res:
            x = self._compacta(i)
            if usada == "sin tipos" and x["t"].lower() not in tl:
                continue
            y = {k: x[k] for k in ("k", "s", "e", "c", "t", "a", "u")}
            y["fin"] = x["e"].lower() in fl  # Deployed / Discarded: van al histórico
            out.append(y)
        with self._c:
            self.desarrollo = out
            self.desarrollo_info = {"proyecto": proy, "tipos": tipos, "fin": fin, "fines": fines, "consulta": usada, "fecha": _ahora(),
                                    "total": len(out), "activos": len([y for y in out if not y["fin"]])}
        return [y for y in out if not y["fin"]]

    RUTA_NFQ = "equipo/proyectos-nfq.json"

    def _leer_nfq_equipo(self):
        """La selección del equipo en pases-datos (si hay sesión de NFQ). Gana la más reciente."""
        if self.demo:
            return
        try:
            from .pase import cliente_nfq
            cfg = self.cfg.get()
            n = cfg["nfq"]
            cli = cliente_nfq(cfg)
            d = cli.get("repos/%s/contents/%s" % (n["repo"], self.RUTA_NFQ), {"ref": n.get("rama") or "main"}, etag=False)[0] or {}
            remoto = json.loads(base64.b64decode(d.get("content") or "").decode("utf-8") or "{}")
        except Exception:
            return
        claves = [k for k in remoto.get("proyectos") or [] if RE_CLAVE.fullmatch(str(k))]
        if remoto.get("fecha", "") > (self.nfq.get("fecha") or ""):
            with self._c:
                self.nfq = {"claves": sorted(set(claves)), "por": str(remoto.get("por") or "")[:80], "fecha": remoto.get("fecha", ""),
                            "compartido": True}

    def guardar_nfq(self, claves, por=""):
        """Guarda qué proyectos son de NFQ y, con sesión de NFQ, lo comparte en pases-datos (solo las claves)."""
        claves = sorted({str(k).strip().upper() for k in claves or [] if RE_CLAVE.fullmatch(str(k).strip().upper())})
        with self._c:
            self.nfq = {"claves": claves, "por": str(por or "")[:80], "fecha": _ahora(), "compartido": False}
        self.guardar()
        motivo = ""
        if self.demo:
            motivo = ""  # en la demo no se comparte
        else:
            try:
                from .pase import cliente_nfq
                cfg = self.cfg.get()
                n = cfg["nfq"]
                cli = cliente_nfq(cfg)
                rama = n.get("rama") or "main"
                sha = None
                try:
                    sha = (cli.get("repos/%s/contents/%s" % (n["repo"], self.RUTA_NFQ), {"ref": rama}, etag=False)[0] or {}).get("sha")
                except ErrorGHE as e:
                    if e.estado != 404:
                        raise
                contenido = json.dumps({"proyectos": claves, "por": self.nfq["por"], "fecha": self.nfq["fecha"]}, ensure_ascii=False, indent=1) + "\n"
                cuerpo = {"message": "Proyectos de NFQ: %d" % len(claves), "branch": rama,
                          "content": base64.b64encode(contenido.encode("utf-8")).decode("ascii")}
                if sha:
                    cuerpo["sha"] = sha
                cli.escribir("PUT", "repos/%s/contents/%s" % (n["repo"], self.RUTA_NFQ), cuerpo)
                with self._c:
                    self.nfq["compartido"] = True
                self.guardar()
            except Exception as e:
                motivo = "No se ha podido compartir con el equipo (%s). Se ha guardado en tu equipo." % (str(e)[:120] or "sin sesión de NFQ")
        # Los nuevos de NFQ: sus historias y SDATOOL en la siguiente lectura.
        threading.Thread(target=self.sincronizar, kwargs={"completa": True}, name="jira", daemon=True).start()
        return dict(self.nfq, motivo=motivo)

    def _lista_campos(self):
        out = list(CAMPOS_BASE)
        for k in ("feature", "techVersion"):
            if self.campos.get(k):
                out.append(self.campos[k]["id"])
        return out

    # ── issues ──────────────────────────────────────────────────────────────
    def _compacta(self, i):
        f = i.get("fields") or {}
        cf, ct = self.campos.get("feature"), self.campos.get("techVersion")
        feat = f.get(cf["id"]) if cf else None
        if feat is None and isinstance(f.get("parent"), dict):
            feat = f["parent"].get("key")
        st = f.get("status") or {}
        return {"k": i.get("key"), "s": (f.get("summary") or "")[:200], "e": st.get("name") or "",
                "c": ((st.get("statusCategory") or {}).get("key") or ""), "t": (f.get("issuetype") or {}).get("name") or "",
                "a": (f.get("assignee") or {}).get("displayName") or "", "f": _texto_valor(feat) if not isinstance(feat, dict) else feat.get("key") or "",
                "tv": _texto_valor(f.get(ct["id"])) if ct else "", "fv": [v.get("name") for v in f.get("fixVersions") or [] if v.get("name")],
                "u": f.get("updated") or "", "p": (f.get("project") or {}).get("key") or (i.get("key") or "").split("-")[0]}

    def _por_claves(self, cli, claves, campos):
        """Issues de esas claves; las que no existen se apuntan y no se vuelven a pedir."""
        out = []
        claves = [c for c in claves if c not in self.no_existen]
        for n in range(0, len(claves), TROZO):
            lote = claves[n:n + TROZO]
            for _ in range(6):  # quita las claves que Jira no reconoce y repite
                if not lote:
                    break
                try:
                    out += cli.buscar("key in (%s)" % ",".join(lote), campos, maximo=len(lote))
                    break
                except ErrorGHE as e:
                    if e.estado != 400:
                        raise
                    malas = {c for m in getattr(e, "mensajes", []) for c in claves_en(m)} & set(lote)
                    if not malas:  # no dice cuáles: se piden de una en una para separar las buenas
                        buenas = []
                        for c in lote:
                            try:
                                buenas += cli.buscar("key = %s" % c, campos, maximo=1)
                            except ErrorGHE as e2:
                                if e2.estado != 400:
                                    raise
                                # Solo si Jira dice que esa clave no existe; otro error (la consulta en sí) se enseña.
                                if not any(c in m for m in getattr(e2, "mensajes", [])):
                                    raise
                                self.no_existen.add(c)
                        out += buenas
                        break
                    self.no_existen |= malas
                    lote = [c for c in lote if c not in malas]
        return out

    def claves_de_github(self):
        """Claves de Jira que aparecen en GitHub: features de las ramas y claves de los mensajes de commit."""
        feats, historias = set(), collections.Counter()
        patron_dp = (self.cfg.get()["bbva"].get("patronDP") or "")
        with self.mon._cerrojo:
            ramas = list(self.mon.ramas.values())
        for r in ramas:
            for k in (r.get("feature"), r.get("featureRama")):
                if k:
                    feats.add(k)
            for f in r.get("features") or []:
                feats.add(f)
            for c in r.get("commits") or []:
                texto = c.get("mensaje") or ""
                if patron_dp:
                    texto = re.sub(patron_dp, " ", texto)
                for k in claves_en(texto):
                    historias[k] += 1
        for k in feats:  # la feature citada en un mensaje es la feature, no una historia
            historias.pop(k, None)
        return feats, historias

    def _sdatool(self, cli, i):
        """SDATOOL de una feature y dónde está: enlaces, campos, enlaces remotos o descripción."""
        f = i.get("fields") or {}
        for l in f.get("issuelinks") or []:
            otro = l.get("outwardIssue") or l.get("inwardIssue") or {}
            tipo = (l.get("type") or {}).get("name") or "?"
            if RE_SDATOOL.fullmatch(otro.get("key") or "") or RE_ENLACE_SDA.search(tipo):
                return [otro["key"].upper()], "enlace «%s»" % tipo
        for k, v in f.items():
            if k in ("description", "issuelinks", "comment") or v in (None, "", [], {}):
                continue
            m = RE_SDATOOL.findall(json.dumps(v, ensure_ascii=False))
            if m:
                return sorted({x.upper() for x in m}), "campo %s" % k
        try:
            remotos = cli.get("rest/api/2/issue/%s/remotelink" % i["key"]) or []
        except ErrorGHE:
            remotos = []
        m = RE_SDATOOL.findall(json.dumps(remotos, ensure_ascii=False))
        if m:
            return sorted({x.upper() for x in m}), "enlace remoto"
        m = RE_SDATOOL.findall(f.get("description") or "")
        if m:
            return sorted({x.upper() for x in m}), "descripción"
        return [], ""

    def _consulta_release(self, v):
        """JQL de las historias de una versión según el tipo del campo tech-version."""
        ct = self.campos.get("techVersion")
        if not ct:
            return 'fixVersion = %s' % v["id"]
        tipo, items, custom = ct.get("tipo"), ct.get("items"), ct.get("custom") or ""
        ct = dict(ct, jql=SISTEMA_JQL.get(ct.get("id")) or ct["jql"])  # p. ej. un «"Fix Version/s"» guardado por la 1.7.0
        if tipo == "version" or items == "version":
            return "%s = %s" % (ct["jql"], v["id"])
        if tipo == "option" or items == "option" or "select" in custom or "multicheckboxes" in custom:
            return '%s = "%s"' % (ct["jql"], v["nombre"].replace('"', ""))
        num = (RE_VERSION.findall(v["nombre"]) or [v["nombre"]])[0]
        return '%s ~ "\\"%s\\""' % (ct["jql"], num.replace('"', ""))

    # ── sincronización ──────────────────────────────────────────────────────
    def sincronizar(self, completa=False):
        with self._c:
            if self._en_curso or self.sesion.get("estado") != "iniciada":
                return False
            self._en_curso = True
        j = self.cfg.get()["jira"]
        inicio = time.time()
        self.sincro = {"estado": "en curso", "inicio": _ahora()}
        cli = self._cliente()
        try:
            self._detectar_campos(cli)
            campos = self._lista_campos()
            feats, historias = self.claves_de_github()
            refresco = completa or time.time() - self.ultima_completa > REFRESCO_MIN * 60
            pedir = [k for k in historias if refresco or k not in self.issues]
            nuevos = {}
            for i in self._por_claves(cli, sorted(pedir), campos):
                x = self._compacta(i)
                nuevos[x["k"]] = x
            with self._c:
                self.issues.update(nuevos)
            # Features: las de las ramas y las de las historias.
            feats |= {x["f"] for x in self.issues.values() if x.get("f")}
            feats |= set(self.nfq.get("claves") or [])  # los de NFQ, aunque no tengan ramas
            feats = sorted(k for k in feats if RE_CLAVE.fullmatch(k))
            pedir_f = [k for k in feats if refresco or k not in self.features]
            tipos_proy = {t.strip().lower() for t in str(j.get("tiposProyecto") or "Feature, Task").split(",") if t.strip()}
            for _ in range(2):  # una clave de rama que resulta ser una historia: se pide también su feature
                if not pedir_f:
                    break
                completos = self._por_claves(cli, pedir_f, ["*all"])
                pedir_f = []
                for i in list(completos):
                    x = self._compacta(i)
                    if x["t"].lower() not in tipos_proy and x.get("f"):
                        completos.remove(i)
                        with self._c:
                            self.issues[x["k"]] = x
                            self.features.pop(x["k"], None)
                        if x["f"] not in self.features and x["f"] not in feats:
                            pedir_f.append(x["f"])
                            feats.append(x["f"])
                for i in completos:
                    x = self._compacta(i)
                    x["sd"], x["sdDonde"] = self._sdatool(cli, i)
                    x["h"] = (self.features.get(x["k"]) or {}).get("h", [])
                    x["links"] = collections.Counter(((l.get("type") or {}).get("name") or "?") for l in (i.get("fields") or {}).get("issuelinks") or [])
                    with self._c:
                        self.features[x["k"]] = x
            # Historias de cada feature (aunque no tengan commits).
            cf = self.campos.get("feature")
            if cf and feats and refresco:
                hijas = collections.defaultdict(list)
                for n in range(0, len(feats), 40):
                    lote = [k for k in feats[n:n + 40] if k not in self.no_existen]
                    if not lote:
                        continue
                    try:
                        res = cli.buscar("%s in (%s)" % (cf["jql"], ",".join(lote)), campos, maximo=2000)
                    except ErrorGHE as e:
                        if e.estado != 400:
                            raise
                        res = []
                    for i in res:
                        x = self._compacta(i)
                        with self._c:
                            self.issues[x["k"]] = x
                        if x.get("f"):
                            hijas[x["f"]].append(x["k"])
                with self._c:
                    for k in feats:
                        if k in self.features:
                            self.features[k]["h"] = sorted(set(hijas.get(k, [])) | {h for h, x in self.issues.items() if x.get("f") == k})
            # Releases del proyecto y sus historias (tech-version).
            if refresco:
                self._detectar_tv_por_valores(cli)
                campos = self._lista_campos()
            if refresco:
                proy, vs = self._proyecto_releases(cli)
                versiones_gh = self._versiones_github()
                if not vs and self.campos.get("techVersion") and self.campos["techVersion"].get("tipo") != "version" \
                        and self.campos["techVersion"].get("items") != "version":
                    # Sin versiones en Jira, pero la release va en un campo de texto: las releases son las de GitHub.
                    vs = [{"id": "gh-" + v, "name": v, "released": None} for v in versiones_gh]
                rel = [{"id": str(v.get("id")), "nombre": v.get("name") or "", "publicada": bool(v.get("released")),
                        "archivada": bool(v.get("archived")), "fecha": v.get("releaseDate") or "", "inicio": v.get("startDate") or "",
                        "num": (RE_VERSION.findall(v.get("name") or "") or [""])[0]} for v in vs]
                rel.sort(key=lambda v: (v["fecha"] or "9999", v["nombre"]), reverse=True)
                interesan = [v for v in rel if not v["archivada"] and (not v["publicada"] or v["num"] in versiones_gh
                             or (v["fecha"] and v["fecha"] >= (dt.date.today() - dt.timedelta(days=120)).isoformat()))][:40]
                rh = dict(self.rel_historias)
                for v in interesan:
                    try:
                        res = cli.buscar(self._consulta_release(v), campos, maximo=1000)
                    except ErrorGHE as e:
                        if e.estado != 400:
                            raise
                        res = []
                    for i in res:
                        x = self._compacta(i)
                        with self._c:
                            self.issues[x["k"]] = x
                    rh[v["id"]] = sorted(i["key"] for i in res)
                with self._c:
                    self.releases, self.rel_historias = rel, rh
            # Historia -> feature: con esto la app agrupa las ramas y los commits por su feature real.
            with self._c:
                mapa = {k: x["f"] for k, x in self.issues.items() if x.get("f") and RE_CLAVE.fullmatch(x["f"])
                        and (x.get("t") or "").lower() not in tipos_proy}
            self.mon.aplicar_mapa_feature(mapa)
            if refresco:
                self._leer_nfq_equipo()
                self._proyectos_en_desarrollo(cli)
                self.ultima_completa = time.time()
            self.sincro = {"estado": "ok", "fin": _ahora(), "segundos": round(time.time() - inicio, 1), "llamadas": cli.llamadas}
        except ErrorGHE as e:
            self.sincro = {"estado": "error", "fin": _ahora(), "error": e.como_dict()}
            if e.estado == 401:
                with self._c:
                    self.sesion = {"estado": "sin sesión", "aviso": str(e)}
        except Exception as e:  # nunca tumbar la app por Jira
            traceback.print_exc()
            self.sincro = {"estado": "error", "fin": _ahora(), "error": {"mensaje": "Error al leer Jira: %s" % e}}
        finally:
            with self._c:
                self._en_curso = False
            self.guardar()
        return True

    def guardar(self):
        with self._c:
            escribir_json(self.ruta, {"issues": dict(self.issues), "features": dict(self.features), "releases": list(self.releases),
                                      "relHistorias": dict(self.rel_historias), "campos": dict(self.campos),
                                      "noExisten": sorted(self.no_existen), "noExistenV": 2, "ultimaCompleta": self.ultima_completa, "sincro": self.sincro,
                                      "metodo": self.metodo, "navegador": self.nav_ultimo,
                                      "desarrollo": list(self.desarrollo), "desarrolloInfo": dict(self.desarrollo_info), "nfq": dict(self.nfq)})

    # ── para la página ──────────────────────────────────────────────────────
    def vista(self):
        j = self.cfg.get()["jira"]
        with self._c:
            return {"sesion": dict(self.sesion), "url": (j.get("url") or "").rstrip("/"), "pats": PAGINA_PATS,
                    "entrar": self._url_entrar(), "navegador": _nombre_nav(self.nav_ultimo),
                    "proyectoReleases": (self.campos.get("_proyRel") or {}).get("proyecto") or j.get("proyectoReleases") or "", "sincro": dict(self.sincro, enCurso=self._en_curso),
                    "issues": dict(self.issues), "features": {k: {kk: vv for kk, vv in v.items() if kk != "links"} for k, v in self.features.items()},
                    "releases": list(self.releases), "relHistorias": dict(self.rel_historias),
                    "campos": {k: v for k, v in self.campos.items() if not k.startswith("_")},
                    "desarrollo": list(self.desarrollo), "desarrolloInfo": dict(self.desarrollo_info), "nfq": dict(self.nfq)}

    # ── diagnóstico (lo único de Jira que puede salir, y solo si la persona lo envía) ──
    def diagnostico(self):
        cli = self._cliente()
        pruebas = []

        def probar(nombre, f):
            t0 = time.time()
            try:
                r = f()
                pruebas.append({"prueba": nombre, "ok": True, "ms": int((time.time() - t0) * 1000)})
                return r
            except ErrorGHE as e:
                pruebas.append({"prueba": nombre, "ok": False, "estado": e.estado, "error": str(e)[:160]})
                return None

        info = probar("serverInfo", lambda: cli.get("rest/api/2/serverInfo")) or {}
        probar("myself", lambda: cli.get("rest/api/2/myself"))
        campos = probar("campos", lambda: self._detectar_campos(cli, forzar=True)) or self.campos
        _, una = self.claves_de_github()
        if una:  # una búsqueda real, para ver si la consulta en sí funciona
            k = sorted(una)[0]
            probar("buscar una clave", lambda: len(cli.buscar("key = %s" % k, ["summary"], maximo=1)))
        probar("campo de la release por valores", lambda: self._detectar_tv_por_valores(cli, forzar=True))
        campos = self.campos
        proy_det = probar("proyecto de releases", lambda: self._proyecto_releases(cli)) or ("", [])
        feats, historias = self.claves_de_github()
        por_proy = collections.Counter(k.split("-")[0] for k in historias)
        with self._c:
            issues, features = dict(self.issues), dict(self.features)
        conocidas = [issues[k] for k in historias if k in issues]
        hist_feature = [x for x in issues.values() if x.get("f")]
        tvs = [x["tv"] for x in issues.values() if x.get("tv")]
        # Prueba de las consultas de release con la primera versión de cada tipo.
        proy, vs = proy_det
        versiones_gh = sorted({r.get("release") for r in self.mon.ramas.values() if r.get("release")})
        consultas = []
        for v in [x for x in (vs or []) if not x.get("archived")][-3:]:
            vv = {"id": str(v.get("id")), "nombre": v.get("name") or ""}
            jql = self._consulta_release(vv)
            n = probar("historias de una versión", lambda: len(cli.buscar(jql, ["summary"], maximo=200)))
            consultas.append({"jql": re.sub(r'= \d+|"[^"]*"', lambda m: "= <id>" if m.group().startswith("=") else '"<versión>"', jql),
                              "resultados": n})
            # Alternativa por fixVersion, para comparar.
            n2 = probar("historias por fixVersion", lambda: len(cli.buscar("fixVersion = %s" % vv["id"], ["summary"], maximo=200)))
            consultas.append({"jql": "fixVersion = <id>", "resultados": n2})
        nombres_v = [v.get("name") or "" for v in vs or []]
        nums_jira = {(RE_VERSION.findall(n) or [""])[0] for n in nombres_v}
        sincro_log = []
        try:
            with open(self.cfg.dir / "sincro.log", encoding="utf-8") as f:
                sincro_log = [l.rstrip("\n") for l in f.readlines()[-30:]]
        except OSError:
            pass
        informe = {
            "formato": "monitor-pases/diagnostico-jira-3", "app": VERSION, "fecha": _ahora(),
            "servidor": {"version": info.get("version"), "tipo": info.get("deploymentType")},
            "sesion": {"metodo": (self.sesion or {}).get("metodo"), "estado": (self.sesion or {}).get("estado")},
            "pruebas": pruebas,
            "llamadas": [{"metodo": m, "ruta": r, "estado": e, "ms": ms} for m, r, e, ms in cli.registro[-40:]] if hasattr(cli, "registro") else [],
            "campos": {"feature": campos.get("feature"), "techVersion": campos.get("techVersion"), "sdatool": campos.get("sdatool"),
                       "otrosQuePuedenServir": campos.get("_interesantes")},
            "claves": {"enCommits": len(historias), "porProyecto": dict(por_proy.most_common(15)), "existen": len(conocidas),
                       "noExisten": len([k for k in historias if k in self.no_existen]), "featuresEnRamas": len(feats)},
            "tipos": dict(collections.Counter(x["t"] for x in issues.values()).most_common(12)),
            "estados": dict(collections.Counter(x["c"] for x in issues.values())),
            "feature": {"historiasConFeature": len(hist_feature), "historias": len(issues),
                        "formas": dict(collections.Counter(forma(x["f"]) for x in hist_feature).most_common(5))},
            "techVersion": {"historiasConValor": len(tvs), "formas": dict(collections.Counter(forma(t) for t in tvs).most_common(10))},
            "sdatool": {"features": len(features), "conSdatool": len([f for f in features.values() if f.get("sd")]),
                        "donde": dict(collections.Counter(f.get("sdDonde") or "no encontrado" for f in features.values())),
                        "formas": dict(collections.Counter(forma(f["sd"][0]) for f in features.values() if f.get("sd")).most_common(8)),
                        "ramasPorCommits": len([r for r in self.mon.ramas.values() if r.get("feature") and not r.get("featureRama")
                                                and not r.get("release") and not r.get("esBase")]),
                        "tiposDeEnlaceEnFeatures": dict(sum((collections.Counter(f.get("links") or {}) for f in features.values()), collections.Counter()).most_common(10))},
            "techVersionPorValores": campos.get("_tvPuntos"),
            "desarrollo": {k: v for k, v in self._diag_desarrollo(cli, probar).items()},
            "releases": {"proyecto": proy, "probados": (campos.get("_proyRel") or {}).get("probados"), "versiones": len(vs or []), "publicadas": len([v for v in vs or [] if v.get("released")]),
                         "formasNombre": dict(collections.Counter(forma(n) for n in nombres_v).most_common(10)),
                         "versionesGitHub": len(versiones_gh), "formasGitHub": dict(collections.Counter(forma(v) for v in versiones_gh).most_common(5)),
                         "coincidenConGitHub": len(set(versiones_gh) & nums_jira), "consultas": consultas},
            "github": {"sincroLog": sincro_log, "dps": self._diag_dps(versiones_gh, nums_jira)},
        }
        ident = "%d" % (time.time() * 1000)
        self._informes = {ident: informe}
        return {"id": ident, "informe": informe}

    def _diag_dps(self, versiones_gh, nums_jira):
        """Cómo cuadran los DPs con GitHub y con Jira (solo cifras)."""
        with self.mon._cerrojo:
            ds = [dict(v) for v in self.mon.dps_info.values()]
        rel = [d for d in ds if d.get("release")]
        return {"total": len(ds), "deRelease": len(rel), "congelados": len([d for d in ds if d.get("congelado")]),
                "frente": dict(collections.Counter(forma(d.get("frente") or "") for d in ds)),
                "sinContenido": len([d for d in ds if d.get("comprobadoContenido") is False]),
                "conFicherosIgualesEnProduccion": len([d for d in ds if any(f.get("igualProduccion") for f in d.get("ficheros") or [])]),
                "produccionPorDelante": len([d for d in ds if (d.get("soloProduccion") or {}).get("commits")]),
                "pisariaProduccion": len([d for d in ds if (d.get("soloProduccion") or {}).get("enComun")]),
                "yaEnProduccionAlVerlo": len([d for d in ds if d.get("yaEnProduccion")]),
                "truncados": len([d for d in ds if d.get("truncado")]),
                "releasesSinVersionEnJira": len({d["release"] for d in rel} - set(nums_jira)),
                "releasesGitHub": len(versiones_gh)}

    def _diag_desarrollo(self, cli, probar):
        probar("proyectos en desarrollo", lambda: self._proyectos_en_desarrollo(cli))
        out = list(self.desarrollo)
        info = dict(self.desarrollo_info)
        return {"proyecto": info.get("proyecto"), "consulta": info.get("consulta"), "error": info.get("error"), "total": len(out or []),
                "tipos": dict(collections.Counter(x["t"] for x in out or [])), "estados": dict(collections.Counter(x["e"] for x in out or [])),
                "historico": len([x for x in out if x.get("fin")]),
                "marcadosNFQ": len(self.nfq.get("claves") or [])}

    def enviar_diagnostico(self, ident, usuario=""):
        """Sube el informe que la persona ha visto (por su id) a pases-datos/diagnostico/."""
        informe = self._informes.get(ident)
        if not informe:
            raise ValueError("Vuelve a generar el diagnóstico antes de enviarlo.")
        if self.demo:
            return {"ok": True, "fichero": "(en la demo no se envía)"}
        from .pase import cliente_nfq
        cfg = self.cfg.get()
        n = cfg["nfq"]
        cli = cliente_nfq(cfg)
        destino = "diagnostico/jira-%s.json" % time.strftime("%Y%m%d-%H%M%S")
        contenido = json.dumps(informe, ensure_ascii=False, indent=1) + "\n"
        r = cli.escribir("PUT", "repos/%s/contents/%s" % (n["repo"], destino), {
            "message": "Diagnóstico de Jira (monitor-pases %s)" % VERSION, "branch": n.get("rama") or "main",
            "content": base64.b64encode(contenido.encode("utf-8")).decode("ascii")})
        return {"ok": True, "fichero": ((r or {}).get("content") or {}).get("html_url") or destino}
