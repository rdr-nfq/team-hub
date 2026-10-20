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
  const maxQ = Math.max(1, ...porQ);
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
  const barrasQ = qs.map((x, i) => `
      <div class="qbar ${x.n === qActualN ? "qbar--hoy" : ""}">
        <div class="qbar__col"><div class="qbar__fill" style="height:${Math.round((porQ[i] / maxQ) * 100)}%"></div></div>
        <span class="qbar__h">${fmt(porQ[i])} h</span>
        <span class="qbar__l">${esc(x.label)}</span>
      </div>`).join("");

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
  html,body{margin:0;background:var(--sand);color:var(--electric);font-family:var(--body);font-size:11px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:297mm;min-height:210mm;margin:0 auto;padding:12mm 14mm 10mm;display:flex;flex-direction:column;gap:16px;background:var(--sand)}
  header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
  .crumb{font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--gray5)}
  h1{font-family:var(--display);font-weight:700;font-size:34px;line-height:1;margin:6px 0 0}
  .lead{margin-top:6px;font-size:12px;color:var(--gray5)}
  .lead strong{color:var(--electric)}
  .bbva{height:26px;mix-blend-mode:multiply}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .kpi{border-radius:16px;padding:14px 16px;color:var(--electric);background:var(--white);border:1px solid var(--gray2)}
  .kpi--serene{background:var(--serene);border-color:var(--serene)}
  .kpi--lime{background:var(--lime);border-color:var(--lime)}
  .kpi--canary{background:var(--canary);border-color:var(--canary)}
  .kpi__l{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
  .kpi__v{font-family:var(--display);font-size:30px;line-height:1;margin-top:6px}
  .kpi__s{font-size:10px;margin-top:4px;color:var(--gray5)}
  .kpi--serene .kpi__s,.kpi--lime .kpi__s,.kpi--canary .kpi__s{color:var(--electric);opacity:.75}
  .grid{display:grid;grid-template-columns:1fr 210px;gap:16px;align-items:start}
  .card{background:var(--white);border:1px solid var(--gray2);border-radius:16px;padding:12px 14px}
  .card h2{font-family:var(--display);font-size:15px;margin:0 0 8px}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  thead{display:table-header-group}
  th{font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gray5);text-align:left;padding:6px 6px;border-bottom:1px solid var(--gray3)}
  td{padding:7px 6px;border-bottom:1px solid var(--gray2);vertical-align:middle}
  tr{page-break-inside:avoid}
  tr:last-child td{border-bottom:0}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .proy strong{display:block;font-size:11.5px}
  .sub{display:block;font-size:9px;color:var(--gray5)}
  .pend{font-weight:700;color:var(--midnight)}
  .ok{color:var(--gray5)}
  .mute{color:var(--gray3)}
  .bar{width:120px}
  .track{height:8px;border-radius:999px;background:var(--gray2);overflow:hidden;display:inline-block;width:80px;vertical-align:middle}
  .fill{height:100%;background:var(--electric);border-radius:999px}
  .pc{display:inline-block;width:32px;text-align:right;font-size:9.5px;font-weight:700;margin-left:6px;vertical-align:middle}
  th.q,td.q{background:transparent}
  .q--hoy{background:rgba(133,200,255,.28)}
  th.q--hoy{color:var(--electric)}
  .qbars{display:flex;gap:6px;align-items:flex-end;height:150px;margin-top:6px}
  .qbar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;height:100%}
  .qbar__col{width:100%;flex:1;display:flex;align-items:flex-end;background:var(--sand);border-radius:8px;overflow:hidden}
  .qbar__fill{width:100%;background:var(--serene);border-radius:8px 8px 0 0;min-height:2px}
  .qbar--hoy .qbar__fill{background:var(--electric)}
  .qbar__h{font-size:8.5px;font-weight:700;font-variant-numeric:tabular-nums}
  .qbar__l{font-size:7.5px;color:var(--gray5);text-align:center;line-height:1.1}
  .leg{margin-top:10px;font-size:9px;color:var(--gray5);line-height:1.5}
  .leg b{color:var(--electric)}
  footer{margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:16px;padding-top:8px;border-top:1px solid var(--gray3);font-size:9px;color:var(--gray5)}
  .nfq{display:flex;align-items:center;gap:8px}
  .nfq img{height:16px;mix-blend-mode:multiply}
  @media screen{body{padding:24px}.page{box-shadow:0 12px 40px rgba(7,14,70,.15);border-radius:8px}}
</style>
</head>
<body>
<div class="page">
  <header>
    <div>
      <p class="crumb">Time Report ${esc(eqCorto)} / Resumen del trimestre</p>
      <h1>Time Report · ${esc(qLabel)}</h1>
      <p class="lead"><strong>${resumen.length}</strong> proyecto${resumen.length === 1 ? "" : "s"} · <strong>${fmt(totHoras)} h</strong> planificadas · ${esc(personas)} personas · generado el ${esc(fecha)}</p>
    </div>
    <img class="bbva" src="${base}/logos/bbva-rgb.png" alt="BBVA">
  </header>

  <section class="kpis">
    <div class="kpi kpi--serene"><p class="kpi__l">Proyectos</p><p class="kpi__v">${resumen.length}</p><p class="kpi__s">con código SDATOOL en ${esc(q)}</p></div>
    <div class="kpi"><p class="kpi__l">Horas planificadas</p><p class="kpi__v">${fmt(totHoras)}</p><p class="kpi__s">total del trimestre</p></div>
    <div class="kpi kpi--lime"><p class="kpi__l">Imputadas</p><p class="kpi__v">${fmt(totImp)}</p><p class="kpi__s">${pct(totImp, totHoras)}% del total hasta hoy</p></div>
    <div class="kpi kpi--canary"><p class="kpi__l">Por imputar</p><p class="kpi__v">${fmt(totPend)}</p><p class="kpi__s">hasta el 15 del último mes</p></div>
  </section>

  <section class="grid">
    <div class="card">
      <h2>Proyectos</h2>
      <table>
        <thead><tr>
          <th>Proyecto</th><th class="num">Horas</th><th class="num">Imputadas</th><th class="num">Por imputar</th><th>Avance</th>${cabQ}
        </tr></thead>
        <tbody>${filas || `<tr><td colspan="${5 + qs.length}" class="mute">Sin proyectos en este trimestre.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Horas por quincena</h2>
      <div class="qbars">${barrasQ}</div>
      <p class="leg"><b>Imputadas</b>: horas del reparto ya pasadas a fecha de hoy (${esc(hoy)}).<br><b>Por imputar</b>: horas planificadas que quedan hasta el cierre del Q. La quincena en curso va resaltada.</p>
    </div>
  </section>

  <footer>
    <span>${esc(eqLargo)} · equipo ${esc(eqCorto)} · resumen generado desde el hub del equipo</span>
    <span class="nfq">Hecho por <img src="${base}/logos/nfq-black.png" alt="NFQ"></span>
  </footer>
</div>
<script>
(function(){var hecho=false;function ir(){if(hecho)return;hecho=true;setTimeout(function(){window.print()},400)}
if(document.readyState==="complete")ir();window.addEventListener("load",ir);setTimeout(ir,2500)})()
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
