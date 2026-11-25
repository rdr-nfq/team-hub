"""GitHub simulado para `--demo` y para las pruebas: datos inventados
(organización «equipo-demo», proyectos CIBRDR ficticios), fechas relativas a
hoy. Imita la API real en lo que usa la app: paginación con Link, ETag/304,
comparar ramas, PRs, Actions, check-runs con resumen y anotaciones, logs con
redirección a un almacén que rechaza el token, y contents (para la subida).
"""

import base64
import datetime as dt
import difflib
import hashlib
import json
import random
import re
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = "demo"
ORG = "equipo-demo"

PROYECTOS = {
    "CIBRDR-2311": ("cargador-terceros", "Cargador de terceros"),
    "CIBRDR-2405": ("informe-regulatorio", "Informe regulatorio mensual"),
    "CIBRDR-2442": ("migracion-operaciones", "Migración de operaciones"),
    "CIBRDR-2470": ("alertas-liquidez", "Alertas de liquidez"),
    "CIBRDR-2488": ("simulacro-usuario", None),  # sin nombre en Ajustes: se ve solo el código
}
AUTORES = ["ana-ruiz", "jmartin", "lgarrido", "pnavarro", "ctorres"]

# Más proyectos y ~150 repositorios más, para ver la app a escala real.
PROYECTOS_EXTRA = {
    "CIBRDR-2501": ("limites-contrapartida", "Límites por contrapartida"),
    "CIBRDR-2513": ("conciliacion-diaria", "Conciliación diaria"),
    "CIBRDR-2520": ("colaterales-ccp", "Colaterales con CCP"),
    "CIBRDR-2534": ("precios-cierre", "Precios de cierre"),
    "CIBRDR-2547": ("riesgo-divisa", "Riesgo de divisa"),
    "CIBRDR-2552": ("fondos-garantia", "Fondos de garantía"),
    "CIBRDR-2560": ("reporting-emir", "Reporting EMIR"),
    "CIBRDR-2578": ("baja-productos", None),
    "CIBRDR-2583": ("tesoreria-intradia", "Tesorería intradía"),
    "CIBRDR-2591": ("valoracion-derivados", "Valoración de derivados"),
}
AUTORES_EXTRA = ["mgil", "sortega", "rcampos", "evidal", "dprieto", "ibenitez", "acastro"]
DOMINIOS = ["posiciones", "liquidez", "contabilidad", "riesgos", "sicor", "tesoreria", "derivados", "renta-fija", "divisas",
            "colaterales", "garantias", "clientes", "contratos", "precios", "limites", "regulatorio", "conciliacion",
            "cierres", "mercados", "fondos", "valores", "prestamos"]
# sufijo -> (tipo de repo fijo cuyo contenido imita, fuente del DP, tecnología, lenguaje)
TIPOS_EXTRA = {
    "java": ("rdr-javas", "resumen", "Java", "Java"),
    "ws": ("rdr-workstation", "anotacion", "Workstation", "JavaScript"),
    "gs": ("rdr-objetos-gs", "log", "Objetos GS", "PLSQL"),
    "estaticos": ("rdr-estaticos", "resumen", "Estáticos", None),
    "datax": ("rdr-datax", "resumen", "DataX", None),
    "cadenas": ("rdr-cadenas", None, "Cadenas", None),
    "aperiodicos": ("rdr-aperiodicos", None, "Aperiódicos", "Shell"),
}
TECNOLOGIA = {v[0]: (v[2], v[3]) for v in TIPOS_EXTRA.values()}
OTRAS_UUAA = ["MDSC0000", "KQPR0000"]  # repos de la organización que no son del equipo: el filtro los deja fuera

# repo -> (cómo genera el DP, generador de rutas)
REPOS = {
    "rdr-javas": "resumen",
    "rdr-workstation": "anotacion",
    "rdr-objetos-gs": "log",
    "rdr-estaticos": "resumen",
    "rdr-datax": None,
    "rdr-cadenas": None,
    "rdr-aperiodicos": None,
}

CLASES = ["CargadorTerceros", "ValidadorOperacion", "InformeMensual", "ServicioLiquidez", "MapeoSicor", "ProcesoCierre",
          "ConversorDivisa", "ExportadorRegulatorio", "AlertaUmbral", "RepositorioPosiciones"]


def _rutas(repo, rnd, feature):
    slug = {**PROYECTOS, **PROYECTOS_EXTRA}[feature][0].replace("-", "_")
    if repo == "rdr-javas":
        cl = rnd.sample(CLASES, rnd.randint(2, 4))
        out = ["src/main/java/com/equipo/rdr/%s/%s.java" % (slug, c) for c in cl]
        out += ["src/test/java/com/equipo/rdr/%s/%sTest.java" % (slug, cl[0])]
        return out
    if repo == "rdr-workstation":
        m = rnd.choice(["pantalla_alta", "consulta_posiciones", "panel_alertas", "carga_manual"])
        return ["workstation/%s/%s.xml" % (m, m), "workstation/%s/eventos.js" % m, "workstation/%s/estilos.css" % m]
    if repo == "rdr-objetos-gs":
        return ["objetos/%s_%s.sql" % (rnd.choice(["T_RDR", "V_RDR", "P_RDR"]), slug.upper()[:12]) for _ in range(rnd.randint(1, 3))]
    if repo == "rdr-estaticos":
        return ["estaticos/%s/%s" % (slug, f) for f in rnd.sample(["parametros.properties", "literales_es.json", "mapeo.csv"], 2)]
    if repo == "rdr-datax":
        return ["datax/%s_%s.json" % (slug, x) for x in rnd.sample(["ingesta", "transformacion", "salida"], rnd.randint(1, 2))]
    if repo == "rdr-cadenas":
        return ["cadenas/RDR%s%02d.jcl" % (slug.upper()[:3], rnd.randint(1, 40))]
    return ["aperiodicos/%s_recarga.sh" % slug, "README.md"]


