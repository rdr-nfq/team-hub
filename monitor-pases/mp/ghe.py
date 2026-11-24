"""Cliente mínimo de la API de GitHub (BBVA en bbva.ghe.com o github.com).

- Usa el proxy y los certificados del sistema (urllib en Windows lee los del
  registro y del almacén de Windows). Se pueden forzar con `proxy` y `ca`.
- Peticiones GET con ETag: si nada ha cambiado GitHub contesta 304 y no gasta
  cuota.
- Las redirecciones (logs de las Actions) se siguen a mano y SIN el token:
  el destino es el almacenamiento de GitHub y no debe recibirlo.
"""

import json
import re
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

AGENTE = "monitor-pases"
MAX_LOG = 25 * 1024 * 1024  # no leer más de 25 MB de un log


class ErrorGHE(Exception):
    def __init__(self, mensaje, estado=None, url=None, pista=None):
        super().__init__(mensaje)
        self.estado = estado
        self.url = url
        self.pista = pista

    def como_dict(self):
        return {"mensaje": str(self), "estado": self.estado, "pista": self.pista}


class ErrorCuota(ErrorGHE):
    """Se ha gastado (o casi) la cuota de la API. `reinicio`: cuándo vuelve (epoch)."""
    def __init__(self, reinicio, url=None, estado=None):
        cuando = time.strftime("%H:%M", time.localtime(reinicio)) if reinicio else "dentro de un rato"
        super().__init__("Se ha gastado la cuota de la API de GitHub.", estado, url,
                         "Se recupera a las %s y la sincronización sigue sola entonces." % cuando)
        self.reinicio = reinicio


