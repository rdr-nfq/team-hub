"use client";

import { usePases } from "./PasesRoute";
import { BTN, CARD_CLS, SELECT_CLS, Empty, PanelTitle, LABEL_CLS } from "./ui";

/* Vista 3 · Checks pre-implantación: 4 checks generales (Aplica/NA) +
   un check "Correo ANS enviado" por proyecto. */

const CHECKS = [
  { id: "dpPro", label: "DPs que suben pendientes de PRO" },
  { id: "jiraOk", label: "JIRAs resueltos y marcados para el pase" },
  { id: "permAper", label: "Pedir permisos de ejecución de aperiódicos en producción" },
  { id: "docPruebas", label: "Documento de pruebas post-implantación creado" },
];

export default function PreChecks() {
  const { E, fase, isCompletado, actions } = usePases();
  const editable = !isCompletado;
  const cp = E.checksPre || {};

  return (
    <section className={`${CARD_CLS} p-4 sm:p-5 ${isCompletado ? "pointer-events-none opacity-60" : ""}`}>
      <PanelTitle sub="Antes de pasar a la implantación del sábado, todos los elementos aplicables deben estar confirmados.">
        Checks pre-implantación
      </PanelTitle>

      <ul className="space-y-2">
        {CHECKS.map(({ id, label }) => {
          const v = cp[id] || (id === "permAper" && cp.remOk) || { aplica: "APLICA", ok: false }; // remOk: Apps Script anterior
          const na = v.aplica !== "APLICA";
          return (
            <li key={id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 sm:flex-nowrap ${na ? "opacity-55" : ""}`}>
              <select
                className={`${SELECT_CLS} !w-28 !py-1.5`}
                value={na ? "NA" : "APLICA"}
                aria-label={`¿Aplica? ${label}`}
                disabled={!editable}
                onChange={(e) => actions.setCheckPre(id, { aplica: e.target.value })}
              >
                <option value="APLICA">Aplica</option>
                <option value="NA">No aplica</option>
              </select>
              <label htmlFor={`chk-${id}`} className={`min-w-0 flex-1 cursor-pointer text-sm font-semibold text-sand ${na ? "line-through" : ""}`}>
                {label}
              </label>
              <input
                id={`chk-${id}`}
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#88E783]"
                checked={!!v.ok}
                disabled={!editable || na}
                onChange={(e) => actions.setCheckPre(id, { ok: e.target.checked })}
              />
            </li>
          );
        })}
      </ul>

      <h4 className={`${LABEL_CLS} mt-6 !text-serene`}>Correos ANS por proyecto</h4>
      <p className="mb-3 mt-1 text-[13px] text-sand/65">Marca cada proyecto cuando se haya enviado el correo de traspaso al ANS con su ID.</p>

      {(E.proyectos || []).length === 0 ? (
        <Empty>No hay proyectos en este pase.</Empty>
      ) : (
        <ul className="space-y-2">
          {(E.proyectos || []).map((p) => (
            <li key={p.nombre} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <label htmlFor={`ans-${p.nombre}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                <span className="truncate text-sm font-bold text-sand">Correo ANS enviado · {p.nombre}</span>
                <span className="text-xs text-sand/60">
                  ID Traspaso: <strong className="text-serene">{p.idTraspaso || "— sin ID Traspaso —"}</strong>
                </span>
              </label>
              <input
                id={`ans-${p.nombre}`}
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#88E783]"
                checked={!!p.correoAns}
                disabled={!editable}
                onChange={(e) => actions.updCorreoAns(p.nombre, e.target.checked)}
              />
            </li>
          ))}
        </ul>
      )}

      {fase === "FASE_4_CERRADO" && !isCompletado && (
        <button type="button" className={`${BTN.success} mt-5 w-full`} onClick={actions.validarYAvanzarPre}>
          Todo listo · Pasar al sábado
        </button>
      )}
    </section>
  );
}
