// Ficha de una ferretería: datos, ubicación, acciones e historial de visitas.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio } from '../tema';
import { LINEAS, RESULTADOS } from '../nucleo/reglas';
import { distanciaA, textoDistancia, urlMaps, telefonoMarcable } from '../nucleo/geo';
import { useApp } from '../estado/AppContext';
import { Boton, ChipEstado, abrir } from '../componentes/ui';
import { fechaCorta } from '../componentes/TarjetaFerreteria';

function Dato({ titulo, valor }) {
  return (
    <View style={s.dato}>
      <Text style={s.datoTitulo}>{titulo}</Text>
      <Text style={s.datoValor}>{valor || '—'}</Text>
    </View>
  );
}

export default function FichaScreen({ route, navigation }) {
  const { censo, posicion, guardarUbicacionAqui, avisar } = useApp();
  const f = censo.find(x => x.id === route.params.id);
  if (!f) {
    return <View style={s.pantalla}><Text style={s.vacio}>No encontramos esta ferretería.</Text></View>;
  }
  const tel = telefonoMarcable(f);
  const d = distanciaA(posicion, f);
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <View style={{ gap: 6 }}>
        <Text style={s.nombre} testID="ficha-nombre">{f.nombre}</Text>
        <ChipEstado estado={f.estado} />
      </View>
      <View>
        <Dato titulo="Dirección" valor={f.direccion} />
        <Dato titulo="Barrio" valor={f.barrio} />
        <Dato titulo="Municipio" valor={f.municipio} />
        <Dato titulo="Zona" valor={f.zona} />
        <Dato titulo="Teléfono" valor={f.telefono} />
        <Dato titulo="Ubicación" valor={f.lat != null ? 'Guardada' + (d != null ? ' · a ' + textoDistancia(d) + ' de ti' : '') : 'Sin ubicar'} />
      </View>
      <View style={s.acciones}>
        <Boton titulo="Maps" estilo={{ flex: 1 }} onPress={() => abrir(urlMaps(f), avisar)} />
        {tel ? <Boton titulo="Llamar" estilo={{ flex: 1 }} onPress={() => abrir('tel:' + tel, avisar)} /> : null}
        <Boton titulo="Registrar visita" tipo="pri" estilo={{ flex: 1.6 }} onPress={() => navigation.navigate('Visita', { id: f.id })} testID="ficha-visitar" />
      </View>
      <Boton
        titulo={f.lat != null ? 'Actualizar ubicación aquí' : 'Guardar ubicación aquí'}
        onPress={() => guardarUbicacionAqui(f.id)}
        testID="guardar-ubicacion"
      />

      <Text style={s.subtitulo}>Historial de visitas</Text>
      {f.visitas.length ? f.visitas.map(v => (
        <View key={v.id} style={s.visita}>
          <View style={s.visitaCab}>
            <Text style={s.visitaFecha}>{fechaCorta(v.fecha)}</Text>
            <Text style={s.visitaResultado}>{RESULTADOS[v.resultado] || v.resultado}</Text>
          </View>
          <Text style={s.meta}>{'Vendedor: ' + (v.vendedor || '—')}</Text>
          {v.lineas && v.lineas.length ? <Text style={s.texto}>{'Líneas: ' + v.lineas.map(l => LINEAS[l] || l).join(', ')}</Text> : null}
          {v.competencia ? <Text style={s.texto}>{'Competencia: ' + v.competencia}</Text> : null}
          {v.notas ? <Text style={s.texto}>{v.notas}</Text> : null}
        </View>
      )) : <Text style={s.vacio}>Sin visitas registradas.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  nombre: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  dato: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.linea },
  datoTitulo: { fontSize: letra.mini, color: color.suave },
  datoValor: { fontSize: letra.normal, fontWeight: '600', color: color.texto },
  acciones: { flexDirection: 'row', gap: 8 },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 8 },
  visita: { gap: 4, padding: 12, borderWidth: 2, borderColor: color.linea, borderRadius: radio.normal },
  visitaCab: { flexDirection: 'row', justifyContent: 'space-between' },
  visitaFecha: { fontWeight: '800', fontSize: letra.normal, color: color.texto },
  visitaResultado: { fontWeight: '700', fontSize: letra.chica, color: color.grafito },
  meta: { fontSize: letra.chica, color: color.suave },
  texto: { fontSize: letra.chica, color: color.texto },
  vacio: { color: color.suave, fontSize: letra.normal, padding: 16 }
});
