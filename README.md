# Ruta-viva — SOCODA

App para los vendedores de SOCODA (lavaplatos, cocinas integrales, estufas, campanas y mesones) que visitan ferreterías en el área metropolitana de Bucaramanga: censo, ruta del día, registro de visitas y resumen del equipo.

- **App web instalable** (`web/`): HTML, CSS y JavaScript sin frameworks, mobile-first, legible al sol. Se instala en la pantalla de inicio del celular.
- **API propio** (`api/`): Node 22 + Express + Postgres. Sincroniza el censo y las visitas de todos los vendedores y sirve la app desde el mismo origen.
- **Infraestructura** (`deploy/`): Docker Compose con Postgres sin puertos expuestos, migraciones, rol de base de datos con permisos mínimos, túnel HTTPS opcional y respaldos cifrados.

Sin login en esta fase: el acceso al servidor se protege con una **clave del equipo** que se escribe una vez en cada celular.

## App nativa (`app/`)

App de Android y iPhone hecha con **Expo / React Native** (SDK 57, la misma base de Raíz). Usa el mismo servidor y la misma sincronización que la versión web. Pantallas: Hoy (lista y mapa nativo), Censo, Ficha, Registrar visita, Nueva ferretería, Resumen y Datos.

### Probarla en tu celular hoy mismo (Expo Go)

Necesitas en tu computador Node 22 y, en el celular, la app **Expo Go** (Play Store o App Store). Ambos en la misma red Wi-Fi.

```bash
git clone https://github.com/Jerdirlson/Ruta-viva
cd Ruta-viva/app
npm install
npx expo start
```

Escanea el código QR: en Android con Expo Go; en iPhone con la cámara. La app abre en **modo local** con 12 ferreterías de ejemplo.

Para conectarla al servidor (ver `deploy/`), indica su URL **con `--clear`** (si no, Expo reutiliza la configuración anterior):

```bash
EXPO_PUBLIC_API_URL=https://TU-DOMINIO.ngrok-free.app npx expo start --clear
```

Si el celular no está en la misma red, usa `npx expo start --tunnel`.

### Generar el APK (Android)

Con una cuenta gratis de Expo:

```bash
cd app
npx eas-cli login
EXPO_PUBLIC_API_URL=https://TU-DOMINIO GOOGLE_MAPS_ANDROID_API_KEY=... npx eas-cli build -p android --profile preview
```

EAS compila en sus servidores y entrega un enlace para descargar el APK. El mapa en el APK de Android necesita una clave de Google Maps (`GOOGLE_MAPS_ANDROID_API_KEY`, en Google Cloud con la API "Maps SDK for Android"); en Expo Go no hace falta. Para iPhone se necesita una cuenta de Apple Developer.

### Pruebas de la app

```bash
cd app && npm test      # 13 pruebas de la lógica (estados, CSV, distancias, ruta, sincronización)
```

## Cómo funciona en el celular

Todo se guarda **primero en el teléfono**, así la app funciona sin señal. Cada cambio queda en una cola y se envía al servidor cuando hay conexión: al volver la señal, al abrir la app, cada 2 minutos y con *Datos → Sincronizar ahora*. La barra superior muestra el estado ("Sincronizado 10:42", "2 cambios sin enviar", "Sin conexión"…).

Las visitas no se duplican aunque se reenvíen. Si dos personas editan la misma ferretería, gana la última que llega al servidor.

## Mapa y ubicación

- **Cerca de mí** (en Hoy): ordena las pendientes por distancia desde donde está el vendedor.
- **Lista | Mapa**: el mapa muestra las ferreterías de la zona con pines por color: rojo pendiente, amarillo pidió visita, verde cliente, gris visitada hace poco. Al tocar un pin salen Maps, Llamar y Visitar.
- **Ruta**: con ubicación, el botón arma la ruta con las 4 más cercanas, siempre a la más cercana desde la parada anterior, y la abre en Google Maps para navegar.
- **Guardar ubicación aquí** (en la ficha): fija la ubicación de la ferretería con el GPS del celular. Rechaza lecturas con precisión peor que ±100 m.

La posición del vendedor **solo se usa en el momento, para ordenar**: no se guarda ni se envía. Lo que se guarda es la ubicación de cada ferretería.

El mapa usa [Leaflet](https://leafletjs.com) 1.9.4 (incluido en `web/vendor/leaflet/`, licencia BSD-2) con teselas de OpenStreetMap. La ubicación del celular requiere HTTPS (o `localhost`).

## Estructura

| Ruta | Qué hay |
|---|---|
| `app/` | App nativa (Expo): `src/nucleo/` lógica pura, `src/datos/` celular (almacenamiento, GPS, archivos), `src/pantallas/` |
| `web/` | Versión web instalable: `index.html`, `app.js` (pantallas), `db.js` (datos locales y sincronización), `sw.js`, `manifest.json`, datos de ejemplo |
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

**Datos → Importar censo (CSV)**. Columnas reconocidas (sin distinguir mayúsculas ni tildes): `nombre` (obligatoria), `direccion`, `barrio`, `municipio`, `telefono`, `zona` y, opcionales, `id`, `lat` y `lng` (ubicación, con coma o punto decimal). El separador puede ser `;` o `,`.

```csv
nombre;direccion;barrio;municipio;telefono;zona
Ferretería Ejemplo;Calle 1 # 2-3;Centro;Bucaramanga;3000000000;Zona 2 Centro
```

Si una fila coincide con una existente (por `id`, o por nombre + dirección + municipio), se actualiza; si no, se crea. Las columnas ausentes no borran datos y las columnas extra se ignoran. **El Excel real del censo aún no está mapeado**: cuando esté, se ajusta este formato.

## Pruebas

```bash
bash api/run-tests.sh     # 22 pruebas; levanta un Postgres desechable en Docker y lo borra al final
```

Cubren las reglas de validación, la sincronización, la clave del equipo, que solo se sirva `web/`, y que el rol de la app **no pueda** borrar datos ni cambiar el esquema.

## Despliegue

Ver [`deploy/README.md`](deploy/README.md).
