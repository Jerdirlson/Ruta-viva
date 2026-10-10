// Página del mapa que corre dentro de un WebView (MapaHoy.js): Leaflet + Leaflet.markercluster.
//
// Por qué no react-native-maps: en Android (nueva arquitectura) sus marcadores con vista
// propia no se borran, no se mueven ni se actualizan de forma confiable (quedaban círculos
// viejos, pines por defecto y números que no correspondían). Aquí todo lo dibuja Leaflet.
//
// Protocolo con la app:
//   app -> mapa  window.recibir({ tipo: 'datos', puntos: [{ id, lat, lng, color, nombre }], elegidaId })
//                window.recibir({ tipo: 'elegida', id })
//                window.recibir({ tipo: 'encuadrar', puntos: [[lat, lng], ...] })
//                window.recibir({ tipo: 'enfocar', lat, lng })
//                window.recibir({ tipo: 'posicion', lat, lng })        (punto azul; null lo quita)
//   mapa -> app  { tipo: 'listo' } · { tipo: 'elegir', id } · { tipo: 'vacio' }

export const COLORES = { rojo: '#e90128', amarillo: '#f2b600', verde: '#1f9d55', gris: '#8c8c8c', grafito: '#23292c', azul: '#1a73e8' };

export function htmlMapa() {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css">
<style>
  html, body, #mapa { margin: 0; height: 100%; width: 100%; background: #e9eef0; }
  .leaflet-container { font-family: -apple-system, Roboto, "Segoe UI", sans-serif; }
  /* Una ferretería: punto de color con borde blanco; el área que se toca es más grande. */
  .ferre { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
  .ferre i { display: block; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-sizing: border-box;
    box-shadow: 0 1px 3px rgba(0,0,0,.35); }
  .ferre.elegida i { width: 26px; height: 26px; border: 4px solid ${COLORES.grafito}; }
  /* Grupo: círculo con el número, del color de la más urgente. */
  .grupo { display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 3px solid #fff;
    box-sizing: border-box; color: #fff; font-weight: 800; font-size: 13px; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .grupo.amarillo { color: #1f1f1f; }
  .yo { width: 16px; height: 16px; border-radius: 50%; background: ${COLORES.azul}; border: 3px solid #fff; box-sizing: border-box;
    box-shadow: 0 0 0 6px rgba(26,115,232,.2); }
  .aviso { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px;
    text-align: center; color: #4d4d4d; font-size: 15px; z-index: 999; background: #e9eef0; }
</style>
</head>
<body>
<div id="mapa"></div>
<div id="aviso" class="aviso" style="display:none">Sin conexión: el mapa necesita internet para cargar.</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
<script>
(function () {
  var enviar = function (m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  if (!window.L || !L.markerClusterGroup) {
    document.getElementById('aviso').style.display = 'flex';
    enviar({ tipo: 'error' });
    return;
  }
  var COLOR = ${JSON.stringify(COLORES)};
  var URGENCIA = ['amarillo', 'rojo', 'verde', 'gris'];
  var mapa = L.map('mapa', { zoomControl: false, attributionControl: true, tap: true }).setView([7.1, -73.12], 12);
  // Teselas de OpenStreetMap (las mismas de la app web). maxNativeZoom 19: más cerca se
  // amplía la última sin pedir teselas que no existen.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);
  mapa.attributionControl.setPrefix(false);

  var elegidaId = null;
  var marcadores = {};   // id -> marcador
  var grupos = L.markerClusterGroup({
    maxClusterRadius: 46,          // misma separación en pantalla que antes
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,       // locales en el mismo edificio se abren en abanico
    zoomToBoundsOnClick: true,
    chunkedLoading: true,
    iconCreateFunction: function (c) {
      var hijos = c.getAllChildMarkers();
      var colores = hijos.map(function (m) { return m.options.color; });
      var color = URGENCIA.filter(function (u) { return colores.indexOf(u) >= 0; })[0] || 'gris';
      var n = c.getChildCount();
      var lado = n < 10 ? 32 : n < 100 ? 38 : 44;
      var elegida = elegidaId && hijos.some(function (m) { return m.options.id === elegidaId; });
      return L.divIcon({
        html: '<div class="grupo ' + color + '" style="width:' + lado + 'px;height:' + lado + 'px;background:' + COLOR[color] +
          (elegida ? ';border-color:' + COLOR.grafito : '') + '">' + n + '</div>',
        className: '', iconSize: [lado, lado]
      });
    }
  });
  mapa.addLayer(grupos);

  function icono(p) {
    return L.divIcon({
      html: '<div class="ferre' + (p.id === elegidaId ? ' elegida' : '') + '"><i style="background:' + COLOR[p.color] + '"></i></div>',
      className: '', iconSize: [40, 40]
    });
  }

  var yo = null;
  var recibir = {
    datos: function (m) {
      elegidaId = m.elegidaId || null;
      grupos.clearLayers();
      marcadores = {};
      var capas = m.puntos.map(function (p) {
        var mk = L.marker([p.lat, p.lng], { icon: icono(p), id: p.id, color: p.color, zIndexOffset: p.id === elegidaId ? 1000 : 0, title: p.nombre });
        mk.on('click', function () { enviar({ tipo: 'elegir', id: p.id }); });
        marcadores[p.id] = mk;
        return mk;
      });
      grupos.addLayers(capas);
    },
    elegida: function (m) {
      var antes = elegidaId;
      elegidaId = m.id || null;
      [antes, elegidaId].forEach(function (id) {
        var mk = id && marcadores[id];
        if (mk) { mk.setIcon(icono({ id: id, color: mk.options.color })); mk.setZIndexOffset(id === elegidaId ? 1000 : 0); }
      });
      grupos.refreshClusters();
    },
    encuadrar: function (m) {
      if (!m.puntos || !m.puntos.length) return;
      if (m.puntos.length === 1) mapa.setView(m.puntos[0], 17);
      else mapa.fitBounds(m.puntos, { padding: [40, 40], maxZoom: 17 });
    },
    enfocar: function (m) { mapa.setView([m.lat, m.lng], 18, { animate: true }); },
    posicion: function (m) {
      if (yo) { mapa.removeLayer(yo); yo = null; }
      if (m.lat == null) return;
      yo = L.marker([m.lat, m.lng], { icon: L.divIcon({ html: '<div class="yo"></div>', className: '', iconSize: [16, 16] }),
        interactive: false, zIndexOffset: 2000 }).addTo(mapa);
    }
  };
  window.recibir = function (m) { try { if (recibir[m.tipo]) recibir[m.tipo](m); } catch (e) { enviar({ tipo: 'error', mensaje: String(e) }); } };
  mapa.on('click', function () { enviar({ tipo: 'vacio' }); });
  enviar({ tipo: 'listo' });
})();
</script>
</body>
</html>`;
}
