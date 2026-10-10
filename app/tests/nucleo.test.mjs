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
  assert.equal(R.colorPin({ estado: 'cliente', diasSinVisita: 31 }), 'verde');
  assert.equal(R.colorPin({ estado: 'cliente', diasSinVisita: Infinity }), 'verde');   // cliente del censo sin visitas en la app
  assert.equal(R.colorPin({ estado: 'visitada', diasSinVisita: 31 }), 'rojo');
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

test('contacto y comercial: valores por defecto, normalización y límites', () => {
  const d = base();
  const f = d.ferreterias.find(x => x.id === 'f1');
  assert.deepEqual([f.tipo, f.encargado, f.categoria, f.clienteSocoda, f.calificacion, f.resenas],
    ['ferreteria', '', '', false, null, null]);
  const g = R.guardarFerreteria(d, {
    nombre: 'Delta', tipo: 'materiales', categoria: 'b', clienteSocoda: 'Sí', calificacion: '4,5', resenas: '12',
    encargado: 'x'.repeat(200)
  }, false);
  assert.deepEqual([g.tipo, g.categoria, g.clienteSocoda, g.calificacion, g.resenas, g.encargado.length],
    ['materiales', 'B', true, 4.5, 12, R.LIMITES.encargado]);
  const h = R.guardarFerreteria(d, { nombre: 'Épsilon', tipo: 'panaderia', categoria: 'Z', calificacion: 9 }, false);
  assert.deepEqual([h.tipo, h.categoria, h.calificacion], ['ferreteria', '', null]);
});

test('editar una ferretería conserva lo que el formulario no trae (Google, ubicación)', () => {
  const d = base();
  R.guardarFerreteria(d, { id: 'f1', googlePlaceId: 'ChIJ1', horario: 'lunes: 8–6', calificacion: 4.2 }, false);
  const f = R.guardarFerreteria(d, { id: 'f1', encargado: 'Don Pedro', whatsapp: '300 123 4567' }, false);
  assert.deepEqual([f.nombre, f.googlePlaceId, f.horario, f.calificacion, f.encargado, f.lat],
    ['Alfa', 'ChIJ1', 'lunes: 8–6', 4.2, 'Don Pedro', 7.1186]);
});

test('ya cliente de SOCODA cuenta como cliente, salvo que pida visita', () => {
  const d = base();
  R.guardarFerreteria(d, { id: 'f3', clienteSocoda: true }, false);
  R.guardarFerreteria(d, { id: 'f2', clienteSocoda: true }, false);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'pidio_visita', fecha: '2026-10-09' }, false, HOY);
  const c = Object.fromEntries(R.censoDe(d, HOY).map(f => [f.id, f]));
  assert.equal(c.f3.estado, 'cliente');
  assert.equal(c.f2.estado, 'seguimiento');
});

test('CSV de Google: importa sus columnas, no duplica al repetir y exporta todo', () => {
  const csv = '﻿id;nombre;direccion;barrio;municipio;telefono;zona;lat;lng;tipo;google_place_id;web;horario;calificacion;resenas;estado_google;maps\r\n' +
    'g_ChIJ1;Ferretería Cabecera;Cra. 35A #48-131;Cabecera;Bucaramanga;(607) 6803060;;7,1186;-73,1105;materiales;ChIJ1;https://x.co;lunes: 8–6;4,5;120;OPERATIONAL;https://maps';
  const d = R.vacio();
  assert.deepEqual(importarCSV(d, csv, false), { nuevas: 1, actualizadas: 0, omitidas: 0 });
  R.guardarFerreteria(d, { id: 'g_ChIJ1', encargado: 'Doña Marta', clienteSocoda: true }, false);
  assert.deepEqual(importarCSV(d, csv, false), { nuevas: 0, actualizadas: 1, omitidas: 0 });
  const f = d.ferreterias[0];
  assert.deepEqual([d.ferreterias.length, f.tipo, f.googlePlaceId, f.calificacion, f.resenas, f.lat, f.encargado, f.clienteSocoda],
    [1, 'materiales', 'ChIJ1', 4.5, 120, 7.1186, 'Doña Marta', true]);
  const otra = R.vacio();
  importarCSV(otra, exportarCSV(d), false);
  assert.deepEqual(otra.ferreterias[0], f);
});

