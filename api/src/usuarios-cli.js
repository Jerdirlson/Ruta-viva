// Administrar usuarios desde el servidor (para el primer administrador o si nadie puede entrar).
// Corre dentro del contenedor del API, que ya tiene DATABASE_URL:
//
//   docker compose exec api node src/usuarios-cli.js crear <usuario> "<Nombre>" <admin|vendedor>
//   docker compose exec api node src/usuarios-cli.js clave <usuario>      # contraseña temporal nueva
//   docker compose exec api node src/usuarios-cli.js listar
//
// La contraseña temporal se toma de CLAVE_NUEVA o se genera; se muestra una sola vez y el
// usuario debe cambiarla al entrar.
import crypto from 'node:crypto';
import pg from 'pg';
import { crearUsuario, listarUsuarios, actualizarUsuario } from './usuarios.js';
import { normalizarUsuario } from './validar.js';

const [orden, usuario, nombre, rol] = process.argv.slice(2);
const clave = process.env.CLAVE_NUEVA || crypto.randomBytes(9).toString('base64url');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

async function main() {
  if (orden === 'crear') {
    const u = await crearUsuario(pool, { usuario, nombre, rol, clave });
    console.log(`Creado: ${u.usuario} (${u.nombre}, ${u.rol}). Contraseña temporal: ${clave}`);
  } else if (orden === 'clave') {
    const { rows } = await pool.query('select id from usuarios where usuario = $1', [normalizarUsuario(usuario)]);
    if (!rows[0]) throw new Error('No existe el usuario "' + usuario + '"');
    // Como lo hace un administrador desde la app; aquí no hay administrador en sesión.
    const u = await actualizarUsuario(pool, rows[0].id, { clave }, { id: '' });
    console.log(`Contraseña temporal de ${u.usuario}: ${clave} (se pide cambiarla al entrar; sus sesiones se cerraron)`);
  } else if (orden === 'listar') {
    (await listarUsuarios(pool)).forEach(u =>
      console.log([u.usuario, u.nombre, u.rol, u.activo ? 'activo' : 'inactivo', u.debeCambiarClave ? 'debe cambiar clave' : ''].join(' · ')));
  } else {
    console.log('Uso: node src/usuarios-cli.js crear <usuario> "<Nombre>" <admin|vendedor> | clave <usuario> | listar');
    process.exitCode = 2;
  }
}

main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
