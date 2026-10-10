// Nueva ferretería encontrada en la calle.
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, letra, radio, TOQUE } from '../tema';
import { LIMITES, unicos } from '../nucleo/reglas';
import { useApp } from '../estado/AppContext';
import { Boton, Opcion } from '../componentes/ui';

const CAMPOS = [
  ['nombre', 'Nombre *', 'default'],
  ['direccion', 'Dirección', 'default'],
  ['barrio', 'Barrio', 'default'],
  ['municipio', 'Municipio', 'default'],
  ['telefono', 'Teléfono', 'phone-pad'],
  ['zona', 'Zona', 'default']
];

export default function NuevaScreen({ navigation }) {
  const { censo, guardarFerreteria, avisar } = useApp();
  const abajo = useSafeAreaInsets().bottom;
  const [f, setF] = useState({});
  const sugerencias = useMemo(() => ({
    municipio: unicos(censo.map(x => x.municipio)),
    zona: unicos(censo.map(x => x.zona))
  }), [censo]);

  const guardar = () => {
    try {
      const nueva = guardarFerreteria(f);
      avisar('Ferretería agregada');
      navigation.replace('Ficha', { id: nueva.id });
    } catch (e) {
      avisar(e.message);
    }
  };

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        {CAMPOS.map(([k, titulo, teclado]) => (
          <View key={k} style={{ gap: 6 }}>
            <Text style={s.etiqueta}>{titulo}</Text>
            <TextInput value={f[k] || ''} onChangeText={v => setF(x => ({ ...x, [k]: v }))} maxLength={LIMITES[k]}
              keyboardType={teclado} style={s.campo} testID={'nueva-' + k} />
            {sugerencias[k] && sugerencias[k].length ? (
              <View style={s.sugerencias}>
                {sugerencias[k].slice(0, 8).map(v => (
                  <Opcion key={v} chica titulo={v} activa={f[k] === v} onPress={() => setF(x => ({ ...x, [k]: v }))} />
                ))}
              </View>
            ) : null}
          </View>
        ))}
        <Text style={s.ayuda}>Cuando estés en la ferretería, abre su ficha y toca "Guardar ubicación aquí".</Text>
      </ScrollView>
      <View style={[s.pie, { paddingBottom: 12 + abajo }]}>
        <Boton titulo="Guardar ferretería" tipo="pri" onPress={guardar} testID="guardar-nueva" />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 24 },
  etiqueta: { fontSize: letra.normal, fontWeight: '800', color: color.texto },
  campo: {
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    paddingHorizontal: 12,
    fontSize: letra.normal,
    color: color.texto
  },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ayuda: { fontSize: letra.chica, color: color.suave },
  pie: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.linea, backgroundColor: color.fondo }
});
