// Ingreso con usuario y contraseña (solo con servidor). La sesión dura 90 días y se
// renueva sola mientras se use: el vendedor no tiene que entrar cada vez.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { useApp } from '../estado/AppContext';
import { Boton } from '../componentes/ui';

export default function IngresoScreen() {
  const { ingresar } = useApp();
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [entrando, setEntrando] = useState(false);

  const entrar = async () => {
    if (!usuario.trim() || !clave) return setError('Escribe tu usuario y tu contraseña');
    setEntrando(true);
    setError('');
    try {
      await ingresar(usuario.trim(), clave);
    } catch (e) {
      setError(e.message);
      setEntrando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.marca}>Socoda</Text>
        <Text style={s.titulo}>Ruta-viva</Text>
        <Text style={s.ayuda}>Entra con el usuario y la contraseña que te dio el administrador.</Text>
        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>Usuario</Text>
          <TextInput value={usuario} onChangeText={setUsuario} autoCapitalize="none" autoCorrect={false}
            autoComplete="username" textContentType="username" returnKeyType="next" style={s.campo} testID="ingreso-usuario" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.etiqueta}>Contraseña</Text>
          <TextInput value={clave} onChangeText={setClave} secureTextEntry autoCapitalize="none" autoCorrect={false}
            autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={entrar}
            style={s.campo} testID="ingreso-clave" />
        </View>
        {error ? <Text style={s.error} testID="ingreso-error">{error}</Text> : null}
        <Boton titulo={entrando ? 'Entrando…' : 'Entrar'} tipo="pri" deshabilitado={entrando} onPress={entrar} testID="ingreso-entrar" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export const estilosFormulario = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  marca: { fontSize: 32, fontWeight: '800', color: color.marca, letterSpacing: -0.5 },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  ayuda: { fontSize: letra.chica, color: color.suave },
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
  error: { fontSize: letra.chica, fontWeight: '700', color: color.avisoTexto, backgroundColor: color.avisoFondo, padding: 12, borderRadius: radio.chico }
});
const s = estilosFormulario;
