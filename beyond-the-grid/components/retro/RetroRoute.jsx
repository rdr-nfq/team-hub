"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { useAuth } from "../chrome/AuthGate";
import { useLinks } from "@/lib/links";
import { useGas } from "./api";
import MenuView from "./MenuView";
import BoardView from "./BoardView";
import ArchiveView from "./ArchiveView";
import { Blobs, DialogHost, GLASS, RetroToast, Skel } from "./ui";
import { IconArrowL } from "./icons";
import ArtBanner from "@/components/chrome/ArtBanner";
import { ART } from "@/lib/art";
import { mismoEmail } from "@/lib/email";

const EQUIPO_URL = "/team-hub/equipo/equipo.json";

/** Nombre legible a partir del correo si aún no ha cargado equipo.json ("ana.perez@…" → "Ana Perez"). */
function nombreDesdeEmail(email) {
  const local = String(email || "").split("@")[0];
  if (!local) return "Anónimo";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Ruta /retro: migración de public/retro.html.
 *
 * Identidad: viene del chrome (AuthGate/GIS). El nombre visible se resuelve
 * en equipo.json por email y el rol se deriva de isCoordinador (los
 * coordinadores son los organizadores de la retro; pueden entrar como
 * participante con un toggle). Desaparecen login/splash/header/footer propios.
 *
 * Vistas (misma máquina que el legacy): menú → sala en vivo | visor histórico.
 */
export default function RetroRoute() {
  const { email, isCoordinador } = useAuth();
  const { error: linksError } = useLinks();
  const { gasGet, gasPost, ready } = useGas();

  // ── Identidad ──
  const [nombre, setNombre] = useState(() => nombreDesdeEmail(email));
  useEffect(() => {
    let alive = true;
    setNombre(nombreDesdeEmail(email));
    fetch(EQUIPO_URL, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((eq) => {
        if (!alive || !eq) return;
        const m = (eq.team || []).find(
          (p) => mismoEmail(p.email, email)
        );
        if (m && m.nombre) setNombre(m.nombre);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [email]);

  const [comoParticipante, setComoParticipante] = useState(false);
  const role = isCoordinador && !comoParticipante ? "organizador" : "participante";

  // ── Diálogo (customAlert / customConfirm) ──
  const [dialog, setDialog] = useState(null);
  const alerta = useCallback((msg) => setDialog({ msg }), []);
  const confirma = useCallback((msg, onOk) => setDialog({ msg, onOk, confirm: true }), []);

  // ── Toast (progreso persistente / éxito 2,5 s, como el legacy) ──
  const [toastState, setToastState] = useState(null);
  const toastTimer = useRef(null);
  const toast = useRef({
    progress: (msg) => {
      clearTimeout(toastTimer.current);
      setToastState({ msg, kind: "progress" });
    },
    success: (msg) => {
      clearTimeout(toastTimer.current);
      setToastState({ msg, kind: "success" });
      toastTimer.current = setTimeout(() => setToastState(null), 2500);
    },
    hide: () => {
      clearTimeout(toastTimer.current);
      setToastState(null);
    },
  }).current;
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── Máquina de vistas ──
  const [view, setView] = useState("menu"); // "menu" | "board" | "archive"
  const [sessionId, setSessionId] = useState(null);
  const [archiveData, setArchiveData] = useState(null);
  const [menuKey, setMenuKey] = useState(0); // remonta el menú al volver → recarga listas (como el legacy)

  const entrar = useCallback((id) => {
    setSessionId(id);
    setView("board");
  }, []);

  const volverAlMenu = useCallback(() => {
    setSessionId(null);
    setArchiveData(null);
    setMenuKey((k) => k + 1);
    setView("menu");
  }, []);

  // Abre una sesión archivada: mismo "dump" que componía el legacy.
  const abrirArchivo = useCallback(
    async (s) => {
      toast.progress("Cargando retrospectiva...");
      try {
        const data = await gasGet("datosCompletos", { id: s.id });
        toast.hide();
        setArchiveData({
          id: s.id,
          nombre: s.nombre || data.nombreSesion || "",
          fecha: s.fecha || "",
          usuarios: data.usuarios || [],
          termometro: data.termometro || [],
          tarjetas: data.tarjetas || [],
          mejoras: data.mejoras || [],
        });
        setView("archive");
      } catch (e) {
        toast.hide();
        alerta("⚠️ No se pudo cargar la retrospectiva.\n\n" + (e.message || e));
      }
    },
    [gasGet, toast, alerta]
  );

  // Espera a links.json: si no llega en 8 s (o falla), aviso claro.
  const [linksTimeout, setLinksTimeout] = useState(false);
  useEffect(() => {
    if (ready) return undefined;
    const t = setTimeout(() => setLinksTimeout(true), 8000);
    return () => clearTimeout(t);
  }, [ready]);
  const backendKO = linksError || (linksTimeout && !ready);

  return (
    <main className="relative min-h-dvh w-full">
      <ArtBanner src={ART.equipo} />
      <Blobs />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-24 pt-28 sm:px-6">
        {/* Cabecera de página (el chrome fijo lo pone AppFrame/Header) */}
        {view !== "archive" && (
          <header className="rdr-rise mb-8">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-sans text-xs font-bold uppercase tracking-[0.35em] text-mandarin">
                Equipo · Retrospectivas
              </p>
            </div>
            <h1 className="mt-3 font-display text-4xl font-bold leading-none tracking-tight text-sand sm:text-5xl">
              Retro RDR
            </h1>
            {view === "menu" && (
              <p className="mt-3 max-w-xl text-pretty text-sm text-sand/65">
                Termómetro de confianza, tablero por fases y acciones de mejora. Únete a la sesión en vivo o revisa el histórico.
              </p>
            )}
          </header>
        )}

        {backendKO && (
          <div role="alert" className={`${GLASS} mx-auto max-w-lg border-mandarin/40 p-6 text-center`}>
            <p className="font-display text-lg font-bold text-sand">No se pudo conectar con el backend</p>
            <p className="mt-2 text-sm text-sand/70">
              Falta o no carga la clave <code className="rounded bg-white/10 px-1.5 py-0.5 text-mandarin">retroBackend</code> en{" "}
              <code className="rounded bg-white/10 px-1.5 py-0.5">links/links.json</code>. Revisa la red o el despliegue del Apps Script y recarga.
            </p>
          </div>
        )}

        {!backendKO && !ready && (
          <div aria-busy="true" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Skel className="h-80 w-full rounded-2xl" />
            <Skel className="h-80 w-full rounded-2xl" />
            <p role="status" aria-live="polite" className="col-span-full text-center text-xs font-bold uppercase tracking-[0.3em] text-serene/80">
              Conectando con el backend…
            </p>
          </div>
        )}

        {!backendKO && ready && view === "menu" && (
          <MenuView
            key={menuKey}
            gasGet={gasGet}
            gasPost={gasPost}
            nombre={nombre}
            role={role}
            isCoordinador={isCoordinador}
            comoParticipante={comoParticipante}
            setComoParticipante={setComoParticipante}
            onEntrar={entrar}
            onAbrirArchivo={abrirArchivo}
            alerta={alerta}
            confirma={confirma}
            toast={toast}
          />
        )}

        {!backendKO && ready && view === "board" && sessionId && (
          <BoardView
            gasGet={gasGet}
            gasPost={gasPost}
            sessionId={sessionId}
            nombre={nombre}
            role={role}
            onSalir={volverAlMenu}
            alerta={alerta}
            toast={toast}
          />
        )}

        {!backendKO && ready && view === "archive" && archiveData && (
          <ArchiveView data={archiveData} onVolver={volverAlMenu} />
        )}
      </div>

      <RetroToast toast={toastState} />
      <DialogHost dialog={dialog} onClose={() => setDialog(null)} />
    </main>
  );
}
