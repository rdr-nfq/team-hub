"use client";

import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { rgba } from "@/lib/ui";
import { useAcc } from "../explorer/ui";
import { PROC_HEX, PROC_LABEL } from "./graph";

/* Nodo único del Mapa de flujos. El "tipo" visual viene en data.kind y el
   tinte en data.hex (hex ORIGINAL para bordes/fondos rgba; useAcc para el
   texto — convención de theming del repo). data.onFollow(target) lo inyecta
   FlowMap al decorar los nodos; data.follow es la lista de destinos de viaje. */

const KIND_LABEL = {
  inicio: "Inicio",
  paso: "Paso",
  workflow: "Workflow",
  subwf: "Sub-workflow",
  evento: "Evento",
  cola: "Cola JMS",
  listener: "Listener",
  jars: "JARs",
  scripts: "Scripts",
};

function FollowList({ follow, onFollow, acc }) {
  const [open, setOpen] = useState(false);
  if (!follow?.length || !onFollow) return null;

  const btnCls =
    "nodrag inline-flex w-full items-center justify-between gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene";

  if (follow.length === 1) {
    const t = follow[0];
    return (
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onFollow(t);
        }}
        aria-label={`Seguir hacia ${t.label}`}
        className={`${btnCls} mt-2`}
        style={{ borderColor: rgba(PROC_HEX[t.kind], 0.4), color: acc(PROC_HEX[t.kind]), backgroundColor: rgba(PROC_HEX[t.kind], 0.08) }}
      >
        <span className="truncate">Seguir · {t.label}</span>
        <span aria-hidden>→</span>
      </button>
    );
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={(ev) => {
          ev.stopPropagation();
          setOpen((o) => !o);
        }}
        className={btnCls}
        style={{ borderColor: rgba(PROC_HEX.online, 0.4), color: acc(PROC_HEX.online), backgroundColor: rgba(PROC_HEX.online, 0.08) }}
      >
        <span className="tabular-nums">Seguir ({follow.length} destinos)</span>
        <span aria-hidden>{open ? "▴" : "→"}</span>
      </button>
      {open && (
        <ul className="nowheel mt-1.5 max-h-36 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
          {follow.map((t) => (
            <li key={`${t.kind}:${t.id}`}>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onFollow(t);
                }}
                className="nodrag block w-full truncate rounded-md border border-white/12 bg-white/[0.05] px-2 py-1 text-left text-[10px] text-sand/80 transition hover:bg-white/[0.1] hover:text-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
              >
                <span className="mr-1.5 font-bold" style={{ color: acc(PROC_HEX[t.kind]) }}>
                  {PROC_LABEL[t.kind]}
                </span>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MapNode({ data, selected }) {
  const acc = useAcc();
  const hex = data.hex;
  const tint = hex || "#F7F8F8";

  return (
    <div
      className={`rounded-xl border bg-white/[0.055] px-3 py-2.5 backdrop-blur-md transition ${data.dim ? "opacity-75" : ""}`}
      style={{
        borderColor: hex ? rgba(hex, selected ? 0.85 : 0.4) : `rgba(247,248,248,${selected ? 0.5 : 0.15})`,
        boxShadow: selected ? `0 0 0 1px ${rgba(tint, 0.55)}, 0 8px 24px ${rgba(tint, 0.12)}` : undefined,
      }}
    >
      {/* Handles: secuencia por los lados, abanico por arriba/abajo. */}
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="t" />

      <div className="flex items-center gap-2">
        {data.num != null && (
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-lg border text-[10px] font-bold tabular-nums"
            style={
              hex
                ? { borderColor: rgba(hex, 0.55), color: acc(hex), backgroundColor: rgba(hex, 0.08) }
                : { borderColor: "rgb(var(--c-sand) / 0.15)", color: "inherit" }
            }
          >
            {data.num}
          </span>
        )}
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-sand/45">
          {KIND_LABEL[data.kind] || data.kind}
        </span>
        {data.badge && (
          <span
            className="ml-auto max-w-[45%] truncate rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
            style={{ color: acc(tint), backgroundColor: rgba(tint, 0.12) }}
          >
            {data.badge}
          </span>
        )}
      </div>

      <p className="mt-1 break-words text-[12px] font-bold leading-snug text-sand">{data.title}</p>
      {data.sub && <p className="mt-0.5 truncate font-mono text-[10px] text-sand/55">{data.sub}</p>}

      <FollowList follow={data.follow} onFollow={data.onFollow} acc={acc} />

      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
    </div>
  );
}

export const nodeTypes = { proc: memo(MapNode) };
