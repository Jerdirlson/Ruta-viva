// Pruebas contra un Postgres real. Las levanta api/run-tests.sh, que define:
//   RV_TEST_ADMIN_URL  usuario dueño de una base vacía
//   RV_TEST_APP_URL    misma base, con el rol rutaviva_app y la clave RV_TEST_APP_PASSWORD
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrar } from '../src/migrar.js';
import { crearApp } from '../src/app.js';
import { MAX_LOTE } from '../src/repositorio.js';

const { RV_TEST_ADMIN_URL, RV_TEST_APP_URL, RV_TEST_APP_PASSWORD } = process.env;
const omitir = !RV_TEST_ADMIN_URL || !RV_TEST_APP_URL;
const aqui = path.dirname(fileURLToPath(import.meta.url));
const CLAVE = 'clave-de-prueba-0123456789abcdef';

let pool, servidor, base;

before(async () => {
  if (omitir) return;
  const opciones = {
    urlAdmin: RV_TEST_ADMIN_URL,
    claveApp: RV_TEST_APP_PASSWORD,
    dirMigraciones: path.join(aqui, '../migrations'),
    log: () => {}
  };
  await migrar(opciones);
  await migrar(opciones); // idempotente: la segunda vez no aplica nada ni falla
  pool = new pg.Pool({ connectionString: RV_TEST_APP_URL, max: 4 });
  const app = crearApp({ pool, claveEquipo: CLAVE, dirWeb: path.join(aqui, '../../web') });
  await new Promise(r => { servidor = app.listen(0, '127.0.0.1', r); });
  base = 'http://127.0.0.1:' + servidor.address().port;
});

after(async () => {
  if (omitir) return;
  await new Promise(r => servidor.close(r));
  await pool.end();
});

const sync = (cuerpo, clave = CLAVE) => fetch(base + '/api/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Clave-Equipo': clave },
  body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
});

const ferre = (id, extra = {}) => Object.assign({ id, nombre: 'Ferretería ' + id, municipio: 'Bucaramanga', zona: 'Zona 1' }, extra);
const visita = (id, ferreteriaId, extra = {}) => Object.assign({
  id, ferreteriaId, fecha: '2026-10-10', vendedor: 'Ana', resultado: 'compro',
  lineas: ['estufa'], competencia: '', notas: '', creada: '2026-10-10T15:00:00.000Z'
}, extra);

test('salud responde e identifica la app', { skip: omitir }, async () => {
  const r = await fetch(base + '/api/salud');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, app: 'ruta-viva' });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('sin clave o con clave equivocada: 401 y no se escribe nada', { skip: omitir }, async () => {
  assert.equal((await sync({ ferreterias: [ferre('intruso')] }, '')).status, 401);
  assert.equal((await sync({ ferreterias: [ferre('intruso')] }, 'otra-clave')).status, 401);
  const { rows } = await pool.query("select 1 from ferreterias where id = 'intruso'");
  assert.equal(rows.length, 0);
});

test('sincroniza ferretería y visita, y devuelve el estado completo', { skip: omitir }, async () => {
  const r = await sync({ ferreterias: [ferre('a1')], visitas: [visita('va1', 'a1')] });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j.rechazadas, []);
  assert.ok(j.ferreterias.some(f => f.id === 'a1' && f.nombre === 'Ferretería a1'));
  const v = j.visitas.find(x => x.id === 'va1');
  assert.equal(v.ferreteriaId, 'a1');
  assert.equal(v.fecha, '2026-10-10'); // sin corrimiento por zona horaria
  assert.deepEqual(v.lineas, ['estufa']);
});

test('reenviar la misma visita no la duplica', { skip: omitir }, async () => {
  await sync({ ferreterias: [ferre('b1')], visitas: [visita('vb1', 'b1')] });
  await sync({ visitas: [visita('vb1', 'b1')] });
  const { rows } = await pool.query("select count(*)::int as n from visitas where id = 'vb1'");
  assert.equal(rows[0].n, 1);
});

test('actualizar una ferretería reemplaza sus datos', { skip: omitir }, async () => {
  await sync({ ferreterias: [ferre('c1', { telefono: '3000000001' })] });
  const j = await (await sync({ ferreterias: [ferre('c1', { telefono: '3111111111' })] })).json();
  assert.equal(j.ferreterias.find(f => f.id === 'c1').telefono, '3111111111');
});

