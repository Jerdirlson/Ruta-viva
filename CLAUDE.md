# Ruta-viva — notas para trabajar en este repo

App para vendedores de SOCODA (electrodomésticos y muebles de cocina) que visitan ferreterías en el área metropolitana de Bucaramanga. App web instalable en `web/` (JavaScript sin frameworks), API en `api/` (Node 22 + Express + Postgres) e infraestructura en `deploy/` (Docker Compose). Español de Colombia en toda la interfaz.

Nunca commitear `deploy/.env`, credenciales ni volcados de la base. La plantilla es `deploy/.env.example`.

## Arrancar y probar

```bash
cd deploy && docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # http://127.0.0.1:8080
cd web && python3 -m http.server 8080      # solo la app, modo local con datos de ejemplo
bash api/run-tests.sh                      # pruebas del API contra Postgres desechable (Docker)
```

## Reglas

**Los límites viven en tres lugares y deben coincidir:** `api/migrations/*.sql` (restricciones de la tabla), `api/src/validar.js` y `LIMITES` en `web/db.js`. Si se cambia uno, se cambian los tres. Si no, lo que hoy se guarda en el teléfono será rechazado por el servidor mañana.

**La ubicación de la ferretería** (`lat`, `lng`) sigue la misma regla de los tres lugares: migración 002, `validarCoordenadas` en `api/src/validar.js` y en `web/db.js`. Van juntas o no van. El servidor nunca borra una ubicación guardada con un envío que no la trae (`coalesce`).

**La posición del vendedor no se guarda ni se envía.** Solo vive en memoria (`ui.posicion` en `web/app.js`) para ordenar por cercanía. No agregar rastreo de vendedores.

**Local-first.** `web/db.js` es la única parte de la app que toca `localStorage` y el API. Todo cambio se guarda primero en el teléfono y entra a la cola `pendientes`; `sincronizar()` la envía y recibe el estado completo. Los ids se generan en el teléfono para que reenviar no duplique.

**Las visitas son historial: no se borran.** El rol `rutaviva_app` no tiene `DELETE`, y una prueba lo verifica intentándolo. No darle más permisos que `select, insert, update`.

**Un esquema nuevo es una migración nueva** (`api/migrations/002_*.sql`). Nunca editar una migración ya aplicada.

**Los datos de ejemplo** (`web/data/ferreterias.json`) son ficticios y solo se cargan en modo local; nunca deben llegar a la base del servidor.

**Al cambiar archivos de `web/`, subir `CACHE` en `web/sw.js`.**

**Colores de marca** (medidos en socoda.com.co): rojo `#E90128` para acciones, rojo oscuro `#940002` en la franja superior, grafito `#23292C` para selecciones. Viven solo en el `:root` de `web/styles.css`; no poner colores sueltos en otras reglas.

## Estado

- Listo y probado en local: app, sincronización entre varios celulares, cola sin conexión, API, migraciones, respaldo y restauración, mapa, "Cerca de mí", ruta por cercanía y "Guardar ubicación aquí".
- Pendiente: mapear el Excel real del censo, íconos PNG para instalar, elegir servidor y desplegar, y probar en celulares físicos.
