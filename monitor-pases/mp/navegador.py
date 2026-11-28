"""Inicio de sesión en una web con el navegador de la persona (Chrome o, si no, Edge),
para cuando no hay tokens: se abre una ventana con un perfil propio de la app,
la persona entra como siempre (SSO) y la app recoge las cookies de esa web por
el protocolo de DevTools, solo en 127.0.0.1. Después cierra la ventana.

El perfil (carpeta de la app) guarda la sesión del SSO como cualquier
navegador, cifrada por el propio navegador: en el siguiente arranque la app
lo intenta sin ventana (headless) y solo abre la ventana si hace falta entrar.

Solo librería estándar: el cliente de WebSocket es el mínimo para DevTools.
"""

import base64
import glob
import json
import os
import shutil
import socket
import struct
import subprocess
import time
import urllib.parse
import urllib.request

SIN_VENTANA = getattr(subprocess, "CREATE_NO_WINDOW", 0)


class ErrorNavegador(Exception):
    pass


def buscar_navegador(propio=""):
    """Ruta de Chrome o, si no está, Edge (que siempre está en Windows)."""
    xs = buscar_navegadores(propio)
    return xs[0] if xs else None


def es_edge(exe):
    return "edge" in os.path.basename(os.path.dirname(os.path.dirname(exe or ""))).lower() or "msedge" in os.path.basename(exe or "").lower() \
        or "microsoft-edge" in os.path.basename(exe or "").lower()


def buscar_navegadores(propio="", preferido=""):
    """Los navegadores que se pueden usar, en orden: el de Ajustes, el último con el que se entró, Chrome y Edge
    (si uno no puede, se prueba el siguiente)."""
    if propio and os.path.isfile(propio):
        return [propio]
    xs = _navegadores()
    if preferido in xs:
        xs.remove(preferido)
        xs.insert(0, preferido)
    return xs


def _navegadores():
    e = os.environ.get
    if os.name == "nt":
        cands = []
        for base in (e("ProgramFiles(x86)"), e("ProgramFiles"), e("LOCALAPPDATA")):
            if base:
                cands += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                          os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
        cands.sort(key=lambda c: "Google" not in c)  # Chrome primero
    else:
        cands = [shutil.which(n) or "" for n in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge")]
        cands += sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    return list(dict.fromkeys(c for c in cands if c and os.path.isfile(c)))


class _WS:
    """WebSocket mínimo (cliente, texto, sin extensiones) para el DevTools del navegador."""

    def __init__(self, puerto, ruta, timeout=10):
        self.s = socket.create_connection(("127.0.0.1", puerto), timeout=timeout)
        clave = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET %s HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (ruta, puerto, clave)).encode())
        cab = b""
        while b"\r\n\r\n" not in cab:
            trozo = self.s.recv(4096)
            if not trozo:
                raise ErrorNavegador("El navegador ha cerrado la conexión de DevTools.")
            cab += trozo
        cab, self.resto = cab.split(b"\r\n\r\n", 1)
        if b" 101 " not in cab.split(b"\r\n", 1)[0]:
            raise ErrorNavegador("El navegador no acepta la conexión de DevTools: %s" % cab.split(b"\r\n", 1)[0].decode(errors="replace"))
        self.n = 0
        self.reusado = False  # True: el navegador ya estaba abierto (no lo ha abierto esta llamada)

    def _leer(self, n):
        while len(self.resto) < n:
            trozo = self.s.recv(65536)
            if not trozo:
                raise ErrorNavegador("El navegador se ha cerrado.")
            self.resto += trozo
        d, self.resto = self.resto[:n], self.resto[n:]
        return d

    def _enviar(self, opcode, datos):
        m = os.urandom(4)
        n = len(datos)
        cab = bytes([0x80 | opcode]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n)
                                       if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.s.sendall(cab + m + bytes(b ^ m[i % 4] for i, b in enumerate(datos)))

    def recibir(self):
        partes = b""
        while True:
            b0, b1 = self._leer(2)
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._leer(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._leer(8))[0]
            m = self._leer(4) if b1 & 0x80 else None
            datos = self._leer(n)
            if m:
                datos = bytes(b ^ m[i % 4] for i, b in enumerate(datos))
            op = b0 & 0x0F
            if op == 8:
                raise ErrorNavegador("El navegador se ha cerrado.")
            if op == 9:
                self._enviar(10, datos)
                continue
            if op in (0, 1, 2):
                partes += datos
                if b0 & 0x80:
                    return partes.decode("utf-8", errors="replace")

    def llamar(self, metodo, params=None):
        self.n += 1
        self._enviar(1, json.dumps({"id": self.n, "method": metodo, "params": params or {}}).encode())
        while True:
            r = json.loads(self.recibir())
            if r.get("id") == self.n:
                if "error" in r:
                    raise ErrorNavegador("DevTools: %s" % r["error"].get("message"))
                return r.get("result") or {}

    def cerrar(self):
        try:
            self.s.close()
        except OSError:
            pass


