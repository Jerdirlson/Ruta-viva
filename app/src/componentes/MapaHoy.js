// Mapa nativo (Google Maps en Android, Apple Maps en iPhone). En Expo Go funciona tal
// cual; el APK de Android necesita GOOGLE_MAPS_ANDROID_API_KEY (ver app.config.js).
//
// Cada marcador está EXACTAMENTE en la coordenada de una ferretería. Las que en pantalla
// se taparían se juntan en un círculo con el número, dibujado sobre la más urgente
// (ver agrupar en nucleo/geo). Tocarlo acerca el mapa; si están en el mismo sitio
// (mismo edificio), el zoom no las separa y se eligen de una lista (onElegirVarias).
//
// El toque NO depende de la detección del mapa nativo: en iPhone, los marcadores
// dibujados como imagen (tracksViewChanges apagado, necesario con cientos de ellos) no
// reciben el toque y llega al mapa. Por eso cada toque del mapa se resuelve con la misma
// geometría con que se dibujan los marcadores (marcadorEn en nucleo/geo).
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { color } from '../tema';
import { colorPin } from '../nucleo/reglas';
import { pedirPermisoUbicacion } from '../datos/ubicacion';
import { agrupar, enVista, extensionM, marcadorEn, ordenarPorCercania, MISMO_SITIO_M, TOQUE_PUNTO_PX, GRUPO_MAX_PX } from '../nucleo/geo';

const CENTRO_AMB = { latitude: 7.1, longitude: -73.12, latitudeDelta: 0.18, longitudeDelta: 0.18 }; // área metropolitana de Bucaramanga
const MARGEN = { top: 60, right: 60, bottom: 60, left: 60 };
// Sin los negocios ni el transporte del mapa base de Google: sus íconos se confundían con
// las ferreterías. Solo quedan calles y nombres de barrios (Android; en iPhone,
// showsPointsOfInterest hace lo mismo con Apple Maps).
const ESTILO_MAPA = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] }
];
const HOLGURA_PX = 4;   // un dedo que cae justo en el borde también cuenta
const CERCANAS_EN_VISTA = 8;   // con "Cerca de mí": el vendedor y las 8 más cercanas

const ladoDe = g => {
  const n = g.ferreterias.length;
  return n === 1 ? TOQUE_PUNTO_PX : n < 10 ? 32 : n < 100 ? 38 : GRUPO_MAX_PX;
};

function Punto({ g, elegida }) {
  const fondo = color.pin[g.color];
  const n = g.ferreterias.length;
  const lado = ladoDe(g);
  // El punto se ve pequeño, pero el área que se toca es más grande.
  if (n === 1) {
    return (
      <View collapsable={false} style={[s.toque, { width: lado, height: lado }]}>
        <View style={[s.punto, { backgroundColor: fondo }, elegida && s.puntoElegido]} />
      </View>
    );
  }
  return (
    <View collapsable={false} style={[s.grupo, { backgroundColor: fondo, width: lado, height: lado, borderRadius: lado / 2 }, elegida && s.grupoElegido]}>
      <Text style={[s.numero, g.color === 'amarillo' && { color: color.texto }]}>{n}</Text>
    </View>
  );
}

