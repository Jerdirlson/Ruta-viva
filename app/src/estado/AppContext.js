// Estado de la app: datos guardados en el celular (AsyncStorage), sincronización con
// el servidor, posición del vendedor (solo en memoria) y avisos.
//
// Local-first: todo cambio se guarda primero en el teléfono. Con servidor
// (EXPO_PUBLIC_API_URL), entra además a la cola de pendientes y se envía cuando hay señal.
//
// Con servidor, cada vendedor entra con su usuario y contraseña (src/datos/sesion.js
// guarda el token cifrado). El nombre del vendedor sale de su cuenta y el servidor
// firma las visitas con él. Sin servidor (modo local), el nombre se escribe a mano.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as R from '../nucleo/reglas';
import { importarCSV as importarCSVPuro, exportarCSV as exportarCSVPuro } from '../nucleo/csv';
import { armarLote, aplicarRespuesta, contarPendientes } from '../nucleo/sync';
import { obtenerPosicion } from '../datos/ubicacion';
import { leerSesion, guardarSesion, borrarSesion } from '../datos/sesion';
import { distanciaM, textoDistancia, CONFIRMAR_MOVER_M } from '../nucleo/geo';
import ejemplo from '../datos/ejemplo.json';

const CLAVE_ALMACEN = 'rutaviva.v1';
export const API_URL = String(process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
const CON_SERVIDOR = API_URL.length > 0;
const PRECISION_MAX_M = 100;   // al guardar la ubicación de una ferretería
const CADA_MS = 120000;        // sincronización periódica con la app abierta

const Contexto = createContext(null);

function confirmar(titulo, mensaje, si) {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(titulo + '\n\n' + mensaje));
  return new Promise(resolver => Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
    { text: si, onPress: () => resolver(true) }
  ], { cancelable: true, onDismiss: () => resolver(false) }));
}
export const useApp = () => useContext(Contexto);

const clonar = d => JSON.parse(JSON.stringify(d));