# ── Contenido inventado de los ficheros y sus cambios ──
def _base(ruta, rnd):
    nombre = ruta.rsplit("/", 1)[-1]
    raiz, _, ext = nombre.rpartition(".")
    if ext == "java":
        paquete = ".".join(ruta.split("/")[3:-1]) or "com.equipo.rdr"
        metodos = []
        for m in rnd.sample(["cargar", "validar", "transformar", "exportar", "calcularTotal", "resumen"], 3):
            metodos += ["", "    public List<Operacion> %s(LocalDate fecha) {" % m,
                        "        List<Operacion> lista = repositorio.buscar(ORIGEN, fecha);",
                        "        if (lista.isEmpty()) {",
                        "            LOG.info(\"Sin operaciones para {}\", fecha);",
                        "            return List.of();",
                        "        }",
                        "        return lista.stream().filter(o -> o.getImporte().signum() > 0).toList();",
                        "    }"]
        return (["package %s;" % paquete, "", "import java.math.BigDecimal;", "import java.time.LocalDate;", "import java.util.List;",
                 "import org.slf4j.Logger;", "import org.slf4j.LoggerFactory;", "", "/** %s del cargador RDR. */" % raiz,
                 "public class %s {" % raiz, "", "    private static final Logger LOG = LoggerFactory.getLogger(%s.class);" % raiz,
                 "    private static final String ORIGEN = \"%s\";" % raiz.upper()[:10],
                 "    private static final int MAX_REINTENTOS = 3;", "", "    private final Repositorio repositorio;", "",
                 "    public %s(Repositorio repositorio) {" % raiz, "        this.repositorio = repositorio;", "    }"]
                + metodos + ["}"])
    if ext == "xml":
        campos = rnd.sample(["contrapartida", "importe", "divisa", "fechaValor", "cartera", "producto", "estado"], 5)
        return (['<?xml version="1.0" encoding="UTF-8"?>', '<pantalla id="%s" titulo="%s">' % (raiz, raiz.replace("_", " ").capitalize()),
                 '  <formulario>'] + ['    <campo id="%s" tipo="texto" obligatorio="%s"/>' % (c, "true" if i < 2 else "false") for i, c in enumerate(campos)]
                + ['  </formulario>', '  <acciones>', '    <boton id="guardar" accion="guardarOperacion"/>',
                   '    <boton id="cancelar" accion="cerrar"/>', '  </acciones>', '</pantalla>'])
    if ext == "js":
        return ["/* Eventos de la pantalla */", "", "function alCargar(ctx) {", "  ctx.campo('divisa').valor('EUR');",
                "  ctx.campo('fechaValor').valor(ctx.hoy());", "}", "", "function guardarOperacion(ctx) {",
                "  if (!ctx.campo('importe').valor()) {", "    ctx.aviso('El importe es obligatorio');", "    return;", "  }",
                "  ctx.servicio('operaciones').guardar(ctx.datos());", "}"]
    if ext == "css":
        return [".pantalla { display: grid; gap: 8px; }", ".campo { min-width: 180px; }", ".campo--obligatorio label::after { content: ' *'; }",
                ".acciones { display: flex; justify-content: flex-end; gap: 8px; }"]
    if ext == "sql":
        return ["-- %s" % raiz, "CREATE TABLE %s (" % raiz, "  ID_OPERACION   NUMBER(12)    NOT NULL,", "  FECHA_VALOR    DATE          NOT NULL,",
                "  IMPORTE        NUMBER(18,2),", "  DIVISA         VARCHAR2(3),", "  CONTRAPARTIDA  VARCHAR2(40),",
                "  CONSTRAINT PK_%s PRIMARY KEY (ID_OPERACION)" % raiz[:20], ");", "",
                "CREATE INDEX IX_%s_FECHA ON %s (FECHA_VALOR);" % (raiz[:16], raiz)]
    if ext == "properties":
        return ["# Parámetros de %s" % raiz, "origen.codigo=RDR", "origen.reintentos=3", "carga.lote=500", "carga.hora=06:30",
                "salida.carpeta=/datos/rdr/salida", "salida.formato=csv"]
    if ext == "json":
        return ["{", '  "job": "%s",' % raiz, '  "origen": { "tabla": "RDR_OPERACIONES", "particion": "fecha" },',
                '  "transformaciones": [', '    { "tipo": "filtro", "condicion": "importe > 0" },',
                '    { "tipo": "renombrar", "de": "cpty", "a": "contrapartida" }', "  ],",
                '  "destino": { "tabla": "RDR_%s", "modo": "append" }' % raiz.upper()[:16], "}"]
    if ext == "csv":
        return ["origen;destino;tipo", "cpty;contrapartida;texto", "amt;importe;decimal", "ccy;divisa;texto", "vdate;fecha_valor;fecha"]
    if ext == "jcl":
        return ["//%s JOB (RDR),'CARGA RDR',CLASS=A" % raiz[:8], "//PASO01   EXEC PGM=RDRCARGA", "//ENTRADA  DD DSN=RDR.ENTRADA.DIARIA,DISP=SHR",
                "//SALIDA   DD DSN=RDR.SALIDA.DIARIA,DISP=(NEW,CATLG)", "//SYSOUT   DD SYSOUT=*"]
    if ext == "sh":
        return ["#!/bin/bash", "# Recarga aperiódica de %s" % raiz, "set -euo pipefail", 'FECHA="${1:?Indica la fecha AAAA-MM-DD}"',
                'echo "Recargando $FECHA"', "rdr-cli recarga --fecha \"$FECHA\" --origen operaciones", 'echo "Hecho"']
    return ["entornos:", "  pre:", "    url: https://pre.interno", "  pro:", "    url: https://pro.interno", "reintentos: 3"]


INSERCIONES = {
    "java": [["        if (fecha == null) {", "            throw new IllegalArgumentException(\"La fecha es obligatoria\");", "        }"],
             ["    private BigDecimal redondear(BigDecimal importe) {", "        return importe.setScale(2, RoundingMode.HALF_EVEN);", "    }", ""],
             ["        LOG.debug(\"Procesando {} operaciones\", lista.size());"]],
    "xml": [['    <campo id="observaciones" tipo="texto" obligatorio="false"/>'], ['    <boton id="exportar" accion="exportarCsv"/>']],
    "js": [["  ctx.campo('cartera').valor(ctx.usuario().cartera);"], ["", "function exportarCsv(ctx) {", "  ctx.descargar('operaciones.csv');", "}"]],
    "sql": [["  OBSERVACIONES  VARCHAR2(200),"], ["", "COMMENT ON TABLE ... IS 'Operaciones RDR';"]],
    "properties": [["carga.paralelo=4"], ["salida.cabecera=true"]],
    "json": [['    { "tipo": "calculo", "campo": "importe_eur", "expresion": "importe * cambio" },']],
    "csv": [["cartera;cartera;texto"], ["prod;producto;texto"]],
    "jcl": [["//PASO02   EXEC PGM=RDRVALID"]],
    "sh": [['rdr-cli valida --fecha "$FECHA"']],
}