def _cookies_de(cookies, url):
    """Cabecera Cookie con las que el navegador mandaría a `url`."""
    u = urllib.parse.urlparse(url)
    host, ruta = u.hostname or "", u.path or "/"
    out = []
    for c in cookies:
        d = str(c.get("domain") or "").lower()
        if not (host == d.lstrip(".") or (d.startswith(".") and host.endswith(d))):
            continue
        if not ruta.startswith(c.get("path") or "/"):
            continue
        out.append("%s=%s" % (c.get("name"), c.get("value")))
    return "; ".join(out)


class Navegador:
    def __init__(self, perfil, ruta_nav="", preferido=""):
        self.perfil = str(perfil)
        self.ruta_nav = ruta_nav
        self.preferido = preferido
        self.proc = None
        self.exe = ""  # el navegador que se ha usado

    def _dir(self, exe):
        # Cada navegador, su perfil: Chrome en la carpeta de siempre y Edge en otra (mezclarlos la estropea).
        return self.perfil + "-edge" if es_edge(exe) else self.perfil

    def _puerto_activo(self, carpeta=None):
        """(puerto, ruta, sin_ventana) del navegador de la app que sigue abierto con ese perfil, o None."""
        f = os.path.join(carpeta or self.perfil, "DevToolsActivePort")
        try:
            with open(f, encoding="utf-8") as h:
                puerto, ruta = h.read().split("\n")[:2]
            v = json.loads(urllib.request.urlopen("http://127.0.0.1:%s/json/version" % puerto, timeout=2).read() or b"{}")
            return int(puerto), ruta.strip(), "headless" in str(v.get("User-Agent") or "").lower()
        except (OSError, ValueError):
            return None

    def abrir(self, url, visible=True, espera=25):
        """Abre `url` en el perfil de la app con DevTools en un puerto libre de 127.0.0.1. -> _WS del navegador.
        Chrome primero; si no arranca o no deja leer la sesión, Edge.
        Si ya hay un navegador de la app abierto con ese perfil, se usa ese (nunca se apilan pestañas):
        - sin ventana: solo se leen sus cookies, no se abre nada;
        - con ventana: se trae al frente la pestaña de esa web (o se abre una, si no la hay). Si el que
          queda abierto es uno sin ventana (de una comprobación anterior), se cierra y se abre uno normal."""
        exes = buscar_navegadores(self.ruta_nav, self.preferido)
        if not exes:
            raise ErrorNavegador("No se encuentra Google Chrome ni Microsoft Edge.")
        for exe in exes:
            ya = self._puerto_activo(self._dir(exe))
            if not ya:
                continue
            puerto, ruta, sin_ventana = ya
            ws = _WS(puerto, ruta)
            ws.reusado = True
            self.exe = exe
            if not visible:
                return ws
            if sin_ventana:
                try:
                    ws.llamar("Browser.close")
                except (OSError, ErrorNavegador):
                    pass
                ws.cerrar()
                time.sleep(1)
                continue
            self._pestana(ws, url)
            return ws
        for exe in exes:
            ws = self._lanzar(exe, url, visible, espera)
            if ws:
                self.exe = exe
                return ws
        raise ErrorNavegador("El navegador no deja que la app lea la sesión (puede que lo impida una política de la empresa).")

    @staticmethod
    def _pestana(ws, url):
        """Trae al frente la pestaña de la web de `url` si ya está abierta; si no, abre una (solo una)."""
        host = urllib.parse.urlparse(url).hostname or ""
        try:
            for t in ws.llamar("Target.getTargets").get("targetInfos") or []:
                if t.get("type") == "page" and host and (urllib.parse.urlparse(t.get("url") or "").hostname or "") == host:
                    ws.llamar("Target.activateTarget", {"targetId": t["targetId"]})
                    return
        except ErrorNavegador:
            pass
        ws.llamar("Target.createTarget", {"url": url})

    def _lanzar(self, exe, url, visible, espera):
        carpeta = self._dir(exe)
        os.makedirs(carpeta, exist_ok=True)
        try:
            os.remove(os.path.join(carpeta, "DevToolsActivePort"))
        except OSError:
            pass
        args = [exe, "--remote-debugging-port=0", "--user-data-dir=" + carpeta, "--no-first-run",
                "--no-default-browser-check", "--disable-features=msEdgeWelcomePage"]
        if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() == 0:
            args.append("--no-sandbox")
        args += ([url] if visible else ["--headless=new", url])  # visible: una ventana normal, con su pestaña
        try:
            self.proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                         creationflags=0 if visible else SIN_VENTANA)
        except OSError:
            return None  # no se puede ejecutar: el siguiente
        fin = time.time() + espera
        while time.time() < fin:
            ya = self._puerto_activo(carpeta)
            if ya:
                try:
                    return _WS(*ya[:2])
                except (OSError, ErrorNavegador):
                    break
            if self.proc.poll() is not None and not os.path.exists(os.path.join(carpeta, "DevToolsActivePort")):
                break
            time.sleep(0.3)
        self.matar()
        return None

    def cerrar_abiertos(self):
        """Cierra los navegadores de la app que sigan abiertos (para empezar con una ventana nueva)."""
        for exe in buscar_navegadores(self.ruta_nav, self.preferido):
            ya = self._puerto_activo(self._dir(exe))
            if not ya:
                continue
            try:
                ws = _WS(*ya[:2])
                try:
                    ws.llamar("Browser.close")
                finally:
                    ws.cerrar()
            except (OSError, ErrorNavegador):
                pass
            for _ in range(20):  # que suelte el perfil
                if not self._puerto_activo(self._dir(exe)):
                    break
                time.sleep(0.25)

    def matar(self):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(5)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass


