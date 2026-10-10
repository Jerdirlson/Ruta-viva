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
