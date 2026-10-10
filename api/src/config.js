// Configuración del API, solo desde variables de entorno.
// Ver deploy/.env.example para cómo generar cada valor.

export function leerConfig(env = process.env) {
  return {
    puerto: Number(env.PORT || 3000),
    databaseUrl: env.DATABASE_URL || ''
  };
}

// Preferimos no arrancar a arrancar mal: sin base, el API se niega.
export function erroresConfig(config) {
  const errores = [];
  if (!config.databaseUrl) errores.push('Falta DATABASE_URL');
  return errores;
}
