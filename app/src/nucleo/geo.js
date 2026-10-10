// Distancias, ruta y enlaces a Google Maps. Lógica pura.

export function distanciaM(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

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
