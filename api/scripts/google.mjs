// Lógica pura de la carga desde Google Maps (sin red), para poder probarla.
// Ver buscar-google.mjs.

// Área metropolitana de Bucaramanga: Bucaramanga, Floridablanca, Girón y Piedecuesta.
export const LIMITES_ZONA = { sur: 6.93, oeste: -73.23, norte: 7.18, este: -73.01 };

// Nombre como lo escribe el censo, a partir de cómo lo escribe Google.
const MUNICIPIOS = {
  bucaramanga: 'Bucaramanga',
  floridablanca: 'Floridablanca',
  giron: 'Girón',
  'san juan de giron': 'Girón',
  piedecuesta: 'Piedecuesta'
};

// Mismos límites de api/src/validar.js.
const LARGO = { id: 64, nombre: 120, direccion: 160, barrio: 80, municipio: 60, telefono: 30 };

// Tipos de Google que cuentan como ferretería aunque el nombre no lo diga, y los de
// depósitos y tiendas de materiales, que también se visitan pero se marcan aparte.
const TIPOS_FERRETERIA = ['hardware_store', 'home_improvement_store'];
const TIPOS_MATERIALES = ['building_materials_store'];
const NOMBRE_MATERIALES = /deposito|materiales|construc|herraj|acero|tornill|herramient/;

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const corta = (s, n) => String(s || '').trim().slice(0, n);

export function partir(c) {
  const lat = (c.sur + c.norte) / 2;
  const lng = (c.oeste + c.este) / 2;
  return [
    { sur: c.sur, oeste: c.oeste, norte: lat, este: lng },
    { sur: c.sur, oeste: lng, norte: lat, este: c.este },
    { sur: lat, oeste: c.oeste, norte: c.norte, este: lng },
    { sur: lat, oeste: lng, norte: c.norte, este: c.este }
  ];
}

function componente(p, ...tipos) {
  for (const t of tipos) {
    const c = (p.addressComponents || []).find(x => (x.types || []).includes(t));
    if (c) return c.longText;
  }
  return '';
}

export function municipioDe(p) {
  const candidatos = [componente(p, 'locality'), componente(p, 'administrative_area_level_2'),
    ...String(p.formattedAddress || '').split(',')];
  for (const c of candidatos) {
    const m = MUNICIPIOS[sinTildes(c)];
    if (m) return m;
  }
  return '';
}

// 'ferreteria', 'materiales' o '' (no sirve para el censo).
export function tipoDe(p) {
  const nombre = sinTildes(p.displayName && p.displayName.text);
  const tipos = p.types || [];
  if (/ferre|ferro/.test(nombre) || tipos.some(t => TIPOS_FERRETERIA.includes(t))) return 'ferreteria';
  if (NOMBRE_MATERIALES.test(nombre) || tipos.some(t => TIPOS_MATERIALES.includes(t))) return 'materiales';
  return '';
}

// Lugar de Google -> ferretería del censo (mismos campos de web/db.js) + datos de Google.
export function aFerreteria(p) {
  const municipio = municipioDe(p);
  const direccion = String(p.formattedAddress || '').split(',')[0];
  return {
    // El id sale del de Google: volver a importar actualiza en vez de duplicar.
    id: corta('g_' + p.id, LARGO.id),
    nombre: corta(p.displayName && p.displayName.text, LARGO.nombre),
    direccion: corta(direccion, LARGO.direccion),
    barrio: corta(componente(p, 'neighborhood', 'sublocality_level_1', 'sublocality'), LARGO.barrio),
    municipio,
    telefono: corta(p.nationalPhoneNumber || p.internationalPhoneNumber, LARGO.telefono),
    zona: '',
    tipo: tipoDe(p),
    lat: p.location ? p.location.latitude : null,
    lng: p.location ? p.location.longitude : null,
    googlePlaceId: p.id,
    web: p.websiteUri || '',
    horario: ((p.regularOpeningHours && p.regularOpeningHours.weekdayDescriptions) || []).join(' | '),
    calificacion: p.rating == null ? null : p.rating,
    resenas: p.userRatingCount || 0,
    estadoGoogle: p.businessStatus || '',
    maps: p.googleMapsUri || ''
  };
}

// Separa lo que entra al censo de lo descartado (con el motivo, para revisarlo a mano).
export function convertir(lugares) {
  const ferreterias = [];
  const descartadas = [];
  for (const p of lugares) {
    const f = aFerreteria(p);
    let motivo = '';
    if (p.businessStatus === 'CLOSED_PERMANENTLY') motivo = 'cerrada definitivamente';
    else if (!f.municipio) motivo = 'fuera del área metropolitana';
    else if (!f.tipo) motivo = 'no parece ferretería';
    else if (!f.nombre) motivo = 'sin nombre';
    if (motivo) descartadas.push({ motivo, nombre: f.nombre, direccion: p.formattedAddress, tipos: p.types, maps: f.maps });
    else ferreterias.push(f);
  }
  ferreterias.sort((a, b) => a.municipio.localeCompare(b.municipio, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  return { ferreterias, descartadas };
}

// CSV con las columnas que entiende "Importar" en la app (app/src/nucleo/csv.js y web/db.js);
// las columnas de Google van al final y la app hoy las ignora.
const COLUMNAS = [
  ['id', 'id'], ['nombre', 'nombre'], ['direccion', 'direccion'], ['barrio', 'barrio'],
  ['municipio', 'municipio'], ['telefono', 'telefono'], ['zona', 'zona'], ['lat', 'lat'], ['lng', 'lng'],
  ['tipo', 'tipo'], ['google_place_id', 'googlePlaceId'], ['web', 'web'], ['horario', 'horario'],
  ['calificacion', 'calificacion'], ['resenas', 'resenas'], ['estado_google', 'estadoGoogle'], ['maps', 'maps']
];

function celda(v) {
  const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function aCSV(ferreterias) {
  const filas = [COLUMNAS.map(c => c[0]).join(';')]
    .concat(ferreterias.map(f => COLUMNAS.map(([, k]) => celda(f[k])).join(';')));
  return '﻿' + filas.join('\r\n');
}
