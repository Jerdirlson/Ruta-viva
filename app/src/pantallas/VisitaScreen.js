// Registrar visita: resultado, líneas que vende, marca de competencia, notas y fecha.
// El botón "Guardar visita" queda siempre visible al pie.
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, letra, radio, TOQUE } from '../tema';
import { EXHIBIDORES, LINEAS, MARCAS, RESULTADOS, LIMITES, hoyISO, fechaHaceDias, unicos } from '../nucleo/reglas';
import { useApp } from '../estado/AppContext';
import { Boton, Opcion } from '../componentes/ui';

function fechaReal(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d && y >= 2000 && y <= 2100;
}

export default function VisitaScreen({ route, navigation }) {
  const { censo, registrarVisita, avisar } = useApp();
  const abajo = useSafeAreaInsets().bottom;
  const f = censo.find(x => x.id === route.params.id);
  const [resultado, setResultado] = useState('');
  const [lineas, setLineas] = useState([]);
  const [competencia, setCompetencia] = useState('');
  const [notas, setNotas] = useState('');
  const [cuando, setCuando] = useState('hoy');
  const [otraFecha, setOtraFecha] = useState(hoyISO());
  // Lo que hay hoy en la ferretería: parte de lo último que se sabía y el vendedor lo corrige.
  const [enExhibicion, setEnExhibicion] = useState(() => (f && f.marcas) || []);
  const [exhibidor, setExhibidor] = useState(() => (f && f.exhibidor) || '');
  const alternarMarca = m => setEnExhibicion(ms => (ms.includes(m) ? ms.filter(x => x !== m) : ms.concat(m)));

  const marcas = useMemo(() => unicos(censo.flatMap(x => x.visitas.map(v => v.competencia))).slice(0, 12), [censo]);
  const alternarLinea = l => setLineas(ls => (ls.includes(l) ? ls.filter(x => x !== l) : ls.concat(l)));

  const guardar = () => {
    if (!resultado) return avisar('Elige un resultado');
    const fecha = cuando === 'hoy' ? hoyISO() : cuando === 'ayer' ? fechaHaceDias(1) : otraFecha.trim();
    if (!fechaReal(fecha)) return avisar('Fecha no válida: usa el formato AAAA-MM-DD');
    try {
      // Si no estaba, no se vio nada: no se registran marcas ni exhibidor.
      const vio = resultado !== 'no_estaba';
      registrarVisita({
        ferreteriaId: f.id, fecha, resultado, lineas, competencia, notas,
        marcas: vio ? enExhibicion : undefined,
        exhibidor: vio && exhibidor ? exhibidor : undefined
      });
      avisar('Visita guardada');
      navigation.goBack();
    } catch (e) {
      avisar(e.message);
    }
  };

  if (!f) return <View style={s.pantalla}><Text style={s.etiqueta}>No encontramos esta ferretería.</Text></View>;

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.lugar} numberOfLines={2}>{f.nombre + (f.barrio ? ' · ' + f.barrio : '')}</Text>

        <Text style={s.etiqueta}>Resultado</Text>
        <View style={s.rejilla}>
          {Object.keys(RESULTADOS).map(k => (
            <Opcion key={k} titulo={RESULTADOS[k]} activa={resultado === k} onPress={() => setResultado(k)} estilo={s.mitad} testID={'resultado-' + k} />
          ))}
        </View>

        {resultado !== 'no_estaba' ? (
          <>
            <Text style={s.etiqueta}>Marcas que tiene hoy</Text>
            <Text style={s.ayuda}>Viene marcado lo último que se sabía. Corrige lo que cambió.</Text>
            <View style={s.rejilla}>
              {Object.keys(MARCAS).map(k => (
                <Opcion key={k} chica titulo={MARCAS[k]} activa={enExhibicion.includes(k)} onPress={() => alternarMarca(k)} estilo={s.tercio} testID={'marca-' + k} />
              ))}
            </View>
            <Text style={s.etiqueta}>Exhibidor SOCODA</Text>
            <View style={s.rejilla}>
              {Object.keys(EXHIBIDORES).map(k => (
                <Opcion key={k} chica titulo={EXHIBIDORES[k]} activa={exhibidor === k} onPress={() => setExhibidor(k)} estilo={s.tercio} testID={'exhibidor-' + k} />
              ))}
            </View>
          </>
        ) : null}

        <Text style={s.etiqueta}>Líneas que vende</Text>
        <View style={s.rejilla}>
          {Object.keys(LINEAS).map(k => (
            <Opcion key={k} titulo={LINEAS[k]} activa={lineas.includes(k)} onPress={() => alternarLinea(k)} estilo={s.tercio} testID={'linea-' + k} />
          ))}
        </View>

        <Text style={s.etiqueta}>Marca de competencia</Text>
        <TextInput value={competencia} onChangeText={setCompetencia} maxLength={LIMITES.competencia}
          placeholder="La que más vende ahí" placeholderTextColor={color.suave} style={s.campo} testID="competencia" />
        {marcas.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {marcas.map(m => <Opcion key={m} chica titulo={m} activa={competencia === m} onPress={() => setCompetencia(m)} />)}
          </ScrollView>
        ) : null}

        <Text style={s.etiqueta}>Notas</Text>
        <TextInput value={notas} onChangeText={setNotas} maxLength={LIMITES.notas} multiline
          style={[s.campo, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} testID="notas" />

        <Text style={s.etiqueta}>Fecha</Text>
        <View style={s.rejilla}>
          <Opcion chica titulo="Hoy" activa={cuando === 'hoy'} onPress={() => setCuando('hoy')} estilo={s.tercio} />
          <Opcion chica titulo="Ayer" activa={cuando === 'ayer'} onPress={() => setCuando('ayer')} estilo={s.tercio} />
          <Opcion chica titulo="Otra" activa={cuando === 'otra'} onPress={() => setCuando('otra')} estilo={s.tercio} />
        </View>
        {cuando === 'otra' ? (
          <TextInput value={otraFecha} onChangeText={setOtraFecha} placeholder="AAAA-MM-DD" style={s.campo}
            keyboardType="numbers-and-punctuation" maxLength={10} />
        ) : null}
      </ScrollView>
      <View style={[s.pie, { paddingBottom: 12 + abajo }]}>
        <Boton titulo="Guardar visita" tipo="pri" onPress={guardar} testID="guardar-visita" />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 10, paddingBottom: 24 },
  lugar: { fontSize: letra.normal, fontWeight: '600', color: color.suave },
  etiqueta: { fontSize: letra.normal, fontWeight: '800', color: color.texto, marginTop: 8 },
  ayuda: { fontSize: letra.chica, color: color.suave },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mitad: { flexBasis: '48%', flexGrow: 1 },
  tercio: { flexBasis: '30%', flexGrow: 1, minHeight: TOQUE },
  campo: {
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    paddingHorizontal: 12,
    fontSize: letra.normal,
    color: color.texto
  },
  pie: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.linea, backgroundColor: color.fondo }
});
