"use client";

import { useRef, useState } from "react";
import IconoBBVA from "../iconosBBVA";

/* Hora de una guardia: el campo se escribe («2230», «22.30», «22») o se abre
   una esfera de reloj — primero la hora (24 h en dos anillos, como el reloj de
   Android: fuera 1–12, dentro 13–23 y 00) y después los minutos de 5 en 5.
   Se puede pulsar o arrastrar la aguja; al soltar queda fijado. */

const S = 248, C = 124, R1 = 100, R2 = 66;
export const pad = (n) => String(n).padStart(2, "0");
const en = (i, r) => [C + r * Math.sin((i * Math.PI) / 6), C - r * Math.cos((i * Math.PI) / 6)];
const posHora = (x) => en(x % 12, x === 0 || x > 12 ? R2 : R1);
const posMin = (x) => en(x / 5, R1);

/* «2230», «22.30», «22:30», «930», «22» → «22:30» / «09:30» / «22:00».
   "" si está vacío; null si no es una hora válida. */
export function normaHora(t) {
  const x = String(t || "").trim().replace(/[.,h ]/g, ":");
  if (!x) return "";
  let h, m;
  if (x.includes(":")) [h, m] = x.split(":");
  else if (/^\d{1,2}$/.test(x)) [h, m] = [x, "0"];
  else if (/^\d{3,4}$/.test(x)) [h, m] = [x.slice(0, -2), x.slice(-2)];
  else return null;
  if (!/^\d{1,2}$/.test(h) || !/^\d{1,2}$/.test(m || "0")) return null;
  const hn = Number(h), mn = Number(m || 0);
  if (hn > 23 || mn > 59) return null;
  return `${pad(hn)}:${pad(mn)}`;
}

function valorEn(el, modo, e) {
  const r = el.getBoundingClientRect(), esc = r.width / S;
  const dx = (e.clientX - r.left) / esc - C, dy = (e.clientY - r.top) / esc - C;
  const ang = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const i = Math.round(ang / 30) % 12;
  if (modo === "m") return i * 5;
  return Math.hypot(dx, dy) < (R1 + R2) / 2 ? (i === 0 ? 0 : i + 12) : (i === 0 ? 12 : i);
}

