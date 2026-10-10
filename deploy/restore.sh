#!/usr/bin/env bash
# Restaura un respaldo hecho con backup.sh. REEMPLAZA los datos actuales.
#
#   ./restore.sh /var/backups/rutaviva/rutaviva-20261010-021500.dump[.age|.gpg]
#
# Para .age hace falta la clave privada:  AGE_IDENTITY=/ruta/a/clave.txt ./restore.sh ...
# Para .gpg pide la frase de paso (o BACKUP_PASSPHRASE en .env).
set -euo pipefail
umask 077

cd "$(dirname "$0")"
[ -f .env ] || { echo "Falta deploy/.env" >&2; exit 1; }
set -a; . ./.env; set +a

ARCHIVO="${1:?Uso: ./restore.sh archivo.dump[.age|.gpg]}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO" >&2; exit 1; }
BASE="${POSTGRES_DB:-rutaviva}"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

case "$ARCHIVO" in
  *.age) age -d -i "${AGE_IDENTITY:?Definir AGE_IDENTITY con la clave privada de age}" -o "$TMP" "$ARCHIVO" ;;
  *.gpg)
    if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
      gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 -d -o "$TMP" "$ARCHIVO" 3<<<"$BACKUP_PASSPHRASE"
    else
      gpg -d -o "$TMP" "$ARCHIVO"
    fi ;;
  *) cp "$ARCHIVO" "$TMP" ;;
esac

docker exec -i rutaviva-db pg_restore --list < "$TMP" > /dev/null

if [ "${CONFIRMAR:-}" != "restaurar" ]; then
  read -r -p "Esto REEMPLAZA los datos de '$BASE'. Escribe 'restaurar' para continuar: " RESPUESTA
  [ "$RESPUESTA" = "restaurar" ] || { echo "Cancelado."; exit 1; }
fi

# El API se detiene para que nadie escriba durante la restauración.
docker stop rutaviva-api >/dev/null 2>&1 || true
docker exec -i rutaviva-db pg_restore -U "$POSTGRES_USER" -d "$BASE" --clean --if-exists --single-transaction < "$TMP"

# Reafirma el rol y los permisos de la app, y vuelve a levantar el mismo contenedor del API.
docker compose run --rm migrar
docker start rutaviva-api >/dev/null
echo "Restauración lista desde $ARCHIVO"