test('WhatsApp: celular colombiano con o sin 57; fijo no abre WhatsApp', () => {
  assert.equal(G.urlWhatsapp('300 123 4567'), 'https://wa.me/573001234567');
  assert.equal(G.urlWhatsapp('+57 300-123-4567'), 'https://wa.me/573001234567');
  assert.equal(G.urlWhatsapp('(607) 6803060'), '');
  assert.equal(G.urlWhatsapp(''), '');
});

test('mapa: agrupa solo lo que se taparía en pantalla y siempre sobre una ferretería real', () => {
  const lista = [
    { id: 'a', lat: 7.11800, lng: -73.11000, c: 'gris' },
    { id: 'b', lat: 7.11801, lng: -73.11001, c: 'amarillo' },
    { id: 'c', lat: 7.11800, lng: -73.11000, c: 'rojo' },     // misma coordenada que a
    { id: 'd', lat: 6.99000, lng: -73.05000, c: 'verde' },
    { id: 'e', lat: null, lng: null, c: 'rojo' }
  ];
  const colorDe = f => f.c;
  const tamano = { ancho: 400, alto: 400 };
  // Vista de toda el área (~0,3°): a, b y c caen en el mismo píxel.
  const lejos = G.agrupar(lista, { latitudeDelta: 0.3, longitudeDelta: 0.3 }, tamano, colorDe);
  assert.equal(lejos.length, 2);
  const g = lejos.find(x => x.ferreterias.length === 3);
  assert.equal(g.color, 'amarillo');
  assert.deepEqual([g.lat, g.lng], [7.11801, -73.11001]);   // exactamente sobre b, la más urgente
  // Muy de cerca (~45 m de ancho): a y c tienen la misma coordenada, así que siguen juntas
  // (y se eligen de una lista); ningún marcador queda encima de otro.
  const cerca = G.agrupar(lista, { latitudeDelta: 0.0004, longitudeDelta: 0.0004 }, tamano, colorDe);
  const juntas = cerca.find(x => x.ferreterias.some(f => f.id === 'a'));
  assert.ok(juntas.ferreterias.some(f => f.id === 'c'));
  assert.ok(G.extensionM(juntas.ferreterias) < G.MISMO_SITIO_M);
  // Ni el círculo más grande alcanza el área táctil de su vecino.
  assert.ok(G.RADIO_PX > G.GRUPO_MAX_PX / 2 + G.TOQUE_PUNTO_PX / 2);
  // Ningún par de marcadores queda a menos del radio en pantalla.
  const pxDe = x => ({ x: x.lng / (0.0004 / 400), y: x.lat / (0.0004 / 400) });
  for (const m of cerca) for (const n of cerca) {
    if (m !== n) assert.ok(Math.hypot(pxDe(m).x - pxDe(n).x, pxDe(m).y - pxDe(n).y) >= G.RADIO_PX - 1e-6);
  }
  // Sin tamaño de pantalla todavía: todas sueltas, en su punto exacto.
  assert.deepEqual(G.agrupar(lista, null, null, colorDe).map(x => x.clave).sort(), ['a', 'b', 'c', 'd']);
});

test('grupo: la zona, o el municipio si no tiene zona', () => {
  assert.equal(R.grupoDe({ zona: 'Zona 1', municipio: 'Girón' }), 'Zona 1');
  assert.equal(R.grupoDe({ zona: '', municipio: 'Girón' }), 'Girón');
  assert.equal(R.grupoDe({}), 'Sin zona');
});

