// Versión web (solo para probar la app en el navegador): descarga en vez de compartir.
import * as DocumentPicker from 'expo-document-picker';

export async function elegirArchivoTexto(tipos) {
  const r = await DocumentPicker.getDocumentAsync({ type: tipos, multiple: false });
  if (r.canceled || !r.assets || !r.assets.length) return null;
  const a = r.assets[0];
  if (a.file) return a.file.text();
  return (await fetch(a.uri)).text();
}

export async function compartirBytes(nombre, bytes, mime) {
  return compartirTexto(nombre, bytes, mime);
}

export async function compartirTexto(nombre, texto, mime) {
  const url = URL.createObjectURL(new Blob([texto], { type: mime }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
