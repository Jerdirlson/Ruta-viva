# Despliegue de Ruta-viva

Todo corre en Docker con el prefijo `rutaviva`, red y volumen propios, y límites duros de recursos. Así puede convivir en una máquina compartida sin afectar a otros servicios.

| Servicio | Qué hace | Memoria | CPU |
|---|---|---|---|
| `rutaviva-db` | Postgres 16. **Sin puertos publicados**: solo accesible desde la red `rutaviva_net` | 256 MB | 0,5 |
| `rutaviva-migrar` | Corre en cada `up`: aplica migraciones y deja listo el rol de la app; luego termina | 128 MB | 0,25 |
| `rutaviva-api` | API + app web. Tampoco publica puertos en el servidor | 192 MB | 0,5 |
| `rutaviva-tunel` | ngrok con dominio fijo y HTTPS (perfil `tunel`, opcional) | 128 MB | 0,25 |

En total usa hasta unos 580 MB con el túnel incluido.

## En un servidor con IP pública (Google Cloud, VPS)

Producción corre en una VM de Google Compute Engine (`ruta-viva`, proyecto `ruta-viva-511204`, zona `us-east1-b`, IP fija `136.108.178.241`) con los puertos 80 y 443 abiertos (regla de firewall `ruta-viva-web`). HTTPS con Caddy y Let's Encrypt; sin dominio propio, sslip.io: `https://136-108-178-241.sslip.io`.

```bash
# Desde Cloud Shell
gcloud compute ssh ruta-viva --zone=us-east1-b
# En la VM
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/Jerdirlson/Ruta-viva.git /srv/rutaviva
sudo bash /srv/rutaviva/deploy/instalar-servidor.sh 136-108-178-241.sslip.io
```

`instalar-servidor.sh` instala Docker, genera `.env` (si no existe), levanta todo con `--profile https` y programa el respaldo diario. Se puede volver a correr.

Actualizar: `cd /srv/rutaviva && sudo git pull && cd deploy && sudo docker compose --profile https up -d --build`.

## Primera vez

```bash
cd deploy
cp .env.example .env
chmod 600 .env
# Generar los secretos (no inventarlos):
#   POSTGRES_PASSWORD y APP_DB_PASSWORD:  openssl rand -hex 32
docker compose up -d --build
docker compose ps        # db y api "healthy", migrar "Exited (0)"
docker compose --profile tunel up -d     # cuando estén NGROK_AUTHTOKEN y NGROK_DOMAIN
```

## Usuarios

Cada vendedor entra con su usuario y contraseña. El primer administrador se crea en el servidor; la contraseña temporal sale una sola vez y se pide cambiarla al entrar (mínimo 8 caracteres):

```bash
docker compose exec api node src/usuarios-cli.js crear jerdirlson "Jerdirlson Santamaría" admin
docker compose exec api node src/usuarios-cli.js listar
```

Los demás los crea un administrador desde la app (Datos → Usuarios): crear, desactivar (cierra sus sesiones) y poner contraseña temporal.

## Cómo funciona la seguridad de la base

Hay dos roles, y la diferencia importa:

- **`rutaviva_admin`** (`POSTGRES_USER`) es dueño de las tablas. Solo lo usa `migrar`.
- **`rutaviva_app`** es con el que se conecta el API. Solo puede leer, insertar y actualizar `ferreterias` y `visitas`. **No puede borrar** ni tocar el esquema; `api/tests/api.test.mjs` lo verifica intentándolo.

`migrar` crea el rol si falta y le fija la contraseña en cada arranque. Para rotarla, cambia `APP_DB_PASSWORD` en `.env` y corre `docker compose up -d`.

## Actualizar

```bash
git pull
docker compose up -d --build
```

Si cambiaste archivos de `web/`, sube también `CACHE` en `web/sw.js` para que los celulares descarguen la versión nueva.

## Respaldos

```bash
./backup.sh                          # a /var/backups/rutaviva, conserva 14
crontab -e                           # todos los días a las 2:15 a. m.:
15 2 * * * /srv/rutaviva/deploy/backup.sh >> /var/log/rutaviva-backup.log 2>&1
```

- Cifrado recomendado: `BACKUP_RECIPIENT=age1…` en `.env` (clave **pública** de age; la privada se guarda fuera del servidor). Alternativa: `BACKUP_PASSPHRASE` con gpg. Sin ninguna de las dos, avisa que queda sin cifrar.
- Cada respaldo se verifica leyéndolo antes de darlo por bueno.
- **Un respaldo en el mismo disco no protege de perder el servidor:** copia los archivos a otro lugar.

### Restaurar

```bash
./restore.sh /var/backups/rutaviva/rutaviva-AAAAMMDD-HHMMSS.dump.age   # con AGE_IDENTITY=/ruta/clave.txt
```

Detiene el API, reemplaza los datos (pide escribir `restaurar` para confirmar), reafirma permisos y vuelve a levantar el API.

## Problemas comunes

- **"Invalid URL" en los logs del API:** una contraseña generada con base64 tiene `/`, `+` o `=`. Usa `openssl rand -hex 32`.
- **Nadie puede entrar (se olvidó la contraseña del administrador):** `docker compose exec api node src/usuarios-cli.js clave <usuario>` le pone una contraseña temporal nueva.
- **`migrar` termina con error:** `docker logs rutaviva-migrar`. El API no arranca hasta que `migrar` termine bien, a propósito.
