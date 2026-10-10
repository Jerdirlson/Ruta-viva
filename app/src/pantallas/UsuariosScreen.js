// Usuarios (solo administradores): crear, desactivar o activar, cambiar el rol y poner
// una contraseña temporal. El servidor revisa los permisos; esto es solo la interfaz.
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, letra, radio } from '../tema';
import { useApp } from '../estado/AppContext';
import { Boton, Opcion } from '../componentes/ui';
import { estilosFormulario as f } from './IngresoScreen';

const ROLES = { vendedor: 'Vendedor', admin: 'Administrador' };

function confirmar(titulo, mensaje, si) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(titulo + '\n\n' + mensaje));
  return new Promise(resolver => Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
    { text: si, onPress: () => resolver(true) }
  ], { cancelable: true, onDismiss: () => resolver(false) }));
}

export default function UsuariosScreen() {
  const { sesion, listarUsuarios, crearUsuario, actualizarUsuario, avisar } = useApp();
  const [usuarios, setUsuarios] = useState(null);
  const [nuevo, setNuevo] = useState({ usuario: '', nombre: '', rol: 'vendedor', clave: '' });
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try { setUsuarios(await listarUsuarios()); } catch (e) { setError(e.message); }
  }, [listarUsuarios]);
  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    setError('');
    try {
      const u = await crearUsuario(nuevo);
      avisar('Usuario creado: ' + u.usuario + '. Entrégale la contraseña temporal en persona.');
      setNuevo({ usuario: '', nombre: '', rol: 'vendedor', clave: '' });
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiar = async (u, cambios, mensaje) => {
    try {
      await actualizarUsuario(u.id, cambios);
      avisar(mensaje);
      cargar();
    } catch (e) {
      avisar(e.message);
    }
  };

  const desactivar = async u => {
    if (await confirmar('¿Desactivar a ' + u.nombre + '?', 'No podrá entrar y sus sesiones abiertas se cierran. Sus visitas se conservan.', 'Desactivar')) {
      cambiar(u, { activo: false }, u.nombre + ' quedó desactivado');
    }
  };

  // Contraseña temporal nueva: se genera aquí y se muestra una vez para entregarla en persona.
  const restablecer = async u => {
    const temporal = String(Math.floor(100000 + Math.random() * 900000));
    if (await confirmar('Contraseña temporal para ' + u.nombre, 'Será ' + temporal + '. Anótala y entrégasela en persona: al entrar tendrá que escoger una propia. Sus sesiones abiertas se cierran.', 'Poner contraseña')) {
      cambiar(u, { clave: temporal }, 'Contraseña temporal de ' + u.usuario + ': ' + temporal);
    }
  };

  return (
    <KeyboardAvoidingView style={s.pantalla} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.subtitulo}>Equipo</Text>
        {usuarios == null ? <Text style={f.ayuda}>Cargando…</Text> : usuarios.map(u => (
          <View key={u.id} style={[s.tarjeta, !u.activo && { opacity: 0.6 }]} testID={'usuario-' + u.usuario}>
            <Text style={s.nombre}>{u.nombre + (sesion && u.id === sesion.usuario.id ? ' (tú)' : '')}</Text>
            <Text style={s.meta}>
              {[u.usuario, ROLES[u.rol] || u.rol, u.activo ? 'activo' : 'desactivado', u.debeCambiarClave ? 'con contraseña temporal' : ''].filter(Boolean).join(' · ')}
            </Text>
            {sesion && u.id !== sesion.usuario.id ? (
              <View style={s.acciones}>
                {u.activo
                  ? <Boton titulo="Desactivar" estilo={{ flex: 1 }} onPress={() => desactivar(u)} />
                  : <Boton titulo="Activar" estilo={{ flex: 1 }} onPress={() => cambiar(u, { activo: true }, u.nombre + ' quedó activo')} />}
                <Boton titulo={u.rol === 'admin' ? 'Hacer vendedor' : 'Hacer admin'} estilo={{ flex: 1 }}
                  onPress={() => cambiar(u, { rol: u.rol === 'admin' ? 'vendedor' : 'admin' }, 'Rol actualizado')} />
                <Boton titulo="Contraseña" estilo={{ flex: 1 }} onPress={() => restablecer(u)} />
              </View>
            ) : null}
          </View>
        ))}

        <Text style={s.subtitulo}>Nuevo usuario</Text>
        <View style={{ gap: 6 }}>
          <Text style={f.etiqueta}>Nombre y apellido</Text>
          <TextInput value={nuevo.nombre} onChangeText={v => setNuevo(x => ({ ...x, nombre: v }))} maxLength={60} style={f.campo} testID="nuevo-nombre" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={f.etiqueta}>Usuario para entrar</Text>
          <TextInput value={nuevo.usuario} onChangeText={v => setNuevo(x => ({ ...x, usuario: v }))} autoCapitalize="none" autoCorrect={false}
            maxLength={40} style={f.campo} testID="nuevo-usuario" />
          <Text style={f.ayuda}>Sin espacios ni tildes. Por ejemplo: norberto o maria.lopez</Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={f.etiqueta}>Rol</Text>
          <View style={s.acciones}>
            {Object.entries(ROLES).map(([k, t]) => (
              <Opcion key={k} chica titulo={t} activa={nuevo.rol === k} onPress={() => setNuevo(x => ({ ...x, rol: k }))} estilo={{ flex: 1 }} />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={f.etiqueta}>Contraseña temporal</Text>
          <TextInput value={nuevo.clave} onChangeText={v => setNuevo(x => ({ ...x, clave: v }))} autoCapitalize="none" autoCorrect={false}
            style={f.campo} testID="nuevo-clave" />
          <Text style={f.ayuda}>Entrégasela en persona. Al entrar por primera vez tendrá que escoger una propia de 8 o más caracteres.</Text>
        </View>
        {error ? <Text style={f.error}>{error}</Text> : null}
        <Boton titulo="Crear usuario" tipo="pri" onPress={crear} testID="nuevo-crear" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 6 },
  tarjeta: { gap: 6, padding: 12, borderWidth: 2, borderColor: color.linea, borderRadius: radio.normal },
  nombre: { fontSize: letra.normal, fontWeight: '800', color: color.texto },
  meta: { fontSize: letra.chica, color: color.suave },
  acciones: { flexDirection: 'row', gap: 8 }
});