/* Campo escribible con el botón del reloj. */
export function CampoHora({ k, etiqueta, valor, raw, abierto, disabled, invalido, describedby, onRaw, onLeer, onAbrir, onTecla }) {
  return (
    <div className="v-campo">
      <label htmlFor={`f-${k}`}>{etiqueta}</label>
      <div className="mg-hora">
        <input
          className="v-inp" type="text" id={`f-${k}`} inputMode="numeric" autoComplete="off" placeholder="hh:mm" maxLength={5}
          value={raw != null ? raw : valor} disabled={disabled}
          role="combobox" aria-haspopup="true" aria-expanded={abierto} aria-controls={`pk-${k}`}
          aria-invalid={invalido || undefined} aria-describedby={describedby}
          onChange={(e) => onRaw(e.target.value)}
          onBlur={() => onLeer()}
          onClick={() => { if (!abierto) onAbrir(); }}
          onKeyDown={onTecla}
        />
        <button type="button" className="mg-hora-b" tabIndex={-1} disabled={disabled}
          aria-label={`${abierto ? "Cerrar" : "Abrir"} el reloj de la ${etiqueta.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onAbrir(true)}>
          <IconoBBVA nombre="clock" size={20} />
        </button>
      </div>
    </div>
  );
}

/* Panel con la esfera. `onElegir(modo, valor, teclado)`. */
export function PanelReloj({ k, valor, modo, setModo, onElegir, tipica, pie, cerrar }) {
  const dial = useRef(null);
  const [arr, setArr] = useState(null); // valor mientras se arrastra
  const h = valor ? Number(valor.slice(0, 2)) : null, mi = valor ? Number(valor.slice(3)) : null;
  const hh = modo === "h" && arr != null ? arr : h;
  const mm = modo === "m" && arr != null ? arr : mi;
  const sel = modo === "h" ? hh : mm;
  const [x2, y2] = sel == null ? [C, C] : modo === "h" ? posHora(sel) : posMin(sel);

  const tecla = (e, v) => {
    if (e.key === "Escape") { e.preventDefault(); cerrar(true); return; }
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (d == null) return;
    e.preventDefault();
    const nv = modo === "h" ? (v + d + 24) % 24 : (v + d * 5 + 60) % 60;
    document.getElementById(`mg-${k}-${modo}${nv}`)?.focus();
  };
  const boton = (x, [l, t], clase) => (
    <button
      key={x} type="button" id={`mg-${k}-${modo}${x}`} className={clase} style={{ left: l, top: t }}
      aria-pressed={sel === x} aria-label={modo === "h" ? `${x} h` : `${x} minutos`}
      onClick={(e) => { if (e.detail === 0) onElegir(modo, x, true); }} // teclado; el ratón va por la esfera
      onKeyDown={(e) => tecla(e, x)}
    >{pad(x)}</button>
  );

  return (
    <div className="mg-pk" id={`pk-${k}`} role="group" aria-label={k === "he" ? "Hora de entrada" : "Hora de salida"}
      style={{ "--pk-x": k === "he" ? "24px" : "calc(50% + 29px)" }}
      onMouseDown={(e) => { if (!e.target.closest("input")) e.preventDefault(); }}>
      <div className="mg-pk-izq">
        <p className="mg-pk-q">{k === "he" ? "¿A qué hora empezaste?" : "¿A qué hora terminaste?"}</p>
        <div className="mg-pk-disp">
          <button type="button" className={`mg-seg${hh == null ? " mg-seg-vacio" : ""}`} aria-pressed={modo === "h"} aria-label="Elegir la hora" onClick={() => setModo("h")}>{hh == null ? "--" : pad(hh)}</button>
          <span aria-hidden="true">:</span>
          <button type="button" className={`mg-seg${mm == null ? " mg-seg-vacio" : ""}`} aria-pressed={modo === "m"} aria-label="Elegir los minutos" onClick={() => setModo("m")}>{mm == null ? "--" : pad(mm)}</button>
        </div>
        <p className="mg-pk-paso">{modo === "h" ? <><b>1.</b> Elige la hora · después, los minutos</> : <><b>2.</b> Elige los minutos</>}</p>
        {modo === "h" && k === "he" && <span className="mg-ley"><i aria-hidden="true" />lo habitual: las 7:00</span>}
        <p className="mg-pk-pie">{pie}</p>
      </div>
      <div
        ref={dial} className={`mg-dial${modo === "m" ? " mg-min" : ""}`}
        onPointerDown={(e) => { if (e.button > 0) return; e.preventDefault(); dial.current.setPointerCapture(e.pointerId); setArr(valorEn(dial.current, modo, e)); }}
        onPointerMove={(e) => { if (arr == null) return; const v = valorEn(dial.current, modo, e); if (v !== arr) setArr(v); }}
        onPointerUp={() => { if (arr == null) return; const v = arr; setArr(null); onElegir(modo, v, false); }}
        onPointerCancel={() => setArr(null)}
      >
        <svg className="mg-mano" viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
          {sel != null && <line className="mg-l" x1={C} y1={C} x2={x2} y2={y2} />}
          {modo === "m" && sel != null && sel % 5 !== 0 && <circle className="mg-c" cx={x2} cy={y2} r={5} />}
          <circle className="mg-c" cx={C} cy={C} r={3} />
        </svg>
        {modo === "h"
          ? Array.from({ length: 24 }, (_, x) => boton(x, posHora(x), `${x === 0 || x > 12 ? "mg-int" : ""}${tipica(x) ? " mg-tip" : ""}`))
          : Array.from({ length: 12 }, (_, i) => boton(i * 5, posMin(i * 5), i % 3 === 0 ? "mg-q" : ""))}
      </div>
    </div>
  );
}
