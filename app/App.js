// Ruta-viva — app nativa para los vendedores de SOCODA.
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { color, letra } from './src/tema';
import { AppProvider, useApp } from './src/estado/AppContext';
import { Toast } from './src/componentes/ui';
import EstadoSync from './src/componentes/EstadoSync';
import HoyScreen from './src/pantallas/HoyScreen';
import CensoScreen from './src/pantallas/CensoScreen';
import ResumenScreen from './src/pantallas/ResumenScreen';
import DatosScreen from './src/pantallas/DatosScreen';
import FichaScreen from './src/pantallas/FichaScreen';
import VisitaScreen from './src/pantallas/VisitaScreen';
import NuevaScreen from './src/pantallas/NuevaScreen';
import IngresoScreen from './src/pantallas/IngresoScreen';
import CambiarClaveScreen from './src/pantallas/CambiarClaveScreen';
import UsuariosScreen from './src/pantallas/UsuariosScreen';
import { actualizarAlAbrir } from './src/datos/actualizaciones';

const Pila = createNativeStackNavigator();
const Pestanas = createBottomTabNavigator();

const tema = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, primary: color.marca, background: color.fondo, card: color.fondo, text: color.texto, border: color.linea }
};

const ICONOS = { Hoy: 'today-outline', Censo: 'list-outline', Resumen: 'stats-chart-outline', Datos: 'folder-open-outline' };

// Encabezado como el sitio de SOCODA: blanco, "Socoda" en rojo y franja rojo oscuro arriba.
function Marca() {
  return <Text style={s.marca}>Socoda</Text>;
}

function Principal() {
  return (
    <Pestanas.Navigator
      screenOptions={({ route }) => ({
        headerTitle: () => <Marca />,
        headerTitleAlign: 'left',
        headerRight: () => <EstadoSync />,
        headerStyle: { backgroundColor: color.fondo, borderTopWidth: 4, borderTopColor: color.marcaOscuro },
        headerShadowVisible: true,
        tabBarActiveTintColor: color.marca,
        tabBarInactiveTintColor: color.suave,
        tabBarLabelStyle: { fontSize: letra.mini, fontWeight: '700' },
        tabBarStyle: { minHeight: 60 },
        tabBarIcon: ({ color: tinta, size }) => <Ionicons name={ICONOS[route.name]} size={size} color={tinta} />,
        tabBarButtonTestID: 'pestana-' + route.name
      })}
    >
      <Pestanas.Screen name="Hoy" component={HoyScreen} />
      <Pestanas.Screen name="Censo" component={CensoScreen} />
      <Pestanas.Screen name="Resumen" component={ResumenScreen} />
      <Pestanas.Screen name="Datos" component={DatosScreen} />
    </Pestanas.Navigator>
  );
}

// Primera descarga del censo (celular recién instalado o sesión nueva): pantalla de carga
// en vez de una app vacía. Si no hay señal, lo dice y deja reintentar.
function CargandoCenso() {
  const { sync, sincronizar } = useApp();
  const fallo = !sync.sincronizando && ['sin-conexion', 'error'].includes(sync.estado);
  return (
    <View style={s.cargando}>
      <Text style={s.marca}>Socoda</Text>
      {fallo ? (
        <>
          <Text style={s.cargandoTexto}>
            {sync.estado === 'sin-conexion' ? 'Sin conexión con el servidor. Revisa la señal.' : 'El servidor tuvo un problema.'}
          </Text>
          <Text style={s.reintentar} onPress={sincronizar} accessibilityRole="button" testID="reintentar">Reintentar</Text>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={color.marca} />
          <Text style={s.cargandoTexto}>Descargando el censo del servidor…</Text>
          <Text style={s.cargandoAyuda}>Solo la primera vez. Después solo baja lo que cambie.</Text>
        </>
      )}
    </View>
  );
}

function Raiz() {
  const { cargado, modo, sesion, datos } = useApp();
  if (!cargado) {
    return <View style={s.cargando}><ActivityIndicator size="large" color={color.marca} /></View>;
  }
  // Con servidor: sin sesión, solo el ingreso; con contraseña temporal, solo cambiarla.
  if (modo === 'servidor' && !sesion) {
    return <SafeAreaView style={s.solo}><IngresoScreen /><Toast /></SafeAreaView>;
  }
  if (modo === 'servidor' && sesion.usuario.debeCambiarClave) {
    return <SafeAreaView style={s.solo}><CambiarClaveScreen /><Toast /></SafeAreaView>;
  }
  if (modo === 'servidor' && !datos.ultimaSync) {
    return <SafeAreaView style={s.solo}><CargandoCenso /><Toast /></SafeAreaView>;
  }
  return (
    <NavigationContainer theme={tema}>
      <Pila.Navigator screenOptions={{ headerTintColor: color.texto, headerBackTitle: 'Atrás', headerStyle: { backgroundColor: color.fondo } }}>
        <Pila.Screen name="Principal" component={Principal} options={{ headerShown: false }} />
        <Pila.Screen name="Ficha" component={FichaScreen} options={{ title: 'Ferretería' }} />
        <Pila.Screen name="Visita" component={VisitaScreen} options={{ title: 'Registrar visita', presentation: 'modal' }} />
        <Pila.Screen name="Nueva" component={NuevaScreen} options={{ title: 'Nueva ferretería', presentation: 'modal' }} />
        <Pila.Screen name="CambiarClave" component={CambiarClaveScreen} options={{ title: 'Cambiar contraseña' }} />
        <Pila.Screen name="Usuarios" component={UsuariosScreen} options={{ title: 'Usuarios del equipo' }} />
      </Pila.Navigator>
      <Toast />
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => { actualizarAlAbrir(); }, []);
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Raiz />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  marca: { fontSize: 24, fontWeight: '800', color: color.marca, letterSpacing: -0.3 },
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: color.fondo },
  cargandoTexto: { fontSize: letra.normal, fontWeight: '700', color: color.texto, textAlign: 'center' },
  cargandoAyuda: { fontSize: letra.chica, color: color.suave, textAlign: 'center' },
  reintentar: { fontSize: letra.normal, fontWeight: '800', color: color.marca, padding: 12 },
  solo: { flex: 1, backgroundColor: color.fondo }
});
