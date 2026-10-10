// Censo en Excel con el formato que llevaba SOCODA (V3-CONSOLIDADO FERRETERIAS):
// mismas columnas y hojas de resumen, más la información que agrega la app.
import ExcelJS from 'exceljs';
import { estado } from './repositorio.js';
import { MARCAS, PROVEEDORES } from './validar.js';

const NOMBRE_MARCA = { socoda: 'SOCODA', north: 'NORTH', atlantis: 'ATLANTIS', guinovart: 'GUINOVART', aquaviva: 'AQUAVIVA',
  mundial: 'MUNDIAL', gricol: 'GRICOL', fermetal: 'FERMETAL', tramontina: 'TRAMONTINA' };
// Orden de las marcas en el Excel original.
const MARCAS_EXCEL = ['socoda', 'guinovart', 'north', 'atlantis', 'aquaviva', 'mundial', 'gricol', 'fermetal', 'tramontina'];
const NOMBRE_PROVEEDOR = { chp: 'CHP', corbeta: 'CORBETA', ferredistarco: 'FERREDISTARCO', meico: 'MEICO', ardisa: 'ARDISA',
  copricol: 'COPRICOL', construcciones: 'CONSTRUCCIONES', socoda: 'SOCODA' };
const RESULTADOS = { compro: 'Compró', no_compro: 'No compró', no_estaba: 'No estaba', pidio_visita: 'Pidió visita' };
const ROJO = 'FFE90128';

const censada = f => (f.marcas && f.marcas.length) || f.exhibidor;
const sector = f => [f.municipio, f.zona].filter(Boolean).join(' - ').toUpperCase();

function encabezado(celda, color = ROJO) {
  celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  celda.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
}

