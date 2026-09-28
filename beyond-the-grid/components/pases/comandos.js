/**
 * Biblioteca de comandos de comprobación post-implantación.
 * Portada 1:1 del documento "Comandos Pase Calendado RDR" (legacy
 * pases-calendados.html). Placeholders {NOMBRE} (componente) y {COD}
 * (DP-KYTL-XXX, SS-XXX…) se resuelven en runtime con los datos reales.
 *
 * Los bloques DP_KYTL / SS / ARQDAT usan plantillas de enlaces de
 * links.json ("despliegueENOA" y "jiraBrowse", con {COD}) — se inyectan
 * vía el parámetro `tpls` de resolverBloquesComandos.
 */

export const COMANDOS = {
  // ─── Por tipo de componente / subida ───
  JAVAS: {
    titulo: "JAVAS",
    pasos: [
      { txt: "cd /pr/kytl/online/multipais/multicanal/jar", desc: "Ir al directorio de JARs" },
      { txt: "ls -alrt {NOMBRE}*", desc: "Comprobar que el .jar se ha creado / modificado (wildcard para cualquier versión / sufijo)" },
    ],
  },
  WORKSTATION: {
    titulo: "WORKSTATION",
    pasos: [
      { txt: "cd /usr/local/pr/goldensource_87/release/RDR/custom/PostInstallation/", desc: "Ir al directorio de instalación" },
      { txt: "tail -f Workstation.log", desc: "Debe salir BUILD SUCCESSFUL" },
    ],
  },
  ESTATICOS: {
    titulo: "ESTÁTICOS",
    pasos: [
      { txt: "cd /pr/kytl/online/multipais/multicanal/dat/properties", desc: "Ir al directorio de properties" },
      { txt: "ls -alrt {NOMBRE}", desc: "Comprobar que se ha creado / modificado" },
      { txt: "cat {NOMBRE}", desc: "Comprobar que se ha realizado el cambio" },
    ],
  },
  EXTRACCION: {
    titulo: "EXTRACCIÓN",
    pasos: [
      { txt: "select * from FT_T_ATE1 where ACTION_NME='{NOMBRE}';", desc: "Comprobar que se ha creado / modificado" },
    ],
  },
  PROCEDIMIENTOS: {
    titulo: "PROCEDIMIENTOS",
    pasos: [
      { txt: "SELECT object_name, object_type, status, last_ddl_time FROM all_objects WHERE object_type IN ('PROCEDURE') AND object_name = '{NOMBRE}';", desc: "Comprobar que se ha creado / modificado" },
    ],
  },
  FUNCIONES: {
    titulo: "FUNCIONES",
    pasos: [
      { txt: "SELECT object_name, object_type, status, last_ddl_time FROM all_objects WHERE object_type IN ('FUNCTION') AND object_name = '{NOMBRE}';", desc: "Comprobar que se ha creado / modificado" },
    ],
  },
  WORKFLOWS: {
    titulo: "WORKFLOWS",
    pasos: [
      { txt: "select * from FT_WF_WFDF where WORKFLOW_NME='{NOMBRE}';", desc: "Comprobar que se ha generado la nueva versión" },
    ],
  },
  QUERIES: {
    titulo: "QUERIES",
    pasos: [
      { txt: "select * from FT_CFG_QRDF where QUERY_NME='{NOMBRE}';", desc: "Comprobar que se ha creado / modificado" },
    ],
  },
  RESOURCES: {
    titulo: "RECURSOS",
    pasos: [
      { txt: "select * from FT_CFG_RSRC where URI like '%{NOMBRE}';", desc: "Comprobar que se ha creado / modificado" },
    ],
  },
  PAQUETE: {
    titulo: "PAQUETE",
    pasos: [
      { txt: "select * from FT_T_IICP order by CREATED_TMS desc;", desc: "Comprobar que el último se ha implementado" },
    ],
  },
  // ─── Por prefijo de código (txt = plantilla de links.json con {COD}) ───
  DP_KYTL: {
    titulo: "Link DP-KYTL",
    pasos: [{ txt: "", desc: "Abrir el link para verificar el deployment", esLink: true }],
  },
  SS: {
    titulo: "Link JIRA SS",
    pasos: [{ txt: "", desc: "Abrir el JIRA para verificar el estado", esLink: true }],
  },
  ARQDAT: {
    titulo: "Link JIRA ARQDAT",
    pasos: [{ txt: "", desc: "Abrir el JIRA para verificar el estado", esLink: true }],
  },
  NOVA: {
    titulo: "Plan NOVA",
    pasos: [{ txt: "", desc: "Abrir el dashboard de NOVA y comprobar que el plan del despliegue está instalado en PRO", esLink: true }],
  },
  // ─── Pasos del sistema (no dependen del componente) ───
  PARADA: {
    titulo: "PARADA DEL SISTEMA",
    pasos: [
      {
        agrupado: true,
        titulo: "Verificar parada de procesos KYTL",
        maquinas: "TODAS las máquinas",
        comandos: ["ps -edf | grep KYTL"],
        esperado: "Debe salir SOLO UNA línea (la del propio grep).",
      },
    ],
  },
  ARRANQUE: {
    titulo: "ARRANQUE DEL SISTEMA",
    pasos: [
      {
        agrupado: true,
        titulo: "Paso 0 · Procesos KYTL arrancados",
        maquinas: "TODAS las máquinas",
        comandos: ["ps -edf | grep KYTL"],
        esperado: "Deben salir VARIAS líneas (a diferencia de la PARADA, que dejaba una sola).",
      },
      {
        agrupado: true,
        titulo: "Paso 1 · Orchestrator de Fileloading",
        maquinas: "Máquinas 501 y 602",
        comandos: ["cd /usr/local/pr/goldensource_87/ApplicationLogs/Fileloading", "ls -alrt"],
        esperado: "Debe existir el archivo goldensource.orchestrator.log.",
      },
      {
        agrupado: true,
        titulo: "Paso 2 · Verificar idioma del log (perezosos)",
        maquinas: "TODAS las máquinas",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7.1", "grep -Rnis WFLYSRV0025 *"],
        esperado: "Debe poner 'perezosos', NO 'lazy'.",
      },
      {
        agrupado: true,
        titulo: "Paso 3 · Host-controller conectado",
        maquinas: "TODAS las máquinas",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/DOMAIN", "grep conectado host-controller.log"],
        esperado: "Debe poner 'conectado'.",
      },
      {
        agrupado: true,
        titulo: "Paso 4 · RDR_Receive en 501",
        maquinas: "Máquina 501",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR501_KYTL_01_10", 'grep -ai "RDR_Receive" server*.log'],
        esperado: "Comprobar 12 detenidos.",
      },
      {
        agrupado: true,
        titulo: "Paso 5 · RDR_Receive en 602",
        maquinas: "Máquina 602",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR602_KYTL_01_20", 'grep -ai "RDR_Receive" server*.log'],
        esperado: "Comprobar 12 detenidos.",
      },
      {
        agrupado: true,
        titulo: "Paso 6 · ServicesRDR arrancado",
        maquinas: "Máquinas 501 y 602",
        comandos: ["ps -edf | grep ServicesRDR"],
        esperado: "Deben salir VARIAS líneas.",
      },
      {
        agrupado: true,
        titulo: "Paso 7 · Sin errores periódicos en 501",
        maquinas: "Máquina 501",
        comandos: [
          "cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR501_KYTL_01_10",
          'grep "Invocación EJB" server.log',
          "cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR501_KYTL_02_10",
          'grep "Invocación EJB" server.log',
        ],
        esperado: "NO deben salir errores periódicos en ninguno de los dos directorios.",
      },
      {
        agrupado: true,
        titulo: "Paso 8 · Sin errores periódicos en 602",
        maquinas: "Máquina 602",
        comandos: [
          "cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR602_KYTL_01_20",
          'grep "Invocación EJB" server.log',
          "cd /logs/pr/producto/jboss_eap/jboss-eap-7.1/LPRDR602_KYTL_02_20",
          'grep "Invocación EJB" server.log',
        ],
        esperado: "NO deben salir errores periódicos en ninguno de los dos directorios.",
      },
      {
        agrupado: true,
        titulo: "Paso 9 · Sin superposición prog en 507",
        maquinas: "Máquina 507",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7/LPRDR507_KYTL_03_10", "grep 'superposición prog' server.log"],
        esperado: "NO deben salir errores periódicos.",
      },
      {
        agrupado: true,
        titulo: "Paso 10 · Sin superposición prog en 608",
        maquinas: "Máquina 608",
        comandos: ["cd /logs/pr/producto/jboss_eap/jboss-eap-7/LPRDR608_KYTL_03_20", "grep 'superposición prog' server.log"],
        esperado: "NO deben salir errores periódicos.",
      },
    ],
  },
  REINICIO_HANDLER: {
    titulo: "REINICIO HANDLER",
    pasos: [
      {
        agrupado: true,
        titulo: "Verificar procesos ServicesRDR",
        maquinas: "Máquinas 501 y 602",
        comandos: ["ps -edf | grep ServicesRDR"],
        esperado: "Deben salir varias líneas.",
      },
    ],
  },
  RECARGA_CACHE: {
    titulo: "RECARGA DE CACHE",
    pasos: [
      {
        agrupado: true,
        titulo: "Monitorización de los logs de cache",
        maquinas: "Servidor de aplicación",
        comandos: ["cd /pr/kytl/online/multipais/multicanal/logs", "tail -f CacheCAC1.log", "tail -f CacheOLAP.log"],
        esperado: "Ver el progreso de la recarga en CacheCAC1 y CacheOLAP. Sin errores en ninguno de los dos.",
      },
    ],
  },
  REINICIO_API: {
    titulo: "REINICIO API",
    pasos: [
      {
        agrupado: true,
        titulo: "Verificación en NOVA",
        maquinas: "Consola NOVA NRDR",
        comandos: [],
        esperado: "Revisar los logs en NOVA NRDR – Entorno Producción. Sin errores tras el reinicio.",
      },
    ],
  },
};
// El Reinicio Preventivo comparte comprobación con el ARRANQUE.
COMANDOS.REINICIO_PREVENTIVO = COMANDOS.ARRANQUE;

