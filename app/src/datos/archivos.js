// Archivos en el celular: elegir un CSV o respaldo, y compartir lo exportado
// (WhatsApp, correo, Drive…) con la hoja nativa de compartir.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function elegirArchivoTexto(tipos) {
  const r = await DocumentPicker.getDocumentAsync({ type: tipos, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets || !r.assets.length) return null;
  return new File(r.assets[0].uri).text();
}

// Archivo binario (el Excel del censo): se guarda en caché y se comparte.
export async function compartirBytes(nombre, bytes, mime) {
  const archivo = new File(Paths.cache, nombre);
  archivo.create({ overwrite: true });
  archivo.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este celular no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, { mimeType: mime, dialogTitle: nombre });
}

export async function compartirTexto(nombre, texto, mime) {
  const archivo = new File(Paths.cache, nombre);
  archivo.create({ overwrite: true });
  archivo.write(texto);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este celular no permite compartir archivos.');
  await Sharing.shareAsync(archivo.uri, { mimeType: mime, dialogTitle: nombre });
}
