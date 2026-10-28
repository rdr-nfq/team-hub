"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rgba, activo } from "@/lib/ui";
import { C, cxColor, stepColor, deriveQueues, CAJON_ID } from "./lib";
import {
  useAcc, Tag, TypePill, CatPill, CxText, CodePanel, InfoRow, WfFlow, ChainChips, TagList, Step, DetailHeader,
} from "./ui";

/* Vistas de detalle del Process Explorer reestructurado: el eje es el PROCESO
   (91 del inventario). ProcesoDetail agrega toda la información técnica del
   proceso — sus cadenas Control-M paso a paso, sus listeners online, su
   publicación (que es una acción del proceso, no una clasificación) y sus
   colas — en secciones desplegables. CajonDetail lista lo que no encaja en
   ningún proceso. Nada del dataset original se pierde: cada fila de
   chains/online/publishing sigue siendo visible desde su proceso dueño o
   desde el cajón. */

/* ── Flujo de una cadena Control-M (portado de showChain() del original) ── */
export function ChainSteps({ steps }) {
  return (
    <ol className="list-none">
      {steps.map((s, i) => {
        const tipo = s.TIPO_EJECUCION || "Job";
        const conDatos =
          s.EVENTO_GS || s.WORKFLOW_GS || s.JAVAS || s.SCRIPTS || s.SUB_WORKFLOWS || s.CONTENIDO_WF || s.COLA_JMS || s.CLASE_EVENTO;
        return (
          <Step
            key={i}
            n={i + 1}
            hex={stepColor(tipo)}
            last={i === steps.length - 1}
            title={s.NOMBRE || ""}
            badge={tipo}
            sub={(s.SCRIPT_O_EJECUTABLE || s.PARAMETRO) &&
              `${s.SCRIPT_O_EJECUTABLE || ""}${s.PARAMETRO ? ` → ${s.PARAMETRO}` : ""}`}
          >
            {conDatos && (
              <CodePanel className="mt-2">
                {s.EVENTO_GS && <InfoRow k="Evento" hex={C.serene} term>{s.EVENTO_GS}</InfoRow>}
                {s.WORKFLOW_GS && <InfoRow k="Workflow" hex={C.purple} term>{s.WORKFLOW_GS}</InfoRow>}
                {s.JAVAS && <InfoRow k="JARs" hex={C.lime} term>{s.JAVAS}</InfoRow>}
                {s.SCRIPTS && <InfoRow k="Scripts" hex={C.canary} term>{s.SCRIPTS}</InfoRow>}
                {s.COLA_JMS && <InfoRow k="Cola JMS" hex={C.mandarin} term>{s.COLA_JMS}</InfoRow>}
                {s.CLASE_EVENTO && <InfoRow k="Clase evento" hex={C.serene}>{s.CLASE_EVENTO}</InfoRow>}
                <WfFlow s={s.CONTENIDO_WF} />
                <ChainChips s={s.SUB_WORKFLOWS} />
              </CodePanel>
            )}
          </Step>
        );
      })}
    </ol>
  );
}

/* ── Flujo de un listener online (portado de showOnline()) ─────────────── */
export function OnlineSteps({ ev }) {
  const acc = useAcc();
  const subs = ev.SUB_WORKFLOWS ? ev.SUB_WORKFLOWS.split(" > ") : [];
  const total = 1 + (ev.WORKFLOW_GS ? 1 : 0) + subs.length;
  let n = 0;
  return (
    <ol className="list-none">
      <Step n={++n} hex={C.canary} last={n === total} title="Mensaje entrante" badge={ev.CLASE_EVENTO || "JMS"}
        sub={ev.COLA_ESCUCHA && (
          <>Cola: <strong style={{ color: acc(C.mandarin) }}>{ev.COLA_ESCUCHA}</strong></>
        )}
      />
      {ev.WORKFLOW_GS && (
        <Step n={++n} hex={C.serene} last={n === total} title={ev.WORKFLOW_GS} badge="Workflow">
          {((ev.CONTENIDO_WF && ev.CONTENIDO_WF !== "Dummy/Empty") || ev.SUB_WORKFLOWS) && (
            <CodePanel className="mt-2">
              <WfFlow s={ev.CONTENIDO_WF} />
              <ChainChips s={ev.SUB_WORKFLOWS} />
            </CodePanel>
          )}
        </Step>
      )}
      {subs.map((sw, i) => (
        <Step key={i} n={++n} hex={C.purple} last={n === total} title={sw.trim()} badge="Sub-Workflow" />
      ))}
    </ol>
  );
}

