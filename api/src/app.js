// Aplicación Express: API de sincronización y la app web (carpeta web/) desde el mismo origen.
//
// Cada vendedor entra con su usuario y contraseña (POST /api/ingresar) y recibe un token
// de sesión que manda en `Authorization: Bearer <token>`. Ver src/usuarios.js y src/auth.js.
import express from 'express';
import { sincronizar, ErrorCliente } from './repositorio.js';
import { ingresar, sesionDe, cerrarSesion, cambiarClave, listarUsuarios, crearUsuario, actualizarUsuario } from './usuarios.js';
import { crearLimitador } from './auth.js';
import { normalizarUsuario } from './validar.js';

function tokenDe(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  return m ? m[1] : '';
}

// Errores en rutas async de Express 5 llegan solos al manejador de errores.
export function crearApp({ pool, dirWeb, limitador = crearLimitador() }) {
  const app = express();
  app.disable('x-powered-by');
  // Detrás de Caddy (o del túnel): la IP real del celular viene en X-Forwarded-For.
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        // Las teselas del mapa vienen de OpenStreetMap; nada más se carga de afuera.
        "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; object-src 'none'; base-uri 'self'; " +
        "frame-ancestors 'none'; form-action 'self'"
    });
    next();
  });

  // `app` permite al teléfono saber que lo sirve este API (y no un servidor estático).
  app.get('/api/salud', async (req, res) => {
    try {
      await pool.query('select 1');
      res.json({ ok: true, app: 'ruta-viva' });
    } catch (e) {
      res.status(503).json({ ok: false, app: 'ruta-viva' });
    }
  });

  // Ingreso: límite de intentos fallidos por usuario y por IP.
  app.post('/api/ingresar', express.json({ limit: '10kb' }), async (req, res) => {
    const usuario = normalizarUsuario(req.body && req.body.usuario);
    const claves = ['u:' + usuario, 'ip:' + req.ip];
    if (limitador.bloqueado(...claves)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
    }
    const r = await ingresar(pool, usuario, req.body && req.body.clave);
    if (!r) {
      limitador.fallo(...claves);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    limitador.exito('u:' + usuario);
    res.json(r);
  });

  // La sesión se revisa antes de leer el cuerpo: una petición sin sesión no consume memoria.
  async function autenticar(req, res, next) {
    const usuario = await sesionDe(pool, tokenDe(req));
    if (!usuario) return res.status(401).json({ error: 'Sesión vencida o no válida. Vuelve a entrar.' });
    req.usuario = usuario;
    next();
  }
  // Con contraseña temporal solo se puede cambiar la contraseña, consultar quién es o salir.
  function claveAlDia(req, res, next) {
    if (req.usuario.debeCambiarClave) {
      return res.status(403).json({ error: 'Debes cambiar tu contraseña antes de seguir', debeCambiarClave: true });
    }
    next();
  }
  function soloAdmin(req, res, next) {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede hacer esto' });
    next();
  }

  app.get('/api/yo', autenticar, (req, res) => res.json({ usuario: req.usuario }));

  app.post('/api/salir', autenticar, async (req, res) => {
    await cerrarSesion(pool, tokenDe(req));
    res.json({ ok: true });
  });

  app.post('/api/clave', autenticar, express.json({ limit: '10kb' }), async (req, res) => {
    const claves = ['cambio:' + req.usuario.id];
    if (limitador.bloqueado(...claves)) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
    }
    try {
      await cambiarClave(pool, req.usuario, req.body && req.body.actual, req.body && req.body.nueva, tokenDe(req));
    } catch (e) {
      if (e instanceof ErrorCliente && /actual/.test(e.message)) limitador.fallo(...claves);
      throw e;
    }
    res.json({ usuario: Object.assign({}, req.usuario, { debeCambiarClave: false }) });
  });

  app.post('/api/sync', autenticar, claveAlDia, express.json({ limit: '5mb' }), async (req, res) => {
    res.json(await sincronizar(pool, req.body, req.usuario));
  });

  // ---------- administración de usuarios ----------
  app.get('/api/usuarios', autenticar, claveAlDia, soloAdmin, async (req, res) => {
    res.json({ usuarios: await listarUsuarios(pool) });
  });
  app.post('/api/usuarios', autenticar, claveAlDia, soloAdmin, express.json({ limit: '10kb' }), async (req, res) => {
    res.status(201).json({ usuario: await crearUsuario(pool, req.body || {}) });
  });
  app.patch('/api/usuarios/:id', autenticar, claveAlDia, soloAdmin, express.json({ limit: '10kb' }), async (req, res) => {
    res.json({ usuario: await actualizarUsuario(pool, req.params.id, req.body || {}, req.usuario) });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'No existe' }));

  if (dirWeb) {
    app.use(express.static(dirWeb, {
      setHeaders(res, ruta) {
        // El service worker y el HTML siempre se revalidan, para que las actualizaciones lleguen.
        if (ruta.endsWith('sw.js') || ruta.endsWith('.html')) res.set('Cache-Control', 'no-cache');
      }
    }));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ErrorCliente) return res.status(400).json({ error: err.message });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: 'Petición no válida' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}
