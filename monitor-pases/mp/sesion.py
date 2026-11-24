"""Inicio de sesión en GitHub BBVA (GHE) y GitHub NFQ sin registrar nada:
se piden las credenciales a Git (`git credential fill`), que en Windows las
gestiona Git Credential Manager. Si ya hay sesión guardada la devuelve sin
preguntar; si no, abre la ventana de inicio de sesión de GitHub en el
navegador. El token se queda en memoria: la app no lo guarda.
"""

import os
import subprocess
import threading
import time

from .ghe import Cliente, ErrorGHE, api_de_host

SIN_VENTANA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
QUIEN = ("bbva", "nfq")
NOMBRE = {"bbva": "GitHub BBVA", "nfq": "GitHub NFQ"}


def _git_credencial(accion, host, usuario=None, token=None, interactiva=True, timeout=300):
    lineas = ["protocol=https", "host=%s" % host]
    if usuario:
        lineas.append("username=%s" % usuario)
    if token:
        lineas.append("password=%s" % token)
    entrada = "\n".join(lineas) + "\n\n"
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")  # nunca preguntar en la consola
    if not interactiva:
        env["GCM_INTERACTIVE"] = "never"  # solo lo guardado, sin abrir ventanas
    try:
        r = subprocess.run(["git", "credential", accion], input=entrada, capture_output=True, text=True,
                           timeout=timeout, env=env, creationflags=SIN_VENTANA)
    except FileNotFoundError:
        raise ErrorGHE("No se encuentra Git en este equipo.", pista="Usa un token personal en Ajustes → Conexión.")
    except subprocess.TimeoutExpired:
        raise ErrorGHE("Se ha agotado el tiempo para iniciar sesión.", pista="Vuelve a pulsar «Iniciar sesión».")
    if accion != "fill":
        return {}
    datos = dict(l.split("=", 1) for l in r.stdout.splitlines() if "=" in l)
    if r.returncode != 0 or not datos.get("password"):
        err = (r.stderr or "").strip().splitlines()
        raise ErrorGHE("Git no ha devuelto una sesión para %s." % host,
                       pista=("Git dice: " + err[-1] if err else "") + " Comprueba que Git tiene el gestor de credenciales "
                       "(git config --get credential.helper) o usa un token en Ajustes.")
    return datos


class Sesiones:
    def __init__(self, config, demo=False):
        self.cfg, self.demo = config, demo
        self._c = threading.Lock()
        self.estado = {q: {"estado": "sin sesión"} for q in QUIEN}

    def _cliente(self, quien, token):
        s = self.cfg.get()[quien]
        api = s.get("api") or api_de_host(s.get("host") or ("github.com" if quien == "nfq" else ""))
        return Cliente(api, token, s.get("proxy"), s.get("ca"), transporte=s.get("transporte"))

    def publica(self):
        with self._c:
            return {q: {k: v for k, v in e.items() if k != "token"} for q, e in self.estado.items()}

    def token(self, quien):
        with self._c:
            e = self.estado[quien]
            return e.get("token") if e.get("estado") == "iniciada" else None

    def iniciar(self, quien, interactiva=True):
        """Bloquea hasta tener sesión (o error). Se llama desde un hilo."""
        if quien not in QUIEN:
            raise ValueError("Sesión desconocida.")
        with self._c:
            self.estado[quien] = {"estado": "iniciando", "interactiva": interactiva}
        try:
            s = self.cfg.get()[quien]
            host = s.get("host") or ("github.com" if quien == "nfq" else "")
            if self.demo:
                if not interactiva:  # en la demo se enseña la pantalla de inicio de sesión
                    raise ErrorGHE("Sin sesión guardada.")
                time.sleep(0.6)
                datos = {"username": "usuario-demo", "password": "demo"}
            elif s.get("token"):  # token puesto a mano en Ajustes: manda sobre Git
                datos = {"username": "", "password": s["token"]}
            else:
                datos = _git_credencial("fill", host, s.get("usuario") or None, interactiva=interactiva)
            token = datos["password"]
            try:
                if self.demo:  # la demo no sale a la red: ni a GHE ni a github.com
                    yo, cab = {"login": "usuario-demo", "name": "Demo"}, {"x-oauth-scopes": "repo"}
                else:
                    yo, cab = self._cliente(quien, token).get("user", etag=False)
            except ErrorGHE as e:
                if e.estado == 401 and not self.demo:
                    # La credencial guardada ya no vale: se descarta para que la próxima vez pida iniciar sesión.
                    _git_credencial("reject", host, datos.get("username"), token)
                    raise ErrorGHE("La sesión guardada de %s ha caducado." % NOMBRE[quien], pista="Pulsa otra vez «Iniciar sesión».")
                raise
            if not self.demo:
                _git_credencial("approve", host, datos.get("username"), token)
            with self._c:
                self.estado[quien] = {"estado": "iniciada", "usuario": yo.get("login"), "nombre": yo.get("name") or "",
                                      "host": host, "token": token, "alcances": cab.get("x-oauth-scopes"),
                                      "desde": time.strftime("%H:%M")}
            return True
        except ErrorGHE as e:
            with self._c:
                self.estado[quien] = {"estado": "error" if interactiva else "sin sesión", "error": str(e), "pista": e.pista}
            return False

    def iniciar_en_segundo_plano(self, quien, interactiva=True, despues=None):
        def hilo():
            if self.iniciar(quien, interactiva) and despues:
                despues(quien)
        threading.Thread(target=hilo, name="sesion-" + quien, daemon=True).start()

    def cerrar(self, quien, olvidar=False):
        with self._c:
            e = self.estado.get(quien) or {}
            self.estado[quien] = {"estado": "sin sesión"}
        if olvidar and e.get("token") and not self.demo:
            _git_credencial("reject", e.get("host") or "", None, e["token"])
