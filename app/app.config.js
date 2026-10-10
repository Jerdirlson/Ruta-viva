// Configuración de Expo para la app nativa de Ruta-viva (SOCODA).
//
// Variables de entorno (en el build de EAS o al correr `npx expo start`):
//   EXPO_PUBLIC_API_URL            URL del API (ej. https://tu-dominio.ngrok-free.app). Sin ella,
//                                  la app funciona en modo local con datos de ejemplo.
//   GOOGLE_MAPS_ANDROID_API_KEY    Necesaria SOLO para el APK/AAB de Android: sin ella el mapa
//                                  sale en blanco. En Expo Go no hace falta.
module.exports = {
  expo: {
    name: 'Ruta-viva',
    slug: 'ruta-viva',
    owner: 'jerdirlson',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    ios: {
      bundleIdentifier: 'co.rutaviva.socoda',
      supportsTablet: false,
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'Ruta-viva usa tu ubicación para ordenar las ferreterías por cercanía y guardar dónde queda cada una. No se guarda dónde estás tú.'
      }
    },
    android: {
      package: 'co.rutaviva.socoda',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#e90128'
      },
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']
    },
    web: {
      favicon: './assets/favicon.png'
    },
    extra: {
      eas: { projectId: '7cd40a9d-a2fe-457a-bd19-4a1883a7df9b' }
    },
    plugins: [
      ['expo-location', {
        locationWhenInUsePermission:
          'Ruta-viva usa tu ubicación para ordenar las ferreterías por cercanía y guardar dónde queda cada una. No se guarda dónde estás tú.'
      }],
      ['react-native-maps', {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY
      }]
    ]
  }
};
