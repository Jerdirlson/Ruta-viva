// Aplica correcciones exactas a ferreterías del servidor desde la terminal: cada corrección
// es { id, ...campos } y esos campos quedan tal cual (también vacíos: "" o []). Si el id no
// existe, se crea (debe traer nombre). Sirve para arreglar datos mal cruzados.
//
//   node api/scripts/corregir.mjs https://136-108-178-241.sslip.io api/datos-google/correcciones.json
//
// Pide usuario y contraseña (la contraseña no se ve). Para pruebas sin teclado: RV_USUARIO y RV_CLAVE.
import fs from 'node:fs';
import readline from 'node:readline';

const [servidor, archivo] = process.argv.slice(2);
if (!servidor || !archivo) {
  console.error('Uso: node api/scripts/corregir.mjs <https://servidor> <correcciones.json>');
  process.exit(2);
}
const base = servidor.replace(/\/+$/, '');

function preguntar(texto, oculto) {
  return new Promise(resolver => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = s => { if (s.includes(texto)) process.stdout.write(texto); };
    rl.question(texto, r => { rl.close(); if (oculto) process.stdout.write('\n'); resolver(r); });
  });
}
async function api(ruta, cuerpo, token) {
  const res = await fetch(base + ruta, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify(cuerpo || {})
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'El servidor respondió ' + res.status);
  return j;
}

const correcciones = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const usuario = process.env.RV_USUARIO || await preguntar('Usuario: ');
const clave = process.env.RV_CLAVE || await preguntar('Contraseña: ', true);
const { token, usuario: yo } = await api('/api/ingresar', { usuario: usuario.trim(), clave });
try {
  if (yo.debeCambiarClave) throw new Error('Tienes contraseña temporal: entra primero a la app y cámbiala.');
  const actuales = new Map((await api('/api/sync', {}, token)).ferreterias.map(f => [f.id, f]));
  const faltan = correcciones.filter(c => !actuales.has(c.id) && !c.nombre);
  faltan.forEach(c => console.log('se salta ' + c.id + ': no existe en el servidor (carga primero el censo)'));
  const lote = correcciones.filter(c => !faltan.includes(c)).map(c => Object.assign({}, actuales.get(c.id) || {}, c));
  lote.forEach(f => console.log((actuales.has(f.id) ? 'corrige ' : 'crea    ') + f.id + ' · ' + f.nombre + ' · ' + f.municipio));
  const r = await api('/api/sync', { ferreterias: lote }, token);
  console.log('Listo. Rechazadas: ' + r.rechazadas.length);
  r.rechazadas.forEach(x => console.log('  rechazada', x.id, '-', x.motivo));
} finally {
  await api('/api/salir', {}, token).catch(() => {});
}