export async function libroDelCenso(pool) {
  const { ferreterias, visitas } = await estado(pool);
  const activas = ferreterias.filter(f => !f.descartada)
    // Primero las censadas (como el Excel original), luego el resto; por municipio y nombre.
    .sort((a, b) => (censada(b) ? 1 : 0) - (censada(a) ? 1 : 0) || (a.municipio || '').localeCompare(b.municipio || '', 'es') ||
      a.nombre.localeCompare(b.nombre, 'es'));
  const porFerreteria = new Map();
  visitas.forEach(v => {   // vienen de la más reciente a la más antigua
    if (!porFerreteria.has(v.ferreteriaId)) porFerreteria.set(v.ferreteriaId, []);
    porFerreteria.get(v.ferreteriaId).push(v);
  });

  const libro = new ExcelJS.Workbook();
  libro.creator = 'Ruta-viva';
  libro.created = new Date();

  // ---------- CONSOLIDADO FERRETERIAS ----------
  const h = libro.addWorksheet('CONSOLIDADO FERRETERIAS', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
  const columnas = ['', 'NOMBRE CLIENTE', 'DIRECCION', 'BARRIO', 'SECTOR', 'TELEFONO', ...MARCAS_EXCEL.map(m => NOMBRE_MARCA[m]),
    'EXHIBIDOR SI O NO', '', 'COCINAS SI O NO', '', '# REF. COCINAS', 'ATENDIDO POR', 'PROVEEDOR', 'OBSERVACIONES',
    // Lo que agrega la app:
    'OTRAS MARCAS', 'ESTADO', 'VISITAS', 'ULTIMA VISITA', 'RESULTADO', 'VENDEDOR', 'WHATSAPP', 'CATEGORIA', 'LATITUD', 'LONGITUD'];
  h.addRow(columnas);
  const sub = columnas.map(() => '');
  const exh = columnas.indexOf('EXHIBIDOR SI O NO');
  const coc = columnas.indexOf('COCINAS SI O NO');
  sub[exh] = 'SI'; sub[exh + 1] = 'NO'; sub[coc] = 'SI'; sub[coc + 1] = 'NO';
  sub[columnas.indexOf('ATENDIDO POR')] = 'POR';
  h.addRow(sub);
  h.mergeCells(1, exh + 1, 1, exh + 2);
  h.mergeCells(1, coc + 1, 1, coc + 2);
  const nuevas = columnas.indexOf('OTRAS MARCAS');
  [1, 2].forEach(f => h.getRow(f).eachCell({ includeEmpty: true }, (c, i) => encabezado(c, i > nuevas ? 'FF23292C' : ROJO)));
  h.getRow(1).height = 32;

  activas.forEach((f, i) => {
    const vs = porFerreteria.get(f.id) || [];
    const ultima = vs[0];
    const estadoTexto = f.clienteSocoda || (ultima && ultima.resultado === 'compro') ? 'Cliente'
      : ultima && ultima.resultado === 'pidio_visita' ? 'Pidió visita' : ultima ? 'Visitada' : 'Sin visitar';
    const telefonos = [f.telefono, f.whatsapp && f.whatsapp !== f.telefono ? f.whatsapp : ''].filter(Boolean).join(' / ');
    const proveedores = [...(f.proveedores || []).map(p => NOMBRE_PROVEEDOR[p] || p), f.otrosProveedores].filter(Boolean).join(' Y ');
    const marca = m => ((f.marcas || []).includes(m) ? 1 : censada(f) ? 0 : '');
    h.addRow([
      i + 1, f.nombre, f.direccion, f.barrio, sector(f), telefonos, ...MARCAS_EXCEL.map(marca),
      ['nuevo', 'antiguo'].includes(f.exhibidor) ? 1 : '', f.exhibidor === 'no' ? 1 : '',
      f.cocinas === 'si' ? 1 : '', f.cocinas === 'no' ? 1 : '', f.refCocinas == null ? '' : f.refCocinas,
      f.encargado, proveedores,
      [f.exhibidor === 'antiguo' ? 'EXHIBIDOR ANTIGUO' : '', f.observaciones].filter(Boolean).join('. '),
      f.otrasMarcas, estadoTexto, vs.length, ultima ? ultima.fecha : '', ultima ? RESULTADOS[ultima.resultado] || ultima.resultado : '',
      ultima ? ultima.vendedor : '', f.whatsapp, f.categoria, f.lat == null ? '' : f.lat, f.lng == null ? '' : f.lng
    ]);
  });
  const anchos = { 1: 5, 2: 38, 3: 28, 4: 20, 5: 22, 6: 22 };
  columnas.forEach((c, i) => { h.getColumn(i + 1).width = anchos[i + 1] || (c.length > 12 ? 18 : 11); });
  h.getColumn(columnas.indexOf('OBSERVACIONES') + 1).width = 40;
  h.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columnas.length } };

  // ---------- % FERRETERIAS SEGUN MARCA ----------
  const censadas = activas.filter(censada);
  const p = libro.addWorksheet(' % FERRETERIAS SEGUN MARCA');
  p.addRow(['FERRETERIAS', 'CENSADAS', 'CON LA MARCA', '%']);
  p.getRow(1).eachCell(c => encabezado(c));
  MARCAS_EXCEL.forEach(m => {
    const n = censadas.filter(f => f.marcas.includes(m)).length;
    p.addRow([NOMBRE_MARCA[m], censadas.length, n, censadas.length ? n / censadas.length : 0]);
  });
  p.getColumn(4).numFmt = '0%';
  p.columns.forEach((c, i) => { c.width = i ? 16 : 18; });

  // ---------- PRESENCIA SEGUN CIUDAD ----------
  const c = libro.addWorksheet('PRESENCIA  SEGUN CIUDAD');
  c.addRow(['', ...MARCAS_EXCEL.map(m => NOMBRE_MARCA[m]), 'CENSADAS']);
  c.getRow(1).eachCell(x => encabezado(x));
  const municipios = [...new Set(censadas.map(f => (f.municipio || 'SIN MUNICIPIO').toUpperCase()))].sort((a, b) => a.localeCompare(b, 'es'));
  municipios.forEach(mu => {
    const del = censadas.filter(f => (f.municipio || 'SIN MUNICIPIO').toUpperCase() === mu);
    c.addRow([mu, ...MARCAS_EXCEL.map(m => del.filter(f => f.marcas.includes(m)).length), del.length]);
  });
  const total = c.addRow(['TOTAL', ...MARCAS_EXCEL.map(m => censadas.filter(f => f.marcas.includes(m)).length), censadas.length]);
  total.font = { bold: true };
  c.columns.forEach((x, i) => { x.width = i ? 13 : 18; });

  return libro;
}

// Para que las pruebas revisen que las listas no se desalineen de validar.js.
export const LISTAS = { MARCAS, PROVEEDORES, MARCAS_EXCEL, NOMBRE_PROVEEDOR };