test('mapa: el toque elige el marcador bajo el dedo, el más cercano, o ninguno', () => {
  const region = { latitudeDelta: 0.004, longitudeDelta: 0.004 };   // 1e-5 grados por px en 400 px
  const tamano = { ancho: 400, alto: 400 };
  const grupos = [
    { clave: 'a', lat: 7.1180, lng: -73.1100, ferreterias: [{}] },
    { clave: 'b', lat: 7.1180, lng: -73.1095, ferreterias: [{}] }   // 50 px a la derecha
  ];
  const radio = () => 20;
  assert.equal(G.marcadorEn(grupos, { lat: 7.11805, lng: -73.10995 }, region, tamano, radio).clave, 'a');  // a 7 px de a
  assert.equal(G.marcadorEn(grupos, { lat: 7.1180, lng: -73.10965 }, region, tamano, radio).clave, 'b');   // a 15 px de b
  assert.equal(G.marcadorEn(grupos, { lat: 7.1185, lng: -73.1100 }, region, tamano, radio), null);         // a 50 px de todo
  assert.equal(G.marcadorEn(grupos, null, region, tamano, radio), null);
});

test('descartar: sale de pendientes y del resumen, conserva visitas, se puede reactivar', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f3', resultado: 'no_estaba', fecha: '2026-08-01' }, false, HOY);
  assert.ok(R.pendientesDe(R.censoDe(d, HOY)).some(f => f.id === 'f3'));
  assert.throws(() => R.descartarFerreteria(d, 'f3', 'borrada', 'Ana', false, HOY), /por qué/);
  const f = R.descartarFerreteria(d, 'f3', 'no_existe', 'Ana', true, HOY);
  assert.deepEqual([f.descartada, f.descartadaPor, f.descartadaFecha], ['no_existe', 'Ana', '2026-10-10']);
  assert.ok(d.pendientes.ferreterias.f3);
  const c = R.censoDe(d, HOY).find(x => x.id === 'f3');
  assert.equal(c.estado, 'descartada');
  assert.equal(c.visitas.length, 1);
  assert.ok(!R.pendientesDe(R.censoDe(d, HOY)).some(x => x.id === 'f3'));
  assert.ok(!R.resumen(d, 0, HOY).sinVisitar.some(x => x.id === 'f3'));
  // Editar la ferretería no la reactiva sin querer.
  R.guardarFerreteria(d, { id: 'f3', telefono: '3001112233' }, false);
  assert.equal(d.ferreterias.find(x => x.id === 'f3').descartada, 'no_existe');
  R.reactivarFerreteria(d, 'f3', false);
  assert.equal(R.censoDe(d, HOY).find(x => x.id === 'f3').estado, 'visitada');
});

test('CSV: el descarte viaja de ida y vuelta', () => {
  const d = base();
  R.descartarFerreteria(d, 'f2', 'cerro', 'Ana', false, HOY);
  const otra = R.vacio();
  importarCSV(otra, exportarCSV(d), false);
  const f = otra.ferreterias.find(x => x.id === 'f2');
  assert.deepEqual([f.descartada, f.descartadaPor, f.descartadaFecha], ['cerro', 'Ana', '2026-10-10']);
});

