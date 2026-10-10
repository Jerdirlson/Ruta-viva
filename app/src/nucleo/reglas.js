// Reglas de negocio de Ruta-viva. Lógica pura: no importa nada de React Native,
// así corre en Node y se prueba sin celular (app/tests/).
//
// LÍMITES: los mismos de api/migrations/*.sql, api/src/validar.js y web/db.js.
// Si se cambia uno, se cambian todos.

export const DIAS_SIN_VISITA = 30;
export const CAMPOS = ['nombre', 'direccion', 'barrio', 'municipio', 'telefono', 'zona'];
// Migración 003: contacto, comercial y Google Maps. Los de texto se recortan con LIMITES.
export const TEXTOS_EXTRA = ['encargado', 'whatsapp', 'correo', 'vendedorAsignado', 'googlePlaceId', 'web', 'horario'];

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

export const TIPOS = {
  ferreteria: 'Ferretería',
  materiales: 'Materiales de construcción'
};
export const CATEGORIAS = ['A', 'B', 'C'];

// Migración 004: por qué se descartó una ferretería ('' = activa). No se borra nunca.
export const DESCARTES = {
  no_existe: 'No existe en esa dirección',
  cerro: 'Cerró',
  no_aplica: 'No es ferretería / no aplica'
};

export const RESULTADOS = {
  compro: 'Compró',
  no_compro: 'No compró',
  no_estaba: 'No estaba',
  pidio_visita: 'Pidió visita después'
};

export const LINEAS = {
  lavaplatos: 'Lavaplatos',
  cocina_integral: 'Cocina integral',
  estufa: 'Estufa',
  campana: 'Campana',
  meson: 'Mesón'
};

export const ESTADOS = {
  nueva: 'Sin visitar',
  visitada: 'Visitada',
  seguimiento: 'Pidió visita',
  cliente: 'Cliente',
  descartada: 'Descartada'
};

