"use client";

// Datos de Vacaciones v2 (backend apps-script/vacaciones/Codigo_Vacaciones.gs,
// clave "vacacionesV2Backend" de links.json). Mismo patrón que Guardias:
// GET para leer, POST text/plain JSON para escribir (sin preflight).
// Mientras la clave no tenga URL, /vacaciones sigue con el backend antiguo.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLinks } from "@/lib/links";
import { useAuth } from "../chrome/AuthGate";

export const CLAVE_V2 = "vacacionesV2Backend";

async function leerJSON(r) {
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch {
    const titulo = ((/<title>([^<]*)<\/title>/i.exec(txt) || [])[1] || "").trim();
    const err = new Error(
      `el backend de Vacaciones ha devuelto una página de Google en vez de datos (HTTP ${r.status}${titulo ? ` · «${titulo}»` : ""}). ` +
      "Mira el error en Apps Script → Ejecuciones; suele ser un permiso sin autorizar (ejecuta autorizar()) o una URL de implementación antigua."
    );
    err.html = true;
    throw err;
  }
}

/** ¿Está configurado el backend nuevo? null mientras carga links.json. */
export function useV2Configurado() {
  const { getUrl, error } = useLinks();
  const listo = error || getUrl("_updated") != null || getUrl("_comment") != null || getUrl(CLAVE_V2) != null;
  if (!listo) return null;
  return getUrl(CLAVE_V2) != null;
}

export function useVacaciones(anio) {
  const { getUrl, error: linksError } = useLinks();
  const { email } = useAuth();
  const [snap, setSnap] = useState(null); // { data, error }
  const urlRef = useRef(null);

  const load = useCallback(async (silencioso = false) => {
    const url = linksError ? null : getUrl(CLAVE_V2);
    urlRef.current = url;
    if (!url) {
      setSnap({ data: null, error: linksError ? "no se pudo leer links.json" : `falta ${CLAVE_V2} en links.json` });
      return;
    }
    if (!silencioso) setSnap(null);
    const qp = new URLSearchParams({ action: "datos", email: email || "", ...(anio ? { anio: String(anio) } : {}) }).toString();
    const u = url + (url.indexOf("?") < 0 ? "?" : "&") + qp;
    for (let intento = 1; ; intento++) {
      try {
        const res = await fetch(u, { cache: "no-store", signal: AbortSignal.timeout(60000) }).then(leerJSON);
        if (!res || !res.ok) throw new Error((res && res.error) || "respuesta inesperada");
        setSnap({ data: res.data, error: "" });
        return;
      } catch (e) {
        if (e.html && intento < 2) { await new Promise((ok) => setTimeout(ok, 1500)); continue; }
        setSnap((prev) => (silencioso && prev?.data ? { ...prev, avisoRecarga: String(e.message || e) } : { data: null, error: String(e.message || e) }));
        return;
      }
    }
  }, [getUrl, linksError, email, anio]);

  useEffect(() => {
    const listo = linksError || getUrl(CLAVE_V2) != null || getUrl("_updated") != null || getUrl("_comment") != null;
    if (!listo || !email) return;
    load();
  }, [getUrl, linksError, load, email]);

  // Las escrituras NO se reintentan (podrían haberse guardado ya).
  const post = useCallback(async (action, body) => {
    const url = urlRef.current;
    if (!url) throw new Error(`Backend no configurado (${CLAVE_V2} en links.json).`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, email, ...body }),
    }).then(leerJSON);
    if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
    return res.data;
  }, [email]);

  return { snap, reload: load, post };
}

/* ── Utilidades de fechas/estado compartidas por las dos vistas ── */
export const ESTADO_SOL = {
  PENDIENTE: { label: "Pendiente", accent: "canary" },
  APROBADA: { label: "Aprobada", accent: "lime" },
  RECHAZADA: { label: "Rechazada", accent: "mandarin" },
  CANCELADA: { label: "Retirada", accent: "sand" },
  ANULADA: { label: "Anulada", accent: "sand" },
  MODIFICADA: { label: "Modificada", accent: "aqua" },
};

export const CLASE_SOL = {
  NUEVA: { label: "Solicitud", corto: "", a: "a" },
  CANCELACION: { label: "Cancelación", corto: "🗑️ Cancelación", a: "a" },
  MODIFICACION: { label: "Cambio", corto: "🔁 Cambio", a: "o" },
};

/** Bloques de días aprobados de una persona ({inicio, fin, motivo, dias, fechas[]}),
 *  agrupando por código y saltando fines de semana/festivos. Solo `tipos`. */
export function bloquesDe(ausenciasPorDia, nombre, festivosGrupo, tipos) {
  const fechas = Object.keys(ausenciasPorDia || {}).sort().flatMap((iso) =>
    (ausenciasPorDia[iso] || []).filter((a) => a.nombre === nombre && (!tipos || tipos.includes(a.motivo))).map((a) => ({ dateStr: iso, motivo: a.motivo })));
  const bloques = [];
  let cur = null;
  for (const f of fechas) {
    const hueco = cur ? laborables(sumarDia(cur.fin), restarDia(f.dateStr), festivosGrupo).length : -1;
    if (cur && cur.motivo === f.motivo && hueco === 0) {
      cur.fin = f.dateStr; cur.fechas.push(f.dateStr); cur.dias++;
    } else {
      cur = { inicio: f.dateStr, fin: f.dateStr, motivo: f.motivo, dias: 1, fechas: [f.dateStr] };
      bloques.push(cur);
    }
  }
  return bloques;
}
const sumarDia = (iso) => { const d = deIso(iso); d.setDate(d.getDate() + 1); return isoDe(d); };
const restarDia = (iso) => { const d = deIso(iso); d.setDate(d.getDate() - 1); return isoDe(d); };

const p2 = (n) => String(n).padStart(2, "0");
export const isoDe = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const deIso = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const fechaCortaEs = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
export function rangoIso(desde, hasta) {
  const out = [];
  if (!desde || !hasta || hasta < desde) return out;
  for (let d = deIso(desde); isoDe(d) <= hasta && out.length < 400; d.setDate(d.getDate() + 1)) out.push(isoDe(d));
  return out;
}

/** Festivos de un grupo: { iso: true } a partir de festivosDetalle/festivosTodos. */
export function festivosDeGrupo(lista, grupo) {
  const out = {};
  (lista || []).forEach((f) => { if (f.grupo === grupo) out[f.fecha] = true; });
  return out;
}

/** Mapa de vista de festivos (ES/MX/AMBOS) solo para un grupo. */
export function festivosVistaGrupo(lista, grupos, grupo) {
  const pais = Object.fromEntries((grupos || []).map((g) => [g.grupo, g.pais]));
  const out = {};
  (lista || []).forEach((f) => { if (f.grupo === grupo) out[f.fecha] = pais[f.grupo] || "ES"; });
  return out;
}

/** Días laborables de un rango para alguien de `grupo` (sin fines de semana ni sus festivos). */
export function laborables(desde, hasta, festivosGrupo) {
  return rangoIso(desde, hasta).filter((iso) => {
    const d = deIso(iso).getDay();
    return d !== 0 && d !== 6 && !(festivosGrupo && festivosGrupo[iso]);
  });
}
