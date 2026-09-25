/* Modelo del Time Report (puro, sin React): quincenas, jornadas, algoritmo de
   reparto y generación del portapapeles para el TR de BBVA.

   REGLAS DEL REPARTO (acordadas con coordinación):
   - Horas ENTERAS siempre. Máximo 24 h/día por persona (capacidad de
     imputación). Mínimo la jornada en días laborables: 9 h L-J y 6 h V,
     salvo julio y agosto que son 6 h todos los días.
   - Festivos (España) y fines de semana: 0 h.
   - Por defecto los proyectos deben quedar incurridos al 100 % el día 15
     del último mes del Q: la ventana de reparto son las quincenas 1..5 y la
     6ª se deja a Soporte a Usuarios. Si la 6ª es la ÚNICA que queda, se
     usa también para proyectos (si no, lo pendiente no tendría dónde ir).
   - Cada proyecto puede acotar su ventana con una quincena de INICIO y otra
     de FIN (1..6; fin 0 = automático, la regla anterior). Con fin = 6 el
     proyecto sí se reparte en la última quincena.
   - El reparto toca por defecto la quincena ACTUAL y futuras: lo pasado se
     respeta. Coordinación puede forzar recalcular desde una quincena
     anterior (reescribe lo ya imputado; se avisa en la previsualización).
   - Personas BLOQUEADAS: su imputación existente se congela; el reparto no
     les añade ni les quita nada.
   - Cada proyecto se reparte entre el MENOR número de personas posible
     (best-fit decreciente: el proyecto más grande primero, a la persona con
     más capacidad libre; si no cabe en una, se completa con la siguiente).
   - La jornada mínima se garantiza rellenando con Soporte a Usuarios. */