test('lo inválido se rechaza con motivo sin tumbar el resto del lote', { skip: omitir }, async () => {
  const j = await (await sync({
    ferreterias: [ferre('d1'), { id: 'd2', nombre: '' }],
    visitas: [visita('vd1', 'd1'), visita('vd2', 'd1', { resultado: 'quizas' }), visita('vd3', 'no-existe')]
  })).json();
  const motivos = Object.fromEntries(j.rechazadas.map(r => [r.id, r.motivo]));
  assert.match(motivos.d2, /nombre/);
  assert.match(motivos.vd2, /Resultado/);
  assert.match(motivos.vd3, /no existe/);
  assert.ok(j.ferreterias.some(f => f.id === 'd1'));
  assert.ok(j.visitas.some(v => v.id === 'vd1'));
});

test('JSON roto: 400; lote demasiado grande: 400', { skip: omitir }, async () => {
  assert.equal((await sync('{roto')).status, 400);
  const grande = { visitas: Array.from({ length: MAX_LOTE + 1 }, (_, i) => ({ id: 'x' + i })) };
  assert.equal((await sync(grande)).status, 400);
});

test('sirve la app web, pero solo la carpeta web/', { skip: omitir }, async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /SOCODA/);
  assert.equal((await fetch(base + '/package.json')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/api/src/server.js')).status, 404);
  assert.equal((await fetch(base + '/api/no-existe')).status, 404);
});

// La frontera de seguridad se verifica atacándola: el rol de la app no puede
// borrar historial ni tocar el esquema aunque alguien obtenga su contraseña.
test('el rol de la app no puede borrar ni cambiar el esquema', { skip: omitir }, async () => {
  const intentos = [
    'delete from visitas',
    'delete from ferreterias',
    'truncate visitas',
    'drop table visitas',
    'alter table ferreterias add column x int',
    'create table intrusa (x int)',
    'select * from schema_migraciones'
  ];
  for (const sql of intentos) {
    await assert.rejects(pool.query(sql), /permission denied|must be owner/, sql);
  }
});