def _editar(lineas, ruta, rnd):
    """Un cambio pequeño y creíble: insertar, retocar o quitar líneas."""
    ext = ruta.rpartition(".")[2]
    out = list(lineas)
    for _ in range(rnd.randint(1, 2)):
        op = rnd.random()
        i = rnd.randint(1, max(1, len(out) - 2))
        if op < 0.5 and INSERCIONES.get(ext):
            out[i:i] = rnd.choice(INSERCIONES[ext])
        elif op < 0.85:
            j = rnd.randint(1, max(1, len(out) - 2))
            ln = out[j]
            nuevo = re.sub(r"\d+", lambda m: str(int(m.group()) + rnd.randint(1, 9)), ln, count=1)
            if nuevo == ln:
                nuevo = ln.replace("true", "false") if "true" in ln else ln.rstrip() + ("  // revisado" if ext == "java" else "")
            out[j] = nuevo
        elif len(out) > 6:
            del out[i]
    return out if out != lineas else lineas + [""]


def _patch(a, b):
    """Diff unificado como el campo `patch` de GitHub (sin las cabeceras ---/+++)."""
    lineas = list(difflib.unified_diff(a, b, lineterm="", n=3))[2:]
    mas = sum(1 for x in lineas if x.startswith("+"))
    menos = sum(1 for x in lineas if x.startswith("-"))
    return "\n".join(lineas), mas, menos


def _fichero_api(ruta, a, b):
    patch, mas, menos = _patch(a, b)
    estado = "added" if not a else "removed" if not b else "modified"
    return {"filename": ruta, "status": estado, "additions": mas, "deletions": menos, "changes": mas + menos, "patch": patch}


def _blob(ruta, lineas):
    """SHA (inventado pero estable) del contenido de un fichero, como el «sha» de blob de GitHub."""
    return _sha("blob", ruta, "\n".join(lineas)) if lineas else None


def _sha(*partes):
    return hashlib.sha1("|".join(str(p) for p in partes).encode()).hexdigest()


def historias_de(feat):
    """Claves (inventadas) de las historias de Jira de una feature: RDR-1xxx."""
    todas = sorted({**PROYECTOS, **PROYECTOS_EXTRA})
    i = todas.index(feat)
    return ["RDR-%d" % (1000 + i * 20 + j) for j in range(4 + i % 3)]


