#!/usr/bin/env bash
# Pruebas del API contra un Postgres real y desechable (requiere Docker).
#
#   bash api/run-tests.sh
#
# Levanta postgres:16-alpine en un puerto libre de 127.0.0.1, corre todas las
# pruebas de api/tests/ y borra el contenedor al terminar, pase lo que pase.
set -euo pipefail

cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --silent

NOMBRE="rutaviva-test-$$"
CLAVE_ADMIN="$(openssl rand -hex 16)"
CLAVE_APP="$(openssl rand -hex 16)"

limpiar() { docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; }
trap limpiar EXIT

docker run -d --name "$NOMBRE" \
  -e POSTGRES_USER=rutaviva_admin -e POSTGRES_PASSWORD="$CLAVE_ADMIN" -e POSTGRES_DB=rutaviva_test \
  -p 127.0.0.1::5432 postgres:16-alpine >/dev/null

PUERTO="$(docker port "$NOMBRE" 5432/tcp | head -1 | sed 's/.*://')"

# Espera a que acepte conexiones de verdad (pg_isready responde antes del reinicio inicial).
for _ in $(seq 1 60); do
  if docker exec "$NOMBRE" psql -U rutaviva_admin -d rutaviva_test -h 127.0.0.1 -c 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

export RV_TEST_ADMIN_URL="postgresql://rutaviva_admin:${CLAVE_ADMIN}@127.0.0.1:${PUERTO}/rutaviva_test"
export RV_TEST_APP_URL="postgresql://rutaviva_app:${CLAVE_APP}@127.0.0.1:${PUERTO}/rutaviva_test"
export RV_TEST_APP_PASSWORD="$CLAVE_APP"

node --test tests/*.test.mjs