function clonarBloque(bloque) {
  return {
    titulo: bloque.titulo,
    pasos: bloque.pasos.map((p) => (p.agrupado ? { ...p, comandos: [...(p.comandos || [])] } : { ...p })),
  };
}

function resolverPlaceholders(bloque, vars) {
  const nombre = vars.NOMBRE || "[NOMBRE]";
  const cod = vars.COD || "[COD]";
  const repl = (s) => String(s || "").replace(/\{NOMBRE\}/g, nombre).replace(/\{COD\}/g, cod);
  return {
    titulo: bloque.titulo,
    pasos: bloque.pasos.map((p) => {
      if (p.agrupado) {
        return { ...p, titulo: repl(p.titulo), maquinas: repl(p.maquinas), esperado: repl(p.esperado), comandos: (p.comandos || []).map(repl) };
      }
      return { ...p, txt: repl(p.txt) };
    }),
  };
}

/* "Instalar Componente: DP-KYTL-1234" → ["DP-KYTL-1234"]
   "DP-KYTL-A y DP-KYTL-B"             → ["DP-KYTL-A", "DP-KYTL-B"]
   "Instalar API (NOVA): /todotasks/56781926" → ["/todotasks/56781926"] */
export function extraerCodigosDeElemento(elemento) {
  if (!elemento) return [];
  const re = /(?:DP-KYTL-|SS-|ARQDAT-|REQ-)[A-Z0-9_-]+|\/todotasks\/[A-Z0-9_-]+/gi;
  return (elemento.match(re) || []).map((s) => s.trim());
}

