// Actualizaciones OTA (EAS Update). Por defecto expo-updates aplica una versión nueva
// recién la vez siguiente que se abre la app: cada cambio pedía cerrar y abrir dos veces.
// Aquí, al abrir, si hay versión nueva se baja y se aplica en ese momento.
import * as Updates from 'expo-updates';

// Solo justo después de abrir: más tarde, reiniciar interrumpiría al vendedor.
const VENTANA_MS = 12000;
const inicio = Date.now();

export async function actualizarAlAbrir() {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return false;
    await Updates.fetchUpdateAsync();
    if (Date.now() - inicio > VENTANA_MS) return false;   // se aplica la próxima vez que abra
    await Updates.reloadAsync();
    return true;
  } catch (e) {
    return false;   // sin señal o servidor caído: sigue con la versión que tiene
  }
}

// Desde Datos: buscar y aplicar ya (el vendedor lo pidió).
export async function buscarActualizacion() {
  if (__DEV__ || !Updates.isEnabled) return 'no-disponible';
  const r = await Updates.checkForUpdateAsync();
  if (!r.isAvailable) return 'al-dia';
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
  return 'actualizada';
}

export function versionActual() {
  return {
    fecha: Updates.createdAt ? new Date(Updates.createdAt) : null,
    id: Updates.updateId ? Updates.updateId.slice(0, 8) : '',
    original: Updates.isEmbeddedLaunch
  };
}
