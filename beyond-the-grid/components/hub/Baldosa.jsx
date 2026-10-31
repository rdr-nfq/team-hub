"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "next-view-transitions";
import { useLinks } from "@/lib/links";
import IconoBBVA from "@/components/iconosBBVA";

/* Clase de color de cada sección (app/globals.css: .hub-eq, .hub-pr…). */
export const CLASE = { equipo: "hub-eq", proyectos: "hub-pr", formacion: "hub-fo", gestion: "hub-ge" };
export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";

const ETIQUETA = "ml-1.5 inline-block rounded-full border border-current px-1.5 py-0.5 align-[2px] text-[11px] uppercase leading-none tracking-[0.05em]";

/**
 * Acceso de la portada y de /gestion: baldosa teñida con el color de su
 * sección y placa con el icono oficial BBVA. Según el item: `ruta` (página
 * del hub), `copiar` / `abrir` (clave de links.json) o `pronto` (bloqueada).
 * Lo que no navega dentro del hub lo dice en la propia baldosa: icono de
 * copiar (y «Enlace copiado» al pulsar) o «Otra pestaña».
 * `arriba` alinea el contenido arriba (parejas cuya descripción puede partirse).
 */
export default function Baldosa({ item, sec, grande, suave, arriba }) {
  const { getUrl, copyLink } = useLinks();
  const [copiado, setCopiado] = useState(false);
  const reloj = useRef(0);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const copiar = async () => {
    if (!(await copyLink(item.copiar))) return;
    setCopiado(true);
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setCopiado(false), 2000);
  };

  const url = item.abrir ? getUrl(item.abrir) : null;
  const bloqueada = !item.ruta && !item.copiar && !url;
  const cls = `hub-tile ${CLASE[sec]}${suave ? " hub-suave" : ""} flex w-full ${arriba ? "items-start" : "items-center"} gap-3.5 rounded-xl text-left text-sand ${grande ? "min-h-[68px] px-4 py-3" : "min-h-[54px] px-3 py-2"} ${FOCO}`;
  const cuerpo = (
    <>
      <span className={`hub-placa ${CLASE[sec]} grid shrink-0 place-items-center ${grande ? "h-11 w-11 rounded-[10px]" : "h-[34px] w-[34px] rounded-lg"}`}>
        <IconoBBVA nombre={item.icono} size={grande ? 28 : 21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-bold leading-tight ${grande ? "text-[17px]" : "text-[15px]"}`}>
          {item.label}
          {item.pronto && <span className={ETIQUETA}>Pronto</span>}
          {url && <span className={ETIQUETA}>Otra pestaña</span>}
        </span>
        {item.desc && (
          <span className={`mt-0.5 block leading-snug ${grande ? "text-sm" : "text-[13px]"}`}>
            {copiado ? "Enlace copiado" : item.desc}
          </span>
        )}
        {bloqueada && <span className="sr-only">{item.pronto ? "Todavía no está disponible" : "Este enlace aún no está configurado"}</span>}
      </span>
      {item.copiar && <IconoBBVA nombre="copy" size={18} className="shrink-0 self-center opacity-80" />}
    </>
  );

  if (item.ruta) return <Link href={item.ruta} className={cls}>{cuerpo}</Link>;
  if (item.copiar) return <button type="button" onClick={copiar} className={cls}>{cuerpo}</button>;
  if (url) return <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{cuerpo}</a>;
  return <div aria-disabled="true" title={item.pronto ? "Todavía no está disponible" : "Este enlace aún no está configurado"} className={cls}>{cuerpo}</div>;
}
