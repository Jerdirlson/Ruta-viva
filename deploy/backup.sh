#!/usr/bin/env bash
# Respaldo de la base de Ruta-viva.
#
#   ./backup.sh [directorio_destino]        (por defecto /var/backups/rutaviva)
#
# Pensado para cron, por ejemplo todos los días a las 2:15 a. m.:
#   15 2 * * * /srv/rutaviva/deploy/backup.sh >> /var/log/rutaviva-backup.log 2>&1
#
# Escribe un volcado en formato custom de Postgres (comprimido, permite restaurar
# tablas sueltas), verifica que se pueda leer, lo cifra si hay con qué y rota
# los antiguos. El volcado contiene el censo y las visitas de todo el equipo,
# por eso nace legible solo por quien corre el respaldo (umask 077).
set -euo pipefail
umask 077

cd "$(dirname "$0")"
[ -f .env ] || { echo "Falta deploy/.env" >&2; exit 1; }
set -a; . ./.env; set +a

DESTINO="${1:-/var/backups/rutaviva}"
CONSERVAR="${BACKUP_CONSERVAR:-14}"
BASE="${POSTGRES_DB:-rutaviva}"
FECHA="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DESTINO"
TMP="$DESTINO/.rutaviva-$FECHA.dump.tmp"
trap 'rm -f "$TMP"' EXIT

docker exec rutaviva-db pg_dump -U "$POSTGRES_USER" -d "$BASE" -Fc > "$TMP"

# Un respaldo que no se puede leer no es un respaldo.
docker exec -i rutaviva-db pg_restore --list < "$TMP" > /dev/null

if [ -n "${BACKUP_RECIPIENT:-}" ]; then
  SALIDA="$DESTINO/rutaviva-$FECHA.dump.age"
  age -r "$BACKUP_RECIPIENT" -o "$SALIDA" "$TMP"
elif [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  SALIDA="$DESTINO/rutaviva-$FECHA.dump.gpg"
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
      --symmetric --cipher-algo AES256 -o "$SALIDA" "$TMP" 3<<<"$BACKUP_PASSPHRASE"
else
  SALIDA="$DESTINO/rutaviva-$FECHA.dump"
  echo "AVISO: respaldo SIN CIFRAR. Definir BACKUP_RECIPIENT o BACKUP_PASSPHRASE en .env." >&2
  cp "$TMP" "$SALIDA"
fi

# Rotación: conserva los $CONSERVAR más recientes.
ls -1t "$DESTINO"/rutaviva-*.dump* 2>/dev/null | tail -n +"$((CONSERVAR + 1))" | xargs -r rm -f

echo "Respaldo listo: $SALIDA ($(du -h "$SALIDA" | cut -f1))"