/** TODOS los componentes que comparten un mismo Cod. */
export function buscarComponentesPorCod(E, cod) {
  const codUp = String(cod || "").toUpperCase().trim();
  const out = [];
  (E?.proyectos || []).forEach((p) =>
    (p.componentes || []).forEach((c) => {
      if (String(c.codigo || "").toUpperCase().trim() === codUp) out.push(c);
    })
  );
  return out;
}

function etiquetaPorSubida(subidaLower, cod) {
  const s = subidaLower || "";
  if (s === "java") return "Instalar Javas: " + cod;
  if (s === "workstation") return "Instalar Workstation: " + cod;
  if (s === "nova") return "Instalar API (NOVA): " + cod;
  if (s.startsWith("paquete")) return "Instalar Paquete Custom: " + cod;
  if (s.startsWith("aperiódico") || s.startsWith("aperiodico")) return "Aperiódico: " + cod;
  if (s === "bbdd") return "Modificación modelo BBDD: " + cod;
  if (s === "remedy") return "REMEDY: " + cod;
  if (s.startsWith("estát") || s.startsWith("estat")) return "Estático: " + cod;
  if (s === "service") return "Service: " + cod;
  if (s === "ear") return "EAR: " + cod;
  if (s.startsWith("dependientes")) return "Dependientes Entorno: " + cod;
  return "Instalar Componente: " + cod;
}

