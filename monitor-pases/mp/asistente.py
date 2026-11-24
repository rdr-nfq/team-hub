"""Asistentes con GitHub Copilot CLI (`npm install -g @github/copilot`).

- Consulta: Copilot lee el código de la rama (o del DP) en una copia local y
  contesta. No puede escribir ficheros ni ejecutar más que comandos de git de
  lectura.
- Modificación: Copilot cambia el código en una copia local de la rama de la
  feature. Nada se sube solo: la persona revisa el diff en la app y, si lo
  aprueba, la app hace el commit y el push a la rama.

Copilot CLI se ejecuta con `node <entrada del paquete>` (sin pasar por cmd),
así el texto de una pregunta nunca se interpreta como comando. Las copias
locales se hacen con el git de la VDI y sus credenciales.
"""

import os
import re
import shlex
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

SIN_VENTANA = getattr(subprocess, "CREATE_NO_WINDOW", 0)
NUEVA_CONSOLA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
PAQUETE = "@github/copilot"
NODE_MINIMO = 22
MAX_SALIDA = 400_000
PISTAS_RED = ("ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "SELF_SIGNED_CERT", "UNABLE_TO_GET_ISSUER",
              "UNABLE_TO_VERIFY", "CERT_", " 407", "proxy", "tunneling socket", "network")
AVISO_PROXY = ("Parece un problema de red y en la VDI casi siempre es el proxy. Define HTTPS_PROXY y HTTP_PROXY en las variables "
               "de entorno de tu usuario (o npm config set proxy … y npm config set https-proxy …). Si la red inspecciona el "
               "tráfico, añade NODE_EXTRA_CA_CERTS con la ruta del certificado de la empresa. Después cierra el monitor y vuelve a abrirlo.")
LECTURA = ["shell(git log)", "shell(git show)", "shell(git diff)", "shell(git status)", "shell(git grep)", "shell(git blame)",
           "shell(git ls-files)"]
PROHIBIDO = ["shell(git push)", "shell(git commit)", "shell(git reset)", "shell(git checkout)", "shell(git switch)",
             "shell(git rebase)", "shell(git merge)", "shell(git remote)", "shell(rm)", "shell(del)", "shell(rmdir)"]


def _ejecutar(args, cwd=None, timeout=120, env=None):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=env, creationflags=SIN_VENTANA)
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except FileNotFoundError:
        return 127, "No se encuentra %s" % args[0]
    except subprocess.TimeoutExpired:
        return 124, "Tiempo agotado: %s" % " ".join(args[:3])


def _primera(texto):
    return (texto or "").strip().splitlines()[0] if (texto or "").strip() else ""


def parsear_diff_git(texto):
    """Salida de `git diff` -> ficheros como los de la API de GitHub (con patch)."""
    out = []
    for bloque in re.split(r"(?m)^diff --git ", texto or ""):
        if not bloque.strip():
            continue
        lineas = bloque.split("\n")
        f = {"ruta": None, "antes": None, "estado": "modified", "mas": 0, "menos": 0, "patch": None, "binario": False, "recortado": False}
        m = re.match(r'"?a/(.+?)"? "?b/(.+?)"?$', lineas[0])
        if m:
            f["antes"], f["ruta"] = m.group(1), m.group(2)
        cuerpo = []
        for i, l in enumerate(lineas[1:], 1):
            if l.startswith("new file mode"):
                f["estado"] = "added"
            elif l.startswith("deleted file mode"):
                f["estado"] = "removed"
            elif l.startswith("rename from "):
                f["estado"], f["antes"] = "renamed", l[12:]
            elif l.startswith("rename to "):
                f["ruta"] = l[10:]
            elif l.startswith("Binary files"):
                f["binario"] = True
            elif l.startswith("@@"):
                cuerpo = lineas[i:]
                break
        if cuerpo:
            while cuerpo and cuerpo[-1] == "":
                cuerpo.pop()
            f["patch"] = "\n".join(cuerpo)
            f["mas"] = sum(1 for l in cuerpo if l.startswith("+"))
            f["menos"] = sum(1 for l in cuerpo if l.startswith("-"))
        if f["estado"] != "renamed" and f["antes"] == f["ruta"]:
            f["antes"] = None
        out.append(f)
    return out


