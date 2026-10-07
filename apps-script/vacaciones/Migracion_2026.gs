/**
 * ============================================================================
 *  MIGRACIÓN 2026 (una sola vez) · mismo proyecto que Codigo_Vacaciones.gs
 * ============================================================================
 *
 *  migrar2026() crea Vacas_2026 copiando TAL CUAL la pestaña "Vacaciones 2026"
 *  (códigos día a día + "Vacaciones Anteriores" y "Vacaciones Comienzo Año"
 *  del resumen) y la compara con "2026_Calendario". No modifica las pestañas
 *  antiguas: quedan como registro.
 *
 *  Además:
 *   · Email de cada persona: se busca en equipo.json por nombre.
 *   · Grupos de festivos: se deducen de los FE de cada persona. El patrón
 *     más común se llama "Madrid"; los distintos, "Revisar 1", "Revisar 2"…
 *     (renómbralos desde la web: Coordinación → Vacaciones → Festivos).
 *     Quien no tenga FE, o tenga solo parte de los de Madrid (p. ej. entró
 *     a mitad de año), va a Madrid.
 *   · Personas tachadas en el resumen -> Activo = FALSE.
 *
 *  Informe en la pestaña "Migracion_2026": personas (email, grupo, saldo nuevo
 *  frente al "Vacaciones Pendientes" antiguo) y TODAS las diferencias día a
 *  día con 2026_Calendario. Revísalo antes de dar la migración por buena.
 *
 *  Si hay que repetirla: migrar2026(true) borra Vacas_2026 y la rehace.
 *  ⚠ Antes de migrar, resuelve las solicitudes pendientes en el panel antiguo.
 * ============================================================================
 */

const MIG = {
  ORIGEN: 'Vacaciones 2026',
  COMPARAR: '2026_Calendario',
  ANIO: 2026,
  INFORME: 'Migracion_2026',
  MESES: ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']
};

function migrar2026(forzar) {
  const ss = _ss();
  const ya = ss.getSheetByName(_nombreHoja(MIG.ANIO));
  if (ya && forzar !== true) throw new Error('Ya existe ' + _nombreHoja(MIG.ANIO) + '. Para rehacerla: migrar2026(true).');
  if (ya) ss.deleteSheet(ya);

  const origen = ss.getSheetByName(MIG.ORIGEN);
  if (!origen) throw new Error('No existe la pestaña "' + MIG.ORIGEN + '".');
  const base = _migLeerBloques(origen, MIG.ANIO);          // { personas:[nombre], codigos:{nombre:{iso:cod}} }
  const resumen = _migLeerResumen(origen);                  // [{nombre, anteriores, comienzo, pendientes, tachado}]
  const comp = ss.getSheetByName(MIG.COMPARAR) ? _migLeerCalendario(ss.getSheetByName(MIG.COMPARAR), MIG.ANIO, base.personas) : null;

  // Personas: las de la rejilla mensual, con su fila del resumen.
  const equipo = _equipo();
  const filas = base.personas.map(function (nombre) {
    const r = resumen.filter(function (x) { return _mismoNombre(x.nombre, nombre); })[0] || null;
    const m = equipo.filter(function (x) { return _mismoNombre(x.nombre, nombre); })[0] || null;
    return {
      nombre: nombre, email: m ? _normEmail(m.email) : '', activo: !(r && r.tachado),
      anteriores: r ? r.anteriores : 0, dias: r ? r.comienzo : 0, pendientesAntiguo: r ? r.pendientes : '',
      enResumen: !!r, enEquipo: !!m, codigos: base.codigos[nombre] || {}
    };
  });
  // Quien está en el resumen pero no en la rejilla mensual (sin ausencias): también entra.
  resumen.forEach(function (r) {
    if (filas.some(function (f) { return _mismoNombre(f.nombre, r.nombre); })) return;
    const m = equipo.filter(function (x) { return _mismoNombre(x.nombre, r.nombre); })[0] || null;
    filas.push({ nombre: r.nombre, email: m ? _normEmail(m.email) : '', activo: !r.tachado, anteriores: r.anteriores, dias: r.comienzo,
      pendientesAntiguo: r.pendientes, enResumen: true, enEquipo: !!m, codigos: {} });
  });

  // Grupos de festivos a partir de los FE.
  const grupos = _migDeducirGrupos(filas);
  const shG = _hoja(ss, HOJA.GRUPOS, ['Grupo', 'País (ES/MX)']);
  const existentes = _leerGrupos(ss).map(function (g) { return g.grupo; });
  grupos.lista.forEach(function (g) { if (existentes.indexOf(g.grupo) < 0) shG.appendRow([g.grupo, 'ES']); });
  const shF = _hoja(ss, HOJA.FESTIVOS, ['Fecha', 'Grupo', 'Nombre'], [1]);
  const festivosYa = _leerFestivos(ss);
  grupos.lista.forEach(function (g) {
    g.fechas.forEach(function (iso) {
      if (!festivosYa.some(function (f) { return f.fecha === iso && f.grupo === g.grupo; })) shF.appendRow([iso, g.grupo, 'Festivo (migrado)']);
    });
  });
  filas.forEach(function (f) { f.grupo = grupos.dePersona[f.nombre] || ''; });

  _crearRejilla(ss, MIG.ANIO, filas);
  _hojaSolicitudes(ss);

  // Informe.
  const diffs = comp ? _migDiferencias(filas, comp) : [];
  _migInforme(ss, filas, grupos, comp, diffs);
  Logger.log('Vacas_' + MIG.ANIO + ' creada con ' + filas.length + ' personas. Diferencias con ' + MIG.COMPARAR + ': ' + diffs.length + '. Revisa la pestaña ' + MIG.INFORME + '.');
  return { personas: filas.length, diferencias: diffs.length };
}

