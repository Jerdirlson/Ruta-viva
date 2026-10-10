// Aplica migrations/*.sql en orden, una sola vez cada una, y deja listo el rol de la app.
//
// Corre con el usuario DUEÑO de la base (DATABASE_URL_ADMIN), nunca con el de la app.
// El API se conecta con `rutaviva_app`: no es dueño de nada, no puede borrar ni
// cambiar el esquema, solo leer, insertar y actualizar ferreterías y visitas.
//
//   DATABASE_URL_ADMIN=... APP_DB_PASSWORD=... node src/migrar.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

export const ROL_APP = 'rutaviva_app';
const CANDADO = 727001; // pg_advisory_lock: dos migraciones a la vez no se pisan

export async function migrar({ urlAdmin, claveApp, dirMigraciones, log = console.log }) {
  if (!urlAdmin) throw new Error('Falta DATABASE_URL_ADMIN');
  if (!claveApp || claveApp.length < 16) throw new Error('APP_DB_PASSWORD debe tener al menos 16 caracteres');

  const cliente = new pg.Client({ connectionString: urlAdmin });
  await cliente.connect();
  try {
    await cliente.query('select pg_advisory_lock($1)', [CANDADO]);
    await cliente.query(
      `create table if not exists schema_migraciones (
         nombre text primary key,
         aplicada timestamptz not null default now()
       )`
    );
    const hechas = new Set((await cliente.query('select nombre from schema_migraciones')).rows.map(r => r.nombre));
    const archivos = fs.readdirSync(dirMigraciones).filter(a => a.endsWith('.sql')).sort();

    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(dirMigraciones, archivo), 'utf8');
      await cliente.query('begin');
      try {
        await cliente.query(sql);
        await cliente.query('insert into schema_migraciones (nombre) values ($1)', [archivo]);
        await cliente.query('commit');
        log('Migración aplicada: ' + archivo);
      } catch (e) {
        await cliente.query('rollback');
        throw new Error('Falló ' + archivo + ': ' + e.message);
      }
    }

    await asegurarRolApp(cliente, claveApp);
  } finally {
    await cliente.query('select pg_advisory_unlock($1)', [CANDADO]).catch(() => {});
    await cliente.end();
  }
}

// Se corre en cada arranque: crea el rol si falta, fija su contraseña (así rotarla es
// cambiar el .env y volver a migrar) y reafirma permisos mínimos.
async function asegurarRolApp(cliente, clave) {
  const existe = (await cliente.query('select 1 from pg_roles where rolname = $1', [ROL_APP])).rowCount > 0;
  const atributos = 'login nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  const literal = cliente.escapeLiteral(clave);
  await cliente.query(
    (existe ? 'alter role ' : 'create role ') + ROL_APP + ' with ' + atributos + ' password ' + literal
  );

  const base = cliente.escapeIdentifier((await cliente.query('select current_database() as d')).rows[0].d);
  await cliente.query('revoke all on database ' + base + ' from public');
  await cliente.query('grant connect on database ' + base + ' to ' + ROL_APP);
  await cliente.query('revoke create on schema public from public');
  await cliente.query('grant usage on schema public to ' + ROL_APP);
  await cliente.query('revoke all on all tables in schema public from ' + ROL_APP);
  await cliente.query('grant select, insert, update on ferreterias, visitas to ' + ROL_APP);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  migrar({ urlAdmin: process.env.DATABASE_URL_ADMIN, claveApp: process.env.APP_DB_PASSWORD, dirMigraciones: dir })
    .then(() => console.log('Base de datos al día'))
    .catch(e => {
      console.error(e.message);
      process.exit(1);
    });
}
