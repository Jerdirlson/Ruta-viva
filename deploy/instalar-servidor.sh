#!/usr/bin/env bash
# Deja Ruta-viva corriendo en un servidor Debian 12 nuevo con IP pública
# (por ejemplo, una VM de Google Compute Engine con los puertos 80 y 443 abiertos).
#
#   sudo bash /srv/rutaviva/deploy/instalar-servidor.sh 136-108-178-241.sslip.io
#
# - Instala Docker desde el repositorio oficial.
# - Crea deploy/.env con contraseñas generadas (si ya existe, lo respeta: no rota nada).
# - Levanta base, migraciones, API y Caddy con HTTPS para el dominio dado.
# - Programa el respaldo diario a las 2:15 a. m. (deploy/backup.sh).
#
# Se puede volver a correr sin problema: solo hace lo que falta.
set -euo pipefail

DOMINIO="${1:?Uso: sudo bash instalar-servidor.sh <dominio>   (por ejemplo 1-2-3-4.sslip.io)}"
[ "$(id -u)" -eq 0 ] || { echo "Correr con sudo."; exit 1; }
cd "$(dirname "$0")"
DEPLOY="$(pwd)"

echo "== Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -q
  apt-get install -y -q ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
docker --version

# Memoria de respaldo: con 2 GB, construir la imagen y correr todo a la vez queda justo.
if ! swapon --show | grep -q /swapfile; then
  echo "== Swap de 1 GB"
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Configuración (deploy/.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  # hex y no base64: las contraseñas van dentro de URLs de conexión (ver .env.example).
  sed -i \
    -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" \
    -e "s/^APP_DB_PASSWORD=$/APP_DB_PASSWORD=$(openssl rand -hex 32)/" \
\
    .env
  echo "   Contraseñas generadas."
else
  echo "   Ya existía: se conserva."
fi
if grep -q '^DOMINIO=' .env; then
  sed -i "s/^DOMINIO=.*/DOMINIO=${DOMINIO}/" .env
else
  printf '\nDOMINIO=%s\n' "$DOMINIO" >> .env
fi
chmod 600 .env

echo "== Levantando Ruta-viva (la primera vez tarda unos minutos)"
docker compose --profile https up -d --build
docker compose --profile https ps

echo "== Respaldo diario"
mkdir -p /var/backups/rutaviva
LINEA="15 2 * * * ${DEPLOY}/backup.sh >> /var/log/rutaviva-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -vF "${DEPLOY}/backup.sh"; echo "$LINEA" ) | crontab -

echo
echo "Listo. La app queda en https://${DOMINIO}"
echo "El certificado HTTPS puede tardar un minuto la primera vez."
if ! docker compose exec -T api node src/usuarios-cli.js listar | grep -q ' · admin · activo'; then
  echo
  echo "Falta el primer administrador. Créalo con (la contraseña temporal sale una sola vez):"
  echo "  cd ${DEPLOY} && sudo docker compose exec api node src/usuarios-cli.js crear <usuario> \"<Nombre>\" admin"
fi
