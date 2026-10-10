// Validación de lo que llega desde los teléfonos.
//
// Refleja EXACTAMENTE las restricciones de migrations/001_inicial.sql y los
// límites de web/db.js (LIMITES). Si se cambia uno, se cambian los tres: si no,
// lo que hoy se guarda en el teléfono será rechazado por el servidor mañana.

export const LIMITES = {
  id: 64,
  nombre: 120,
  direccion: 160,
  barrio: 80,
  municipio: 60,
  telefono: 30,
  zona: 40,
  vendedor: 60,
  competencia: 80,
  notas: 500
};

export const RESULTADOS = ['compro', 'no_compro', 'no_estaba', 'pidio_visita'];
export const LINEAS = ['lavaplatos', 'cocina_integral', 'estufa', 'campana', 'meson'];

function texto(v) {
  if (v == null) return '';
  return (typeof v === 'string' ? v : String(v)).trim();
}

function campo(obj, k, limite, requerido) {
  const v = texto(obj[k]);
  if (requerido && !v) return { error: 'Falta ' + k };
  if (v.length > limite) return { error: k + ' supera ' + limite + ' caracteres' };
  return { valor: v };
}

export function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d &&
    y >= 2000 && y <= 2100;
}

export function validarFerreteria(f) {
  if (!f || typeof f !== 'object') return { error: 'Registro vacío' };
  const valor = {};
  for (const k of ['id', 'nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona']) {
    const r = campo(f, k, LIMITES[k], k === 'id' || k === 'nombre');
    if (r.error) return r;
    valor[k] = r.valor;
  }
  return { valor };
}

export function validarVisita(v) {
  if (!v || typeof v !== 'object') return { error: 'Registro vacío' };
  const valor = {};
  const campos = [
    ['id', LIMITES.id, true],
    ['ferreteriaId', LIMITES.id, true],
    ['vendedor', LIMITES.vendedor, false],
    ['competencia', LIMITES.competencia, false],
    ['notas', LIMITES.notas, false]
  ];
  for (const [k, limite, requerido] of campos) {
    const r = campo(v, k, limite, requerido);
    if (r.error) return r;
    valor[k] = r.valor;
  }
  if (!fechaValida(v.fecha)) return { error: 'Fecha no válida' };
  valor.fecha = v.fecha;
  if (!RESULTADOS.includes(v.resultado)) return { error: 'Resultado no válido' };
  valor.resultado = v.resultado;
  const lineas = Array.isArray(v.lineas) ? [...new Set(v.lineas)] : [];
  if (lineas.some(l => !LINEAS.includes(l))) return { error: 'Línea no válida' };
  valor.lineas = lineas;
  const creada = Date.parse(v.creada);
  valor.creada = new Date(Number.isNaN(creada) ? Date.now() : creada).toISOString();
  return { valor };
}
