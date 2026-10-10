// Tarjeta compacta de una ferretería: tocarla abre la ficha; abajo, Maps, Llamar y Visitar.
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { color, radio, letra } from '../tema';
import { diasDesde } from '../nucleo/reglas';
import { distanciaA, textoDistancia, urlMaps, telefonoMarcable } from '../nucleo/geo';
import { useApp } from '../estado/AppContext';
import { Boton, ChipEstado, abrir } from './ui';

export function fechaCorta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return d + ' ' + meses[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
}
export function hace(iso) {
  const n = diasDesde(iso);
  if (n === Infinity) return 'nunca visitada';
  if (n <= 0) return 'hoy';
  if (n === 1) return 'ayer';
  return 'hace ' + n + ' días';
}

export default function TarjetaFerreteria({ f }) {
  const navegacion = useNavigation();
  const { posicion, avisar } = useApp();
  const tel = telefonoMarcable(f);
  const d = distanciaA(posicion, f);
  const lugar = [f.barrio, f.municipio].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={() => navegacion.navigate('Ficha', { id: f.id })}
      accessibilityRole="button"
      accessibilityLabel={'Ver ficha de ' + f.nombre}
      style={({ pressed }) => [s.tarjeta, pressed && { backgroundColor: color.superficie }]}
    >
      <View style={s.cab}>
        <Text style={s.nombre} numberOfLines={2}>{f.nombre}</Text>
        <ChipEstado estado={f.estado} />
      </View>
      <Text style={s.meta} numberOfLines={2}>
        {d != null ? <Text style={s.distancia}>{textoDistancia(d) + ' · '}</Text> : null}
        <Text style={s.dir}>{f.direccion || 'Sin dirección'}</Text>
        {lugar ? ' · ' + lugar : ''}
      </Text>
      <Text style={s.meta}>
        {f.ultima ? 'Última visita ' + fechaCorta(f.ultima.fecha) + ' · ' + hace(f.ultima.fecha)
          : (f.marcas && f.marcas.length) || f.exhibidor || (f.proveedores && f.proveedores.length)
            ? 'Visitada en el censo · sin visitas en la app' : 'Sin visitas registradas'}
      </Text>
      {f.estado === 'seguimiento' ? <Text style={s.aviso}>Pidió visita después</Text> : null}
      <View style={s.acciones}>
        <Boton titulo="Maps" estilo={{ flex: 1 }} onPress={() => abrir(urlMaps(f), avisar)} />
        {tel
          ? <Boton titulo="Llamar" estilo={{ flex: 1 }} onPress={() => abrir('tel:' + tel, avisar)} />
          : <Boton titulo="Sin teléfono" tipo="off" estilo={{ flex: 1 }} />}
        <Boton titulo="Visitar" tipo="pri" estilo={{ flex: 1.3 }} onPress={() => navegacion.navigate('Visita', { id: f.id })} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tarjeta: {
    gap: 6,
    padding: 12,
    borderWidth: 2,
    borderColor: color.linea,
    borderRadius: radio.normal,
    backgroundColor: color.fondo
  },
  cab: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  nombre: { flex: 1, fontSize: letra.normal, fontWeight: '800', color: color.texto },
  meta: { fontSize: letra.chica, color: color.suave },
  dir: { color: color.texto, fontWeight: '600' },
  distancia: { color: color.texto, fontWeight: '800' },
  aviso: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: color.avisoFondo,
    color: color.avisoTexto,
    fontWeight: '700',
    fontSize: letra.chica
  },
  acciones: { flexDirection: 'row', gap: 8, marginTop: 4 }
});
