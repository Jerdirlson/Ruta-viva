// Importa un CSV del censo al servidor desde la terminal, con el mismo comportamiento de
// "Datos -> Importar censo (CSV)" de la app (app/src/nucleo/csv.js): actualiza por id o por
// nombre + dirección + municipio, solo las columnas que trae, y una celda vacía no borra.
//
//   node api/scripts/importar-csv.mjs https://136-108-178-241.sslip.io api/datos-google/censo-socoda.csv
//
// Pide usuario y contraseña (la contraseña no se ve). Para pruebas sin teclado: RV_USUARIO y RV_CLAVE.
import fs from 'node:fs';
import readline from 'node:readline';
import { vacio } from '../../app/src/nucleo/reglas.js';
import { importarCSV } from '../../app/src/nucleo/csv.js';
import { armarLote, aplicarRespuesta } from '../../app/src/nucleo/sync.js';

const [servidor, archivo] = process.argv.slice(2);
if (!servidor || !archivo) {
  console.error('Uso: node api/scripts/importar-csv.mjs <https://servidor> <archivo.csv>');
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

const usuario = process.env.RV_USUARIO || await preguntar('Usuario: ');
const clave = process.env.RV_CLAVE || await preguntar('Contraseña: ', true);
const { token, usuario: yo } = await api('/api/ingresar', { usuario: usuario.trim(), clave });
try {
  if (yo.debeCambiarClave) throw new Error('Tienes contraseña temporal: entra primero a la app y cámbiala.');
  console.log('Hola, ' + yo.nombre + '. Bajando el censo del servidor…');
  const datos = vacio();
  aplicarRespuesta(datos, { ferreterias: [], visitas: [] }, await api('/api/sync', {}, token));
  const antes = datos.ferreterias.length;
  const r = importarCSV(datos, fs.readFileSync(archivo, 'utf8'), true);
  console.log(`En el servidor había ${antes}. Del archivo: ${r.nuevas} nuevas, ${r.actualizadas} actualizadas, ${r.omitidas} omitidas. Enviando…`);
  const lote = armarLote(datos);
  const resp = await api('/api/sync', lote, token);
  const total = (await api('/api/sync', {}, token)).ferreterias.length;
  console.log(`Listo. Ahora hay ${total} ferreterías en el servidor. Rechazadas: ${resp.rechazadas.length}`);
  resp.rechazadas.slice(0, 10).forEach(x => console.log('  rechazada', x.id, '-', x.motivo));
} finally {
  await api('/api/salir', {}, token).catch(() => {});
}
