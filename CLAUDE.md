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

**Los límites viven en cuatro lugares y deben coincidir:** `api/migrations/*.sql` (restricciones de la tabla), `api/src/validar.js`, `LIMITES` en `web/db.js` y `LIMITES` en `app/src/nucleo/reglas.js`. Si se cambia uno, se cambian todos. Si no, lo que hoy se guarda en el teléfono será rechazado por el servidor mañana.

**App nativa (`app/`, Expo SDK 57).** `src/nucleo/` es lógica pura (sin React Native) y se prueba con `cd app && npm test`. Solo `src/datos/` y `src/estado/` tocan el celular (AsyncStorage, GPS, archivos). `src/datos/ejemplo.json` es copia de `web/data/ferreterias.json`. `EXPO_PUBLIC_API_URL` se incrusta al compilar: al cambiarla, `npx expo start --clear`. `expo install` no funciona en entornos sin acceso a api.expo.dev: tomar las versiones de `node_modules/expo/bundledNativeModules.json`.

**Campos de la migración 003** (tipo, encargado, whatsapp, correo, categoria, clienteSocoda, vendedorAsignado, googlePlaceId, web, horario, calificacion, resenas) son opcionales en el API: si un envío no los trae (null), el servidor conserva lo guardado (`coalesce` en `api/src/repositorio.js`). Editar en el celular mezcla con lo guardado (`guardarFerreteria`), así el formulario no borra los datos de Google. Encargado, WhatsApp y correo son datos personales (Ley 1581 de 2012): la app pide permiso antes de guardarlos.

**Ferreterías descartadas** (migración 004): si no existe, cerró o no aplica, se marca `descartada` con motivo, quién y fecha; nunca se borra (historial). Sale de Hoy, del mapa, de los pendientes y del resumen; en Censo solo con el filtro "Descartada"; se puede reactivar. La fecha es texto ('' = activa) para que `coalesce` distinga "no vino" (null) de "reactivar" ('').

**Marcas y datos comerciales** (migración 006): como el censo en Excel de SOCODA (V3-CONSOLIDADO FERRETERIAS): marcas presentes (lista fija de 9), exhibidor (no/nuevo/antiguo), cocinas y referencias, proveedores (lista fija) y observaciones fijas. La visita guarda lo visto (`visitas.marcas`, `visitas.exhibidor`) y actualiza la ferretería. Los porcentajes de presencia cuentan solo las ferreterías censadas. **Excel con su formato**: `GET /api/exportar/censo.xlsx` (solo admin, `api/src/exportar.js`). Al importar CSV, una celda vacía no borra lo guardado.

**Carga desde Google Maps** (`api/scripts/buscar-google.mjs`): se corre a mano, no en el servidor. Lee la clave de `api/.env.places` y escribe en `api/datos-google/`; ambos están en `.gitignore`. Genera un CSV que se importa desde Datos; los ids `g_<place_id>` hacen que repetir la carga actualice en vez de duplicar. Tope de 900 consultas (1.000 gratis al mes).

**La ubicación de la ferretería** (`lat`, `lng`) sigue la misma regla de los tres lugares: migración 002, `validarCoordenadas` en `api/src/validar.js` y en `web/db.js`. Van juntas o no van. El servidor nunca borra una ubicación guardada con un envío que no la trae (`coalesce`).

**Usuarios y sesiones** (migración 005, `api/src/usuarios.js`, `api/src/auth.js`): con servidor, cada vendedor entra con usuario y contraseña; ya no hay clave compartida. Contraseñas con scrypt; la sesión es un token aleatorio que la base guarda solo como hash SHA-256 (90 días, se renueva al usarse). En el celular el token va en `expo-secure-store` (`app/src/datos/sesion.js`), nunca en AsyncStorage ni en respaldos. **El servidor firma visitas y descartes con el usuario de la sesión**: el `vendedor` que mande el celular se ignora. Contraseña puesta por un administrador = temporal (`debe_cambiar_clave`): hasta cambiarla, el API solo permite `/api/clave`, `/api/yo` y `/api/salir`. Propia: mínimo 8 caracteres. Siempre queda un administrador activo. Desactivar o cerrar sesión es marcar, nunca borrar. Primer administrador: `docker compose exec api node src/usuarios-cli.js crear <usuario> "<Nombre>" admin`.

**La posición del vendedor no se guarda ni se envía.** Solo vive en memoria (`ui.posicion` en `web/app.js`) para ordenar por cercanía. No agregar rastreo de vendedores.

**Local-first.** `web/db.js` es la única parte de la app que toca `localStorage` y el API. Todo cambio se guarda primero en el teléfono y entra a la cola `pendientes`; `sincronizar()` la envía y recibe el estado completo. Los ids se generan en el teléfono para que reenviar no duplique.

**Las visitas son historial: no se borran.** El rol `rutaviva_app` no tiene `DELETE` (tampoco sobre usuarios ni sesiones), y una prueba lo verifica intentándolo. No darle más permisos que `select, insert, update`.

**Un esquema nuevo es una migración nueva** (`api/migrations/002_*.sql`). Nunca editar una migración ya aplicada.

**Los datos de ejemplo** (`web/data/ferreterias.json`) son ficticios y solo se cargan en modo local; nunca deben llegar a la base del servidor.

**Al cambiar archivos de `web/`, subir `CACHE` en `web/sw.js`.**

**Colores de marca** (medidos en socoda.com.co): rojo `#E90128` para acciones, rojo oscuro `#940002` en la franja superior, grafito `#23292C` para selecciones. Viven solo en el `:root` de `web/styles.css`; no poner colores sueltos en otras reglas.

## Estado

- Listo y probado en local: app, sincronización entre varios celulares, cola sin conexión, API, migraciones, respaldo y restauración, mapa, "Cerca de mí", ruta por cercanía y "Guardar ubicación aquí".
- App nativa (`app/`): compila para Android e iOS; probada en su versión web con Playwright (modo local y servidor). Falta probarla en un celular físico (Expo Go) y generar el APK con EAS.
- Censo inicial: 833 ferreterías y depósitos de Bucaramanga, Floridablanca, Girón y Piedecuesta sacados de Google Maps (oct. 2026), en `api/datos-google/ferreterias-google.csv` (no se sube al repo).
- Producción: VM de Google Cloud (ver deploy/README.md), HTTPS con Caddy en https://136-108-178-241.sslip.io.
- Censo de SOCODA cruzado con Google (120 coinciden, 89 nuevas); el CSV para importar vive en api/datos-google/ (no se sube: datos personales).
- Pendiente: fotos de la fachada (migración 007), clave de Google Maps para el APK de Android, nota de voz + IA para registrar visitas.
