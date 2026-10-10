// Estado de la app: datos guardados en el celular (AsyncStorage), sincronización con
// el servidor, posición del vendedor (solo en memoria) y avisos.
//
// Local-first: todo cambio se guarda primero en el teléfono. Con servidor
// (EXPO_PUBLIC_API_URL), entra además a la cola de pendientes y se envía cuando hay señal.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as R from '../nucleo/reglas';
import { importarCSV as importarCSVPuro, exportarCSV as exportarCSVPuro } from '../nucleo/csv';
import { armarLote, aplicarRespuesta, contarPendientes } from '../nucleo/sync';
import { obtenerPosicion } from '../datos/ubicacion';
import ejemplo from '../datos/ejemplo.json';

const CLAVE_ALMACEN = 'rutaviva.v1';
export const API_URL = String(process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');
const CON_SERVIDOR = API_URL.length > 0;
const PRECISION_MAX_M = 100;   // al guardar la ubicación de una ferretería
const CADA_MS = 120000;        // sincronización periódica con la app abierta

const Contexto = createContext(null);
export const useApp = () => useContext(Contexto);

const clonar = d => JSON.parse(JSON.stringify(d));

export function AppProvider({ children }) {
  const [datos, setDatos] = useState(null);
  const datosRef = useRef(null);
  const [posicion, setPosicion] = useState(null);
  const [sync, setSync] = useState({ estado: CON_SERVIDOR ? 'pendiente' : 'local', sincronizando: false });
  const [aviso, setAviso] = useState(null);
  const enCurso = useRef(null);
  const temporizador = useRef(null);

  const avisar = useCallback(texto => setAviso({ texto, id: Date.now() }), []);

  // Cambia los datos con una función del núcleo y los guarda en el celular.
  const actualizar = useCallback(fn => {
    const copia = clonar(datosRef.current);
    const resultado = fn(copia);
    datosRef.current = copia;
    setDatos(copia);
    AsyncStorage.setItem(CLAVE_ALMACEN, JSON.stringify(copia))
      .catch(() => avisar('No se pudo guardar en el celular: revisa el espacio libre.'));
    return resultado;
  }, [avisar]);

  // ---------- sincronización ----------
  const hacerSync = useCallback(async () => {
    const d = datosRef.current;
    if (!CON_SERVIDOR || !d) return { estado: 'local' };
    if (!d.claveEquipo) return { estado: 'sin-clave' };
    const lote = armarLote(d);
    let res;
    try {
      res = await fetch(API_URL + '/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Clave-Equipo': d.claveEquipo,
          'ngrok-skip-browser-warning': '1'
        },
        body: JSON.stringify(lote)
      });
    } catch (e) {
      return { estado: 'sin-conexion' };
    }
    if (res.status === 401) return { estado: 'clave-incorrecta' };
    if (!res.ok) return { estado: 'error' };
    const resp = await res.json();
    return actualizar(copia => aplicarRespuesta(copia, lote, resp));
  }, [actualizar]);

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
      'sin-clave': 'Escribe la clave del equipo en Datos',
      'clave-incorrecta': 'Clave del equipo incorrecta',
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
    importarCSV: texto => conCambio(d => importarCSVPuro(d, texto, CON_SERVIDOR)),
    restaurarRespaldo: texto => {
      const nuevo = R.restaurarRespaldo(datosRef.current, texto, CON_SERVIDOR);
      conCambio(d => { Object.keys(d).forEach(k => delete d[k]); Object.assign(d, nuevo); });
    },
    exportarCSV: () => exportarCSVPuro(datosRef.current),
    respaldo: () => R.respaldoDe(datosRef.current),
    fijarVendedor: nombre => actualizar(d => { d.vendedorActual = R.recortar('vendedor', nombre); }),
    fijarClave: clave => {
      actualizar(d => { d.claveEquipo = R.limpiar(clave); });
      return sincronizar(true);
    },
    sincronizar: () => sincronizar(true),

    ubicarme: async () => {
      avisar('Buscando tu ubicación…');
      try {
        setPosicion(await obtenerPosicion());
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
        conCambio(d => R.guardarUbicacion(d, id, p.lat, p.lng, CON_SERVIDOR));
        setPosicion(p);
        avisar('Ubicación guardada (±' + Math.round(p.precision) + ' m)');
      } catch (e) {
        avisar(e.message);
      }
    },
    avisar
  }), [conCambio, actualizar, sincronizar, avisar]);

  const censo = useMemo(() => (datos ? R.censoDe(datos) : []), [datos]);
  const pendientesSync = datos ? contarPendientes(datos) : 0;

  const valor = {
    cargado: !!datos,
    datos,
    censo,
    modo: CON_SERVIDOR ? 'servidor' : 'local',
    sync: { ...sync, pendientes: pendientesSync, ultima: datos ? datos.ultimaSync : '', tieneClave: !!(datos && datos.claveEquipo) },
    posicion,
    aviso,
    ...acciones
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
