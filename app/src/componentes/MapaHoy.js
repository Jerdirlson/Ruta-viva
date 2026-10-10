// Mapa de Hoy: Leaflet + Leaflet.markercluster dentro de un WebView (ver mapaHtml.js).
//
// Antes era react-native-maps, pero en Android sus marcadores con vista propia no se
// borraban, no se movían ni se actualizaban de forma confiable (círculos viejos pegados al
// filtrar o al acercarse, pines rojos por defecto, números que no correspondían). Aquí los
// marcadores los dibuja Leaflet dentro de la página: quitar, agrupar y filtrar es exacto.
// Los locales en el mismo edificio se abren en abanico al tocarlos (spiderfy).
//
// La app le manda al mapa los puntos (ya filtrados), la ferretería elegida, la posición del
// vendedor y a dónde mirar; el mapa le avisa qué ferretería se tocó.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colorPin } from '../nucleo/reglas';
import { ordenarPorCercania } from '../nucleo/geo';
import { posicionSinPedir } from '../datos/ubicacion';
import { htmlMapa } from './mapaHtml';

const CERCANAS_EN_VISTA = 8;   // con "Cerca de mí": el vendedor y las 8 más cercanas
// Origen de la página: las teselas de OpenStreetMap piden saber desde dónde se usan.
const ORIGEN = 'https://136-108-178-241.sslip.io/';

export default function MapaHoy({ lista, posicion, elegidaId, enfoque, onSeleccionar }) {
  const web = useRef(null);
  const [listo, setListo] = useState(false);
  const html = useMemo(() => htmlMapa(), []);
  const ubicadas = useMemo(() => lista.filter(f => f.lat != null), [lista]);
  const porId = useMemo(() => new Map(ubicadas.map(f => [f.id, f])), [ubicadas]);

  const enviar = useCallback(m => {
    if (web.current) web.current.injectJavaScript('window.recibir && window.recibir(' + JSON.stringify(m) + '); true;');
  }, []);

  // Puntos: cada vez que cambia la lista (filtro, zona, sincronización).
  const firma = ubicadas.map(f => f.id + colorPin(f)).join('|');
  useEffect(() => {
    if (!listo) return;
    enviar({
      tipo: 'datos',
      elegidaId: elegidaId || null,
      puntos: ubicadas.map(f => ({ id: f.id, lat: f.lat, lng: f.lng, color: colorPin(f), nombre: f.nombre }))
    });
  }, [listo, firma]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (listo) enviar({ tipo: 'elegida', id: elegidaId || null }); }, [listo, elegidaId, enviar]);

  // Encuadre: todas, o con "Cerca de mí" el vendedor y las más cercanas. No pisa un
  // "Ver en el mapa" reciente.
  const ultimoEnfoque = useRef(0);
  useEffect(() => {
    if (!listo || Date.now() - ultimoEnfoque.current < 2500) return;
    const base = posicion ? ordenarPorCercania(ubicadas, posicion).slice(0, CERCANAS_EN_VISTA) : ubicadas;
    const puntos = base.map(f => [f.lat, f.lng]);
    if (posicion) puntos.push([posicion.lat, posicion.lng]);
    enviar({ tipo: 'encuadrar', puntos });
  }, [listo, ubicadas.length, posicion]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Ver en el mapa": centrar en la ferretería.
  useEffect(() => {
    if (!listo || !enfoque) return;
    ultimoEnfoque.current = Date.now();
    enviar({ tipo: 'enfocar', lat: enfoque.lat, lng: enfoque.lng });
  }, [listo, enfoque && enfoque.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Punto azul: la posición de "Cerca de mí" o, si no, la última conocida del celular
  // (sin pedir GPS). Solo vive en memoria: no se guarda ni se envía.
  const [conocida, setConocida] = useState(null);
  useEffect(() => { posicionSinPedir().then(setConocida); }, []);
  const yo = posicion || conocida;
  useEffect(() => {
    if (listo) enviar({ tipo: 'posicion', lat: yo ? yo.lat : null, lng: yo ? yo.lng : null });
  }, [listo, yo && yo.lat, yo && yo.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const alMensaje = useCallback(e => {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
    if (m.tipo === 'listo') setListo(true);
    else if (m.tipo === 'elegir') { const f = porId.get(m.id); if (f) onSeleccionar(f); }
    else if (m.tipo === 'vacio') onSeleccionar(null);
  }, [porId, onSeleccionar]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={web}
        source={{ html, baseUrl: ORIGEN }}
        originWhitelist={['*']}
        onMessage={alMensaje}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        // Si la página se recarga (por memoria), vuelve a recibir todo cuando avise "listo".
        onLoadStart={() => setListo(false)}
        style={StyleSheet.absoluteFill}
        testID="mapa-hoy"
      />
    </View>
  );
}
