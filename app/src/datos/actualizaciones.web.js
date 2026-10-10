// En la web no hay actualizaciones OTA: el navegador siempre carga lo último.
export async function actualizarAlAbrir() { return false; }
export async function buscarActualizacion() { return 'no-disponible'; }
export function versionActual() { return { fecha: null, id: '', original: true }; }
