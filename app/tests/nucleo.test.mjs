// Pruebas de la lógica pura de la app (src/nucleo). Corren en Node, sin celular:
//   cd app && npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/nucleo/reglas.js';
import { importarCSV, exportarCSV, parsearCSV } from '../src/nucleo/csv.js';
import * as G from '../src/nucleo/geo.js';
import { armarLote, aplicarRespuesta, contarPendientes } from '../src/nucleo/sync.js';

const HOY = new Date(2026, 9, 10, 12, 0, 0); // 10 oct 2026
const base = () => {
  const d = R.vacio();
  R.guardarFerreteria(d, { id: 'f1', nombre: 'Alfa', municipio: 'Bucaramanga', zona: 'Z1', lat: 7.1186, lng: -73.1105 }, false);
  R.guardarFerreteria(d, { id: 'f2', nombre: 'Beta', municipio: 'Girón', zona: 'Z2', lat: 7.068, lng: -73.169 }, false);
  R.guardarFerreteria(d, { id: 'f3', nombre: 'Gama', municipio: 'Girón', zona: 'Z2' }, false);
  return d;
};

test('estados: nueva, cliente, seguimiento y visitada según la última visita', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'no_estaba', fecha: '2026-10-01' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro', fecha: '2026-10-05' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'pidio_visita', fecha: '2026-10-09' }, false, HOY);
  const c = Object.fromEntries(R.censoDe(d, HOY).map(f => [f.id, f]));
  assert.equal(c.f1.estado, 'cliente');
  assert.equal(c.f1.diasSinVisita, 5);
  assert.equal(c.f2.estado, 'seguimiento');
  assert.equal(c.f3.estado, 'nueva');
  assert.equal(c.f3.diasSinVisita, Infinity);
});

test('pendientes: pidió visita o más de 30 días sin visita (incluye nunca visitadas)', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro', fecha: '2026-10-05' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'pidio_visita', fecha: '2026-10-09' }, false, HOY);
  const ids = R.pendientesDe(R.censoDe(d, HOY)).map(f => f.id).sort();
  assert.deepEqual(ids, ['f2', 'f3']);
});

test('color del pin', () => {
  assert.equal(R.colorPin({ estado: 'seguimiento', diasSinVisita: 1 }), 'amarillo');
  assert.equal(R.colorPin({ estado: 'nueva', diasSinVisita: Infinity }), 'rojo');
  assert.equal(R.colorPin({ estado: 'cliente', diasSinVisita: 3 }), 'verde');
  assert.equal(R.colorPin({ estado: 'visitada', diasSinVisita: 3 }), 'gris');
  assert.equal(R.colorPin({ estado: 'cliente', diasSinVisita: 31 }), 'rojo');
});

test('visita: valida resultado, ferretería y recorta textos a los límites', () => {
  const d = base();
  assert.throws(() => R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'quizas' }, false), /resultado/);
  assert.throws(() => R.registrarVisita(d, { ferreteriaId: 'zz', resultado: 'compro' }, false), /no existe/);
  const v = R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro', notas: 'x'.repeat(900), lineas: ['estufa', 'estufa', 'nevera'] }, false, HOY);
  assert.equal(v.notas.length, R.LIMITES.notas);
  assert.deepEqual(v.lineas, ['estufa']);
  assert.equal(v.fecha, '2026-10-10');
});

test('con servidor, los cambios entran a la cola; sin servidor, no', () => {
  const d = base();
  assert.equal(contarPendientes(d), 0);
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro' }, true, HOY);
  R.guardarUbicacion(d, 'f3', 7.07, -73.17, true);
  assert.equal(contarPendientes(d), 2);
});

test('ubicación: juntas o ninguna, dentro de rango; editar sin ubicación no la borra', () => {
  assert.deepEqual(R.validarCoordenadas('7,1', '-73,1'), { lat: 7.1, lng: -73.1 });
  assert.equal(R.validarCoordenadas(7.1, ''), null);
  assert.equal(R.validarCoordenadas(95, 1), null);
  const d = base();
  assert.throws(() => R.guardarUbicacion(d, 'f1', 200, 0, false), /no válida/);
  R.guardarFerreteria(d, { id: 'f1', nombre: 'Alfa editada' }, false);
  const f1 = d.ferreterias.find(f => f.id === 'f1');
  assert.deepEqual([f1.nombre, f1.lat, f1.lng], ['Alfa editada', 7.1186, -73.1105]);
});

test('resumen: por zona, por vendedor, clientes nuevos y sin visitar', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro', fecha: '2026-10-05', vendedor: 'Ana' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'no_compro', fecha: '2026-10-06', vendedor: 'Beto' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'compro', fecha: '2026-08-01', vendedor: 'Beto' }, false, HOY);
  const r = R.resumen(d, 30, HOY);
  assert.equal(r.visitas, 2);
  assert.equal(r.compras, 1);
  assert.deepEqual(r.porVendedor.map(x => [x.clave, x.visitas, x.compras]), [['Ana', 1, 1], ['Beto', 1, 0]]);
  assert.deepEqual(r.clientesNuevos.map(c => c.id), ['f1']); // f2 compró por primera vez en agosto
  assert.deepEqual(r.sinVisitar.map(f => f.id), ['f3']);
});

