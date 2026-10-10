// Estadísticas del equipo para la pantalla Resumen. Lógica pura (se prueba en Node).
// La misma cuenta vive en web/db.js (estadisticas): si se cambia una, se cambia la otra.
import { LINEAS, RESULTADOS, censoDe, pendientesDe, comparar, compararTexto, fechaHaceDias, grupoDe, hoyISO, normaliza, limpiar } from './reglas.js';

// dias: 1 = hoy, 7, 30, 0 = todo. vendedor: '' = todo el equipo.
export const PERIODOS = [[1, 'Hoy'], [7, '7 días'], [30, '30 días'], [0, 'Todo']];
const DIAS_GRAFICA = 30;   // con "Todo", la gráfica muestra los últimos 30 días

const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
const ORDEN = (a, b) => b.visitas - a.visitas || comparar(a.clave, b.clave);

export function estadisticas(datos, { dias = 30, vendedor = '' } = {}, ahora = new Date()) {
  const hoy = hoyISO(ahora);
  const desde = dias ? fechaHaceDias(dias - 1, ahora) : '0000-00-00';
  const censo = censoDe(datos, ahora);
  const porId = new Map(censo.map(f => [f.id, f]));
  const activas = censo.filter(f => f.estado !== 'descartada');
  // Mismo criterio que Hoy y la ruta (pendientesDe).
  const pendientes = new Set(pendientesDe(censo).map(f => f.id));
  const delVendedor = v => !vendedor || normaliza(v.vendedor) === normaliza(vendedor);
  const visitas = datos.visitas.filter(v => v.fecha >= desde && v.fecha <= hoy && delVendedor(v));
  const compras = visitas.filter(v => v.resultado === 'compro');
  const visitadas = new Set(visitas.map(v => v.ferreteriaId));

  // Resultados, en el orden del formulario.
  const resultados = Object.keys(RESULTADOS).map(k => ({
    clave: k, texto: RESULTADOS[k], visitas: visitas.filter(v => v.resultado === k).length
  }));

  // Por vendedor: visitas, compras, efectividad y cuántas ferreterías distintas.
  const vendedores = new Map();
  visitas.forEach(v => {
    // "Ana" y "ana " son la misma persona: se agrupa sin mayúsculas ni tildes.
    const nombre = limpiar(v.vendedor) || 'Sin nombre';
    const k = normaliza(nombre);
    if (!vendedores.has(k)) vendedores.set(k, { clave: nombre, visitas: 0, compras: 0, ferreterias: new Set() });
    const x = vendedores.get(k);
    x.visitas++;
    if (v.resultado === 'compro') x.compras++;
    x.ferreterias.add(v.ferreteriaId);
  });
  const porVendedor = [...vendedores.values()]
    .map(x => ({ clave: x.clave, visitas: x.visitas, compras: x.compras, efectividad: pct(x.compras, x.visitas), ferreterias: x.ferreterias.size }))
    .sort(ORDEN);

  // Por zona (o municipio si no tiene zona): cobertura del censo y pendientes.
  const grupos = new Map();
  const grupo = k => {
    if (!grupos.has(k)) grupos.set(k, { clave: k, activas: 0, visitadas: 0, visitas: 0, compras: 0, pendientes: 0 });
    return grupos.get(k);
  };
  activas.forEach(f => {
    const g = grupo(grupoDe(f));
    g.activas++;
    if (visitadas.has(f.id)) g.visitadas++;
    if (pendientes.has(f.id)) g.pendientes++;
  });
  visitas.forEach(v => {
    const f = porId.get(v.ferreteriaId);
    if (!f || f.estado === 'descartada') return;
    const g = grupo(grupoDe(f));
    g.visitas++;
    if (v.resultado === 'compro') g.compras++;
  });
  const porGrupo = [...grupos.values()]
    .map(g => Object.assign(g, { cobertura: pct(g.visitadas, g.activas), efectividad: pct(g.compras, g.visitas) }))
    .sort((a, b) => b.activas - a.activas || comparar(a.clave, b.clave));

  // Líneas que manejan las ferreterías visitadas (lo que se marcó en cada visita).
  const lineas = Object.keys(LINEAS).map(k => ({
    clave: k, texto: LINEAS[k], visitas: visitas.filter(v => (v.lineas || []).includes(k)).length
  })).sort((a, b) => b.visitas - a.visitas);

  // Competencia: marcas mencionadas (sin distinguir mayúsculas ni tildes).
  const marcas = new Map();
  visitas.forEach(v => {
    const t = limpiar(v.competencia);
    if (!t) return;
    const k = normaliza(t);
    if (!marcas.has(k)) marcas.set(k, { clave: t, visitas: 0 });
    marcas.get(k).visitas++;
  });
  const competencia = [...marcas.values()].sort(ORDEN).slice(0, 8);

  // Actividad por día (la gráfica). Con "Hoy" no hay gráfica.
  const nDias = dias === 1 ? 0 : (dias || DIAS_GRAFICA);
  const porDia = [];
  for (let i = nDias - 1; i >= 0; i--) {
    const fecha = fechaHaceDias(i, ahora);
    const delDia = visitas.filter(v => v.fecha === fecha);
    porDia.push({ fecha, visitas: delDia.length, compras: delDia.filter(v => v.resultado === 'compro').length });
  }

  // Clientes nuevos: su primera compra (de cualquier vendedor) cae en el periodo.
  const clientesNuevos = [];
  censo.forEach(f => {
    const primera = f.visitas.filter(v => v.resultado === 'compro').sort((a, b) => compararTexto(a.fecha, b.fecha))[0];
    if (primera && primera.fecha >= desde && primera.fecha <= hoy && delVendedor(primera)) {
      clientesNuevos.push({ id: f.id, nombre: f.nombre, grupo: grupoDe(f), fecha: primera.fecha, vendedor: primera.vendedor });
    }
  });
  clientesNuevos.sort((a, b) => compararTexto(b.fecha, a.fecha));

  // Para hacer: las que pidieron visita (la más antigua primero).
  const seguimiento = activas.filter(f => f.estado === 'seguimiento')
    .map(f => ({ id: f.id, nombre: f.nombre, grupo: grupoDe(f), fecha: f.ultima.fecha, vendedor: f.ultima.vendedor }))
    .sort((a, b) => compararTexto(a.fecha, b.fecha));

  // Cobertura: solo cuentan las activas (una descartada pudo visitarse antes de descartarla).
  const visitadasActivas = activas.filter(f => visitadas.has(f.id)).length;

  return {
    desde: dias ? desde : '',
    hasta: hoy,
    visitas: visitas.length,
    compras: compras.length,
    efectividad: pct(compras.length, visitas.length),
    ferreteriasVisitadas: visitadas.size,
    visitadasActivas,
    activas: activas.length,
    cobertura: pct(visitadasActivas, activas.length),
    pendientes: pendientes.size,
    nuncaVisitadas: activas.filter(f => !f.visitas.length).length,
    descartadas: censo.length - activas.length,
    clientes: activas.filter(f => f.estado === 'cliente').length,
    resultados,
    porVendedor,
    porGrupo,
    lineas,
    competencia,
    porDia,
    clientesNuevos,
    seguimiento
  };
}

// Nombres de vendedor que aparecen en las visitas, para el filtro.
export function vendedoresDe(datos) {
  const nombres = new Map();
  datos.visitas.forEach(v => {
    const t = limpiar(v.vendedor);
    if (t && !nombres.has(normaliza(t))) nombres.set(normaliza(t), t);
  });
  return [...nombres.values()].sort(comparar);
}
