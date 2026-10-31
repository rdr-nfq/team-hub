"use client";

import { Link } from "next-view-transitions";
import { useLinks } from "@/lib/links";
import IconoBBVA from "@/components/iconosBBVA";

/* Clase de color de cada sección (app/globals.css: .hub-eq, .hub-pr…). */
export const CLASE = { equipo: "hub-eq", proyectos: "hub-pr", formacion: "hub-fo", gestion: "hub-ge" };
export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-serene focus-visible:ring-offset-2 focus-visible:ring-offset-midnight";

/**
 * Acceso de la portada y de /gestion: baldosa teñida con el color de su
 * sección y placa con el icono oficial BBVA. Según el item: `ruta` (página
 * del hub), `copiar` / `abrir` (clave de links.json) o `pronto` (bloqueada).
 */
export default function Baldosa({ item, sec, grande, suave }) {
  const { getUrl, copyLink } = useLinks();
  const cls = `hub-tile ${CLASE[sec]}${suave ? " hub-suave" : ""} flex w-full items-center gap-3.5 rounded-xl text-left text-sand ${grande ? "min-h-[78px] px-4 py-3.5" : "min-h-[58px] px-3 py-2.5"} ${FOCO}`;
  const cuerpo = (
    <>
      <span className={`hub-placa ${CLASE[sec]} grid shrink-0 place-items-center ${grande ? "h-11 w-11 rounded-[10px]" : "h-[34px] w-[34px] rounded-lg"}`}>
        <IconoBBVA nombre={item.icono} size={grande ? 28 : 21} />
      </span>
      <span className="min-w-0">
        <span className={`block font-bold leading-tight ${grande ? "text-[17px]" : "text-[15px]"}`}>
          {item.label}
          {item.pronto && <span className="ml-1.5 inline-block rounded-full border border-current px-1.5 py-0.5 align-[2px] text-[11px] uppercase leading-none tracking-[0.05em]">Pronto</span>}
        </span>
        {item.desc && <span className={`mt-0.5 block leading-snug ${grande ? "text-sm" : "text-[13px]"}`}>{item.desc}</span>}
      </span>
    </>
  );

  if (item.ruta) return <Link href={item.ruta} className={cls}>{cuerpo}</Link>;
  if (item.copiar) return <button type="button" onClick={() => copyLink(item.copiar)} className={cls}>{cuerpo}</button>;
  if (item.abrir) {
    const url = getUrl(item.abrir);
    if (url) return <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{cuerpo}</a>;
  }
  return <div aria-disabled="true" title={item.pronto ? "Todavía no está disponible" : "Este enlace aún no está configurado"} className={cls}>{cuerpo}</div>;
}
