// Modelo de datos de Guardias: cálculos puros, sin React ni DOM.

/* Q ("2026Q3") a partir de una fecha ISO "YYYY-MM-DD" de una guardia. */
export const qDeFecha = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const mes = Number(m[2]) - 1;
  return m[1] + "Q" + (Math.floor(mes / 3) + 1);
};

/* "2026-09-25" -> "25/09/2026" */
export const fechaEs = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
};

export const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const ESTADO = {
  pendiente: { label: "Pendiente", accent: "canary" },
  aprobada: { label: "Aprobada", accent: "lime" },
  rechazada: { label: "Rechazada", accent: "mandarin" },
};

/* Hoy en YYYY-MM-DD (input date) y HH:MM (input time), hora local. */
export const hoyISO = () => {
  const d = new Date();
  const dd = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
};

/* ── Duración y fechas (vista de coordinación) ── */
const aMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/* Minutos de guardia; si la salida es igual o anterior a la entrada, termina al día siguiente. */
export const minutos = (g) => {
  const a = aMin(g.horaEntrada), b = aMin(g.horaSalida);
  if (a == null || b == null) return 0;
  let t = b - a; if (t <= 0) t += 1440;
  return t;
};
export const cruzaMedianoche = (g) => { const a = aMin(g.horaEntrada); return a != null && a + minutos(g) > 1440; };
export const fDur = (m) => { if (!m) return "—"; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min`; };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dUTC = (iso) => new Date(String(iso).slice(0, 10) + "T12:00:00Z");
/* "2026-10-30" -> "vie 30 oct" (con el año si no es el actual) */
export const fDia = (iso, anioHoy) => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ""))) return String(iso || "");
  const d = dUTC(iso);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${String(iso).slice(0, 4) !== String(anioHoy) ? " " + String(iso).slice(0, 4) : ""}`;
};
export const fCorta = (iso) => { const d = dUTC(iso); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
export const masUnDia = (iso) => { const d = dUTC(iso); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
export const haceDias = (iso, hoy) => {
  if (!iso) return "";
  const n = Math.round((dUTC(hoy) - dUTC(iso)) / 864e5);
  return n <= 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`;
};
/* "2026Q4" -> "Q4 2026" */
export const qTxt = (q) => `${String(q).slice(4)} ${String(q).slice(0, 4)}`;
export const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const IMPORTES = [30, 70, 120, 240];
export const IMPORTE_MAX = 1000;
