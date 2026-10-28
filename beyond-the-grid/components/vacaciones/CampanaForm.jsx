"use client";

import { useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { FIELD, TEXT } from "../coordinacion/ui";
import { deIso, isoDe, ESTADO_SOL } from "./datos";

/* Formulario especial de vacaciones («campaña»: Navidad, Verano…), encima del
   normal. Coordinación lo abre/cierra y elige las semanas en la pestaña
   Formularios de /vacaciones-gestion (backend: solicitarCampana). Se marcan
   una o varias semanas y se crea una solicitud normal por bloque de semanas
   seguidas; la descripción (p. ej. el backup en cada proyecto) puede ser
   obligatoria. */

const ACCENT = PALETTE.serene;
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (iso) => { const d = deIso(iso); return `${d.getDate()} ${MES3[d.getMonth()]}`; };
const mas = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };

/** Lunes -> "21 – 25 dic" (o "28 dic – 1 ene"). */
export const rangoSemana = (lunes) => {
  const v = mas(lunes, 4);
  return lunes.slice(5, 7) === v.slice(5, 7) ? `${Number(lunes.slice(8))} – ${corta(v)}` : `${corta(lunes)} – ${corta(v)}`;
};

/** Solicitudes de la campaña que tocan una semana (pendientes o aprobadas). */
export const solsDeSemana = (sols, campanaId, lunes, persona) =>
  (sols || []).filter((s) => s.campana === campanaId && (!persona || s.persona === persona)
    && ["PENDIENTE", "APROBADA"].includes(s.estado) && !(s.hasta < lunes || s.desde > mas(lunes, 6)));

export default function CampanaForm({ campana, datos, post, onHecho, sinMarco = false }) {
  const [sel, setSel] = useState(() => new Set());
  const [desc, setDesc] = useState("");
  const [estado, setEstado] = useState({ fase: "form" }); // form | enviando | ok | error
  const yo = datos.yo;
  const obligatoria = campana.descripcionObligatoria !== false;

  // Semanas ya pedidas en esta campaña (no se pueden volver a marcar).
  const pedidas = useMemo(() => {
    const out = {};
    for (const s of campana.semanas) {
      const x = solsDeSemana(datos.misSolicitudes, campana.id, s);
      if (x.length) out[s] = x[0].estado;
    }
    return out;
  }, [campana, datos.misSolicitudes]);

  const toggle = (s) => setSel((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const falta = !sel.size ? "Marca al menos una semana." : obligatoria && desc.trim().length < 3 ? "Rellena la descripción." : "";

  const enviar = async () => {
    if (falta || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    try {
      const r = await post("solicitarCampana", { campana: campana.id, semanas: [...sel].sort(), comentario: desc.trim() });
      setEstado({ fase: "ok", dias: r.dias, n: r.solicitudes.length, aviso: r.aviso });
      setSel(new Set());
      setDesc("");
      onHecho?.();
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  if (!yo) return null; // el formulario normal ya avisa de que no estás en el Excel

  return (
    <section
      className={sinMarco ? "" : "rounded-2xl border bg-white/[0.07] p-4 backdrop-blur-md"}
      style={sinMarco ? undefined : { borderColor: rgba(ACCENT, 0.6), boxShadow: `0 0 0 1px ${rgba(ACCENT, 0.15)}` }}
      aria-label={campana.nombre}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-xl" style={{ borderColor: rgba(ACCENT, 0.35), background: rgba(ACCENT, 0.14) }} aria-hidden>
          {campana.emoji || "🗓️"}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-sand">{campana.nombre}</p>
          <p className="text-[12.5px] text-sand/65">{campana.texto || "Marca las semanas que te coges."}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2" role="group" aria-label="Semanas">
        {campana.semanas.map((s) => {
          const ya = pedidas[s];
          const on = sel.has(s);
          return (
            <button
              key={s} type="button" disabled={!!ya} onClick={() => toggle(s)} aria-pressed={on}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] transition disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${on ? "border-serene bg-serene/15 text-sand" : "border-white/12 text-sand/80 hover:border-white/30"} ${ya ? "opacity-60" : ""}`}
            >
              <span>
                <b className="text-sand">Semana del {corta(s)}</b>
                <span className="ml-1.5 text-sand/55">{rangoSemana(s)}</span>
              </span>
              {ya ? (
                <span className="text-[11px] font-bold text-sand/70">Pedida · {ESTADO_SOL[ya]?.label || ya}</span>
              ) : (
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-md border text-[12px] font-bold ${on ? "border-serene bg-serene text-[#001391]" : "border-white/25"}`}>{on ? "✓" : ""}</span>
              )}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">
          Descripción {obligatoria ? <span className="text-mandarin">· obligatoria</span> : "(opcional)"}
        </span>
        {campana.sugerencia && <span className="mb-1 block text-[11.5px] text-sand/55">{campana.sugerencia}</span>}
        <textarea
          value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} required={obligatoria}
          placeholder={campana.sugerencia || ""}
          className={`${FIELD} block w-full resize-y text-[13px]`}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button" disabled={!!falta || estado.fase === "enviando"} onClick={enviar}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
          style={{ background: ACCENT }}
        >
          {estado.fase === "enviando"
            ? <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Enviando…</>
            : `Enviar ${sel.size > 1 ? `${sel.size} semanas` : "solicitud"}`}
        </button>
        {falta && estado.fase !== "enviando" && <span className="text-[12px] text-sand/55">{falta}</span>}
      </div>
      {estado.fase === "ok" && (
        <p className={`mt-2 text-xs font-bold ${estado.aviso ? "text-canary" : TEXT.lime}`}>
          {estado.aviso
            ? `Guardado (${estado.dias} días), pero el aviso por correo falló: ${estado.aviso}. Avisa tú a coordinación.`
            : `✓ Enviado: ${estado.dias} días laborables${estado.n > 1 ? ` en ${estado.n} solicitudes` : ""}. Coordinación ya tiene el aviso.`}
        </p>
      )}
      {estado.fase === "error" && (
        <p className="mt-2 rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">No se pudo enviar: {estado.error}</p>
      )}
    </section>
  );
}