def iniciar_sesion(perfil, url_entrar, url_api, probar, visible=True, espera=300, ruta_nav="", parar=None, rendirse=10,
                   preferido="", nuevo=False, usado=None):
    """Abre `url_entrar` y espera a que haya cookies de `url_api` con las que `probar(cookie)` funcione
    (no lanza excepción). -> (cookie, lo que devuelve probar). Cierra la ventana al terminar.
    Sin ventana nadie puede entrar: si en `rendirse` segundos las cookies no cambian y no valen, se deja.
    `preferido`: el navegador que se prueba primero (el último con el que se entró); `nuevo`: cierra los de la
    app que sigan abiertos y abre uno nuevo; `usado` (dict): ahí se deja el navegador usado ("exe")."""
    nav = Navegador(perfil, ruta_nav, preferido)
    if nuevo:
        nav.cerrar_abiertos()
    ws = nav.abrir(url_entrar, visible=visible)
    if usado is not None:
        usado["exe"] = nav.exe
    ultima, fin, cambio, ok = None, time.time() + espera, time.time(), False
    try:
        while time.time() < fin:
            if parar and parar():
                raise ErrorNavegador("Cancelado.")
            try:
                cookies = ws.llamar("Storage.getCookies").get("cookies") or []
            except (OSError, ErrorNavegador):
                raise ErrorNavegador("Se ha cerrado la ventana sin terminar de entrar en Jira.")
            cab = _cookies_de(cookies, url_api)
            if cab and cab != ultima:
                ultima, cambio = cab, time.time()
                try:
                    r = cab, probar(cab)
                    ok = True
                    return r
                except Exception:
                    pass  # aún no ha terminado de entrar
            elif not visible and time.time() - cambio > rendirse:
                break  # sin ventana y sin novedades: hace falta entrar
            time.sleep(1 if visible else 0.5)
        raise ErrorNavegador("Ha pasado demasiado tiempo sin entrar en Jira." if visible else "Hace falta entrar en Jira.")
    finally:
        # Se cierra lo que ha abierto esta llamada, y la ventana de entrar cuando ya se ha entrado.
        # Un navegador que ya estaba abierto (la persona entrando en él) no se toca desde una comprobación sin ventana.
        if not ws.reusado or (visible and ok):
            try:
                ws.llamar("Browser.close")
            except Exception:
                pass
        ws.cerrar()
        if not ws.reusado:
            nav.matar()
