// Sesión del vendedor (token y datos de su usuario) en el almacenamiento cifrado del
// celular (Keychain en iPhone, Keystore en Android). El token no va en AsyncStorage
// ni en los respaldos.
import * as SecureStore from 'expo-secure-store';

const CLAVE = 'rutaviva.sesion';

export async function leerSesion() {
  try {
    const t = await SecureStore.getItemAsync(CLAVE);
    return t ? JSON.parse(t) : null;
  } catch (e) {
    return null;
  }
}
export async function guardarSesion(sesion) {
  await SecureStore.setItemAsync(CLAVE, JSON.stringify(sesion));
}
export async function borrarSesion() {
  await SecureStore.deleteItemAsync(CLAVE).catch(() => {});
}