class _SinRedireccion(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def api_de_host(host):
    """bbva.ghe.com -> https://api.bbva.ghe.com · github.com -> https://api.github.com
    · cualquier otro (GitHub Enterprise Server) -> https://<host>/api/v3"""
    h = re.sub(r"^https?://", "", str(host or "").strip()).strip("/")
    if not h:
        return ""
    if h in ("github.com", "www.github.com"):
        return "https://api.github.com"
    if h.startswith("api."):
        return "https://" + h
    if h.endswith(".ghe.com"):
        return "https://api." + h
    return "https://" + h + "/api/v3"


def web_de_host(host):
    h = re.sub(r"^https?://", "", str(host or "").strip()).strip("/")
    return "https://" + re.sub(r"^api\.", "", h) if h else ""


def _diagnostico(err):
    """Mensaje y pista legibles para un fallo de red."""
    texto = str(getattr(err, "reason", err))
    if "CERTIFICATE_VERIFY_FAILED" in texto or "certificate verify failed" in texto:
        return ("El certificado del servidor no es de confianza para Python.",
                "La red de la VDI inspecciona el tráfico con su propio certificado. Pon en Ajustes → Conexión "
                "la ruta del certificado raíz (.pem/.crt), o el que usa git: git config --get http.sslcainfo")
    if "timed out" in texto or "timeout" in texto.lower():
        return ("El servidor no contesta (tiempo agotado).",
                "Si en la VDI se navega con proxy, pon su dirección en Ajustes → Conexión (git config --get http.proxy).")
    if "Name or service not known" in texto or "getaddrinfo" in texto or "nodename" in texto:
        return ("No se encuentra el servidor.", "Revisa el host en Ajustes y que estés en la VPN.")
    if "407" in texto or "Proxy Authentication" in texto:
        return ("El proxy pide usuario y contraseña.",
                "Prueba con el transporte «curl» en Ajustes → Conexión, que usa tus credenciales de Windows.")
    return ("No se pudo conectar: " + texto, "Comprueba la VPN, el proxy y el host en Ajustes → Conexión.")


class Cliente:
    def __init__(self, api, token, proxy="", ca="", timeout=30, transporte="python", reserva=0):
        self.reserva = reserva  # llamadas de cuota que no gasta (las deja para navegar mientras sincroniza)
        self.api = str(api or "").rstrip("/")
        self.token = str(token or "").strip()
        self.timeout = timeout
        self.transporte = transporte or "python"
        self.proxy = proxy or ""
        self.ca = ca or ""
        ctx = ssl.create_default_context(cafile=ca) if ca else ssl.create_default_context()
        manejadores = [urllib.request.HTTPSHandler(context=ctx)]
        if proxy:
            manejadores.append(urllib.request.ProxyHandler({"https": proxy, "http": proxy}))
        self._abrir = urllib.request.build_opener(*manejadores)
        self._abrir_sin = urllib.request.build_opener(_SinRedireccion, *manejadores)
        self.etags = {}  # url -> [etag, datos]
        self._cerrojo = threading.Lock()
        self.restante = None
        self.reinicio = None
        self.llamadas = 0
        self.ahorradas = 0
        self.usadas = set()  # URLs pedidas en esta sincronización (para podar la caché de ETags)

    # ── transporte ──────────────────────────────────────────────────────────
    def _cabeceras(self, auth, extra=None):
        h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": AGENTE}
        if auth and self.token:
            h["Authorization"] = "Bearer " + self.token
        h.update(extra or {})
        return h

    def _peticion(self, metodo, url, cuerpo=None, cabeceras=None, seguir=True, auth=True, limite=None):
        """-> (estado, cabeceras(dict en minúsculas), bytes). No lanza por HTTP != 2xx."""
        if self.reserva and self.restante is not None and self.restante <= self.reserva and (self.reinicio or 0) > time.time():
            raise ErrorCuota(self.reinicio, url)
        h = self._cabeceras(auth, cabeceras)
        datos = None
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode("utf-8")
            h["Content-Type"] = "application/json"
        if self.transporte == "curl":
            from .curl import peticion_curl
            estado, cab, cuerpo_b = peticion_curl(metodo, url, h, datos, seguir, self.proxy, self.ca, self.timeout)
        else:
            req = urllib.request.Request(url, data=datos, headers=h, method=metodo)
            abrir = self._abrir if seguir else self._abrir_sin
            try:
                with abrir.open(req, timeout=self.timeout) as r:
                    estado, cab, cuerpo_b = r.status, r.headers, r.read(limite or -1)
            except urllib.error.HTTPError as e:
                estado, cab = e.code, e.headers
                try:
                    cuerpo_b = e.read()
                except Exception:
                    cuerpo_b = b""
            except (urllib.error.URLError, OSError, ssl.SSLError) as e:
                msg, pista = _diagnostico(e)
                raise ErrorGHE(msg, url=url, pista=pista)
            cab = {k.lower(): v for k, v in (cab.items() if cab else [])}
        with self._cerrojo:
            self.llamadas += 1
            if "x-ratelimit-remaining" in cab:
                try:
                    self.restante = int(cab["x-ratelimit-remaining"])
                    self.reinicio = int(cab.get("x-ratelimit-reset") or 0)
                except ValueError:
                    pass
        return estado, cab, cuerpo_b

    def _error(self, estado, cab, cuerpo_b, url):
        try:
            msg = json.loads(cuerpo_b.decode("utf-8") or "{}").get("message", "")
        except Exception:
            msg = ""
        if estado == 401:
            return ErrorGHE("El token no es válido o ha caducado.", estado, url,
                            "Crea uno nuevo (solo lectura) y pégalo en Ajustes.")
        sso = cab.get("x-github-sso", "")
        if estado == 403 and sso:
            m = re.search(r"url=(\S+)", sso)
            return ErrorGHE("El token necesita autorización SSO de la organización.", estado, url,
                            "Autorízalo desde: " + (m.group(1) if m else "GitHub → Settings → Tokens → Configure SSO"))
        if estado in (403, 429) and (cab.get("x-ratelimit-remaining") == "0" or "rate limit" in msg.lower()):
            reinicio = int(cab.get("x-ratelimit-reset") or 0)
            if cab.get("retry-after", "").isdigit():  # límite secundario (demasiadas a la vez): esperar lo que diga
                reinicio = max(reinicio if cab.get("x-ratelimit-remaining") == "0" else 0, int(time.time()) + int(cab["retry-after"]))
            return ErrorCuota(reinicio or int(time.time()) + 60, url, estado)
        if estado == 403 and "ip allow list" in msg.lower():
            return ErrorGHE("La organización no deja entrar desde esta IP.", estado, url,
                            "Ejecuta la app dentro de la VDI/VPN de BBVA.")
        if estado == 404:
            return ErrorGHE("No existe o el token no tiene acceso.", estado, url, None)
        return ErrorGHE("GitHub ha contestado %s%s" % (estado, (": " + msg) if msg else ""), estado, url, None)

    def url(self, ruta, params=None):
        if ruta.startswith("http"):
            u = ruta
        else:
            u = self.api + "/" + ruta.lstrip("/")
        if params:
            u += ("&" if "?" in u else "?") + urllib.parse.urlencode(params)
        return u

    # ── API ─────────────────────────────────────────────────────────────────
    def get(self, ruta, params=None, etag=True):
        u = self.url(ruta, params)
        self.usadas.add(u)
        extra = {}
        previo = self.etags.get(u) if etag else None
        if previo:
            extra["If-None-Match"] = previo[0]
        estado, cab, cuerpo = self._peticion("GET", u, cabeceras=extra)
        if estado == 304 and previo:
            with self._cerrojo:
                self.ahorradas += 1
            if len(previo) > 2 and previo[2] and not cab.get("link"):
                cab = dict(cab, link=previo[2])  # un 304 puede venir sin Link: sin él, la paginación se cortaría
            return previo[1], cab
        if estado >= 300:
            raise self._error(estado, cab, cuerpo, u)
        datos = json.loads(cuerpo.decode("utf-8") or "null")
        if etag and cab.get("etag"):
            self.etags[u] = [cab["etag"], datos, cab.get("link", "")]
        return datos, cab

    def paginar(self, ruta, params=None, max_paginas=10, clave=None):
        """Lista completa siguiendo Link: rel="next". `clave` para respuestas
        envueltas (p. ej. {"workflow_runs": [...]})."""
        p = dict(params or {})
        p.setdefault("per_page", 100)
        u = self.url(ruta, p)
        todo = []
        for _ in range(max_paginas):
            datos, cab = self.get(u)
            todo.extend((datos or {}).get(clave, []) if clave else (datos or []))
            m = re.search(r'<([^>]+)>;\s*rel="next"', cab.get("link", ""))
            if not m:
                break
            u = m.group(1)
        return todo

    def texto(self, ruta):
        """Texto de un recurso que redirige (logs): la redirección va sin token."""
        u = self.url(ruta)
        estado, cab, cuerpo = self._peticion("GET", u, seguir=False, limite=MAX_LOG)
        if estado in (301, 302, 303, 307, 308) and cab.get("location"):
            estado, cab, cuerpo = self._peticion("GET", cab["location"], auth=False, limite=MAX_LOG,
                                                 cabeceras={"Accept": "*/*"})
        if estado >= 300:
            raise self._error(estado, cab, cuerpo, u)
        return cuerpo.decode("utf-8", "replace")

    def crudo(self, ruta, params=None, accept="application/vnd.github.raw", limite=MAX_LOG):
        """Bytes de un recurso (p. ej. un fichero en un commit) sin pasar por JSON."""
        u = self.url(ruta, params)
        estado, cab, cuerpo = self._peticion("GET", u, cabeceras={"Accept": accept}, seguir=False, limite=limite + 1)
        if estado in (301, 302, 303, 307, 308) and cab.get("location"):
            estado, cab, cuerpo = self._peticion("GET", cab["location"], auth=False, limite=limite + 1, cabeceras={"Accept": "*/*"})
        if estado >= 300:
            raise self._error(estado, cab, cuerpo, u)
        return cuerpo

    def escribir(self, metodo, ruta, cuerpo):
        u = self.url(ruta)
        estado, cab, datos = self._peticion(metodo, u, cuerpo=cuerpo)
        if estado >= 300:
            raise self._error(estado, cab, datos, u)
        return json.loads(datos.decode("utf-8") or "null")

    def estado_cuota(self):
        return {"restante": self.restante, "reinicio": self.reinicio, "llamadas": self.llamadas,
                "ahorradas": self.ahorradas}
