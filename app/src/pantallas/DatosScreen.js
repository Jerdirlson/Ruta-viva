// Datos: nombre del vendedor, sincronización, importar censo (CSV) y respaldos.
import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { hoyISO, LIMITES } from '../nucleo/reglas';
import { useApp, API_URL } from '../estado/AppContext';
import { Boton } from '../componentes/ui';
import { elegirArchivoTexto, compartirTexto } from '../datos/archivos';
import { textoEstadoSync } from '../componentes/EstadoSync';

function Bloque({ titulo, children }) {
  return (
    <View style={s.bloque}>
      {titulo ? <Text style={s.bloqueTitulo}>{titulo}</Text> : null}
      {children}
    </View>
  );
}

// Confirmación nativa (en la web de prueba, confirm del navegador).
function confirmar(titulo, mensaje) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(titulo + '\n\n' + mensaje));
  return new Promise(resolver => Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
    { text: 'Restaurar', style: 'destructive', onPress: () => resolver(true) }
  ]));
}

export default function DatosScreen() {
  const app = useApp();
  const { datos, censo, modo, sync, avisar } = app;
  const [vendedor, setVendedor] = useState('');
  const [clave, setClave] = useState('');
  useEffect(() => { if (datos) setVendedor(datos.vendedorActual); }, [datos && datos.vendedorActual]); // eslint-disable-line react-hooks/exhaustive-deps

  const conError = fn => async () => {
    try { await fn(); } catch (e) { avisar(e.message || 'No se pudo completar'); }
  };

  const importar = conError(async () => {
    const texto = await elegirArchivoTexto(['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*']);
    if (texto == null) return;
    const r = app.importarCSV(texto);
    avisar('Listo: ' + r.nuevas + ' nuevas, ' + r.actualizadas + ' actualizadas, ' + r.omitidas + ' omitidas');
  });
  const exportar = conError(() => compartirTexto('censo_socoda_' + hoyISO() + '.csv', app.exportarCSV(), 'text/csv'));
  const respaldar = conError(() => compartirTexto('respaldo_rutaviva_' + hoyISO() + '.json', app.respaldo(), 'application/json'));
  const restaurar = conError(async () => {
    const texto = await elegirArchivoTexto(['application/json', '*/*']);
    if (texto == null) return;
    if (!(await confirmar('Restaurar respaldo', 'Esto reemplaza todos los datos de este celular.'))) return;
    app.restaurarRespaldo(texto);
    avisar('Respaldo restaurado');
  });

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Text style={s.titulo}>Datos</Text>
      <Text style={s.ayuda}>{censo.length + ' ferreterías en este celular'}</Text>

      <Bloque titulo="Tu nombre (vendedor)">
        <TextInput value={vendedor} onChangeText={setVendedor} onEndEditing={() => { app.fijarVendedor(vendedor); avisar('Nombre guardado'); }}
          onBlur={() => app.fijarVendedor(vendedor)} maxLength={LIMITES.vendedor} placeholder="Nombre y apellido"
          placeholderTextColor={color.suave} style={s.campo} testID="vendedor" returnKeyType="done" />
        <Text style={s.ayuda}>Aparece en cada visita que registres.</Text>
      </Bloque>

      <Bloque titulo="Sincronización">
        {modo === 'servidor' ? (
          <>
            <TextInput value={clave} onChangeText={setClave} secureTextEntry autoCapitalize="none" autoCorrect={false}
              placeholder={sync.tieneClave ? 'Guardada. Escribe otra para cambiarla' : 'Clave del equipo (la entrega el administrador)'}
              placeholderTextColor={color.suave} style={s.campo} testID="clave" returnKeyType="done"
              onSubmitEditing={() => { if (clave.trim()) { app.fijarClave(clave); setClave(''); } }} />
            {clave.trim() ? <Boton titulo="Guardar clave" onPress={() => { app.fijarClave(clave); setClave(''); }} testID="guardar-clave" /> : null}
            <Text style={s.ayuda} testID="estado-sync-datos">{textoEstadoSync(sync, modo)}</Text>
            <Boton titulo="Sincronizar ahora" tipo="pri" onPress={app.sincronizar} testID="sincronizar" />
            <Text style={s.mini}>{'Servidor: ' + API_URL}</Text>
          </>
        ) : (
          <Text style={s.ayuda}>
            Modo local: esta copia de la app no está conectada a un servidor, así que los datos solo viven en este
            celular. Descarga respaldos con frecuencia.
          </Text>
        )}
      </Bloque>

      <Bloque titulo="Importar censo (CSV)">
        <Text style={s.ayuda}>
          Columnas: nombre, direccion, barrio, municipio, telefono, zona. Opcionales: id, lat, lng. Separador ; o ,.
          Si la ferretería ya existe (por id, o por nombre + dirección + municipio), se actualiza.
        </Text>
        <Boton titulo="Elegir archivo CSV" tipo="pri" onPress={importar} testID="importar" />
      </Bloque>

      <Bloque titulo="Exportar">
        <Boton titulo="Compartir censo (CSV)" onPress={exportar} />
        <Boton titulo="Compartir respaldo completo" onPress={respaldar} />
      </Bloque>

      <Bloque titulo="Restaurar respaldo">
        <Text style={s.ayuda}>Reemplaza todos los datos de este celular.</Text>
        <Boton titulo="Elegir respaldo" onPress={restaurar} />
      </Bloque>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  titulo: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  bloque: { gap: 10, padding: 14, borderWidth: 2, borderColor: color.linea, borderRadius: radio.normal },
  bloqueTitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto },
  campo: {
    minHeight: TOQUE,
    borderWidth: 2,
    borderColor: color.lineaFuerte,
    borderRadius: radio.chico,
    paddingHorizontal: 12,
    fontSize: letra.normal,
    color: color.texto
  },
  ayuda: { fontSize: letra.chica, color: color.suave },
  mini: { fontSize: letra.mini, color: color.suave }
});
