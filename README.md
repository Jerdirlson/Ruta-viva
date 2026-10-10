# SOCODA — Censo de ferreterías (prototipo fase 1)

App web para vendedores: censo de ferreterías, registro de visitas, vista "Hoy" con rutas y resumen. Funciona en el celular como app instalada. Los datos se guardan en el propio celular (localStorage); no hay login ni backend en esta fase.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Pantallas, diálogos de visita y de nueva ferretería |
| `styles.css` | Diseño mobile-first, alto contraste |
| `app.js` | Interfaz (vistas Hoy, Censo, Resumen, Datos) |
| `db.js` | **Capa de datos**: única parte que habla con localStorage |
| `manifest.json`, `sw.js`, `icon.svg` | Instalación en pantalla de inicio y uso sin conexión |
| `data/ferreterias.json` | 12 ferreterías **ficticias** de ejemplo |

## Cómo abrirla en la computadora

La app necesita un servidor local (no sirve abrir `index.html` con doble clic, porque el service worker y la carga de datos no funcionan desde `file://`).

```bash
cd Ruta-viva
python3 -m http.server 8080
```

Luego abre `http://localhost:8080` en el navegador.

## Probar en el celular

1. Pon la computadora y el celular en la misma red Wi-Fi.
2. Averigua la IP de la computadora (por ejemplo `192.168.1.20`) y abre `http://192.168.1.20:8080` en el celular.
3. **Android (Chrome):** menú ⋮ → *Agregar a pantalla de inicio* (o *Instalar app*).
   **iPhone (Safari):** botón Compartir → *Agregar a pantalla de inicio*.

Nota: el service worker y la instalación requieren HTTPS en un servidor real. Para el piloto con vendedores hay que publicarla en un hosting con HTTPS (por ejemplo GitHub Pages o Netlify). En `http://IP:8080` la app funciona, pero no se instala ni queda disponible sin conexión.

## Primer uso

1. Ve a **Datos** y escribe tu nombre. Se guarda en el celular y queda en cada visita.
2. **Hoy**: visitas pendientes por zona. Cada tarjeta tiene *Maps*, *Llamar* y *Visitar*.
3. **Censo**: busca por nombre o barrio y filtra por zona, municipio o estado. *+ Nueva ferretería* agrega una.
4. **Visitar** → elige resultado, líneas que vende, marca de competencia y notas.
5. **Resumen**: visitas, compras, clientes nuevos y ferreterías sin visitar hace más de 30 días. Puedes ver 30 días o todo el histórico.

## Importar el censo (CSV)

En **Datos → Importar censo (CSV)** elige un archivo `.csv`.

Columnas reconocidas (los nombres no distinguen mayúsculas ni tildes):

| Columna | Obligatoria | Ejemplo |
|---|---|---|
| `nombre` | Sí | Ferretería El Tornillo Feliz |
| `direccion` | No | Carrera 27 # 45-10 |
| `barrio` | No | Cabecera |
| `municipio` | No | Bucaramanga |
| `telefono` | No | 3000000001 |
| `zona` | No | Zona 1 Norte |
| `id` | No | f001 |

Ejemplo:

```csv
nombre;direccion;barrio;municipio;telefono;zona
Ferretería Ejemplo;Calle 1 # 2-3;Centro;Bucaramanga;3000000000;Zona 2 Centro
```

- El separador puede ser `;` o `,`; se detecta solo.
- Si una fila coincide con una existente (por `id`, o por nombre + dirección + municipio), se actualiza. Si no, se crea.
- Las columnas que no estén en el archivo no modifican los datos actuales.
- Las columnas extra se ignoran.

Para respaldar, usa **Datos → Descargar censo (CSV)** (abre en Excel en español) o **Descargar respaldo completo (JSON)**, que incluye también las visitas. Para restaurar, usa **Restaurar respaldo**; esto reemplaza los datos del celular.

## Cambiar a una base real más adelante

Todo el acceso a datos pasa por `db.js`. Para migrar, reemplaza las funciones de almacenamiento (`leer`, `guardar`) o las funciones públicas del objeto `DB`, manteniendo sus nombres y formas, y `app.js` no necesita cambios.

## Pendiente

Ver la lista de pendientes en el mensaje de cierre de la sesión.
