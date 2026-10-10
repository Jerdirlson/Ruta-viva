// Distancias, ruta y enlaces a Google Maps. Lógica pura.

export function distanciaM(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// "Guardar ubicación aquí" a más de esto de la guardada pide confirmación: lo más
// probable es que no estés en la ferretería (se tocó por error o en otra parte).
export const CONFIRMAR_MOVER_M = 300;

export function textoDistancia(m) {
  if (m < 1000) return Math.max(10, Math.round(m / 10) * 10) + ' m';
  return (Math.round(m / 100) / 10).toString().replace('.', ',') + ' km';
}

export function distanciaA(posicion, f) {
  return posicion && f.lat != null ? distanciaM(posicion, f) : null;
}

// Ubicadas por distancia; las sin ubicar al final, en su orden.
export function ordenarPorCercania(lista, posicion) {
  return lista.slice().sort((a, b) => (distanciaA(posicion, a) ?? Infinity) - (distanciaA(posicion, b) ?? Infinity));
}

// Google Maps en el celular acepta hasta 3 paradas intermedias más el destino.
export const PARADAS_RUTA = 4;

// Siempre a la más cercana desde la última parada.
export function paradasCercanas(lista, desde, n = PARADAS_RUTA) {
  const quedan = lista.filter(f => f.lat != null);
  const ruta = [];
  let actual = desde;
  while (ruta.length < n && quedan.length) {
    let mejor = 0;
    quedan.forEach((f, i) => { if (distanciaM(actual, f) < distanciaM(actual, quedan[mejor])) mejor = i; });
    actual = quedan.splice(mejor, 1)[0];
    ruta.push(actual);
  }
  return ruta;
}

// Con ubicación guardada, Maps va al punto exacto; si no, busca la dirección.
export function lugarMaps(f) {
  if (f.lat != null && f.lng != null) return f.lat + ',' + f.lng;
  return [f.direccion, f.barrio, f.municipio, 'Santander', 'Colombia'].filter(Boolean).join(', ');
}
export function urlMaps(f) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugarMaps(f));
}
// Sin punto de partida, Maps sale desde donde está el celular.
export function urlRuta(paradas) {
  const lugares = paradas.slice(0, PARADAS_RUTA).map(lugarMaps);
  const destino = lugares.pop();
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(destino) +
    (lugares.length ? '&waypoints=' + encodeURIComponent(lugares.join('|')) : '');
}
export function telefonoMarcable(f) {
  return String(f.telefono || '').replace(/[^\d+]/g, '');
}

// WhatsApp necesita el número con indicativo: un celular colombiano (10 dígitos que
// empiezan por 3) recibe el 57. Lo que no parezca celular no abre WhatsApp.
export function urlWhatsapp(numero) {
  let d = String(numero || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '3') d = '57' + d;
  return /^573\d{9}$/.test(d) ? 'https://wa.me/' + d : '';
}

// ---------- grupos en el mapa ----------
// Con cientos de ferreterías, los puntos se tapan y el de abajo no se puede tocar.
// Dos marcadores se juntan si en la pantalla quedarían a menos de RADIO_PX; el grupo se
// dibuja EXACTAMENTE sobre una de ellas (la más urgente), nunca en un promedio.
//
// Tamaños en px de lo que se toca en el mapa (MapaHoy usa estos mismos):
export const TOQUE_PUNTO_PX = 40;    // área táctil de una ferretería suelta (el punto se ve de 18)
export const GRUPO_MAX_PX = 44;      // círculo de grupo más grande (100 o más)
// Separación mínima entre centros: ni el círculo más grande tapa el área de su vecino.
export const RADIO_PX = GRUPO_MAX_PX / 2 + TOQUE_PUNTO_PX / 2 + 4;
// Más juntas que esto (mismo edificio o pasaje), el zoom no las separa: se elige de una lista.
export const MISMO_SITIO_M = 25;
const URGENCIA = ['amarillo', 'rojo', 'verde', 'gris'];
const urgencia = c => { const i = URGENCIA.indexOf(c); return i < 0 ? URGENCIA.length : i; };