/** Etiqueta del paso según el Tipo de Subida más representativo de un Cod. */
export function etiquetaPasoPorCod(E, cod) {
  const comps = buscarComponentesPorCod(E, cod);
  if (comps.length === 0) {
    const u = String(cod).toUpperCase();
    if (u.startsWith("REQ-")) return "REMEDY: " + cod;
    if (u.startsWith("SS-")) return "Aperiódico: " + cod;
    if (u.startsWith("ARQDAT-")) return "Modificación modelo BBDD: " + cod;
    if (u.startsWith("/TODOTASKS/")) return "Instalar API (NOVA): " + cod;
    return "Instalar Componente: " + cod;
  }
  const subida = (comps[0].subida || "").toLowerCase();
  return etiquetaPorSubida(subida, cod);
}

/* Un java registrado como "jar/Clase" (p.ej. "rdrRules/MiRegla") vive dentro
   de UN solo .jar ("rdrRules"): la comprobación va contra el jar
   ("ls -alrt rdrRules*"), no contra la ruta, que no existe en el directorio
   de JARs. */
const nombreJar = (nombre) => String(nombre || "").split("/")[0].trim();

// Mapeo Tipo Componente → bloque de comandos (parametrización confirmada).
function tipoABloque(tipoLower) {
  const t = tipoLower || "";
  if (t === "java") return "JAVAS";
  if (t === "workstation") return "WORKSTATION";
  if (t.startsWith("estát") || t.startsWith("estat")) return "ESTATICOS";
  if (t.startsWith("workfl")) return "WORKFLOWS";
  if (t === "query") return "QUERIES";
  if (t.startsWith("recurs")) return "RESOURCES";
  if (t.startsWith("procedimi")) return "PROCEDIMIENTOS";
  if (t.startsWith("func")) return "FUNCIONES";
  if (t.startsWith("extrac")) return "EXTRACCION";
  return null; // Evento, Cadena, Dependientes Entorno, Directorio → sin bloque específico
}

/**
 * Bloques de comandos aplicables a un elemento del orden, resueltos contra
 * los datos reales. `tpls` = { enoa, jira } — plantillas con {COD} de
 * links.json (despliegueENOA / jiraBrowse).
 */
