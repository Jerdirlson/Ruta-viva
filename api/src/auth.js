// Contraseñas, sesiones y límite de intentos. Solo node:crypto (sin dependencias).
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, R = 8, P = 1, LARGO = 32;
export const DIAS_SESION = 90;

// Formato: scrypt$N$r$p$sal$hash (base64url). Guardar los parámetros permite subirlos después.
export async function hashClave(clave) {
  const sal = crypto.randomBytes(16);
  const h = await scrypt(String(clave), sal, LARGO, { N, r: R, p: P });
  return ['scrypt', N, R, P, sal.toString('base64url'), h.toString('base64url')].join('$');
}

export async function verificarClave(clave, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, esperado] = partes;
  const e = Buffer.from(esperado, 'base64url');
  const h = await scrypt(String(clave), Buffer.from(sal, 'base64url'), e.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(h, e);
}

// Un hash real de una clave cualquiera: si el usuario no existe se verifica contra este,
// para que la respuesta tarde lo mismo y no revele qué usuarios existen.
let hashFalso = null;
export async function hashDeRelleno() {
  if (!hashFalso) hashFalso = await hashClave(crypto.randomBytes(16).toString('hex'));
  return hashFalso;
}

export function nuevoToken() {
  return crypto.randomBytes(32).toString('base64url');
}
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Intentos fallidos de ingreso, en memoria: MAX_FALLOS por usuario o por IP en VENTANA_MS.
// Basta para un solo proceso; al reiniciar el API se limpia (no bloquea a nadie para siempre).
export const MAX_FALLOS = 8;
export const VENTANA_MS = 15 * 60 * 1000;

export function crearLimitador(ahora = () => Date.now()) {
  const fallos = new Map();
  const vigentes = k => (fallos.get(k) || []).filter(t => ahora() - t < VENTANA_MS);
  return {
    bloqueado(...claves) {
      return claves.some(k => k && vigentes(k).length >= MAX_FALLOS);
    },
    fallo(...claves) {
      claves.filter(Boolean).forEach(k => fallos.set(k, vigentes(k).concat(ahora())));
      if (fallos.size > 10000) fallos.clear();   // que no crezca sin límite ante un ataque
    },
    exito(...claves) {
      claves.filter(Boolean).forEach(k => fallos.delete(k));
    }
  };
}