// region: la visible del mapa (latitudeDelta, longitudeDelta). tamano: { ancho, alto } en px.
export function agrupar(lista, region, tamano, colorDe, radioPx = RADIO_PX) {
  const ubicadas = lista.filter(f => f.lat != null)
    .map(f => ({ f, color: colorDe(f) }))
    .sort((a, b) => urgencia(a.color) - urgencia(b.color) || (String(a.f.id) < String(b.f.id) ? -1 : String(a.f.id) > String(b.f.id) ? 1 : 0));
  if (!region || !tamano || !tamano.ancho || !tamano.alto) {
    return ubicadas.map(({ f, color }) => ({ clave: f.id, lat: f.lat, lng: f.lng, ferreterias: [f], color }));
  }
  const gradosX = region.longitudeDelta / tamano.ancho;   // grados por píxel
  const gradosY = region.latitudeDelta / tamano.alto;
  const px = f => ({ x: f.lng / gradosX, y: -f.lat / gradosY });

  // Cuadrícula de búsqueda de lado radioPx: solo se comparan vecinas.
  const celdas = new Map();
  const puntos = ubicadas.map((u, i) => {
    const p = px(u.f);
    const k = Math.floor(p.x / radioPx) + ':' + Math.floor(p.y / radioPx);
    if (!celdas.has(k)) celdas.set(k, []);
    celdas.get(k).push(i);
    return p;
  });
  const usada = new Array(ubicadas.length).fill(false);
  const grupos = [];
  ubicadas.forEach((u, i) => {
    if (usada[i]) return;
    usada[i] = true;
    const miembros = [u.f];
    const p = puntos[i];
    const cx = Math.floor(p.x / radioPx);
    const cy = Math.floor(p.y / radioPx);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        (celdas.get((cx + dx) + ':' + (cy + dy)) || []).forEach(j => {
          if (usada[j]) return;
          const q = puntos[j];
          if (Math.hypot(q.x - p.x, q.y - p.y) < radioPx) { usada[j] = true; miembros.push(ubicadas[j].f); }
        });
      }
    }
    grupos.push({
      clave: miembros.length === 1 ? u.f.id : 'g_' + u.f.id,
      lat: u.f.lat,          // exacta: la de la ferretería más urgente del grupo
      lng: u.f.lng,
      ferreterias: miembros,
      color: u.color
    });
  });
  return grupos;
}

// Mayor distancia entre las ferreterías de un grupo, en metros.
export function extensionM(ferreterias) {
  let max = 0;
  for (let i = 0; i < ferreterias.length; i++) {
    for (let j = i + 1; j < ferreterias.length; j++) max = Math.max(max, distanciaM(ferreterias[i], ferreterias[j]));
  }
  return max;
}

// El toque se resuelve aquí y no con la detección del mapa nativo: en iPhone, los marcadores
// dibujados como imagen (tracksViewChanges apagado) no reciben bien el toque y llega al mapa.
// Devuelve el grupo cuyo marcador está bajo el dedo (el más cercano dentro de su tamaño), o null.
export function marcadorEn(grupos, punto, region, tamano, radioDe) {
  if (!punto || !region || !tamano || !tamano.ancho || !tamano.alto) return null;
  const gradosX = region.longitudeDelta / tamano.ancho;
  const gradosY = region.latitudeDelta / tamano.alto;
  let mejor = null;
  let mejorD = Infinity;
  grupos.forEach(g => {
    const d = Math.hypot((g.lng - punto.lng) / gradosX, (g.lat - punto.lat) / gradosY);
    if (d <= radioDe(g) && d < mejorD) { mejor = g; mejorD = d; }
  });
  return mejor;
}

// Solo las ferreterías dentro de la vista del mapa (más un margen, para que al mover el
// mapa no aparezcan de golpe). Dibujar las de fuera no se ve y en Android cuesta mucho:
// cada marcador con vista propia es un bitmap nativo.
export function enVista(lista, region, margen = 0.25) {
  if (!region || !region.latitudeDelta) return lista;
  const medioLat = region.latitudeDelta * (0.5 + margen);
  const medioLng = region.longitudeDelta * (0.5 + margen);
  return lista.filter(f => f.lat != null &&
    Math.abs(f.lat - region.latitude) <= medioLat && Math.abs(f.lng - region.longitude) <= medioLng);
}
