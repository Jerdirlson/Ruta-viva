// Censo: todas las ferreterías, con búsqueda por nombre o barrio y filtros por zona, municipio y estado.
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { ESTADOS, normaliza, ordenZona, unicos } from '../nucleo/reglas';
import { useApp } from '../estado/AppContext';
import { Boton } from '../componentes/ui';
import TarjetaFerreteria from '../componentes/TarjetaFerreteria';

// Botón que abre una lista para elegir un valor (o "Todos").
function Selector({ etiqueta, valor, opciones, onCambiar, testID }) {
  const [abierto, setAbierto] = useState(false);
  const texto = valor ? (opciones.find(o => o[0] === valor) || [valor, valor])[1] : etiqueta;
  const elegir = v => { onCambiar(v); setAbierto(false); };
  return (
    <>
      <Pressable onPress={() => setAbierto(true)} style={[s.selector, valor && s.selectorActivo]} accessibilityRole="button"
        accessibilityLabel={etiqueta + ': ' + (valor ? texto : 'todos')} testID={testID}>
        <Text style={[s.selectorTexto, valor && { color: color.grafitoTexto }]} numberOfLines={1}>{texto} ▾</Text>
      </Pressable>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={() => setAbierto(false)}>
        <Pressable style={s.velo} onPress={() => setAbierto(false)}>
          <View style={s.hoja}>
            <Text style={s.hojaTitulo}>{etiqueta}</Text>
            <ScrollView>
              {[['', 'Todos']].concat(opciones).map(([v, t]) => (
                <Pressable key={v || '-'} onPress={() => elegir(v)} style={s.opcion} accessibilityRole="button">
                  <Text style={[s.opcionTexto, v === valor && { fontWeight: '800', color: color.marca }]}>{t}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function CensoScreen({ navigation }) {
  const { censo } = useApp();
  const [q, setQ] = useState('');
  const [zona, setZona] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [estado, setEstado] = useState('');

  const zonas = useMemo(() => unicos(censo.map(f => f.zona)).map(z => [z, z]), [censo]);
  const municipios = useMemo(() => unicos(censo.map(f => f.municipio)).map(m => [m, m]), [censo]);
  const estados = Object.keys(ESTADOS).map(k => [k, ESTADOS[k]]);

  const busqueda = normaliza(q);
  // Solo se recalcula si cambian los datos o los filtros (no en cada redibujo).
  const filtradas = useMemo(() => censo.filter(f =>
    (!zona || f.zona === zona) &&
    (!municipio || f.municipio === municipio) &&
    (estado ? f.estado === estado : f.estado !== 'descartada') &&
    (!busqueda || normaliza(f.nombre + ' ' + f.barrio).includes(busqueda))
  ).sort(ordenZona), [censo, zona, municipio, estado, busqueda]);

  return (
    <FlatList
      testID="lista-censo"
      style={s.pantalla}
      contentContainerStyle={s.lista}
      keyboardShouldPersistTaps="handled"
      data={filtradas}
      keyExtractor={f => f.id}
      ListHeaderComponent={
        <View style={s.cabecera}>
          <View style={s.fila}>
            <Text style={s.titulo}>Censo</Text>
            <Boton titulo="+ Nueva" onPress={() => navigation.navigate('Nueva')} estilo={{ paddingHorizontal: 16 }} testID="nueva" />
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar por nombre o barrio"
            placeholderTextColor={color.suave}
            style={s.buscar}
            returnKeyType="search"
            accessibilityLabel="Buscar"
            testID="buscar"
          />
          <View style={s.filtros}>
            <Selector etiqueta="Zona" valor={zona} opciones={zonas} onCambiar={setZona} testID="filtro-zona" />
            <Selector etiqueta="Municipio" valor={municipio} opciones={municipios} onCambiar={setMunicipio} testID="filtro-municipio" />
            <Selector etiqueta="Estado" valor={estado} opciones={estados} onCambiar={setEstado} testID="filtro-estado" />
          </View>
          <Text style={s.cuenta} testID="conteo">{filtradas.length + ' ferretería(s)'}</Text>
        </View>
      }
      renderItem={({ item }) => <TarjetaFerreteria f={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={<Text style={s.vacio}>Sin resultados con estos filtros.</Text>}
    />
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  lista: { padding: 16, paddingBottom: 32 },
  cabecera: { gap: 10, paddingBottom: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  buscar: {
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    paddingHorizontal: 12,
    fontSize: letra.normal,
    color: color.texto,
    backgroundColor: color.fondo
  },
  filtros: { flexDirection: 'row', gap: 8 },
  selector: {
    flex: 1,
    minHeight: TOQUE,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    backgroundColor: color.fondo
  },
  selectorActivo: { backgroundColor: color.grafito, borderColor: color.grafito },
  selectorTexto: { fontSize: letra.chica, fontWeight: '700', color: color.texto },
  cuenta: { fontSize: letra.chica, fontWeight: '700', color: color.suave },
  vacio: { color: color.suave, paddingVertical: 16, fontSize: letra.normal },
  velo: { flex: 1, backgroundColor: 'rgba(10,16,28,0.55)', justifyContent: 'flex-end' },
  hoja: { maxHeight: '70%', backgroundColor: color.fondo, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 32, gap: 8 },
  hojaTitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto },
  opcion: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: color.linea },
  opcionTexto: { fontSize: letra.normal, color: color.texto }
});
