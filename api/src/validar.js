// Validación de lo que llega desde los teléfonos.
//
// Refleja EXACTAMENTE las restricciones de migrations/*.sql y los límites de
// web/db.js y app/src/nucleo/reglas.js (LIMITES). Si se cambia uno, se cambian
// todos: si no, lo que hoy se guarda en el teléfono será rechazado mañana.

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
  notas: 500,
  encargado: 80,
  whatsapp: 30,
  correo: 120,
  vendedorAsignado: 60,
  googlePlaceId: 255,
  web: 300,
  horario: 600
};

export const RESULTADOS = ['compro', 'no_compro', 'no_estaba', 'pidio_visita'];
export const LINEAS = ['lavaplatos', 'cocina_integral', 'estufa', 'campana', 'meson'];
export const TIPOS = ['ferreteria', 'materiales'];
export const CATEGORIAS = ['', 'A', 'B', 'C'];
// Migración 004: '' = activa; si no, el motivo por el que se descartó.
export const DESCARTES = ['', 'no_existe', 'cerro', 'no_aplica'];

// Campos de la migración 003. Opcionales: si no vienen (null), el servidor conserva
// lo guardado, para que un celular con una versión vieja de la app no los borre.
export const TEXTOS_EXTRA = ['encargado', 'whatsapp', 'correo', 'vendedorAsignado', 'googlePlaceId', 'web', 'horario'];

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

// Latitud y longitud van juntas o no van. null/ausentes = sin ubicar.
export function validarCoordenadas(lat, lng) {
  const vacio = v => v == null || v === '';
  if (vacio(lat) && vacio(lng)) return { valor: { lat: null, lng: null } };
  const a = Number(lat);
  const o = Number(lng);
  if (vacio(lat) || vacio(lng) || !Number.isFinite(a) || !Number.isFinite(o)) {
    return { error: 'Ubicación incompleta o no numérica' };
  }
  if (a < -90 || a > 90 || o < -180 || o > 180) return { error: 'Ubicación fuera de rango' };
  return { valor: { lat: a, lng: o } };
}

export function validarFerreteria(f) {
  if (!f || typeof f !== 'object') return { error: 'Registro vacío' };
  const valor = {};
  for (const k of ['id', 'nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona']) {
    const r = campo(f, k, LIMITES[k], k === 'id' || k === 'nombre');
    if (r.error) return r;
    valor[k] = r.valor;
  }
  const c = validarCoordenadas(f.lat, f.lng);
  if (c.error) return c;
  Object.assign(valor, c.valor);
  const e = validarExtras(f);
  if (e.error) return e;
  Object.assign(valor, e.valor);
  return { valor };
}

function validarExtras(f) {
  const falta = v => v === undefined || v === null;
  const valor = {};
  for (const k of TEXTOS_EXTRA) {
    if (falta(f[k])) { valor[k] = null; continue; }
    const r = campo(f, k, LIMITES[k], false);
    if (r.error) return r;
    valor[k] = r.valor;
  }
  valor.tipo = falta(f.tipo) ? null : f.tipo;
  if (valor.tipo !== null && !TIPOS.includes(valor.tipo)) return { error: 'Tipo no válido' };
  valor.categoria = falta(f.categoria) ? null : f.categoria;
  if (valor.categoria !== null && !CATEGORIAS.includes(valor.categoria)) return { error: 'Categoría no válida' };
  valor.clienteSocoda = falta(f.clienteSocoda) ? null : f.clienteSocoda;
  if (valor.clienteSocoda !== null && typeof valor.clienteSocoda !== 'boolean') return { error: 'clienteSocoda no válido' };
  valor.descartada = falta(f.descartada) ? null : f.descartada;
  if (valor.descartada !== null && !DESCARTES.includes(valor.descartada)) return { error: 'Motivo de descarte no válido' };
  if (falta(f.descartadaPor)) valor.descartadaPor = null;
  else {
    const r = campo(f, 'descartadaPor', LIMITES.vendedor, false);
    if (r.error) return r;
    valor.descartadaPor = r.valor;
  }
  valor.descartadaFecha = falta(f.descartadaFecha) ? null : f.descartadaFecha;
  if (valor.descartadaFecha !== null && valor.descartadaFecha !== '' && !fechaValida(valor.descartadaFecha)) {
    return { error: 'Fecha de descarte no válida' };
  }
  valor.calificacion = falta(f.calificacion) ? null : Number(f.calificacion);
  if (valor.calificacion !== null && !(valor.calificacion >= 0 && valor.calificacion <= 5)) {
    return { error: 'Calificación fuera de rango' };
  }
  valor.resenas = falta(f.resenas) ? null : Number(f.resenas);
  if (valor.resenas !== null && !(Number.isInteger(valor.resenas) && valor.resenas >= 0 && valor.resenas <= 1e8)) {
    return { error: 'Reseñas no válidas' };
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
