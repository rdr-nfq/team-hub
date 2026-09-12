"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { useLinks } from "@/lib/links";
import { num, curQ } from "./model";
import { GLASS, FIELD, TEXT } from "./ui";
import { IconReceipt, IconAlert, IconPlus, IconExternal } from "./icons";

/* Generador de ofertas · Coordinación.
   Formulario con los 12 datos de una oferta ({{DATO1}}..{{DATO12}} de las
   plantillas) y envío al Apps Script "ofertasBackend" (links.json), que copia
   la plantilla de Doc y la de Sheet en la carpeta de ofertas con todo
   sustituido. Datos 10 (fecha de hoy) y 11 (combinación) se auto-generan.

   Dos ámbitos:
   - España: firma BBVA S.A. y la oferta lleva IVA (datos 7 horas, 8 sin IVA
     y 9 con IVA).
   - LATAM: firma la entidad del país (se elige, y se pueden añadir nuevas) y
     NO lleva IVA: los datos 7 y 9 se envían vacíos para que sus marcadores
     desaparezcan del documento. El importe (dato 8) se sigue calculando
     igual, horas × tarifa. */

const IVA = 1.21;
const TARIFA_DEFECTO = 51.22;

const FIRMANTE_ES = "BANCO BILBAO VIZCAYA ARGENTARIA, S.A.";
const OTRO = "__otro"; // valor centinela del desplegable de firmantes

/* Fechas de inicio/fin de un Q en DD/MM/YYYY (Q3 -> 01/07 a 30/09). */
const fechasDeQ = (q) => {
  const m = /^(\d{4})Q([1-4])$/.exec(String(q));
  if (!m) return ["", ""];
  const año = Number(m[1]), n = Number(m[2]);
  const mesIni = (n - 1) * 3; // 0, 3, 6, 9
  const finDia = [31, 30, 30, 31][n - 1]; // mar, jun, sep, dic
  const dd = (x) => String(x).padStart(2, "0");
  return [`01/${dd(mesIni + 1)}/${año}`, `${finDia}/${dd(mesIni + 3)}/${año}`];
};

