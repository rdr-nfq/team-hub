"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { GLASS, FIELD, TEXT } from "./ui";
import { IconUsers, IconAlert, IconPlus, IconX, IconExternal } from "./icons";

/* Gestión del equipo · Coordinación.
   Edita TODO equipo.json: cualquier campo de cada miembro (incluidos los que
   se añadan en el futuro: se detectan dinámicamente), altas y bajas, rol de
   coordinador, track técnico/funcional… Al guardar, el backend
   (Codigo_Equipo.gs) COMMITEA el fichero a GitHub y Pages redespliega: los
   cambios (login incluido) tardan ~1-2 min en estar en la web. */

const CLAVE_KEY = "rdr_equipo_clave";
// Orden preferente de campos; cualquier otro campo del JSON se añade detrás.
const CAMPOS_BASE = ["id", "nombre", "email", "emailBBVA", "track", "coordinador"];
const PLANTILLA_MIEMBRO = { id: "", nombre: "", email: "", emailBBVA: "", track: "funcional", coordinador: false };

const esBool = (campo, team) => team.some((m) => typeof m[campo] === "boolean") || campo === "coordinador";

export default function EquipoGestionRoute() {
  const { getUrl } = useLinks();
  const backendUrl = getUrl("equipoBackend");

  const [team, setTeam] = useState(null);
  const original = useRef("");
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState({ fase: "form" }); // form | enviando | ok | error
  const [confirmarBaja, setConfirmarBaja] = useState(null); // índice pendiente de confirmar
  const [cargaErr, setCargaErr] = useState(false);

  useEffect(() => {
    try { setClave(localStorage.getItem(CLAVE_KEY) || ""); } catch {}
    fetch("/team-hub/equipo/equipo.json", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const t = (d.team || []).map((m) => ({ ...m }));
        original.current = JSON.stringify(t);
        setTeam(t);
      })
      .catch(() => setCargaErr(true));
  }, []);

  /* TODOS los campos: los base + cualquier otro que exista en el JSON. */
  const campos = useMemo(() => {
    const extra = new Set();
    (team || []).forEach((m) => Object.keys(m).forEach((k) => { if (!CAMPOS_BASE.includes(k)) extra.add(k); }));
    return [...CAMPOS_BASE, ...extra];
  }, [team]);

  const hayCambios = team && JSON.stringify(team) !== original.current;
  const coordinadores = (team || []).filter((m) => m.coordinador).length;

  // Los textos se guardan sin espacios sobrantes: un " correo@nfq.es" con un
  // espacio delante impedía entrar en la web a esa persona.
  const upd = (i, campo, valor) =>
    setTeam((t) =>
      t.map((m, j) => (j === i ? { ...m, [campo]: typeof valor === "string" ? valor.trim() : valor } : m))
    );
  const alta = () => {
    const extras = Object.fromEntries(campos.filter((c) => !CAMPOS_BASE.includes(c)).map((c) => [c, esBool(c, team) ? false : ""]));
    setTeam((t) => [...t, { ...PLANTILLA_MIEMBRO, ...extras }]);
  };
  const baja = (i) => { setTeam((t) => t.filter((_, j) => j !== i)); setConfirmarBaja(null); };

  const guardar = async () => {
    if (!backendUrl || !hayCambios || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    try {
      try { localStorage.setItem(CLAVE_KEY, clave); } catch {}
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request, sin preflight
        body: JSON.stringify({ action: "guardarEquipo", clave, team }),
      }).then((r) => r.json());
      if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
      original.current = JSON.stringify(team);
      setEstado({ fase: "ok", ...res.data });
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  const etiqueta = (c) =>
    ({ id: "ID", nombre: "Nombre", email: "Email NFQ/NTER", emailBBVA: "Email BBVA", track: "Track", coordinador: "Coordinador" }[c] || c);

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.mandarin }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-mandarin/80">Coordinación</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconUsers size={34} className="text-mandarin" /> Gestión del equipo
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Edita equipo.json: datos, tracks, roles, altas y bajas. Al guardar se sube el cambio al
            repositorio y la web entera (incluido quién puede entrar) lo recoge en ~1-2 minutos.
          </p>
          {!backendUrl && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> Falta configurar &quot;equipoBackend&quot; en links.json (desplegar Codigo_Equipo.gs).
            </p>
          )}
        </header>

        {cargaErr && <p className={`${GLASS} p-5 text-sm ${TEXT.mandarin}`}>No se pudo cargar equipo.json.</p>}
        {!team && !cargaErr && <p className={`${GLASS} p-5 text-sm text-sand/60`}>Cargando equipo…</p>}

        {team && (
          <>
            {/* Barra de acciones */}
            <div className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#070E46]/90 p-3 backdrop-blur">
              <button
                type="button"
                onClick={alta}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF7D69] px-3 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <IconPlus size={13} /> Añadir compañero
              </button>
              <label className="ml-auto flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-sand/55">
                Clave
                <input
                  type="password" value={clave} onChange={(e) => setClave(e.target.value)}
                  placeholder="clave de coordinación" aria-label="Clave de coordinación"
                  className={`${FIELD} w-40 !py-1.5 text-xs`}
                />
              </label>
              <button
                type="button"
                disabled={!hayCambios || !backendUrl || !clave.trim() || estado.fase === "enviando"}
                onClick={guardar}
                className="inline-flex items-center gap-2 rounded-lg bg-[#88E783] px-4 py-2 text-xs font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                {estado.fase === "enviando" ? (
                  <><span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Guardando…</>
                ) : (
                  "Guardar cambios"
                )}
              </button>
            </div>

            {/* Avisos de estado */}
            {hayCambios && estado.fase !== "enviando" && (
              <p className="mb-3 text-[11.5px] font-bold text-canary">
                Cambios sin guardar{coordinadores === 0 ? " · ⚠ no puede quedar el equipo sin ningún coordinador" : ""}
                {!clave.trim() ? " · introduce la clave de coordinación para poder guardar" : ""}
              </p>
            )}
            {estado.fase === "ok" && !hayCambios && (
              <p className="mb-3 rounded-lg border border-lime/40 bg-lime/[0.08] px-3 py-2 text-[12px]">
                <span className={`font-bold ${TEXT.lime}`}>Guardado y subido al repositorio.</span>{" "}
                <span className="text-sand/70">La web recoge el cambio en ~1-2 min (cuando termine el despliegue).</span>{" "}
                {estado.commitUrl && (
                  <a className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-sand/85 hover:text-serene" href={estado.commitUrl} target="_blank" rel="noreferrer">
                    <IconExternal size={11} /> Ver commit
                  </a>
                )}
              </p>
            )}
            {estado.fase === "error" && (
              <p className="mb-3 rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
                No se pudo guardar: {estado.error}
              </p>
            )}

            {/* Miembros */}
            <ul className="grid gap-3 lg:grid-cols-2">
              {team.map((m, i) => (
                <li key={i} className={`${GLASS} p-4`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-display text-base font-bold text-sand">
                      {m.nombre || <span className="text-sand/35">Nuevo compañero</span>}
                      {m.coordinador && (
                        <span className="ml-2 rounded bg-[#9694FF] px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-[#001391]">coord</span>
                      )}
                    </p>
                    {confirmarBaja === i ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-mandarin">¿Quitar a {m.nombre || "este miembro"}?</span>
                        <button type="button" onClick={() => baja(i)} className="rounded-md bg-mandarin px-2 py-1 font-bold text-[#001391]">Sí</button>
                        <button type="button" onClick={() => setConfirmarBaja(null)} className="rounded-md border border-white/20 px-2 py-1 text-sand/70">No</button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmarBaja(i)}
                        aria-label={`Quitar a ${m.nombre || "miembro " + (i + 1)}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sand/40 transition hover:bg-white/10 hover:text-mandarin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                      >
                        <IconX size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {campos.map((c) => (
                      <label key={c} className={c === "email" || c === "emailBBVA" ? "col-span-2 block" : "block"}>
                        <span className="text-[9.5px] font-bold uppercase tracking-wide text-sand/45">{etiqueta(c)}</span>
                        {esBool(c, team) ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!!m[c]}
                            onClick={() => upd(i, c, !m[c])}
                            className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
                              m[c] ? "border-transparent bg-[#9694FF] text-[#001391]" : "border-white/15 bg-white/[0.04] text-sand/55 hover:border-white/30"
                            }`}
                          >
                            {m[c] ? "Sí" : "No"}
                          </button>
                        ) : c === "track" ? (
                          <select value={m[c] ?? ""} onChange={(e) => upd(i, c, e.target.value)} className={`${FIELD} block w-full !py-1.5 text-xs`}>
                            {["funcional", "tecnico"].includes(m[c]) || !m[c] ? null : <option value={m[c]}>{m[c]}</option>}
                            <option value="funcional">funcional</option>
                            <option value="tecnico">tecnico</option>
                          </select>
                        ) : (
                          <input
                            type="text" value={m[c] ?? ""}
                            onChange={(e) => upd(i, c, e.target.value)}
                            className={`${FIELD} block w-full !py-1.5 text-xs`}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-sand/45">
              {team.length} miembros · {coordinadores} con rol de coordinador · los campos nuevos que aparezcan en
              equipo.json se editan aquí automáticamente.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
