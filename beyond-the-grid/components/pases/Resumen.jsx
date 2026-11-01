"use client";

import { useMemo } from "react";
import { PALETTE } from "@/lib/palette";
import { rgba } from "@/lib/ui";
import { useAccentMap } from "@/lib/theme";
import { usePases } from "./PasesRoute";
import { extraerCodigosDeElemento, buscarComponentesPorCod } from "./comandos";
import { CARD_CLS, Empty, PanelTitle } from "./ui";

/* Vista Resumen · Paquetes del pase en orden de ejecución.
   Misma información que el correo de cierre de preparación: qué paquetes
   (códigos) tenemos, con qué tipo de subida, en qué orden se ejecutan y qué
   componentes contiene cada uno — la comprobación final de que todo está
   listo antes de cerrar la preparación. */

const isSys = (el) => {
  const u = String(el || "").toUpperCase();
  return u.includes("PARADA") || u.includes("ARRANQUE") || u.includes("REINICIO") || u.includes("RECARGA");
};

// Color por tipo de subida (rotación estable sobre la paleta BBVA).
const SUBIDA_COLORS = [PALETTE.serene, PALETTE.lime, PALETTE.canary, PALETTE.mandarin, PALETTE.purple, PALETTE.aqua];

export default function Resumen() {
  const { E, tempOrden } = usePases();
  const acc = useAccentMap();

  // Orden vigente: tempOrden (edición local viva) o el del backend.
  const orden = tempOrden.length ? tempOrden : (E.ordenPase || []).map((o) => ({ elemento: o.elemento, som: o.som }));

  // Color estable por tipo de subida presente en el pase.
  const colorSubida = useMemo(() => {
    const tipos = new Set();
    (E.proyectos || []).forEach((p) => (p.componentes || []).forEach((c) => c.subida && tipos.add(c.subida)));
    const map = {};
    [...tipos].sort().forEach((t, i) => { map[t] = SUBIDA_COLORS[i % SUBIDA_COLORS.length]; });
    return map;
  }, [E]);

  // Filas del resumen: cada paso del orden con sus componentes.
  const filas = useMemo(
    () =>
      orden.map((o, idx) => {
        const cods = extraerCodigosDeElemento(o.elemento);
        const comps = cods.flatMap((cod) => buscarComponentesPorCod(E, cod));
        const subidas = [...new Set(comps.map((c) => c.subida).filter(Boolean))];
        return { idx, elemento: o.elemento, som: o.som, cods, comps, subidas, sistema: isSys(o.elemento) };
      }),
    [orden, E]
  );

  // Componentes cuyo código NO aparece en ningún paso del orden (o sin código).
  const fueraDeOrden = useMemo(() => {
    const codsEnOrden = new Set(filas.flatMap((f) => f.cods.map((c) => c.toUpperCase())));
    const out = [];
    (E.proyectos || []).forEach((p) =>
      (p.componentes || []).forEach((c) => {
        const cod = String(c.codigo || "").trim();
        if (!cod || cod === "-" || !codsEnOrden.has(cod.toUpperCase())) out.push({ ...c, proyecto: p.nombre });
      })
    );
    return out;
  }, [filas, E]);

  const nPaquetes = filas.filter((f) => f.cods.length > 0).length;
  const nComps = (E.proyectos || []).reduce((a, p) => a + (p.componentes || []).length, 0);

  return (
    <section className={`${CARD_CLS} p-4 sm:p-5`}>
      <PanelTitle sub={`${nPaquetes} paquete(s) en el orden · ${nComps} componente(s) en total. Comprueba que cada paquete lleva sus componentes y que no queda nada fuera antes de cerrar la preparación.`}>
        Resumen del pase
      </PanelTitle>

      {orden.length === 0 ? (
        <Empty>Aún no hay orden del pase: ordénalo en la hoja de Preparación.</Empty>
      ) : (
        <ol className="space-y-2.5">
          {filas.map((f) => (
            <li key={f.idx} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-lime/40 bg-lime/10 text-xs font-bold tabular-nums text-lime" aria-hidden>
                  {f.idx + 1}
                </span>
                <span className="min-w-0 flex-1 break-words text-[13px] font-bold text-sand">{f.elemento}</span>
                {f.sistema && (
                  <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sand/60">
                    Sistema
                  </span>
                )}
                {f.subidas.map((s) => (
                  <span
                    key={s}
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      color: acc(colorSubida[s] || PALETTE.serene),
                      backgroundColor: rgba(colorSubida[s] || PALETTE.serene, 0.14),
                      border: `1px solid ${rgba(colorSubida[s] || PALETTE.serene, 0.3)}`,
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>

              {f.cods.length > 0 && (
                <div className="mt-2 border-t border-white/[0.06] pt-2">
                  {f.comps.length === 0 ? (
                    <p className="text-[12px] font-bold text-mandarin">Sin componentes asociados a este código — revisar.</p>
                  ) : (
                    <ul className="space-y-1">
                      {f.comps.map((c, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                          <span className="font-semibold text-sand">{c.nombre || "(sin nombre)"}</span>
                          <span className="text-sand/50">
                            {c.tipo || "—"}{c.resp ? ` · ${c.resp.split(" ")[0]}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {fueraDeOrden.length > 0 && (
        <div className="mt-5 rounded-xl border border-mandarin/40 bg-mandarin/[0.08] p-3.5">
          <p className="mb-2 text-[12.5px] font-bold text-mandarin">
            Componentes sin código o fuera del orden ({fueraDeOrden.length}) — no se instalarían:
          </p>
          <ul className="space-y-1">
            {fueraDeOrden.map((c, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="font-semibold text-sand">{c.nombre || "(sin nombre)"}</span>
                <span className="text-sand/55">
                  {c.proyecto} · {String(c.codigo || "").trim() && String(c.codigo).trim() !== "-" ? c.codigo : "sin código"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
