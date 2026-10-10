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
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { color } from '../tema';
import { colorPin } from '../nucleo/reglas';
import { agrupar, enVista, extensionM, marcadorEn, ordenarPorCercania, MISMO_SITIO_M, TOQUE_PUNTO_PX, GRUPO_MAX_PX } from '../nucleo/geo';

const CENTRO_AMB = { latitude: 7.1, longitude: -73.12, latitudeDelta: 0.18, longitudeDelta: 0.18 }; // área metropolitana de Bucaramanga
const MARGEN = { top: 60, right: 60, bottom: 60, left: 60 };
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
// congela (tracksViewChanges). Actualizar esa foto falla: quedaban círculos viejos al
// acercarse y puntos mal dibujados al elegir una ferretería o volver de la ficha.
// Por eso un marcador nunca se actualiza: si cambia su número, su color o si está elegido,
// cambia su key y se crea uno nuevo, que se dibuja una vez y se congela.
const Marcador = memo(function Marcador({ g, elegida, onTocar }) {
  const [rastrear, setRastrear] = useState(true);
  const n = g.ferreterias.length;
  useEffect(() => {
    const t = setTimeout(() => setRastrear(false), 600);
    return () => clearTimeout(t);
  }, []);
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
}, (a, b) => a.onTocar === b.onTocar && a.g.lat === b.g.lat && a.g.lng === b.g.lng);

export default function MapaHoy({ lista, posicion, elegidaId, onSeleccionar, onElegirVarias }) {
  const mapa = useRef(null);
  const [region, setRegion] = useState(CENTRO_AMB);
  const [tamano, setTamano] = useState(null);
  // Al volver a la pantalla (por ejemplo, de la ficha) se crean de nuevo todos los
  // marcadores: Android puede haber dejado sus fotos desactualizadas.
  const [vuelta, setVuelta] = useState(0);
  useFocusEffect(useCallback(() => { setVuelta(v => v + 1); }, []));
  const ubicadas = useMemo(() => lista.filter(f => f.lat != null), [lista]);
  // Solo lo que está en la vista: de cerca serían cientos de marcadores fuera de pantalla.
  const grupos = useMemo(() => agrupar(enVista(ubicadas, region), region, tamano, colorPin), [ubicadas, region, tamano]);

  const encuadrar = useCallback(puntos => {
    if (puntos.length && mapa.current) mapa.current.fitToCoordinates(puntos, { edgePadding: MARGEN, animated: true });
  }, []);
  // Sin ubicación: todas. Con "Cerca de mí": el vendedor y las más cercanas (si se
  // encuadraran todas, la vista no cambiaría y parecería que no hizo nada).
  const ajustar = useCallback(() => {
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
        onMapReady={ajustar}
        onRegionChangeComplete={setRegion}
        showsUserLocation={!!posicion}
        showsMyLocationButton={false}
        moveOnMarkerPress={false}
        toolbarEnabled={false}
        onPress={tocarMapa}
      >
        {grupos.map(g => {
          const elegida = !!elegidaId && g.ferreterias.some(f => f.id === elegidaId);
          const key = [g.clave, g.ferreterias.length, g.color, elegida ? 'e' : '', vuelta].join(':');
          return <Marcador key={key} g={g} elegida={elegida} onTocar={tocarMarcador} />;
        })}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  toque: { alignItems: 'center', justifyContent: 'center' },
  punto: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: color.fondo },
  puntoElegido: { width: 26, height: 26, borderRadius: 13, borderWidth: 4, borderColor: color.grafito },
  grupo: { alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: color.fondo },
  grupoElegido: { borderWidth: 4, borderColor: color.grafito },
  numero: { color: color.marcaTexto, fontWeight: '800', fontSize: 13 }
});
