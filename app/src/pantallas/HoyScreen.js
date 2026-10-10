// Hoy: visitas pendientes por zona, en lista o mapa, con "Cerca de mí" y ruta en Google Maps.
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { pendientesDe, ordenZona, grupoDe, colorPin } from '../nucleo/reglas';
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
  // Varias ferreterías en el mismo sitio (mismo edificio): se elige de una lista.
  const [varias, setVarias] = useState(null);
  const elegir = f => { setVarias(null); setSeleccionada(f); };
  // Filtro del mapa por estado (los mismos colores de la leyenda): '' = todos.
  const [soloColor, setSoloColor] = useState('');

  const todas = useMemo(() => pendientesDe(censo).sort(ordenZona), [censo]);
  const porZona = useMemo(() => {
    const m = new Map();
    todas.forEach(f => m.set(grupoDe(f), (m.get(grupoDe(f)) || 0) + 1));
    return m;
  }, [todas]);
  const zonaActiva = zona && porZona.has(zona) ? zona : '';
  const delaZona = todas.filter(f => !zonaActiva || grupoDe(f) === zonaActiva);
  const pendientes = posicion ? ordenarPorCercania(delaZona, posicion) : delaZona;
  const cercanas = posicion ? paradasCercanas(pendientes, posicion) : [];
  const ruta = cercanas.length ? cercanas : pendientes;
  const nRuta = Math.min(PARADAS_RUTA, ruta.length);

  // En la lista: separadores por zona, salvo cuando se ordena por cercanía o hay una zona elegida.
  const filas = [];
  let zonaAnterior = null;
  pendientes.forEach(f => {
    const z = grupoDe(f);
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
      {modo === 'local' && datos && !datos.vendedorActual
        ? <AvisoLinea texto="Falta tu nombre de vendedor" accion="Escribirlo" onPress={() => navigation.navigate('Datos')} /> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zonas}>
        <Opcion chica titulo={'Todas ' + todas.length} activa={!zonaActiva} onPress={() => setZona('')} testID="zona-todas" />
        {porZona.size > 1 ? [...porZona.keys()].map(z => (
          <Opcion key={z} chica titulo={z + ' ' + porZona.get(z)} activa={zonaActiva === z}
            onPress={() => setZona(z)} testID={'zona-' + z} />
        )) : null}
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
    const delaZonaMapa = censo.filter(f => f.estado !== 'descartada' && (!zonaActiva || grupoDe(f) === zonaActiva));
    const porColor = {};
    delaZonaMapa.forEach(f => { const c = colorPin(f); porColor[c] = (porColor[c] || 0) + 1; });
    const delMapa = soloColor ? delaZonaMapa.filter(f => colorPin(f) === soloColor) : delaZonaMapa;
    const sinUbicar = delMapa.filter(f => f.lat == null).length;
    return (
      <View style={s.pantalla}>
        <View style={s.cabeceraMapa}>{cabecera}</View>
        {/* Filtro por estado: tocar uno muestra solo esos; "Todos" vuelve a mostrarlo todo. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtrosMapa} style={{ flexGrow: 0 }}>
          {[['', 'Todos'], ['rojo', 'Pendientes'], ['amarillo', 'Pidió visita'], ['verde', 'Clientes'], ['gris', 'Visitadas']].map(([c, t]) => {
            const activo = soloColor === c;
            return (
              <Pressable key={c || 'todos'} onPress={() => { setSoloColor(c); setSeleccionada(null); setVarias(null); }}
                accessibilityRole="button" accessibilityState={{ selected: activo }} testID={'filtro-mapa-' + (c || 'todos')}
                style={({ pressed }) => [s.filtroMapa, activo && s.filtroMapaActivo, pressed && { opacity: 0.8 }]}>
                {c ? <View style={[s.punto, { backgroundColor: color.pin[c] }]} /> : null}
                <Text style={[s.filtroMapaTexto, activo && s.filtroMapaTextoActivo]}>
                  {t + ' ' + (c ? porColor[c] || 0 : delaZonaMapa.length)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {sinUbicar ? <Text style={[s.textoLeyenda, s.sinUbicar]}>{sinUbicar + ' de estas sin ubicar en el mapa'}</Text> : null}
        <View style={s.mapa}>
          <MapaHoy lista={delMapa} posicion={posicion} elegidaId={seleccionada && seleccionada.id}
            onSeleccionar={elegir} onElegirVarias={lista => { setSeleccionada(null); setVarias(lista); }} />
        </View>
        {varias ? (
          <View style={[s.seleccion, s.varias]}>
            <Text style={s.variasTitulo}>{varias.length + ' ferreterías en este mismo sitio'}</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {varias.map(f => (
                <Pressable key={f.id} onPress={() => elegir(f)} accessibilityRole="button" testID={'varias-' + f.id}
                  style={({ pressed }) => [s.variasFila, pressed && { backgroundColor: color.superficie }]}>
                  <View style={[s.punto, { backgroundColor: color.pin[colorPin(f)] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.variasNombre} numberOfLines={2}>{f.nombre}</Text>
                    {f.direccion ? <Text style={s.textoLeyenda} numberOfLines={1}>{f.direccion}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Boton titulo="Cerrar" onPress={() => setVarias(null)} />
          </View>
        ) : null}
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
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  filtrosMapa: { gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  filtroMapa: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radio.pastilla,
    borderWidth: 2, borderColor: color.lineaFuerte, backgroundColor: color.fondo },
  filtroMapaActivo: { backgroundColor: color.grafito, borderColor: color.grafito },
  filtroMapaTexto: { fontSize: letra.chica, fontWeight: '700', color: color.texto },
  filtroMapaTextoActivo: { color: color.grafitoTexto },
  sinUbicar: { paddingHorizontal: 16, paddingBottom: 6 },
  punto: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: color.fondo },
  textoLeyenda: { fontSize: letra.mini, color: color.suave },
  mapa: { flex: 1, minHeight: 280, marginHorizontal: 16, marginBottom: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: color.linea },
  seleccion: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  varias: { gap: 8, padding: 12, borderRadius: radio.normal, backgroundColor: color.fondo, borderWidth: 1, borderColor: color.linea,
    shadowColor: color.sombra, shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  variasTitulo: { fontSize: letra.normal, fontWeight: '800', color: color.texto },
  variasFila: { minHeight: TOQUE, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: color.linea }
});