/* ── Flujo de una publicación (portado de showPub()) ───────────────────── */
export function PublishSteps({ p }) {
  const acc = useAcc();
  const queues = deriveQueues(p);
  const tieneCallers = p.CALLERS && p.CALLERS.length > 0;
  return (
    <ol className="list-none">
      {tieneCallers && (
        <Step n={0} last={false} title="Llamado desde" badge="Callers">
          <ChainChips s={p.CALLERS} sep="·" />
          {p.EVENTS && p.EVENTS.length > 0 && (
            <p className="mt-2 break-words text-[11px] text-sand/60">Eventos: {p.EVENTS.join(", ")}</p>
          )}
        </Step>
      )}
      <Step n={1} hex={C.serene} last={queues.length === 0} title={p.WORKFLOW} badge="Workflow">
        <CodePanel className="mt-2">
          <InfoRow k="Grupo">{p.GROUP || "-"}</InfoRow>
        </CodePanel>
      </Step>
      {queues.map((q, i) => (
        <Step
          key={i}
          n={i + 2}
          hex={C.lime}
          last={i === queues.length - 1}
          title={<span style={{ color: acc(C.mandarin) }}>{q.queue}</span>}
          badge="Cola destino"
          sub={`${q.entity} → ${q.system}`}
        />
      ))}
    </ol>
  );
}

/* Colas destino de una publicación, destacadas: "Publica en <cola>". Es la
   información que más interesa de la publicación de un proceso. */