export function AppProvider({ children }) {
  const [datos, setDatos] = useState(null);
  const datosRef = useRef(null);
  const [posicion, setPosicion] = useState(null);
  const [sync, setSync] = useState({ estado: CON_SERVIDOR ? 'pendiente' : 'local', sincronizando: false });
  const [aviso, setAviso] = useState(null);
  // null = sin sesión. { token, usuario: { id, usuario, nombre, rol, debeCambiarClave } }
  const [sesion, setSesion] = useState(null);
  const sesionRef = useRef(null);
  const enCurso = useRef(null);
  const temporizador = useRef(null);

  const avisar = useCallback(texto => setAviso({ texto, id: Date.now() }), []);

  // Cambia los datos con una función del núcleo y los guarda en el celular.
  // El guardado en el celular se agrupa: varios cambios seguidos se escriben una sola vez
  // (con el censo completo son cientos de KB y escribirlos en cada toque traba la app).
  const temporizadorGuardar = useRef(null);
  const guardarPronto = useCallback(() => {
    clearTimeout(temporizadorGuardar.current);
    temporizadorGuardar.current = setTimeout(() => {
      AsyncStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datosRef.current))
        .catch(() => avisar('No se pudo guardar en el celular: revisa el espacio libre.'));
    }, 500);
  }, [avisar]);

  // Si la app pasa a segundo plano, lo pendiente de guardar se escribe ya.
  useEffect(() => {
    const sub = AppState.addEventListener('change', e => {
      if (e !== 'active' && temporizadorGuardar.current && datosRef.current) {
        clearTimeout(temporizadorGuardar.current);
        temporizadorGuardar.current = null;
        AsyncStorage.setItem(CLAVE_ALMACEN, JSON.stringify(datosRef.current)).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const actualizar = useCallback(fn => {
    const copia = clonar(datosRef.current);
    const resultado = fn(copia);
    datosRef.current = copia;
    setDatos(copia);
    guardarPronto();
    return resultado;
  }, [guardarPronto]);

  // ---------- servidor y sesión ----------
  // conSesion = false para /api/ingresar.
  const pedir = (ruta, cuerpo, conSesion = true, metodo = 'POST') => fetch(API_URL + ruta, {
    method: metodo,
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      conSesion && sesionRef.current ? { Authorization: 'Bearer ' + sesionRef.current.token } : {}
    ),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  // Llamada que devuelve el JSON o lanza el mensaje del servidor.
  async function llamar(ruta, cuerpo, metodo = 'POST') {
    let res;
    try {
      res = await pedir(ruta, cuerpo, true, metodo);
    } catch (e) {
      throw new Error('Sin conexión con el servidor. Revisa la señal e intenta de nuevo.');
    }
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { await olvidarSesion(); throw new Error(j.error || 'Tu sesión venció: vuelve a entrar'); }
    if (!res.ok) throw new Error(j.error || 'El servidor no pudo completar la operación');
    return j;
  }
  async function fijarSesion(s) {
    await guardarSesion(s);
    sesionRef.current = s;
    setSesion(s);
    actualizar(d => { d.vendedorActual = s.usuario.nombre; });
  }
  async function olvidarSesion() {
    await borrarSesion();
    sesionRef.current = null;
    setSesion(null);
  }

  // ---------- sincronización ----------
  const hacerSync = useCallback(async () => {
    const d = datosRef.current;
    if (!CON_SERVIDOR || !d) return { estado: 'local' };
    if (!sesionRef.current) return { estado: 'sin-sesion' };
    const lote = armarLote(d);
    let res;
    try {
      res = await pedir('/api/sync', lote);
    } catch (e) {
      return { estado: 'sin-conexion' };
    }
    // Sesión vencida o usuario desactivado: los datos y lo pendiente se quedan en el
    // celular; al volver a entrar se envían.
    if (res.status === 401) { await olvidarSesion(); return { estado: 'sin-sesion' }; }
    if (res.status === 403) return { estado: 'cambiar-clave' };
    if (!res.ok) return { estado: 'error' };
    const resp = await res.json();
    // Sin cambios del servidor ni nada enviado: solo se anotan la hora y el "desde".
    // Así una sincronización sin novedades no vuelve a procesar ni dibujar el censo.
    const sinNovedad = resp.completo === false && !(resp.ferreterias || []).length && !(resp.visitas || []).length &&
      !lote.ferreterias.length && !lote.visitas.length;
    if (sinNovedad) {
      Object.assign(datosRef.current, { ultimaSync: new Date().toISOString(), syncDesde: resp.hasta || '' });
      guardarPronto();
      return { estado: 'ok', rechazadas: [], cambios: 0 };
    }
    return actualizar(copia => aplicarRespuesta(copia, lote, resp));
  }, [actualizar, guardarPronto]); // eslint-disable-line react-hooks/exhaustive-deps

  const sincronizar = useCallback(async manual => {
    if (!CON_SERVIDOR) {
      if (manual) avisar('Modo local: esta app no está conectada a un servidor.');
      return;
    }
    if (!enCurso.current) {
      setSync(s => ({ ...s, sincronizando: true }));
      enCurso.current = hacerSync()
        .catch(() => ({ estado: 'error' }))
        .finally(() => { enCurso.current = null; });
    }
    const r = await enCurso.current;
    setSync({ estado: r.estado, sincronizando: false });
    const rech = r.rechazadas || [];
    if (rech.length) avisar(rech.length + ' registro(s) rechazado(s) por el servidor: ' + rech[0].motivo);
    else if (manual) avisar({
      ok: 'Sincronizado',
      'sin-sesion': 'Tu sesión venció: vuelve a entrar',
      'cambiar-clave': 'Cambia tu contraseña para seguir',
      'sin-conexion': 'Sin conexión: los cambios quedan guardados en el celular',
      error: 'El servidor tuvo un problema; se reintenta después'
    }[r.estado] || 'Listo');
  }, [hacerSync, avisar]);

  // Después de cada cambio: espera un instante por si vienen más y envía todo junto.
  const programarSync = useCallback(() => {
    if (!CON_SERVIDOR) return;
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => sincronizar(false), 800);
  }, [sincronizar]);

  // ---------- arranque ----------
  useEffect(() => {
    (async () => {
      let d = R.vacio();
      try {
        const crudo = await AsyncStorage.getItem(CLAVE_ALMACEN);
        if (crudo) d = Object.assign(R.vacio(), JSON.parse(crudo));
      } catch (e) {
        avisar('No se pudieron leer los datos guardados.');
      }
      // Los datos de ejemplo son ficticios: solo en modo local, nunca hacia el servidor.
      if (!CON_SERVIDOR && !d.semilla && !d.ferreterias.length) {
        d.ferreterias = ejemplo.map(f => R.construirFerreteria(f, f.id));
        d.semilla = true;
        AsyncStorage.setItem(CLAVE_ALMACEN, JSON.stringify(d)).catch(() => {});
      }
      if (CON_SERVIDOR) {
        const s = await leerSesion();
        sesionRef.current = s;
        setSesion(s);
        if (s) d.vendedorActual = s.usuario.nombre;
      }
      datosRef.current = d;
      setDatos(d);
      if (CON_SERVIDOR) sincronizar(false);
    })();
  }, [avisar, sincronizar]);

  // Reintenta al volver a la app y cada 2 minutos mientras está abierta.
  useEffect(() => {
    if (!CON_SERVIDOR) return undefined;
    const sub = AppState.addEventListener('change', e => { if (e === 'active') sincronizar(false); });
    const intervalo = setInterval(() => { if (AppState.currentState === 'active') sincronizar(false); }, CADA_MS);
    return () => { sub.remove(); clearInterval(intervalo); };
  }, [sincronizar]);

  // ---------- acciones ----------
  const conCambio = useCallback(fn => {
    const r = actualizar(fn);
    programarSync();
    return r;
  }, [actualizar, programarSync]);

  const acciones = useMemo(() => ({
    registrarVisita: v => conCambio(d => R.registrarVisita(d, { ...v, vendedor: d.vendedorActual }, CON_SERVIDOR)),
    guardarFerreteria: f => conCambio(d => R.guardarFerreteria(d, f, CON_SERVIDOR)),
    descartarFerreteria: (id, motivo) => conCambio(d => R.descartarFerreteria(d, id, motivo, d.vendedorActual, CON_SERVIDOR)),
    reactivarFerreteria: id => conCambio(d => R.reactivarFerreteria(d, id, CON_SERVIDOR)),
    importarCSV: texto => conCambio(d => importarCSVPuro(d, texto, CON_SERVIDOR)),
    restaurarRespaldo: texto => {
      const nuevo = R.restaurarRespaldo(datosRef.current, texto, CON_SERVIDOR);
      conCambio(d => { Object.keys(d).forEach(k => delete d[k]); Object.assign(d, nuevo); });
    },
    exportarCSV: () => exportarCSVPuro(datosRef.current),
    respaldo: () => R.respaldoDe(datosRef.current),
    fijarVendedor: nombre => actualizar(d => { d.vendedorActual = R.recortar('vendedor', nombre); }),

    // ---------- sesión y usuarios ----------
    ingresar: async (usuario, clave) => {
      let res;
      try {
        res = await pedir('/api/ingresar', { usuario, clave }, false);
      } catch (e) {
        throw new Error('Sin conexión con el servidor. Revisa la señal e intenta de nuevo.');
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'No se pudo entrar');
      await fijarSesion({ token: j.token, usuario: j.usuario });
      if (!j.usuario.debeCambiarClave) sincronizar(false);
      return j.usuario;
    },
    cambiarClave: async (actual, nueva) => {
      const j = await llamar('/api/clave', { actual, nueva });
      await fijarSesion({ token: sesionRef.current.token, usuario: j.usuario });
      sincronizar(false);
    },
    salir: async () => {
      if (sesionRef.current) await pedir('/api/salir', {}).catch(() => {});
      await olvidarSesion();
    },
    listarUsuarios: async () => (await llamar('/api/usuarios', undefined, 'GET')).usuarios,
    crearUsuario: async u => (await llamar('/api/usuarios', u)).usuario,
    actualizarUsuario: async (id, cambios) => (await llamar('/api/usuarios/' + encodeURIComponent(id), cambios, 'PATCH')).usuario,
    sincronizar: () => sincronizar(true),

    ubicarme: async () => {
      avisar('Buscando tu ubicación…');
      try {
        const p = await obtenerPosicion();
        setPosicion(p);
        avisar('Ordenado por cercanía');
      } catch (e) {
        avisar(e.message);
      }
    },
    guardarUbicacionAqui: async id => {
      avisar('Tomando la ubicación con el GPS…');
      try {
        const p = await obtenerPosicion();
        if (p.precision > PRECISION_MAX_M) {
          avisar('Precisión de ±' + Math.round(p.precision) + ' m, muy baja. Párate en la entrada, a cielo abierto, e intenta de nuevo.');
          return;
        }
        const f = datosRef.current.ferreterias.find(x => x.id === id);
        const lejos = f && f.lat != null ? distanciaM(p, f) : 0;
        if (lejos > CONFIRMAR_MOVER_M && !(await confirmar(
          '¿Estás en ' + f.nombre + '?',
          'Tu GPS está a ' + textoDistancia(lejos) + ' de donde estaba guardada. Cámbiala solo si estás parado en la entrada de la ferretería.',
          'Sí, estoy aquí'
        ))) {
          avisar('No se cambió la ubicación');
          return;
        }
        conCambio(d => R.guardarUbicacion(d, id, p.lat, p.lng, CON_SERVIDOR));
        setPosicion(p);
        avisar('Ubicación guardada (±' + Math.round(p.precision) + ' m)');
      } catch (e) {
        avisar(e.message);
      }
    },
    avisar
  }), [conCambio, actualizar, sincronizar, avisar]); // eslint-disable-line react-hooks/exhaustive-deps

  const censo = useMemo(() => (datos ? R.censoDe(datos) : []), [datos]);
  const pendientesSync = datos ? contarPendientes(datos) : 0;

  const valor = {
    cargado: !!datos,
    datos,
    censo,
    modo: CON_SERVIDOR ? 'servidor' : 'local',
    sync: { ...sync, pendientes: pendientesSync, ultima: datos ? datos.ultimaSync : '', conSesion: !!sesion },
    sesion,
    posicion,
    aviso,
    ...acciones
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
