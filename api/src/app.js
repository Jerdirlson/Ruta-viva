// Aplicación Express: API de sincronización y la app web (carpeta web/) desde el mismo origen.
import crypto from 'node:crypto';
import express from 'express';
import { sincronizar, ErrorCliente } from './repositorio.js';

// Compara en tiempo constante; los hashes igualan el largo para timingSafeEqual.
function claveCorrecta(dada, esperada) {
  if (!esperada) return false;
  const a = crypto.createHash('sha256').update(String(dada)).digest();
  const b = crypto.createHash('sha256').update(esperada).digest();
  return crypto.timingSafeEqual(a, b);
}

export function crearApp({ pool, claveEquipo, dirWeb }) {
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; " +
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

  // La clave se revisa antes de leer el cuerpo: una petición sin clave no consume memoria.
  function autorizar(req, res, next) {
    if (!claveCorrecta(req.get('X-Clave-Equipo') || '', claveEquipo)) {
      return res.status(401).json({ error: 'Clave del equipo incorrecta' });
    }
    next();
  }

  app.post('/api/sync', autorizar, express.json({ limit: '5mb' }), async (req, res) => {
    res.json(await sincronizar(pool, req.body));
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
