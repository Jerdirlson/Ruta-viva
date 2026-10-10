// Importar y exportar el censo en CSV. Lógica pura.
//
// Columnas reconocidas: id (opcional), nombre, direccion, barrio, municipio, telefono,
// zona, y opcionalmente lat y lng (punto o coma decimal). Separador ; o , (se detecta).
// Exporta con ; y coma decimal para que Excel en español lo abra bien.
import { CAMPOS, limpiar, normaliza, recortar, nuevoId, claveDup, construirFerreteria, validarCoordenadas } from './reglas.js';

function celdaCSV(v) {
  const s = String(v == null ? '' : v);
  return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function exportarCSV(datos) {
  const cabecera = ['id'].concat(CAMPOS, ['lat', 'lng']);
  const filas = [cabecera.join(';')].concat(
    datos.ferreterias.map(f => cabecera.map(c =>
      celdaCSV((c === 'lat' || c === 'lng') && f[c] != null ? String(f[c]).replace('.', ',') : f[c])
    ).join(';'))
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
  const campos = CAMPOS.filter(c => enc.includes(c));
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
      campos.forEach(c => { existente[c] = recortar(c, r[c]); });
      const c = conUbicacion ? validarCoordenadas(r.lat, r.lng) : null;
      if (c && c.lat != null) { existente.lat = c.lat; existente.lng = c.lng; }
      encolar(existente);
      cont.actualizadas++;
    } else {
      const nueva = construirFerreteria(r, r.id || nuevoId('f_'));
      datos.ferreterias.push(nueva);
      encolar(nueva);
      cont.nuevas++;
    }
  });
  return cont;
}
