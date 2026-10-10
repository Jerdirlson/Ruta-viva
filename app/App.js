// Ruta-viva — app nativa para los vendedores de SOCODA.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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

function Raiz() {
  const { cargado } = useApp();
  if (!cargado) {
    return <View style={s.cargando}><ActivityIndicator size="large" color={color.marca} /></View>;
  }
  return (
    <NavigationContainer theme={tema}>
      <Pila.Navigator screenOptions={{ headerTintColor: color.texto, headerBackTitle: 'Atrás', headerStyle: { backgroundColor: color.fondo } }}>
        <Pila.Screen name="Principal" component={Principal} options={{ headerShown: false }} />
        <Pila.Screen name="Ficha" component={FichaScreen} options={{ title: 'Ferretería' }} />
        <Pila.Screen name="Visita" component={VisitaScreen} options={{ title: 'Registrar visita', presentation: 'modal' }} />
        <Pila.Screen name="Nueva" component={NuevaScreen} options={{ title: 'Nueva ferretería', presentation: 'modal' }} />
      </Pila.Navigator>
      <Toast />
    </NavigationContainer>
  );
}

export default function App() {
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
  cargando: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.fondo }
});
