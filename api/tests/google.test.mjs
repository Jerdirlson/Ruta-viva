// Conversión de lugares de Google Maps al censo (api/scripts/google.mjs). Sin red.
import test from 'node:test';
import assert from 'node:assert/strict';
import { convertir, aCSV, partir, municipioDe } from '../scripts/google.mjs';
import { validarFerreteria } from '../src/validar.js';

const lugar = (extra = {}) => Object.assign({
  id: 'ChIJabc123',
  displayName: { text: 'Ferretería Cabecera' },
  formattedAddress: 'Cra. 35A #48-131, Cabecera del llano, Bucaramanga, Santander',
  addressComponents: [
    { longText: 'Cabecera del llano', types: ['neighborhood', 'political'] },
    { longText: 'Bucaramanga', types: ['locality', 'political'] }
  ],
  location: { latitude: 7.1186, longitude: -73.1105 },
  businessStatus: 'OPERATIONAL',
  nationalPhoneNumber: '(607) 6803060',
  types: ['hardware_store', 'store'],
  rating: 4.5,
  userRatingCount: 120
}, extra);

test('convierte un lugar de Google en una ferretería válida para el servidor', () => {
  const { ferreterias } = convertir([lugar()]);
  const f = ferreterias[0];
  assert.equal(f.id, 'g_ChIJabc123');
  assert.equal(f.direccion, 'Cra. 35A #48-131');
  assert.equal(f.barrio, 'Cabecera del llano');
  assert.equal(f.municipio, 'Bucaramanga');
  assert.equal(f.telefono, '(607) 6803060');
  assert.ok(!validarFerreteria(f).error);
});

test('descarta cerradas, fuera del área y lo que no es ferretería', () => {
  const { ferreterias, descartadas } = convertir([
    lugar({ id: 'a', businessStatus: 'CLOSED_PERMANENTLY' }),
    lugar({ id: 'b', formattedAddress: 'Calle 1, Lebrija, Santander', addressComponents: [] }),
    lugar({ id: 'c', displayName: { text: 'Panadería La Espiga' }, types: ['bakery'] }),
    lugar({ id: 'd', displayName: { text: 'Distribuciones Herreño' } }),
    lugar({ id: 'e', displayName: { text: 'Depósito de Materiales La Rosita' }, types: ['store'] })
  ]);
  assert.deepEqual(descartadas.map(d => d.motivo),
    ['cerrada definitivamente', 'fuera del área metropolitana', 'no parece ferretería']);
  assert.deepEqual(ferreterias.map(f => [f.id, f.tipo]), [['g_e', 'materiales'], ['g_d', 'ferreteria']]);
});

test('reconoce Girón escrito como lo escribe Google', () => {
  assert.equal(municipioDe(lugar({ addressComponents: [{ longText: 'San Juan de Girón', types: ['locality'] }] })), 'Girón');
  assert.equal(municipioDe(lugar({ addressComponents: [], formattedAddress: 'Cl. 30, Giron, Santander' })), 'Girón');
});

test('el CSV usa ; y coma decimal, como lo importa la app', () => {
  const csv = aCSV(convertir([lugar()]).ferreterias);
  const [cab, fila] = csv.replace(/^﻿/, '').split('\r\n');
  assert.ok(cab.startsWith('id;nombre;direccion;barrio;municipio;telefono;zona;lat;lng;'));
  assert.ok(fila.includes(';7,1186;-73,1105;'));
});

test('partir un cuadro da 4 que lo cubren completo', () => {
  const c = { sur: 0, oeste: 0, norte: 2, este: 2 };
  const p = partir(c);
  assert.equal(p.length, 4);
  assert.equal(Math.min(...p.map(x => x.sur)), 0);
  assert.equal(Math.max(...p.map(x => x.este)), 2);
});