test('migrar fija el rol de la app sin privilegios especiales', { skip: omitir }, async () => {
  const admin = new pg.Client({ connectionString: RV_TEST_ADMIN_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query(
      "select rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = 'rutaviva_app'"
    );
    assert.deepEqual(rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
  } finally {
    await admin.end();
  }
});

test('guarda la ubicación y un envío sin ubicación no la borra', { skip: omitir }, async () => {
  let j = await (await sync({ ferreterias: [ferre('u1', { lat: 7.1186, lng: -73.1105 })] })).json();
  assert.deepEqual([j.ferreterias.find(f => f.id === 'u1').lat, j.ferreterias.find(f => f.id === 'u1').lng], [7.1186, -73.1105]);
  j = await (await sync({ ferreterias: [ferre('u1', { telefono: '3009998877' })] })).json();
  const f = j.ferreterias.find(x => x.id === 'u1');
  assert.equal(f.telefono, '3009998877');
  assert.deepEqual([f.lat, f.lng], [7.1186, -73.1105]);
});

test('ubicación incompleta o fuera de rango se rechaza con motivo', { skip: omitir }, async () => {
  const j = await (await sync({ ferreterias: [ferre('u2', { lat: 7.1 }), ferre('u3', { lat: 200, lng: 0 })] })).json();
  const motivos = Object.fromEntries(j.rechazadas.map(r => [r.id, r.motivo]));
  assert.match(motivos.u2, /incompleta/);
  assert.match(motivos.u3, /rango/);
});

test('la política de contenido permite solo las teselas de OpenStreetMap', { skip: omitir }, async () => {
  const csp = (await fetch(base + '/')).headers.get('content-security-policy');
  assert.match(csp, /img-src 'self' data: https:\/\/tile\.openstreetmap\.org;/);
  assert.match(csp, /default-src 'self'/);
});

test('guarda contacto, datos comerciales y de Google', { skip: omitir }, async () => {
  const extra = {
    tipo: 'materiales', encargado: 'Don Pedro', whatsapp: '3001234567', correo: 'ventas@ejemplo.co',
    categoria: 'A', clienteSocoda: true, vendedorAsignado: 'Ana', googlePlaceId: 'ChIJabc',
    web: 'https://ejemplo.co', horario: 'lunes: 8:00–18:00', calificacion: 4.5, resenas: 120
  };
  const j = await (await sync({ ferreterias: [ferre('e1', extra)] })).json();
  assert.deepEqual(j.rechazadas, []);
  const f = j.ferreterias.find(x => x.id === 'e1');
  for (const [k, v] of Object.entries(extra)) assert.deepEqual(f[k], v, k);
});

test('una ferretería sin los campos nuevos los recibe con valores por defecto', { skip: omitir }, async () => {
  const f = (await (await sync({ ferreterias: [ferre('e2')] })).json()).ferreterias.find(x => x.id === 'e2');
  assert.equal(f.tipo, 'ferreteria');
  assert.equal(f.encargado, '');
  assert.equal(f.clienteSocoda, false);
  assert.equal(f.calificacion, null);
});

// Un celular con la versión vieja de la app reenvía la ferretería sin los campos nuevos.
test('un envío sin los campos nuevos no borra los guardados', { skip: omitir }, async () => {
  await sync({ ferreterias: [ferre('e3', { encargado: 'Doña Marta', categoria: 'B', clienteSocoda: true, resenas: 7 })] });
  const j = await (await sync({ ferreterias: [ferre('e3', { telefono: '3115550000' })] })).json();
  const f = j.ferreterias.find(x => x.id === 'e3');
  assert.equal(f.telefono, '3115550000');
  assert.equal(f.encargado, 'Doña Marta');
  assert.equal(f.categoria, 'B');
  assert.equal(f.clienteSocoda, true);
  assert.equal(f.resenas, 7);
  // Pero sí se pueden vaciar a propósito.
  const k = (await (await sync({ ferreterias: [ferre('e3', { encargado: '', categoria: '', clienteSocoda: false })] })).json())
    .ferreterias.find(x => x.id === 'e3');
  assert.deepEqual([k.encargado, k.categoria, k.clienteSocoda], ['', '', false]);
});

test('campos nuevos inválidos se rechazan con motivo', { skip: omitir }, async () => {
  const j = await (await sync({ ferreterias: [
    ferre('e4', { categoria: 'Z' }), ferre('e5', { tipo: 'panaderia' }),
    ferre('e6', { calificacion: 9 }), ferre('e7', { encargado: 'x'.repeat(81) })
  ] })).json();
  const motivos = Object.fromEntries(j.rechazadas.map(r => [r.id, r.motivo]));
  assert.match(motivos.e4, /Categoría/);
  assert.match(motivos.e5, /Tipo/);
  assert.match(motivos.e6, /Calificación/);
  assert.match(motivos.e7, /encargado/);
});

test('descartar una ferretería, conservar el descarte y reactivarla', { skip: omitir }, async () => {
  await sync({ ferreterias: [ferre('x1')], visitas: [visita('vx1', 'x1')] });
  let f = (await (await sync({ ferreterias: [ferre('x1', { descartada: 'no_existe', descartadaPor: 'Ana', descartadaFecha: '2026-10-10' })] })).json())
    .ferreterias.find(x => x.id === 'x1');
  assert.deepEqual([f.descartada, f.descartadaPor, f.descartadaFecha], ['no_existe', 'Ana', '2026-10-10']);
  // Un celular con la versión vieja no la reactiva sin querer.
  f = (await (await sync({ ferreterias: [ferre('x1', { telefono: '3001112233' })] })).json()).ferreterias.find(x => x.id === 'x1');
  assert.equal(f.descartada, 'no_existe');
  // Reactivar es a propósito, con vacíos. Las visitas siguen ahí.
  const j = await (await sync({ ferreterias: [ferre('x1', { descartada: '', descartadaPor: '', descartadaFecha: '' })] })).json();
  f = j.ferreterias.find(x => x.id === 'x1');
  assert.deepEqual([f.descartada, f.descartadaPor, f.descartadaFecha], ['', '', '']);
  assert.ok(j.visitas.some(v => v.id === 'vx1'));
});
