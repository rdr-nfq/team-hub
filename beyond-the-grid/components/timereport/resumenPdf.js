/* Resumen del Time Report en PDF · formato BBVA (infografía).
   Genera un HTML autocontenido con la identidad de marca (tokens de
   .claude-knowledge: Sand / Electric Blue / Serene, Source Serif 4 + Lato,
   co-branding BBVA + NFQ) y lo abre en una pestaña que lanza "Imprimir →
   Guardar como PDF". SIN la columna de horas incurridas (dato interno):
   solo horas planificadas, imputadas y por imputar, con desglose por quincena. */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("es-ES");
const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

/* Devuelve el HTML completo del resumen (también se usa en las pruebas). */
export function htmlResumen({ q, resumen, qs, qActualN, hoy, personas, equipo }) {
  const eqCorto = (equipo && equipo.nombre) || "RDR";
  const eqLargo = (equipo && equipo.largo) || "Reference Data Repository";
  const base = typeof window !== "undefined" ? window.location.origin + "/team-hub" : "/team-hub";
  const totHoras = resumen.reduce((a, p) => a + Number(p.horas || 0), 0);
  const totImp = resumen.reduce((a, p) => a + Number(p.imputadas || 0), 0);
  const totPend = resumen.reduce((a, p) => a + Number(p.pendientes || 0), 0);
  const porQ = [0, 0, 0, 0, 0, 0];
  resumen.forEach((p) => (p.porQ || []).forEach((h, i) => (porQ[i] += Number(h || 0))));
    const fecha = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  const m = /^(\d{4})Q([1-4])$/.exec(q);
  const qLabel = m ? `${m[1]} · Q${m[2]}` : q;

  const filas = resumen
    .map((p) => {
      const pc = pct(p.imputadas, p.horas);
      const celdas = (p.porQ || []).map((h, i) =>
        `<td class="num q ${i + 1 === qActualN ? "q--hoy" : ""}">${h ? fmt(h) : "<span class='mute'>·</span>"}</td>`
      ).join("");
      return `<tr>
        <td class="proy"><strong>${esc(p.nombre)}</strong><span class="sub">${esc(p.sdatool)}${p.feature ? " · " + esc(p.feature) : ""}</span></td>
        <td class="num">${fmt(p.horas)}</td>
        <td class="num">${fmt(p.imputadas)}</td>
        <td class="num ${p.pendientes > 0 ? "pend" : "ok"}">${fmt(p.pendientes)}</td>
        <td class="bar"><div class="track"><div class="fill" style="width:${pc}%"></div></div><span class="pc">${pc}%</span></td>
        ${celdas}
      </tr>`;
    })
    .join("");

  const cabQ = qs.map((x) => `<th class="num q ${x.n === qActualN ? "q--hoy" : ""}">${esc(x.label)}</th>`).join("");
  // Fila de totales: sustituye al gráfico de horas por quincena.
  const totQ = qs.map((x, i) => `<td class="num q ${x.n === qActualN ? "q--hoy" : ""}">${porQ[i] ? fmt(porQ[i]) : "<span class='mute'>·</span>"}</td>`).join("");
  const pcTot = pct(totImp, totHoras);

  /* UNA hoja A4 apaisada, con los proyectos como protagonistas: tabla a todo
     el ancho nada más empezar; las cifras, en una franja pequeña. Si hay
     tantos proyectos que no caben, el script de abajo reduce la escala de
     todo (sin cortar la tabla en dos hojas). */
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Resumen_TimeReport_${esc(eqCorto.replace(/\s+/g, ""))}_${esc(q)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,700&family=Lato:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root{--electric:#001391;--serene:#85C8FF;--sand:#F7F8F8;--white:#FFFFFF;--gray2:#E2E6EA;--gray3:#CAD1D8;--gray5:#46536D;--midnight:#070E46;
        --canary:#FFE761;--lime:#88E783;--aqua:#8BE1E9;--mandarin:#FFB56B;
        --display:"Source Serif 4",Georgia,"Times New Roman",serif;--body:"Lato","Helvetica Neue",Arial,sans-serif}
  @page{size:A4 landscape;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--sand);color:var(--electric);font-family:var(--body);font-size:11px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:297mm;height:210mm;margin:0 auto;padding:10mm 12mm 8mm;overflow:hidden;background:var(--sand)}
  .fit{display:flex;flex-direction:column;gap:12px;transform-origin:top left}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .crumb{margin:0;font-size:8.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gray5)}
  h1{font-family:var(--display);font-weight:700;font-size:26px;line-height:1;margin:5px 0 0}
  .lead{margin:5px 0 0;font-size:11px;color:var(--gray5)}
  .lead strong{color:var(--electric)}
  .bbva{height:24px;mix-blend-mode:multiply}
  .kpis{display:flex;gap:8px}
  .kpi{display:flex;align-items:baseline;gap:8px;border-radius:999px;padding:5px 14px;background:var(--white);border:1px solid var(--gray2)}
  .kpi--serene{background:var(--serene);border-color:var(--serene)}
  .kpi--lime{background:var(--lime);border-color:var(--lime)}
  .kpi--canary{background:var(--canary);border-color:var(--canary)}
  .kpi__l{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
  .kpi__v{font-family:var(--display);font-size:16px;line-height:1}
  .kpi__s{font-size:9px;opacity:.75}
  .card{background:var(--white);border:1px solid var(--gray2);border-radius:14px;padding:8px 12px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  th{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gray5);text-align:left;padding:5px 6px;border-bottom:1px solid var(--gray3)}
  td{padding:5px 6px;border-bottom:1px solid var(--gray2);vertical-align:middle}
  tbody tr:last-child td{border-bottom:0}
  tfoot td{border-top:2px solid var(--electric);border-bottom:0;font-weight:700;padding-top:6px}
  .num{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}
  .proy{width:34%}
  .proy strong{font-size:11px}
  .sub{margin-left:8px;font-size:9px;color:var(--gray5);white-space:nowrap}
  .pend{font-weight:700;color:var(--midnight)}
  .ok{color:var(--gray5)}
  .mute{color:var(--gray3)}
  .bar{width:110px;white-space:nowrap}
  .track{height:7px;border-radius:999px;background:var(--gray2);overflow:hidden;display:inline-block;width:64px;vertical-align:middle}
  .fill{height:100%;background:var(--electric);border-radius:999px}
  .pc{display:inline-block;width:30px;text-align:right;font-size:9px;font-weight:700;margin-left:4px;vertical-align:middle}
  .q--hoy{background:rgba(133,200,255,.28)}
  th.q--hoy{color:var(--electric)}
  footer{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:6px;border-top:1px solid var(--gray3);font-size:8.5px;color:var(--gray5)}
  footer b{color:var(--electric)}
  .nfq{display:flex;align-items:center;gap:8px;white-space:nowrap}
  .nfq img{height:16px;mix-blend-mode:multiply}
  @media screen{body{padding:24px}.page{box-shadow:0 12px 40px rgba(7,14,70,.15);border-radius:8px}}
  @media print{html,body{width:297mm;height:210mm;overflow:hidden}}
</style>
</head>
<body>
<div class="page"><div class="fit">
  <header>
    <div>
      <p class="crumb">Time Report ${esc(eqCorto)} / Resumen del trimestre</p>
      <h1>Time Report · ${esc(qLabel)}</h1>
      <p class="lead"><strong>${resumen.length}</strong> proyecto${resumen.length === 1 ? "" : "s"} · <strong>${fmt(totHoras)} h</strong> planificadas · ${esc(personas)} personas · generado el ${esc(fecha)}</p>
    </div>
    <img class="bbva" src="${base}/logos/bbva-rgb.png" alt="BBVA">
  </header>

  <section class="kpis">
    <div class="kpi kpi--serene"><span class="kpi__l">Proyectos</span><span class="kpi__v">${resumen.length}</span></div>
    <div class="kpi"><span class="kpi__l">Planificadas</span><span class="kpi__v">${fmt(totHoras)} h</span></div>
    <div class="kpi kpi--lime"><span class="kpi__l">Imputadas</span><span class="kpi__v">${fmt(totImp)} h</span><span class="kpi__s">${pcTot}%</span></div>
    <div class="kpi kpi--canary"><span class="kpi__l">Por imputar</span><span class="kpi__v">${fmt(totPend)} h</span></div>
  </section>

  <section class="card">
    <table>
      <thead><tr>
        <th>Proyecto</th><th class="num">Horas</th><th class="num">Imputadas</th><th class="num">Por imputar</th><th>Avance</th>${cabQ}
      </tr></thead>
      <tbody>${filas || `<tr><td colspan="${5 + qs.length}" class="mute">Sin proyectos en este trimestre.</td></tr>`}</tbody>
      ${resumen.length ? `<tfoot><tr>
        <td>Total</td><td class="num">${fmt(totHoras)}</td><td class="num">${fmt(totImp)}</td><td class="num">${fmt(totPend)}</td>
        <td class="bar"><div class="track"><div class="fill" style="width:${pcTot}%"></div></div><span class="pc">${pcTot}%</span></td>${totQ}
      </tr></tfoot>` : ""}
    </table>
  </section>

  <footer>
    <span><b>Imputadas</b>: horas del reparto ya pasadas a fecha de hoy (${esc(hoy)}) · <b>Por imputar</b>: lo que queda hasta el cierre del Q · quincena en curso resaltada · ${esc(eqLargo)}</span>
    <span class="nfq">Hecho por <img src="${base}/logos/nfq-black.png" alt="NFQ"></span>
  </footer>
</div></div>
<script>
(function(){
  // Encaja todo en la hoja: si no cabe, se reduce la escala y se ensancha en
  // proporción para aprovechar el ancho (al ensanchar, los nombres largos
  // ocupan menos líneas). Se busca la escala MÁS GRANDE con la que cabe.
  function encajar(){
    var page=document.querySelector(".page"),fit=document.querySelector(".fit");
    var cs=getComputedStyle(page);
    var w=page.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
    var h=page.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
    function cabe(s){fit.style.width=(w/s)+"px";fit.style.minHeight=(h/s)+"px";return fit.scrollHeight<=h/s+0.5}
    var s=1;
    if(!cabe(1)){
      var lo=0.2,hi=1;
      for(var i=0;i<14;i++){var m=(lo+hi)/2;if(cabe(m))lo=m;else hi=m}
      s=lo;cabe(s);
    }
    fit.style.transform=s<1?"scale("+s+")":"";
  }
  var hecho=false;
  function ir(){if(hecho)return;hecho=true;encajar();setTimeout(function(){encajar();window.print()},400)}
  window.addEventListener("beforeprint",encajar);
  if(document.readyState==="complete")ir();window.addEventListener("load",ir);setTimeout(ir,2500);
})()
</script>
</body>
</html>`;
}

/* Abre el resumen en una pestaña nueva; el navegador lanza el diálogo de
   imprimir (elegir "Guardar como PDF"). Se abre SÍNCRONAMENTE en el click
   para que no lo bloquee el navegador. El diálogo salta al cargar (o a los
   2,5 s como respaldo, por si Google Fonts está bloqueado en la red
   corporativa y el evento load no llega). */
export function abrirResumenPdf(args) {
  // Blob URL (no document.write): navegación real, con su evento load y el
  // <title> como nombre del PDF al guardar.
  const url = URL.createObjectURL(new Blob([htmlResumen(args)], { type: "text/html;charset=utf-8" }));
  const w = window.open(url, "_blank");
  if (!w) { URL.revokeObjectURL(url); return false; }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
