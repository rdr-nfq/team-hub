import { isT, RE_ID_TRASPASO } from "./backend";

/**
 * Validador de preparación (portado 1:1 de actualizarValidador del legacy).
 * `cab` = valores actuales de cabecera en edición ({ crq, instTecnica }).
 * Devuelve { items: [{ ok, txt }], todoCorrecto }.
 */
export function computeValidador(E, cab, tempOrden) {
  const proyectos = E?.proyectos || [];

  const crqOk = String(cab?.crq || "").trim() !== "";
  const instOk = !!cab?.instTecnica;
  const proyOk = proyectos.length > 0;
  const compOk = proyOk && !proyectos.some((p) => (p.componentes || []).length === 0);

  const pOk = proyOk && !proyectos.some((p) => !isT(p.ok));
  const relOk = compOk && !proyectos.some((p) => p.componentes.some((c) => !isT(c.release)));

  // ─── Todos los componentes marcados como "Probado" ───
  let compTotal = 0;
  let compProbados = 0;
  proyectos.forEach((p) =>
    (p.componentes || []).forEach((c) => {
      compTotal++;
      if (isT(c.probado)) compProbados++;
    })
  );
  const probOk = compOk && compProbados === compTotal;
  const probMsg = probOk
    ? "Todos los componentes marcados como Probado"
    : `Faltan componentes por probar (${compProbados}/${compTotal})`;

  // ─── ID Traspaso: todos los proyectos deben tener uno válido ───
  const proysSinIdT = proyectos
    .filter((p) => {
      const t = (p.idTraspaso || "").trim();
      return !t || !RE_ID_TRASPASO.test(t);
    })
    .map((p) => p.nombre);
  const idTraspasoOk = proyOk && proysSinIdT.length === 0;

  // ─── Regla rdrRules / Streetref con excepciones (Listado Rules) ───
  const listadoRulesUpper = (E?.listadoRules || []).map((r) => String(r).trim().toUpperCase()).filter(Boolean);
  const allComps = [];
  proyectos.forEach((p) => (p.componentes || []).forEach((c) => allComps.push(c)));

  let rdrRulesNoExentas = 0;
  let hasStreetref = false;
  allComps.forEach((c) => {
    const nombre = c.nombre || "";
    if (nombre.toLowerCase().includes("streetref")) hasStreetref = true;
    const idx = nombre.indexOf("rdrRules/");
    if (idx === -1) return;
    const ruleName = nombre.substring(idx + "rdrRules/".length).trim();
    const exenta =
      ruleName &&
      listadoRulesUpper.some((r) => ruleName.toUpperCase() === r || ruleName.toUpperCase().startsWith(r));
    if (!exenta) rdrRulesNoExentas++;
  });
  const ruleRdrOk = rdrRulesNoExentas === 0 || hasStreetref;
  const rdrRuleMsg = ruleRdrOk
    ? rdrRulesNoExentas === 0
      ? "Sin rdrRules que requieran Streetref (o todas exentas)"
      : "Componente Streetref incluido (regla rdrRules)"
    : "Falta 'Streetref' (hay " + rdrRulesNoExentas + " rdrRules no exenta(s))";

  // ─── Secuencia: PARADA antes de ARRANQUE + todos los códigos colocados ───
  let seqOk = true;
  let msgSeq = "Orden del pase diseñado (parada, componentes y arranque)";
  if (tempOrden && tempOrden.length >= 2) {
    const oStrings = tempOrden.map((o) => o.elemento.toUpperCase());
    const idxP = oStrings.findIndex((o) => o.includes("PARADA"));
    const idxA = oStrings.findIndex((o) => o.includes("ARRANQUE"));
    if (idxP === -1 || idxA === -1) {
      seqOk = false;
      msgSeq = "Falta añadir PARADA o ARRANQUE";
    } else if (idxP > idxA) {
      seqOk = false;
      msgSeq = "La PARADA debe ir antes del ARRANQUE";
    } else {
      const cods = new Set();
      allComps.forEach((c) => {
        if (c.codigo && c.codigo.trim() !== "" && c.codigo.trim() !== "-") cods.add(c.codigo.trim().toUpperCase());
      });
      const faltan = [];
      cods.forEach((cod) => {
        const idxC = oStrings.findIndex((o) => o.includes(cod));
        if (idxC === -1) {
          faltan.push(cod);
          return;
        }
        // Excepción: los REMEDYs (REQ-) pueden ir ANTES de la PARADA;
        // solo se exige que estén antes del ARRANQUE.
        const esRemedyCod = /^REQ-?\d/i.test(cod);
        if (esRemedyCod) {
          if (idxC >= idxA) faltan.push(cod);
        } else {
          // Despliegues y aperiódicos pueden ir antes O después del ARRANQUE;
          // solo se exige que vayan después de la PARADA.
          if (idxC <= idxP) faltan.push(cod);
        }
      });
      if (faltan.length > 0) {
        seqOk = false;
        msgSeq = "Faltan paquetes o están antes de la PARADA: " + faltan.join(", ");
      }
    }
  } else {
    seqOk = false;
    msgSeq = "Diseña el orden del pase (falta parada y arranque)";
  }

  const items = [];
  const it = (cond, txt, id) => items.push({ ok: cond, txt, id });
  it(crqOk, "CRQ general asignado en cabecera", "crq");
  it(instOk, "Instalación técnica marcada en cabecera", "inst");
  it(proyOk, "Al menos 1 proyecto añadido", "proy");
  if (proyOk) it(compOk, "Todos los proyectos tienen componentes", "proycomp");
  if (proyOk) it(pOk, "Todos los proyectos tienen el check 'OK Proyecto'", "okp");
  if (proyOk)
    it(
      idTraspasoOk,
      idTraspasoOk
        ? "Todos los proyectos tienen ID de Traspaso (YYYY-…)"
        : "Falta ID de Traspaso en: " + proysSinIdT.join(", "),
      "tras"
    );
  if (compOk) it(relOk, "Todas las historias de usuario tienen el 'tech-kytl' informado", "rel");
  if (compOk) it(probOk, probMsg, "prob");
  it(ruleRdrOk, rdrRuleMsg, "street");
  it(seqOk, msgSeq, "orden");

  const todoCorrecto =
    crqOk && instOk && proyOk && compOk && pOk && relOk && probOk && idTraspasoOk && ruleRdrOk && seqOk;
  return { items, todoCorrecto, rdrRulesNoExentas, hasStreetref, proysSinIdT };
}