def _props_secundarias(repo):
    """Propiedades que tienen los repos de verdad y casi nunca sirven para filtrar (deterministas por nombre)."""
    h = int(hashlib.md5(repo.encode()).hexdigest(), 16)
    return {"branching-model": ["gitflow", "trunk-based"][h % 2], "bu-kind": ["cib", "global"][h // 2 % 2],
            "kind": ["library", "service", "batch"][h // 4 % 3], "stack-id": "stk-%02d" % (h // 12 % 9)}


class Datos:
    def _run(self, *a):
        return _crear_run(self, *a)

    def __init__(self, semilla=7, extra=150):
        rnd = random.Random(semilla)
        hoy = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
        self.hoy = hoy
        self.repos = {}
        self.runs = {}  # id -> run
        self.jobs = {}  # id -> job (incluye salida y log)
        self.contenidos = {}  # (repo, ruta) -> {sha, texto}   (repositorio de NFQ: lo subido)
        self.versiones = {}  # (repo, sha) -> {ruta: [líneas]}  (ficheros en cada commit)
        self.hotfix_prod = {}  # (repo, sha de la rama) -> ficheros que producción ha cambiado y la rama no lleva
        self.sin_propiedades = False  # True: como un GitHub sin la API de propiedades (se usa la búsqueda)
        self.cuota = None  # llamadas que quedan (None = sin límite); los 304 no gastan, como en GitHub
        self.cuota_cerrojo = threading.Lock()
        run_id, job_id, pr_n, dp_n = [9000], [70000], [1], [48000]

        rmin = random.Random(semilla + 7)  # minutos sueltos: que nada pase «ahora mismo» (otra semilla: no cambia el resto)

        def cuando(dias, horas=0):
            return (hoy - dt.timedelta(days=dias, hours=horas, minutes=rmin.randint(4, 58))).isoformat().replace("+00:00", "Z")

        # Qué proyectos tocan qué repos.
        tocan = {
            "CIBRDR-2311": ["rdr-javas", "rdr-workstation", "rdr-objetos-gs", "rdr-datax"],
            "CIBRDR-2405": ["rdr-javas", "rdr-estaticos", "rdr-cadenas"],
            "CIBRDR-2442": ["rdr-javas", "rdr-objetos-gs", "rdr-aperiodicos", "rdr-workstation"],
            "CIBRDR-2470": ["rdr-workstation", "rdr-estaticos"],
            "CIBRDR-2488": ["rdr-javas", "rdr-datax"],
        }
        def hacer(repo, fuente, tipo, feats, rnd, rel=("2.107.0", "2.108.0"), uuaa="KYTL0000", autores=AUTORES):
            full = "%s/%s" % (ORG, repo)
            master_sha = _sha(full, "master", 1)
            base_commits = []
            for i in range(rnd.randint(4, 9)):
                d = rnd.randint(0, 40)
                base_commits.append({"sha": _sha(full, "base", i), "fecha": cuando(d, rnd.randint(0, 20)),
                                     "autor": rnd.choice(autores), "mensaje": rnd.choice([
                                         "Merge pull request #%d from %s/hotfix" % (rnd.randint(1, 90), ORG),
                                         "Ajuste de configuración de entornos", "Actualiza versiones de dependencias"])})
            base_commits.sort(key=lambda c: c["fecha"])
            base_commits[-1]["sha"] = master_sha
            cfgv = _base("config/entornos.yml", rnd)
            for c in base_commits:
                nueva = _editar(cfgv, "config/entornos.yml", rnd)
                c["files"] = [_fichero_api("config/entornos.yml", cfgv, nueva)]
                cfgv = nueva
            base_vers = {"config/entornos.yml": cfgv}
            self.versiones[(full, master_sha)] = base_vers
            ramas = {"master": {"sha": master_sha, "commits": [], "files": [], "behind": 0, "base": True},
                     "develop": {"sha": _sha(full, "develop"), "commits": [], "files": [], "behind": 3}}
            prs, runs = [], []
            for feat, (slug, _) in {**PROYECTOS, **PROYECTOS_EXTRA}.items():
                if feat not in feats:
                    continue
                nombre = "feature/%s-%s" % (feat, slug)
                sin_codigo = feat == "CIBRDR-2470" and repo == "rdr-workstation"
                if sin_codigo:  # una rama sin el código en el nombre: su proyecto sale de las historias de sus commits
                    nombre = "feature/carga-nocturna"
                mergeada = (feat == "CIBRDR-2405" and repo == "rdr-cadenas")
                n_commits = 0 if mergeada else rnd.randint(2, 7)
                inicio = rnd.randint(8, 38)
                commits = []
                for i in range(n_commits):
                    d = max(0, inicio - int((inicio / max(1, n_commits)) * i) - rnd.randint(0, 2))
                    commits.append({"sha": _sha(full, nombre, i), "fecha": cuando(d, rnd.randint(0, 9)),
                                    "autor": rnd.choice(autores), "mensaje": rnd.choice([
                                        "%s: alta de componentes" % feat, "%s: corrige validación de importes" % feat,
                                        "%s: ajustes tras revisión" % feat, "%s: pruebas unitarias" % feat,
                                        "%s: renombra campos del informe" % feat, "%s: añade parámetros de entorno" % feat])})
                commits.sort(key=lambda c: c["fecha"])
                for c in commits:  # cada commit cita la historia de Jira en la que se trabaja
                    hs = historias_de(feat)
                    c["mensaje"] = "%s %s" % (hs[int(c["sha"][:6], 16) % len(hs)], c["mensaje"].replace(feat + ": ", "") if sin_codigo else c["mensaje"])
                files = []
                if not mergeada:
                    rutas = _rutas(tipo, rnd, feat)
                    estados = {r: rnd.choice(["modified", "modified", "added"]) for r in rutas}
                    if rnd.random() < 0.15 and len(rutas) > 1:
                        estados[rutas[-1]] = "removed"
                    v0 = {r: ([] if estados[r] == "added" else _base(r, rnd)) for r in rutas}
                    for r in rutas:
                        if v0[r]:
                            base_vers[r] = v0[r]
                    actual = dict(v0)
                    toques = {c["sha"]: set() for c in commits}
                    for r in rutas:  # cada fichero lo toca al menos un commit; los nuevos, el primero
                        toques[commits[0]["sha"] if estados[r] == "added" else rnd.choice(commits)["sha"]].add(r)
                    for c in commits:
                        if not toques[c["sha"]] or (c is not commits[0] and rnd.random() < 0.6):  # ningún commit vacío
                            toques[c["sha"]].add(rnd.choice(rutas))
                    ultimo = {r: max(i for i, c in enumerate(commits) if r in toques[c["sha"]]) for r in rutas}
                    padre = master_sha
                    for i, c in enumerate(commits):
                        cambios = []
                        for r in sorted(toques[c["sha"]]):
                            antes = actual[r]
                            if estados[r] == "removed" and ultimo[r] == i:
                                despues = []
                            elif not antes:
                                despues = _base(r, rnd)
                            else:
                                despues = _editar(antes, r, rnd)
                            actual[r] = despues
                            cambios.append(_fichero_api(r, antes, despues))
                        c["files"], c["padre"] = cambios, padre
                        padre = c["sha"]
                        self.versiones[(full, c["sha"])] = {r: v for r, v in actual.items() if v}
                    files = [_fichero_api(r, v0[r], actual[r]) for r in rutas]
                sha = commits[-1]["sha"] if commits else master_sha
                ramas[nombre] = {"sha": sha, "commits": commits, "files": files, "behind": rnd.randint(0, 12) if commits else 0}
                # PR
                estado_pr = "merged" if mergeada else rnd.choice(["open", "open", "none"])
                if estado_pr != "none":
                    prs.append({"number": pr_n[0], "title": "%s %s" % (feat, slug.replace("-", " ")),
                                "state": "closed" if estado_pr == "merged" else "open",
                                "merged_at": cuando(2) if estado_pr == "merged" else None, "draft": rnd.random() < 0.2,
                                "html_url": "https://demo.invalid/%s/pull/%d" % (full, pr_n[0]),
                                "head": {"ref": nombre}, "base": {"ref": "master"}, "updated_at": cuando(1)})
                    pr_n[0] += 1
                # Actions
                if fuente and commits:
                    for k in range(rnd.randint(1, 3)):
                        run_id[0] += 1
                        ok = rnd.random() > 0.2 or k == 0
                        dp = None
                        if ok:
                            dp_n[0] += rnd.randint(3, 40)
                            dp = "DP-KYTL-%d" % dp_n[0]
                        rid = run_id[0]
                        run = {"id": rid, "name": "Build y DP", "display_title": commits[-1]["mensaje"],
                               "head_branch": nombre, "head_sha": sha, "status": "completed",
                               "conclusion": "success" if ok else "failure", "run_attempt": 1, "event": "push",
                               "path": ".github/workflows/build-dp.yml",
                               "created_at": cuando(max(0, rnd.randint(0, inicio) - k), rnd.randint(0, 9)),
                               "html_url": "https://demo.invalid/%s/actions/runs/%d" % (full, rid), "_repo": full, "_jobs": [],
               "check_suite_id": rid}
                        for jn in ("compilar", "empaquetar"):
                            job_id[0] += 1
                            jid = job_id[0]
                            salida = {"title": None, "summary": None, "text": None, "annotations_count": 0}
                            anns, log = [], "2026-01-01T00:00:00Z ##[group]Run %s\n... pasos de %s ...\n" % (jn, jn)
                            if jn == "empaquetar" and dp:
                                if fuente == "resumen":
                                    salida.update(title="Paquete generado", summary="### Paquete generado\n\n| DP | Estado |\n|---|---|\n| %s | OK |" % dp)
                                elif fuente == "anotacion":
                                    anns = [{"title": "DP", "message": "DP generado: %s" % dp, "annotation_level": "notice"}]
                                    salida["annotations_count"] = 1
                                elif fuente == "log":
                                    log += "2026-01-01T00:00:05Z Paquete creado correctamente\n2026-01-01T00:00:05Z Identificador: %s\n" % dp
                            self.jobs[jid] = {"id": jid, "run_id": rid, "name": jn, "status": "completed",
                                              "conclusion": run["conclusion"], "steps": [{"name": "Checkout"}, {"name": jn.capitalize()}],
                                              "_repo": full, "_salida": salida, "_anns": anns, "_log": log}
                            run["_jobs"].append(jid)
                        self.runs[rid] = run
                        runs.append(run)
            # Releases: cada una es una subida y su Action genera el DP.
            ramas_feat = [(n, b) for n, b in ramas.items() if n.startswith("feature/") and b["commits"]]
            if fuente and ramas_feat:
                ramas["release/" + rel[0]] = {"sha": master_sha, "commits": [], "files": [], "behind": 0}  # ya en producción
                runs.append(self._run(full, "release/" + rel[0], master_sha, "Release " + rel[0], fuente, cuando(12), rnd, dp_n, run_id, job_id))
                vers, rcommits, rfiles, padre = dict(base_vers), [], {}, master_sha
                for i, (n, b) in enumerate(ramas_feat):
                    sha_m = _sha(full, "release-" + rel[1], i)
                    vers.update(self.versiones.get((full, b["sha"])) or {})
                    rcommits.extend(b["commits"])  # como en GitHub: la release trae los commits de cada feature mezclada
                    rcommits.append({"sha": sha_m, "fecha": cuando(max(0, 3 - i), 2), "autor": rnd.choice(autores),
                                     "mensaje": "Merge pull request #%d from %s/%s" % (pr_n[0], ORG, n), "files": b["files"], "padre": padre})
                    prs.append({"number": pr_n[0], "title": "%s a la release %s" % (n.split("/")[-1][:11], rel[1]), "state": "closed",
                                "merged_at": cuando(max(0, 3 - i), 2), "draft": False, "html_url": "https://demo.invalid/%s/pull/%d" % (full, pr_n[0]),
                                "head": {"ref": n}, "base": {"ref": "release/" + rel[1]}, "updated_at": cuando(max(0, 3 - i), 2)})
                    pr_n[0] += 1
                    padre = sha_m
                    self.versiones[(full, sha_m)] = dict(vers)
                    for f in b["files"]:
                        rfiles[f["filename"]] = f
                ramas["release/" + rel[1]] = {"sha": padre, "commits": rcommits, "files": list(rfiles.values()), "behind": 0}
                if repo == "rdr-objetos-gs":
                    # Como pasa de verdad: un fichero de la release ya está igual en producción (entró por otro lado)
                    # y producción tiene un hotfix en otro fichero de la release que la release no lleva.
                    vivos = [f["filename"] for f in rfiles.values() if f["status"] != "removed"]
                    if len(vivos) >= 2:
                        base_vers[vivos[0]] = list(vers[vivos[0]])
                        ramas["release/" + rel[1]]["behind"] = 1
                        self.hotfix_prod[(full, padre)] = [vivos[1]]
                prs.append({"number": pr_n[0], "title": "Release " + rel[1], "state": "open", "merged_at": None, "draft": False,
                            "html_url": "https://demo.invalid/%s/pull/%d" % (full, pr_n[0]), "head": {"ref": "release/" + rel[1]},
                            "base": {"ref": "master"}, "updated_at": cuando(0, 3)})
                pr_n[0] += 1
                runs.append(self._run(full, "release/" + rel[1], padre, "Release " + rel[1], fuente, cuando(0, 4), rnd, dp_n, run_id, job_id))
            for k, pr in enumerate(prs):  # lo que falta para ver los PRs como en GitHub
                pr.setdefault("user", {"login": AUTORES[(pr["number"] + k) % len(AUTORES)]})
                pr.setdefault("created_at", pr["updated_at"])
                pr.setdefault("body", "Cambios de %s.\n\n- Revisado en local\n- Pruebas unitarias en verde" % pr["head"]["ref"])
            # una rama sin proyecto
            hot = _editar(cfgv, "config/entornos.yml", rnd)
            fh = [_fichero_api("config/entornos.yml", cfgv, hot)]
            ramas["hotfix/ajuste-entornos"] = {"sha": _sha(full, "hotfix"), "commits": [
                {"sha": _sha(full, "hotfix"), "fecha": cuando(5), "autor": "jmartin", "mensaje": "Ajuste de entornos", "files": fh,
                 "padre": master_sha}], "files": fh, "behind": 1}
            self.versiones[(full, _sha(full, "hotfix"))] = dict(base_vers, **{"config/entornos.yml": hot})
            tec, leng = TECNOLOGIA.get(tipo, ("", None))
            self.repos[full] = {"nombre": repo, "full": full, "ramas": ramas, "prs": prs, "runs": runs,
                                "base_commits": base_commits, "pushed_at": max([c["fecha"] for b in ramas.values() for c in b["commits"]] + [c["fecha"] for c in base_commits]) if feats
                                else cuando(rnd.randint(6, 300), rnd.randint(0, 20)),
                                "rel": rel, "lenguaje": leng, "props": {"uuaa": uuaa, "tecnologia": tec, **_props_secundarias(repo)},
                                "descripcion": "%s · %s" % (tec, repo.split("-", 1)[-1].replace("-", " "))}

        for repo, fuente in REPOS.items():
            hacer(repo, fuente, repo, [f for f in PROYECTOS if repo in tocan[f]], rnd)
        if extra:
            r2 = random.Random(semilla + 1000)
            nombres = ["kytl-%s-%s" % (d, t) for d in DOMINIOS for t in TIPOS_EXTRA][:extra]
            feats_extra = list(PROYECTOS_EXTRA)
            for k, repo in enumerate(nombres):
                tipo, fuente, _, _ = TIPOS_EXTRA[repo.rsplit("-", 1)[-1]]
                activo = r2.random() < 0.45  # la mayoría de repos no se tocan en cada pase
                feats = r2.sample(feats_extra, r2.choice([1, 1, 2, 3])) if activo else []
                menor = r2.randint(3, 40)
                rel = ("1.%d.0" % menor, "1.%d.0" % (menor + 1))
                hacer(repo, fuente if activo else None, tipo, feats, r2, rel, "KYTL0000", AUTORES + AUTORES_EXTRA)
            for k in range(min(14, extra // 10)):
                uuaa = OTRAS_UUAA[k % 2]
                hacer("%s-%s-%02d" % (uuaa[:4].lower(), r2.choice(DOMINIOS), k), None, "rdr-datax", [], r2, uuaa=uuaa)


def _crear_run(datos, full, rama, sha, titulo, fuente, fecha, rnd, dp_n, run_id, job_id):
    run_id[0] += 1
    dp_n[0] += rnd.randint(3, 40)
    dp, rid = "DP-KYTL-%d" % dp_n[0], run_id[0]
    run = {"id": rid, "name": "Release y DP", "display_title": titulo, "head_branch": rama, "head_sha": sha, "status": "completed",
           "conclusion": "success", "run_attempt": 1, "event": "push", "path": ".github/workflows/release-dp.yml", "created_at": fecha,
           "html_url": "https://demo.invalid/%s/actions/runs/%d" % (full, rid), "_repo": full, "_jobs": [],
               "check_suite_id": rid}
    for jn in ("compilar", "empaquetar"):
        job_id[0] += 1
        salida = {"title": None, "summary": None, "text": None, "annotations_count": 0}
        anns, log = [], "##[group]Run %s\n" % jn
        if jn == "empaquetar":
            if fuente == "resumen":
                salida.update(title="Paquete generado", summary="| DP | Estado |\n|---|---|\n| %s | OK |" % dp)
            elif fuente == "anotacion":
                anns, salida["annotations_count"] = [{"title": "DP", "message": "DP generado: %s" % dp}], 1
            else:
                log += "Identificador: %s\n" % dp
        datos.jobs[job_id[0]] = {"id": job_id[0], "run_id": rid, "name": jn, "status": "completed", "conclusion": "success",
                                 "steps": [{"name": "Checkout"}, {"name": jn.capitalize()}], "_repo": full, "_salida": salida,
                                 "_anns": anns, "_log": log}
        run["_jobs"].append(job_id[0])
    datos.runs[rid] = run
    return run


def _commit_json(full, c):
    return {"sha": c["sha"], "html_url": "https://demo.invalid/%s/commit/%s" % (full, c["sha"]),
            "author": {"login": c["autor"]},
            "commit": {"message": c["mensaje"] + "\n\nDetalle del cambio.", "author": {"name": c["autor"], "date": c["fecha"]}}}


def _repo_json(r):
    return {"full_name": r["full"], "name": r["nombre"], "html_url": "https://demo.invalid/" + r["full"],
            "default_branch": "develop", "pushed_at": r["pushed_at"], "archived": False, "private": True,
            "language": r.get("lenguaje"), "topics": [], "description": r.get("descripcion"),
            "permissions": {"push": True}}


def _cumple(r, consulta):
    """Lo que entiende la búsqueda de repos de GitHub, en pequeño: props.X:Y, org:X y palabras del nombre."""
    for t in (consulta or "").split():
        k, _, v = t.partition(":")
        if k.startswith("props.") and v:
            if str((r.get("props") or {}).get(k[6:], "")).lower() != v.lower():
                return False
        elif k == "org" and v:
            if r["full"].split("/")[0].lower() != v.lower():
                return False
        elif t.lower() not in r["nombre"].lower():
            return False
    return True


class _H(BaseHTTPRequestHandler):
    datos = None
    puerto = 0
    pedidas = None

    def log_message(self, *a):
        pass

    def _json(self, estado, obj, extra=None):
        cuerpo = json.dumps(obj).encode()
        etag = '"%s"' % hashlib.md5(cuerpo).hexdigest()
        if estado == 200 and self.command == "GET" and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.end_headers()
            return
        self.send_response(estado)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("ETag", etag)
        cab = {"X-RateLimit-Resource": "core",
               "X-RateLimit-Remaining": str(self.datos.cuota if self.datos.cuota is not None else 4321),
               "X-RateLimit-Reset": str(int(time.time()) + 3600) if self.datos.cuota is not None else "1999999999"}
        cab.update(extra or {})
        extra = {k: v for k, v in cab.items()}
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(cuerpo)

    def _paginar(self, lista, q, base):
        pp = int(q.get("per_page", 30))
        pg = int(q.get("page", 1))
        trozo = lista[(pg - 1) * pp: pg * pp]
        extra = {}
        if pg * pp < len(lista):
            q2 = dict(q, page=str(pg + 1))
            extra["Link"] = '<http://127.0.0.1:%d%s?%s>; rel="next"' % (self.puerto, base, urllib.parse.urlencode(q2))
        return trozo, extra

    def do_GET(self):
        self._ruta("GET")

    def do_PUT(self):
        self._ruta("PUT")

    def _ruta(self, metodo):
        d = self.datos
        u = urllib.parse.urlparse(self.path)
        p, q = u.path, {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if self.pedidas is not None:
            self.pedidas.append((metodo, p, dict(self.headers)))
        if p.startswith("/blob/"):
            if self.headers.get("Authorization"):
                return self._json(400, {"message": "El almacén no acepta la cabecera Authorization"})
            texto = d.jobs[int(p.rsplit("/", 1)[-1])]["_log"].encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(texto)))
            self.end_headers()
            self.wfile.write(texto)
            return
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self._json(401, {"message": "Bad credentials"})
        if d.cuota is not None:
            with d.cuota_cerrojo:
                if d.cuota <= 0:
                    return self._json(403, {"message": "API rate limit exceeded for user."})
                d.cuota -= 1  # (un 304 la devolvería, pero aquí basta con contar todas)
        if p == "/user":
            return self._json(200, {"login": "usuario-demo"}, {"X-OAuth-Scopes": "repo"})
        m = re.match(r"^/orgs/([^/]+)/repos$", p)
        if m:
            if m.group(1) != ORG:
                return self._json(404, {"message": "Not Found"})
            lista = [_repo_json(r) for r in d.repos.values()]
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, trozo, extra)
        m = re.match(r"^/orgs/([^/]+)/properties/values$", p)
        if m:
            if m.group(1) != ORG or d.sin_propiedades:
                return self._json(404, {"message": "Not Found"})
            lista = [{"repository_id": k, "repository_name": r["nombre"], "repository_full_name": r["full"],
                      "properties": [{"property_name": n, "value": v} for n, v in (r.get("props") or {}).items()]}
                     for k, r in enumerate(d.repos.values()) if _cumple(r, q.get("repository_query"))]
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, trozo, extra)
        if p == "/search/repositories":
            lista = [_repo_json(r) for r in d.repos.values() if _cumple(r, q.get("q"))]
            trozo, extra = self._paginar(lista, q, p)
            # La búsqueda tiene su propia cuota (30 por minuto), como en GitHub.
            extra.update({"X-RateLimit-Resource": "search", "X-RateLimit-Remaining": "29", "X-RateLimit-Reset": str(int(time.time()) + 60)})
            return self._json(200, {"total_count": len(lista), "incomplete_results": False, "items": trozo}, extra)
        m = re.match(r"^/repos/([^/]+/[^/]+)(/.*)?$", p)
        if not m:
            return self._json(404, {"message": "Not Found"})
        full, resto = m.group(1), m.group(2) or ""
        if resto.startswith("/contents/") and metodo == "GET" and full in d.repos:
            ruta = urllib.parse.unquote(resto[len("/contents/"):])
            v = d.versiones.get((full, q.get("ref", ""))) or {}
            if ruta not in v:
                return self._json(404, {"message": "Not Found"})
            texto = ("\n".join(v[ruta]) + "\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(texto)))
            self.end_headers()
            self.wfile.write(texto)
            return
        if metodo == "PUT" or resto.startswith("/contents/"):
            return self._contenidos(metodo, full, resto, q)
        r = d.repos.get(full)
        if not r and resto == "" and full.startswith("rdr-nfq/"):  # repo de NFQ para la subida
            return self._json(200, {"full_name": full, "private": True, "permissions": {"push": True}})
        if not r:
            return self._json(404, {"message": "Not Found"})
        if resto == "":
            return self._json(200, _repo_json(r))
        if resto == "/branches":
            lista = [{"name": n, "commit": {"sha": b["sha"]}} for n, b in r["ramas"].items()]
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, trozo, extra)
        if resto == "/pulls":
            est = q.get("state", "open")
            ps = [x for x in r["prs"] if est == "all" or x["state"] == est]
            return self._json(200, sorted(ps, key=lambda x: x["updated_at"], reverse=True))
        m = re.match(r"^/(?:pulls|issues)/(\d+)(/files|/commits|/reviews|/comments)?$", resto)
        if m:
            pr = next((x for x in r["prs"] if x["number"] == int(m.group(1))), None)
            if not pr:
                return self._json(404, {"message": "Not Found"})
            cab = r["ramas"].get(pr["head"]["ref"]) or {"sha": "0" * 40, "commits": [], "files": []}
            sub_ = m.group(2)
            if sub_ is None:
                j = dict(pr, head=dict(pr["head"], sha=cab["sha"]), base=dict(pr["base"], sha=r["ramas"]["master"]["sha"]),
                         additions=sum(f["additions"] for f in cab["files"]), deletions=sum(f["deletions"] for f in cab["files"]),
                         changed_files=len(cab["files"]), commits=len(cab["commits"]),
                         merged_by={"login": "ana-ruiz"} if pr.get("merged_at") else None)
                return self._json(200, j)
            if sub_ == "/files":
                trozo, extra = self._paginar(cab["files"], q, p)
                return self._json(200, trozo, extra)
            if sub_ == "/commits":
                return self._json(200, [_commit_json(full, c) for c in cab["commits"]])
            if sub_ == "/reviews":
                return self._json(200, [{"user": {"login": "lgarrido"}, "state": "APPROVED", "body": "Revisado, adelante.",
                                         "submitted_at": pr["updated_at"]}] if pr["number"] % 2 else [])
            if "/issues/" in p:
                return self._json(200, [{"user": {"login": "pnavarro"}, "created_at": pr["created_at"],
                                         "body": "¿Esto entra en el pase del sábado?"},
                                        {"user": pr["user"], "created_at": pr["updated_at"], "body": "Sí, con el DP de la release."}])
            f0 = (cab["files"] or [{}])[0]
            return self._json(200, [{"user": {"login": "jmartin"}, "created_at": pr["updated_at"], "path": f0.get("filename"), "line": 12,
                                     "body": "Ojo con este cambio: revisa el redondeo.",
                                     "diff_hunk": "\n".join((f0.get("patch") or "").split("\n")[:5])}] if f0 else [])
        if resto == "/tags":
            return self._json(200, [{"name": "v" + r["rel"][0], "commit": {"sha": r["ramas"]["master"]["sha"]}}])
        m = re.match(r"^/git/trees/([0-9a-f]+)$", resto)
        if m:
            v = d.versiones.get((full, m.group(1))) or {}
            dirs, arbol = set(), []
            for ruta, lineas in sorted(v.items()):
                partes = ruta.split("/")
                for i in range(1, len(partes)):
                    dirs.add("/".join(partes[:i]))
                arbol.append({"path": ruta, "type": "blob", "size": len("\n".join(lineas)) + 1, "sha": _blob(ruta, lineas)})
            arbol += [{"path": x, "type": "tree"} for x in sorted(dirs)]
            return self._json(200, {"sha": m.group(1), "tree": arbol, "truncated": False})
        if resto.startswith("/commits/") and "vnd.github.sha" in (self.headers.get("Accept") or ""):
            ref = urllib.parse.unquote(resto[len("/commits/"):])
            sha = (r["ramas"].get(ref) or {}).get("sha") or ({"v" + r["rel"][0]: r["ramas"]["master"]["sha"]}.get(ref)) or ref
            texto = sha.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(texto)))
            self.end_headers()
            self.wfile.write(texto)
            return
        if resto == "/actions/runs":
            lista = [{k: v for k, v in x.items() if not k.startswith("_")} for x in r["runs"]]
            lista.sort(key=lambda x: x["created_at"], reverse=True)
            trozo, extra = self._paginar(lista, q, p)
            return self._json(200, {"total_count": len(lista), "workflow_runs": trozo}, extra)
        if resto == "/commits":
            ref = q.get("sha", "master")
            rama = r["ramas"].get(ref)
            cs = r["base_commits"] + ([] if ref == "master" or not rama else rama["commits"])
            if q.get("path"):
                cs = [c for c in cs if any(f["filename"] == q["path"] for f in c.get("files") or [])]
            cs = sorted(cs, key=lambda c: c["fecha"], reverse=True)
            pp, pg = int(q.get("per_page", 30)), int(q.get("page", 1))
            return self._json(200, [_commit_json(full, c) for c in cs[(pg - 1) * pp: pg * pp]])
        m = re.match(r"^/commits/([0-9a-f]+)$", resto)
        if m:
            for b in r["ramas"].values():
                for c in b["commits"] + r["base_commits"]:
                    if c["sha"].startswith(m.group(1)):
                        j = _commit_json(full, c)
                        fs = c.get("files") or []
                        j.update(files=fs, parents=[{"sha": c["padre"]}] if c.get("padre") else [],
                                 stats={"additions": sum(f["additions"] for f in fs), "deletions": sum(f["deletions"] for f in fs),
                                        "total": sum(f["changes"] for f in fs)})
                        return self._json(200, j)
            return self._json(200, _commit_json(full, {"sha": m.group(1), "fecha": d.hoy.isoformat(), "autor": "ana-ruiz",
                                                        "mensaje": "Commit"}))
        m = re.match(r"^/compare/([0-9a-f]+)\.\.\.([0-9a-f]+)$", resto)
        if m:
            base, cab = m.group(1), m.group(2)
            master = r["ramas"]["master"]["sha"]
            if cab == master and base != master:  # al revés: lo que producción tiene y la rama no
                rama = next((b for b in r["ramas"].values() if b["sha"] == base), None)
                if rama is None:
                    return self._json(404, {"message": "Not Found"})
                rutas = d.hotfix_prod.get((full, base), [])
                fs = [{"filename": x, "status": "modified", "additions": 2, "deletions": 1, "changes": 3} for x in rutas]
                cs = [_commit_json(full, {"sha": _sha(full, "hotfix-prod", base), "fecha": d.hoy.isoformat(), "autor": "jmartin",
                                          "mensaje": "Hotfix en producción"})] if rama["behind"] else []
                return self._json(200, {"ahead_by": rama["behind"], "behind_by": len(rama["commits"]), "total_commits": rama["behind"],
                                        "status": "diverged", "merge_base_commit": {"sha": master}, "commits": cs, "files": fs})
            rama = next((b for b in r["ramas"].values() if b["sha"] == cab), None)
            if rama is None:
                return self._json(404, {"message": "Not Found"})
            vers = d.versiones.get((full, cab)) or {}
            fs = [dict(f, sha=_blob(f["filename"], vers.get(f["filename"]))) for f in rama["files"]]
            return self._json(200, {"ahead_by": len(rama["commits"]), "behind_by": rama["behind"],
                                    "total_commits": len(rama["commits"]), "status": "diverged" if rama["behind"] else "ahead",
                                    "merge_base_commit": {"sha": master},
                                    "commits": [_commit_json(full, c) for c in rama["commits"]], "files": fs})
        m = re.match(r"^/actions/runs/(\d+)/jobs$", resto)
        if m:
            run = d.runs[int(m.group(1))]
            jobs = [{"id": j, "name": d.jobs[j]["name"], "status": "completed", "conclusion": d.jobs[j]["conclusion"],
                     "steps": d.jobs[j]["steps"],
                     "check_run_url": "http://127.0.0.1:%d/repos/%s/check-runs/%d" % (self.puerto, full, j)}
                    for j in run["_jobs"]]
            return self._json(200, {"total_count": len(jobs), "jobs": jobs})
        m = re.match(r"^/check-suites/(\d+)/check-runs$", resto)
        if m:  # la check suite de una ejecución es la propia ejecución en la demo
            run = d.runs.get(int(m.group(1)))
            if not run:
                return self._json(404, {"message": "Not Found"})
            chks = [{"id": j, "name": d.jobs[j]["name"], "status": "completed", "conclusion": d.jobs[j]["conclusion"],
                     "url": "http://127.0.0.1:%d/repos/%s/check-runs/%d" % (self.puerto, full, j), "output": d.jobs[j]["_salida"]}
                    for j in run["_jobs"]]
            return self._json(200, {"total_count": len(chks), "check_runs": chks})
        m = re.match(r"^/check-runs/(\d+)(/annotations)?$", resto)
        if m:
            j = d.jobs[int(m.group(1))]
            if m.group(2):
                return self._json(200, j["_anns"])
            return self._json(200, {"id": j["id"], "output": j["_salida"]})
        m = re.match(r"^/actions/jobs/(\d+)/logs$", resto)
        if m:
            self.send_response(302)
            self.send_header("Location", "http://127.0.0.1:%d/blob/log/%s" % (self.puerto, m.group(1)))
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        return self._json(404, {"message": "Not Found"})

    def _contenidos(self, metodo, full, resto, q):
        ruta = urllib.parse.unquote(resto[len("/contents/"):])
        clave = (full, ruta)
        actual = self.datos.contenidos.get(clave)
        if metodo == "GET":
            if not actual:
                return self._json(404, {"message": "Not Found"})
            return self._json(200, {"sha": actual["sha"], "path": ruta})
        n = int(self.headers.get("Content-Length") or 0)
        cuerpo = json.loads(self.rfile.read(n) or b"{}")
        if actual and cuerpo.get("sha") != actual["sha"]:
            return self._json(409, {"message": "sha does not match"})
        texto = base64.b64decode(cuerpo["content"]).decode()
        nuevo = {"sha": _sha(ruta, texto), "texto": texto, "mensaje": cuerpo.get("message")}
        self.datos.contenidos[clave] = nuevo
        url = "https://demo.invalid/%s/blob/%s/%s" % (full, cuerpo.get("branch"), ruta)
        return self._json(201 if not actual else 200, {"content": {"html_url": url, "sha": nuevo["sha"]},
                                                         "commit": {"html_url": "https://demo.invalid/%s/commit/%s" % (full, nuevo["sha"])}})