export function PublicaEn({ queues }) {
  const acc = useAcc();
  if (!queues || !queues.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sand/55">Publica en</p>
      <ul className="space-y-2">
        {queues.map((q, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
              style={{ color: acc(C.lime), backgroundColor: rgba(C.lime, 0.12), border: `1px solid ${rgba(C.lime, 0.25)}` }}
            >
              Cola
            </span>
            <span className="min-w-0">
              <span className="block break-all font-mono text-[12px] font-bold" style={{ color: acc(C.mandarin) }}>
                {q.queue}
              </span>
              <span className="block text-[10.5px] text-sand/55">{q.entity} → {q.system}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const IconChevron = (p) => (
  <svg width={p.size || 13} height={p.size || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/* Elemento desplegable de una sección (cadena / listener / publicación).
   `openId`+`onToggle` los gestiona ProcesoDetail para poder abrir uno desde
   el hash (#proc/P-013/<cadena>). */
function Fold({ id, open, onToggle, hex, badge, title, sub, right, children }) {
  const acc = useAcc();
  const ref = useRef(null);
  // Al abrirse desde un enlace profundo, llévalo a la vista.
  const openedByLink = useRef(false);
  useEffect(() => {
    if (open && openedByLink.current && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
      openedByLink.current = false;
    }
  }, [open]);
  return (
    <li ref={ref} className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className="grid w-full grid-cols-[auto,1fr,auto] items-center gap-x-2.5 px-3 py-2.5 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-serene"
      >
        <span
          aria-hidden
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{ color: acc(hex), backgroundColor: rgba(hex, 0.12), border: `1px solid ${rgba(hex, 0.25)}` }}
        >
          {badge}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-[12px] font-semibold text-sand">{title}</span>
          {sub && <span className="block truncate text-[10.5px] text-sand/55">{sub}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {right && <span className="text-[10px] font-bold tabular-nums text-sand/50">{right}</span>}
          <span aria-hidden className={`text-sand/50 transition-transform ${open ? "rotate-180" : ""}`}>
            <IconChevron />
          </span>
        </span>
      </button>
      {open && <div className="border-t border-white/10 px-3.5 pb-4 pt-4">{children}</div>}
    </li>
  );
}

function Section({ title, count, hint, children }) {
  return (
    <section className="mt-7">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-sand/55">{title}</h3>
        {count != null && <span className="text-[11px] font-bold tabular-nums text-sand/40">{count}</span>}
        {hint && <p className="basis-full text-[10.5px] leading-relaxed text-sand/45">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/* ── Ficha completa de un proceso del inventario ───────────────────────────
   p       = proceso de clasificacion-rdr.json
   cat     = su categoría oficial (objeto)
   data    = procesos-rdr-data.json (chains, chainsMeta, online, publishing)
   dataIndex = buildDataIndex(data)
   openSub = cadena/listener/publicación a desplegar (desde el hash)
   onNavigate(pid) = ir a otro proceso (relacionados) */
export function ProcesoDetail({ p, cat, data, dataIndex, clasifIndex, openSub, onNavigate, mapHref }) {
  const acc = useAcc();
  const est = p.estado || "ACTIVO";
  const estHex = est === "ACTIVO" ? C.lime : C.red;

  // Un único desplegable abierto a la vez (id = "c:<cadena>", "l:<NOMBRE>",
  // "p:<WORKFLOW>"). openSub (enlace profundo) abre el suyo al montar/cambiar.
  const subToId = (sub) => {
    if (!sub) return null;
    if ((p.cadenas || []).includes(sub)) return `c:${sub}`;
    if ((p.listeners || []).includes(sub)) return `l:${sub}`;
    if ((p.publicacion || []).includes(sub)) return `p:${sub}`;
    return null;
  };
  const [open, setOpen] = useState(() => subToId(openSub));
  useEffect(() => { setOpen(subToId(openSub)); }, [p.id, openSub]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id) => setOpen((o) => (o === id ? null : id));

  const chainsMeta = data.chainsMeta || {};
  const listenerRows = useMemo(
    () => (p.listeners || []).map((n) => data.online[dataIndex.onlineByName.get(n)]).filter(Boolean),
    [p, data, dataIndex]
  );
  const publishRows = useMemo(
    () => (p.publicacion || []).map((w) => data.publishing[dataIndex.publishByWf.get(w)]).filter(Boolean),
    [p, data, dataIndex]
  );

  return (
    <article>
      <DetailHeader title={p.nombre} desc={p.descripcion}>
        <span className="font-mono font-bold text-sand/70">{p.id}</span>
        <TypePill hex={p.tipo === "ONLINE" ? C.canary : C.serene}>{p.tipo}</TypePill>
        <CatPill cat={cat} full />
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ color: acc(estHex), backgroundColor: rgba(estHex, 0.12), border: `1px solid ${rgba(estHex, 0.25)}` }}
        >
          {est}
        </span>
        {p.complejidad && (
          <span
            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ color: acc(cxColor(p.complejidad)), backgroundColor: rgba(cxColor(p.complejidad), 0.12) }}
          >
            {p.complejidad}
          </span>
        )}
        {p.ejecucionesAnual && p.ejecucionesAnual !== "0" && (
          <span className="tabular-nums">{p.ejecucionesAnual} ejecuciones/año</span>
        )}
      </DetailHeader>

      <CodePanel>
        {p.criterioComplejidad && <InfoRow k="Criterio">{p.criterioComplejidad}</InfoRow>}
        {p.colasDoc && <InfoRow k="Colas (doc)" hex={C.mandarin}>{p.colasDoc}</InfoRow>}
        {p.wikiRef && <InfoRow k="Ref. wiki">{p.wikiRef}</InfoRow>}
        {p.javas.length > 0 && <InfoRow k="JARs" hex={C.lime} term>{p.javas.join(", ")}</InfoRow>}
      </CodePanel>

      {(p.tecnologias.length > 0 || p.entidades.length > 0 || p.sistemas.length > 0) && (
        <div className="mt-4 space-y-2">
          {p.tecnologias.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Tecnologías</p>
              <TagList s={p.tecnologias.join(", ")} hex={C.serene} />
            </div>
          )}
          {p.entidades.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Entidades</p>
              <TagList s={p.entidades.join(", ")} hex={C.purple} />
            </div>
          )}
          {p.sistemas.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-sand/50">Sistemas conectados</p>
              <TagList s={p.sistemas.join(", ")} hex={C.red} />
            </div>
          )}
        </div>
      )}

      {p.cadenas.length > 0 && (
        <Section title="Cadenas Control-M" count={p.cadenas.length}>
          <ul className="space-y-1.5">
            {p.cadenas.map((name) => {
              const steps = (data.chains || {})[name];
              const m = chainsMeta[name] || {};
              return (
                <Fold
                  key={name}
                  id={`c:${name}`}
                  open={open === `c:${name}`}
                  onToggle={toggle}
                  hex={C.serene}
                  badge="Cadena"
                  title={name}
                  sub={m.natural}
                  right={steps ? `${steps.length} pasos` : ""}
                >
                  {m.cx && (
                    <p className="mb-3 text-[11px] text-sand/60">
                      Complejidad: <CxText cx={m.cx} />
                    </p>
                  )}
                  {steps ? <ChainSteps steps={steps} /> : (
                    <p className="text-[11.5px] text-sand/55">Sin detalle de pasos en el dataset.</p>
                  )}
                </Fold>
              );
            })}
          </ul>
        </Section>
      )}

      {listenerRows.length > 0 && (
        <Section title="Listeners online" count={listenerRows.length}>
          <ul className="space-y-1.5">
            {listenerRows.map((ev) => (
              <Fold
                key={ev.NOMBRE}
                id={`l:${ev.NOMBRE}`}
                open={open === `l:${ev.NOMBRE}`}
                onToggle={toggle}
                hex={C.canary}
                badge="Listener"
                title={ev.NOMBRE}
                sub={ev.COLA_ESCUCHA ? `🔊 ${ev.COLA_ESCUCHA}` : ev.CLASE_EVENTO}
                right={ev.WORKFLOW_GS && ev.WORKFLOW_GS !== "Missing" ? "WF" : ""}
              >
                <OnlineSteps ev={ev} />
              </Fold>
            ))}
          </ul>
        </Section>
      )}

      {publishRows.length > 0 && (
        <Section
          title="Publicación"
          count={publishRows.length}
          hint="La publicación (PUBLISH/INITIALLOAD) es una acción de este proceso: acaba publicando su resultado en la(s) cola(s) destino."
        >
          <ul className="space-y-1.5">
            {publishRows.map((pub) => {
              const queues = deriveQueues(pub).filter(
                (q) => q.queue && q.queue !== "(sin cola identificada)"
              );
              return (
                <Fold
                  key={pub.WORKFLOW}
                  id={`p:${pub.WORKFLOW}`}
                  open={open === `p:${pub.WORKFLOW}`}
                  onToggle={toggle}
                  hex={C.lime}
                  badge="Publish"
                  title={pub.WORKFLOW}
                  sub={queues.length
                    ? `Publica en ${queues.map((q) => q.queue).join(", ")}`
                    : (pub.GROUP || "").split("/").slice(-2).join("/")}
                  right={pub.COUNT && pub.COUNT !== "0" ? `${pub.COUNT} ej.` : ""}
                >
                  {queues.length > 0 && <PublicaEn queues={queues} />}
                  <PublishSteps p={pub} />
                </Fold>
              );
            })}
          </ul>
        </Section>
      )}

      {p.colasInfra.length > 0 && (
        <Section
          title="Colas de infraestructura"
          count={p.colasInfra.length}
          hint="Colas del assembly asociadas a este proceso (entrada, ACK, publicación…)."
        >
          <div className="flex flex-wrap gap-1.5">
            {p.colasInfra.map((q) => (
              <Tag key={q} hex={C.mandarin} term={q}>{q}</Tag>
            ))}
          </div>
        </Section>
      )}

      {p.relacionados.length > 0 && (
        <Section
          title="Procesos relacionados"
          count={p.relacionados.length}
          hint="Sus cadenas aparecen en el mismo diagrama del documento Cadenas RDR v157 — orientativo, no verificado al 100 %."
        >
          <ul className="space-y-1.5">
            {p.relacionados.map((rid) => {
              const rp = clasifIndex.byId.get(rid);
              if (!rp) return null;
              return (
                <li key={rid}>
                  <button
                    type="button"
                    onClick={() => onNavigate(rid)}
                    aria-label={`Ir al proceso ${rp.nombre}`}
                    className="group grid w-full grid-cols-[auto,1fr,auto] items-center gap-x-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
                  >
                    <span className="shrink-0 font-mono text-[10px] font-bold text-sand/55">{rid}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold text-sand">{rp.nombre}</span>
                      <span className="block truncate text-[10px] text-sand/50">
                        {rp.tipo} · {(rp.cadenas || []).length} cadenas
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-sand/40 transition group-hover:translate-x-0.5">→</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {mapHref && (
        <div className="mt-8 border-t border-white/12 pt-5">
          <a
            href={mapHref}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
            style={activo(C.purple)}
          >
            Ver este proceso en el mapa interactivo <span aria-hidden>→</span>
          </a>
        </div>
      )}
    </article>
  );
}

/* ── Cajón desastre: lo que (aún) no encaja en ningún proceso ──────────── */
export function CajonDetail({ cajon, q }) {
  const acc = useAcc();
  const eventos = cajon.eventos || [];
  const colas = cajon.colas || [];
  // Con búsqueda activa, resalta filtrando; sin ella, lista completa.
  const evs = q ? eventos.filter((e) => (e.nombre || "").toLowerCase().includes(q) || (e.clase || "").toLowerCase().includes(q)) : eventos;
  const qs = q ? colas.filter((c) => c.toLowerCase().includes(q)) : colas;
  // Agrupa eventos por clase para que la lista sea explorable.
  const grupos = useMemo(() => {
    const g = new Map();
    evs.forEach((e) => {
      const k = e.clase || e.tipoEntrada || "Otros";
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(e);
    });
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [evs]);
  const [open, setOpen] = useState(null);

  return (
    <article>
      <DetailHeader title="Cajón desastre" desc={cajon.descripcion}>
        <TypePill hex={C.red}>Sin clasificar</TypePill>
        <span className="tabular-nums">{eventos.length} eventos</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{colas.length} colas</span>
      </DetailHeader>

      <Section
        title="Eventos de plataforma"
        count={evs.length}
        hint="Eventos genéricos del motor GoldenSource (validación de precios, locks, housekeeping…) que no pertenecen a ninguno de los 91 procesos del inventario."
      >
        <ul className="space-y-1.5">
          {grupos.map(([clase, items]) => (
            <Fold
              key={clase}
              id={clase}
              open={open === clase}
              onToggle={(id) => setOpen((o) => (o === id ? null : id))}
              hex={C.canary}
              badge="Clase"
              title={clase}
              right={`${items.length}`}
            >
              <div className="flex flex-wrap gap-1.5">
                {items.map((e) => (
                  <Tag key={e.nombre} hex={C.serene} term={e.nombre}>{e.nombre}</Tag>
                ))}
              </div>
            </Fold>
          ))}
          {grupos.length === 0 && (
            <p className="text-[11.5px] text-sand/55">Sin eventos que casen con la búsqueda.</p>
          )}
        </ul>
      </Section>

      <Section
        title="Colas sin proceso asignado"
        count={qs.length}
        hint="Colas del assembly que no hemos podido atribuir a un proceso. Lo vamos revisando."
      >
        {qs.length ? (
          <div className="flex flex-wrap gap-1.5">
            {qs.map((c) => (
              <Tag key={c} hex={C.mandarin} term={c}>{c}</Tag>
            ))}
          </div>
        ) : (
          <p className="text-[11.5px] text-sand/55">Sin colas que casen con la búsqueda.</p>
        )}
      </Section>

      <p className="mt-8 border-t border-white/12 pt-4 text-[11px] leading-relaxed" style={{ color: acc(C.canary) }}>
        ¿Sabes dónde encaja algo de esto? Díselo al equipo y lo movemos a su proceso.
      </p>
    </article>
  );
}

export { CAJON_ID };
