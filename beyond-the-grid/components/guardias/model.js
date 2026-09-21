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
