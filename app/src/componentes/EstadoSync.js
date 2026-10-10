// Indicador de sincronización en el encabezado ("Sincronizado 10:42", "2 sin enviar"…).
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { color, letra, radio, TOQUE } from '../tema';
import { useApp } from '../estado/AppContext';

export function textoEstadoSync(sync, modo) {
  if (modo !== 'servidor') return 'Modo local';
  if (sync.sincronizando) return 'Sincronizando…';
  if (!sync.tieneClave) return 'Falta la clave del equipo';
  const pend = sync.pendientes ? ' · ' + sync.pendientes + ' sin enviar' : '';
  if (sync.estado === 'clave-incorrecta') return 'Clave incorrecta' + pend;
  if (sync.estado === 'sin-conexion') return 'Sin conexión' + pend;
  if (sync.estado === 'error') return 'Error del servidor' + pend;
  if (sync.pendientes) return sync.pendientes + ' sin enviar';
  if (sync.ultima) {
    const h = new Date(sync.ultima);
    return 'Sincronizado ' + String(h.getHours()).padStart(2, '0') + ':' + String(h.getMinutes()).padStart(2, '0');
  }
  return 'Sin sincronizar';
}

function tono(sync, modo) {
  if (modo !== 'servidor' || sync.sincronizando) return 'neutro';
  if (!sync.tieneClave || sync.pendientes || ['clave-incorrecta', 'sin-conexion', 'error'].includes(sync.estado)) return 'alerta';
  return sync.ultima ? 'ok' : 'neutro';
}

export default function EstadoSync() {
  const { sync, modo } = useApp();
  const navegacion = useNavigation();
  const t = tono(sync, modo);
  const fondo = { ok: color.okFondo, alerta: color.avisoFondo, neutro: color.superficie }[t];
  const tinta = { ok: color.okTexto, alerta: color.avisoTexto, neutro: color.texto }[t];
  return (
    <Pressable onPress={() => navegacion.navigate('Datos')} accessibilityRole="button" style={[s.chip, { backgroundColor: fondo }]} testID="estado-sync">
      <Text style={[s.texto, { color: tinta }]} numberOfLines={1}>{textoEstadoSync(sync, modo)}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { minHeight: TOQUE - 8, maxWidth: 210, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radio.pastilla, marginRight: 12 },
  texto: { fontSize: letra.mini, fontWeight: '700' }
});
