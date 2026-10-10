# Ruta-viva — SOCODA

App para los vendedores de SOCODA (lavaplatos, cocinas integrales, estufas, campanas y mesones) que visitan ferreterías en el área metropolitana de Bucaramanga: censo, ruta del día, registro de visitas y resumen del equipo.

- **App web instalable** (`web/`): HTML, CSS y JavaScript sin frameworks, mobile-first, legible al sol. Se instala en la pantalla de inicio del celular.
- **API propio** (`api/`): Node 22 + Express + Postgres. Sincroniza el censo y las visitas de todos los vendedores y sirve la app desde el mismo origen.
- **Infraestructura** (`deploy/`): Docker Compose con Postgres sin puertos expuestos, migraciones, rol de base de datos con permisos mínimos, túnel HTTPS opcional y respaldos cifrados.

Sin login en esta fase: el acceso al servidor se protege con una **clave del equipo** que se escribe una vez en cada celular.

## Cómo funciona en el celular

Todo se guarda **primero en el teléfono**, así la app funciona sin señal. Cada cambio queda en una cola y se envía al servidor cuando hay conexión: al volver la señal, al abrir la app, cada 2 minutos y con *Datos → Sincronizar ahora*. La barra superior muestra el estado ("Sincronizado 10:42", "2 cambios sin enviar", "Sin conexión"…).

Las visitas no se duplican aunque se reenvíen. Si dos personas editan la misma ferretería, gana la última que llega al servidor.

## Estructura

| Ruta | Qué hay |
|---|---|
| `web/` | La app: `index.html`, `app.js` (pantallas), `db.js` (datos locales y sincronización), `sw.js`, `manifest.json`, datos de ejemplo |
| `api/src/` | `server.js` (arranque), `app.js` (rutas), `repositorio.js` (SQL), `validar.js` (reglas), `migrar.js` (esquema y rol) |
| `api/migrations/` | Esquema SQL versionado |
| `api/tests/` | Pruebas de reglas y del API contra Postgres real |
| `deploy/` | `docker-compose.yml`, `.env.example`, `backup.sh`, `restore.sh`, guía de despliegue |

## Arrancar en local

### Opción A: todo el sistema (recomendada)

Requiere Docker.

```bash
cd deploy
cp .env.example .env        # y llenar las claves (ver comentarios del archivo)
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Luego abre `http://127.0.0.1:8080`, ve a **Datos** y escribe tu nombre y la clave del equipo (`CLAVE_EQUIPO` de `deploy/.env`). La base empieza vacía: carga el censo con **Datos → Importar censo (CSV)**.

Para detenerlo usa `docker compose down`. Los datos se conservan en el volumen `rutaviva_pgdata`.

### Opción B: solo la app, sin servidor

```bash
cd web
python3 -m http.server 8080
```

Funciona igual que el prototipo de la fase 1: datos de ejemplo y todo guardado solo en ese navegador.

## Probar en el celular

La instalación en la pantalla de inicio y el uso sin conexión requieren **HTTPS**. El compose trae un túnel de ngrok con URL fija:

1. Crea una cuenta gratis en https://dashboard.ngrok.com y reclama un dominio estático.
2. Pon `NGROK_AUTHTOKEN` y `NGROK_DOMAIN` en `deploy/.env`.
3. `docker compose --profile tunel up -d`
4. Abre `https://TU-DOMINIO.ngrok-free.app` en el celular. La primera vez, ngrok muestra un aviso; toca *Visit Site*.
5. **Android (Chrome):** menú ⋮ → *Instalar app*. **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.

## Importar el censo (CSV)

**Datos → Importar censo (CSV)**. Columnas reconocidas (sin distinguir mayúsculas ni tildes): `nombre` (obligatoria), `direccion`, `barrio`, `municipio`, `telefono`, `zona` y, opcional, `id`. El separador puede ser `;` o `,`.

```csv
nombre;direccion;barrio;municipio;telefono;zona
Ferretería Ejemplo;Calle 1 # 2-3;Centro;Bucaramanga;3000000000;Zona 2 Centro
```

Si una fila coincide con una existente (por `id`, o por nombre + dirección + municipio), se actualiza; si no, se crea. Las columnas ausentes no borran datos y las columnas extra se ignoran. **El Excel real del censo aún no está mapeado**: cuando esté, se ajusta este formato.

## Pruebas

```bash
bash api/run-tests.sh     # 18 pruebas; levanta un Postgres desechable en Docker y lo borra al final
```

Cubren las reglas de validación, la sincronización, la clave del equipo, que solo se sirva `web/`, y que el rol de la app **no pueda** borrar datos ni cambiar el esquema.

## Despliegue

Ver [`deploy/README.md`](deploy/README.md).
