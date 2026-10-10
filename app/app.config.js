// Configuración de Expo para la app nativa de Ruta-viva (SOCODA).
//
// Variables de entorno (en el build de EAS o al correr `npx expo start`):
//   EXPO_PUBLIC_API_URL            URL del API (ej. https://tu-dominio.ngrok-free.app). Sin ella,
//                                  la app funciona en modo local con datos de ejemplo.
//   GOOGLE_MAPS_ANDROID_API_KEY    Necesaria SOLO para el APK/AAB de Android: sin ella el mapa
//                                  sale en blanco. En Expo Go no hace falta.
//
// En los builds de EAS ambas vienen del ambiente "production" de EAS (eas env:list),
// así el APK y cada actualización (eas update) apuntan al mismo servidor.
//
// Actualizaciones OTA (expo-updates): los cambios de JavaScript se publican con
//   eas update --channel production --environment production -m "qué cambió"
// y el celular los baja al abrir la app. runtimeVersion = huella del código nativo:
// si cambia algo nativo (un módulo nuevo, permisos, SDK), hace falta un APK nuevo y
// las actualizaciones viejas/nuevas no se mezclan con el APK equivocado.
const PROJECT_ID = '7cd40a9d-a2fe-457a-bd19-4a1883a7df9b';
module.exports = {
  expo: {
    name: 'Ruta-viva',
    slug: 'ruta-viva',
    owner: 'jerdirlson',
    version: '1.0.0',
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      url: 'https://u.expo.dev/' + PROJECT_ID,
      // Al abrir, revisa si hay actualización; se aplica la siguiente vez que se abre.
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0
    },
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
      eas: { projectId: PROJECT_ID }
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
