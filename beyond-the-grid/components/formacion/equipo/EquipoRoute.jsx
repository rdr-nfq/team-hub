"use client";

import { useEffect, useState } from "react";
import { useLinks } from "@/lib/links";
import { esActivo } from "@/lib/equipos";
import EquipoProgreso from "./EquipoProgreso";

/**
 * Ruta /formacion/equipo — datos. Réplica del contrato del legacy
 * public/formacion/equipo-formaciones.html:
 *   - Equipo: GET /team-hub/equipo/equipo.json -> { team: [...] }.
 *   - Progreso: GET a la URL de links.json (clave "formacionesBackend")
 *     -> { records: [{ userId, courseId, courseMeta:{nombre,nivel,track,tag} }] }.
 *   - Catálogo DERIVADO de los propios records: cada courseId único con su
 *     courseMeta (igual que el legacy, no se inventa nada en cliente).
 * La autenticación y la cabecera las pone el chrome persistente (AppFrame).
 */
const EQUIPO_URL = "/team-hub/equipo/equipo.json";
// Si links.json aún no ha resuelto pasado este tiempo, se muestra el equipo
// sin progresos (mismo fallback "sin backend" que el legacy).
const LINKS_TIMEOUT_MS = 6000;

export default function EquipoRoute() {
  const { getUrl, error: linksError } = useLinks();

  const [team, setTeam] = useState(null); // null = cargando
  const [teamError, setTeamError] = useState("");
  // status: pending | ok | error | unconfigured
  const [backend, setBackend] = useState({ status: "pending", records: [], catalog: [], message: "" });

  // ── Equipo ──────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch(EQUIPO_URL, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar equipo.json");
        return r.json();
      })
      .then((data) => alive && setTeam((data.team || []).filter(esActivo)))
      .catch((e) => {
        if (!alive) return;
        setTeam([]);
        setTeamError(e.message || "No se pudo cargar equipo.json");
      });
    return () => { alive = false; };
  }, []);

  // ── Progreso (backend Apps Script vía links.json) ───────────────────
  // getUrl cambia de identidad cuando LinksProvider termina de cargar
  // links.json, así que este efecto se re-ejecuta al resolver la URL.
  useEffect(() => {
    let alive = true;
    const url = getUrl && getUrl("formacionesBackend");

    if (url) {
      fetch(url, { method: "GET" })
        .then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then((data) => {
          if (!alive) return;
          const records = data.records || [];
          // Derivar catálogo: cada courseId único con su courseMeta (contrato legacy).
          const catalogMap = new Map();
          records.forEach((r) => {
            if (r.courseMeta && !catalogMap.has(r.courseId)) {
              catalogMap.set(r.courseId, {
                id: r.courseId,
                nombre: r.courseMeta.nombre,
                nivel: r.courseMeta.nivel,
                track: r.courseMeta.track,
                tag: r.courseMeta.tag,
              });
            }
          });
          setBackend({ status: "ok", records, catalog: Array.from(catalogMap.values()), message: "" });
        })
        .catch((e) => {
          if (!alive) return;
          setBackend({ status: "error", records: [], catalog: [], message: e.message || "Error de red" });
        });
      return () => { alive = false; };
    }

    const sinBackend = () =>
      setBackend((b) => (b.status === "pending" ? { status: "unconfigured", records: [], catalog: [], message: "" } : b));

    // links.json falló -> equipo sin progresos, al instante.
    if (linksError) { sinBackend(); return () => { alive = false; }; }

    // links.json en vuelo (o sin la clave): tope de espera y fallback.
    const t = setTimeout(() => { if (alive) sinBackend(); }, LINKS_TIMEOUT_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [getUrl, linksError]);

  return <EquipoProgreso team={team} teamError={teamError} backend={backend} />;
}