def arrancar(puerto=0, semilla=7, pedidas=None, extra=150):
    """Arranca el GitHub simulado en 127.0.0.1. -> (servidor, puerto, datos)"""
    datos = Datos(semilla, extra)
    H = type("H", (_H,), {"datos": datos, "pedidas": pedidas})
    srv = ThreadingHTTPServer(("127.0.0.1", puerto), H)
    H.puerto = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, H.puerto, datos


REGLAS_DEMO = [
    {"patron": r"^\.github/", "ignorar": True},
    {"patron": r"(^|/)(README|CHANGELOG)[^/]*$", "ignorar": True},
    {"patron": r"(^|/)src/test/", "ignorar": True},
    {"patron": r"(?P<nombre>[^/]+)\.java$", "tipo": "Java", "subida": "Java"},
    {"patron": r"^workstation/(?P<nombre>[^/]+)/", "tipo": "Workstation", "subida": "Workstation"},
    {"patron": r"^objetos/(?P<nombre>[^/]+)\.(sql|ddl)$", "tipo": "Objeto GS", "subida": "Paquete Custom"},
    {"patron": r"^estaticos/", "tipo": "Estático", "subida": "Estáticos"},
    {"patron": r"^datax/(?P<nombre>[^/]+)\.json$", "tipo": "DataX", "subida": "DataX"},
    {"patron": r"^cadenas/(?P<nombre>[^/.]+)", "tipo": "Cadena", "subida": "Cadenas"},
    {"patron": r"^aperiodicos/(?P<nombre>[^/.]+)", "tipo": "Aperiódico", "subida": "Aperiódicos"},
]


def config_demo(puerto_ghe, url_jira=""):
    return {
        "jira": {"url": url_jira, "token": "", "proyectoReleases": "CIBRDR"},
        "bbva": {"host": "demo.invalid", "api": "http://127.0.0.1:%d" % puerto_ghe, "token": "",
                 "organizaciones": [ORG], "filtroRepos": "props.uuaa:KYTL0000", "refrescoMin": 60, "proxy": "", "ca": ""},
        "nfq": {"host": "github.com", "repo": "rdr-nfq/pases-datos", "token": "", "publicarDPs": False},
        "proyectos": {k: v for k, (_, v) in {**PROYECTOS, **PROYECTOS_EXTRA}.items() if v},
        "reglas": REGLAS_DEMO,
    }
