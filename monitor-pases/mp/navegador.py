"""Inicio de sesión en una web con el navegador de la persona (Edge o Chrome),
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
    """Ruta de Edge o Chrome (Edge primero: siempre está en Windows)."""
    if propio and os.path.isfile(propio):
        return propio
    e = os.environ.get
    if os.name == "nt":
        cands = []
        for base in (e("ProgramFiles(x86)"), e("ProgramFiles"), e("LOCALAPPDATA")):
            if base:
                cands += [os.path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
                          os.path.join(base, "Google", "Chrome", "Application", "chrome.exe")]
        cands.sort(key=lambda c: "Google" in c)
    else:
        cands = [shutil.which(n) or "" for n in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser")]
        cands += sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    return next((c for c in cands if c and os.path.isfile(c)), None)


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
    def __init__(self, perfil, ruta_nav=""):
        self.perfil = str(perfil)
        self.ruta_nav = ruta_nav
        self.proc = None

    def _puerto_activo(self):
        f = os.path.join(self.perfil, "DevToolsActivePort")
        try:
            with open(f, encoding="utf-8") as h:
                puerto, ruta = h.read().split("\n")[:2]
            urllib.request.urlopen("http://127.0.0.1:%s/json/version" % puerto, timeout=2).read()
            return int(puerto), ruta.strip()
        except (OSError, ValueError):
            return None

    def abrir(self, url, visible=True, espera=25):
        """Abre `url` en el perfil de la app con DevTools en un puerto libre de 127.0.0.1. -> _WS del navegador."""
        os.makedirs(self.perfil, exist_ok=True)
        ya = self._puerto_activo()
        if ya:  # una ventana anterior de la app sigue abierta: se reutiliza
            ws = _WS(*ya)
            ws.llamar("Target.createTarget", {"url": url})
            return ws
        try:
            os.remove(os.path.join(self.perfil, "DevToolsActivePort"))
        except OSError:
            pass
        exe = buscar_navegador(self.ruta_nav)
        if not exe:
            raise ErrorNavegador("No se encuentra Microsoft Edge ni Google Chrome.")
        args = [exe, "--remote-debugging-port=0", "--user-data-dir=" + self.perfil, "--no-first-run",
                "--no-default-browser-check", "--disable-features=msEdgeWelcomePage"]
        if os.name != "nt" and hasattr(os, "geteuid") and os.geteuid() == 0:
            args.append("--no-sandbox")
        args += (["--new-window", "--app=" + url] if visible else ["--headless=new", url])
        self.proc = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                     creationflags=0 if visible else SIN_VENTANA)
        fin = time.time() + espera
        while time.time() < fin:
            ya = self._puerto_activo()
            if ya:
                return _WS(*ya)
            if self.proc.poll() is not None and not os.path.exists(os.path.join(self.perfil, "DevToolsActivePort")):
                break
            time.sleep(0.3)
        self.matar()
        raise ErrorNavegador("El navegador no deja que la app lea la sesión (puede que lo impida una política de la empresa).")

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


def iniciar_sesion(perfil, url_entrar, url_api, probar, visible=True, espera=300, ruta_nav="", parar=None):
    """Abre `url_entrar` y espera a que haya cookies de `url_api` con las que `probar(cookie)` funcione
    (no lanza excepción). -> (cookie, lo que devuelve probar). Cierra la ventana al terminar."""
    nav = Navegador(perfil, ruta_nav)
    ws = nav.abrir(url_entrar, visible=visible)
    ultima, fin = None, time.time() + espera
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
                ultima = cab
                try:
                    return cab, probar(cab)
                except Exception:
                    pass  # aún no ha terminado de entrar
            time.sleep(1.5)
        raise ErrorNavegador("Ha pasado demasiado tiempo sin entrar en Jira." if visible else "Hace falta entrar en Jira.")
    finally:
        try:
            ws.llamar("Browser.close")
        except Exception:
            pass
        ws.cerrar()
        nav.matar()
