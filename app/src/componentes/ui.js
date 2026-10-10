// Piezas de interfaz reutilizables. Todo lo que se toca mide al menos TOQUE (48 px).
import React, { useEffect, useRef } from 'react';
import { Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, radio, letra, TOQUE } from '../tema';
import { ESTADOS } from '../nucleo/reglas';
import { useApp } from '../estado/AppContext';

export function Boton({ titulo, onPress, tipo = 'sec', estilo, deshabilitado, accesible, testID }) {
  const pri = tipo === 'pri';
  const off = tipo === 'off' || deshabilitado;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accesible || titulo}
      accessibilityState={{ disabled: !!off }}
      testID={testID}
      style={({ pressed }) => [
        e.boton,
        pri && e.botonPri,
        off && e.botonOff,
        pressed && !off && { opacity: 0.75 },
        estilo
      ]}
    >
      <Text style={[e.botonTexto, pri && e.botonTextoPri, off && e.botonTextoOff]} numberOfLines={2}>{titulo}</Text>
    </Pressable>
  );
}

// Opción seleccionable (zona, resultado, línea…): en grafito cuando está activa.
export function Opcion({ titulo, activa, onPress, estilo, chica, testID }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!activa }}
      testID={testID}
      style={({ pressed }) => [e.opcion, chica && e.opcionChica, activa && e.opcionActiva, pressed && { opacity: 0.8 }, estilo]}
    >
      <Text style={[e.opcionTexto, chica && { fontSize: letra.chica }, activa && e.opcionTextoActiva]} numberOfLines={2}>
        {titulo}
      </Text>
    </Pressable>
  );
}

export function ChipEstado({ estado }) {
  const fondo = { cliente: color.okFondo, seguimiento: color.avisoFondo, visitada: color.infoFondo, descartada: color.grafito }[estado] || color.superficie;
  const tinta = { cliente: color.okTexto, seguimiento: color.avisoTexto, visitada: color.grafito, descartada: color.grafitoTexto }[estado] || color.texto;
  return (
    <View style={[e.chip, { backgroundColor: fondo }]}>
      <Text style={[e.chipTexto, { color: tinta }]}>{ESTADOS[estado] || estado}</Text>
    </View>
  );
}

export function AvisoLinea({ texto, accion, onPress }) {
  return (
    <View style={e.aviso}>
      <Text style={e.avisoTexto}>{texto}</Text>
      {accion ? (
        <Pressable onPress={onPress} accessibilityRole="link" style={e.avisoAccion}>
          <Text style={e.avisoEnlace}>{accion}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Seccion({ titulo, children }) {
  return (
    <View style={{ gap: 8 }}>
      {titulo ? <Text style={e.seccion}>{titulo}</Text> : null}
      {children}
    </View>
  );
}

export function abrir(url, avisar) {
  Linking.openURL(url).catch(() => {
    if (avisar) avisar('No se pudo abrir: ' + url);
  });
}

// Aviso emergente al pie de la pantalla.
export function Toast() {
  const { aviso } = useApp();
  const opacidad = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!aviso) return undefined;
    opacidad.setValue(1);
    const t = setTimeout(() => Animated.timing(opacidad, { toValue: 0, duration: 250, useNativeDriver: true }).start(), 2800);
    return () => clearTimeout(t);
  }, [aviso, opacidad]);
  if (!aviso) return null;
  return (
    <Animated.View pointerEvents="none" style={[e.toast, { opacity: opacidad }]} accessibilityLiveRegion="polite">
      <Text style={e.toastTexto} testID="toast">{aviso.texto}</Text>
    </Animated.View>
  );
}

export const e = StyleSheet.create({
  boton: {
    minHeight: TOQUE,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radio.chico,
    borderWidth: 2,
    borderColor: color.grafito,
    backgroundColor: color.fondo,
    alignItems: 'center',
    justifyContent: 'center'
  },
  botonPri: { backgroundColor: color.marca, borderColor: color.marca },
  botonOff: { borderColor: color.linea },
  botonTexto: { fontSize: letra.normal, fontWeight: '700', color: color.grafito, textAlign: 'center' },
  botonTextoPri: { color: color.marcaTexto },
  botonTextoOff: { color: color.suave, fontSize: letra.mini, fontWeight: '600' },
  opcion: {
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radio.chico,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    backgroundColor: color.fondo,
    alignItems: 'center',
    justifyContent: 'center'
  },
  opcionChica: { minHeight: TOQUE, borderRadius: radio.pastilla, paddingHorizontal: 14 },
  opcionActiva: { backgroundColor: color.grafito, borderColor: color.grafito },
  opcionTexto: { fontSize: letra.normal, fontWeight: '700', color: color.texto, textAlign: 'center' },
  opcionTextoActiva: { color: color.grafitoTexto },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radio.pastilla, alignSelf: 'flex-start' },
  chipTexto: { fontSize: letra.mini, fontWeight: '700' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 12,
    borderRadius: radio.chico,
    backgroundColor: color.avisoFondo
  },
  avisoTexto: { flex: 1, color: color.avisoTexto, fontSize: letra.chica, paddingVertical: 10 },
  avisoAccion: { minHeight: TOQUE, justifyContent: 'center', paddingHorizontal: 12 },
  avisoEnlace: { color: color.avisoTexto, fontWeight: '700', textDecorationLine: 'underline', fontSize: letra.chica },
  seccion: { fontSize: letra.mini, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: color.suave },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 96,
    padding: 14,
    borderRadius: radio.chico,
    backgroundColor: color.texto
  },
  toastTexto: { color: color.fondo, fontWeight: '700', textAlign: 'center', fontSize: letra.chica }
});
