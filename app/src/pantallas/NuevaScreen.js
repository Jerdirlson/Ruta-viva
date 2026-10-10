// Nueva ferretería encontrada en la calle, o editar una existente (route.params.id).
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, letra, radio, TOQUE } from '../tema';
import { CATEGORIAS, COCINAS, EXHIBIDORES, LIMITES, MARCAS, PROVEEDORES, TIPOS, unicos } from '../nucleo/reglas';
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
const CONTACTO = [
  ['encargado', 'Encargado o dueño', 'default'],
  ['whatsapp', 'WhatsApp', 'phone-pad'],
  ['correo', 'Correo', 'email-address']
];

// Lo que se edita en el formulario; el resto (Google, ubicación) se conserva al guardar.
const EDITABLES = CAMPOS.concat(CONTACTO).map(c => c[0])
  .concat(['tipo', 'categoria', 'clienteSocoda', 'vendedorAsignado', 'marcas', 'otrasMarcas', 'exhibidor', 'cocinas',
    'refCocinas', 'proveedores', 'otrosProveedores', 'observaciones']);

export default function NuevaScreen({ route, navigation }) {
  const { censo, datos, guardarFerreteria, avisar } = useApp();
  const abajo = useSafeAreaInsets().bottom;
  const id = route.params && route.params.id;
  const existente = id ? censo.find(x => x.id === id) : null;
  const [f, setF] = useState(() => {
    if (!existente) return { tipo: 'ferreteria', clienteSocoda: false, marcas: [], proveedores: [] };
    const ini = {};
    EDITABLES.forEach(k => { ini[k] = existente[k]; });
    return ini;
  });
  const fijar = (k, v) => setF(x => ({ ...x, [k]: v }));
  const alternar = (k, v) => setF(x => {
    const l = x[k] || [];
    return { ...x, [k]: l.includes(v) ? l.filter(y => y !== v) : l.concat(v) };
  });
  const opciones = (k, valores, multiple) => (
    <View style={s.opciones}>
      {Object.entries(valores).map(([v, t]) => (
        <Opcion key={v} chica titulo={t} activa={multiple ? (f[k] || []).includes(v) : f[k] === v}
          onPress={() => (multiple ? alternar(k, v) : fijar(k, f[k] === v ? '' : v))} testID={'nueva-' + k + '-' + v} />
      ))}
    </View>
  );

  useLayoutEffect(() => {
    if (existente) navigation.setOptions({ title: 'Editar ferretería' });
  }, [navigation, existente]);

  const sugerencias = useMemo(() => ({
    municipio: unicos(censo.map(x => x.municipio)),
    zona: unicos(censo.map(x => x.zona)),
    vendedorAsignado: unicos(censo.map(x => x.vendedorAsignado)
      .concat(censo.flatMap(x => x.visitas.map(v => v.vendedor)), [datos && datos.vendedorActual]))
  }), [censo, datos]);

  const guardar = () => {
    try {
      const reg = guardarFerreteria(existente ? { ...f, id } : f);
      if (existente) {
        avisar('Cambios guardados');
        navigation.goBack();
      } else {
        avisar('Ferretería agregada');
        navigation.replace('Ficha', { id: reg.id });
      }
    } catch (e) {
      avisar(e.message);
    }
  };

  const campo = ([k, titulo, teclado]) => (
    <View key={k} style={{ gap: 6 }}>
      <Text style={s.etiqueta}>{titulo}</Text>
      <TextInput value={f[k] || ''} onChangeText={v => fijar(k, v)} maxLength={LIMITES[k]}
        keyboardType={teclado} autoCapitalize={teclado === 'email-address' ? 'none' : 'sentences'}
        style={s.campo} testID={'nueva-' + k} />
      {sugerencias[k] && sugerencias[k].length ? (
        <View style={s.opciones}>
          {sugerencias[k].slice(0, 8).map(v => (
            <Opcion key={v} chica titulo={v} activa={f[k] === v} onPress={() => fijar(k, v)} />
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        {CAMPOS.map(campo)}

        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>Tipo</Text>
          <View style={s.opciones}>
            {Object.entries(TIPOS).map(([k, t]) => (
              <Opcion key={k} chica titulo={t} activa={f.tipo === k} onPress={() => fijar('tipo', k)} testID={'nueva-tipo-' + k} />
            ))}
          </View>
        </View>

        <Text style={s.subtitulo}>Contacto</Text>
        <Text style={s.ayuda}>Son datos personales: pídele permiso al encargado antes de guardarlos.</Text>
        {CONTACTO.map(campo)}

        <Text style={s.subtitulo}>Comercial</Text>
        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>¿Ya es cliente de SOCODA?</Text>
          <View style={s.opciones}>
            <Opcion chica titulo="Sí" activa={f.clienteSocoda === true} onPress={() => fijar('clienteSocoda', true)} testID="nueva-cliente-si" />
            <Opcion chica titulo="No" activa={f.clienteSocoda !== true} onPress={() => fijar('clienteSocoda', false)} />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>Categoría</Text>
          <View style={s.opciones}>
            {CATEGORIAS.map(c => (
              <Opcion key={c} chica titulo={c} activa={f.categoria === c} onPress={() => fijar('categoria', c)} testID={'nueva-categoria-' + c} />
            ))}
            <Opcion chica titulo="Sin categoría" activa={!f.categoria} onPress={() => fijar('categoria', '')} />
          </View>
        </View>
        {campo(['vendedorAsignado', 'Vendedor asignado', 'default'])}

        <Text style={s.subtitulo}>Marcas y exhibición</Text>
        <Text style={s.etiqueta}>Marcas que tiene</Text>
        {opciones('marcas', MARCAS, true)}
        {campo(['otrasMarcas', 'Otras marcas', 'default'])}
        <Text style={s.etiqueta}>Exhibidor SOCODA</Text>
        {opciones('exhibidor', EXHIBIDORES, false)}
        <Text style={s.etiqueta}>¿Vende cocinas integrales?</Text>
        {opciones('cocinas', COCINAS, false)}
        {f.cocinas === 'si' ? (
          <View style={{ gap: 6 }}>
            <Text style={s.etiqueta}>Referencias de cocinas</Text>
            <TextInput value={f.refCocinas == null ? '' : String(f.refCocinas)} onChangeText={v => fijar('refCocinas', v.replace(/\D/g, ''))}
              keyboardType="number-pad" maxLength={4} style={s.campo} testID="nueva-refCocinas" />
          </View>
        ) : null}
        <Text style={s.etiqueta}>Proveedor (por dónde le llega SOCODA)</Text>
        {opciones('proveedores', PROVEEDORES, true)}
        {campo(['otrosProveedores', 'Otro proveedor', 'default'])}
        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>Observaciones</Text>
          <TextInput value={f.observaciones || ''} onChangeText={v => fijar('observaciones', v)} maxLength={LIMITES.observaciones} multiline
            style={[s.campo, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} testID="nueva-observaciones" />
        </View>

        {!existente ? (
          <Text style={s.ayuda}>Cuando estés en la ferretería, abre su ficha y toca "Guardar ubicación aquí".</Text>
        ) : null}
      </ScrollView>
      <View style={[s.pie, { paddingBottom: 12 + abajo }]}>
        <Boton titulo={existente ? 'Guardar cambios' : 'Guardar ferretería'} tipo="pri" onPress={guardar} testID="guardar-nueva" />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 24 },
  etiqueta: { fontSize: letra.normal, fontWeight: '800', color: color.texto },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 8 },
  campo: {
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    paddingHorizontal: 12,
    fontSize: letra.normal,
    color: color.texto
  },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ayuda: { fontSize: letra.chica, color: color.suave },
  pie: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.linea, backgroundColor: color.fondo }
});
