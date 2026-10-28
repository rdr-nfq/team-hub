"use client";

import { useMemo, useState } from "react";
import { Link } from "next-view-transitions";
import { useReducedMotion } from "framer-motion";
import { useTilt } from "@/hooks/useTilt";
import { TRACKS } from "@/lib/formaciones";
import { resumen, estadoNiveles, nivelActual } from "@/lib/progreso";
import { rgba, n2 } from "@/lib/ui";
import { PALETTE } from "@/lib/palette";
import { useTheme, useAccentMap } from "@/lib/theme";
import { archivoDeRecord } from "./mapeo";
import { IconUsers, IconAlert, IconBack } from "./icons";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";

/**
 * Vista "Progreso del equipo": tarjeta glass por persona con su avance por la
 * ruta RDR (barra serene→lime como en ProgresoTorre), stats por pista y chips
 * de cursos completados. Lógica calcada del legacy equipo-formaciones.html:
 * records agrupados por userId y catálogo derivado de courseMeta.
 */

const POS = { funcional: "FUN", tecnico: "TÉC", cross: "CRS", welcome: "WEL" };
const FILTROS = [
  { id: "all", label: "Todo", color: null },
  { id: "funcional", label: "Funcional", color: TRACKS.funcional.color },
  { id: "tecnico", label: "Técnico", color: TRACKS.tecnico.color },
  { id: "cross", label: "Cross", color: TRACKS.cross.color },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Datos derivados de una persona a partir de los records del backend. */
function datosDe(person, records, catalog) {
  // Contrato legacy: records agrupados por userId (id de equipo.json).
  const userRecords = records.filter((r) => r.userId === person.id);
  const completedIds = new Set(userRecords.map((r) => r.courseId));
  const completedCourses = catalog
    .filter((c) => completedIds.has(c.id))
    .sort((a, b) => (a.nivel - b.nivel) || String(a.nombre).localeCompare(String(b.nombre)));
  const n = completedCourses.length;
  const maxLevel = n ? Math.max(...completedCourses.map((c) => c.nivel || 0)) : 0;
  const byTrack = (t) => completedCourses.filter((c) => c.track === t).length;
  // Rating OVR de la carta legacy (guiño gamificado, misma fórmula).
  const ovr = n === 0 ? 50 : Math.min(99, 52 + n * 5 + maxLevel * 2);

  // Progreso por la RUTA (catálogo lib/formaciones): records -> archivos.
  const completadas = new Set();
  userRecords.forEach((r) => { const a = archivoDeRecord(r); if (a) completadas.add(a); });
  const r = resumen(completadas);
  const actual = nivelActual(estadoNiveles(completadas));

  return {
    ovr,
    n,
    completedCourses,
    stats: [
      { label: "FUN", value: byTrack("funcional") },
      { label: "TÉC", value: byTrack("tecnico") },
      { label: "CRS", value: byTrack("cross") },
      { label: "TOTAL", value: n },
    ],
    pct: r.pct,
    hechos: r.hechos,
    total: r.total,
    nivelActual: actual,
  };
}

function Fondo() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <span className="rdr-blob left-[-8%] top-[4%] h-80 w-80" style={{ background: PALETTE.royal }} />
      <span className="rdr-blob right-[-6%] top-[-10%] h-72 w-72" style={{ background: PALETTE.serene, animationDelay: "-4s" }} />
      <span className="rdr-blob bottom-[-12%] left-[18%] h-80 w-80" style={{ background: PALETTE.lime, animationDelay: "-8s" }} />
      <span className="rdr-blob bottom-[-6%] right-[10%] h-64 w-64" style={{ background: PALETTE.purple, animationDelay: "-11s" }} />
    </div>
  );
}

/** Pill de estado de sincronización (réplica funcional del pill legacy). */
function StatusPill({ backend }) {
  const base = "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold";
  if (backend.status === "pending") {
    return (
      <span className={`${base} rdr-skel border-white/10 text-sand/70`} role="status" aria-live="polite">
        Sincronizando certificados…
      </span>
    );
  }
  if (backend.status === "ok") {
    return (
      <span className={`${base} border-lime/40 bg-lime/[0.14] text-lime`} role="status" aria-live="polite">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_8px_currentColor]" />
        Sincronizado · {backend.records.length} certificados
      </span>
    );
  }
  const texto = backend.status === "error" ? "Error de sincronización" : "Backend pendiente de configurar";
  return (
    <span className={`${base} border-mandarin/40 bg-mandarin/[0.12] text-mandarin`} role="status" aria-live="polite">
      <IconAlert size={13} />
      {texto}
    </span>
  );
}

