// Punto de entrada del API.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { leerConfig, erroresConfig } from './config.js';
import { crearApp } from './app.js';

const config = leerConfig();
const errores = erroresConfig(config);
if (errores.length) {
  errores.forEach(e => console.error('Configuración: ' + e));
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on('error', e => console.error('Conexión de Postgres perdida', e.message));

const dirWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
const servidor = crearApp({ pool, dirWeb })
  .listen(config.puerto, () => console.log('Ruta-viva API en el puerto ' + config.puerto));

function cerrar() {
  servidor.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