function _migMes(v) {
  if (v instanceof Date) return v.getMonth();
  const s = String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  return MIG.MESES.indexOf(s);
}
function _migNumDia(v) {
  if (v instanceof Date) return v.getDate();
  const n = parseInt(String(v || '').trim(), 10);
  return n >= 1 && n <= 31 && String(n) === String(v).trim().replace(/\.0+$/, '') ? n : -1;
}
function _migCodigo(v) {
  const c = String(v || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : '';
}

/** "Vacaciones 2026": bloques por mes (nombre del mes + fila de días 1..31, una fila por persona). */
function _migLeerBloques(sh, anio) {
  const data = sh.getDataRange().getValues();
  const personas = [], codigos = {};
  for (let r = 0; r < data.length; r++) {
    let mes = -1, colNombre = -1;
    for (let c = 0; c < Math.min(10, data[r].length); c++) {
      const m = _migMes(data[r][c]);
      if (m >= 0) { mes = m; colNombre = c; break; }
    }
    if (mes < 0) continue;
    // Fila de días (la misma del mes o hasta 3 por debajo).
    let filaDias = -1;
    for (let dr = r; dr <= r + 3 && dr < data.length; dr++) {
      if (data[dr].filter(function (v) { return _migNumDia(v) > 0; }).length >= 28) { filaDias = dr; break; }
    }
    if (filaDias < 0) continue;
    const colDia = {};
    data[filaDias].forEach(function (v, c) { const n = _migNumDia(v); if (n > 0 && c > colNombre && colDia[n] === undefined) colDia[n] = c; });
    for (let rr = filaDias + 1; rr < data.length; rr++) {
      const nombre = String(data[rr][colNombre] || '').trim();
      if (!nombre || _migMes(nombre) >= 0) break;
      if (nombre.length < 4) continue;
      let canon = personas.filter(function (p) { return _mismoNombre(p, nombre); })[0];
      if (!canon) { canon = nombre; personas.push(nombre); codigos[nombre] = {}; }
      Object.keys(colDia).forEach(function (n) {
        const iso = anio + '-' + _pad(mes + 1) + '-' + _pad(Number(n));
        if (Number(iso.slice(8, 10)) !== Number(n) || _isoDeUtc(_utc(iso)) !== iso) return; // 30 feb y similares
        const cod = _migCodigo(data[rr][colDia[n]]);
        if (cod) codigos[canon][iso] = cod;
      });
    }
    r = filaDias;
  }
  return { personas: personas, codigos: codigos };
}

/** Resumen de "Vacaciones 2026": Persona · Vacaciones Anteriores · Comienzo Año · Pendientes (+ tachados). */
function _migLeerResumen(sh) {
  const data = sh.getDataRange().getValues();
  let filaCab = -1, cNom = -1, cAnt = -1, cCom = -1, cPend = -1;
  for (let r = 0; r < Math.min(40, data.length) && filaCab < 0; r++) {
    for (let c = 0; c < data[r].length; c++) {
      const t = _norm(data[r][c]);
      if (t === 'persona') { cNom = c; filaCab = r; }
    }
  }
  if (filaCab < 0) return [];
  for (let r = filaCab; r <= filaCab + 1; r++) {
    for (let c = cNom; c < data[r].length; c++) {
      const t = _norm(data[r][c]);
      if (t.indexOf('anteriores') >= 0 && cAnt < 0) cAnt = c;
      if (t.indexOf('comienzo') >= 0 && cCom < 0) cCom = c;
      if (t.indexOf('pendientes') >= 0 && cPend < 0) cPend = c;
    }
  }
  const lineas = sh.getRange(1, cNom + 1, data.length, 1).getFontLines();
  const out = [];
  for (let r = filaCab + 1; r < data.length; r++) {
    const nombre = String(data[r][cNom] || '').trim();
    if (!nombre) { if (out.length) break; else continue; }
    if (_norm(nombre) === 'persona') continue;
    out.push({
      nombre: nombre,
      anteriores: cAnt >= 0 ? Number(data[r][cAnt]) || 0 : 0,
      comienzo: cCom >= 0 ? Number(data[r][cCom]) || 0 : 0,
      pendientes: cPend >= 0 ? data[r][cPend] : '',
      tachado: lineas[r][0] === 'line-through'
    });
  }
  return out;
}

/** "2026_Calendario": fila de meses + fila de días; una fila por persona. -> {nombre:{iso:cod}} */
function _migLeerCalendario(sh, anio, nombres) {
  const data = sh.getDataRange().getValues();
  let filaMeses = -1, filaDias = -1;
  for (let r = 0; r < Math.min(15, data.length) && filaMeses < 0; r++) {
    if (data[r].some(function (v) { return _migMes(v) >= 0; })) filaMeses = r;
  }
  if (filaMeses < 0) return {};
  for (let r = filaMeses; r <= filaMeses + 3 && r < data.length; r++) {
    if (data[r].filter(function (v) { return _migNumDia(v) > 0; }).length >= 28) { filaDias = r; break; }
  }
  if (filaDias < 0) return {};
  const colIso = {};
  let mes = -1;
  for (let c = 0; c < data[0].length; c++) {
    const m = _migMes(data[filaMeses][c]);
    if (m >= 0) mes = m;
    const v = data[filaDias][c];
    let dia = _migNumDia(v);
    if (v instanceof Date) mes = v.getMonth();
    if (mes >= 0 && dia > 0) colIso[c] = anio + '-' + _pad(mes + 1) + '-' + _pad(dia);
  }
  const out = {};
  for (let r = filaDias + 1; r < data.length; r++) {
    let nombre = '';
    for (let c = 0; c < 5; c++) {
      const v = String(data[r][c] || '').trim();
      const canon = nombres.filter(function (n) { return v && _mismoNombre(n, v); })[0];
      if (canon) { nombre = canon; break; }
    }
    if (!nombre || out[nombre]) continue;
    out[nombre] = {};
    Object.keys(colIso).forEach(function (c) {
      const cod = _migCodigo(data[r][c]);
      if (cod) out[nombre][colIso[c]] = cod;
    });
  }
  return out;
}

function _migDeducirGrupos(filas) {
  const clave = function (f) { return Object.keys(f.codigos).filter(function (iso) { return f.codigos[iso] === 'FE'; }).sort(); };
  const conteo = {};
  filas.forEach(function (f) { const k = clave(f).join(','); if (k) conteo[k] = (conteo[k] || 0) + 1; });
  const claves = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
  const lista = [], dePersona = {}, notas = {};
  if (!claves.length) return { lista: [], dePersona: {}, notas: {} };
  const madrid = claves[0].split(',');
  lista.push({ grupo: 'Madrid', fechas: madrid });
  let n = 0;
  const otros = {};
  filas.forEach(function (f) {
    const fe = clave(f);
    if (!fe.length) { dePersona[f.nombre] = 'Madrid'; notas[f.nombre] = 'Sin FE: asignado a Madrid'; return; }
    if (fe.join(',') === claves[0]) { dePersona[f.nombre] = 'Madrid'; return; }
    if (fe.every(function (iso) { return madrid.indexOf(iso) >= 0; })) {
      dePersona[f.nombre] = 'Madrid'; notas[f.nombre] = 'Tiene ' + fe.length + ' de los ' + madrid.length + ' FE de Madrid: asignado a Madrid'; return;
    }
    const k = fe.join(',');
    if (!otros[k]) { otros[k] = 'Revisar ' + (++n); lista.push({ grupo: otros[k], fechas: fe }); }
    dePersona[f.nombre] = otros[k];
    notas[f.nombre] = 'FE distintos a Madrid: grupo "' + otros[k] + '" (renómbralo)';
  });
  return { lista: lista, dePersona: dePersona, notas: notas };
}

function _migDiferencias(filas, comp) {
  const out = [];
  filas.forEach(function (f) {
    const b = comp[f.nombre];
    if (!b) return;
    const fechas = {};
    Object.keys(f.codigos).forEach(function (k) { fechas[k] = 1; });
    Object.keys(b).forEach(function (k) { fechas[k] = 1; });
    Object.keys(fechas).sort().forEach(function (iso) {
      const x = f.codigos[iso] || '', y = b[iso] || '';
      if (x !== y) out.push([f.nombre, iso, x || '(vacío)', y || '(vacío)', [_finde(iso) ? 'fin de semana' : '', (x === 'FE' || y === 'FE') ? 'festivo' : ''].filter(Boolean).join(' · ')]);
    });
  });
  return out;
}

function _migInforme(ss, filas, grupos, comp, diffs) {
  let sh = ss.getSheetByName(MIG.INFORME);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(MIG.INFORME);
  const filasPersonas = filas.map(function (f) {
    const quedan = f.anteriores + f.dias - Object.keys(f.codigos).filter(function (k) { return f.codigos[k] === 'VA'; }).length;
    const avisos = [];
    if (!f.email) avisos.push('Sin email (no está en equipo.json): rellénalo en la columna B');
    if (!f.enResumen) avisos.push('No está en el resumen: días a 0');
    if (comp && !comp[f.nombre]) avisos.push('No aparece en ' + MIG.COMPARAR);
    if (grupos.notas[f.nombre]) avisos.push(grupos.notas[f.nombre]);
    if (f.pendientesAntiguo !== '' && Number(f.pendientesAntiguo) !== quedan) avisos.push('Saldo distinto al antiguo');
    return [f.nombre, f.email, f.grupo, f.activo ? 'Sí' : 'No', f.anteriores, f.dias, quedan, f.pendientesAntiguo, avisos.join(' · ')];
  });
  let r = 1;
  sh.getRange(r, 1).setValue('Migración ' + MIG.ORIGEN + ' → ' + _nombreHoja(MIG.ANIO) + ' · ' + new Date().toLocaleString('es-ES')).setFontWeight('bold').setFontSize(13);
  r += 2;
  const cab = ['Persona', 'Email', 'Grupo', 'Activo', 'Días año anterior', 'Días del año', 'Quedan (nuevo)', 'Pendientes (antiguo)', 'Avisos'];
  sh.getRange(r, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#E2E6EA');
  if (filasPersonas.length) sh.getRange(r + 1, 1, filasPersonas.length, cab.length).setValues(filasPersonas);
  r += filasPersonas.length + 3;
  sh.getRange(r, 1).setValue('Grupos de festivos deducidos').setFontWeight('bold');
  r++;
  grupos.lista.forEach(function (g) { sh.getRange(r++, 1, 1, 2).setValues([[g.grupo, g.fechas.length + ' festivos: ' + g.fechas.join(', ')]]); });
  r += 2;
  sh.getRange(r, 1).setValue(comp ? 'Diferencias con ' + MIG.COMPARAR + ' (' + diffs.length + ')' : 'No existe ' + MIG.COMPARAR + ': sin comparación').setFontWeight('bold');
  r++;
  if (diffs.length) {
    sh.getRange(r, 1, 1, 5).setValues([['Persona', 'Fecha', MIG.ORIGEN + ' (migrado)', MIG.COMPARAR, 'Nota']]).setFontWeight('bold').setBackground('#E2E6EA');
    sh.getRange(r + 1, 1, diffs.length, 5).setValues(diffs);
  }
  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(9, 520);
  sh.setFrozenRows(0);
}