export function resolverBloquesComandos(elemento, E, tpls = {}) {
  if (!elemento) return [];
  const elUp = elemento.toUpperCase();

  if (elUp.includes("PARADA")) return [clonarBloque(COMANDOS.PARADA)];
  if (elUp.includes("ARRANQUE")) return [clonarBloque(COMANDOS.ARRANQUE)];
  if (elUp.includes("REINICIO PREVENTIVO")) return [clonarBloque(COMANDOS.REINICIO_PREVENTIVO)];
  if (elUp.includes("REINICIO HANDLER")) return [clonarBloque(COMANDOS.REINICIO_HANDLER)];
  if (elUp.includes("REINICIO API")) return [clonarBloque(COMANDOS.REINICIO_API)];
  if (elUp.includes("RECARGA CACHE")) return [clonarBloque(COMANDOS.RECARGA_CACHE)];

  const codigos = extraerCodigosDeElemento(elemento);
  if (codigos.length === 0) return [];

  const conTpl = (bloque, tpl) => ({
    ...bloque,
    pasos: bloque.pasos.map((p) => ({ ...p, txt: tpl || p.txt })),
  });

  const bloques = [];
  const emitidosUnaVez = new Set(); // bloques independientes del componente: solo 1 vez por drawer
  codigos.forEach((cod) => {
    // 1. Bloque de link según prefijo del Cod. (REQ- no tiene link asociado).
    const codUp = cod.toUpperCase();
    if (codUp.startsWith("DP-KYTL-")) bloques.push(resolverPlaceholders(conTpl(COMANDOS.DP_KYTL, tpls.enoa), { COD: cod }));
    else if (codUp.startsWith("SS-")) bloques.push(resolverPlaceholders(conTpl(COMANDOS.SS, tpls.jira), { COD: cod }));
    else if (codUp.startsWith("ARQDAT-")) bloques.push(resolverPlaceholders(conTpl(COMANDOS.ARQDAT, tpls.jira), { COD: cod }));
    else if (codUp.startsWith("/TODOTASKS/")) {
      // API con subida NOVA: comprobar en el dashboard de NOVA que el plan
      // /todotasks/XXXX (informado en preparación) está instalado en PRO.
      const id = cod.split("/").filter(Boolean).pop() || "";
      const url = String(tpls.nova || "").replace(/\{ID\}/g, id);
      if (url) bloques.push({ ...COMANDOS.NOVA, pasos: COMANDOS.NOVA.pasos.map((p) => ({ ...p, txt: url })) });
    }

    // 2. Componentes que comparten este Cod. (paquete agrupado).
    const comps = buscarComponentesPorCod(E, cod);
    if (comps.length === 0) return;

    const subidaPaquete = comps.some((c) => String(c.subida || "").toLowerCase().startsWith("paquete"));
    if (subidaPaquete) bloques.push(resolverPlaceholders(COMANDOS.PAQUETE, { COD: cod }));

    // 3. Por cada componente, el bloque de su Tipo Componente (agrupados por tipo).
    const porBloque = {};
    comps.forEach((c) => {
      const bk = tipoABloque((c.tipo || "").toLowerCase());
      if (!bk) return;
      (porBloque[bk] = porBloque[bk] || []).push(c);
    });

    Object.keys(porBloque).forEach((bk) => {
      const plantilla = COMANDOS[bk];
      if (!plantilla) return;
      // Bloques cuyos comandos NO dependen del componente (sin {NOMBRE}),
      // como WORKSTATION (tail -f Workstation.log): se muestran UNA sola vez
      // por drawer, aunque el paquete tenga varios componentes.
      const dependeDelComponente = plantilla.pasos.some((p) => String(p.txt || "").includes("{NOMBRE}"));
      if (!dependeDelComponente) {
        if (emitidosUnaVez.has(bk)) return;
        emitidosUnaVez.add(bk);
        bloques.push(resolverPlaceholders(plantilla, { COD: cod }));
        return;
      }
      let lista = porBloque[bk];
      if (bk === "JAVAS") {
        // Varias reglas del mismo jar → una sola comprobación del jar.
        const vistos = new Set();
        lista = lista
          .map((c) => ({ ...c, nombre: nombreJar(c.nombre) }))
          .filter((c) => {
            const k = c.nombre.toLowerCase();
            if (c.nombre && vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
      }
      if (lista.length === 1) {
        bloques.push(resolverPlaceholders(plantilla, { NOMBRE: lista[0].nombre || "", COD: cod }));
      } else {
        // Varios componentes del mismo tipo dentro del paquete → un único
        // bloque con separadores por componente.
        const titulo = plantilla.titulo + " · " + lista.length + " componentes";
        const pasos = [];
        lista.forEach((c, idx) => {
          pasos.push({ esSeparador: true, desc: "— " + (c.nombre || "componente " + (idx + 1)) + " —" });
          plantilla.pasos.forEach((p) => {
            pasos.push({
              ...p,
              txt: String(p.txt).replace(/\{NOMBRE\}/g, c.nombre || "[NOMBRE]").replace(/\{COD\}/g, cod),
            });
          });
        });
        bloques.push({ titulo, pasos });
      }
    });
  });

  return bloques;
}