test('estadísticas: periodo, efectividad, cobertura, por vendedor y por municipio', async () => {
  const E = await import('../src/nucleo/estadisticas.js');
  const d = base();   // f1 Bucaramanga (zona Z1), f2 y f3 Girón (zona Z2)
  R.guardarFerreteria(d, { id: 'f4', nombre: 'Delta', municipio: 'Piedecuesta' }, false);
  R.guardarFerreteria(d, { id: 'f5', nombre: 'Épsilon', municipio: 'Piedecuesta' }, false);
  R.descartarFerreteria(d, 'f5', 'cerro', 'Ana', false, HOY);
  const v = (id, ferreteriaId, fecha, resultado, vendedor, extra = {}) =>
    d.visitas.push(Object.assign({ id, ferreteriaId, fecha, resultado, vendedor, lineas: [], competencia: '', notas: '', creada: fecha + 'T12:00:00Z' }, extra));
  v('v1', 'f1', '2026-10-10', 'compro', 'Ana', { lineas: ['estufa', 'campana'], competencia: 'Haceb' });
  v('v2', 'f2', '2026-10-09', 'no_compro', 'Luis', { lineas: ['estufa'], competencia: 'haceb ' });
  v('v3', 'f2', '2026-10-05', 'pidio_visita', 'ana', { competencia: 'Challenger' });
  v('v4', 'f3', '2026-08-01', 'compro', 'Luis');   // fuera de 30 días
  v('v5', 'f4', '2026-10-10', 'no_estaba', 'Luis');

  const s = E.estadisticas(d, { dias: 30 }, HOY);
  assert.equal(s.desde, '2026-09-11');
  assert.deepEqual([s.visitas, s.compras, s.efectividad], [4, 1, 25]);
  assert.deepEqual([s.activas, s.descartadas, s.ferreteriasVisitadas, s.cobertura], [4, 1, 3, 75]);
  assert.equal(s.resultados.find(r => r.clave === 'pidio_visita').visitas, 1);
  // Una descartada que se visitó antes no infla la cobertura.
  v('v6', 'f5', '2026-10-01', 'no_compro', 'Ana');
  const c = E.estadisticas(d, { dias: 30 }, HOY);
  assert.deepEqual([c.ferreteriasVisitadas, c.visitadasActivas, c.activas, c.cobertura], [4, 3, 4, 75]);
  d.visitas.pop();
  // Ana y ana son la misma persona; Luis tiene 2 visitas en el periodo.
  assert.deepEqual(s.porVendedor.map(x => [x.clave, x.visitas, x.compras, x.ferreterias]), [['Ana', 2, 1, 2], ['Luis', 2, 0, 2]]);
  const giron = s.porGrupo.find(g => g.clave === 'Z2');
  assert.deepEqual([giron.activas, giron.visitadas, giron.cobertura], [2, 1, 50]);
  assert.ok(!s.porGrupo.some(g => g.activas === 0));   // la descartada no suma
  assert.deepEqual(s.lineas.slice(0, 2).map(l => [l.clave, l.visitas]), [['estufa', 2], ['campana', 1]]);
  assert.deepEqual(s.competencia.map(c => [c.clave, c.visitas]), [['Haceb', 2], ['Challenger', 1]]);
  assert.equal(s.porDia.length, 30);
  assert.deepEqual(s.porDia[29], { fecha: '2026-10-10', visitas: 2, compras: 1 });
  // f1 compró por primera vez hoy; f3 compró en agosto (fuera del periodo).
  assert.deepEqual(s.clientesNuevos.map(c => c.id), ['f1']);

  const hoy = E.estadisticas(d, { dias: 1 }, HOY);
  assert.deepEqual([hoy.visitas, hoy.porDia.length], [2, 0]);
  const luis = E.estadisticas(d, { dias: 0, vendedor: 'luis' }, HOY);
  assert.deepEqual([luis.visitas, luis.compras, luis.clientesNuevos.map(c => c.id)], [3, 1, ['f3']]);
  assert.deepEqual(E.vendedoresDe(d), ['Ana', 'Luis']);
});

test('ruta: lo visitado hoy no es pendiente, ni aunque haya pedido visita (vuelve mañana)', () => {
  const d = base();
  R.registrarVisita(d, { ferreteriaId: 'f3', resultado: 'pidio_visita', fecha: '2026-10-10' }, false, HOY);
  R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'no_estaba', fecha: '2026-10-10' }, false, HOY);
  const hoy = R.pendientesDe(R.censoDe(d, HOY)).map(f => f.id);
  assert.deepEqual(hoy, ['f1']);
  const yo = { lat: 7.068, lng: -73.169 };   // parado en f2
  assert.deepEqual(G.paradasCercanas(R.pendientesDe(R.censoDe(d, HOY)), yo).map(f => f.id), ['f1']);
  const manana = new Date(2026, 9, 11, 9, 0, 0);
  assert.deepEqual(R.pendientesDe(R.censoDe(d, manana)).map(f => f.id).sort(), ['f1', 'f3']);
});