export const NIVEL1_PROYECTO = "Servicios prestados a proyectos con código";
export const NIVEL1_SOPORTE = "Servicios prestados a proyectos sin código";
export const NIVEL2_ANALISIS = "Análisis y diseño (antigua fase de Diseño)";
export const NIVELES2 = [NIVEL2_ANALISIS, "Codificación", "Pruebas"];
export const NIVEL3_OTRAS = "Otras Tecnologías";
export const OTRAS_TEC = "GoldenSource";
export const SOPORTE_ID = ""; // proyectoId vacío = Soporte a Usuarios

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const hoyISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const curQ = (d = new Date()) => d.getFullYear() + "Q" + (Math.floor(d.getMonth() / 3) + 1);

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* Las 6 quincenas de un Q: n 1..6, con TODOS sus días (AAAA-MM-DD). */
export function quincenasDeQ(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(String(q));
  if (!m) return [];
  const año = Number(m[1]);
  const mes0 = (Number(m[2]) - 1) * 3; // 0, 3, 6, 9
  const out = [];
  for (let i = 0; i < 3; i++) {
    const mes = mes0 + i;
    const ult = new Date(año, mes + 1, 0).getDate();
    for (const [ini, fin] of [[1, 15], [16, ult]]) {
      const dias = [];
      for (let d = ini; d <= fin; d++)
        dias.push(`${año}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
      out.push({ n: out.length + 1, mes, dias, label: `${ini}-${fin} ${MES_CORTO[mes]}` });
    }
  }
  return out;
}

export const esFinde = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  const dow = new Date(a, m - 1, d).getDay();
  return dow === 0 || dow === 6;
};

/* ¿Día laborable? (ni finde ni festivo de España). festivos: {iso: "ES"|"MX"|"AMBOS"} */
export const esLaborable = (iso, festivos) => {
  if (esFinde(iso)) return false;
  const f = (festivos || {})[iso];
  return !(f === "ES" || f === "AMBOS");
};

/* Jornada mínima de un día laborable: 9 h L-J, 6 h V; julio y agosto 6 h. */
export function jornada(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  if (m === 7 || m === 8) return 6;
  return new Date(a, m - 1, d).getDay() === 5 ? 6 : 9;
}

export const MAX_DIA = 24;

/* Quincena (1..6) en la que cae una fecha del Q; 0 si es anterior, 7 si posterior. */
export function quincenaDe(q, iso) {
  const qs = quincenasDeQ(q);
  if (!qs.length) return 0;
  if (iso < qs[0].dias[0]) return 0;
  for (const qn of qs) if (iso <= qn.dias[qn.dias.length - 1]) return qn.n;
  return 7;
}

const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/* Quincena "de mes" (1 = días 1-15, 2 = 16-fin) y nombre canónico de la
   carpeta de evidencias: "2_Quincena_Junio2026". Misma convención que el
   backend (Codigo_TimeReport.gs) y que el nombre de los ficheros
   ("2_Quincena_Junio2026_PabloLlorente.pdf"). */
export function etiquetaEvidencias(q, quincena) {
  const qn = quincenasDeQ(q).find((x) => x.n === quincena);
  if (!qn) return null;
  const nMes = quincena % 2 === 1 ? 1 : 2;
  const año = Number(String(q).slice(0, 4));
  return { nMes, mes: MES_LARGO[qn.mes], año, carpeta: `${nMes}_Quincena_${MES_LARGO[qn.mes]}${año}` };
}

/* Nombre de fichero canónico de una persona: sin espacios ni acentos. */
export const nombreFichero = (persona) =>
  String(persona || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "");

export const horasDe = (dias) => Object.values(dias || {}).reduce((a, v) => a + num(v), 0);

/* Horas de un proyecto ya repartidas en `reparto` (todas las quincenas o un filtro). */
export const horasProyecto = (reparto, proyectoId, filtroQuincena = null) =>
  (reparto || [])
    .filter((r) => r.proyectoId === proyectoId && (filtroQuincena == null || filtroQuincena(r.quincena)))
    .reduce((a, r) => a + horasDe(r.dias), 0);

/* Reparte `h` horas ENTERAS entre los días dados, lo más uniforme posible,
   respetando el hueco libre de cada día. Muta `usado` y devuelve {dia: horas}. */
function colocar(h, dias, usado) {
  const out = {};
  while (h > 0) {
    let puesto = false;
    for (const d of dias) {
      if (h <= 0) break;
      if ((usado[d] || 0) >= MAX_DIA) continue;
      usado[d] = (usado[d] || 0) + 1;
      out[d] = (out[d] || 0) + 1;
      h--;
      puesto = true;
    }
    if (!puesto) break; // sin hueco: el sobrante lo reporta el llamador
  }
  return { asignado: out, resto: h };
}

/* Quincena 1..6 válida, o 0 si no lo es (0 = "sin acotar"/automático). */
const qValida = (v) => {
  const n = Math.round(num(v));
  return n >= 1 && n <= 6 ? n : 0;
};

/**
 * ALGORITMO DE REPARTO. Devuelve { reparto, desde, pasadas, notificar, sinHueco }.
 *  - proyectos: [{id, sdatool, nombre, feature, horas, estados, personas?, inicio?, fin?}]
 *    (personas: si el proyecto trae una lista, SOLO se reparte entre ellas;
 *     inicio/fin: quincenas 1..6 que acotan su ventana, fin 0 = automático)
 *  - repartoActual: [{quincena, persona, proyectoId, dias:{iso:h}}] (todo el Q)
 *  - personas: nombres del equipo; bloqueadas: Set/array de nombres congelados
 *  - festivos: {iso: "ES"|"MX"|"AMBOS"}; hoy: ISO (para la ventana)
 *  - desdeMin (opcional): primera quincena a recalcular, nunca antes de la
 *    actual. Sirve para, tras corregir a mano lo que alguien imputó de verdad
 *    en una quincena, repartir lo que falta en las SIGUIENTES.
 *  - desde (opcional): quincena EXACTA desde la que recalcular, aunque ya
 *    haya pasado. Solo lo usa coordinación a propósito.
 */
export function repartir({ q, proyectos, repartoActual, personas, bloqueadas, festivos, hoy, desdeMin, desde: desdeForzado }) {
  const qs = quincenasDeQ(q);
  if (!qs.length) return { error: "Q inválido" };
  const bloq = new Set(bloqueadas || []);
  const hoyQ = quincenaDe(q, hoy || hoyISO());
  let desde;
  if (desdeForzado != null && qValida(desdeForzado)) {
    desde = qValida(desdeForzado);
  } else {
    desde = Math.max(1, Math.min(hoyQ === 0 ? 1 : hoyQ, 7));
    if (desdeMin != null) desde = Math.max(desde, Math.min(7, Math.round(num(desdeMin))));
  }
  if (desde > 6)
    return {
      error: desdeMin != null && desdeMin > 6
        ? "No quedan quincenas después de esta en el Q: no hay nada que recalcular."
        : "El trimestre ya ha terminado: no queda ninguna quincena que repartir.",
    };

  // Por defecto los proyectos terminan en la 5ª (15 del último mes); si la
  // única quincena que queda es la 6ª, se usa esa en vez de dejarlos fuera.
  const finDefecto = desde <= 5 ? 5 : 6;
  const ventanaDe = (p) => {
    const ini = Math.max(desde, qValida(p.inicio) || 1);
    const fin = qValida(p.fin) || finDefecto;
    return qs.filter((x) => x.n >= ini && x.n <= fin);
  };

  // Se conserva: todo lo anterior a `desde` + TODO lo de personas bloqueadas.
  const fijas = (repartoActual || []).filter((r) => r.quincena < desde || bloq.has(r.persona));
  const previas = (repartoActual || []).filter((r) => r.quincena >= desde && !bloq.has(r.persona));

  const libres = (personas || []).filter((p) => !bloq.has(p));

  // Capacidad usada por persona/día.
  const usado = {}; // persona -> {iso: h}
  libres.forEach((p) => { usado[p] = {}; });

  // Pendiente de cada proyecto = horas − lo ya fijado (pasado + bloqueadas).
  // Primero los de ventana más corta (los más difíciles de encajar); a igual
  // ventana, el más grande primero.
  const pendientes = (proyectos || [])
    .map((p) => {
      const ventana = ventanaDe(p);
      const dias = ventana.flatMap((x) => x.dias).filter((d) => esLaborable(d, festivos));
      return { ...p, ventana, dias, pendiente: num(p.horas) - horasProyecto(fijas, p.id) };
    })
    .filter((p) => p.pendiente > 0)
    .sort((a, b) => a.dias.length - b.dias.length || b.pendiente - a.pendiente);

  const nuevas = []; // filas nuevas {quincena, persona, proyectoId, dias}
  const sinHueco = [];

  for (const p of pendientes) {
    let resto = Math.round(p.pendiente);
    if (!p.dias.length) {
      const ini = qValida(p.inicio) || 1, fin = qValida(p.fin) || finDefecto;
      sinHueco.push({
        proyecto: p.nombre, horas: resto,
        motivo: fin < ini
          ? `su quincena de fin (${qs[fin - 1]?.label}) es anterior a la de inicio (${qs[ini - 1]?.label})`
          : fin < desde
            ? `su ventana (${qs[ini - 1]?.label} → ${qs[fin - 1]?.label}) ya pasó: amplía la quincena de fin`
            : "su ventana no tiene días laborables",
      });
      continue;
    }
    // Si el proyecto tiene lista de personas, SOLO se reparte entre ellas
    // (las bloqueadas quedan fuera igualmente).
    const candidatas = p.personas && p.personas.length
      ? libres.filter((x) => p.personas.includes(x))
      : libres;
    while (resto > 0) {
      // Candidata con MÁS capacidad restante (menos personas por proyecto).
      let mejor = null, mejorCap = 0;
      for (const per of candidatas) {
        const cap = p.dias.reduce((a, d) => a + (MAX_DIA - (usado[per][d] || 0)), 0);
        if (cap > mejorCap) { mejorCap = cap; mejor = per; }
      }
      if (!mejor || mejorCap <= 0) {
        sinHueco.push({ proyecto: p.nombre, horas: resto, motivo: candidatas.length ? "sin capacidad" : "sin personas disponibles (todas bloqueadas o fuera del equipo)" });
        break;
      }
      const meter = Math.min(resto, mejorCap);
      const { asignado } = colocar(meter, p.dias, usado[mejor]);
      resto -= meter;
      // Trocear lo asignado por quincena.
      for (const qn of p.ventana) {
        const dias = {};
        qn.dias.forEach((d) => { if (asignado[d]) dias[d] = asignado[d]; });
        if (Object.keys(dias).length) nuevas.push({ quincena: qn.n, persona: mejor, proyectoId: p.id, dias });
      }
    }
  }

  // SOPORTE: en todas las quincenas recalculadas, cada persona libre completa
  // la jornada mínima de cada día laborable con lo que no tenga de proyectos.
  const ventanaTodo = qs.filter((x) => x.n >= desde);
  for (const per of libres) {
    for (const qn of ventanaTodo) {
      const dias = {};
      for (const d of qn.dias) {
        if (!esLaborable(d, festivos)) continue;
        const falta = jornada(d) - (usado[per][d] || 0);
        if (falta > 0) dias[d] = falta;
      }
      if (Object.keys(dias).length) nuevas.push({ quincena: qn.n, persona: per, proyectoId: SOPORTE_ID, dias });
    }
  }

  const reparto = [...fijas, ...nuevas];

  // ¿A quién hay que NOTIFICAR? Personas (no bloqueadas) cuya imputación en la
  // ventana cambia respecto a lo que había guardado.
  const firma = (filas, per) =>
    JSON.stringify(
      filas
        .filter((r) => r.persona === per)
        .map((r) => [r.quincena, r.proyectoId, r.dias])
        .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
    );
  const notificar = libres.filter((per) => firma(previas, per) !== firma(nuevas, per));

  return { reparto, desde, pasadas: hoyQ > desde, finDefecto, notificar, sinHueco };
}

/* Capacidad máxima informativa que queda: días laborables desde `hoy` (incl.)
   hasta el 15 del último mes (o hasta fin de Q si ya solo queda la última
   quincena) × 24 h × nº de personas. */
export function capacidadMaxima({ q, personas, festivos, hoy }) {
  const qs = quincenasDeQ(q);
  if (!qs.length) return 0;
  const h = hoy || hoyISO();
  const hasta = quincenaDe(q, h) >= 6 ? 6 : 5;
  const dias = qs
    .filter((x) => x.n <= hasta)
    .flatMap((x) => x.dias)
    .filter((d) => d >= h && esLaborable(d, festivos));
  return dias.length * MAX_DIA * (personas || []).length;
}

/* ── Portapapeles para el TR de BBVA ──
   Columnas: SDATOOL | Nombre | (vacío) | CIBRDR | Otras Tec | N1 | N2 | N3 |
   vacío | vacío | vacío | día 1 .. último día de la quincena.
   Soporte: vacío | vacío | "Soporte usuarios" | vacío | vacío | N1 sin código |
   "Análisis y diseño…" | - | … (nunca Nivel 3). */
export function filasTR({ q, quincena, filas, proyectosPorId }) {
  const qn = quincenasDeQ(q).find((x) => x.n === quincena);
  if (!qn) return [];
  const orden = [...filas].sort((a, b) =>
    a.proyectoId === SOPORTE_ID ? 1 : b.proyectoId === SOPORTE_ID ? -1 : String(a.proyectoId).localeCompare(String(b.proyectoId))
  );
  return orden.map((r) => {
    const dias = qn.dias.map((d) => (num(r.dias?.[d]) > 0 ? String(Math.round(num(r.dias[d]))) : ""));
    if (r.proyectoId === SOPORTE_ID)
      return ["", "", "Soporte usuarios", "", "", NIVEL1_SOPORTE, NIVEL2_ANALISIS, "-", "", "", "", ...dias];
    const p = proyectosPorId[r.proyectoId] || {};
    const n2 = (p.estados || {})[quincena] || NIVEL2_ANALISIS;
    const conOtras = n2 === "Codificación" || n2 === "Pruebas";
    return [
      p.sdatool || "", p.nombre || "", "", p.feature || "",
      conOtras ? OTRAS_TEC : "",
      NIVEL1_PROYECTO, n2, conOtras ? NIVEL3_OTRAS : "-",
      "", "", "", ...dias,
    ];
  });
}

export const tsvTR = (filas) => filas.map((f) => f.join("\t")).join("\n");
