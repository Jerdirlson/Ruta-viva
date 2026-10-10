// Mapa nativo (Google Maps en Android, Apple Maps en iPhone). En Expo Go funciona tal
// cual; el APK de Android necesita GOOGLE_MAPS_ANDROID_API_KEY (ver app.config.js).
import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { color } from '../tema';
import { colorPin } from '../nucleo/reglas';

const CENTRO_AMB = { latitude: 7.1, longitude: -73.12, latitudeDelta: 0.18, longitudeDelta: 0.18 }; // área metropolitana de Bucaramanga
const MARGEN = { top: 60, right: 60, bottom: 60, left: 60 };

export default function MapaHoy({ lista, posicion, onSeleccionar }) {
  const mapa = useRef(null);
  const ubicadas = lista.filter(f => f.lat != null);

  const ajustar = useCallback(() => {
    const puntos = ubicadas.map(f => ({ latitude: f.lat, longitude: f.lng }));
    if (posicion) puntos.push({ latitude: posicion.lat, longitude: posicion.lng });
    if (puntos.length && mapa.current) mapa.current.fitToCoordinates(puntos, { edgePadding: MARGEN, animated: true });
  }, [ubicadas, posicion]);

  // Al cambiar de zona o al ubicarse, encuadra de nuevo.
  useEffect(() => { ajustar(); }, [lista.length, posicion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MapView
      ref={mapa}
      style={StyleSheet.absoluteFill}
      initialRegion={CENTRO_AMB}
      onMapReady={ajustar}
      showsUserLocation={!!posicion}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      onPress={() => onSeleccionar(null)}
    >
      {ubicadas.map(f => (
        <Marker
          key={f.id}
          coordinate={{ latitude: f.lat, longitude: f.lng }}
          pinColor={color.pin[colorPin(f)]}
          title={f.nombre}
          tracksViewChanges={false}
          onPress={ev => { ev.stopPropagation && ev.stopPropagation(); onSeleccionar(f); }}
        />
      ))}
    </MapView>
  );
}
