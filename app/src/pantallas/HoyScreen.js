// Hoy: visitas pendientes por zona, en lista o mapa, con "Cerca de mí" y ruta en Google Maps.
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { pendientesDe, ordenZona, grupoDe, colorPin } from '../nucleo/reglas';
import { ordenarPorCercania, paradasCercanas, urlRuta, PARADAS_RUTA } from '../nucleo/geo';
import { useApp } from '../estado/AppContext';
import { AvisoLinea, Boton, Opcion, abrir } from '../componentes/ui';
import TarjetaFerreteria from '../componentes/TarjetaFerreteria';
import MapaHoy from '../componentes/MapaHoy';
import { usePersistente } from '../datos/preferencias';

// Botón compacto de filtro (zona o estado). Con punto de color si es un estado.
function Chip({ titulo, activo, onPress, punto, testID }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!activo }} testID={testID}
      style={({ pressed }) => [s.chip, activo && s.chipActivo, pressed && { opacity: 0.8 }]}>
      {punto ? <View style={[s.punto, { backgroundColor: color.pin[punto] }]} /> : null}
      <Text style={[s.chipTexto, activo && s.chipTextoActivo]} numberOfLines={1}>{titulo}</Text>
    </Pressable>
  );
}

export default function HoyScreen({ navigation, route }) {
  const { censo, posicion, ubicarme, datos, modo, sync, avisar } = useApp();
  // Zona, Lista/Mapa y filtro de estado se recuerdan al cerrar la app.
  const [zona, setZona] = usePersistente('hoy.zona', '');
  const [vista, setVista] = usePersistente('hoy.vista', 'lista');
  const [seleccionada, setSeleccionada] = useState(null);
  // Varias ferreterías en el mismo sitio (mismo edificio): se elige de una lista.
  const [varias, setVarias] = useState(null);
  const elegir = f => { setVarias(null); setSeleccionada(f); };
  // Filtro del mapa por estado (los mismos colores de la leyenda): '' = todos.
  const [soloColor, setSoloColor] = usePersistente('hoy.estado', '');
  // "Ver en el mapa": pasa a Mapa sin filtros, con la ferretería elegida y el mapa centrado en ella.
  const [enfoque, setEnfoque] = useState(null);
  const verEnMapa = route && route.params && route.params.verEnMapa;
  const marcaVer = route && route.params && route.params.t;
  useEffect(() => {
    if (!verEnMapa) return;
    const f = censo.find(x => x.id === verEnMapa);
    if (!f || f.lat == null) return;
    if (zona && grupoDe(f) !== zona) setZona('');
    if (soloColor && colorPin(f) !== soloColor) setSoloColor('');
    setVarias(null);
    setSeleccionada(f);
    setVista('mapa');
    setEnfoque({ lat: f.lat, lng: f.lng, t: Date.now() });
  }, [verEnMapa, marcaVer]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lista y Mapa muestran lo mismo: las ferreterías activas de la zona, filtradas por
  // estado (Todos, Pendientes, Pidió visita, Clientes, Visitadas). La ruta sale siempre
  // de las pendientes de la zona.
  const activas = useMemo(() => censo.filter(f => f.estado !== 'descartada').sort(ordenZona), [censo]);
  const delColor = useMemo(() => (soloColor ? activas.filter(f => colorPin(f) === soloColor) : activas), [activas, soloColor]);
  const porZona = useMemo(() => {
    const m = new Map();
    delColor.forEach(f => m.set(grupoDe(f), (m.get(grupoDe(f)) || 0) + 1));
    return m;
  }, [delColor]);
  const zonaActiva = zona && porZona.has(zona) ? zona : '';
  const enZona = f => !zonaActiva || grupoDe(f) === zonaActiva;
  const porColor = {};
  activas.filter(enZona).forEach(f => { const c = colorPin(f); porColor[c] = (porColor[c] || 0) + 1; });
  const totalZona = activas.filter(enZona).length;
  const delaZona = delColor.filter(enZona);
  const pendientes = posicion ? ordenarPorCercania(delaZona, posicion) : delaZona;
  const pendientesRuta = useMemo(() => pendientesDe(censo), [censo]).filter(enZona);
  const cercanas = posicion ? paradasCercanas(ordenarPorCercania(pendientesRuta, posicion), posicion) : [];
  const todas = delColor;
  const ruta = cercanas.length ? cercanas : pendientesRuta;
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
        <Chip titulo={'Todas las zonas ' + todas.length} activo={!zonaActiva} onPress={() => setZona('')} testID="zona-todas" />
        {porZona.size > 1 ? [...porZona.keys()].map(z => (
          <Chip key={z} titulo={z + ' ' + porZona.get(z)} activo={zonaActiva === z} onPress={() => setZona(z)} testID={'zona-' + z} />
        )) : null}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.zonas}>
        {[['', 'Todos'], ['rojo', 'Pendientes'], ['amarillo', 'Pidió visita'], ['verde', 'Clientes'], ['gris', 'Visitadas']].map(([c, t]) => (
          <Chip key={c || 'todos'} punto={c} titulo={t + ' ' + (c ? porColor[c] || 0 : totalZona)} activo={soloColor === c}
            onPress={() => { setSoloColor(c); setSeleccionada(null); setVarias(null); }} testID={'filtro-' + (c || 'todos')} />
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
    const delMapa = delaZona;
    const sinUbicar = delMapa.filter(f => f.lat == null).length;
    return (
      <View style={s.pantalla}>
        <View style={s.cabeceraMapa}>{cabecera}</View>
        {sinUbicar ? <Text style={[s.textoLeyenda, s.sinUbicar]}>{sinUbicar + ' de estas sin ubicar en el mapa'}</Text> : null}
        <View style={s.mapa}>
          <MapaHoy lista={delMapa} posicion={posicion} elegidaId={seleccionada && seleccionada.id} enfoque={enfoque}
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
            <TarjetaFerreteria f={censo.find(x => x.id === seleccionada.id) || seleccionada} enMapa />
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
      ListEmptyComponent={<Text style={s.vacio}>{soloColor === 'rojo' ? 'No hay visitas pendientes. ¡Buen trabajo!' : 'Ninguna ferretería con este filtro.'}</Text>}
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
  zonas: { gap: 6, paddingRight: 16 },
  chip: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radio.pastilla,
    borderWidth: 1.5, borderColor: color.lineaFuerte, backgroundColor: color.fondo },
  chipActivo: { backgroundColor: color.grafito, borderColor: color.grafito },
  chipTexto: { fontSize: letra.mini, fontWeight: '700', color: color.texto },
  chipTextoActivo: { color: color.grafitoTexto },
  controles: { flexDirection: 'row', gap: 8 },
  ayuda: { fontSize: letra.chica, color: color.suave },
  grupo: { marginTop: 6, fontSize: letra.mini, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: color.suave },
  vacio: { color: color.suave, paddingVertical: 16, fontSize: letra.normal },
  leyenda: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
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
