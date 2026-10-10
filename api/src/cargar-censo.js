// Carga inicial del censo directo a la base (sin pasar por la app). Se corre en el servidor:
//
//   docker compose cp ferreterias-google.json api:/tmp/censo.json
//   docker compose exec api node src/cargar-censo.js /tmp/censo.json
//
// Acepta el JSON de api/scripts/buscar-google.mjs ({ ferreterias: [...] }) o una lista.
// Solo inserta las que NO existen: volver a correrlo no pisa lo que los vendedores
// ya corrigieron en la calle. Las inválidas se informan con su motivo.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { sincronizar, MAX_LOTE } from './repositorio.js';

// Solo firma visitas y descartes, y la carga no trae ninguno.
const SISTEMA = { id: null, nombre: 'Carga inicial' };

export async function cargarCenso(pool, lista) {
  if (!Array.isArray(lista)) throw new Error('El archivo no trae una lista de ferreterías');
  const ids = lista.map(f => f && f.id).filter(Boolean);
  const { rows } = await pool.query('select id from ferreterias where id = any($1)', [ids]);
  const existentes = new Set(rows.map(r => r.id));
  const vistas = new Set();
  const nuevas = lista.filter(f => f && !existentes.has(f.id) && !vistas.has(f.id) && vistas.add(f.id));
  let rechazadas = [];
  for (let i = 0; i < nuevas.length; i += MAX_LOTE) {
    const r = await sincronizar(pool, { ferreterias: nuevas.slice(i, i + MAX_LOTE) }, SISTEMA);
    rechazadas = rechazadas.concat(r.rechazadas);
  }
  return { recibidas: lista.length, yaExistian: lista.length - nuevas.length, insertadas: nuevas.length - rechazadas.length, rechazadas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivo = process.argv[2];
  if (!archivo) {
    console.error('Uso: node src/cargar-censo.js <archivo.json>');
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  (async () => {
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const r = await cargarCenso(pool, Array.isArray(d) ? d : d.ferreterias);
    console.log(`Recibidas: ${r.recibidas} · ya existían: ${r.yaExistian} · insertadas: ${r.insertadas} · rechazadas: ${r.rechazadas.length}`);
    r.rechazadas.slice(0, 10).forEach(x => console.log('  rechazada', x.id, '-', x.motivo));
    const { rows } = await pool.query('select count(*)::int as n from ferreterias');
    console.log('Ferreterías en la base: ' + rows[0].n);
  })()
    .catch(e => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
