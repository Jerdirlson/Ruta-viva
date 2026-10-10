// Versión web de la app (Expo web): sin almacenamiento cifrado, la sesión va en el
// almacenamiento del navegador, como en la app web de web/.
const CLAVE = 'rutaviva.sesion';

export async function leerSesion() {
  try {
    const t = window.localStorage.getItem(CLAVE);
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
}
export async function guardarSesion(sesion) {
  window.localStorage.setItem(CLAVE, JSON.stringify(sesion));
}
export async function borrarSesion() {
  try { window.localStorage.removeItem(CLAVE); } catch (e) { /* nada que borrar */ }
}
