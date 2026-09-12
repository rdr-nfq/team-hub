"use client";

import { FLEX, capitaliza, fmtLargo } from "./logic";
import { rgba } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { IconPlato, IconTaper, IconCasa, IconEnviar, IconEstrella } from "./icons";

const ACCENT = PALETTE.mandarin;

/* Select con chevron propio (appearance-none) y estilos glass coherentes. */
function Field({ id, label, optional, children }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-sand/60">
        {label}
        {optional && <span className="ml-1 normal-case tracking-normal opacity-60">(opcional)</span>}
      </label>
      <div className="relative">
        {children}
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sand/70" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  );
}

const SELECT_CLS =
  "w-full cursor-pointer appearance-none rounded-xl border border-white/12 bg-midnight/60 px-3.5 py-2.5 pr-9 font-sans text-sm text-sand transition hover:border-mandarin/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mandarin";

const ESTADOS = [
  { id: "fuera", label: "Comer fuera", icon: IconPlato },
  { id: "taper", label: "Taper / Glovo", icon: IconTaper },
  { id: "no", label: "No estoy", icon: IconCasa },
];

/**
 * Panel "Tu voto": quién eres, qué jueves y qué harás. Misma semántica que el
 * formulario del legacy (segmented de 3 estados + prioridades solo en "fuera").
 */
export default function VotoPanel({
  equipo, quien, onQuien,
  semanas, semana, onSemana,
  estado, onEstado,
  e1, onE1, e2, onE2,
  restaurantes, yaElegido, onEnviar, sending, disabled,
}) {
  const nombres = restaurantes.map((r) => r.nombre);
  // "El que más se vote" solo se ofrece si hay una prioridad 2 de verdad: un
  // voto flexible sin ningún restaurante detrás no aporta nada al recuento y,
  // si votara así todo el mundo, no habría forma de decidir dónde se come.
  // Con restaurante ya elegido no hace falta respaldo: hay algo a lo que unirse.
  const hayRespaldo = !!e2 && e2 !== FLEX;
  const flexLibre = !!yaElegido || hayRespaldo;

  return (
    <section
      aria-labelledby="voto-title"
      className="relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md transition-colors hover:border-mandarin/40"
    >
      <h2 id="voto-title" className="font-display text-xl font-bold text-sand">Tu voto</h2>
      <p className="mb-5 mt-1 text-[13px] text-sand/70">Elige quién eres y qué harás este jueves.</p>

      <Field id="comidas-quien" label="¿Quién eres?">
        <select id="comidas-quien" className={SELECT_CLS} value={quien} onChange={(e) => onQuien(e.target.value)}>
          <option value="">Selecciona tu nombre…</option>
          {equipo.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>

      <Field id="comidas-semana" label="Jueves">
        <select id="comidas-semana" className={SELECT_CLS} value={semana} onChange={(e) => onSemana(e.target.value)}>
          {semanas.length === 0 && <option value="">No hay jueves de oficina próximos</option>}
          {semanas.map((s) => (
            <option key={s.fecha} value={s.fecha}>{capitaliza(fmtLargo(s.fecha))} · {s.fecha}</option>
          ))}
        </select>
      </Field>

      {/* Segmented ¿qué vas a hacer? */}
      <div className="mb-4" role="group" aria-label="¿Qué vas a hacer?">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-sand/60">¿Qué vas a hacer?</p>
        <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-3">
          {ESTADOS.map(({ id, label, icon: Icon }) => {
            const on = estado === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => onEstado(id)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[12.5px] font-bold leading-tight transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mandarin ${
                  on
                    ? "border-[#FFB56B] bg-[#FFB56B] text-[#001391]"
                    : "border-white/12 bg-midnight/60 text-sand hover:border-mandarin/50 hover:-translate-y-px"
                }`}
              >
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      {estado === "fuera" && (
        <>
          {/* Sin opción por defecto: hay que elegir a mano (antes salía el
              flexible preseleccionado y se votaba sin querer). */}
          {/* Con restaurante ya elegido por el resto, los demás quedan
              bloqueados: o te unes, o taper, o no estás. */}
          <Field id="comidas-e1" label={yaElegido ? "Tu elección" : "Prioridad 1"}>
            <select id="comidas-e1" className={SELECT_CLS} value={e1} onChange={(e) => onE1(e.target.value)}>
              <option value="">{yaElegido ? "Selecciona…" : "Selecciona un restaurante…"}</option>
              {nombres.map((n) => <option key={n} value={n} disabled={!!yaElegido}>{n}</option>)}
              <option value={FLEX} disabled={!flexLibre}>
                {`★ ${FLEX}`}
                {yaElegido ? ` (${yaElegido})` : flexLibre ? "" : " — elige antes una prioridad 2"}
              </option>
            </select>
          </Field>

          {yaElegido ? (
            <p className="-mt-2 mb-4 text-[11.5px] leading-relaxed text-sand/60">
              Este jueves ya hay restaurante elegido: <b className="text-mandarin">{yaElegido}</b>. Solo puedes unirte al
              grupo, llevarte taper o no venir.
            </p>
          ) : (
            /* La prioridad 2 es siempre un restaurante concreto: es la que
               desempata si todo el mundo va flexible. */
            <Field id="comidas-e2" label="Prioridad 2" optional>
              <select id="comidas-e2" className={SELECT_CLS} value={e2} onChange={(e) => onE2(e.target.value)}>
                <option value="">— Ninguna —</option>
                {nombres.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onEnviar}
        disabled={disabled || sending}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-full border-0 bg-[#FFB56B] px-4 py-3 text-[15px] font-extrabold tracking-[0.02em] text-[#001391] transition hover:-translate-y-px hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sand"
        style={{ boxShadow: `0 10px 26px -12px ${rgba(ACCENT, 0.65)}` }}
      >
        <IconEnviar size={17} /> {sending ? "Enviando…" : "Enviar mi elección"}
      </button>

      <p className="mt-2.5 text-xs leading-relaxed text-sand/65">
        {yaElegido ? (
          <>
            Con <b className="inline-flex items-center gap-1 text-mandarin"><IconEstrella size={11} />«{FLEX}»</b> te unes
            a {yaElegido}. Si ya votaste esta semana, tu elección se actualizará.
          </>
        ) : (
          <>
            ¿Te da igual? Pon una <b className="text-sand/85">prioridad 2</b> y ya puedes elegir{" "}
            <b className="inline-flex items-center gap-1 text-mandarin"><IconEstrella size={11} />«{FLEX}»</b>:
            te unes a la opción ganadora y, si todo el mundo va flexible, decide tu prioridad 2.
            Si ya votaste esta semana, tu elección se actualizará.
          </>
        )}
      </p>
    </section>
  );
}
