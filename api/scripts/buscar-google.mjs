// Carga inicial del censo desde Google Maps (Places API New, Text Search).
//
// Se corre a mano, una vez (o cuando se quiera repasar), NO en el servidor:
//   node api/scripts/buscar-google.mjs            -> busca y guarda en api/datos-google/
//   node api/scripts/buscar-google.mjs --prueba   -> solo cuenta cuántas consultas haría
//
// Barre el área metropolitana por cuadros. Google devuelve máximo 60 resultados por
// búsqueda (3 páginas de 20): si un cuadro llega a 60, se parte en 4 y se busca de nuevo.
// Se detiene solo antes de MAX_CONSULTAS para no salirse de lo gratis del mes.
//
// La clave se lee de api/.env.places (GOOGLE_PLACES_API_KEY=...), que git ignora.
// Salida: ferreterias-google.csv (se importa desde Datos en la app) y .json con todo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertir, aCSV, partir, LIMITES_ZONA } from './google.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.join(DIR, '..', 'datos-google');
const MAX_CONSULTAS = 900;        // Text Search Enterprise: 1.000 gratis al mes
const LADO_MINIMO = 0.001;        // ~110 m: no se parte más abajo de esto
const CONSULTA = 'ferretería';
const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.location', 'places.businessStatus', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.regularOpeningHours.weekdayDescriptions',
  'places.rating', 'places.userRatingCount', 'places.googleMapsUri', 'places.types', 'nextPageToken'
].join(',');

const prueba = process.argv.includes('--prueba');

function leerClave() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  const archivo = path.join(DIR, '..', '.env.places');
  const m = fs.existsSync(archivo) && fs.readFileSync(archivo, 'utf8').match(/GOOGLE_PLACES_API_KEY=(\S+)/);
  if (!m) throw new Error('Falta la clave: crear api/.env.places con GOOGLE_PLACES_API_KEY=...');
  return m[1];
}

let consultas = 0;
const avisos = [];   // cuadros llenos del tamaño mínimo
class Tope extends Error {}

async function pagina(clave, cuadro, token) {
  if (consultas >= MAX_CONSULTAS) throw new Tope();
  consultas++;
  const cuerpo = {
    textQuery: CONSULTA,
    languageCode: 'es',
    regionCode: 'CO',
    pageSize: 20,
    locationRestriction: { rectangle: {
      low: { latitude: cuadro.sur, longitude: cuadro.oeste },
      high: { latitude: cuadro.norte, longitude: cuadro.este }
    } }
  };
  if (token) cuerpo.pageToken = token;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': CAMPOS },
    body: JSON.stringify(cuerpo)
  });
  const r = await res.json();
  if (r.error) throw new Error('Google respondió ' + r.error.status + ': ' + r.error.message);
  return r;
}

async function buscarCuadro(clave, cuadro, lugares, nivel = 0) {
  const encontrados = [];
  let token;
  do {
    const r = await pagina(clave, cuadro, token);
    encontrados.push(...(r.places || []));
    token = r.nextPageToken;
  } while (token);
  encontrados.forEach(p => lugares.set(p.id, p));
  const lleno = encontrados.length >= 60;
  const sePuedePartir = cuadro.norte - cuadro.sur > LADO_MINIMO;
  if (lleno && !sePuedePartir) avisos.push(cuadro);
  console.log('  '.repeat(nivel) + `cuadro ${cuadro.sur.toFixed(3)},${cuadro.oeste.toFixed(3)}: ${encontrados.length}` +
    (lleno ? (sePuedePartir ? ' (lleno, se parte en 4)' : ' (lleno, ya no se puede partir: pueden faltar)') : '') + ` · consultas ${consultas}`);
  if (lleno && sePuedePartir) {
    for (const sub of partir(cuadro)) await buscarCuadro(clave, sub, lugares, nivel + 1);
  }
}

async function main() {
  // Cuadrícula inicial de 4 x 4 sobre Bucaramanga, Floridablanca, Girón y Piedecuesta.
  const inicial = partir(LIMITES_ZONA).flatMap(partir);
  if (prueba) {
    console.log(`Cuadros iniciales: ${inicial.length}. Mínimo ${inicial.length} consultas, tope ${MAX_CONSULTAS}.`);
    return;
  }
  const clave = leerClave();
  const lugares = new Map();
  let cortado = false;
  try {
    for (const c of inicial) await buscarCuadro(clave, c, lugares);
  } catch (e) {
    if (!(e instanceof Tope)) throw e;
    cortado = true;
    console.log(`\nSe llegó al tope de ${MAX_CONSULTAS} consultas: se guarda lo encontrado hasta aquí.`);
  }

  const crudos = [...lugares.values()];
  const { ferreterias, descartadas } = convertir(crudos);
  fs.mkdirSync(SALIDA, { recursive: true });
  const fecha = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(SALIDA, 'ferreterias-google.json'),
    JSON.stringify({ fecha, consultas, cortado, ferreterias, descartadas }, null, 2));
  fs.writeFileSync(path.join(SALIDA, 'ferreterias-google.csv'), aCSV(ferreterias));

  const porMunicipio = {};
  ferreterias.forEach(f => { porMunicipio[f.municipio] = (porMunicipio[f.municipio] || 0) + 1; });
  console.log(`\nConsultas usadas: ${consultas} de ${MAX_CONSULTAS}`);
  console.log(`Lugares encontrados: ${crudos.length}. Ferreterías guardadas: ${ferreterias.length}`);
  console.log('Por municipio:', porMunicipio);
  console.log('Por tipo:', { ferreteria: ferreterias.filter(f => f.tipo === 'ferreteria').length,
    materiales: ferreterias.filter(f => f.tipo === 'materiales').length });
  if (avisos.length) console.log('OJO: ' + avisos.length + ' cuadro(s) del tamaño mínimo llegaron a 60; pueden faltar lugares ahí.');
  console.log('Con teléfono:', ferreterias.filter(f => f.telefono).length);
  const motivos = {};
  descartadas.forEach(d => { motivos[d.motivo] = (motivos[d.motivo] || 0) + 1; });
  console.log('Descartadas:', motivos);
  console.log('Archivos en', SALIDA);
}

main().catch(e => { console.error(e.message); process.exit(1); });
