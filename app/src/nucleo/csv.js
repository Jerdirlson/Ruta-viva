// Importar y exportar el censo en CSV. Lógica pura.
//
// Columnas reconocidas: id (opcional), nombre, direccion, barrio, municipio, telefono,
// zona, y opcionalmente lat y lng (punto o coma decimal) y las de COLUMNAS_EXTRA
// (las mismas que genera api/scripts/buscar-google.mjs). Separador ; o , (se detecta).
// Exporta con ; y coma decimal para que Excel en español lo abra bien.
import { CAMPOS, limpiar, normaliza, nuevoId, claveDup, construirFerreteria, validarCoordenadas } from './reglas.js';

// [columna del CSV, campo de la ferretería]
export const COLUMNAS_EXTRA = [
  ['tipo', 'tipo'], ['encargado', 'encargado'], ['whatsapp', 'whatsapp'], ['correo', 'correo'],
  ['categoria', 'categoria'], ['cliente_socoda', 'clienteSocoda'], ['vendedor_asignado', 'vendedorAsignado'],
  ['google_place_id', 'googlePlaceId'], ['web', 'web'], ['horario', 'horario'],
  ['calificacion', 'calificacion'], ['resenas', 'resenas'],
  ['descartada', 'descartada'], ['descartada_por', 'descartadaPor'], ['descartada_fecha', 'descartadaFecha']
];
const COLUMNAS = CAMPOS.map(c => [c, c]).concat(COLUMNAS_EXTRA);

function textoCelda(k, v) {
  if (v == null) return '';
  if (k === 'clienteSocoda') return v ? 'si' : 'no';
  if (k === 'lat' || k === 'lng' || k === 'calificacion') return String(v).replace('.', ',');
  return v;
}

function celdaCSV(v) {
  const s = String(v == null ? '' : v);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportarCSV(datos) {
  const cols = [['id', 'id']].concat(CAMPOS.map(c => [c, c]), [['lat', 'lat'], ['lng', 'lng']], COLUMNAS_EXTRA);
  const filas = [cols.map(c => c[0]).join(';')].concat(
    datos.ferreterias.map(f => cols.map(([, k]) => celdaCSV(textoCelda(k, f[k]))).join(';'))
  );
  return '﻿' + filas.join('\r\n');
}

export function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') {
      comillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila);
      fila = []; campo = '';
    } else {
      campo += c;
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(c => c.trim() !== ''));
}

// Actualiza por id, o por nombre + dirección + municipio. Solo toca las columnas
// presentes en el archivo; una celda de ubicación vacía no borra la guardada.
export function importarCSV(datos, texto, conServidor) {
  const filas = parsearCSV(texto);
  if (filas.length < 2) throw new Error('El archivo no tiene filas de datos');
  const enc = filas[0].map(h => normaliza(h).replace(/ /g, '_'));
  if (!enc.includes('nombre')) throw new Error('Falta la columna "nombre"');
  const presentes = COLUMNAS.filter(([col]) => enc.includes(col));
  const conUbicacion = enc.includes('lat') && enc.includes('lng');
  const cont = { nuevas: 0, actualizadas: 0, omitidas: 0 };
  const encolar = f => { if (conServidor) datos.pendientes.ferreterias[f.id] = f; };

  filas.slice(1).forEach(fila => {
    const r = {};
    enc.forEach((h, i) => { r[h] = limpiar(fila[i]); });
    if (!r.nombre) { cont.omitidas++; return; }
    const existente = (r.id && datos.ferreterias.find(x => x.id === r.id)) ||
                      datos.ferreterias.find(x => claveDup(x) === claveDup(r));
    if (existente) {
      const cambios = {};
      presentes.forEach(([col, k]) => { cambios[k] = r[col]; });
      const c = conUbicacion ? validarCoordenadas(r.lat, r.lng) : null;
      const ubic = c && c.lat != null ? c : { lat: existente.lat, lng: existente.lng };
      Object.assign(existente, construirFerreteria(Object.assign({}, existente, cambios, ubic), existente.id));
      encolar(existente);
      cont.actualizadas++;
    } else {
      const campos = {};
      presentes.forEach(([col, k]) => { campos[k] = r[col]; });
      const nueva = construirFerreteria(Object.assign(campos, { lat: r.lat, lng: r.lng }), r.id || nuevoId('f_'));
      datos.ferreterias.push(nueva);
      encolar(nueva);
      cont.nuevas++;
    }
  });
  return cont;
}
