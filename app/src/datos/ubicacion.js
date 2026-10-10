// GPS del celular. La posición del vendedor solo se usa en el momento para ordenar
// por cercanía o guardar dónde queda una ferretería: no se guarda ni se envía.
import * as Location from 'expo-location';

const ESPERA_MS = 20000;

export async function obtenerPosicion() {
  const permiso = await Location.requestForegroundPermissionsAsync();
  if (permiso.status !== 'granted') {
    throw new Error('Sin permiso de ubicación. Actívalo para Ruta-viva en los ajustes del celular.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('El GPS está apagado. Enciéndelo e intenta de nuevo.');
  }
  const p = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error('La ubicación tardó demasiado. Intenta de nuevo a cielo abierto.')), ESPERA_MS))
  ]);
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    precision: p.coords.accuracy == null ? Infinity : p.coords.accuracy,
    hora: Date.now()
  };
}

// Solo el permiso, para mostrar el punto azul en el mapa (lo dibuja el mapa nativo:
// la app no lee ni guarda la posición por esto).
export async function pedirPermisoUbicacion() {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    return p.status === 'granted';
  } catch (e) {
    return false;
  }
}

// Última posición conocida del celular, sin pedir GPS ni permiso (para el punto azul del
// mapa). null si no hay permiso o no se conoce. Solo se usa en memoria.
export async function posicionSinPedir() {
  try {
    const permiso = await Location.getForegroundPermissionsAsync();
    if (permiso.status !== 'granted') return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
    return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
  } catch (e) {
    return null;
  }
}