test('mapa: solo dibuja lo que está en la vista (más un margen)', () => {
  const lista = [{ id: 'dentro', lat: 7.10, lng: -73.10 }, { id: 'margen', lat: 7.1060, lng: -73.10 }, { id: 'lejos', lat: 7.20, lng: -73.10 }, { id: 'sin', lat: null, lng: null }];
  const region = { latitude: 7.10, longitude: -73.10, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  assert.deepEqual(G.enVista(lista, region).map(f => f.id), ['dentro', 'margen']);
  assert.equal(G.enVista(lista, null).length, 4);
});

test('sync por cambios: pide solo lo nuevo, mezcla sin perder lo que ya tenía y una vez al día pide todo', () => {
  const d = R.vacio();
  // Primera vez: sin "desde", respuesta completa.
  assert.equal(armarLote(d, HOY).desde, undefined);
  aplicarRespuesta(d, armarLote(d, HOY), {
    ferreterias: [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }], visitas: [], hasta: '2026-10-10T12:00:00.000Z', completo: true
  }, HOY);
  assert.equal(d.syncDesde, '2026-10-10T12:00:00.000Z');
  // Después: manda "desde" y la respuesta parcial se mezcla.
  const despues = new Date(2026, 9, 10, 13, 0, 0);
  const lote = armarLote(d, despues);
  assert.equal(lote.desde, '2026-10-10T12:00:00.000Z');
  const r = aplicarRespuesta(d, lote, {
    ferreterias: [{ id: 'b', nombre: 'B corregida' }, { id: 'c', nombre: 'C nueva' }], visitas: [{ id: 'v1', ferreteriaId: 'a', fecha: '2026-10-10' }],
    hasta: '2026-10-10T13:00:00.000Z', completo: false
  }, despues);
  assert.equal(r.cambios, 3);
  assert.deepEqual(d.ferreterias.map(f => [f.id, f.nombre]).sort(), [['a', 'A'], ['b', 'B corregida'], ['c', 'C nueva']]);
  assert.equal(d.visitas.length, 1);
  // Al día siguiente vuelve a pedir todo.
  assert.equal(armarLote(d, new Date(2026, 9, 11, 13, 0, 0)).desde, undefined);
});

// En Android (Hermes) cada localeCompare llama al sistema y ordenar el censo con él
// congelaba la app. El núcleo no debe usarlo; el orden en español se mantiene.
test('orden: sin localeCompare, alfabético en español (tildes y ñ)', () => {
  const orig = String.prototype.localeCompare;
  let llamadas = 0;
  String.prototype.localeCompare = function (...a) { llamadas++; return orig.apply(this, a); };
  try {
    const d = base();
    ['Ñapa', 'Árbol', 'zeta', 'Ébano', 'nube'].forEach((n, i) => R.guardarFerreteria(d, { id: 'o' + i, nombre: n, municipio: 'Girón', zona: 'Z9' }, false));
    const c = R.censoDe(d, HOY);
    const orden = R.pendientesDe(c).sort(R.ordenZona).filter(f => f.zona === 'Z9').map(f => f.nombre);
    assert.deepEqual(orden, ['Árbol', 'Ébano', 'Ñapa', 'nube', 'zeta']);
    R.unicos(c.map(f => f.municipio));
    E_estadisticas(d);
    assert.equal(llamadas, 0);
  } finally {
    String.prototype.localeCompare = orig;
  }
});
async function cargarE() { return import('../src/nucleo/estadisticas.js'); }
let E_mod = null;
function E_estadisticas(d) { if (E_mod) E_mod.estadisticas(d, { dias: 30 }, HOY); }
test('orden: estadísticas tampoco usan localeCompare', async () => {
  E_mod = await cargarE();
  const orig = String.prototype.localeCompare;
  let llamadas = 0;
  String.prototype.localeCompare = function (...a) { llamadas++; return orig.apply(this, a); };
  try {
    const d = base();
    d.visitas.push({ id: 'v', ferreteriaId: 'f1', fecha: '2026-10-09', resultado: 'compro', vendedor: 'Ana', lineas: [], competencia: 'Haceb', notas: '', creada: '' });
    E_mod.estadisticas(d, { dias: 30 }, HOY);
    E_mod.vendedoresDe(d);
    assert.equal(llamadas, 0);
  } finally {
    String.prototype.localeCompare = orig;
  }
});

