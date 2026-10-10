import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarFerreteria, validarVisita, fechaValida, LIMITES } from '../src/validar.js';
import { leerConfig, erroresConfig } from '../src/config.js';

const visita = (extra = {}) => Object.assign({
  id: 'v1', ferreteriaId: 'f1', fecha: '2026-10-10', vendedor: 'Ana', resultado: 'compro',
  lineas: ['estufa', 'meson'], competencia: 'MarcaX', notas: 'ok', creada: '2026-10-10T15:00:00.000Z'
}, extra);

test('ferretería válida se normaliza (recorta espacios, completa vacíos)', () => {
  const r = validarFerreteria({ id: ' f1 ', nombre: '  Ferre  ', municipio: 'Girón' });
  assert.deepEqual(r.valor, { id: 'f1', nombre: 'Ferre', direccion: '', barrio: '', municipio: 'Girón', telefono: '', zona: '' });
});

test('ferretería sin nombre o sin id se rechaza', () => {
  assert.match(validarFerreteria({ id: 'f1', nombre: '  ' }).error, /nombre/);
  assert.match(validarFerreteria({ nombre: 'X' }).error, /id/);
  assert.ok(validarFerreteria(null).error);
});

test('ferretería con un campo más largo que el límite se rechaza', () => {
  const r = validarFerreteria({ id: 'f1', nombre: 'x'.repeat(LIMITES.nombre + 1) });
  assert.match(r.error, /nombre supera/);
  assert.ok(validarFerreteria({ id: 'f1', nombre: 'x'.repeat(LIMITES.nombre) }).valor);
});

test('visita válida conserva líneas sin duplicados', () => {
  const r = validarVisita(visita({ lineas: ['estufa', 'estufa'] }));
  assert.deepEqual(r.valor.lineas, ['estufa']);
  assert.equal(r.valor.creada, '2026-10-10T15:00:00.000Z');
});

test('visita con resultado, línea o fecha inválidos se rechaza', () => {
  assert.match(validarVisita(visita({ resultado: 'quizas' })).error, /Resultado/);
  assert.match(validarVisita(visita({ lineas: ['nevera'] })).error, /Línea/);
  assert.match(validarVisita(visita({ fecha: '2026-02-30' })).error, /Fecha/);
  assert.match(validarVisita(visita({ ferreteriaId: '' })).error, /ferreteriaId/);
});

test('visita sin hora de creación válida usa la hora del servidor', () => {
  const r = validarVisita(visita({ creada: 'no-es-fecha' }));
  assert.ok(!Number.isNaN(Date.parse(r.valor.creada)));
});

test('fechaValida exige fecha real entre 2000 y 2100', () => {
  assert.equal(fechaValida('2024-02-29'), true);
  assert.equal(fechaValida('2023-02-29'), false);
  assert.equal(fechaValida('1999-12-31'), false);
  assert.equal(fechaValida('2026-1-1'), false);
  assert.equal(fechaValida(20261010), false);
});

test('config: sin base o con clave corta, el API no arranca', () => {
  assert.equal(erroresConfig(leerConfig({})).length, 2);
  assert.equal(erroresConfig(leerConfig({ DATABASE_URL: 'postgres://x', CLAVE_EQUIPO: 'corta' })).length, 1);
  assert.deepEqual(erroresConfig(leerConfig({ DATABASE_URL: 'postgres://x', CLAVE_EQUIPO: 'a'.repeat(32) })), []);
});