// ---------- utilidades ----------
const tiene = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
export function limpiar(s) { return String(s == null ? '' : s).trim(); }
export function recortar(k, s) { return limpiar(s).slice(0, LIMITES[k]); }
export function normaliza(s) {
  return limpiar(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
}
export function nuevoId(prefijo) {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return prefijo + c.randomUUID();
  return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
export function isoDe(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function hoyISO(ahora = new Date()) { return isoDe(ahora); }
export function fechaHaceDias(n, ahora = new Date()) {
  const d = new Date(ahora);
  d.setDate(d.getDate() - n);
  return isoDe(d);
}
export function diasDesde(iso, ahora = new Date()) {
  if (!iso) return Infinity;
  const [y, m, d] = iso.split('-').map(Number);
  const hoy = new Date(ahora);
  hoy.setHours(0, 0, 0, 0);
  return Math.round((hoy - new Date(y, m - 1, d)) / 86400000);
}

// ---------- estructura de datos ----------
export function vacio() {
  return {
    ferreterias: [],
    visitas: [],
    vendedorActual: '',
    semilla: false,
    claveEquipo: '',
    ultimaSync: '',
    pendientes: { ferreterias: {}, visitas: {} }
  };
}

// Con servidor, todo cambio local queda pendiente de enviar (el último gana).
function encolar(datos, conServidor, tipo, reg) {
  if (conServidor) datos.pendientes[tipo][reg.id] = reg;
}

// ---------- ubicación ----------
// Mismos rangos que api/src/validar.js (validarCoordenadas) y la migración 002.
// Latitud y longitud van juntas o no van; null = sin ubicar.
export function validarCoordenadas(lat, lng) {
  const vaciaC = v => v == null || v === '';
  if (vaciaC(lat) && vaciaC(lng)) return { lat: null, lng: null };
  const a = Number(String(lat).replace(',', '.'));
  const o = Number(String(lng).replace(',', '.'));
  if (vaciaC(lat) || vaciaC(lng) || !Number.isFinite(a) || !Number.isFinite(o) ||
      a < -90 || a > 90 || o < -180 || o > 180) return null;
  return { lat: a, lng: o };
}

// ---------- ferreterías ----------
export function claveDup(f) {
  return [normaliza(f.nombre), normaliza(f.direccion), normaliza(f.municipio)].join('|');
}
// Sí/no tal como llega de un formulario, un CSV o el servidor.
export function siNo(v) {
  return v === true || /^(si|sí|s|1|true|x)$/i.test(limpiar(v));
}
function numeroEntre(v, min, max, entero) {
  if (v == null || limpiar(v) === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max || (entero && !Number.isInteger(n))) return null;
  return n;
}

export function construirFerreteria(f, id) {
  const reg = { id: recortar('id', id) };
  CAMPOS.forEach(c => { reg[c] = recortar(c, f[c]); });
  const c = validarCoordenadas(f.lat, f.lng) || { lat: null, lng: null };
  reg.lat = c.lat;
  reg.lng = c.lng;
  reg.tipo = tiene(TIPOS, f.tipo) ? f.tipo : 'ferreteria';
  TEXTOS_EXTRA.forEach(k => { reg[k] = recortar(k, f[k]); });
  const cat = limpiar(f.categoria).toUpperCase();
  reg.categoria = CATEGORIAS.includes(cat) ? cat : '';
  reg.clienteSocoda = siNo(f.clienteSocoda);
  reg.calificacion = numeroEntre(f.calificacion, 0, 5, false);
  reg.resenas = numeroEntre(f.resenas, 0, 1e8, true);
  reg.descartada = tiene(DESCARTES, f.descartada) ? f.descartada : '';
  reg.descartadaPor = recortar('vendedor', f.descartadaPor);
  reg.descartadaFecha = /^\d{4}-\d{2}-\d{2}$/.test(limpiar(f.descartadaFecha)) ? limpiar(f.descartadaFecha) : '';
  return reg;
}

// Nueva (sin id) o editar: lo que no viene en `f` se conserva de la guardada.
export function guardarFerreteria(datos, f, conServidor) {
  const id = f.id || nuevoId('f_');
  const i = datos.ferreterias.findIndex(x => x.id === id);
  const reg = construirFerreteria(i >= 0 ? Object.assign({}, datos.ferreterias[i], f) : f, id);
  if (!reg.nombre) throw new Error('El nombre es obligatorio');
  if (i >= 0) {
    // Editar sin ubicación no borra la que ya estaba.
    if (reg.lat == null) { reg.lat = datos.ferreterias[i].lat; reg.lng = datos.ferreterias[i].lng; }
    datos.ferreterias[i] = reg;
  } else {
    datos.ferreterias.push(reg);
  }
  encolar(datos, conServidor, 'ferreterias', reg);
  return reg;
}

export function guardarUbicacion(datos, id, lat, lng, conServidor) {
  const c = validarCoordenadas(lat, lng);
  if (!c || c.lat == null) throw new Error('Ubicación no válida');
  const f = datos.ferreterias.find(x => x.id === id);
  if (!f) throw new Error('La ferretería no existe');
  f.lat = c.lat;
  f.lng = c.lng;
  encolar(datos, conServidor, 'ferreterias', f);
  return f;
}

// El vendedor fue y no existe, cerró o no aplica. Queda marcada (con quién y cuándo),
// sale de Hoy, del mapa y de los pendientes, y conserva su historial de visitas.
export function descartarFerreteria(datos, id, motivo, vendedor, conServidor, ahora = new Date()) {
  if (!tiene(DESCARTES, motivo)) throw new Error('Elige por qué la descartas');
  const f = datos.ferreterias.find(x => x.id === id);
  if (!f) throw new Error('La ferretería no existe');
  f.descartada = motivo;
  f.descartadaPor = recortar('vendedor', vendedor);
  f.descartadaFecha = hoyISO(ahora);
  encolar(datos, conServidor, 'ferreterias', f);
  return f;
}
export function reactivarFerreteria(datos, id, conServidor) {
  const f = datos.ferreterias.find(x => x.id === id);
  if (!f) throw new Error('La ferretería no existe');
  f.descartada = '';
  f.descartadaPor = '';
  f.descartadaFecha = '';
  encolar(datos, conServidor, 'ferreterias', f);
  return f;
}

// ---------- visitas ----------
export function registrarVisita(datos, v, conServidor, ahora = new Date()) {
  if (!tiene(RESULTADOS, v.resultado)) throw new Error('Elige un resultado');
  if (!datos.ferreterias.some(f => f.id === v.ferreteriaId)) throw new Error('La ferretería no existe');
  const visita = {
    id: nuevoId('v_'),
    ferreteriaId: v.ferreteriaId,
    fecha: v.fecha || hoyISO(ahora),
    vendedor: recortar('vendedor', v.vendedor),
    resultado: v.resultado,
    lineas: [...new Set((Array.isArray(v.lineas) ? v.lineas : []).filter(l => tiene(LINEAS, l)))],
    competencia: recortar('competencia', v.competencia),
    notas: recortar('notas', v.notas),
    creada: ahora.toISOString()
  };
  datos.visitas.push(visita);
  encolar(datos, conServidor, 'visitas', visita);
  return visita;
}

function ordenVisitas(a, b) {
  return b.fecha.localeCompare(a.fecha) || (b.creada || '').localeCompare(a.creada || '');
}
// Descartada manda. Ya cliente de SOCODA antes de la app = cliente, salvo que haya pedido visita.
function estadoDe(ultima, f) {
  if (f && f.descartada) return 'descartada';
  if (ultima && ultima.resultado === 'pidio_visita') return 'seguimiento';
  if ((ultima && ultima.resultado === 'compro') || (f && f.clienteSocoda === true)) return 'cliente';
  return ultima ? 'visitada' : 'nueva';
}

// Ferreterías enriquecidas con visitas, última visita, estado y días sin visita.
export function censoDe(datos, ahora = new Date()) {
  const porFerreteria = new Map();
  datos.visitas.forEach(v => {
    if (!porFerreteria.has(v.ferreteriaId)) porFerreteria.set(v.ferreteriaId, []);
    porFerreteria.get(v.ferreteriaId).push(v);
  });
  return datos.ferreterias.map(f => {
    const visitas = (porFerreteria.get(f.id) || []).sort(ordenVisitas);
    const ultima = visitas[0] || null;
    return Object.assign({}, f, {
      visitas,
      ultima,
      estado: estadoDe(ultima, f),
      diasSinVisita: diasDesde(ultima ? ultima.fecha : null, ahora)
    });
  });
}

// Pendientes de hoy: pidió visita después, o sin visita hace más de 30 días (incluye nunca visitadas).
// Las descartadas nunca son pendientes.
export function pendientesDe(censo) {
  return censo.filter(f => f.estado !== 'descartada' && (f.estado === 'seguimiento' || f.diasSinVisita > DIAS_SIN_VISITA));
}

// Color del pin según lo que el vendedor tiene que hacer.
export function colorPin(f) {
  if (f.estado === 'seguimiento') return 'amarillo';
  if (f.diasSinVisita > DIAS_SIN_VISITA) return 'rojo';
  if (f.estado === 'cliente') return 'verde';
  return 'gris';
}

const ORDEN = (a, b) => String(a).localeCompare(b, 'es');

// Grupo para filtrar y separar la lista: la zona, o el municipio si aún no tiene zona.
export function grupoDe(f) {
  return f.zona || f.municipio || 'Sin zona';
}
export function ordenZona(a, b) {
  return ORDEN(a.zona || '~', b.zona || '~') ||
    ORDEN(a.municipio || '~', b.municipio || '~') ||
    ORDEN(a.barrio || '', b.barrio || '') ||
    ORDEN(a.nombre, b.nombre);
}
export function unicos(lista) { return [...new Set(lista.filter(Boolean))].sort(ORDEN); }

function resumenPor(visitas, claveDe) {
  const mapa = new Map();
  visitas.forEach(v => {
    const k = claveDe(v);
    if (!mapa.has(k)) mapa.set(k, { clave: k, visitas: 0, compras: 0 });
    const fila = mapa.get(k);
    fila.visitas++;
    if (v.resultado === 'compro') fila.compras++;
  });
  return [...mapa.values()].sort((a, b) => b.visitas - a.visitas || a.clave.localeCompare(b.clave, 'es'));
}

// dias: 30 para últimos 30 días, 0 para todo el histórico.
export function resumen(datos, dias, ahora = new Date()) {
  const desde = dias ? fechaHaceDias(dias, ahora) : '0000-00-00';
  const visitas = datos.visitas.filter(v => v.fecha >= desde);
  const zonaDe = new Map(datos.ferreterias.map(f => [f.id, f.zona || 'Sin zona']));

  // Cliente nuevo = su primera compra registrada cae dentro del periodo.
  const clientesNuevos = [];
  datos.ferreterias.forEach(f => {
    const compras = datos.visitas
      .filter(v => v.ferreteriaId === f.id && v.resultado === 'compro')
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (compras.length && compras[0].fecha >= desde) {
      clientesNuevos.push({ id: f.id, nombre: f.nombre, municipio: f.municipio, zona: f.zona, fecha: compras[0].fecha });
    }
  });
  clientesNuevos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    visitas: visitas.length,
    compras: visitas.filter(v => v.resultado === 'compro').length,
    porZona: resumenPor(visitas, v => zonaDe.get(v.ferreteriaId) || 'Sin zona'),
    porVendedor: resumenPor(visitas, v => v.vendedor || 'Sin nombre'),
    clientesNuevos,
    sinVisitar: censoDe(datos, ahora).filter(f => f.estado !== 'descartada' && f.diasSinVisita > DIAS_SIN_VISITA)
  };
}

// ---------- respaldo ----------
// La clave del equipo nunca sale en el respaldo.
export function respaldoDe(datos) {
  const copia = JSON.parse(JSON.stringify(datos));
  delete copia.claveEquipo;
  return JSON.stringify(copia, null, 2);
}
export function restaurarRespaldo(actual, texto, conServidor) {
  const d = JSON.parse(texto);
  if (!d || !Array.isArray(d.ferreterias) || !Array.isArray(d.visitas)) {
    throw new Error('El archivo no es un respaldo de Ruta-viva');
  }
  const nuevo = Object.assign(vacio(), d, {
    semilla: true,
    claveEquipo: actual.claveEquipo,
    ultimaSync: actual.ultimaSync,
    pendientes: vacio().pendientes
  });
  // Con servidor, restaurar = volver a enviar todo (las visitas no se duplican).
  nuevo.ferreterias.forEach(f => encolar(nuevo, conServidor, 'ferreterias', f));
  nuevo.visitas.forEach(v => encolar(nuevo, conServidor, 'visitas', v));
  return nuevo;
}