class Asistente:
    def __init__(self, config, monitor, sesiones, demo=False):
        self.cfg, self.mon, self.ses, self.demo = config, monitor, sesiones, demo
        self.dir = config.dir / "copilot"
        self.dir_repos = config.dir / "repos"
        self.tareas = {}
        self._c = threading.Lock()
        self._entrada_cache = None

    # ── entorno: node, npm y Copilot CLI ────────────────────────────────────
    def _env(self):
        env = dict(os.environ, NO_COLOR="1", FORCE_COLOR="0", GIT_TERMINAL_PROMPT="0")
        for linea in str(self.cfg.get()["copilot"].get("entorno") or "").splitlines():
            if "=" in linea and not linea.strip().startswith("#"):
                k, v = linea.split("=", 1)
                if k.strip():
                    env[k.strip()] = v.strip()
        return env

    def _entrada(self):
        """Fichero .js de Copilot CLI dentro de la instalación global de npm."""
        propia = str(self.cfg.get()["copilot"].get("entrada") or "").strip()
        if propia:
            return propia if Path(propia).exists() else None
        if self._entrada_cache and Path(self._entrada_cache).exists():
            return self._entrada_cache
        npm = shutil.which("npm")
        if not npm:
            return None
        cod, salida = _ejecutar([npm, "root", "-g"], timeout=60, env=self._env())
        raiz = Path(_primera(salida)) if cod == 0 else None
        pkg = raiz / "@github" / "copilot" / "package.json" if raiz else None
        if not pkg or not pkg.exists():
            return None
        import json
        try:
            datos = json.loads(pkg.read_text(encoding="utf-8"))
        except ValueError:
            return None
        binario = datos.get("bin")
        if isinstance(binario, dict):
            binario = binario.get("copilot") or next(iter(binario.values()), None)
        if not binario:
            return None
        self._entrada_cache = str((pkg.parent / binario).resolve())
        return self._entrada_cache

    def estado(self):
        if self.demo:
            return {"demo": True, "listo": True, "node": "v22.11.0", "npm": True, "copilot": "demo", "git": "git version 2.47",
                    "problemas": []}
        node = shutil.which("node")
        v_node = _primera(_ejecutar([node, "--version"], timeout=20)[1]) if node else None
        git = shutil.which("git")
        v_git = _primera(_ejecutar([git, "--version"], timeout=20)[1]) if git else None
        npm = bool(shutil.which("npm"))
        entrada = self._entrada() if node else None
        v_cop = None
        if node and entrada:
            cod, sal = _ejecutar([node, entrada, "--version"], timeout=60, env=self._env())
            v_cop = _primera(sal) if cod == 0 else None
        problemas = []
        if not node:
            problemas.append("No se encuentra Node.js (hace falta la versión %d o superior)." % NODE_MINIMO)
        else:
            m = re.match(r"v(\d+)", v_node or "")
            if m and int(m.group(1)) < NODE_MINIMO:
                problemas.append("Tienes Node.js %s y Copilot CLI necesita la %d o superior." % (v_node, NODE_MINIMO))
        if node and not npm:
            problemas.append("No se encuentra npm para instalar Copilot CLI.")
        if not git:
            problemas.append("No se encuentra Git (hace falta para las copias locales de las ramas).")
        return {"demo": False, "listo": bool(node and entrada and v_cop and git), "node": v_node, "npm": npm,
                "copilot": v_cop, "instalado": bool(entrada), "git": v_git, "problemas": problemas}

    def instalar(self):
        npm = shutil.which("npm")
        if not npm:
            raise ValueError("No se encuentra npm: instala Node.js (versión %d o superior)." % NODE_MINIMO)
        self._entrada_cache = None
        return self._lanzar({"modo": "instalar", "pregunta": "npm install -g %s" % PAQUETE},
                            lambda t: self._proceso(t, [npm, "install", "-g", PAQUETE], None, self._env(), red=True))

    def abrir_sesion_copilot(self):
        """Abre Copilot CLI en una ventana propia para iniciar sesión (/login)."""
        if self.demo:
            return {"ok": True}
        node, entrada = shutil.which("node"), self._entrada()
        if not (node and entrada):
            raise ValueError("Primero instala Copilot CLI.")
        if os.name != "nt":
            raise ValueError("Abre una terminal y ejecuta: copilot  (después escribe /login).")
        subprocess.Popen([node, entrada], cwd=str(Path.home()), env=self._env(), creationflags=NUEVA_CONSOLA)
        return {"ok": True}

    # ── tareas ──────────────────────────────────────────────────────────────
    def _lanzar(self, datos, trabajo):
        tid = uuid.uuid4().hex[:10]
        t = dict(datos, id=tid, estado="preparando", salida="", inicio=time.time(), fin=None, codigo=None, cambios=None,
                 aplicado=None, error=None, aviso=None)
        with self._c:
            self.tareas[tid] = t
            # Se guardan las 40 últimas.
            for viejo in sorted(self.tareas, key=lambda k: self.tareas[k]["inicio"])[:-40]:
                self.tareas.pop(viejo, None)

        def hilo():
            try:
                trabajo(t)
            except Exception as e:  # que la tarea no se quede «en curso» para siempre
                t["estado"], t["error"] = "error", str(e)
            finally:
                t["fin"] = time.time()

        threading.Thread(target=hilo, name="copilot-" + tid, daemon=True).start()
        return tid

    def _anadir(self, t, texto):
        t["salida"] = (t["salida"] + texto)[-MAX_SALIDA:]

    def _proceso(self, t, args, cwd, env, red=False, terminar=True):
        """Ejecuta y va guardando la salida. Con terminar=False, si sale bien la
        tarea sigue «en curso»: quien llama la cierra cuando acaba lo suyo."""
        t["estado"] = "en curso"
        p = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                             text=True, encoding="utf-8", errors="replace", creationflags=SIN_VENTANA)
        t["_proc"] = p
        with p.stdout:
            for linea in p.stdout:
                self._anadir(t, linea)
        p.wait()
        t["codigo"] = p.returncode
        t.pop("_proc", None)
        if t.get("cancelada"):
            t["estado"] = "cancelada"
        elif p.returncode == 0:
            if terminar:
                t["estado"] = "terminada"
        else:
            t["estado"] = "error"
            t["error"] = "Ha terminado con el código %s." % p.returncode
            if red or any(x.lower() in t["salida"].lower() for x in PISTAS_RED):
                t["aviso"] = AVISO_PROXY

    def cancelar(self, tid):
        t = self.tareas.get(tid)
        if t and t.get("_proc"):
            t["cancelada"] = True
            t["_proc"].terminate()
        return {"ok": True}

    def publica(self, t):
        return {k: v for k, v in t.items() if not k.startswith("_")}

    def tarea(self, tid):
        t = self.tareas.get(tid)
        if not t:
            raise KeyError("Esa tarea ya no existe.")
        return self.publica(t)

    def lista(self):
        with self._c:
            ts = sorted(self.tareas.values(), key=lambda t: t["inicio"], reverse=True)
        return [{k: v for k, v in self.publica(t).items() if k not in ("salida", "cambios")} for t in ts]

    # ── copias locales de los repositorios ──────────────────────────────────
    def _git(self, args, cwd=None, timeout=900):
        cod, sal = _ejecutar(["git"] + args, cwd=cwd, timeout=timeout, env=dict(os.environ, GIT_TERMINAL_PROMPT="0"))
        if cod != 0:
            raise RuntimeError("git %s: %s" % (args[0], sal.strip()[-600:]))
        return sal

    def _url(self, repo):
        c = self.cfg.get()
        return str(c["copilot"].get("urlRepo") or "https://{host}/{repo}.git").format(host=c["bbva"]["host"], repo=repo)

    def _clon(self, repo, t):
        base = self.dir_repos / repo.replace("/", "__")
        if not (base / ".git").exists():
            self._anadir(t, "Descargando %s (solo la primera vez)…\n" % repo)
            base.parent.mkdir(parents=True, exist_ok=True)
            self._git(["clone", "--filter=blob:none", "--no-checkout", self._url(repo), str(base)])
        return base

    def _preparar(self, t):
        """Copia de trabajo para la tarea: rama (o commit del DP) en una carpeta propia."""
        ctx = t["contexto"] or {}
        t["_ctxdir"] = self.dir / "contexto" / t["id"]
        t["_ctxdir"].mkdir(parents=True, exist_ok=True)
        if ctx.get("tipo") not in ("rama", "dp"):
            return None
        if ctx["tipo"] == "rama":
            with self.mon._cerrojo:
                r = dict(self.mon.ramas.get(ctx.get("id")) or {})
            if not r:
                raise ValueError("Esa rama ya no está en la última sincronización.")
            repo, rama, ref = r["repo"], r["rama"], None
        else:
            info = self.mon.dp(ctx.get("repo"), ctx.get("cod"))
            if not info:
                raise ValueError("Ese DP no está entre los detectados.")
            repo, rama, ref = info["repo"], info.get("rama"), info.get("sha")
        if t["modo"] == "modificar" and not rama:
            raise ValueError("Para modificar hace falta una rama.")
        base = self._clon(repo, t)
        self._anadir(t, "Trayendo %s…\n" % (rama or ref[:7]))
        if rama:
            self._git(["fetch", "--quiet", "origin", "+refs/heads/%s:refs/remotes/origin/%s" % (rama, rama)], cwd=base)
        if ref and t["modo"] != "modificar":
            self._git(["fetch", "--quiet", "origin", ref], cwd=base)
        wt = self.dir / "trabajo" / t["id"]
        wt.parent.mkdir(parents=True, exist_ok=True)
        if t["modo"] == "modificar":
            local = "monitor/%s" % t["id"]
            self._git(["worktree", "add", "--quiet", "-B", local, str(wt), "origin/%s" % rama], cwd=base)
            t["_rama_local"] = local
        else:
            self._git(["worktree", "add", "--quiet", "--detach", str(wt), ref or "origin/%s" % rama], cwd=base)
        t.update(_base=base, _wt=wt, repo=repo, rama=rama, ref=ref)
        return wt

    def _contexto(self, t):
        """Lo que sabe el monitor (sin tokens): para que Copilot no tenga que adivinar."""
        ctx = t["contexto"] or {}
        lineas = ["# Contexto del Monitor de pases", ""]
        alias = self.cfg.get().get("proyectos") or {}
        if ctx.get("tipo") == "rama":
            with self.mon._cerrojo:
                r = dict(self.mon.ramas.get(ctx.get("id")) or {})
            f = r.get("feature") or ""
            lineas += ["Repositorio: %s" % r.get("repo"), "Rama: %s" % r.get("rama"),
                       "Proyecto: %s %s" % (f, alias.get(f, "")), "Rama de producción: %s" % r.get("base"),
                       "Commits que no están en producción: %s" % r.get("ahead"), "", "## Commits", ""]
            lineas += ["- %s %s (%s)" % (c["sha"][:7], c["mensaje"], c["autor"]) for c in r.get("commits") or []]
            lineas += ["", "## Ficheros cambiados frente a producción", ""]
            lineas += ["- %s (%s, +%s −%s)" % (x["ruta"], x["estado"], x["mas"], x["menos"]) for x in r.get("ficheros") or []]
            lineas += ["", "## DPs", ""] + ["- %s" % d["cod"] for d in self.mon.dps_de_rama(r)]
        elif ctx.get("tipo") == "dp":
            i = self.mon.dp(ctx.get("repo"), ctx.get("cod")) or {}
            lineas += ["DP: %s" % i.get("cod"), "Repositorio: %s" % i.get("repo"), "Rama: %s" % i.get("rama"),
                       "Release: %s" % (i.get("release") or "-"), "Commit: %s" % i.get("sha"),
                       "Comparado con: %s" % i.get("frente"), "Features: %s" % ", ".join(i.get("features") or []), "",
                       "## Componentes", ""]
            lineas += ["- %s (%s / %s): %s" % (c["nombre"], c["tipo"] or "sin tipo", c["subida"] or "-", ", ".join(c["ficheros"]))
                       for c in i.get("componentes") or []]
        else:
            res = self.mon.resumen()
            lineas += ["Resumen de lo que vigila el monitor.", "", "## Proyectos", ""]
            lineas += ["- %s %s: %s ramas, %s sin mergear, repos %s" % (p["feature"] or "(sin proyecto)", p["nombre"], p["ramas"],
                                                                         p["abiertas"], ", ".join(p["repos"])) for p in res["proyectos"]]
            lineas += ["", "## Ramas", ""]
            lineas += ["- %s · %s · %s commits fuera de producción · último: %s" % (r["repo"], r["rama"], r.get("ahead"),
                                                                                    (r.get("cabeza") or {}).get("mensaje", ""))
                       for r in res["ramas"] if not r.get("esBase")]
            lineas += ["", "## DPs", ""]
            lineas += ["- %s · %s · %s · features %s · %d componentes" % (d["cod"], d["repo"], d.get("rama"), ", ".join(d.get("features") or []),
                                                                         len(d.get("componentes") or [])) for d in self.mon.dps()[:200]]
        return "\n".join(str(x) for x in lineas) + "\n"

    def _argumentos(self, t, prompt):
        c = self.cfg.get()["copilot"]
        args = [shutil.which("node") or "node", self._entrada(), "-p", prompt, "--add-dir", str(t["_ctxdir"])]
        if t["modo"] == "consultar":
            args += ["--deny-tool", "write"]
            for x in LECTURA:
                args += ["--allow-tool", x]
        else:
            if c.get("permitirComandos"):
                args += ["--allow-all-tools"]
            else:
                args += ["--allow-tool", "write"]
                for x in LECTURA:
                    args += ["--allow-tool", x]
            for x in PROHIBIDO:
                args += ["--deny-tool", x]
        if c.get("modelo"):
            args += ["--model", c["modelo"]]
        if c.get("opciones"):
            args += shlex.split(c["opciones"], posix=(os.name != "nt"))
        return args

    def _prompt(self, t, fichero):
        donde = "el directorio actual, %s de %s" % ("la rama " + t["rama"] if t.get("rama") else "el commit " + (t.get("ref") or "")[:7],
                                                   t.get("repo")) if t.get("_wt") else "ningún repositorio (solo el contexto)"
        if t["modo"] == "consultar":
            return ("Eres el asistente de consulta del equipo RDR. Responde en español, con datos concretos y breve. "
                    "No modifiques ningún fichero. El código está en %s. Lee primero el contexto del monitor en %s.\n\n"
                    "Pregunta: %s" % (donde, fichero, t["pregunta"]))
        return ("Trabajas en %s. Lee primero el contexto del monitor en %s. Haz este cambio en el código: %s\n\n"
                "Modifica solo lo necesario y respeta el estilo del código. No hagas commit ni push: una persona revisa el "
                "cambio y lo sube. Al terminar, resume en español qué ficheros has cambiado y por qué." % (donde, fichero, t["pregunta"]))

    def preguntar(self, contexto, pregunta, modo):
        pregunta = str(pregunta or "").strip()
        if not pregunta:
            raise ValueError("Escribe la pregunta o el cambio.")
        if modo not in ("consultar", "modificar"):
            raise ValueError("Modo desconocido.")
        if modo == "modificar" and (contexto or {}).get("tipo") != "rama":
            raise ValueError("Para modificar, elige una rama de feature.")

        def trabajo(t):
            if self.demo:
                return self._demo(t)
            wt = self._preparar(t)
            fichero = t["_ctxdir"] / "contexto-monitor.md"
            fichero.write_text(self._contexto(t), encoding="utf-8")
            if not self._entrada():
                raise RuntimeError("Copilot CLI no está instalado.")
            self._anadir(t, "Preguntando a Copilot…\n\n")
            self._proceso(t, self._argumentos(t, self._prompt(t, fichero)), str(wt or t["_ctxdir"]), self._env(), terminar=False)
            if t["estado"] != "en curso":  # error o cancelada
                if wt:
                    self._quitar(t)
                return
            if modo == "modificar" and wt:
                self._git(["add", "-A"], cwd=wt)
                t["cambios"] = parsear_diff_git(self._git(["diff", "--cached", "--no-color", "-M"], cwd=wt))
            elif wt:
                self._quitar(t)
            t["estado"] = "terminada"  # ahora sí: con los cambios ya calculados

        return self._lanzar({"modo": modo, "contexto": contexto, "pregunta": pregunta}, trabajo)

    def aplicar(self, tid, mensaje):
        t = self.tareas.get(tid)
        if not t or t["modo"] != "modificar" or t["estado"] != "terminada" or not t.get("cambios"):
            raise ValueError("No hay cambios que subir en esa tarea.")
        if t.get("aplicado"):
            raise ValueError("Esos cambios ya se han subido.")
        mensaje = str(mensaje or "").strip()
        if not mensaje:
            raise ValueError("Escribe el mensaje del commit.")
        if self.demo:
            t["aplicado"] = {"sha": "d3m0c0de", "rama": t.get("rama") or "feature/demo", "demo": True}
            return t["aplicado"]
        wt = t["_wt"]
        cfg = self.cfg.get()
        identidad = []
        if _ejecutar(["git", "config", "user.email"], cwd=wt)[0] != 0:
            login = (self.ses.publica().get("bbva") or {}).get("usuario") or "monitor-pases"
            identidad = ["-c", "user.name=%s" % login, "-c", "user.email=%s@users.noreply.%s" % (login, cfg["bbva"]["host"])]
        self._git(["add", "-A"], cwd=wt)
        self._git(identidad + ["commit", "--quiet", "-m", mensaje], cwd=wt)
        sha = _primera(self._git(["rev-parse", "HEAD"], cwd=wt))
        self._git(["push", "--quiet", "origin", "HEAD:refs/heads/%s" % t["rama"]], cwd=wt, timeout=300)
        t["aplicado"] = {"sha": sha, "rama": t["rama"], "repo": t["repo"]}
        self._quitar(t)
        return t["aplicado"]

    def descartar(self, tid):
        t = self.tareas.get(tid)
        if not t:
            raise KeyError("Esa tarea ya no existe.")
        if not self.demo:
            self._quitar(t)
        t["descartada"] = True
        return {"ok": True}

    def _quitar(self, t):
        base, wt = t.get("_base"), t.get("_wt")
        if base and wt:
            _ejecutar(["git", "worktree", "remove", "--force", str(wt)], cwd=base)
            if t.get("_rama_local"):
                _ejecutar(["git", "branch", "-D", t["_rama_local"]], cwd=base)
            t["_wt"] = None

    def _demo(self, t):
        """Sin Copilot real: respuesta de ejemplo para enseñar cómo funciona."""
        t["estado"] = "en curso"
        texto = ("Copilot (demo): en la app real, Copilot CLI lee el código de la rama en una copia local y contesta aquí.\n\n"
                 "Ejemplo de respuesta: la rama trae cambios en 4 componentes Java; el que más cambia es "
                 "CargadorTerceros (+38 −6), que añade la validación de importes negativos.\n")
        for trozo in texto.split(" "):
            self._anadir(t, trozo + " ")
            time.sleep(0.02)
        if t["modo"] == "modificar":
            t["repo"], t["rama"] = "equipo-demo/rdr-javas", "feature/CIBRDR-2311-cargador-terceros"
            t["cambios"] = [{"ruta": "src/main/java/com/equipo/rdr/cargador_terceros/CargadorTerceros.java", "antes": None,
                             "estado": "modified", "mas": 4, "menos": 1, "binario": False, "recortado": False,
                             "patch": "@@ -24,7 +24,9 @@\n     public List<Operacion> cargar(LocalDate fecha) {\n"
                                      "-        List<Operacion> lista = repositorio.buscar(ORIGEN, fecha);\n"
                                      "+        if (fecha == null) {\n+            throw new IllegalArgumentException(\"La fecha es obligatoria\");\n+        }\n"
                                      "+        List<Operacion> lista = repositorio.buscar(ORIGEN, fecha);\n"
                                      "         if (lista.isEmpty()) {\n             return List.of();\n         }"}]
        t["estado"] = "terminada"
        t["codigo"] = 0