// En Android cada marcador con vista propia es una "foto" (bitmap) que el mapa toma y
// congela (tracksViewChanges). Cada marcador conserva su key (no se borra y se vuelve a
// crear): recrearlos en bloque, sobre todo con el mapa moviéndose, dejaba en Android
// círculos viejos sin borrar y pines por defecto sin dibujar. Cuando cambia su número, su
// color, si está elegido, o al volver a la pantalla (repintar), se descongela un momento
// para tomar la foto nueva, en su lugar.
const Marcador = memo(function Marcador({ g, elegida, repintar, onTocar }) {
  const [rastrear, setRastrear] = useState(true);
  const n = g.ferreterias.length;
  useEffect(() => {
    setRastrear(true);
    const t = setTimeout(() => setRastrear(false), 800);
    return () => clearTimeout(t);
  }, [g.color, n, elegida, repintar]);
  return (
    <Marker
      coordinate={{ latitude: g.lat, longitude: g.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      centerOffset={{ x: 0, y: 0 }}
      zIndex={elegida ? 1000 : n}
      tracksViewChanges={rastrear}
      onPress={ev => onTocar(g, ev)}
    >
      <Punto g={g} elegida={elegida} />
    </Marker>
  );
}, (a, b) => a.onTocar === b.onTocar && a.elegida === b.elegida && a.repintar === b.repintar && a.g.lat === b.g.lat &&
  a.g.lng === b.g.lng && a.g.color === b.g.color && a.g.ferreterias.length === b.g.ferreterias.length);

export default function MapaHoy({ lista, posicion, elegidaId, enfoque, onSeleccionar, onElegirVarias }) {
  const mapa = useRef(null);
  const [region, setRegion] = useState(CENTRO_AMB);
  const [tamano, setTamano] = useState(null);
  // Al volver a la pantalla (por ejemplo, de la ficha) se repintan los marcadores en su
  // lugar (sin recrearlos): Android puede haber dejado sus fotos desactualizadas.
  const [vuelta, setVuelta] = useState(0);
  useFocusEffect(useCallback(() => { setVuelta(v => v + 1); }, []));

  // Punto azul del vendedor: lo dibuja el mapa nativo con el permiso de ubicación.
  const [conPermiso, setConPermiso] = useState(false);
  useEffect(() => { pedirPermisoUbicacion().then(setConPermiso); }, []);

  // La región visible manda el agrupamiento y los toques. No se confía solo en
  // onRegionChangeComplete (en Android no siempre llega): al moverse el mapa se le
  // preguntan sus bordes reales un instante después de que se detiene.
  const preguntarRegion = useRef(null);
  const leerRegion = useCallback(() => {
    clearTimeout(preguntarRegion.current);
    preguntarRegion.current = setTimeout(async () => {
      try {
        const b = mapa.current && await mapa.current.getMapBoundaries();
        if (!b) return;
        const r = {
          latitude: (b.northEast.latitude + b.southWest.latitude) / 2,
          longitude: (b.northEast.longitude + b.southWest.longitude) / 2,
          latitudeDelta: Math.abs(b.northEast.latitude - b.southWest.latitude),
          longitudeDelta: Math.abs(b.northEast.longitude - b.southWest.longitude)
        };
        if (r.latitudeDelta > 0 && r.longitudeDelta > 0) setRegion(r);
      } catch (e) {
        // Sin bordes todavía (mapa cargando): se queda la región anterior.
      }
    }, 250);
  }, []);
  useEffect(() => () => clearTimeout(preguntarRegion.current), []);
  const ubicadas = useMemo(() => lista.filter(f => f.lat != null), [lista]);
  // Solo lo que está en la vista: de cerca serían cientos de marcadores fuera de pantalla.
  const grupos = useMemo(() => agrupar(enVista(ubicadas, region), region, tamano, colorPin), [ubicadas, region, tamano]);

  const encuadrar = useCallback(puntos => {
    if (puntos.length && mapa.current) mapa.current.fitToCoordinates(puntos, { edgePadding: MARGEN, animated: true });
  }, []);
  // Sin ubicación: todas. Con "Cerca de mí": el vendedor y las más cercanas (si se
  // encuadraran todas, la vista no cambiaría y parecería que no hizo nada).
  const ultimoEnfoque = useRef(0);
  const enfocar = useCallback(() => {
    if (!enfoque || !mapa.current) return false;
    ultimoEnfoque.current = Date.now();
    mapa.current.animateToRegion({ latitude: enfoque.lat, longitude: enfoque.lng, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 600);
    return true;
  }, [enfoque]);
  useEffect(() => { enfocar(); }, [enfoque && enfoque.t]); // eslint-disable-line react-hooks/exhaustive-deps

  const ajustar = useCallback(() => {
    // Recién centrado en una ferretería ("Ver en el mapa"): no encuadrar todo encima.
    if (Date.now() - ultimoEnfoque.current < 2500) return;
    const base = posicion ? ordenarPorCercania(ubicadas, posicion).slice(0, CERCANAS_EN_VISTA) : ubicadas;
    const puntos = base.map(f => ({ latitude: f.lat, longitude: f.lng }));
    if (posicion) puntos.push({ latitude: posicion.lat, longitude: posicion.lng });
    encuadrar(puntos);
  }, [ubicadas, posicion, encuadrar]);

  // Al cambiar de zona o al ubicarse, encuadra de nuevo.
  useEffect(() => { ajustar(); }, [lista.length, posicion]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirGrupo = g => {
    if (g.ferreterias.length === 1) return onSeleccionar(g.ferreterias[0]);
    if (extensionM(g.ferreterias) < MISMO_SITIO_M && onElegirVarias) return onElegirVarias(g.ferreterias);
    onSeleccionar(null);
    encuadrar(g.ferreterias.map(f => ({ latitude: f.lat, longitude: f.lng })));
  };

  // Si el mapa nativo sí entrega el toque al marcador, el toque del mapa que llega
  // detrás (en iPhone llegan los dos) se ignora para no resolverlo dos veces.
  const ultimoToqueMarcador = useRef(0);
  const elegirRef = useRef(elegirGrupo);
  elegirRef.current = elegirGrupo;
  const tocarMarcador = useCallback((g, ev) => {
    ultimoToqueMarcador.current = Date.now();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    elegirRef.current(g);
  }, []);

  const tocarMapa = ev => {
    const e = (ev && ev.nativeEvent) || {};
    if (e.action === 'marker-press' || Date.now() - ultimoToqueMarcador.current < 400) return;
    const punto = e.coordinate ? { lat: e.coordinate.latitude, lng: e.coordinate.longitude } : null;
    const g = marcadorEn(grupos, punto, region, tamano, x => ladoDe(x) / 2 + HOLGURA_PX);
    if (g) elegirGrupo(g);
    else onSeleccionar(null);
  };

  return (
    <View style={StyleSheet.absoluteFill} onLayout={e => setTamano({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })}>
      <MapView
        ref={mapa}
        style={StyleSheet.absoluteFill}
        initialRegion={CENTRO_AMB}
        onMapReady={() => { if (!(enfoque && Date.now() - enfoque.t < 5000 && enfocar())) ajustar(); leerRegion(); }}
        onRegionChange={leerRegion}
        onRegionChangeComplete={r => { setRegion(r); leerRegion(); }}
        showsUserLocation={conPermiso || !!posicion}
        showsMyLocationButton={Platform.OS === 'android' && conPermiso}
        moveOnMarkerPress={false}
        customMapStyle={ESTILO_MAPA}
        showsPointsOfInterest={false}
        toolbarEnabled={false}
        onPress={tocarMapa}
      >
        {grupos.map(g => {
          const elegida = !!elegidaId && g.ferreterias.some(f => f.id === elegidaId);
          return <Marcador key={g.clave} g={g} elegida={elegida} repintar={vuelta} onTocar={tocarMarcador} />;
        })}
      </MapView>
      <Text style={s.diagnostico} pointerEvents="none" testID="mapa-diagnostico">
        {'~' + Math.max(0.1, Math.round(region.longitudeDelta * 111 * 10) / 10) + ' km · ' + grupos.length + ' marcadores'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  toque: { alignItems: 'center', justifyContent: 'center' },
  punto: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: color.fondo },
  puntoElegido: { width: 26, height: 26, borderRadius: 13, borderWidth: 4, borderColor: color.grafito },
  grupo: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: color.fondo },
  grupoElegido: { borderWidth: 4, borderColor: color.grafito },
  numero: { color: color.marcaTexto, fontWeight: '800', fontSize: 13 },
  diagnostico: { position: 'absolute', left: 8, top: 8, fontSize: 11, color: color.suave, backgroundColor: color.fondo,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', opacity: 0.85 }
});
