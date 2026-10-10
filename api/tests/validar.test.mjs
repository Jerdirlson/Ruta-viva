import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarUsuarioNuevo, validarClave, validarFerreteria, validarVisita, fechaValida, LIMITES } from '../src/validar.js';
import { leerConfig, erroresConfig } from '../src/config.js';

const visita = (extra = {}) => Object.assign({
  id: 'v1', ferreteriaId: 'f1', fecha: '2026-10-10', vendedor: 'Ana', resultado: 'compro',
  lineas: ['estufa', 'meson'], competencia: 'MarcaX', notas: 'ok', creada: '2026-10-10T15:00:00.000Z'
}, extra);

test('ferretería válida se normaliza (recorta espacios, completa vacíos)', () => {
  const r = validarFerreteria({ id: ' f1 ', nombre: '  Ferre  ', municipio: 'Girón' });
  assert.deepEqual(r.valor, {
    id: 'f1', nombre: 'Ferre', direccion: '', barrio: '', municipio: 'Girón', telefono: '', zona: '', lat: null, lng: null,
    // Campos de la migración 003 que no vinieron: null = el servidor conserva lo guardado.
    encargado: null, whatsapp: null, correo: null, vendedorAsignado: null, googlePlaceId: null, web: null, horario: null,
    tipo: null, categoria: null, clienteSocoda: null, calificacion: null, resenas: null,
    descartada: null, descartadaPor: null, descartadaFecha: null
  });
});

test('campos de contacto y comerciales: válidos pasan, inválidos se rechazan', () => {
  const base = { id: 'f1', nombre: 'Ferre' };
  const ok = validarFerreteria(Object.assign({}, base, {
    encargado: ' Don Pedro ', categoria: 'A', tipo: 'materiales', clienteSocoda: false, calificacion: '4.5', resenas: 3
  })).valor;
  assert.deepEqual([ok.encargado, ok.categoria, ok.tipo, ok.clienteSocoda, ok.calificacion, ok.resenas],
    ['Don Pedro', 'A', 'materiales', false, 4.5, 3]);
  assert.match(validarFerreteria(Object.assign({}, base, { categoria: 'a' })).error, /Categoría/);
  assert.match(validarFerreteria(Object.assign({}, base, { clienteSocoda: 'si' })).error, /clienteSocoda/);
  assert.match(validarFerreteria(Object.assign({}, base, { resenas: 1.5 })).error, /Reseñas/);
  assert.match(validarFerreteria(Object.assign({}, base, { correo: 'x'.repeat(LIMITES.correo + 1) })).error, /correo/);
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

test('config: sin base, el API no arranca', () => {
  assert.equal(erroresConfig(leerConfig({})).length, 1);
  assert.deepEqual(erroresConfig(leerConfig({ DATABASE_URL: 'postgres://x' })), []);
});

test('ubicación: opcional, completa y dentro de rango', async () => {
  const { validarCoordenadas } = await import('../src/validar.js');
  assert.deepEqual(validarCoordenadas(null, undefined).valor, { lat: null, lng: null });
  assert.deepEqual(validarCoordenadas('7.1186', -73.1105).valor, { lat: 7.1186, lng: -73.1105 });
  assert.match(validarCoordenadas(7.1, null).error, /incompleta/);
  assert.match(validarCoordenadas('abc', -73).error, /incompleta/);
  assert.match(validarCoordenadas(91, -73).error, /rango/);
  assert.match(validarFerreteria({ id: 'f1', nombre: 'X', lat: 7.1 }).error, /incompleta/);
  assert.equal(validarFerreteria({ id: 'f1', nombre: 'X', lat: 7.1, lng: -73.1 }).valor.lng, -73.1);
});

test('descartar: motivo, quién y fecha válidos; reactivar con vacíos', () => {
  const base = { id: 'f1', nombre: 'Ferre' };
  const ok = validarFerreteria(Object.assign({}, base, { descartada: 'cerro', descartadaPor: ' Ana ', descartadaFecha: '2026-10-10' })).valor;
  assert.deepEqual([ok.descartada, ok.descartadaPor, ok.descartadaFecha], ['cerro', 'Ana', '2026-10-10']);
  const activa = validarFerreteria(Object.assign({}, base, { descartada: '', descartadaPor: '', descartadaFecha: '' })).valor;
  assert.deepEqual([activa.descartada, activa.descartadaPor, activa.descartadaFecha], ['', '', '']);
  assert.match(validarFerreteria(Object.assign({}, base, { descartada: 'borrada' })).error, /descarte/);
  assert.match(validarFerreteria(Object.assign({}, base, { descartadaFecha: '2026-13-01' })).error, /Fecha de descarte/);
});

test('usuarios: formato del usuario, rol y contraseña (temporal corta, propia de 8 o más)', () => {
  const ok = validarUsuarioNuevo({ usuario: ' Norberto.Caro ', nombre: ' Norberto Caro ', rol: 'vendedor', clave: '12345' }).valor;
  assert.deepEqual([ok.usuario, ok.nombre, ok.rol], ['norberto.caro', 'Norberto Caro', 'vendedor']);
  assert.match(validarUsuarioNuevo({ usuario: 'con espacio', nombre: 'X', rol: 'vendedor', clave: '12345' }).error, /usuario/);
  assert.match(validarUsuarioNuevo({ usuario: 'josé', nombre: 'X', rol: 'vendedor', clave: '12345' }).error, /usuario/);
  assert.match(validarUsuarioNuevo({ usuario: 'ab', nombre: 'X', rol: 'vendedor', clave: '12345' }).error, /usuario/);
  assert.match(validarUsuarioNuevo({ usuario: 'pepe', nombre: 'X', rol: 'jefe', clave: '12345' }).error, /Rol/);
  assert.match(validarUsuarioNuevo({ usuario: 'pepe', nombre: '', rol: 'vendedor', clave: '12345' }).error, /nombre/);
  assert.match(validarClave('1234567', false).error, /8/);
  assert.ok(validarClave('12345678', false).valor);
  assert.ok(validarClave('1234', true).valor);
  assert.match(validarClave('123', true).error, /4/);
});