test('CSV: separador ;, coma decimal, actualiza sin borrar ubicación, omite sin nombre', () => {
  const d = base();
  const r = importarCSV(d, '﻿nombre;direccion;municipio;lat;lng\nNueva;Calle 1;Girón;7,0681;-73,169\nAlfa;;Bucaramanga;;\n;sin nombre;;;\n', false);
  assert.deepEqual(r, { nuevas: 1, actualizadas: 1, omitidas: 1 });
  const alfa = d.ferreterias.find(f => f.nombre === 'Alfa');
  assert.deepEqual([alfa.lat, alfa.lng], [7.1186, -73.1105]);
  assert.deepEqual([d.ferreterias.find(f => f.nombre === 'Nueva').lat], [7.0681]);
  assert.throws(() => importarCSV(d, 'direccion\nCalle 1\n', false), /nombre/);
});

test('CSV: exportar y volver a importar conserva todo, incluidas comillas', () => {
  const d = base();
  R.guardarFerreteria(d, { id: 'f4', nombre: 'Ferretería "La Buena"; Sur', municipio: 'Girón' }, false);
  const otro = R.vacio();
  importarCSV(otro, exportarCSV(d), false);
  assert.deepEqual(otro.ferreterias.map(f => [f.id, f.nombre, f.lat]).sort(), d.ferreterias.map(f => [f.id, f.nombre, f.lat]).sort());
  assert.deepEqual(parsearCSV('a,b\n"x,1","y""z"\n'), [['a', 'b'], ['x,1', 'y"z']]);
});

test('geo: distancia, texto y orden por cercanía con las sin ubicar al final', () => {
  const yo = { lat: 7.118, lng: -73.111 };
  const d = base();
  const orden = G.ordenarPorCercania(d.ferreterias, yo).map(f => f.id);
  assert.deepEqual(orden, ['f1', 'f2', 'f3']);
  assert.equal(G.textoDistancia(87), '90 m');
  assert.equal(G.textoDistancia(4), '10 m');
  assert.equal(G.textoDistancia(1349), '1,3 km');
});

test('geo: ruta por vecino más cercano y enlaces de Maps', () => {
  const yo = { lat: 0, lng: 0 };
  const lista = [{ id: 'c', lat: 0, lng: 3 }, { id: 'a', lat: 0, lng: 1 }, { id: 'b', lat: 0, lng: 2 }, { id: 'x' }];
  assert.deepEqual(G.paradasCercanas(lista, yo).map(f => f.id), ['a', 'b', 'c']);
  const url = new URL(G.urlRuta(G.paradasCercanas(lista, yo)));
  assert.equal(url.searchParams.get('destination'), '0,3');
  assert.equal(url.searchParams.get('waypoints'), '0,1|0,2');
  assert.match(G.urlMaps({ direccion: 'Calle 1', municipio: 'Girón' }), /Calle%201%2C%20Gir%C3%B3n/);
  assert.equal(G.telefonoMarcable({ telefono: '+57 300-000 0001' }), '+573000000001');
});

test('sync: la respuesta reemplaza lo enviado y conserva lo que cambió mientras viajaba', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro' }, true, HOY);
  const lote = armarLote(d);
  // Mientras viaja el lote, se registra otra visita.
  const tarde = R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'no_estaba' }, true, HOY);
  const resp = { ferreterias: [{ id: 'f1', nombre: 'Alfa' }, { id: 'f9', nombre: 'De otro vendedor' }], visitas: lote.visitas, rechazadas: [] };
  const r = aplicarRespuesta(d, lote, resp, HOY);
  assert.equal(r.estado, 'ok');
  assert.deepEqual(Object.keys(d.pendientes.visitas), [tarde.id]);
  assert.ok(d.ferreterias.some(f => f.id === 'f9'));
  assert.ok(d.visitas.some(v => v.id === tarde.id));
  assert.equal(d.ultimaSync, HOY.toISOString());
});

test('respaldo: nunca incluye la clave del equipo; restaurar con servidor encola todo', () => {
  const d = base();
  d.claveEquipo = 'secreta-1234567890';
  R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'compro' }, false, HOY);
  const texto = R.respaldoDe(d);
  assert.ok(!texto.includes('secreta'));
  const nuevo = R.restaurarRespaldo({ claveEquipo: 'mia-abcdefghijklmnop', ultimaSync: '' }, texto, true);
  assert.equal(nuevo.claveEquipo, 'mia-abcdefghijklmnop');
  assert.equal(contarPendientes(nuevo), 4);
  assert.throws(() => R.restaurarRespaldo(d, '{"x":1}', false), /respaldo/);
});