function Filtros({ filtro, onFiltro }) {
  const { theme } = useTheme();
  // Punto del filtro "Todo": blanco translúcido en oscuro, tinta en claro (sobre Sand un punto blanco desaparece).
  const neutro = theme === "light" ? "rgba(7,14,70,.35)" : "rgba(255,255,255,.4)";
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por pista">
      {FILTROS.map((f) => {
        const activo = filtro === f.id;
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onFiltro(f.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene ${
              activo
                ? "border-serene/60 bg-serene/[0.16] text-sand"
                : "border-white/12 bg-white/[0.05] text-sand/80 hover:border-serene/50 hover:text-sand"
            }`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color || neutro }} />
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

function PersonaCard({ persona, datos, sinBackend, delay }) {
  const reduce = useReducedMotion();
  const tilt = useTilt(reduce);
  const acc = useAccentMap(); // TRACKS como TEXTO -> tono AA por tema (tintes/bordes rgba conservan el hex original)
  const tr = TRACKS[persona.track] || TRACKS.cross;
  const color = tr.color;

  return (
    <article
      {...tilt}
      aria-label={`Progreso de ${persona.nombre}`}
      className="rdr-rise rdr-tilt group relative overflow-hidden rounded-2xl border border-white/12 bg-white/[0.055] p-5 backdrop-blur-md hover:bg-white/[0.09]"
      style={{ animationDelay: `${delay}ms`, "--pc": rgba(color, 0.65) }}
    >
      <span aria-hidden className="rdr-spot" style={{ background: `radial-gradient(180px circle at var(--mx,50%) var(--my,50%), ${rgba(color, 0.18)}, transparent 70%)` }} />

      {/* Cabecera: avatar + nombre + pista + OVR */}
      <div className="relative flex items-center gap-3.5">
        <span
          aria-hidden
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 font-display text-lg font-bold text-sand"
          style={{ borderColor: rgba(color, 0.6), background: rgba(color, 0.2) }}
        >
          {initials(persona.nombre)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-bold leading-tight text-sand">{persona.nombre}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: acc(color), backgroundColor: rgba(color, 0.16) }}>
              {tr.nombre}
            </span>
            {!sinBackend && (
              <span className="inline-flex items-center rounded-full bg-serene/[0.14] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-serene">
                Nivel N{n2(datos.nivelActual)}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-display text-3xl font-bold leading-none tabular-nums text-sand">{datos.ovr}</span>
          <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: acc(color) }}>
            {POS[persona.track] || "RDR"}
          </span>
        </div>
      </div>

      {/* Barra de progreso por la ruta (misma escala que /formacion) */}
      <div className="relative mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-wider text-serene/80">Ruta RDR</span>
          <span className="tabular-nums text-sand/70">{datos.hechos}/{datos.total} · {datos.pct}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label={`Ruta formativa completada por ${persona.nombre}`}
          aria-valuenow={datos.pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-serene to-lime transition-[width] duration-700" style={{ width: `${datos.pct}%` }} />
        </div>
      </div>

      {/* Stats por pista */}
      <dl className="relative mt-4 grid grid-cols-4 gap-1.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-2 py-2.5 text-center">
        {datos.stats.map((s) => (
          <div key={s.label} className="flex flex-col-reverse gap-0.5">
            <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-sand/50">{s.label}</dt>
            <dd className="font-display text-lg font-bold tabular-nums leading-none text-sand">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Cursos completados (catálogo derivado del backend) */}
      <div className="relative mt-4 flex flex-wrap gap-1.5">
        {datos.n === 0 ? (
          <p className="text-xs italic text-sand/45">Sin formaciones completadas todavía</p>
        ) : (
          datos.completedCourses.map((c) => {
            const cc = (TRACKS[c.track] || TRACKS.cross).color;
            return (
              <span
                key={c.id}
                title={`Nivel ${c.nivel}`}
                className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                style={{ color: acc(cc), backgroundColor: rgba(cc, 0.14), borderColor: rgba(cc, 0.32) }}
              >
                {c.nombre}
              </span>
            );
          })
        )}
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <div className="flex items-center gap-3.5">
        <div className="h-14 w-14 shrink-0 rounded-full rdr-skel" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="h-4 w-3/5 rounded rdr-skel" />
          <div className="h-3 w-2/5 rounded-full rdr-skel" />
        </div>
        <div className="h-9 w-12 rounded-lg rdr-skel" />
      </div>
      <div className="mt-5 h-2 w-full rounded-full rdr-skel" />
      <div className="mt-4 h-12 w-full rounded-xl rdr-skel" />
      <div className="mt-4 flex gap-1.5">
        <div className="h-5 w-24 rounded-full rdr-skel" />
        <div className="h-5 w-16 rounded-full rdr-skel" />
      </div>
    </div>
  );
}

function StatusCard({ warn, title, children }) {
  return (
    <div
      className={`col-span-full rounded-2xl border p-10 text-center backdrop-blur-md ${
        warn ? "border-mandarin/35 bg-mandarin/[0.07]" : "border-white/12 bg-white/[0.04]"
      }`}
      role={warn ? "alert" : "status"}
    >
      {warn && <IconAlert size={26} className="mx-auto mb-3 text-mandarin" />}
      <h3 className="font-display text-lg font-bold text-sand">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-sand/65">{children}</p>
    </div>
  );
}

export default function EquipoProgreso({ team, teamError, backend }) {
  const [filtro, setFiltro] = useState("all");
  const cargandoEquipo = team === null;

  // Datos derivados por persona (contrato legacy) — solo cuando hay records.
  const datos = useMemo(() => {
    const map = new Map();
    (team || []).forEach((p) => map.set(p.id, datosDe(p, backend.records, backend.catalog)));
    return map;
  }, [team, backend.records, backend.catalog]);

  const visibles = (team || []).filter((p) => filtro === "all" || (p.track || "cross") === filtro);
  const sinBackend = backend.status === "unconfigured" || backend.status === "error";

  return (
    <main className="relative">
      <ArtBanner src={ART.formacion} />
      <Fondo />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-6">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <header className="mb-10">
          <Link
            href="/formacion"
            className="group inline-flex items-center gap-2 rounded-full border border-serene/30 bg-serene/10 px-4 py-2 text-xs font-bold text-serene backdrop-blur-md transition hover:border-serene/60 hover:bg-serene/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene"
          >
            <IconBack size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Ruta formativa
          </Link>
          <p className="mt-6 font-sans text-xs font-bold uppercase tracking-[0.4em] text-serene/80">BBVA × NFQ · CIB</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
            Progreso del equipo
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-sand/65">
            Estado actual de cada miembro del equipo NFQ trabajando en RDR. Los certificados se
            sincronizan automáticamente cada hora desde la carpeta de Drive.
          </p>
          <div className="mt-5">
            <StatusPill backend={backend} />
          </div>
        </header>

        {/* ── Cabecera de sección + filtros ────────────────────────── */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-serene/30 bg-serene/[0.12] text-serene">
              <IconUsers size={20} />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-sand">Equipo NFQ · RDR</h2>
              <p className="text-[13px] text-sand/60">Cursos completados y avance por la ruta de niveles.</p>
            </div>
          </div>
          <Filtros filtro={filtro} onFiltro={setFiltro} />
        </div>

        {/* ── Grid de personas ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy={cargandoEquipo}>
          {cargandoEquipo ? (
            <>
              <span className="sr-only" role="status" aria-live="polite">Cargando datos del equipo…</span>
              {[0, 1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}
            </>
          ) : teamError ? (
            <StatusCard warn title="No se pudieron cargar los datos">
              {teamError}. Verifica que <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">/equipo/equipo.json</code> existe
              y que la URL del backend en <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">links.json</code> es correcta.
            </StatusCard>
          ) : team.length === 0 ? (
            <StatusCard warn title="Equipo vacío">
              Edita <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">/equipo/equipo.json</code> para añadir miembros.
            </StatusCard>
          ) : visibles.length === 0 ? (
            <StatusCard title="Nadie en esta pista">
              No hay miembros del equipo en la pista seleccionada. Prueba con otro filtro.
            </StatusCard>
          ) : (
            visibles.map((p, i) => (
              <PersonaCard
                key={p.id}
                persona={p}
                datos={datos.get(p.id)}
                sinBackend={sinBackend}
                delay={i * 45}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
