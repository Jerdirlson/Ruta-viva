// Configuración del API, solo desde variables de entorno.
// Ver deploy/.env.example para cómo generar cada valor.

export function leerConfig(env = process.env) {
  return {
    puerto: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || '',
    claveEquipo: env.CLAVE_EQUIPO || ''
  };
}

// Preferimos no arrancar a arrancar mal: sin base o con una clave débil, el API se niega.
export function erroresConfig(config) {
  const errores = [];
  if (!config.databaseUrl) errores.push('Falta DATABASE_URL');
  if (config.claveEquipo.length < 16) {
    errores.push('CLAVE_EQUIPO debe tener al menos 16 caracteres (generarla con: openssl rand -hex 16)');
  }
  return errores;
}
