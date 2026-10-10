// Ficha de una ferretería: datos, ubicación, acciones e historial de visitas.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, letra, radio } from '../tema';
import { DESCARTES, LINEAS, RESULTADOS, TIPOS } from '../nucleo/reglas';
import { distanciaA, textoDistancia, urlMaps, urlWhatsapp, telefonoMarcable } from '../nucleo/geo';
import { useApp } from '../estado/AppContext';
import { Boton, ChipEstado, Opcion, abrir } from '../componentes/ui';
import { fechaCorta } from '../componentes/TarjetaFerreteria';

function Dato({ titulo, valor }) {
  return (
    <View style={s.dato}>
      <Text style={s.datoTitulo}>{titulo}</Text>
      <Text style={s.datoValor}>{valor || '—'}</Text>
    </View>
  );
}

export default function FichaScreen({ route, navigation }) {
  const { censo, posicion, guardarUbicacionAqui, descartarFerreteria, reactivarFerreteria, avisar } = useApp();
  const [descartando, setDescartando] = useState(false);
  const f = censo.find(x => x.id === route.params.id);
  if (!f) {
    return <View style={s.pantalla}><Text style={s.vacio}>No encontramos esta ferretería.</Text></View>;
  }
  const tel = telefonoMarcable(f);
  const wa = urlWhatsapp(f.whatsapp) || urlWhatsapp(f.telefono);
  const d = distanciaA(posicion, f);
  const google = f.calificacion != null
    ? String(f.calificacion).replace('.', ',') + ' ★ (' + (f.resenas || 0) + ' reseñas)'
    : '';
  return (
    <ScrollView style={s.pantalla} contentContainerStyle={s.contenido}>
      <View style={{ gap: 6 }}>
        <Text style={s.nombre} testID="ficha-nombre">{f.nombre}</Text>
        <View style={s.chips}>
          <ChipEstado estado={f.estado} />
          {f.tipo === 'materiales' ? <Text style={s.etiqueta}>{TIPOS.materiales}</Text> : null}
          {f.categoria ? <Text style={s.etiqueta}>{'Categoría ' + f.categoria}</Text> : null}
        </View>
      </View>
      {f.descartada ? (
        <View style={s.descartada} testID="ficha-descartada">
          <Text style={s.descartadaTitulo}>{'Descartada: ' + (DESCARTES[f.descartada] || f.descartada)}</Text>
          <Text style={s.descartadaTexto}>
            {[f.descartadaPor ? 'por ' + f.descartadaPor : '', f.descartadaFecha ? 'el ' + fechaCorta(f.descartadaFecha) : ''].filter(Boolean).join(' ') ||
              'No sale en Hoy, en el mapa ni en los pendientes.'}
          </Text>
          <Boton titulo="Volver a activar" onPress={() => { reactivarFerreteria(f.id); avisar('Ferretería activa de nuevo'); }} testID="reactivar" />
        </View>
      ) : null}
      <View>
        <Dato titulo="Dirección" valor={f.direccion} />
        <Dato titulo="Barrio" valor={f.barrio} />
        <Dato titulo="Municipio" valor={f.municipio} />
        <Dato titulo="Zona" valor={f.zona} />
        <Dato titulo="Teléfono" valor={f.telefono} />
        <Dato titulo="Ubicación" valor={f.lat != null ? 'Guardada' + (d != null ? ' · a ' + textoDistancia(d) + ' de ti' : '') : 'Sin ubicar'} />
        <Dato titulo="Encargado" valor={f.encargado} />
        <Dato titulo="WhatsApp" valor={f.whatsapp} />
        {f.correo ? <Dato titulo="Correo" valor={f.correo} /> : null}
        <Dato titulo="Cliente de SOCODA" valor={f.clienteSocoda ? 'Sí' : 'No'} />
        <Dato titulo="Vendedor asignado" valor={f.vendedorAsignado} />
        {f.horario ? <Dato titulo="Horario (Google)" valor={f.horario.split(' | ').join('\n')} /> : null}
        {google ? <Dato titulo="Calificación en Google" valor={google} /> : null}
      </View>
      <View style={s.acciones}>
        <Boton titulo="Maps" estilo={{ flex: 1 }} onPress={() => abrir(urlMaps(f), avisar)} />
        {tel ? <Boton titulo="Llamar" estilo={{ flex: 1 }} onPress={() => abrir('tel:' + tel, avisar)} /> : null}
        {wa ? <Boton titulo="WhatsApp" estilo={{ flex: 1.2 }} onPress={() => abrir(wa, avisar)} /> : null}
      </View>
      <Boton titulo="Registrar visita" tipo="pri" onPress={() => navigation.navigate('Visita', { id: f.id })} testID="ficha-visitar" />
      <View style={s.acciones}>
        <Boton titulo="Editar datos" estilo={{ flex: 1 }} onPress={() => navigation.navigate('Nueva', { id: f.id })} testID="ficha-editar" />
        {/^https?:\/\//i.test(f.web || '') ? <Boton titulo="Página web" estilo={{ flex: 1 }} onPress={() => abrir(f.web, avisar)} /> : null}
      </View>
      <Boton
        titulo={f.lat != null ? 'Actualizar ubicación aquí' : 'Guardar ubicación aquí'}
        onPress={() => guardarUbicacionAqui(f.id)}
        testID="guardar-ubicacion"
      />

      {!f.descartada ? (
        descartando ? (
          <View style={s.descartar}>
            <Text style={s.descartarTitulo}>¿Por qué la descartas?</Text>
            <Text style={s.meta}>Sale de Hoy, del mapa y de los pendientes. No se borra: se puede volver a activar.</Text>
            {Object.entries(DESCARTES).map(([k, t]) => (
              <Opcion key={k} titulo={t} testID={'descartar-' + k} onPress={() => {
                try {
                  descartarFerreteria(f.id, k);
                  setDescartando(false);
                  avisar('Ferretería descartada: ' + t);
                } catch (e) {
                  avisar(e.message);
                }
              }} />
            ))}
            <Boton titulo="Cancelar" onPress={() => setDescartando(false)} />
          </View>
        ) : (
          <Boton titulo="¿No existe o cerró?" onPress={() => setDescartando(true)} testID="ficha-descartar" />
        )
      ) : null}

      <Text style={s.subtitulo}>Historial de visitas</Text>
      {f.visitas.length ? f.visitas.map(v => (
        <View key={v.id} style={s.visita}>
          <View style={s.visitaCab}>
            <Text style={s.visitaFecha}>{fechaCorta(v.fecha)}</Text>
            <Text style={s.visitaResultado}>{RESULTADOS[v.resultado] || v.resultado}</Text>
          </View>
          <Text style={s.meta}>{'Vendedor: ' + (v.vendedor || '—')}</Text>
          {v.lineas && v.lineas.length ? <Text style={s.texto}>{'Líneas: ' + v.lineas.map(l => LINEAS[l] || l).join(', ')}</Text> : null}
          {v.competencia ? <Text style={s.texto}>{'Competencia: ' + v.competencia}</Text> : null}
          {v.notas ? <Text style={s.texto}>{v.notas}</Text> : null}
        </View>
      )) : <Text style={s.vacio}>Sin visitas registradas.</Text>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 14, paddingBottom: 40 },
  nombre: { fontSize: letra.titulo, fontWeight: '800', color: color.texto },
  dato: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.linea },
  datoTitulo: { fontSize: letra.mini, color: color.suave },
  datoValor: { fontSize: letra.normal, fontWeight: '600', color: color.texto },
  acciones: { flexDirection: 'row', gap: 8 },
  descartada: { gap: 8, padding: 14, borderRadius: radio.normal, backgroundColor: color.grafito },
  descartadaTitulo: { fontSize: letra.normal, fontWeight: '800', color: color.grafitoTexto },
  descartadaTexto: { fontSize: letra.chica, color: color.grafitoTexto },
  descartar: { gap: 8, padding: 14, borderRadius: radio.normal, borderWidth: 2, borderColor: color.linea },
  descartarTitulo: { fontSize: letra.normal, fontWeight: '800', color: color.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  etiqueta: { fontSize: letra.mini, fontWeight: '700', color: color.grafito, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radio.pastilla, backgroundColor: color.infoFondo, overflow: 'hidden' },
  subtitulo: { fontSize: letra.subtitulo, fontWeight: '800', color: color.texto, marginTop: 8 },
  visita: { gap: 4, padding: 12, borderWidth: 2, borderColor: color.linea, borderRadius: radio.normal },
  visitaCab: { flexDirection: 'row', justifyContent: 'space-between' },
  visitaFecha: { fontWeight: '800', fontSize: letra.normal, color: color.texto },
  visitaResultado: { fontWeight: '700', fontSize: letra.chica, color: color.grafito },
  meta: { fontSize: letra.chica, color: color.suave },
  texto: { fontSize: letra.chica, color: color.texto },
  vacio: { color: color.suave, fontSize: letra.normal, padding: 16 }
});
