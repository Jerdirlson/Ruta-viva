// En el navegador no hay mapa nativo (react-native-maps es solo para el celular).
// Esta versión existe para poder probar el resto de la app en la web.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, TOQUE } from '../tema';
import { colorPin } from '../nucleo/reglas';

export default function MapaHoy({ lista, onSeleccionar }) {
  const ubicadas = lista.filter(f => f.lat != null);
  return (
    <View style={[StyleSheet.absoluteFill, s.fondo]} testID="mapa-web">
      <Text style={s.titulo}>El mapa se ve en la app del celular. Aquí, los puntos ubicados:</Text>
      <ScrollView contentContainerStyle={{ gap: 6 }}>
        {ubicadas.map(f => (
          <Pressable key={f.id} onPress={() => onSeleccionar(f)} style={s.fila} testID={'pin-' + f.id} accessibilityRole="button">
            <View style={[s.punto, { backgroundColor: color.pin[colorPin(f)] }]} />
            <Text style={s.texto}>{f.nombre}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fondo: { backgroundColor: color.superficie, padding: 12, gap: 8 },
  titulo: { color: color.suave, fontSize: letra.chica },
  fila: { minHeight: TOQUE, flexDirection: 'row', alignItems: 'center', gap: 10 },
  punto: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: color.fondo },
  texto: { fontSize: letra.chica, color: color.texto }
});
