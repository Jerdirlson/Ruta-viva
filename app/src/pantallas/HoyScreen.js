// Hoy: visitas pendientes por zona, en lista o mapa, con "Cerca de mí" y ruta en Google Maps.
import React, { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra } from '../tema';
import { pendientesDe, ordenZona } from '../nucleo/reglas';
import { ordenarPorCercania, paradasCercanas, urlRuta, PARADAS_RUTA } from '../nucleo/geo';
import { useApp } from '../estado/AppContext';
import { AvisoLinea, Boton, Opcion, abrir } from '../componentes/ui';
import TarjetaFerreteria from '../componentes/TarjetaFerreteria';
import MapaHoy from '../componentes/MapaHoy';

export default function HoyScreen({ navigation }) {
  const { censo, posicion, ubicarme, datos, modo, sync, avisar } = useApp();
  const [zona, setZona] = useState('');
  const [vista, setVista] = useState('lista');
  const [seleccionada, setSeleccionada] = useState(null);

  const todas = useMemo(() => pendientesDe(censo).sort(ordenZona), [censo]);
  const porZona = useMemo(() => {
    const m = new Map();
    todas.forEach(f => m.set(f.zona || '', (m.get(f.zona || '') || 0) + 1));
    return m;
  }, [todas]);
  const zonaActiva = zona && porZona.has(zona) ? zona : '';
  const delaZona = todas.filter(f => !zonaActiva || f.zona === zonaActiva);
  const pendientes = posicion ? ordenarPorCercania(delaZona, posicion) : delaZona;
  const cercanas = posicion ? paradasCercanas(pendientes, posicion) : [];
  const ruta = cercanas.length ? cercanas : pendientes;
  const nRuta = Math.min(PARADAS_RUTA, ruta.length);

  // En la lista: separadores por zona, salvo cuando se ordena por cercanía o hay una zona elegida.
  const filas = [];
  let zonaAnterior = null;
  pendientes.forEach(f => {
    const z = f.zona || 'Sin zona';
    if (!posicion && !zonaActiva && z !== zonaAnterior) {
      filas.push({ clave: 'g-' + z, grupo: z });
      zonaAnterior = z;
    }
    filas.push({ clave: f.id, f });
  });

  const fecha = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
  const minutos = posicion ? Math.round((Date.now() - posicion.hora) / 60000) : 0;

  const cabecera = (
    <View style={s.cabecera}>
      <View style={s.fila}>
        <Text style={s.titulo}>Hoy</Text>
        <Text style={s.fecha}>{fecha}</Text>
      </View>
      {modo === 'servidor' && !sync.tieneClave
        ? <AvisoLinea texto="Falta la clave del equipo" accion="Escribirla" onPress={() => navigation.navigate('Datos')} /> : null}
      {datos && !datos.vendedorActual
        ? <AvisoLinea texto="Falta tu nombre de vendedor" accion="Escribirlo" onPress={() => navigation.navigate('Datos')} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zonas}>
        <Opcion chica titulo={'Todas ' + todas.length} activa={!zonaActiva} onPress={() => setZona('')} testID="zona-todas" />
        {[...porZona.keys()].map(z => (
          <Opcion key={z || '-'} chica titulo={(z || 'Sin zona') + ' ' + porZona.get(z)} activa={zonaActiva === z}
            onPress={() => setZona(z)} testID={'zona-' + (z || 'sin')} />
        ))}
      </ScrollView>

      <View style={s.controles}>
        <Opcion chica titulo="Lista" activa={vista === 'lista'} onPress={() => setVista('lista')} estilo={{ flex: 1 }} testID="ver-lista" />
        <Opcion chica titulo="Mapa" activa={vista === 'mapa'} onPress={() => setVista('mapa')} estilo={{ flex: 1 }} testID="ver-mapa" />
        <Boton titulo="Cerca de mí" onPress={ubicarme} estilo={{ flex: 1.6 }} testID="cerca" />
      </View>
      {posicion ? <Text style={s.ayuda}>{'Por cercanía · ubicado ' + (minutos < 1 ? 'ahora' : 'hace ' + minutos + ' min')}</Text> : null}

      {nRuta ? (
        <Boton
          tipo="pri"
          testID="ruta"
          titulo={'Abrir ruta en Maps · ' + (cercanas.length ? nRuta + ' más cercanas' : 'próximas ' + nRuta)}
          onPress={() => abrir(urlRuta(ruta), avisar)}
        />
      ) : null}
    </View>
  );

  if (vista === 'mapa') {
    const delMapa = censo.filter(f => !zonaActiva || f.zona === zonaActiva);
    const sinUbicar = delMapa.filter(f => f.lat == null).length;
    return (
      <View style={s.pantalla}>
        <View style={s.cabeceraMapa}>{cabecera}</View>
        <View style={s.leyenda}>
          {[['rojo', 'Pendiente'], ['amarillo', 'Pidió visita'], ['verde', 'Cliente'], ['gris', 'Visitada']].map(([c, t]) => (
            <View key={c} style={s.itemLeyenda}><View style={[s.punto, { backgroundColor: color.pin[c] }]} /><Text style={s.textoLeyenda}>{t}</Text></View>
          ))}
          {sinUbicar ? <Text style={s.textoLeyenda}>{'· ' + sinUbicar + ' sin ubicar'}</Text> : null}
        </View>
        <View style={s.mapa}>
          <MapaHoy lista={delMapa} posicion={posicion} onSeleccionar={setSeleccionada} />
        </View>
        {seleccionada ? (
          <View style={s.seleccion}>
            <TarjetaFerreteria f={censo.find(x => x.id === seleccionada.id) || seleccionada} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <FlatList
      testID="lista-hoy"
      style={s.pantalla}
      contentContainerStyle={s.lista}
      data={filas}
      keyExtractor={x => x.clave}
      ListHeaderComponent={cabecera}
      renderItem={({ item }) => item.grupo
        ? <Text style={s.grupo}>{item.grupo}</Text>
        : <TarjetaFerreteria f={item.f} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={<Text style={s.vacio}>No hay visitas pendientes. ¡Buen trabajo!</Text>}
    />
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  lista: { padding: 16, paddingBottom: 32 },
  cabecera: { gap: 12, paddingBottom: 12 },
  cabeceraMapa: { paddingHorizontal: 16, paddingTop: 16 },
  fila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  fecha: { fontSize: letra.chica, color: color.suave },
  zonas: { gap: 8, paddingRight: 16 },
  controles: { flexDirection: 'row', gap: 8 },
  ayuda: { fontSize: letra.chica, color: color.suave },
  grupo: { marginTop: 6, fontSize: letra.mini, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: color.suave },
  vacio: { color: color.suave, paddingVertical: 16, fontSize: letra.normal },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  punto: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color.fondo },
  textoLeyenda: { fontSize: letra.mini, color: color.suave },
  mapa: { flex: 1, minHeight: 280, marginHorizontal: 16, marginBottom: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: color.linea },
  seleccion: { position: 'absolute', left: 16, right: 16, bottom: 24 }
});
