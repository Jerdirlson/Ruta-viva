// Resumen del equipo: visitas y compras por zona y por vendedor, clientes nuevos y
// ferreterías sin visitar hace más de 30 días.
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio } from '../tema';
import { resumen } from '../nucleo/reglas';
import { useApp } from '../estado/AppContext';
import { Opcion } from '../componentes/ui';
import { fechaCorta } from '../componentes/TarjetaFerreteria';

function Tabla({ titulo, filas }) {
  if (!filas.length) return <Text style={s.vacio}>Sin visitas en este periodo.</Text>;
  return (
    <View>
      <View style={[s.filaTabla, s.cabTabla]}>
        <Text style={[s.celda, s.celdaNombre, s.cabTexto]}>{titulo}</Text>
        <Text style={[s.celda, s.cabTexto]}>Visitas</Text>
        <Text style={[s.celda, s.cabTexto]}>Compras</Text>
        <Text style={[s.celda, s.cabTexto]}>Efect.</Text>
      </View>
      {filas.map(f => (
        <View key={f.clave} style={s.filaTabla}>
          <Text style={[s.celda, s.celdaNombre]} numberOfLines={2}>{f.clave}</Text>
          <Text style={s.celda}>{f.visitas}</Text>
          <Text style={s.celda}>{f.compras}</Text>
          <Text style={s.celda}>{Math.round(100 * f.compras / f.visitas) + '%'}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ResumenScreen() {
  const { datos } = useApp();
  const [periodo, setPeriodo] = useState(30);
  const r = useMemo(() => resumen(datos, periodo), [datos, periodo]);
  const kpi = (n, t) => (
    <View style={s.kpi} key={t}>
      <Text style={s.kpiNumero}>{n}</Text>
      <Text style={s.kpiTexto}>{t}</Text>
    </View>
  );
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <Text style={s.titulo}>Resumen</Text>
      <View style={s.fila}>
        <Opcion chica titulo="Últimos 30 días" activa={periodo === 30} onPress={() => setPeriodo(30)} estilo={{ flex: 1 }} testID="periodo-30" />
        <Opcion chica titulo="Todo" activa={periodo === 0} onPress={() => setPeriodo(0)} estilo={{ flex: 1 }} testID="periodo-todo" />
      </View>
      <View style={s.kpis}>
        {kpi(r.visitas, 'Visitas')}
        {kpi(r.compras, 'Compras')}
        {kpi(r.clientesNuevos.length, 'Clientes nuevos')}
        {kpi(r.sinVisitar.length, 'Sin visitar +30 días')}
      </View>
      <Text style={s.subtitulo}>Por zona</Text>
      <Tabla titulo="Zona" filas={r.porZona} />
      <Text style={s.subtitulo}>Por vendedor</Text>
      <Tabla titulo="Vendedor" filas={r.porVendedor} />
      <Text style={s.subtitulo}>Clientes nuevos</Text>
      {r.clientesNuevos.length ? r.clientesNuevos.map(c => (
        <View key={c.id} style={s.item}>
          <Text style={s.itemNombre}>{c.nombre}</Text>
          <Text style={s.itemMeta}>{[c.municipio, c.zona, 'compró ' + fechaCorta(c.fecha)].filter(Boolean).join(' · ')}</Text>
        </View>
      )) : <Text style={s.vacio}>Ninguno.</Text>}
      <Text style={s.subtitulo}>Sin visitar hace más de 30 días</Text>
      {r.sinVisitar.length ? r.sinVisitar.map(f => (
        <View key={f.id} style={s.item}>
          <Text style={s.itemNombre}>{f.nombre}</Text>
          <Text style={s.itemMeta}>{[f.zona, f.ultima ? 'última visita ' + fechaCorta(f.ultima.fecha) : 'nunca visitada'].filter(Boolean).join(' · ')}</Text>
        </View>
      )) : <Text style={s.vacio}>Ninguna.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 8 },
  fila: { flexDirection: 'row', gap: 8 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: { flexBasis: '48%', flexGrow: 1, padding: 12, borderRadius: radio.normal, backgroundColor: color.superficie },
  kpiNumero: { fontSize: 30, fontWeight: '800', color: color.marca, fontVariant: ['tabular-nums'] },
  kpiTexto: { fontSize: letra.chica, color: color.suave },
  filaTabla: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.linea },
  cabTabla: { paddingVertical: 6 },
  cabTexto: { color: color.suave, fontSize: letra.mini, fontWeight: '700' },
  celda: { flex: 1, textAlign: 'right', fontSize: letra.chica, color: color.texto, fontVariant: ['tabular-nums'] },
  celdaNombre: { flex: 2, textAlign: 'left' },
  item: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.linea },
  itemNombre: { fontSize: letra.normal, fontWeight: '700', color: color.texto },
  itemMeta: { fontSize: letra.chica, color: color.suave },
  vacio: { color: color.suave, fontSize: letra.chica }
});
