// Usuarios y sesiones en Postgres. Única parte del API que escribe SQL de usuarios.
import crypto from 'node:crypto';
import { ErrorCliente } from './repositorio.js';
import { hashClave, verificarClave, hashDeRelleno, nuevoToken, hashToken, DIAS_SESION } from './auth.js';
import { normalizarUsuario, validarClave, validarUsuarioNuevo, ROLES, LIMITES_USUARIO } from './validar.js';

const CAMPOS = `id, usuario, nombre, rol, activo, debe_cambiar_clave as "debeCambiarClave"`;
const publico = u => (u ? { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, activo: u.activo, debeCambiarClave: u.debeCambiarClave } : null);

export async function crearUsuario(pool, datos) {
  const r = validarUsuarioNuevo(datos);
  if (r.error) throw new ErrorCliente(r.error);
  const x = r.valor;
  try {
    const { rows } = await pool.query(
      `insert into usuarios (id, usuario, nombre, rol, clave_hash, debe_cambiar_clave)
       values ($1, $2, $3, $4, $5, $6) returning ${CAMPOS}`,
      ['u_' + crypto.randomUUID(), x.usuario, x.nombre, x.rol, await hashClave(x.clave), datos.debeCambiarClave !== false]
    );
    return publico(rows[0]);
  } catch (e) {
    if (e.code === '23505') throw new ErrorCliente('Ya existe el usuario "' + x.usuario + '"');
    throw e;
  }
}

// Devuelve { token, usuario } o null. Mismo tiempo de respuesta exista o no el usuario.
export async function ingresar(pool, usuario, clave) {
  const { rows } = await pool.query(`select ${CAMPOS}, clave_hash from usuarios where usuario = $1`, [normalizarUsuario(usuario)]);
  const u = rows[0];
  const ok = await verificarClave(typeof clave === 'string' ? clave : '', u ? u.clave_hash : await hashDeRelleno());
  if (!u || !ok || !u.activo) return null;
  const token = nuevoToken();
  await pool.query(
    `insert into sesiones (token_hash, usuario_id, expira) values ($1, $2, now() + make_interval(days => $3))`,
    [hashToken(token), u.id, DIAS_SESION]
  );
  return { token, usuario: publico(u) };
}

// Usuario de una sesión vigente, o null. La sesión se alarga mientras se use (máximo una vez al día).
export async function sesionDe(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `select u.id, u.usuario, u.nombre, u.rol, u.activo, u.debe_cambiar_clave as "debeCambiarClave", s.expira
       from sesiones s join usuarios u on u.id = s.usuario_id
      where s.token_hash = $1 and s.revocada is null and s.expira > now() and u.activo`,
    [hashToken(token)]
  );
  const u = rows[0];
  if (!u) return null;
  if (new Date(u.expira) - Date.now() < (DIAS_SESION - 1) * 86400000) {
    await pool.query(`update sesiones set expira = now() + make_interval(days => $2) where token_hash = $1`, [hashToken(token), DIAS_SESION]);
  }
  return publico(u);
}

export async function cerrarSesion(pool, token) {
  await pool.query('update sesiones set revocada = now() where token_hash = $1 and revocada is null', [hashToken(token)]);
}

async function revocarSesiones(cliente, usuarioId, salvoToken) {
  await cliente.query(
    'update sesiones set revocada = now() where usuario_id = $1 and revocada is null and token_hash <> $2',
    [usuarioId, salvoToken ? hashToken(salvoToken) : '']
  );
}

// El usuario cambia su propia contraseña: cierra sus otras sesiones y quita la obligación de cambiarla.
export async function cambiarClave(pool, usuario, actual, nueva, tokenActual) {
  const { rows } = await pool.query('select clave_hash from usuarios where id = $1', [usuario.id]);
  if (!rows[0] || !(await verificarClave(typeof actual === 'string' ? actual : '', rows[0].clave_hash))) {
    throw new ErrorCliente('La contraseña actual no es correcta');
  }
  const c = validarClave(nueva, false);
  if (c.error) throw new ErrorCliente(c.error);
  if (c.valor === actual) throw new ErrorCliente('La nueva contraseña debe ser distinta de la actual');
  await pool.query(
    'update usuarios set clave_hash = $2, debe_cambiar_clave = false, actualizado = now() where id = $1',
    [usuario.id, await hashClave(c.valor)]
  );
  await revocarSesiones(pool, usuario.id, tokenActual);
}

export async function listarUsuarios(pool) {
  const { rows } = await pool.query(`select ${CAMPOS} from usuarios order by activo desc, nombre, usuario`);
  return rows.map(publico);
}

// Un administrador cambia nombre, rol, activo o pone una contraseña temporal.
// Siempre debe quedar al menos un administrador activo.
export async function actualizarUsuario(pool, id, cambios, quien) {
  const cliente = await pool.connect();
  try {
    await cliente.query('begin');
    const { rows } = await cliente.query(`select ${CAMPOS} from usuarios where id = $1 for update`, [id]);
    const u = rows[0];
    if (!u) throw new ErrorCliente('El usuario no existe');
    const nuevo = { nombre: u.nombre, rol: u.rol, activo: u.activo };
    if (cambios.nombre !== undefined) {
      const n = String(cambios.nombre || '').trim();
      if (!n || n.length > LIMITES_USUARIO.nombre) throw new ErrorCliente('Nombre no válido');
      nuevo.nombre = n;
    }
    if (cambios.rol !== undefined) {
      if (!ROLES.includes(cambios.rol)) throw new ErrorCliente('Rol no válido');
      nuevo.rol = cambios.rol;
    }
    if (cambios.activo !== undefined) {
      if (typeof cambios.activo !== 'boolean') throw new ErrorCliente('activo no válido');
      nuevo.activo = cambios.activo;
    }
    if (u.id === quien.id && (!nuevo.activo || nuevo.rol !== 'admin')) {
      throw new ErrorCliente('No puedes quitarte el rol de administrador ni desactivarte a ti mismo');
    }
    if (u.rol === 'admin' && u.activo && (!nuevo.activo || nuevo.rol !== 'admin')) {
      const { rows: a } = await cliente.query("select count(*)::int as n from usuarios where rol = 'admin' and activo and id <> $1", [id]);
      if (!a[0].n) throw new ErrorCliente('Debe quedar al menos un administrador activo');
    }
    let hash = null;
    if (cambios.clave !== undefined) {
      const c = validarClave(cambios.clave, true);
      if (c.error) throw new ErrorCliente(c.error);
      hash = await hashClave(c.valor);
    }
    const { rows: r } = await cliente.query(
      `update usuarios set nombre = $2, rol = $3, activo = $4,
              clave_hash = coalesce($5, clave_hash),
              debe_cambiar_clave = case when $5::text is null then debe_cambiar_clave else true end,
              actualizado = now()
        where id = $1 returning ${CAMPOS}`,
      [id, nuevo.nombre, nuevo.rol, nuevo.activo, hash]
    );
    // Desactivado o con contraseña nueva: sus sesiones abiertas dejan de servir.
    if (!nuevo.activo || hash) await revocarSesiones(cliente, id, null);
    await cliente.query('commit');
    return publico(r[0]);
  } catch (e) {
    await cliente.query('rollback').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}
