// Datos: nombre del vendedor, sincronización, importar censo (CSV) y respaldos.
import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { color, letra, radio, TOQUE } from '../tema';
import { hoyISO, LIMITES } from '../nucleo/reglas';
import { useApp, API_URL } from '../estado/AppContext';
import { Boton } from '../componentes/ui';
import { elegirArchivoTexto, compartirTexto, compartirBytes } from '../datos/archivos';
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
function confirmar(titulo, mensaje, si = 'Restaurar') {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(titulo + '\n\n' + mensaje));
  return new Promise(resolver => Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
    { text: si, style: 'destructive', onPress: () => resolver(true) }
  ]));
}

export default function DatosScreen({ navigation }) {
  const app = useApp();
  const { datos, censo, modo, sync, sesion, avisar } = app;
  const [vendedor, setVendedor] = useState('');
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
  const [generando, setGenerando] = useState(false);
  const excel = conError(async () => {
    setGenerando(true);
    try {
      const bytes = await app.descargarExcel();
      await compartirBytes('censo_ferreterias_socoda_' + hoyISO() + '.xlsx', bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } finally {
      setGenerando(false);
    }
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

  // Lo que no se ha enviado se queda en el celular y se envía cuando alguien vuelva a entrar.
  const salir = conError(async () => {
    const aviso = sync.pendientes
      ? 'Hay ' + sync.pendientes + ' cambio(s) sin enviar. Se quedan en este celular y se envían cuando vuelvas a entrar.'
      : 'Tendrás que escribir tu usuario y contraseña para volver a entrar.';
    if (!(await confirmar('¿Cerrar sesión?', aviso, 'Cerrar sesión'))) return;
    await app.salir();
  });

  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Text style={s.titulo}>Datos</Text>
      <Text style={s.ayuda}>{censo.length + ' ferreterías en este celular'}</Text>

      {modo === 'servidor' && sesion ? (
        <Bloque titulo="Tu cuenta">
          <Text style={s.cuenta} testID="cuenta-nombre">{sesion.usuario.nombre}</Text>
          <Text style={s.ayuda}>{sesion.usuario.usuario + ' · ' + (sesion.usuario.rol === 'admin' ? 'Administrador' : 'Vendedor')}</Text>
          <Text style={s.ayuda}>Tus visitas quedan registradas a tu nombre.</Text>
          {sesion.usuario.rol === 'admin'
            ? <Boton titulo="Usuarios del equipo" onPress={() => navigation.navigate('Usuarios')} testID="ir-usuarios" /> : null}
          <Boton titulo="Cambiar contraseña" onPress={() => navigation.navigate('CambiarClave')} testID="ir-cambiar-clave" />
          <Boton titulo="Cerrar sesión" onPress={salir} testID="salir" />
        </Bloque>
      ) : null}

      {modo === 'local' ? <Bloque titulo="Tu nombre (vendedor)">
        <TextInput value={vendedor} onChangeText={setVendedor} onEndEditing={() => { app.fijarVendedor(vendedor); avisar('Nombre guardado'); }}
          onBlur={() => app.fijarVendedor(vendedor)} maxLength={LIMITES.vendedor} placeholder="Nombre y apellido"
          placeholderTextColor={color.suave} style={s.campo} testID="vendedor" returnKeyType="done" />
        <Text style={s.ayuda}>Aparece en cada visita que registres.</Text>
      </Bloque> : null}

      <Bloque titulo="Sincronización">
        {modo === 'servidor' ? (
          <>
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

      {modo === 'servidor' && sesion && sesion.usuario.rol === 'admin' ? (
        <Bloque titulo="Censo en Excel">
          <Text style={s.ayuda}>
            Con el formato del consolidado de ferreterías (marcas, exhibidor, cocinas, proveedor, observaciones) y las hojas de
            resumen por marca y por ciudad, con lo último del servidor.
          </Text>
          <Boton titulo={generando ? 'Generando…' : 'Descargar censo en Excel'} tipo="pri" deshabilitado={generando} onPress={excel} testID="excel" />
        </Bloque>
      ) : null}

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
  mini: { fontSize: letra.mini, color: color.suave },
  cuenta: { fontSize: letra.normal, fontWeight: '800', color: color.texto }
});
