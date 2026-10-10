// Cambiar la contraseña. Obligatorio al entrar con una contraseña temporal (la que pone
// un administrador); también se abre desde Datos. Mínimo 8 caracteres.
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useApp } from '../estado/AppContext';
import { Boton } from '../componentes/ui';
import { estilosFormulario as s } from './IngresoScreen';

const MINIMO = 8;   // el mismo de validarClave en api/src/validar.js

export default function CambiarClaveScreen({ navigation }) {
  const { sesion, cambiarClave, salir, avisar } = useApp();
  const obligatorio = !!(sesion && sesion.usuario.debeCambiarClave);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (nueva.length < MINIMO) return setError('La nueva contraseña debe tener al menos ' + MINIMO + ' caracteres');
    if (nueva !== repetir) return setError('Las dos contraseñas nuevas no coinciden');
    setGuardando(true);
    setError('');
    try {
      await cambiarClave(actual, nueva);
      avisar('Contraseña cambiada');
      if (!obligatorio && navigation) navigation.goBack();
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  const campo = (titulo, valor, cambiar, id, siguiente) => (
    <View style={{ gap: 6 }}>
      <Text style={s.etiqueta}>{titulo}</Text>
      <TextInput value={valor} onChangeText={cambiar} secureTextEntry autoCapitalize="none" autoCorrect={false}
        returnKeyType={siguiente ? 'next' : 'done'} onSubmitEditing={siguiente ? undefined : guardar} style={s.campo} testID={id} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        {obligatorio ? (
          <>
            <Text style={s.titulo}>{'Hola, ' + sesion.usuario.nombre}</Text>
            <Text style={s.ayuda}>Entraste con una contraseña temporal. Escoge una propia para seguir: solo tú la vas a conocer.</Text>
          </>
        ) : null}
        {campo(obligatorio ? 'Contraseña temporal' : 'Contraseña actual', actual, setActual, 'clave-actual', true)}
        {campo('Contraseña nueva (mínimo ' + MINIMO + ' caracteres)', nueva, setNueva, 'clave-nueva', true)}
        {campo('Repite la contraseña nueva', repetir, setRepetir, 'clave-repetir', false)}
        {error ? <Text style={s.error} testID="clave-error">{error}</Text> : null}
        <Boton titulo={guardando ? 'Guardando…' : 'Guardar contraseña'} tipo="pri" deshabilitado={guardando} onPress={guardar} testID="clave-guardar" />
        {obligatorio ? <Boton titulo="Salir" onPress={salir} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