const hoyDDMMYYYY = () => {
  const d = new Date();
  const dd = (x) => String(x).padStart(2, "0");
  return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/* Dinero es-ES con 2 decimales y punto de miles SIEMPRE (7994.916 ->
   "7.994,92"; Intl es-ES no agrupa los números de 4 cifras). */
const eurTxt = (v) => {
  const [ent, dec] = Number(v || 0).toFixed(2).split(".");
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
};

/* Qs seleccionables: los 4 del año actual y los 4 del siguiente. */
const qsSeleccionables = () => {
  const año = new Date().getFullYear();
  const out = [];
  [año, año + 1].forEach((a) => { for (let i = 1; i <= 4; i++) out.push(`${a}Q${i}`); });
  return out;
};

const AMBITOS = [
  { id: "bbva-sa", nombre: "BBVA S.A. · España", iva: true },
  { id: "latam", nombre: "LATAM", iva: false },
];

const Campo = ({ etiqueta, ayuda, children }) => (
  <label className="block">
    <span className="text-[10px] font-bold uppercase tracking-wide text-sand/50">{etiqueta}</span>
    {children}
    {ayuda && <span className="mt-0.5 block text-[10.5px] text-sand/40">{ayuda}</span>}
  </label>
);

export default function OfertasRoute() {
  const { getUrl } = useLinks();
  const backendUrl = getUrl("ofertasBackend");

  const [plantilla, setPlantilla] = useState("bbva-sa");
  const esLatam = plantilla === "latam";
  // Firmantes de LATAM: los del backend (compartidos por el equipo) o, si aún
  // no responde, los de siempre para no quedarse sin poder generar.
  const [firmantes, setFirmantes] = useState(["BBVA COLOMBIA S.A.", "BBVA MÉXICO S.A."]);
  const [firmante, setFirmante] = useState("");
  const [otro, setOtro] = useState("");
  const [guardandoFirmante, setGuardandoFirmante] = useState("");
  const [nombre, setNombre] = useState("");
  const [sdatool, setSdatool] = useState("");
  const [mmf, setMmf] = useState("");
  const [q, setQ] = useState(curQ());
  const [detalle, setDetalle] = useState("");
  const [tarifa, setTarifa] = useState(TARIFA_DEFECTO);
  const [horasTxt, setHorasTxt] = useState("");
  const [ivaTxt, setIvaTxt] = useState(""); // texto libre mientras se escribe
  const [estado, setEstado] = useState({ fase: "form" }); // form | enviando | error
  // Ofertas generadas en ESTA sesión (la última primero): cada una con su
  // nombre y sus enlaces, para encadenar muchas sin perder ninguna.
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    if (!backendUrl) return;
    fetch(backendUrl + (backendUrl.includes("?") ? "&" : "?") + "action=firmantes")
      .then((r) => r.json())
      .then((res) => { if (res?.ok && res.data?.latam?.length) setFirmantes(res.data.latam); })
      .catch(() => {}); // sin lista del backend se usan los de siempre
  }, [backendUrl]);

  const firmanteFinal = esLatam ? (firmante === OTRO ? otro.trim() : firmante) : FIRMANTE_ES;

  /* Guarda un firmante nuevo para todo el equipo (Propiedades del script). */
  const guardarFirmante = useCallback(async () => {
    const v = otro.trim();
    if (!v || !backendUrl) return;
    setGuardandoFirmante("guardando");
    try {
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "guardarFirmante", firmante: v }),
      }).then((r) => r.json());
      if (!res?.ok) throw new Error(res?.error || "error del backend");
      setFirmantes(res.data.latam);
      setFirmante(res.data.latam.find((f) => f.toUpperCase() === v.toUpperCase()) || v);
      setOtro("");
      setGuardandoFirmante("ok");
    } catch {
      setGuardandoFirmante("error");
    }
  }, [otro, backendUrl]);

  /* ── Calculadora: horas es la fuente de verdad ──
     Escribir horas -> sin IVA = horas × tarifa; con IVA = × 1,21.
     Escribir el importe CON IVA -> horas redondas más cercanas y de ahí
     los importes exactos (8000 -> 129 h -> 7.994,92). */
  const horas = Math.max(0, Math.round(num(horasTxt)));
  const sinIva = horas * num(tarifa);
  const conIva = sinIva * IVA;
  // En LATAM el importe que se teclea es el total (no hay IVA que quitar).
  const factorImporte = esLatam ? 1 : IVA;
  const importe = sinIva * factorImporte;

  const cambiaHoras = (v) => { setHorasTxt(v); setIvaTxt(""); };
  const cambiaIva = (v) => {
    setIvaTxt(v);
    const objetivo = num(v);
    const t = num(tarifa);
    setHorasTxt(objetivo > 0 && t > 0 ? String(Math.max(0, Math.round(objetivo / (t * factorImporte)))) : "");
  };

  /* SDATOOL: se puede pegar completo ("SDATOOL-5454") — se queda el código. */
  const cambiaSdatool = (v) => setSdatool(String(v).replace(/^\s*sdatool[\s-]*/i, "").trim());

  const [fechaIni, fechaFin] = fechasDeQ(q);
  const datos = useMemo(() => ({
    dato1: nombre.trim() ? `RDR - ${nombre.trim()}` : "",
    dato2: sdatool.trim() ? `SDATOOL-${sdatool.trim()}` : "",
    dato3: mmf.trim() ? `MMF - ${mmf.trim()}` : "",
    dato4: fechaIni,
    dato5: fechaFin,
    dato6: detalle.trim(),
    // Sin IVA en LATAM: los datos 7 y 9 van vacíos y sus marcadores
    // desaparecen del documento.
    dato7: esLatam ? "" : String(horas || ""),
    dato8: horas ? eurTxt(sinIva) : "",
    dato9: esLatam ? "" : horas ? eurTxt(conIva) : "",
    dato10: hoyDDMMYYYY(),
    dato11: nombre.trim() && sdatool.trim() ? `RDR - SDATOOL-${sdatool.trim()}.${nombre.trim()}` : "",
    dato12: firmanteFinal,
  }), [nombre, sdatool, mmf, fechaIni, fechaFin, detalle, horas, sinIva, conIva, esLatam, firmanteFinal]);

  const listo = !!(datos.dato1 && datos.dato2 && datos.dato6 && horas > 0 && datos.dato12);

  const generar = async () => {
    if (!listo || !backendUrl || estado.fase === "enviando") return;
    setEstado({ fase: "enviando" });
    const base = datos.dato11 || datos.dato1;
    try {
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request, sin preflight
        body: JSON.stringify({ action: "generarOferta", plantilla, datos }),
      }).then((r) => r.json());
      if (!res || !res.ok) throw new Error((res && res.error) || "error del backend");
      const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      setHistorial((h) => [{ id: h.length + 1, base, hora, ...res.data }, ...h]);
      setEstado({ fase: "form" });
    } catch (e) {
      setEstado({ fase: "error", error: String(e.message || e) });
    }
  };

  /* Deja el formulario listo para la siguiente oferta (conserva Q y tarifa). */
  const limpiar = () => {
    setNombre(""); setSdatool(""); setMmf(""); setDetalle("");
    setHorasTxt(""); setIvaTxt("");
    setEstado({ fase: "form" });
  };

  return (
    <main className="relative min-h-dvh w-full">
      <div aria-hidden className="pointer-events-none fixed inset-[-3%] -z-10 overflow-hidden">
        <span className="rdr-blob left-[-6%] top-[8%] h-80 w-80" style={{ background: PALETTE.canary }} />
        <span className="rdr-blob bottom-[-10%] right-[-2%] h-96 w-96" style={{ background: PALETTE.royal }} />
      </div>

      <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-28 sm:px-6">
        <header className="mb-6">
          <p className="font-sans text-xs font-bold uppercase tracking-[0.4em] text-canary/80">Coordinación</p>
          <h1 className="mt-2 flex items-center gap-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            <IconReceipt size={34} className="text-canary" /> Generación de ofertas
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-sm text-sand/65">
            Rellena los datos y se generan el Doc y el Sheet de la oferta a partir de las plantillas,
            directamente en la carpeta de ofertas de Drive.
          </p>
          {!backendUrl && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-canary/40 bg-canary/10 px-3 py-1.5 text-xs font-bold text-canary">
              <IconAlert size={13} /> Falta configurar &quot;ofertasBackend&quot; en links.json (desplegar Codigo_Ofertas.gs).
            </p>
          )}
        </header>

        {/* ── Ámbito de la oferta: quién firma y si lleva IVA ── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {AMBITOS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setPlantilla(a.id)}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
                plantilla === a.id
                  ? "border-transparent bg-[#F5E33D] text-[#001391]"
                  : "border-white/15 bg-white/[0.055] text-sand/80 hover:border-white/30 hover:bg-white/10"
              }`}
            >
              {a.nombre}
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] normal-case tracking-normal ${plantilla === a.id ? "bg-[#001391]/15" : "bg-white/10"}`}>
                {a.iva ? "con IVA" : "sin IVA"}
              </span>
            </button>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          {/* ── Formulario ── */}
          <section className={`${GLASS} space-y-4 p-5`} aria-label="Datos de la oferta">
            {/* ── Firmante (dato 12) ── */}
            {esLatam ? (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                <Campo etiqueta="Firmante de la oferta" ayuda="¿Falta alguno? Elige «Otro…» y podrás dejarlo guardado para todo el equipo.">
                  <select
                    value={firmante} onChange={(e) => { setFirmante(e.target.value); setGuardandoFirmante(""); }}
                    className={`${FIELD} block w-full font-bold`}
                  >
                    <option value="">Selecciona el firmante…</option>
                    {firmantes.map((f) => <option key={f} value={f}>{f}</option>)}
                    <option value={OTRO}>Otro…</option>
                  </select>
                </Campo>
                {firmante === OTRO && (
                  <div className="mt-2.5 space-y-2">
                    <input
                      type="text" value={otro} onChange={(e) => { setOtro(e.target.value); setGuardandoFirmante(""); }}
                      placeholder="BBVA PERÚ S.A." aria-label="Nombre del firmante"
                      className={`${FIELD} w-full`}
                    />
                    {otro.trim() && guardandoFirmante !== "ok" && (
                      <p className="flex flex-wrap items-center gap-2 text-[11.5px] text-sand/60">
                        ¿Quieres que <strong className="text-sand/85">{otro.trim()}</strong> quede como opción permanente?
                        <button
                          type="button" onClick={guardarFirmante} disabled={!backendUrl || guardandoFirmante === "guardando"}
                          className="rounded-lg bg-[#88E783] px-2.5 py-1 text-[11px] font-bold text-[#001391] transition hover:brightness-95 disabled:opacity-40"
                        >
                          {guardandoFirmante === "guardando" ? "Guardando…" : "Sí, guardar"}
                        </button>
                        <span className="text-sand/40">Si no, se usa solo en esta oferta.</span>
                      </p>
                    )}
                  </div>
                )}
                {/* Fuera del bloque de «Otro…»: al guardar, el firmante pasa a
                    estar elegido en la lista y ese bloque ya no se pinta. */}
                {guardandoFirmante === "ok" && (
                  <p className={`mt-2 text-[11.5px] font-bold ${TEXT.lime}`}>Guardado: ya sale en la lista para todo el equipo.</p>
                )}
                {guardandoFirmante === "error" && (
                  <p className="mt-2 text-[11.5px] font-bold text-mandarin">No se pudo guardar (se usará solo en esta oferta).</p>
                )}
              </div>
            ) : (
              <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11.5px] text-sand/60">
                Firma <strong className="text-sand/85">{FIRMANTE_ES}</strong> · la oferta lleva IVA.
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre del proyecto">
                <div className={`${FIELD} flex items-center gap-0 !py-0`}>
                  <span className="shrink-0 py-2 text-sand/45">RDR -&nbsp;</span>
                  <input
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                    placeholder="Migración Midas" aria-label="Nombre del proyecto (sin el prefijo RDR)"
                    className="w-full bg-transparent py-2 focus:outline-none"
                  />
                </div>
              </Campo>
              <Campo etiqueta="SDATOOL" ayuda="Puedes pegarlo completo (SDATOOL-5454): se queda el código.">
                <div className={`${FIELD} flex items-center gap-0 !py-0`}>
                  <span className="shrink-0 py-2 text-sand/45">SDATOOL-</span>
                  <input
                    type="text" value={sdatool} onChange={(e) => cambiaSdatool(e.target.value)}
                    placeholder="5454" aria-label="Código SDATOOL"
                    className="w-full bg-transparent py-2 focus:outline-none"
                  />
                </div>
              </Campo>
              <Campo etiqueta="MMF">
                <div className={`${FIELD} flex items-center gap-0 !py-0`}>
                  <span className="shrink-0 py-2 text-sand/45">MMF -&nbsp;</span>
                  <input
                    type="text" value={mmf} onChange={(e) => setMmf(e.target.value)}
                    placeholder="1234" aria-label="Código MMF"
                    className="w-full bg-transparent py-2 focus:outline-none"
                  />
                </div>
              </Campo>
              <Campo etiqueta="Trimestre" ayuda={fechaIni ? `Del ${fechaIni} al ${fechaFin}` : ""}>
                <select value={q} onChange={(e) => setQ(e.target.value)} className={`${FIELD} block w-full font-bold`}>
                  {qsSeleccionables().map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </Campo>
            </div>

            <Campo etiqueta="Detalle de la actividad">
              <textarea
                value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={5}
                placeholder="Descripción de la actividad de la oferta…"
                className={`${FIELD} block w-full resize-y`}
              />
            </Campo>

            {/* ── Calculadora horas / importes ── */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-sand/50">
                Horas e importes — rellena horas O {esLatam ? "el importe" : "importe con IVA"}
              </p>
              <div className={`grid gap-3 ${esLatam ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                <Campo etiqueta="Horas">
                  <input
                    type="number" min="0" step="1" value={horasTxt}
                    onChange={(e) => cambiaHoras(e.target.value)}
                    placeholder="129" className={`${FIELD} w-full !py-1.5 text-right tabular-nums`}
                  />
                </Campo>
                <Campo etiqueta="Tarifa €/h">
                  <input
                    type="number" min="0" step="0.01" value={tarifa}
                    onChange={(e) => { setTarifa(num(e.target.value)); setIvaTxt(""); }}
                    className={`${FIELD} w-full !py-1.5 text-right tabular-nums`}
                  />
                </Campo>
                {!esLatam && (
                  <Campo etiqueta="Sin IVA €">
                    <input type="text" readOnly value={horas ? eurTxt(sinIva) : ""} placeholder="—"
                      className={`${FIELD} w-full !py-1.5 text-right tabular-nums opacity-70`} />
                  </Campo>
                )}
                <Campo etiqueta={esLatam ? "Importe €" : "Con IVA €"}>
                  <input
                    type="text" inputMode="decimal"
                    value={ivaTxt !== "" ? ivaTxt : horas ? eurTxt(importe) : ""}
                    onChange={(e) => cambiaIva(e.target.value)}
                    onBlur={() => setIvaTxt("")}
                    placeholder={esLatam ? "6600" : "8000"} className={`${FIELD} w-full !py-1.5 text-right tabular-nums`}
                  />
                </Campo>
              </div>
              {/* Línea SIEMPRE visible con horas > 0: si apareciera solo al
                  escribir, el blur del campo la quitaría en pleno click y el
                  botón de generar se movería bajo el cursor. */}
              {horas > 0 && (
                <p className="mt-2 text-[11px] text-sand/55">
                  = <strong className="tabular-nums text-sand/85">{horas} h</strong> ·{" "}
                  <span className="tabular-nums">{eurTxt(sinIva)} €</span>
                  {esLatam ? (
                    <span className="text-sand/40"> · sin IVA (LATAM)</span>
                  ) : (
                    <> sin IVA · <span className="tabular-nums">{eurTxt(conIva)} €</span> con IVA</>
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!listo || !backendUrl || estado.fase === "enviando"}
                onClick={generar}
                className="inline-flex items-center gap-2 rounded-lg bg-[#F5E33D] px-4 py-2.5 text-sm font-bold text-[#001391] transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                {estado.fase === "enviando" ? (
                  <><span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-[#001391]/30 border-t-[#001391]" /> Generando…</>
                ) : (
                  <><IconPlus size={15} /> Generar oferta</>
                )}
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="rounded-lg border border-white/15 bg-white/[0.055] px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-sand/75 transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                Limpiar
              </button>
              {!listo && (
                <p className="text-[11px] text-sand/45">
                  Necesarios: nombre, SDATOOL, detalle, horas (o importe){esLatam ? " y firmante" : ""}.
                </p>
              )}
            </div>

            {estado.fase === "error" && (
              <p className="rounded-lg border border-mandarin/50 bg-mandarin/10 px-3 py-2 text-xs font-bold text-mandarin">
                No se pudo generar: {estado.error}
              </p>
            )}

            {/* Historial de la sesión: cada oferta con SUS enlaces, la última
                arriba — se pueden encadenar tantas como haga falta sin que
                los enlaces de una pisen los de otra. */}
            {historial.length > 0 && (
              <div className="space-y-2">
                <p className={`text-[11px] font-bold uppercase tracking-wide ${TEXT.lime}`}>
                  Ofertas generadas en esta sesión ({historial.length})
                </p>
                <ul className="space-y-1.5">
                  {historial.map((o, i) => (
                    <li key={o.id} className={`rounded-lg border px-3 py-2 text-[12px] ${i === 0 ? "border-lime/40 bg-lime/[0.08]" : "border-white/[0.08] bg-white/[0.03]"}`}>
                      <p className="font-bold text-sand">
                        {o.base} <span className="font-normal text-sand/45">· {o.hora}{o.ruta ? ` · ${o.ruta.split("/").slice(0, 2).join("/")}` : ""}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <a className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-sand/85 hover:text-serene" href={o.docUrl} target="_blank" rel="noreferrer"><IconExternal size={11} /> Doc</a>
                        <a className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-sand/85 hover:text-serene" href={o.sheetUrl} target="_blank" rel="noreferrer"><IconExternal size={11} /> Sheet</a>
                        {o.pdfUrl && <a className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-sand/85 hover:text-serene" href={o.pdfUrl} target="_blank" rel="noreferrer"><IconExternal size={11} /> PDF</a>}
                        <a className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 text-sand/60 hover:text-serene" href={o.carpetaUrl} target="_blank" rel="noreferrer"><IconExternal size={11} /> Carpeta</a>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* ── Vista previa de los 11 datos ── */}
          <section className={`${GLASS} sticky top-24 p-5`} aria-label="Vista previa de los datos">
            <h2 className="mb-3 font-display text-base font-bold text-sand">Datos que se enviarán</h2>
            <dl className="space-y-1.5 text-[12px]">
              {[
                ["1 · Proyecto", datos.dato1],
                ["2 · SDATOOL", datos.dato2],
                ["3 · MMF", datos.dato3],
                ["4 · Inicio Q", datos.dato4],
                ["5 · Fin Q", datos.dato5],
                ["6 · Detalle", datos.dato6],
                ["7 · Horas", datos.dato7, esLatam],
                ["8 · Importe", datos.dato8 && `${datos.dato8} €`],
                ["9 · Con IVA", datos.dato9 && `${datos.dato9} €`, esLatam],
                ["10 · Fecha", datos.dato10],
                ["11 · Combinación", datos.dato11],
                ["12 · Firmante", datos.dato12],
              ].map(([k, v, vacioLatam]) => (
                <div key={k} className="flex gap-2">
                  <dt className="w-28 shrink-0 text-sand/45">{k}</dt>
                  <dd className={`min-w-0 break-words ${v ? "text-sand/90" : "text-sand/25"}`}>
                    {v || (vacioLatam ? <span className="italic">vacío · LATAM sin IVA</span> : "—")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