test('marcas y comercial: valores fijos, la visita guarda lo visto y actualiza la ferretería, CSV de ida y vuelta', () => {
  const d = base();
  const f = R.guardarFerreteria(d, { id: 'f1', marcas: 'socoda|north|haceb', proveedores: ['chp', 'otro'], exhibidor: 'antiguo', cocinas: 'si', refCocinas: '3', observaciones: 'Territorio rojo' }, false);
  assert.deepEqual([f.marcas, f.proveedores, f.exhibidor, f.cocinas, f.refCocinas, f.observaciones],
    [['socoda', 'north'], ['chp'], 'antiguo', 'si', 3, 'Territorio rojo']);
  const v = R.registrarVisita(d, { ferreteriaId: 'f1', resultado: 'no_compro', marcas: ['north'], exhibidor: 'no' }, true, HOY);
  assert.deepEqual([v.marcas, v.exhibidor], [['north'], 'no']);
  assert.deepEqual([d.ferreterias.find(x => x.id === 'f1').marcas, d.ferreterias.find(x => x.id === 'f1').exhibidor], [['north'], 'no']);
  assert.ok(d.pendientes.ferreterias.f1);
  const sinVer = R.registrarVisita(d, { ferreteriaId: 'f2', resultado: 'no_estaba' }, false, HOY);
  assert.deepEqual([sinVer.marcas, sinVer.exhibidor], [null, null]);
  const otra = R.vacio();
  importarCSV(otra, exportarCSV(d), false);
  const g = otra.ferreterias.find(x => x.id === 'f1');
  assert.deepEqual([g.marcas, g.proveedores, g.observaciones], [['north'], ['chp'], 'Territorio rojo']);
  // Una celda vacía al importar no borra lo guardado.
  importarCSV(otra, 'id;nombre;observaciones;telefono\r\nf1;Alfa;;3001112233', false);
  assert.deepEqual([otra.ferreterias.find(x => x.id === 'f1').observaciones, otra.ferreterias.find(x => x.id === 'f1').telefono], ['Territorio rojo', '3001112233']);
});

test('presencia de marcas: % sobre las censadas, por municipio, exhibidores y proveedores', async () => {
  const E = await import('../src/nucleo/estadisticas.js');
  const d = base();   // f1 Z1, f2 y f3 Z2
  R.guardarFerreteria(d, { id: 'f1', marcas: ['socoda', 'north'], exhibidor: 'nuevo', proveedores: ['chp'] }, false);
  R.guardarFerreteria(d, { id: 'f2', marcas: ['socoda'], exhibidor: 'antiguo', proveedores: ['chp', 'corbeta'] }, false);
  // f3 sin censar: no cuenta en los porcentajes.
  const m = E.estadisticas(d, { dias: 30 }, HOY).marcas;
  assert.deepEqual([m.censadas, m.activas], [2, 3]);
  const socoda = m.porMarca.find(x => x.clave === 'socoda');
  assert.deepEqual([socoda.ferreterias, socoda.porcentaje], [2, 100]);
  assert.equal(m.porMarca.find(x => x.clave === 'north').porcentaje, 50);
  assert.deepEqual(m.porGrupo.find(g => g.clave === 'Z1').porMarca.north, 1);
  assert.deepEqual(m.exhibidores.map(x => x.ferreterias), [0, 1, 1]);
  assert.deepEqual(m.proveedores.map(p => [p.clave, p.ferreterias]), [['chp', 2], ['corbeta', 1]]);
});
